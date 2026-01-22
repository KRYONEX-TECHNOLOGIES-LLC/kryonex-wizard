require("dotenv").config();

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const axios = require("axios");
const Stripe = require("stripe");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const {
  PORT = 3000,
  RETELL_API_KEY,
  RETELL_LLM_ID_HVAC,
  RETELL_LLM_ID_PLUMBING,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICE_ID_CORE,
  STRIPE_PRICE_ID_ELITE,
  STRIPE_PRICE_ID_PRO,
  STRIPE_PRICE_ID_HVAC,
  STRIPE_PRICE_ID_PLUMBING,
  STRIPE_TOPUP_CALL_300,
  STRIPE_TOPUP_CALL_800,
  STRIPE_TOPUP_SMS_500,
  STRIPE_TOPUP_SMS_1000,
  STRIPE_WHITE_GLOVE,
  FRONTEND_URL,
  RETELL_WEBHOOK_SECRET,
  ADMIN_IP_ALLOWLIST,
  ADMIN_ACCESS_CODE,
  ADMIN_EMAIL,
  CONSENT_VERSION,
} = process.env;

if (!RETELL_API_KEY) throw new Error("Missing RETELL_API_KEY");
if (!RETELL_LLM_ID_HVAC) throw new Error("Missing RETELL_LLM_ID_HVAC");
if (!RETELL_LLM_ID_PLUMBING) throw new Error("Missing RETELL_LLM_ID_PLUMBING");
if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
if (!SUPABASE_SERVICE_ROLE_KEY)
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
if (!STRIPE_SECRET_KEY) throw new Error("Missing STRIPE_SECRET_KEY");
if (!STRIPE_WEBHOOK_SECRET) throw new Error("Missing STRIPE_WEBHOOK_SECRET");
if (!STRIPE_PRICE_ID_PRO && !STRIPE_PRICE_ID_HVAC)
  throw new Error(
    "Missing STRIPE_PRICE_ID_PRO (or STRIPE_PRICE_ID_HVAC)"
  );
if (!STRIPE_PRICE_ID_ELITE && !STRIPE_PRICE_ID_PLUMBING)
  throw new Error(
    "Missing STRIPE_PRICE_ID_ELITE (or STRIPE_PRICE_ID_PLUMBING)"
  );
if (!FRONTEND_URL) throw new Error("Missing FRONTEND_URL");

const app = express();
const stripe = Stripe(STRIPE_SECRET_KEY);

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

app.use(
  cors({
    origin: [FRONTEND_URL],
    credentials: true,
  })
);
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  req.requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  res.setHeader("X-Request-Id", req.requestId);
  next();
});
app.use(morgan("combined"));
app.use(express.urlencoded({ extended: true }));

const allowlist = ADMIN_IP_ALLOWLIST
  ? ADMIN_IP_ALLOWLIST.split(",").map((ip) => ip.trim()).filter(Boolean)
  : [];

const generateToken = (size = 16) => crypto.randomBytes(size).toString("hex");

const enforceIpAllowlist = (req, res, next) => {
  if (!allowlist.length) return next();
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress;
  if (!ip || !allowlist.includes(ip)) {
    return res.status(403).json({ error: "IP not allowed" });
  }
  return next();
};

const auditLog = async ({
  userId,
  actorId,
  action,
  actionType,
  entity,
  entityId,
  req,
  metadata,
}) => {
  try {
    await supabaseAdmin.from("audit_logs").insert({
      user_id: userId || null,
      actor_id: actorId || userId || null,
      action,
      action_type: actionType || action,
      entity: entity || null,
      entity_id: entityId || null,
      ip:
        req?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
        req?.socket?.remoteAddress ||
        null,
      user_agent: req?.headers?.["user-agent"] || null,
      metadata: metadata || null,
    });
  } catch (err) {
    console.error("auditLog error:", err.message);
  }
};

const sendSmsInternal = async ({ userId, to, body, leadId, source }) => {
  if (!body || !to) {
    throw new Error("body and to are required");
  }

  const { data: optOut } = await supabaseAdmin
    .from("sms_opt_outs")
    .select("id")
    .eq("user_id", userId)
    .eq("phone", to)
    .maybeSingle();
  if (optOut) {
    throw new Error("Recipient opted out");
  }

  const { data: subscription } = await supabaseAdmin
    .from("subscriptions")
    .select("plan_type, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();
  let usage = await ensureUsageLimits({
    userId,
    planType: subscription?.plan_type,
    periodEnd: subscription?.current_period_end,
  });
  usage = await refreshUsagePeriod(
    usage,
    subscription?.plan_type,
    subscription?.current_period_end
  );

  if (usage.force_pause && !usage.force_resume) {
    throw new Error("Usage paused by admin");
  }
  if (usage.limit_state === "paused") {
    throw new Error("Usage limit reached");
  }
  if (usage.sms_used >= usage.sms_cap + usage.sms_credit) {
    await supabaseAdmin
      .from("usage_limits")
      .update({ limit_state: "paused", updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    throw new Error("Usage limit reached");
  }

  const retellResponse = await retellClient.post("/sms", {
    to,
    body,
  });

  await supabaseAdmin.from("messages").insert({
    user_id: userId,
    lead_id: leadId || null,
    direction: "outbound",
    body,
  });

  const nextSmsUsed = (usage.sms_used || 0) + 1;
  await supabaseAdmin.from("usage_sms").insert({
    user_id: userId,
    message_id: retellResponse.data?.id || null,
    segments: 1,
    cost_cents: 0,
  });
  await supabaseAdmin
    .from("usage_limits")
    .update({
      sms_used: nextSmsUsed,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  await auditLog({
    userId,
    action: "sms_sent",
    entity: "message",
    entityId: leadId || null,
    metadata: { to, source: source || "manual" },
  });

  return retellResponse.data;
};

// Stripe webhook needs raw body
let lastStripeWebhookAt = null;
let lastRetellWebhookAt = null;

app.post(
  "/stripe-webhook",
  enforceIpAllowlist,
  express.raw({ type: "application/json" }),
  async (req, res) => {
    let event;
    try {
      const signature = req.headers["stripe-signature"];
      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    res.status(200).json({ received: true });
    lastStripeWebhookAt = new Date().toISOString();

    setImmediate(async () => {
      try {
        if (event.type === "checkout.session.completed") {
          const session = event.data.object;
          if (session.metadata?.type === "topup") {
            const userId =
              session.metadata?.user_id || session.client_reference_id;
            const callSeconds = parseInt(
              session.metadata?.call_seconds || "0",
              10
            );
            const smsCount = parseInt(session.metadata?.sms_count || "0", 10);
            if (userId) {
              const { data: usage } = await supabaseAdmin
                .from("usage_limits")
                .select("*")
                .eq("user_id", userId)
                .maybeSingle();
              if (usage) {
                await supabaseAdmin
                  .from("usage_limits")
                  .update({
                    call_credit_seconds:
                      (usage.call_credit_seconds || 0) + callSeconds,
                    sms_credit: (usage.sms_credit || 0) + smsCount,
                    limit_state: "ok",
                    force_pause: false,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("user_id", userId);
              }
              await auditLog({
                userId,
                action: "topup_applied",
                entity: "usage",
                entityId: session.id,
                req,
                metadata: { call_seconds: callSeconds, sms_count: smsCount },
              });
            }
            return;
          }
          if (session.mode === "subscription" && session.subscription) {
            const subscription = await stripe.subscriptions.retrieve(
              session.subscription
            );
            const userId =
              session.metadata?.user_id || session.client_reference_id;
            if (userId) {
              await supabaseAdmin.from("subscriptions").upsert({
                user_id: userId,
                customer_id: subscription.customer,
                status: subscription.status,
                plan_type:
                  session.metadata?.plan_type ||
                  subscription.items.data?.[0]?.price?.nickname ||
                  "pro",
                current_period_end: new Date(
                  subscription.current_period_end * 1000
                ).toISOString(),
              });
              await supabaseAdmin
                .from("profiles")
                .update({ role: "active" })
                .eq("user_id", userId);
              await auditLog({
                userId,
                action: "subscription_activated",
                entity: "subscription",
                entityId: subscription.id,
                req,
                metadata: { status: subscription.status },
              });
            }
          }
          const { data: dealRow } = await supabaseAdmin
            .from("deals")
            .select("id,seller_id")
            .eq("stripe_session_id", session.id)
            .maybeSingle();
          if (dealRow?.id) {
            const { data: commissionRow } = await supabaseAdmin
              .from("commissions")
              .update({ status: "payable" })
              .eq("deal_id", dealRow.id)
              .select("id")
              .single();
            await auditLog({
              userId: dealRow.seller_id || null,
              actorId: dealRow.seller_id || null,
              action: "commission_unlocked",
              actionType: "commission_unlocked",
              entity: "commission",
              entityId: commissionRow?.id || dealRow.id,
              req,
              metadata: { stripe_session_id: session.id },
            });
          }
        }

        if (event.type === "customer.subscription.updated") {
          const subscription = event.data.object;
          await supabaseAdmin
            .from("subscriptions")
            .update({
              status: subscription.status,
              current_period_end: new Date(
                subscription.current_period_end * 1000
              ).toISOString(),
            })
            .eq("customer_id", subscription.customer);
        }

        if (event.type === "customer.subscription.deleted") {
          const subscription = event.data.object;
          const { data: subRow } = await supabaseAdmin
            .from("subscriptions")
            .update({
              status: subscription.status,
              current_period_end: new Date(
                subscription.current_period_end * 1000
              ).toISOString(),
            })
            .eq("customer_id", subscription.customer)
            .select("user_id")
            .single();

          if (subRow?.user_id) {
            await supabaseAdmin
              .from("profiles")
              .update({ role: "revoked" })
              .eq("user_id", subRow.user_id);
            await auditLog({
              userId: subRow.user_id,
              action: "subscription_revoked",
              entity: "subscription",
              entityId: subscription.id,
              req,
              metadata: { status: subscription.status },
            });
          }
        }

        if (event.type === "invoice.payment_failed") {
          const invoice = event.data.object;
          const { data: subRow } = await supabaseAdmin
            .from("subscriptions")
            .update({ status: "past_due" })
            .eq("customer_id", invoice.customer)
            .select("user_id")
            .single();

          if (subRow?.user_id) {
            await supabaseAdmin
              .from("profiles")
              .update({ role: "past_due" })
              .eq("user_id", subRow.user_id);
            await auditLog({
              userId: subRow.user_id,
              action: "payment_failed",
              entity: "subscription",
              entityId: invoice.subscription || null,
              req,
              metadata: { status: "past_due" },
            });
          }
        }
      } catch (err) {
        console.error("Stripe webhook processing error:", err.message);
      }
    });
  }
);

app.use(express.json({ limit: "1mb" }));

const retellClient = axios.create({
  baseURL: "https://api.retellai.com/v2",
  headers: {
    Authorization: `Bearer ${RETELL_API_KEY}`,
    "Content-Type": "application/json",
  },
});

const rateBuckets = new Map();
const rateLimit = ({ keyPrefix, limit, windowMs }) => (req, res, next) => {
  const key = `${keyPrefix}:${req.user?.id || req.ip}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  if (bucket.count > limit) {
    return res.status(429).json({ error: "Too many requests" });
  }
  return next();
};

const isSubscriptionActive = (subscription) => {
  if (!subscription) return false;
  const allowed = ["active", "trialing"];
  if (!allowed.includes(subscription.status)) return false;
  if (!subscription.current_period_end) return false;
  const expiresAt = new Date(subscription.current_period_end).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
};

const currentConsentVersion = CONSENT_VERSION || "v1";
const topupPriceMap = {
  calls_300: {
    priceId: STRIPE_TOPUP_CALL_300,
    call_seconds: 300 * 60,
    sms_count: 0,
  },
  calls_800: {
    priceId: STRIPE_TOPUP_CALL_800,
    call_seconds: 800 * 60,
    sms_count: 0,
  },
  sms_500: {
    priceId: STRIPE_TOPUP_SMS_500,
    call_seconds: 0,
    sms_count: 500,
  },
  sms_1000: {
    priceId: STRIPE_TOPUP_SMS_1000,
    call_seconds: 0,
    sms_count: 1000,
  },
};

const topupCatalog = {
  call_300: { price: STRIPE_TOPUP_CALL_300, call_seconds: 300 * 60, sms: 0 },
  call_800: { price: STRIPE_TOPUP_CALL_800, call_seconds: 800 * 60, sms: 0 },
  sms_500: { price: STRIPE_TOPUP_SMS_500, call_seconds: 0, sms: 500 },
  sms_1000: { price: STRIPE_TOPUP_SMS_1000, call_seconds: 0, sms: 1000 },
  white_glove: { price: STRIPE_WHITE_GLOVE, call_seconds: 0, sms: 0 },
};

const resolveTopup = (type) => topupCatalog[type] || null;

const planConfig = (planType) => {
  const plan = (planType || "").toLowerCase();
  if (plan.includes("elite")) {
    return { call_minutes: 1200, sms_count: 2000, grace_seconds: 600 };
  }
  if (plan.includes("core")) {
    return { call_minutes: 150, sms_count: 250, grace_seconds: 600 };
  }
  if (plan.includes("pro")) {
    return { call_minutes: 500, sms_count: 800, grace_seconds: 600 };
  }
  return { call_minutes: 200, sms_count: 300, grace_seconds: 600 };
};

const planPriceId = (planTier) => {
  const tier = (planTier || "").toLowerCase();
  if (tier === "elite") {
    return STRIPE_PRICE_ID_ELITE || STRIPE_PRICE_ID_PLUMBING;
  }
  if (tier === "core") {
    return STRIPE_PRICE_ID_CORE;
  }
  return STRIPE_PRICE_ID_PRO || STRIPE_PRICE_ID_HVAC;
};

const DEFAULT_COMMISSION_RATE = 0.2;

const getStartOfDayIso = () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
};

const getStartOfMonthIso = () => {
  const now = new Date();
  now.setDate(1);
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
};

const ensureUsageLimits = async ({ userId, planType, periodEnd }) => {
  const config = planConfig(planType);
  const { data: existing } = await supabaseAdmin
    .from("usage_limits")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (!existing) {
    const periodStart = new Date();
    const periodEndDate = periodEnd
      ? new Date(periodEnd)
      : new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000);
    const { data } = await supabaseAdmin
      .from("usage_limits")
      .insert({
        user_id: userId,
        call_cap_seconds: config.call_minutes * 60,
        sms_cap: config.sms_count,
        grace_seconds: config.grace_seconds,
        period_start: periodStart.toISOString(),
        period_end: periodEndDate.toISOString(),
      })
      .select("*")
      .single();
    return data;
  }

  return existing;
};

const refreshUsagePeriod = async (usage, planType, periodEnd) => {
  if (!usage) return usage;
  const now = Date.now();
  const periodEndMs = usage.period_end ? new Date(usage.period_end).getTime() : 0;
  if (!periodEndMs || now <= periodEndMs) return usage;

  const config = planConfig(planType);
  const rolloverSeconds = Math.max(
    0,
    usage.call_cap_seconds +
      usage.call_credit_seconds +
      usage.rollover_seconds -
      usage.call_used_seconds
  );
  const nextEnd = periodEnd
    ? new Date(periodEnd)
    : new Date(now + 30 * 24 * 60 * 60 * 1000);
  const { data } = await supabaseAdmin
    .from("usage_limits")
    .update({
      call_cap_seconds: config.call_minutes * 60,
      sms_cap: config.sms_count,
      call_used_seconds: 0,
      sms_used: 0,
      call_credit_seconds: 0,
      sms_credit: 0,
      rollover_seconds: rolloverSeconds,
      rollover_applied: true,
      limit_state: "ok",
      period_start: new Date().toISOString(),
      period_end: nextEnd.toISOString(),
    })
    .eq("user_id", usage.user_id)
    .select("*")
    .single();
  return data || usage;
};

const getUsageRemaining = (usage) => {
  const total =
    usage.call_cap_seconds +
    usage.call_credit_seconds +
    usage.rollover_seconds;
  const remaining = Math.max(0, total - usage.call_used_seconds);
  return { total, remaining };
};

const requireAdmin = async (req, res, next) => {
  try {
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("user_id", req.user.id)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: error.message });
    }
    if (profile?.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    return next();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return res.status(401).json({ error: "Missing auth token" });
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data || !data.user) {
      return res.status(401).json({ error: "Invalid auth token" });
    }

    req.user = data.user;
    return next();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const pickLlmId = (industry) => {
  if (industry && industry.toLowerCase().includes("plumb")) {
    return RETELL_LLM_ID_PLUMBING;
  }
  return RETELL_LLM_ID_HVAC;
};

const extractLead = (transcript) => {
  const nameMatch = transcript.match(
    /(?:name is|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i
  );
  const phoneMatch = transcript.match(/(\+?\d[\d\-\s\(\)]{7,}\d)/);
  const summary = transcript
    .split(".")
    .slice(0, 2)
    .join(".")
    .trim();
  const sentiment = /frustrat|angry|upset/i.test(transcript)
    ? "negative"
    : /great|thank|appreciat/i.test(transcript)
    ? "positive"
    : "neutral";

  return {
    name: nameMatch ? nameMatch[1].trim() : null,
    phone: phoneMatch ? phoneMatch[1].trim() : null,
    summary: summary || null,
    sentiment,
  };
};

app.get("/", (req, res) => {
  res.json({ status: "Online" });
});

app.post("/retell-webhook", enforceIpAllowlist, async (req, res) => {
  try {
    lastRetellWebhookAt = new Date().toISOString();
    if (RETELL_WEBHOOK_SECRET) {
      const provided = req.headers["x-retell-webhook-secret"];
      if (provided !== RETELL_WEBHOOK_SECRET) {
        return res.status(401).json({ error: "Invalid Retell signature" });
      }
    }
    const payload = req.body || {};
    const eventType =
      payload.event_type || payload.event || payload.type || "unknown";
    const call = payload.call || payload.data || {};

    if (eventType === "call_ended") {
      const transcript = call.transcript || payload.transcript || "";
      const agentId = call.agent_id || payload.agent_id;
      const callId = call.call_id || payload.call_id || payload.id || null;
      const durationSeconds =
        Math.round(
          (call.duration_ms || payload.duration_ms || 0) / 1000
        ) ||
        call.duration_seconds ||
        payload.duration_seconds ||
        0;
      const recordingUrl =
        call.recording_url ||
        call.recordingUrl ||
        call.recording?.url ||
        payload.recording_url ||
        payload.recordingUrl ||
        payload.recording?.url ||
        null;

      const { data: agentRow, error: agentError } = await supabaseAdmin
        .from("agents")
        .select("user_id")
        .eq("agent_id", agentId)
        .single();

      if (agentError || !agentRow) {
        return res.status(404).json({ error: "Agent not found" });
      }

      const extracted = extractLead(transcript);
      const { error: leadError } = await supabaseAdmin.from("leads").insert({
        user_id: agentRow.user_id,
        owner_id: agentRow.user_id,
        agent_id: agentId,
        name: extracted.name,
        phone: extracted.phone,
        status: "New",
        summary: extracted.summary,
        transcript,
        sentiment: extracted.sentiment,
        recording_url: recordingUrl,
        call_duration_seconds: durationSeconds || null,
      });

      if (leadError) {
        return res.status(500).json({ error: leadError.message });
      }
      await auditLog({
        userId: agentRow.user_id,
        action: "lead_created",
        entity: "lead",
        entityId: agentId,
        req,
        metadata: { sentiment: extracted.sentiment },
      });

      if (durationSeconds > 0) {
        const { data: subscription } = await supabaseAdmin
          .from("subscriptions")
          .select("plan_type, current_period_end")
          .eq("user_id", agentRow.user_id)
          .maybeSingle();
        let usage = await ensureUsageLimits({
          userId: agentRow.user_id,
          planType: subscription?.plan_type,
          periodEnd: subscription?.current_period_end,
        });
        usage = await refreshUsagePeriod(
          usage,
          subscription?.plan_type,
          subscription?.current_period_end
        );

        const updatedUsed = (usage.call_used_seconds || 0) + durationSeconds;
        const graceLimit =
          usage.call_cap_seconds +
          usage.grace_seconds +
          usage.call_credit_seconds +
          usage.rollover_seconds;
        let nextState = usage.limit_state;
        if (updatedUsed >= graceLimit) {
          nextState = "paused";
        } else if (updatedUsed >= usage.call_cap_seconds) {
          nextState = "pending";
        }

        await supabaseAdmin.from("usage_calls").insert({
          user_id: agentRow.user_id,
          agent_id: agentId,
          call_id: callId,
          seconds: durationSeconds,
          cost_cents: 0,
        });

        await supabaseAdmin
          .from("usage_limits")
          .update({
            call_used_seconds: updatedUsed,
            limit_state: nextState,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", agentRow.user_id);

        const { total, remaining } = getUsageRemaining({
          ...usage,
          call_used_seconds: updatedUsed,
        });
        await supabaseAdmin.from("usage_snapshots").insert({
          user_id: agentRow.user_id,
          source: "call_ended",
          minutes_used: Math.ceil(updatedUsed / 60),
          cap_minutes: Math.ceil(total / 60),
          remaining_minutes: Math.ceil(remaining / 60),
        });

        if (total > 0 && remaining / total <= 0.2) {
          const { data: alert } = await supabaseAdmin
            .from("usage_alerts")
            .select("id")
            .eq("user_id", agentRow.user_id)
            .eq("alert_type", "usage_80")
            .maybeSingle();
          if (!alert) {
            await supabaseAdmin.from("usage_alerts").insert({
              user_id: agentRow.user_id,
              alert_type: "usage_80",
            });
            await auditLog({
              userId: agentRow.user_id,
              action: "usage_near_limit",
              entity: "usage",
              entityId: agentId,
              req,
            });
          }
        }
      }
    }

    if (eventType === "sms_received") {
      const agentId = payload.agent_id || call.agent_id;
      const body = payload.body || call.body || payload.message || "";
      const fromNumber = payload.from || call.from || payload.from_number;

      const { data: agentRow, error: agentError } = await supabaseAdmin
        .from("agents")
        .select("user_id")
        .eq("agent_id", agentId)
        .single();

      if (agentError || !agentRow) {
        return res.status(404).json({ error: "Agent not found" });
      }

      const { error: messageError } = await supabaseAdmin
        .from("messages")
        .insert({
          user_id: agentRow.user_id,
          direction: "inbound",
          body,
        });

      if (messageError) {
        return res.status(500).json({ error: messageError.message });
      }
      await auditLog({
        userId: agentRow.user_id,
        action: "sms_received",
        entity: "message",
        entityId: agentId,
        req,
      });

      if (fromNumber && /^(stop|unsubscribe|cancel|end)\b/i.test(body.trim())) {
        await supabaseAdmin.from("sms_opt_outs").insert({
          user_id: agentRow.user_id,
          phone: fromNumber,
        });
        await auditLog({
          userId: agentRow.user_id,
          action: "sms_opt_out",
          entity: "phone",
          entityId: fromNumber,
          req,
        });
      }
    }

    return res.json({ received: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post(
  "/deploy-agent",
  requireAuth,
  rateLimit({ keyPrefix: "deploy", limit: 6, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const {
        businessName,
        industry,
        voiceId,
        areaCode,
        tone,
        scheduleSummary,
        standardFee,
        emergencyFee,
        paymentId,
        transferNumber,
      } = req.body || {};
      if (!businessName || !industry) {
        return res
          .status(400)
          .json({ error: "businessName and industry are required" });
      }
      if (businessName.length < 2 || businessName.length > 80) {
        return res.status(400).json({ error: "businessName is invalid" });
      }
      if (areaCode && !/^\d{3}$/.test(String(areaCode))) {
        return res.status(400).json({ error: "areaCode must be 3 digits" });
      }

      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("consent_accepted_at, consent_version, role")
        .eq("user_id", req.user.id)
        .maybeSingle();

      if (
        !profile?.consent_accepted_at ||
        profile?.consent_version !== currentConsentVersion
      ) {
        return res.status(403).json({ error: "Consent required" });
      }

      if (profile?.role !== "admin") {
        const { data: subscription, error: subError } = await supabaseAdmin
          .from("subscriptions")
          .select("status, current_period_end")
          .eq("user_id", req.user.id)
          .maybeSingle();

        if (subError) {
          return res.status(500).json({ error: subError.message });
        }

        if (!isSubscriptionActive(subscription)) {
          return res.status(402).json({ error: "Active subscription required" });
        }
      }

      const llmId = pickLlmId(industry);
      const cleanTransfer =
        transferNumber && String(transferNumber).replace(/[^\d+]/g, "");
      if (cleanTransfer && cleanTransfer.length < 8) {
        return res
          .status(400)
          .json({ error: "transferNumber must be a valid phone number" });
      }

      const prompt = `You are the AI phone agent for ${businessName}, a ${industry} business. Be concise, professional, and focus on booking service calls. Voice tone: ${
        tone || "Calm & Professional"
      }. Collect caller name, phone, address, issue, and preferred time. ${
        scheduleSummary ? `Scheduling: ${scheduleSummary}` : ""
      } ${
        standardFee ? `Standard fee: $${standardFee}.` : ""
      } ${
        emergencyFee ? `Emergency fee: $${emergencyFee}.` : ""
      } ${
        cleanTransfer
          ? `If a human transfer is required, route the caller to ${cleanTransfer}.`
          : ""
      }`.trim();

      const agentPayload = {
        llm_id: llmId,
        agent_name: `${businessName} AI Agent`,
        prompt,
      };
      if (voiceId) {
        agentPayload.voice_id = voiceId;
      }

      const agentResponse = await retellClient.post("/agents", agentPayload);

      const agentId = agentResponse.data.agent_id || agentResponse.data.id;
      if (!agentId) {
        return res.status(500).json({ error: "Retell agent_id missing" });
      }

      const phonePayload = {
        agent_id: agentId,
        area_code: areaCode && String(areaCode).length === 3 ? areaCode : "auto",
      };
      const phoneResponse = await retellClient.post("/phone-numbers", phonePayload);

      const phoneNumber =
        phoneResponse.data.phone_number || phoneResponse.data.number;

      const { error: insertError } = await supabaseAdmin.from("agents").insert({
        user_id: req.user.id,
        agent_id: agentId,
        phone_number: phoneNumber,
        voice_id: voiceId || null,
        llm_id: llmId,
        prompt,
        area_code: areaCode || null,
        tone: tone || null,
        schedule_summary: scheduleSummary || null,
        standard_fee: standardFee || null,
        emergency_fee: emergencyFee || null,
        payment_id: paymentId || null,
        transfer_number: cleanTransfer || null,
        is_active: true,
      });

      if (insertError) {
        return res.status(500).json({ error: insertError.message });
      }

      await auditLog({
        userId: req.user.id,
        action: "agent_deployed",
        entity: "agent",
        entityId: agentId,
        req,
        metadata: { industry, phone_number: phoneNumber },
      });

      return res.json({ agent_id: agentId, phone_number: phoneNumber });
    } catch (err) {
      const details = err.response?.data || null;
      const message = err.response?.data?.error || err.message;
      console.error("deploy-agent error:", message, details);
      return res.status(500).json({ error: message, details });
    }
  }
);

app.post("/update-agent", requireAuth, async (req, res) => {
  try {
    const { agentId, prompt, voiceId } = req.body || {};
    if (!agentId) {
      return res.status(400).json({ error: "agentId is required" });
    }

    const payload = {};
    if (prompt) payload.prompt = prompt;
    if (voiceId) payload.voice_id = voiceId;

    const updateResponse = await retellClient.patch(`/agents/${agentId}`, payload);

    const { error: updateError } = await supabaseAdmin
      .from("agents")
      .update({
        prompt: prompt || undefined,
        voice_id: voiceId || undefined,
      })
      .eq("agent_id", agentId)
      .eq("user_id", req.user.id);

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    return res.json({ updated: true, data: updateResponse.data });
  } catch (err) {
    const message =
      err.response?.data?.error || err.response?.data || err.message;
    return res.status(500).json({ error: message });
  }
});

app.get("/dashboard-stats", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const { count: totalLeads, error: totalError } = await supabaseAdmin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    if (totalError) {
      return res.status(500).json({ error: totalError.message });
    }

    const { count: newLeads, error: newError } = await supabaseAdmin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .ilike("status", "new");

    if (newError) {
      return res.status(500).json({ error: newError.message });
    }

    const { count: bookedLeads, error: bookedError } = await supabaseAdmin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .ilike("status", "booked");

    if (bookedError) {
      return res.status(500).json({ error: bookedError.message });
    }

    return res.json({
      total_leads: totalLeads || 0,
      new_leads: newLeads || 0,
      booked_leads: bookedLeads || 0,
      call_volume: totalLeads || 0,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/leads", requireAuth, async (req, res) => {
  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("user_id", req.user.id)
      .maybeSingle();
    const role = profile?.role || "owner";
    const { data, error } = await supabaseAdmin
      .from("leads")
      .select("*")
      .eq(role === "seller" ? "owner_id" : "user_id", req.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({ leads: data || [] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/admin/leads", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({ leads: data || [] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post(
  "/leads/update-status",
  requireAuth,
  rateLimit({ keyPrefix: "leads-status", limit: 30, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("user_id", req.user.id)
        .maybeSingle();
      const role = profile?.role || "owner";
      const { leadId, status } = req.body || {};
      if (!leadId || !status) {
        return res.status(400).json({ error: "leadId and status are required" });
      }
      const normalizedStatus = String(status).toLowerCase();
      const allowed = ["new", "contacted", "demo_set", "closed_won", "dead"];
      if (!allowed.includes(normalizedStatus)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const { data, error } = await supabaseAdmin
        .from("leads")
        .update({ status: normalizedStatus, updated_at: new Date().toISOString() })
        .eq("id", leadId)
        .eq(role === "seller" ? "owner_id" : "user_id", req.user.id)
        .select("*")
        .maybeSingle();

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.json({ lead: data || null });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

app.get("/messages", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("messages")
      .select("*")
      .eq("user_id", req.user.id)
      .order("timestamp", { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({ messages: data || [] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post(
  "/send-sms",
  requireAuth,
  rateLimit({ keyPrefix: "sms", limit: 20, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { leadId, to, body } = req.body || {};
      if (!body) {
        return res.status(400).json({ error: "body is required" });
      }

      let destination = to;
      if (!destination && leadId) {
        const { data: lead, error: leadError } = await supabaseAdmin
          .from("leads")
          .select("phone")
          .eq("id", leadId)
          .eq("user_id", req.user.id)
          .single();

        if (leadError || !lead) {
          return res.status(404).json({ error: "Lead not found" });
        }

        destination = lead.phone;
      }

      if (!destination) {
        return res.status(400).json({ error: "to or leadId is required" });
      }
      const data = await sendSmsInternal({
        userId: req.user.id,
        to: destination,
        body,
        leadId,
        source: "manual",
      });

      return res.json({ sent: true, data });
    } catch (err) {
      const message =
        err.response?.data?.error || err.response?.data || err.message;
      return res.status(500).json({ error: message });
    }
  }
);

app.post(
  "/tracking/create",
  requireAuth,
  rateLimit({ keyPrefix: "tracking-create", limit: 10, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { leadId, customerPhone, etaMinutes } = req.body || {};
      const token = generateToken(12);
      const updateKey = generateToken(16);
      const eta =
        etaMinutes !== undefined && etaMinutes !== null
          ? Math.max(1, parseInt(String(etaMinutes), 10) || 0)
          : null;

      const { data, error } = await supabaseAdmin
        .from("tracking_sessions")
        .insert({
          token,
          update_key: updateKey,
          created_by: req.user.id,
          lead_id: leadId || null,
          customer_phone: customerPhone || null,
          eta_minutes: eta,
          status: "active",
        })
        .select("*")
        .single();

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.json({
        session: data,
        tracking_url: `${FRONTEND_URL}/track/${token}`,
        update_url: `${FRONTEND_URL}/tech/track/${token}?key=${updateKey}`,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

app.get("/tracking/session/:token", async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) return res.status(400).json({ error: "token required" });
    const { data, error } = await supabaseAdmin
      .from("tracking_sessions")
      .select("token,status,eta_minutes,last_lat,last_lng,updated_at")
      .eq("token", token)
      .maybeSingle();
    if (error || !data) {
      return res.status(404).json({ error: "Tracking session not found" });
    }
    return res.json({ session: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/tracking/points/:token", async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) return res.status(400).json({ error: "token required" });
    const { data: session } = await supabaseAdmin
      .from("tracking_sessions")
      .select("id")
      .eq("token", token)
      .maybeSingle();
    if (!session?.id) {
      return res.status(404).json({ error: "Tracking session not found" });
    }
    const { data, error } = await supabaseAdmin
      .from("tracking_points")
      .select("lat,lng,recorded_at")
      .eq("session_id", session.id)
      .order("recorded_at", { ascending: true })
      .limit(300);
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    return res.json({ points: data || [] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post(
  "/tracking/update",
  rateLimit({ keyPrefix: "tracking-update", limit: 120, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { token, key, lat, lng } = req.body || {};
      if (!token || !key) {
        return res.status(400).json({ error: "token and key required" });
      }
      const latitude = Number(lat);
      const longitude = Number(lng);
      if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
        return res.status(400).json({ error: "lat and lng must be numbers" });
      }
      const { data: session } = await supabaseAdmin
        .from("tracking_sessions")
        .select("id,update_key")
        .eq("token", token)
        .maybeSingle();
      if (!session || session.update_key !== key) {
        return res.status(403).json({ error: "Invalid tracking key" });
      }

      await supabaseAdmin.from("tracking_points").insert({
        session_id: session.id,
        lat: latitude,
        lng: longitude,
        recorded_at: new Date().toISOString(),
      });

      await supabaseAdmin
        .from("tracking_sessions")
        .update({
          last_lat: latitude,
          last_lng: longitude,
          updated_at: new Date().toISOString(),
        })
        .eq("id", session.id);

      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

app.post(
  "/activity/outbound-call",
  requireAuth,
  rateLimit({ keyPrefix: "activity-call", limit: 60, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { leadId, number } = req.body || {};
      await auditLog({
        userId: req.user.id,
        actorId: req.user.id,
        action: "outbound_call_attempt",
        actionType: "outbound_call_attempt",
        entity: "lead",
        entityId: leadId || null,
        req,
        metadata: {
          dialNumber: number || null,
        },
      });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

app.post(
  "/create-checkout-session",
  requireAuth,
  rateLimit({ keyPrefix: "checkout", limit: 8, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { planTier, successUrl, cancelUrl, lookup_key } = req.body || {};
      let priceId = null;
      if (lookup_key) {
        const prices = await stripe.prices.list({
          lookup_keys: [lookup_key],
          active: true,
          limit: 1,
        });
        priceId = prices.data?.[0]?.id || null;
      }
      if (!priceId) {
        if (!planTier) {
          return res
            .status(400)
            .json({ error: "planTier or lookup_key is required" });
        }
        if (!["pro", "elite", "core"].includes(planTier.toLowerCase())) {
          return res.status(400).json({ error: "Invalid planTier" });
        }
        priceId = planPriceId(planTier);
      }
      if (!priceId) {
        return res.status(400).json({ error: "Stripe price not configured" });
      }

      const sanitizeRedirect = (url, fallback) => {
        if (!url || typeof url !== "string") return fallback;
        if (!url.startsWith(FRONTEND_URL)) return fallback;
        return url;
      };

      const safeSuccessUrl = sanitizeRedirect(
        successUrl,
        `${FRONTEND_URL}/billing?success=true`
      );
      const safeCancelUrl = sanitizeRedirect(
        cancelUrl,
        `${FRONTEND_URL}/billing?canceled=true`
      );

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: safeSuccessUrl,
        cancel_url: safeCancelUrl,
        client_reference_id: req.user.id,
        metadata: {
          user_id: req.user.id,
          plan_type: planTier,
        },
      });

      await auditLog({
        userId: req.user.id,
        action: "checkout_created",
        entity: "stripe_session",
        entityId: session.id,
        req,
        metadata: { plan_type: planTier || null, lookup_key: lookup_key || null },
      });

      return res.json({ url: session.url });
    } catch (err) {
      const details = err.raw || err.response?.data || null;
      const message = err.message || "Stripe checkout error";
      console.error("create-checkout-session error:", message, details);
      return res.status(500).json({ error: message, details });
    }
  }
);

app.post(
  "/create-portal-session",
  requireAuth,
  rateLimit({ keyPrefix: "portal", limit: 8, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { data: subscription, error } = await supabaseAdmin
        .from("subscriptions")
        .select("customer_id")
        .eq("user_id", req.user.id)
        .single();

      if (error || !subscription) {
        return res.status(404).json({ error: "Subscription not found" });
      }

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: subscription.customer_id,
        return_url: `${FRONTEND_URL}/billing`,
      });

      await auditLog({
        userId: req.user.id,
        action: "portal_created",
        entity: "stripe_portal",
        entityId: portalSession.id,
        req,
      });

      return res.json({ url: portalSession.url });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

app.post(
  "/create-topup-session",
  requireAuth,
  rateLimit({ keyPrefix: "topup", limit: 8, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { topupType, successUrl, cancelUrl } = req.body || {};
      const topup = topupPriceMap[topupType];
      if (!topup?.priceId) {
        return res.status(400).json({ error: "Invalid topupType" });
      }

      const sanitizeRedirect = (url, fallback) => {
        if (!url || typeof url !== "string") return fallback;
        if (!url.startsWith(FRONTEND_URL)) return fallback;
        return url;
      };
      const safeSuccessUrl = sanitizeRedirect(
        successUrl,
        `${FRONTEND_URL}/billing?topup=success`
      );
      const safeCancelUrl = sanitizeRedirect(
        cancelUrl,
        `${FRONTEND_URL}/billing?topup=canceled`
      );

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{ price: topup.priceId, quantity: 1 }],
        success_url: safeSuccessUrl,
        cancel_url: safeCancelUrl,
        client_reference_id: req.user.id,
        metadata: {
          type: "topup",
          user_id: req.user.id,
          call_seconds: String(topup.call_seconds),
          sms_count: String(topup.sms_count),
          topup_type: topupType,
        },
      });

      await auditLog({
        userId: req.user.id,
        action: "topup_checkout_created",
        entity: "stripe_session",
        entityId: session.id,
        req,
        metadata: { topupType },
      });

      return res.json({ url: session.url, sessionId: session.id });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

app.get("/subscription-status", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("subscriptions")
      .select("status, plan_type, current_period_end")
      .eq("user_id", req.user.id)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({
      status: data?.status || "none",
      plan_type: data?.plan_type || null,
      current_period_end: data?.current_period_end || null,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post(
  "/verify-checkout-session",
  requireAuth,
  rateLimit({ keyPrefix: "verify", limit: 10, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { sessionId } = req.body || {};
      if (!sessionId) {
        return res.status(400).json({ error: "sessionId is required" });
      }

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (!session || session.mode !== "subscription") {
        return res.status(400).json({ error: "Invalid session" });
      }

      const userId = session.metadata?.user_id || session.client_reference_id;
      if (userId && userId !== req.user.id) {
        return res.status(403).json({ error: "Session does not match user" });
      }

      const subscription = await stripe.subscriptions.retrieve(
        session.subscription
      );

      await supabaseAdmin.from("subscriptions").upsert({
        user_id: req.user.id,
        customer_id: subscription.customer,
        status: subscription.status,
        plan_type:
          session.metadata?.plan_type ||
          subscription.items.data?.[0]?.price?.nickname ||
          "pro",
        current_period_end: new Date(
          subscription.current_period_end * 1000
        ).toISOString(),
      });

      await supabaseAdmin
        .from("profiles")
        .update({ role: "active" })
        .eq("user_id", req.user.id);

      await auditLog({
        userId: req.user.id,
        action: "checkout_verified",
        entity: "subscription",
        entityId: subscription.id,
        req,
        metadata: { status: subscription.status },
      });

      return res.json({
        verified: true,
        status: subscription.status,
        plan_type:
          session.metadata?.plan_type ||
          subscription.items.data?.[0]?.price?.nickname ||
          "pro",
      });
    } catch (err) {
      const details = err.raw || err.message;
      return res.status(500).json({ error: err.message, details });
    }
  }
);

app.post(
  "/consent",
  requireAuth,
  rateLimit({ keyPrefix: "consent", limit: 6, windowMs: 60_000 }),
  async (req, res) => {
    try {
      await supabaseAdmin.from("consent_logs").insert({
        user_id: req.user.id,
        version: currentConsentVersion,
        ip:
          req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
          req.socket?.remoteAddress ||
          null,
        user_agent: req.headers["user-agent"] || null,
      });

      await supabaseAdmin.from("profiles").upsert({
        user_id: req.user.id,
        consent_accepted_at: new Date().toISOString(),
        consent_version: currentConsentVersion,
      });

      await auditLog({
        userId: req.user.id,
        action: "consent_accepted",
        entity: "consent",
        req,
        metadata: { version: currentConsentVersion },
      });

      return res.json({ ok: true, version: currentConsentVersion });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

app.post(
  "/admin/verify-code",
  requireAuth,
  rateLimit({ keyPrefix: "admin-code", limit: 6, windowMs: 60_000 }),
  async (req, res) => {
    try {
      if (!ADMIN_ACCESS_CODE) {
        return res.status(500).json({ error: "Admin code not configured" });
      }
      const { code } = req.body || {};
      if (!code) {
        return res.status(400).json({ error: "code is required" });
      }
      if (code !== ADMIN_ACCESS_CODE) {
        await auditLog({
          userId: req.user.id,
          action: "admin_code_failed",
          entity: "admin",
          req,
        });
        return res.status(401).json({ error: "Invalid admin code" });
      }

      await supabaseAdmin.from("profiles").upsert({
        user_id: req.user.id,
        role: "admin",
      });

      await auditLog({
        userId: req.user.id,
        action: "admin_granted",
        entity: "admin",
        req,
      });

      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

app.post(
  "/admin/auto-grant",
  requireAuth,
  rateLimit({ keyPrefix: "admin-auto", limit: 6, windowMs: 60_000 }),
  async (req, res) => {
    try {
      if (!ADMIN_EMAIL) {
        return res.status(500).json({ error: "Admin email not configured" });
      }
      const adminEmails = ADMIN_EMAIL.split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);
      const userEmail = (req.user.email || "").trim().toLowerCase();
      if (!adminEmails.includes(userEmail)) {
        return res.status(403).json({ error: "Admin access denied" });
      }

      await supabaseAdmin.from("profiles").upsert({
        user_id: req.user.id,
        role: "admin",
      });

      await auditLog({
        userId: req.user.id,
        action: "admin_auto_granted",
        entity: "admin",
        req,
      });

      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

const buildCommissionStats = (commissions) => {
  const map = {};
  (commissions || []).forEach((comm) => {
    if (!comm?.seller_id) return;
    const entry = map[comm.seller_id] || { dealsClosed: 0, commissionOwed: 0 };
    entry.dealsClosed += 1;
    const commissionAmount = Number(comm.commission_amount) || 0;
    if (["pending_locked", "payable"].includes(String(comm.status))) {
      entry.commissionOwed += commissionAmount;
    }
    map[comm.seller_id] = entry;
  });
  return map;
};

app.get(
  "/admin/sellers",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-sellers", limit: 10, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { data: sellers, error } = await supabaseAdmin
        .from("profiles")
        .select("user_id, full_name, business_name, phone, status, created_at")
        .eq("role", "seller")
        .order("business_name", { ascending: true });
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      const sellerIds = (sellers || []).map((seller) => seller.user_id).filter(Boolean);
      if (!sellerIds.length) {
        return res.json({ sellers: [] });
      }

      const startOfDay = getStartOfDayIso();
      const startOfMonth = getStartOfMonthIso();

      const { data: callLogs = [] } = await supabaseAdmin
        .from("audit_logs")
        .select("actor_id")
        .in("actor_id", sellerIds)
        .eq("action_type", "outbound_call_attempt")
        .gte("created_at", startOfDay);

      const { data: commissions = [] } = await supabaseAdmin
        .from("commissions")
        .select("seller_id,status,commission_amount,deal_amount,created_at")
        .in("seller_id", sellerIds)
        .gte("created_at", startOfMonth);

      const callsMap = {};
      callLogs.forEach((entry) => {
        if (!entry?.actor_id) return;
        callsMap[entry.actor_id] = (callsMap[entry.actor_id] || 0) + 1;
      });

      const commissionStats = buildCommissionStats(commissions);

      const payload = sellers.map((seller) => {
        const callsToday = callsMap[seller.user_id] || 0;
        const stats = commissionStats[seller.user_id] || { dealsClosed: 0, commissionOwed: 0 };
        const conversionRate = callsToday
          ? Number(((stats.dealsClosed / callsToday) * 100).toFixed(1))
          : 0;
        return {
          ...seller,
          callsToday,
          dealsClosed: stats.dealsClosed,
          commissionOwed: Number(stats.commissionOwed.toFixed(2)),
          conversionRate,
        };
      });

      return res.json({ sellers: payload });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

app.get(
  "/admin/sellers/:sellerId/dossier",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-seller-dossier", limit: 10, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { sellerId } = req.params || {};
      if (!sellerId) {
        return res.status(400).json({ error: "sellerId is required" });
      }
      const { data: seller, error: sellerError } = await supabaseAdmin
        .from("profiles")
        .select("user_id, full_name, business_name, phone, status, created_at, role")
        .eq("user_id", sellerId)
        .maybeSingle();
      if (sellerError) {
        return res.status(500).json({ error: sellerError.message });
      }
      if (!seller) {
        return res.status(404).json({ error: "Seller not found" });
      }

      const [activityRes, commissionRes] = await Promise.all([
        supabaseAdmin
          .from("audit_logs")
          .select("id, action, action_type, entity, entity_id, metadata, ip, created_at")
          .eq("actor_id", sellerId)
          .order("created_at", { ascending: false })
          .limit(40),
        supabaseAdmin
          .from("commissions")
          .select("id, deal_amount, commission_amount, status, created_at")
          .eq("seller_id", sellerId)
          .order("created_at", { ascending: false })
          .limit(40),
      ]);

      const ipLog = [...new Set((activityRes.data || []).map((entry) => entry.ip).filter(Boolean))].map(
        (ip) => ({ ip })
      );

      return res.json({
        seller,
        activity: activityRes.data || [],
        commissions: commissionRes.data || [],
        ipLog: ipLog.slice(0, 5),
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

app.get(
  "/admin/sellers/:sellerId/audit",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-seller-audit", limit: 10, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { sellerId } = req.params || {};
      if (!sellerId) {
        return res.status(400).json({ error: "sellerId is required" });
      }
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
      const { data, error } = await supabaseAdmin
        .from("audit_logs")
        .select("id, action, action_type, entity, entity_id, metadata, ip, created_at")
        .eq("actor_id", sellerId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      return res.json({ activity: data || [] });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

app.post(
  "/admin/commissions/:commissionId/approve",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-commission-approve", limit: 6, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { commissionId } = req.params || {};
      if (!commissionId) {
        return res.status(400).json({ error: "commissionId is required" });
      }
      const { overrideAmount } = req.body || {};
      const { data: commission, error } = await supabaseAdmin
        .from("commissions")
        .select("*")
        .eq("id", commissionId)
        .maybeSingle();
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      if (!commission) {
        return res.status(404).json({ error: "Commission not found" });
      }

      const updates = {
        status: "paid",
        approved_at: new Date().toISOString(),
      };
      if (overrideAmount !== undefined && overrideAmount !== null) {
        const parsed = Number(overrideAmount);
        if (!Number.isNaN(parsed)) {
          updates.commission_amount = parsed;
        }
      }
      await supabaseAdmin.from("commissions").update(updates).eq("id", commission.id);

      await auditLog({
        userId: req.user.id,
        actorId: req.user.id,
        action: "commission_paid",
        actionType: "commission_paid",
        entity: "commission",
        entityId: commission.id,
        req,
        metadata: { overrideAmount: updates.commission_amount || commission.commission_amount },
      });

      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

app.post(
  "/admin/create-client",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-create-client", limit: 6, windowMs: 60_000 }),
  async (req, res) => {
    let createdUserId = null;
    try {
      const { 
        email,
        fullName,
        businessName,
        industry, 
        phone,
        tierId,
        features,
        leadId,
      } = req.body || {};

      if (!email) {
        return res.status(400).json({ error: "email is required" });
      }

      const planTier = String(tierId || "pro").toLowerCase();
      if (!["pro", "elite", "core"].includes(planTier)) {
        return res.status(400).json({ error: "Invalid tierId" });
      }

      const priceId = planPriceId(planTier);
      if (!priceId) {
        return res.status(400).json({ error: "Stripe price not configured" });
      }

      const priceRecord = await stripe.prices.retrieve(priceId);
      const dealAmount = (priceRecord?.unit_amount || 0) / 100;

      const { data: userResult, error: userError } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          email_confirm: true,
        });
      if (userError || !userResult?.user) {
        return res.status(500).json({ error: userError?.message || "User create failed" });
      }

      createdUserId = userResult.user.id;

      await supabaseAdmin.from("profiles").upsert({
        user_id: createdUserId,
        role: "owner",
        full_name: fullName || null,
        business_name: businessName || null,
        industry: industry || null,
        phone: phone || null,
        referrer_id: req.user.id,
      });

      const customer = await stripe.customers.create({
        email,
        name: businessName || fullName || email,
        metadata: {
          user_id: createdUserId,
          lead_id: leadId || "",
          plan_tier: planTier,
          features: Array.isArray(features) ? JSON.stringify(features) : "[]",
        },
      });

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${FRONTEND_URL}/admin/wizard/create?success=true`,
        cancel_url: `${FRONTEND_URL}/admin/wizard/create?canceled=true`,
        customer: customer.id,
        client_reference_id: createdUserId,
        metadata: {
          user_id: createdUserId,
          plan_type: planTier,
          lead_id: leadId || "",
          features: Array.isArray(features) ? JSON.stringify(features) : "[]",
        },
      });

      const { data: dealRow, error: dealError } = await supabaseAdmin
        .from("deals")
        .insert({
          lead_id: leadId || null,
          seller_id: req.user.id,
          referrer_id: req.user.id,
          stripe_session_id: session.id,
          amount: dealAmount,
          status: "pending",
        })
        .select("*")
        .single();
      if (dealError || !dealRow) {
        return res.status(500).json({ error: dealError?.message || "Deal insert failed" });
      }

      const commissionAmount = Number(
        (dealAmount * DEFAULT_COMMISSION_RATE).toFixed(2)
      );
      const { error: commissionError } = await supabaseAdmin.from("commissions").insert({
        seller_id: req.user.id,
        deal_id: dealRow.id,
        deal_amount: dealAmount,
        commission_amount: commissionAmount,
        status: "pending_locked",
      });
      if (commissionError) {
        return res.status(500).json({ error: commissionError.message });
      }

      await auditLog({
        userId: req.user.id,
        actorId: req.user.id,
        action: "client_created",
        actionType: "client_created",
        entity: "client",
        entityId: createdUserId,
        req,
        metadata: {
          plan_tier: planTier,
          lead_id: leadId || null,
          deal_amount: dealAmount,
          commission_amount: commissionAmount,
        },
      });

      return res.json({
        ok: true,
        user_id: createdUserId,
        checkout_url: session.url,
      });
    } catch (err) {
      if (createdUserId) {
        try {
          await supabaseAdmin.auth.admin.deleteUser(createdUserId);
        } catch (cleanupErr) {
          // ignore cleanup errors
        }
      }
      return res.status(500).json({ error: err.message });
    }
  }
);

app.get(
  "/admin/audit-logs",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-logs", limit: 20, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(250);

      if (error) {
        return res.status(500).json({ error: error.message });
      }
      return res.json({ logs: data || [] });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

app.get(
  "/admin/metrics",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-metrics", limit: 20, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const [
        usersCount,
        leadsCount,
        activeSubsCount,
        pastDueCount,
        proCount,
        eliteCount,
      ] = await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("user_id", { count: "exact", head: true }),
        supabaseAdmin
          .from("leads")
          .select("id", { count: "exact", head: true }),
        supabaseAdmin
          .from("subscriptions")
          .select("id", { count: "exact", head: true })
          .in("status", ["active", "trialing"]),
        supabaseAdmin
          .from("subscriptions")
          .select("id", { count: "exact", head: true })
          .eq("status", "past_due"),
        supabaseAdmin
          .from("subscriptions")
          .select("id", { count: "exact", head: true })
          .eq("status", "active")
          .or("plan_type.ilike.%pro%,plan_type.ilike.%hvac%"),
        supabaseAdmin
          .from("subscriptions")
          .select("id", { count: "exact", head: true })
          .eq("status", "active")
          .or("plan_type.ilike.%elite%,plan_type.ilike.%plumbing%"),
      ]);

      const proPrice = await stripe.prices.retrieve(
        STRIPE_PRICE_ID_PRO || STRIPE_PRICE_ID_HVAC
      );
      const elitePrice = await stripe.prices.retrieve(
        STRIPE_PRICE_ID_ELITE || STRIPE_PRICE_ID_PLUMBING
      );

      const proMRR = (proCount.count || 0) * (proPrice.unit_amount || 0);
      const eliteMRR = (eliteCount.count || 0) * (elitePrice.unit_amount || 0);

      const mrrCents = proMRR + eliteMRR;
      const totalUsers = usersCount.count || 0;
      const activeSubs = activeSubsCount.count || 0;
      const conversion =
        totalUsers > 0 ? Math.round((activeSubs / totalUsers) * 100) : 0;

      return res.json({
        totals: {
          users: totalUsers,
          leads: leadsCount.count || 0,
          active_subscriptions: activeSubs,
          past_due: pastDueCount.count || 0,
        },
        mrr: {
          amount_cents: mrrCents,
          currency: proPrice.currency || "usd",
          pro_cents: proMRR,
          elite_cents: eliteMRR,
        },
        conversion_rate: conversion,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

app.post(
  "/admin/usage/force-pause",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-usage", limit: 10, windowMs: 60_000 }),
  async (req, res) => {
    const { user_id } = req.body || {};
    if (!user_id) return res.status(400).json({ error: "user_id is required" });
    await supabaseAdmin
      .from("usage_limits")
      .update({ force_pause: true, force_resume: false })
      .eq("user_id", user_id);
    await auditLog({
      userId: req.user.id,
      action: "admin_force_pause",
      entity: "usage",
      entityId: user_id,
      req,
    });
    return res.json({ ok: true });
  }
);

app.post(
  "/admin/usage/force-resume",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-usage", limit: 10, windowMs: 60_000 }),
  async (req, res) => {
    const { user_id } = req.body || {};
    if (!user_id) return res.status(400).json({ error: "user_id is required" });
    await supabaseAdmin
      .from("usage_limits")
      .update({ force_pause: false, force_resume: true, limit_state: "ok" })
      .eq("user_id", user_id);
    await auditLog({
      userId: req.user.id,
      action: "admin_force_resume",
      entity: "usage",
      entityId: user_id,
      req,
    });
    return res.json({ ok: true });
  }
);

app.post(
  "/admin/usage/topup",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-usage", limit: 10, windowMs: 60_000 }),
  async (req, res) => {
    const { user_id, call_seconds = 0, sms_count = 0 } = req.body || {};
    if (!user_id) return res.status(400).json({ error: "user_id is required" });
    const { data: usage } = await supabaseAdmin
      .from("usage_limits")
      .select("*")
      .eq("user_id", user_id)
      .maybeSingle();
    if (!usage) return res.status(404).json({ error: "Usage not found" });
    await supabaseAdmin
      .from("usage_limits")
      .update({
        call_credit_seconds: (usage.call_credit_seconds || 0) + call_seconds,
        sms_credit: (usage.sms_credit || 0) + sms_count,
        limit_state: "ok",
      })
      .eq("user_id", user_id);
    await auditLog({
      userId: req.user.id,
      action: "admin_topup",
      entity: "usage",
      entityId: user_id,
      req,
      metadata: { call_seconds, sms_count },
    });
    return res.json({ ok: true });
  }
);

app.get(
  "/usage/status",
  requireAuth,
  rateLimit({ keyPrefix: "usage-status", limit: 30, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { data: subscription } = await supabaseAdmin
        .from("subscriptions")
        .select("plan_type, current_period_end")
        .eq("user_id", req.user.id)
        .maybeSingle();
      let usage = await ensureUsageLimits({
        userId: req.user.id,
        planType: subscription?.plan_type,
        periodEnd: subscription?.current_period_end,
      });
      usage = await refreshUsagePeriod(
        usage,
        subscription?.plan_type,
        subscription?.current_period_end
      );
      const { total, remaining } = getUsageRemaining(usage);
      return res.json({
        call_minutes_remaining: Math.floor(remaining / 60),
        call_minutes_total: Math.floor(total / 60),
        sms_remaining: Math.max(
          0,
          usage.sms_cap + usage.sms_credit - usage.sms_used
        ),
        sms_total: usage.sms_cap,
        limit_state: usage.limit_state,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

const scheduleAppointmentReminders = () => {
  const APPOINTMENT_POLL_MS = 60_000;
  const JOB_WINDOW_MINUTES = 60;

  const tick = async () => {
    try {
      const now = new Date();
      const windowEnd = new Date(now.getTime() + JOB_WINDOW_MINUTES * 60 * 1000);
      const { data: appts, error } = await supabaseAdmin
        .from("appointments")
        .select("*")
        .eq("status", "booked")
        .gte("start_time", now.toISOString())
        .lte("start_time", windowEnd.toISOString());
      if (error || !appts?.length) return;

      for (const appt of appts) {
        const start = new Date(appt.start_time);
        const diffMinutes = Math.round(
          (start.getTime() - now.getTime()) / 60000
        );

        if (
          appt.reminder_enabled &&
          !appt.reminder_sent &&
          appt.reminder_minutes > 0 &&
          diffMinutes <= appt.reminder_minutes &&
          diffMinutes >= 0 &&
          appt.customer_phone
        ) {
          const body = `Reminder: ${appt.customer_name}, your appointment is scheduled for ${start.toLocaleString()}.`;
          await sendSmsInternal({
            userId: appt.user_id,
            to: appt.customer_phone,
            body,
            source: "auto_reminder",
          });
          await supabaseAdmin
            .from("appointments")
            .update({
              reminder_sent: true,
              reminder_last_sent_at: new Date().toISOString(),
            })
            .eq("id", appt.id);
        }

        if (
          appt.eta_enabled &&
          appt.eta_minutes > 0 &&
          diffMinutes <= appt.eta_minutes &&
          diffMinutes >= 0 &&
          appt.customer_phone &&
          !appt.eta_last_sent_at
        ) {
          const link = appt.eta_link ? ` Track here: ${appt.eta_link}` : "";
          const body = `Your technician is about ${appt.eta_minutes} minutes away.${link}`;
          await sendSmsInternal({
            userId: appt.user_id,
            to: appt.customer_phone,
            body,
            source: "auto_eta",
          });
          await supabaseAdmin
            .from("appointments")
            .update({
              eta_last_sent_at: new Date().toISOString(),
            })
            .eq("id", appt.id);
        }
      }
    } catch (err) {
      console.error("appointment reminder error:", err.message);
    }
  };

  setInterval(tick, APPOINTMENT_POLL_MS);
};

app.get(
  "/admin/timeseries",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-timeseries", limit: 20, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const days = Math.min(
        Math.max(parseInt(req.query.days || "14", 10), 7),
        30
      );
      const start = new Date();
      start.setDate(start.getDate() - (days - 1));
      start.setHours(0, 0, 0, 0);

      const [profilesRes, subsRes, leadsRes] = await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("created_at")
          .gte("created_at", start.toISOString()),
        supabaseAdmin
          .from("subscriptions")
          .select("created_at, plan_type")
          .gte("created_at", start.toISOString()),
        supabaseAdmin
          .from("leads")
          .select("created_at")
          .gte("created_at", start.toISOString()),
      ]);

      if (profilesRes.error) {
        return res.status(500).json({ error: profilesRes.error.message });
      }
      if (subsRes.error) {
        return res.status(500).json({ error: subsRes.error.message });
      }
      if (leadsRes.error) {
        return res.status(500).json({ error: leadsRes.error.message });
      }

      const proPrice = await stripe.prices.retrieve(
        STRIPE_PRICE_ID_PRO || STRIPE_PRICE_ID_HVAC
      );
      const elitePrice = await stripe.prices.retrieve(
        STRIPE_PRICE_ID_ELITE || STRIPE_PRICE_ID_PLUMBING
      );

      const buckets = {};
      for (let i = 0; i < days; i += 1) {
        const date = new Date(start);
        date.setDate(start.getDate() + i);
        const key = date.toISOString().slice(0, 10);
        buckets[key] = {
          users: 0,
          subs: 0,
          leads: 0,
          mrr_cents: 0,
        };
      }

      const addToBucket = (iso, field, amount = 1) => {
        const key = iso.slice(0, 10);
        if (buckets[key]) {
          buckets[key][field] += amount;
        }
      };

      profilesRes.data.forEach((row) => addToBucket(row.created_at, "users"));
      leadsRes.data.forEach((row) => addToBucket(row.created_at, "leads"));
      subsRes.data.forEach((row) => {
        addToBucket(row.created_at, "subs");
        const plan = row.plan_type?.toLowerCase() || "";
        const priceCents = plan.includes("elite")
          ? elitePrice.unit_amount || 0
          : proPrice.unit_amount || 0;
        addToBucket(row.created_at, "mrr_cents", priceCents);
      });

      const labels = Object.keys(buckets);
      const series = {
        users: labels.map((key) => buckets[key].users),
        subs: labels.map((key) => buckets[key].subs),
        leads: labels.map((key) => buckets[key].leads),
        mrr_cents: labels.map((key) => buckets[key].mrr_cents),
      };

      return res.json({ labels, series });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

app.get(
  "/admin/health",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-health", limit: 30, windowMs: 60_000 }),
  async (req, res) => {
    return res.json({
      uptime_sec: Math.round(process.uptime()),
      last_stripe_webhook_at: lastStripeWebhookAt,
      last_retell_webhook_at: lastRetellWebhookAt,
      environment: {
        stripe_configured: Boolean(STRIPE_SECRET_KEY && STRIPE_WEBHOOK_SECRET),
        retell_configured: Boolean(RETELL_API_KEY),
        supabase_configured: Boolean(
          SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
        ),
      },
    });
  }
);

app.post(
  "/admin/sync-stripe",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-sync", limit: 6, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const subscriptions = await stripe.subscriptions.list({ limit: 100 });
      let synced = 0;
      for (const sub of subscriptions.data) {
        if (!sub.customer) continue;
        const { data: subRow } = await supabaseAdmin
          .from("subscriptions")
          .select("user_id")
          .eq("customer_id", sub.customer)
          .maybeSingle();
        if (!subRow?.user_id) continue;
        await supabaseAdmin.from("subscriptions").upsert({
          user_id: subRow.user_id,
          customer_id: sub.customer,
          status: sub.status,
          plan_type:
            sub.items.data?.[0]?.price?.nickname ||
            sub.items.data?.[0]?.price?.id ||
            "pro",
          current_period_end: new Date(
            sub.current_period_end * 1000
          ).toISOString(),
        });
        synced += 1;
      }
      await auditLog({
        userId: req.user.id,
        action: "stripe_sync",
        entity: "subscription",
        req,
        metadata: { synced },
      });
      return res.json({ synced });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

app.listen(PORT, () => {
  console.log(`Kryonex backend running on port ${PORT}`);
});

scheduleAppointmentReminders();