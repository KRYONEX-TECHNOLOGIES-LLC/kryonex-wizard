require("dotenv").config();

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const axios = require("axios");
const Stripe = require("stripe");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const { Resend } = require("resend");

const {
  PORT = 3000,
  RETELL_API_KEY,
  RETELL_VOICE_ID,
  RETELL_LLM_ID_HVAC,
  RETELL_LLM_ID_PLUMBING,
  RETELL_LLM_VERSION_HVAC,
  RETELL_LLM_VERSION_PLUMBING,
  RETELL_MASTER_AGENT_ID_HVAC,
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
  STRIPE_PRICE_ID_SCALE,
  FRONTEND_URL,
  APP_URL,
  SERVER_URL,
  RETELL_WEBHOOK_SECRET,
  RETELL_DEMO_AGENT_ID,
  RETELL_DEMO_FROM_NUMBER,
  RETELL_SMS_SANDBOX,
  RETELL_USE_BACKEND_PROMPT,
  RETELL_PROMPT_MODE,
  RETELL_BACKEND_PROMPT_ALLOWLIST,
  RETELL_AUTO_SYNC_MINUTES,
  CALCOM_CLIENT_ID,
  CALCOM_CLIENT_SECRET,
  CALCOM_ENCRYPTION_KEY,
  ADMIN_IP_ALLOWLIST,
  ADMIN_ACCESS_CODE,
  ADMIN_EMAIL,
  CONSENT_VERSION,
  RESEND_API_KEY,
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
if (!STRIPE_PRICE_ID_SCALE)
  throw new Error("Missing STRIPE_PRICE_ID_SCALE");
if (!FRONTEND_URL) throw new Error("Missing FRONTEND_URL");

const app = express();
const stripe = Stripe(STRIPE_SECRET_KEY);
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;
const appBaseUrl = APP_URL || FRONTEND_URL || "https://app.kryonextech.com";
const serverBaseUrl = SERVER_URL || APP_URL || FRONTEND_URL || appBaseUrl;
const calcomRedirectUri = `${serverBaseUrl}/api/calcom/callback`;

const getCalcomKey = () => {
  if (!CALCOM_ENCRYPTION_KEY) return null;
  const raw = Buffer.from(CALCOM_ENCRYPTION_KEY, "utf8");
  if (raw.length === 32) return raw;
  return crypto.createHash("sha256").update(raw).digest();
};

const encryptCalcomToken = (value) => {
  if (!value) return null;
  const key = getCalcomKey();
  if (!key) {
    throw new Error("Missing CALCOM_ENCRYPTION_KEY");
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(String(value), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString(
    "base64"
  )}`;
};

const decryptCalcomToken = (value) => {
  if (!value) return null;
  if (!String(value).startsWith("v1:")) return value;
  const key = getCalcomKey();
  if (!key) {
    throw new Error("Missing CALCOM_ENCRYPTION_KEY");
  }
  const [, ivBase64, tagBase64, dataBase64] = String(value).split(":");
  const iv = Buffer.from(ivBase64, "base64");
  const tag = Buffer.from(tagBase64, "base64");
  const encrypted = Buffer.from(dataBase64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
};

const signCalcomState = (payload) => {
  if (!CALCOM_CLIENT_SECRET) {
    throw new Error("Missing CALCOM_CLIENT_SECRET");
  }
  const raw = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", CALCOM_CLIENT_SECRET)
    .update(raw)
    .digest("base64url");
  return `${raw}.${sig}`;
};

const verifyCalcomState = (state) => {
  if (!state || !CALCOM_CLIENT_SECRET) return null;
  const [raw, sig] = String(state).split(".");
  if (!raw || !sig) return null;
  const expected = crypto
    .createHmac("sha256", CALCOM_CLIENT_SECRET)
    .update(raw)
    .digest("base64url");
  if (sig.length !== expected.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    return null;
  }
};

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const ensureAppointmentsSchema = async () => {
  try {
    const { error: tableError } = await supabaseAdmin
      .from("appointments")
      .select("id")
      .limit(1);

    if (tableError && String(tableError.code || "").includes("42P01")) {
      console.warn(
        "[schema check] `public.appointments` missing. Run this SQL:",
        `
CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_name text,
  customer_phone text,
  start_time timestamptz,
  end_time timestamptz,
  job_value numeric,
  status text,
  created_at timestamptz DEFAULT now()
);
        `
      );
      return;
    }

    const { error: columnError } = await supabaseAdmin
      .from("appointments")
      .select("job_value")
      .limit(1);

    if (columnError && String(columnError.code || "").includes("42703")) {
      console.warn(
        "[schema check] Missing appointments.job_value. Run:",
        "ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS job_value numeric;"
      );
    }

    const { error: durationError } = await supabaseAdmin
      .from("appointments")
      .select("duration_minutes")
      .limit(1);
    if (durationError && String(durationError.code || "").includes("42703")) {
      console.warn(
        "[schema check] Missing appointments.duration_minutes. Run:",
        "ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS duration_minutes integer;"
      );
    }
  } catch (err) {
    console.error("[schema check] Unable to verify appointments table:", err.message);
  }
};

ensureAppointmentsSchema();

const allowedOrigins = [
  FRONTEND_URL,
  APP_URL,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  process.env.VERCEL_BRANCH_URL ? `https://${process.env.VERCEL_BRANCH_URL}` : null,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
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
const pad2 = (value) => String(value).padStart(2, "0");
const formatDate = (date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const formatTime = (date) => `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

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

const logEvent = async ({ userId, actionType, req, metaData }) => {
  try {
    const eventId = `evt_${generateToken(8)}`;
    await supabaseAdmin.from("black_box_logs").insert({
      event_id: eventId,
      user_id: userId || null,
      action_type: actionType,
      timestamp: new Date().toISOString(),
      ip_address:
        req?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
        req?.socket?.remoteAddress ||
        null,
      user_agent: req?.headers?.["user-agent"] || null,
      meta_data: metaData || null,
    });
  } catch (err) {
    console.error("black box log error:", err.message);
  }
};

const lookupUserIdByCustomerId = async (customerId) => {
  if (!customerId) return null;
  const { data } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id")
    .eq("customer_id", customerId)
    .maybeSingle();
  return data?.user_id || null;
};

const sendSmsInternal = async ({ userId, to, body, leadId, source, req }) => {
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

  if (String(RETELL_SMS_SANDBOX || "").toLowerCase() === "true") {
    await supabaseAdmin.from("messages").insert({
      user_id: userId,
      lead_id: leadId || null,
      direction: "outbound",
      body,
    });
    await auditLog({
      userId,
      action: "sms_sandboxed",
      entity: "message",
      entityId: leadId || null,
      metadata: { to, source: source || "manual" },
    });
    await logEvent({
      userId,
      actionType: "SMS_SENT",
      req,
      metaData: {
        direction: "outbound",
        body,
        to,
        source: source || "manual",
        cost: 0,
        sandbox: true,
      },
    });
    return { sandbox: true };
  }

  const { data: agentRow, error: agentError } = await supabaseAdmin
    .from("agents")
    .select("phone_number")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .maybeSingle();
  if (agentError || !agentRow?.phone_number) {
    throw new Error("Agent phone number not found");
  }
  const payload = { to, body, from_number: agentRow.phone_number };
  const retellResponse = await retellSmsClient.post("/sms", payload);

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
  await logEvent({
    userId,
    actionType: "SMS_SENT",
    req,
    metaData: {
      direction: "outbound",
      body,
      to,
      source: source || "manual",
      cost: retellResponse.data?.cost || retellResponse.data?.cost_cents || null,
    },
  });

  return retellResponse.data;
};

const sendSmsFromAgent = async ({ agentId, to, body, userId, source }) => {
  if (!agentId || !to || !body) {
    throw new Error("agentId, to, and body are required");
  }
  const { data: agentRow, error: agentError } = await supabaseAdmin
    .from("agents")
    .select("phone_number, user_id")
    .eq("agent_id", agentId)
    .maybeSingle();
  if (agentError || !agentRow?.phone_number) {
    throw new Error("Agent phone number not found");
  }

  if (String(RETELL_SMS_SANDBOX || "").toLowerCase() === "true") {
    await supabaseAdmin.from("messages").insert({
      user_id: userId || agentRow.user_id,
      lead_id: null,
      direction: "outbound",
      body,
    });
    await auditLog({
      userId: userId || agentRow.user_id,
      action: "sms_sandboxed",
      entity: "message",
      entityId: agentId,
      metadata: { to, source: source || "agent_tool" },
    });
    await logEvent({
      userId: userId || agentRow.user_id,
      actionType: "SMS_SENT",
      metaData: {
        direction: "outbound",
        body,
        to,
        source: source || "agent_tool",
        cost: 0,
        sandbox: true,
      },
    });
    return { sandbox: true };
  }

  const payload = {
    to,
    body,
    from_number: agentRow.phone_number,
  };
  const retellResponse = await retellSmsClient.post("/sms", payload);

  await supabaseAdmin.from("messages").insert({
    user_id: userId || agentRow.user_id,
    lead_id: null,
    direction: "outbound",
    body,
  });
  await auditLog({
    userId: userId || agentRow.user_id,
    action: "sms_sent",
    entity: "message",
    entityId: agentId,
    metadata: { to, source: source || "agent_tool" },
  });
  await logEvent({
    userId: userId || agentRow.user_id,
    actionType: "SMS_SENT",
    metaData: {
      direction: "outbound",
      body,
      to,
      source: source || "agent_tool",
      cost: retellResponse.data?.cost || retellResponse.data?.cost_cents || null,
    },
  });

  return retellResponse.data;
};

const sendBookingAlert = async (userEmail, appointment) => {
  if (!resend || !userEmail || !appointment?.id) return;
  const appointmentDate =
    appointment.start_time?.slice(0, 10) ||
    appointment.start_date ||
    new Date().toISOString().slice(0, 10);
  const deepLink = `${appBaseUrl}/calendar?date=${appointmentDate}&appointmentId=${appointment.id}`;
  const customerName = appointment.customer_name || "Customer";
  const formatDateTime = (value) =>
    value
      ? new Date(value).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "TBD";
  const duration = appointment.duration_minutes
    ? `${appointment.duration_minutes} min`
    : "60 min";
  const jobValue =
    appointment.job_value && Number(appointment.job_value)
      ? `$${Number(appointment.job_value).toLocaleString()}`
      : "Not set";
  const detailRows = [
    { label: "Customer", value: customerName },
    {
      label: "When",
      value: formatDateTime(appointment.start_time || appointment.start_date),
    },
    { label: "Location", value: appointment.location || "Location TBD" },
    { label: "Phone", value: appointment.customer_phone || "—" },
    { label: "Duration", value: duration },
    { label: "Job Value", value: jobValue },
    { label: "Status", value: (appointment.status || "Booked").toUpperCase() },
  ]
    .map(
      (row) =>
        `<tr><td style="padding:4px 8px;color:#475569;font-weight:600;">${row.label}</td><td style="padding:4px 8px;color:#0f172a;">${row.value}</td></tr>`
    )
    .join("");
  const notes = appointment.notes ? appointment.notes : "No additional notes.";
  await resend.emails.send({
    from: "Kryonex Alerts <alerts@kryonextech.com>",
    to: userEmail,
    subject: `New Appointment: ${customerName}`,
    html: `
      <div style="font-family: 'Inter', system-ui, sans-serif; color: #0f172a; background:#f8fafc; padding:24px; border-radius:20px;">
        <h2 style="margin: 0 0 8px; color:#0f172a;">Manifest: ${customerName}</h2>
        <p style="margin:0 0 18px; color:#475569;">The job has been booked and is now visible inside your Kryonex Command Deck.</p>
        <table cellspacing="0" cellpadding="0" style="width:100%; border-collapse:collapse; background:#fff; border-radius:12px; overflow:hidden; border:1px solid rgba(15,23,42,0.08);">
          ${detailRows}
        </table>
        <p style="margin:12px 0 20px; color:#475569;"><strong>Notes:</strong> ${notes}</p>
        <a href="${deepLink}" style="display:inline-block;padding:14px 22px;background:#0f172a;color:#f8fafc;text-decoration:none;border-radius:10px;font-weight:700;">
          Open Daily Manifest
        </a>
      </div>
    `,
  });
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
              await logEvent({
                userId,
                actionType: "STRIPE_CHARGE_SUCCEEDED",
                req,
                metaData: {
                  transaction_id: session.id,
                  amount: (session.amount_total || 0) / 100,
                  status: session.status,
                  type: "topup",
                },
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
              await logEvent({
                userId,
                actionType: "PLAN_UPGRADED",
                req,
                metaData: {
                  transaction_id: session.id,
                  status: subscription.status,
                  plan_type:
                    session.metadata?.plan_type ||
                    subscription.items.data?.[0]?.price?.nickname ||
                    null,
                },
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
            await logEvent({
              userId: subRow.user_id,
              actionType: "STRIPE_CHARGE_FAILED",
              req,
              metaData: {
                transaction_id: invoice.id,
                amount: (invoice.amount_due || 0) / 100,
                status: invoice.status,
                error_code: invoice.last_payment_error?.code || null,
              },
            });
          }
        }

        if (event.type === "invoice.payment_succeeded") {
          const invoice = event.data.object;
          const userId = await lookupUserIdByCustomerId(invoice.customer);
          if (userId) {
            await logEvent({
              userId,
              actionType: "STRIPE_CHARGE_SUCCEEDED",
              req,
              metaData: {
                transaction_id: invoice.id,
                amount: (invoice.amount_paid || 0) / 100,
                status: invoice.status,
              },
            });
          }
        }

        if (event.type === "payment_method.attached") {
          const paymentMethod = event.data.object;
          const userId = await lookupUserIdByCustomerId(paymentMethod.customer);
          if (userId) {
            await logEvent({
              userId,
              actionType: "CARD_UPDATED",
              req,
              metaData: {
                payment_method_id: paymentMethod.id,
                brand: paymentMethod.card?.brand || null,
                last4: paymentMethod.card?.last4 || null,
              },
            });
          }
        }

        if (event.type === "customer.updated") {
          const customer = event.data.object;
          const userId = await lookupUserIdByCustomerId(customer.id);
          if (userId && customer?.invoice_settings?.default_payment_method) {
            await logEvent({
              userId,
              actionType: "CARD_UPDATED",
              req,
              metaData: {
                payment_method_id:
                  customer.invoice_settings.default_payment_method || null,
              },
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
  baseURL: "https://api.retellai.com",
  headers: {
    Authorization: `Bearer ${RETELL_API_KEY}`,
    "Content-Type": "application/json",
  },
});

const retellSmsClient = axios.create({
  baseURL: "https://api.retellai.com",
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
  call_300: {
    priceId: STRIPE_TOPUP_CALL_300,
    call_seconds: 300 * 60,
    sms_count: 0,
  },
  call_800: {
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
  scale: { price: STRIPE_PRICE_ID_SCALE, call_seconds: 0, sms: 0 },
};

const resolveTopup = (type) => topupCatalog[type] || null;

const planConfig = (planType) => {
  const plan = (planType || "").toLowerCase();
  if (plan.includes("scale") || plan.includes("white_glove")) {
    return { call_minutes: 3000, sms_count: 5000, grace_seconds: 600 };
  }
  if (plan.includes("elite")) {
    return { call_minutes: 1200, sms_count: 2000, grace_seconds: 600 };
  }
  if (plan.includes("pro")) {
    return { call_minutes: 500, sms_count: 800, grace_seconds: 600 };
  }
  if (plan.includes("core") || plan.includes("starter")) {
    return { call_minutes: 150, sms_count: 250, grace_seconds: 600 };
  }
  return { call_minutes: 150, sms_count: 250, grace_seconds: 600 };
};

const planPriceId = (planTier) => {
  const tier = (planTier || "").toLowerCase();
  if (tier === "scale") {
    return STRIPE_PRICE_ID_SCALE;
  }
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

const getDashboardStats = async (userId) => {
  const avgJobValue = 450;
  const { count: totalLeads, error: totalError } = await supabaseAdmin
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (totalError) {
    throw totalError;
  }

  const { count: bookedLeads, error: bookedError } = await supabaseAdmin
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("status", ["booked", "confirmed"]);

  if (bookedError) {
    throw bookedError;
  }

  let bookedAppointments = 0;
  let jobSum = 0;
  try {
    const { data: appointmentRows, error: appointmentError } = await supabaseAdmin
      .from("appointments")
      .select("job_value")
      .eq("user_id", userId)
      .in("status", ["booked", "confirmed"]);

    if (appointmentError) {
      throw appointmentError;
    }
    const rows = appointmentRows || [];
    bookedAppointments = rows.length;
    jobSum = rows.reduce((sum, row) => {
      const value = Number(row.job_value);
      return sum + (Number.isFinite(value) && value > 0 ? value : avgJobValue);
    }, 0);
  } catch (err) {
    bookedAppointments = 0;
    jobSum = 0;
  }

  const bookedTotal = bookedAppointments || bookedLeads || 0;
  const pipelineValue = jobSum || bookedTotal * avgJobValue;

  return {
    total_leads: totalLeads || 0,
    booked_leads: bookedTotal,
    booked_appointments: bookedAppointments || 0,
    call_volume: totalLeads || 0,
    pipeline_value: pipelineValue,
    avg_job_value: avgJobValue,
  };
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
    const bearerToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;
    const queryToken =
      typeof req.query.access_token === "string"
        ? req.query.access_token
        : typeof req.query.accessToken === "string"
        ? req.query.accessToken
        : null;
    const token = bearerToken || queryToken;

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

const pickLlmVersion = (industry) => {
  if (industry && industry.toLowerCase().includes("plumb")) {
    return RETELL_LLM_VERSION_PLUMBING;
  }
  return RETELL_LLM_VERSION_HVAC;
};

const pickMasterAgentId = (industry) => {
  if (industry && industry.toLowerCase().includes("plumb")) {
    return null;
  }
  return RETELL_MASTER_AGENT_ID_HVAC;
};

const normalizeRetellAgent = (payload) =>
  payload?.agent || payload?.data?.agent || payload?.data || payload;

const extractToolPayload = (payload) => {
  const toolPayload = {};
  const rawTools =
    payload?.tools ||
    payload?.tool_definitions ||
    payload?.tool_calls ||
    payload?.functions ||
    null;
  if (Array.isArray(rawTools)) {
    toolPayload.tools = rawTools;
  }
  if (payload?.post_call_analysis) {
    toolPayload.post_call_analysis = payload.post_call_analysis;
  }
  if (payload?.post_call_analysis_data) {
    toolPayload.post_call_analysis_data = payload.post_call_analysis_data;
  }
  if (payload?.post_call_analysis_model) {
    toolPayload.post_call_analysis_model = payload.post_call_analysis_model;
  }
  return { toolPayload, toolCount: Array.isArray(rawTools) ? rawTools.length : 0 };
};

const fetchLlmTools = async ({ llmId, llmVersion }) => {
  if (!llmId) return null;
  const attempts = [
    { path: `/get-llm/${llmId}` },
    { path: `/get-llm?llm_id=${encodeURIComponent(llmId)}` },
    llmVersion
      ? { path: `/get-llm?llm_id=${encodeURIComponent(llmId)}&llm_version=${encodeURIComponent(llmVersion)}` }
      : null,
    llmVersion
      ? { path: `/get-llm-version/${encodeURIComponent(llmId)}/${encodeURIComponent(llmVersion)}` }
      : null,
    llmVersion
      ? { path: `/get-llm-version/${encodeURIComponent(llmVersion)}` }
      : null,
  ].filter(Boolean);

  for (const attempt of attempts) {
    try {
      const res = await retellClient.get(attempt.path);
      const payload = res?.data?.llm || res?.data?.data || res?.data || null;
      if (payload) {
        return { payload, source: attempt.path };
      }
    } catch (err) {
      // try next
    }
  }
  return null;
};

const applyMasterAgentTools = async ({ industry, agentId, llmId, llmVersion }) => {
  const masterAgentId = pickMasterAgentId(industry);
  if (!masterAgentId) return { masterAgentId: null, toolCount: 0 };
  try {
    const masterResponse = await retellClient.get(
      `/get-agent/${masterAgentId}`
    );
    const master = normalizeRetellAgent(masterResponse.data);
    const masterKeys = master ? Object.keys(master) : [];
    let { toolPayload, toolCount } = extractToolPayload(master);

    if (!Object.keys(toolPayload).length) {
      const llmTools = await fetchLlmTools({ llmId, llmVersion });
      if (llmTools?.payload) {
        const llmKeys = Object.keys(llmTools.payload || {});
        const extracted = extractToolPayload(llmTools.payload);
        toolPayload = extracted.toolPayload;
        toolCount = extracted.toolCount;
        if (!Object.keys(toolPayload).length) {
          console.warn("[retell] no tools on llm payload", {
            master_agent_id: masterAgentId,
            llm_id: llmId,
            llm_version: llmVersion || null,
            llm_keys: llmKeys,
            llm_source: llmTools.source,
          });
          return { masterAgentId, toolCount };
        }
      } else {
        console.warn("[retell] master agent has no tools", {
          master_agent_id: masterAgentId,
          master_keys: masterKeys,
        });
        return { masterAgentId, toolCount };
      }
    }
    await retellClient.patch(`/update-agent/${agentId}`, toolPayload);
    return { masterAgentId, toolCount };
  } catch (err) {
    console.warn(
      "[retell] unable to copy master tools",
      err.response?.data || err.message
    );
    return { masterAgentId, toolCount: 0, error: err.message };
  }
};

const normalizeToolPayload = (payload) => {
  if (!payload) return null;
  if (payload.tool_call) return payload.tool_call;
  if (payload.tool_calls && Array.isArray(payload.tool_calls)) return payload.tool_calls;
  if (payload.data?.tool_call) return payload.data.tool_call;
  if (payload.data?.tool_calls) return payload.data.tool_calls;
  return null;
};

const interpolateTemplate = (template, variables = {}) => {
  if (!template) return "";
  return String(template).replace(
    /\{\{\s*([\w.]+)\s*\}\}|\{([\w.]+)\}/g,
    (match, group1, group2) => {
      const key = group1 || group2;
      const value = variables[key];
      return value === undefined || value === null ? match : String(value);
    }
  );
};

const toSafeString = (value, fallback = "") => {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text.length ? text : fallback;
};

const formatMoney = (value, fallback = "Not provided") => {
  if (value === undefined || value === null || value === "") return fallback;
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return num % 1 === 0 ? String(num) : num.toFixed(2);
};

const normalizePromptMode = (mode, industry) => {
  const normalized = String(mode || "").toLowerCase().trim();
  if (normalized === "template") return "template";
  if (normalized === "hvac" || normalized === "plumbing") return normalized;
  if (industry && industry.toLowerCase().includes("plumb")) return "plumbing";
  return "hvac";
};

const buildTravelInstruction = ({
  dispatchBaseLocation,
  travelLimitValue,
  travelLimitMode,
}) => {
  const baseInput = toSafeString(dispatchBaseLocation, "");
  if (!baseInput) return "";
  const isZipBase = /^\d{5}$/.test(baseInput);
  const travelValue = Number(travelLimitValue);
  if (!Number.isFinite(travelValue) || travelValue <= 0) return "";
  const travelMode =
    String(travelLimitMode || "").toLowerCase() === "miles" ? "miles" : "minutes";
  return `Your Dispatch Base is ${
    isZipBase ? `the center of Zip Code ${baseInput}` : baseInput
  }. The client's strict travel limit is ${travelValue} ${travelMode}. Estimate the travel effort from that ${
    isZipBase ? "Zip Code center" : "location"
  }. If the customer is too far, decline.`;
};

const getBackendPromptAllowlist = () =>
  String(RETELL_BACKEND_PROMPT_ALLOWLIST || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

const shouldUseBackendPrompt = ({ userId, industry }) => {
  const enabled = String(RETELL_USE_BACKEND_PROMPT || "").toLowerCase() === "true";
  if (!enabled) return false;
  const allowlist = getBackendPromptAllowlist();
  if (!allowlist.length) return true;
  return allowlist.includes(String(userId || "").trim());
};

const buildHvacPrompt = ({
  businessName,
  agentTone,
  scheduleSummary,
  standardFee,
  emergencyFee,
  transferNumber,
  travelInstruction,
}) => {
  const standardFeeText =
    standardFee === "Not provided" ? "Not provided" : `$${standardFee}`;
  const emergencyFeeText =
    emergencyFee === "Not provided" ? "Not provided" : `$${emergencyFee}`;
  const transferLine = transferNumber
    ? `- If a human transfer is required, transfer to ${transferNumber}.`
    : null;
  const travelLine = travelInstruction
    ? `- Travel limits: ${travelInstruction}`
    : null;

  return `IDENTITY:
Your name is Grace.
You are the semantic authority for inbound call traffic for ${businessName}.

TONE & PERSONALITY:
You have been configured to speak with a ${agentTone} tone.
Adhere strictly to this personality setting while maintaining operational efficiency.

You are not a chatbot.
You are not a standard assistant.
You operate as the operational HVAC dispatch layer for ${businessName}.

--------------------------------------------------

1. STATIC IDENTITY RULE (HVAC OPERATIONS)

You operate exclusively as the HVAC Dispatch for ${businessName}.
You do not handle Plumbing.
You do not handle Electrical.

If the caller mentions "Heating", "Cooling", "Furnace", "AC", "Boiler", or "Thermostat", you proceed immediately to Triage.

--------------------------------------------------

2. KNOWLEDGE BASE AUTHORITY (MANDATORY PRECEDENCE)

You have access to authoritative internal knowledge base files:
- Category_Commands_Confirmations
- Emergency_Protocol
- Emergency_Trigger_Dictionary
- Recovery_Scripts

RULES:
- Before processing ANY user input, you must internally consult the relevant file(s).
- If a procedure, phrase, confirmation, or recovery rule exists in the files, you MUST use it verbatim.
- Audio recognition is imperfect. The knowledge base is ground truth.

--------------------------------------------------

3. SEMANTIC NORMALIZATION & PHONETIC RESOLUTION

Before interpreting meaning, normalize speech internally using patterns defined in:
- Category_Commands_Confirmations
- Recovery_Scripts

If a known phonetic or semantic ambiguity exists:
- Resolve silently using the knowledge base.
- If ambiguity remains, enter confirmation mode instead of guessing.

--------------------------------------------------

4. INTELLIGENCE LAYER — WATERFALL LOGIC (HVAC SPECIFIC)

Urgency evaluation follows strict top-down execution:

1. SAFETY FIRST
   Detect infants, elderly, disabled, or medically vulnerable individuals inside the home (Critical for No Heat/No Cool scenarios).

2. EMERGENCY SCAN (RED LIST)
   Consult Emergency_Trigger_Dictionary.
   If a trigger is matched:
   - "Gas Smell" / "Rotten Eggs"
   - "Carbon Monoxide Alarm"
   - "Sparks" / "Smoke" from unit
   - "No Heat" AND "Freezing Temperatures" (Below 50°F inside)
   → Immediately mark High Urgency.

3. PHYSICS SANITY CHECK
   If a claim violates physical reality:
   Pause and clarify plainly.

When High Urgency is confirmed:
- Suspend non-essential data collection.
- Follow Emergency_Protocol exactly.
- Tell user: "Please turn off the system or thermostat immediately to prevent further damage." (If electrical/smoke).
- Tell user: "Evacuate and call 911." (If Gas/CO).

--------------------------------------------------

5. TRIAGE LOGIC (YELLOW LIST)

If no Emergency Trigger is found, assess Urgency based on Temperature & Vulnerability:

SCENARIO A: COOLING (AC / NOT COOLING)
- ASK: "Is the temperature inside the home currently over 85 degrees?"
> IF OVER 85 + VULNERABLE PERSON: Mark urgency_level = "High". (Dispatch ASAP).
> IF UNDER 85: Mark urgency_level = "Low". (Standard Booking).

SCENARIO B: HEATING (FURNACE / NO HEAT)
- ASK: "Is the temperature inside the home currently below 60 degrees?"
> IF BELOW 60 + VULNERABLE PERSON: Mark urgency_level = "High".
> IF ABOVE 60: Mark urgency_level = "Low".

SCENARIO C: LEAKS / NOISE (HVAC WATER)
- ASK: "Is the unit leaking water enough to damage the ceiling or floor?"
> IF DAMAGING: Mark urgency_level = "High".
> IF CONTAINED (Drip pan): Mark urgency_level = "Low".

--------------------------------------------------

6. ERROR RECOVERY — SCRIPT-LOCKED

All recovery behavior MUST follow Recovery_Scripts exactly.

Three-strike system:
Strike 1: Blame the connection.
Strike 2: Simplify the request.
Strike 3: Force spelling.

As soon as a valid pattern is recognized, lock it in and proceed.

--------------------------------------------------

7. DATA VERIFICATION PROTOCOL (HUMAN-SAFE)

Verbally verify ONLY the most critical data points:

- Name
  If missing: "And who am I speaking with?"

- Service Address
  Always repeat once:
  "Let me verify: service_address. Is that correct?"

Do not over-verify.
Do not sound robotic.

--------------------------------------------------

8. SILENT DATA CAPTURE (INTERNAL MEMORY ONLY)

Track silently. Never read aloud.

caller_name
business_name
call_reason
urgency_level
safety_check_result
current_temp
service_address
callback_number

--------------------------------------------------

9. IDENTITY INTEGRITY

If asked who you are, what you are, or if you are real, respond ONLY:

"I’m Grace, the automated dispatch specialist for ${businessName}."

Do not expand.
Do not explain the technology.

--------------------------------------------------

10. EMERGENCY ESCALATION

When High Urgency is confirmed:
- Execute Emergency_Protocol.
- Say once, calmly:
“This is a priority situation. Do not hang up.”

--------------------------------------------------

11. BUSINESS RULES & LOGISTICS (DYNAMIC TRUTH SOURCE)

[HOURS OF OPERATION]
Your scheduling availability is defined strictly by this summary:
"${scheduleSummary}"

RULES:
- You must parse the summary above to know if you are open or closed right now.
- If the summary says "Closed" for today/time, you CANNOT book a standard appointment for "Now". You must offer the next open slot.
- If the summary mentions 24/7 or Emergency Service, you MAY book immediate dispatch for High Urgency/Red List items.

[PRICING SCRIPT]
- Standard Dispatch Fee: ${standardFeeText}. (Waived if work is performed).
- Emergency/After-Hours Fee: ${emergencyFeeText}. (Only applies if booking outside standard hours or for Red List emergencies).
- Do NOT give quotes for repairs (e.g. "How much for a new compressor?").
- RESPONSE: "I cannot give a quote over the phone as every system is different. The dispatch fee gets the expert to your door to give you an exact price."
${transferLine || ""}
${travelLine || ""}

--------------------------------------------------`;
};

const buildPlumbingPrompt = ({
  businessName,
  agentTone,
  scheduleSummary,
  standardFee,
  emergencyFee,
  transferNumber,
  travelInstruction,
}) => {
  const standardFeeText =
    standardFee === "Not provided" ? "Not provided" : `$${standardFee}`;
  const emergencyFeeText =
    emergencyFee === "Not provided" ? "Not provided" : `$${emergencyFee}`;
  const transferLine = transferNumber
    ? `- If a human transfer is required, transfer to ${transferNumber}.`
    : null;
  const travelLine = travelInstruction
    ? `- Travel limits: ${travelInstruction}`
    : null;

  return `IDENTITY:
Your name is Grace.
You are the semantic authority for inbound call traffic for ${businessName}.

TONE & PERSONALITY:
You have been configured to speak with a ${agentTone} tone.
Adhere strictly to this personality setting while maintaining operational efficiency.

You are not a chatbot.
You are not a standard assistant.
You operate as the operational plumbing dispatch layer for ${businessName}.

--------------------------------------------------

1. STATIC IDENTITY RULE (PLUMBING OPERATIONS)

You operate exclusively as the Plumbing Dispatch for ${businessName}.
You do not handle HVAC.
You do not handle Electrical.

If the caller mentions "Leak", "Clog", "Drain", "Water Heater", or "Sewage", you proceed immediately to Triage.

--------------------------------------------------

2. KNOWLEDGE BASE AUTHORITY (MANDATORY PRECEDENCE)

You have access to authoritative internal knowledge base files:
- Category_Commands_Confirmations
- Emergency_Protocol
- Emergency_Trigger_Dictionary
- Recovery_Scripts

RULES:
- Before processing ANY user input, you must internally consult the relevant file(s).
- If a procedure, phrase, confirmation, or recovery rule exists in the files, you MUST use it verbatim.
- Audio recognition is imperfect. The knowledge base is ground truth.

--------------------------------------------------

3. SEMANTIC NORMALIZATION & PHONETIC RESOLUTION

Before interpreting meaning, normalize speech internally using patterns defined in:
- Category_Commands_Confirmations
- Recovery_Scripts

If a known phonetic or semantic ambiguity exists:
- Resolve silently using the knowledge base.
- If ambiguity remains, enter confirmation mode instead of guessing.

--------------------------------------------------

4. INTELLIGENCE LAYER — WATERFALL LOGIC (PLUMBING SPECIFIC)

Urgency evaluation follows strict top-down execution:

1. SAFETY FIRST
   Detect infants, elderly, disabled, or medically vulnerable individuals inside the home (especially relevant for no water/sewage backup).

2. EMERGENCY SCAN (RED LIST)
   Consult Emergency_Trigger_Dictionary.
   If a trigger is matched:
   - "Gas Smell" (from Water Heater)
   - "Uncontrolled Flooding" (Main line burst)
   - "Sewage Backup" (Health Hazard inside home)
   → Immediately mark High Urgency.

3. PHYSICS SANITY CHECK
   If a claim violates physical reality:
   Pause and clarify plainly.

When High Urgency is confirmed:
- Suspend non-essential data collection.
- Follow Emergency_Protocol exactly.
- Tell user: "Please turn off the main water valve immediately." (If flooding).

--------------------------------------------------

5. TRIAGE LOGIC (YELLOW LIST)

If no Emergency Trigger is found, assess Urgency based on containment:

SCENARIO A: LEAKS
- ASK: "Is the water actively pouring onto the floor right now, or is it contained in a bucket or sink?"
> IF POURING: Mark urgency_level = "High". (Dispatch ASAP).
> IF CONTAINED: Mark urgency_level = "Low". (Standard Booking).

SCENARIO B: DRAINS / TOILETS
- ASK: "Is this backing up into the bathtub/shower, or is it just one slow drain?"
> IF BACKING UP / WHOLE HOUSE STOPPED: Mark urgency_level = "High".
> IF ONE DRAIN: Mark urgency_level = "Low".

SCENARIO C: WATER HEATERS
- ASK: "Do you have absolutely NO hot water, or is it just running out quickly?"
> IF NO HOT WATER: Mark urgency_level = "High".
> IF RUNNING OUT: Mark urgency_level = "Low".

--------------------------------------------------

6. ERROR RECOVERY — SCRIPT-LOCKED

All recovery behavior MUST follow Recovery_Scripts exactly.

Three-strike system:
Strike 1: Blame the connection.
Strike 2: Simplify the request.
Strike 3: Force spelling.

As soon as a valid pattern is recognized, lock it in and proceed.

--------------------------------------------------

7. DATA VERIFICATION PROTOCOL (HUMAN-SAFE)

Verbally verify ONLY the most critical data points:

- Name
  If missing: "And who am I speaking with?"

- Service Address
  Always repeat once:
  "Let me verify: service_address. Is that correct?"

Do not over-verify.
Do not sound robotic.

--------------------------------------------------

8. SILENT DATA CAPTURE (INTERNAL MEMORY ONLY)

Track silently. Never read aloud.

caller_name
business_name
call_reason
urgency_level
safety_check_result
active_leak_status
service_address
callback_number

--------------------------------------------------

9. IDENTITY INTEGRITY

If asked who you are, what you are, or if you are real, respond ONLY:

"I’m Grace, the automated dispatch specialist for ${businessName}."

Do not expand.
Do not explain the technology.

--------------------------------------------------

10. EMERGENCY ESCALATION

When High Urgency is confirmed:
- Execute Emergency_Protocol.
- Say once, calmly:
“This is a priority situation. Do not hang up.”

--------------------------------------------------

11. BUSINESS RULES & LOGISTICS (DYNAMIC TRUTH SOURCE)

[HOURS OF OPERATION]
Your scheduling availability is defined strictly by this summary:
"${scheduleSummary}"

RULES:
- You must parse the summary above to know if you are open or closed right now.
- If the summary says "Closed" for today/time, you CANNOT book a standard appointment for "Now". You must offer the next open slot.
- If the summary mentions 24/7 or Emergency Service, you MAY book immediate dispatch for High Urgency/Red List items.

[PRICING SCRIPT]
- Standard Dispatch Fee: ${standardFeeText}. (Waived if work is performed).
- Emergency/After-Hours Fee: ${emergencyFeeText}. (Only applies if booking outside standard hours or for Red List emergencies).
- Do NOT give quotes for repairs (e.g. "How much for a water heater?").
- RESPONSE: "I cannot give a quote over the phone as every home is different. The dispatch fee gets the expert to your door to give you an exact price."
${transferLine || ""}
${travelLine || ""}

--------------------------------------------------`;
};

const buildDispatchPrompt = ({
  mode,
  businessName,
  agentTone,
  scheduleSummary,
  standardFee,
  emergencyFee,
  transferNumber,
  travelInstruction,
  industry,
}) => {
  const normalizedMode = normalizePromptMode(mode, industry);
  const resolvedBusiness = toSafeString(businessName, "your business");
  const resolvedTone = toSafeString(agentTone, "Calm & Professional");
  const resolvedSchedule = toSafeString(scheduleSummary, "Not provided");
  const resolvedStandardFee = formatMoney(standardFee);
  const resolvedEmergencyFee = formatMoney(emergencyFee);
  const resolvedTransfer = toSafeString(transferNumber, "");
  const resolvedTravelInstruction = toSafeString(travelInstruction, "");

  if (normalizedMode === "plumbing") {
    return buildPlumbingPrompt({
      businessName: resolvedBusiness,
      agentTone: resolvedTone,
      scheduleSummary: resolvedSchedule,
      standardFee: resolvedStandardFee,
      emergencyFee: resolvedEmergencyFee,
      transferNumber: resolvedTransfer,
      travelInstruction: resolvedTravelInstruction,
    });
  }

  return buildHvacPrompt({
    businessName: resolvedBusiness,
    agentTone: resolvedTone,
    scheduleSummary: resolvedSchedule,
    standardFee: resolvedStandardFee,
    emergencyFee: resolvedEmergencyFee,
    transferNumber: resolvedTransfer,
    travelInstruction: resolvedTravelInstruction,
  });
};

const parseToolArgs = (raw) => {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const resolveToolAppointmentWindow = ({ start_date, start_time, start_time_iso, duration_minutes }) => {
  if (start_time_iso) {
    const start = new Date(start_time_iso);
    const duration = parseInt(duration_minutes || "60", 10);
    const end = new Date(start.getTime() + duration * 60000);
    return { start, end };
  }
  if (start_date && start_time) {
    const [year, month, day] = String(start_date).split("-").map(Number);
    const [hour, minute] = String(start_time).split(":").map(Number);
    const start = new Date(year, month - 1, day, hour, minute);
    const duration = parseInt(duration_minutes || "60", 10);
    const end = new Date(start.getTime() + duration * 60000);
    return { start, end };
  }
  return { start: null, end: null };
};

const CAL_API_VERSION_SLOTS = "2024-09-04";
const CAL_API_VERSION_BOOKINGS = "2024-08-13";
const CAL_API_VERSION_EVENT_TYPES = "2024-08-13";
const calClient = axios.create({ baseURL: "https://api.cal.com/v2" });

const getCalIntegration = async (userId) => {
  const { data } = await supabaseAdmin
    .from("integrations")
    .select("access_token, refresh_token, expires_at, is_active")
    .eq("user_id", userId)
    .eq("provider", "calcom")
    .maybeSingle();
  if (!data?.is_active || !data?.access_token) return null;
  return {
    ...data,
    access_token: decryptCalcomToken(data.access_token),
    refresh_token: decryptCalcomToken(data.refresh_token),
  };
};

const getCalConfig = async (userId) => {
  const [{ data: profile }, integration] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select(
        "cal_api_key, cal_event_type_id, cal_time_zone, cal_event_type_slug, cal_username, cal_team_slug, cal_organization_slug"
      )
      .eq("user_id", userId)
      .maybeSingle(),
    getCalIntegration(userId),
  ]);
  const hasToken = Boolean(integration?.access_token || profile?.cal_api_key);
  if (!hasToken) return null;
  return {
    ...profile,
    cal_access_token: integration?.access_token || null,
  };
};

const fetchCalSlots = async ({ config, start, end, durationMinutes }) => {
  const params = {
    start: start.toISOString(),
    end: end.toISOString(),
    timeZone: config.cal_time_zone || "UTC",
    format: "range",
  };
  if (durationMinutes) params.duration = durationMinutes;
  if (config.cal_event_type_id) {
    params.eventTypeId = config.cal_event_type_id;
  } else if (config.cal_event_type_slug && config.cal_username) {
    params.eventTypeSlug = config.cal_event_type_slug;
    params.username = config.cal_username;
    if (config.cal_organization_slug) {
      params.organizationSlug = config.cal_organization_slug;
    }
    if (config.cal_team_slug) {
      params.teamSlug = config.cal_team_slug;
    }
  } else {
    throw new Error("Cal.com event type is not configured");
  }

  const response = await calClient.get("/slots", {
    params,
    headers: {
      Authorization: `Bearer ${config.cal_access_token || config.cal_api_key}`,
      "cal-api-version": CAL_API_VERSION_SLOTS,
    },
  });
  return response.data?.data || {};
};

const createCalBooking = async ({ config, start, args }) => {
  const body = {
    start: start.toISOString(),
    attendee: {
      name: args.customer_name || args.name || "Customer",
      email: args.customer_email || args.email || "unknown@kryonex.local",
      timeZone: args.time_zone || config.cal_time_zone || "UTC",
      phoneNumber: args.customer_phone || args.phone || null,
    },
    eventTypeId: config.cal_event_type_id || undefined,
    eventTypeSlug: config.cal_event_type_slug || undefined,
    username: config.cal_username || undefined,
    teamSlug: config.cal_team_slug || undefined,
    organizationSlug: config.cal_organization_slug || undefined,
    bookingFieldsResponses: args.booking_fields || undefined,
    metadata: {
      source: "retell_tool",
      lead_id: args.lead_id || null,
    },
    lengthInMinutes: args.duration_minutes
      ? Number(args.duration_minutes)
      : undefined,
  };

  const response = await calClient.post("/bookings", body, {
    headers: {
      Authorization: `Bearer ${config.cal_access_token || config.cal_api_key}`,
      "cal-api-version": CAL_API_VERSION_BOOKINGS,
      "Content-Type": "application/json",
    },
  });
  return response.data?.data || response.data;
};

const handleToolCall = async ({ tool, agentId, userId }) => {
  const toolName = tool?.name || tool?.tool_name || tool?.function?.name;
  const args = parseToolArgs(tool?.arguments || tool?.args || tool?.function?.arguments);
  if (!toolName) return { ok: false, error: "Missing tool name" };

  if (toolName === "check_calendar_availability") {
    const { start, end } = resolveToolAppointmentWindow(args);
    if (!start || !end) {
      return { ok: false, error: "Missing start time" };
    }
    const calConfig = await getCalConfig(userId);
    if (calConfig) {
      const slots = await fetchCalSlots({
        config: calConfig,
        start,
        end,
        durationMinutes: args.duration_minutes,
      });
      const hasSlots = Object.keys(slots || {}).length > 0;
      return { ok: true, source: "cal.com", available: hasSlots, slots };
    }
    const { data, error } = await supabaseAdmin
      .from("appointments")
      .select("id,start_time,end_time")
      .eq("user_id", userId)
      .lt("start_time", end.toISOString())
      .gt("end_time", start.toISOString());
    if (error) return { ok: false, error: error.message };
    const conflicts = data || [];
    return { ok: true, available: conflicts.length === 0, conflicts };
  }

  if (toolName === "book_appointment") {
    const { start, end } = resolveToolAppointmentWindow(args);
    if (!start || !end) {
      return { ok: false, error: "Missing start time" };
    }
    const calConfig = await getCalConfig(userId);
    if (calConfig) {
      const booking = await createCalBooking({ config: calConfig, start, args });
      await logEvent({
        userId,
        actionType: "APPOINTMENT_BOOKED",
        metaData: {
          booking_uid: booking?.uid || booking?.id || null,
          start: booking?.start || start.toISOString(),
          source: "cal.com",
        },
      });
      return { ok: true, source: "cal.com", booking };
    }
    const { data, error } = await supabaseAdmin
      .from("appointments")
      .insert({
        user_id: userId,
        customer_name: args.customer_name || "Customer",
        customer_phone: args.customer_phone || null,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        location: args.service_address || args.location || null,
        notes: args.service_issue || args.notes || null,
        status: "booked",
      })
      .select("*")
      .single();
    if (error) return { ok: false, error: error.message };
    await logEvent({
      userId,
      actionType: "APPOINTMENT_BOOKED",
      metaData: {
        appointment_id: data?.id || null,
        start: data?.start_time || start.toISOString(),
        source: "internal",
      },
    });
    return { ok: true, appointment: data };
  }

  if (toolName === "extract_dynamic_variable") {
    const leadId = args.lead_id || args.leadId || null;
    const customerPhone = args.customer_phone || args.phone || null;
    let leadRow = null;
    if (leadId) {
      const { data } = await supabaseAdmin
        .from("leads")
        .select("id, metadata")
        .eq("id", leadId)
        .maybeSingle();
      leadRow = data;
    } else if (customerPhone) {
      const { data } = await supabaseAdmin
        .from("leads")
        .select("id, metadata")
        .eq("user_id", userId)
        .eq("phone", customerPhone)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      leadRow = data;
    }

    if (!leadRow?.id) {
      return { ok: false, error: "Lead not found for dynamic variables" };
    }

    const currentMeta =
      leadRow.metadata && typeof leadRow.metadata === "object"
        ? leadRow.metadata
        : {};
    const updateMeta = {
      ...currentMeta,
      lead_notes: {
        ...(currentMeta.lead_notes || {}),
        ...args,
      },
    };
    await supabaseAdmin
      .from("leads")
      .update({ metadata: updateMeta })
      .eq("id", leadRow.id);
    await logEvent({
      userId,
      actionType: "DYNAMIC_VARIABLES_EXTRACTED",
      metaData: { lead_id: leadRow.id, variables: args },
    });
    return { ok: true, lead_id: leadRow.id };
  }

  return { ok: false, error: "Unknown tool" };
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

app.get("/api/calcom/authorize", requireAuth, (req, res) => {
  if (!CALCOM_CLIENT_ID) {
    return res.status(500).json({ error: "Missing CALCOM_CLIENT_ID" });
  }
  const state = signCalcomState({
    userId: req.user.id,
    ts: Date.now(),
  });
  const params = new URLSearchParams({
    client_id: CALCOM_CLIENT_ID,
    redirect_uri: calcomRedirectUri,
    response_type: "code",
    state,
  });
  return res.redirect(
    `https://app.cal.com/auth/oauth2/authorize?${params.toString()}`
  );
});

app.get("/api/calcom/callback", async (req, res) => {
  const code = req.query.code;
  const state = req.query.state;
  if (!code) {
    return res.status(400).send("Missing code");
  }
  if (!CALCOM_CLIENT_ID || !CALCOM_CLIENT_SECRET) {
    return res.status(500).send("Missing Cal.com OAuth credentials");
  }
  if (!CALCOM_ENCRYPTION_KEY) {
    return res.status(500).send("Missing CALCOM_ENCRYPTION_KEY");
  }
  const stateData = verifyCalcomState(state);
  if (!stateData?.userId) {
    return res.status(400).send("Invalid state");
  }
  try {
    const tokenResponse = await axios.post(
      "https://app.cal.com/api/auth/oauth/token",
      {
        code,
        client_id: CALCOM_CLIENT_ID,
        client_secret: CALCOM_CLIENT_SECRET,
        grant_type: "authorization_code",
        redirect_uri: calcomRedirectUri,
      }
    );
    const accessToken = tokenResponse.data?.access_token;
    const refreshToken = tokenResponse.data?.refresh_token;
    if (!accessToken) {
      throw new Error("Missing access token");
    }
    let eventType = null;
    let bookingUrl = null;
    try {
      const eventTypesResponse = await calClient.get("/event-types", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "cal-api-version": CAL_API_VERSION_EVENT_TYPES,
        },
      });
      const eventTypes =
        eventTypesResponse.data?.data?.eventTypes ||
        eventTypesResponse.data?.eventTypes ||
        eventTypesResponse.data?.data ||
        [];
      eventType =
        eventTypes.find((item) => item?.isDefault || item?.default) ||
        eventTypes[0] ||
        null;
      if (eventType) {
        const username =
          eventType?.profile?.username ||
          eventType?.owner?.username ||
          eventType?.users?.[0]?.username ||
          null;
        const slug = eventType?.slug || null;
        bookingUrl =
          eventType?.schedulingUrl ||
          eventType?.bookingUrl ||
          (username && slug ? `https://cal.com/${username}/${slug}` : null);
        await supabaseAdmin
          .from("profiles")
          .update({
            cal_event_type_id: eventType?.id || null,
            cal_event_type_slug: slug,
            cal_username: username,
            cal_team_slug: eventType?.team?.slug || null,
            cal_organization_slug: eventType?.organization?.slug || null,
            cal_time_zone: eventType?.timeZone || null,
          })
          .eq("user_id", stateData.userId);
      }
    } catch (err) {
      bookingUrl = null;
    }

    await supabaseAdmin.from("integrations").upsert(
      {
        user_id: stateData.userId,
        provider: "calcom",
        access_token: encryptCalcomToken(accessToken),
        refresh_token: refreshToken
          ? encryptCalcomToken(refreshToken)
          : null,
        is_active: true,
        booking_url: bookingUrl,
        event_type_id: eventType?.id || null,
        event_type_slug: eventType?.slug || null,
        cal_username:
          eventType?.profile?.username ||
          eventType?.owner?.username ||
          eventType?.users?.[0]?.username ||
          null,
        cal_team_slug: eventType?.team?.slug || null,
        cal_organization_slug: eventType?.organization?.slug || null,
        cal_time_zone: eventType?.timeZone || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" }
    );
    return res.redirect(
      `${FRONTEND_URL}/wizard?cal_status=success&status=success`
    );
  } catch (err) {
    return res.redirect(`${FRONTEND_URL}/wizard?cal_status=error&status=error`);
  }
});

app.get("/api/calcom/status", requireAuth, async (req, res) => {
  const { data } = await supabaseAdmin
    .from("integrations")
    .select("is_active, access_token")
    .eq("user_id", req.user.id)
    .eq("provider", "calcom")
    .maybeSingle();
  const connected = Boolean(data?.is_active && data?.access_token);
  return res.json({ connected });
});

app.post("/api/calcom/disconnect", requireAuth, async (req, res) => {
  try {
    const resetPayload = {
      is_active: false,
      access_token: null,
      refresh_token: null,
      booking_url: null,
      event_type_id: null,
      event_type_slug: null,
      cal_username: null,
      cal_team_slug: null,
      cal_organization_slug: null,
      cal_time_zone: null,
      updated_at: new Date().toISOString(),
    };
    await supabaseAdmin
      .from("integrations")
      .update(resetPayload)
      .eq("user_id", req.user.id)
      .eq("provider", "calcom");
    await supabaseAdmin
      .from("profiles")
      .update({
        cal_event_type_id: null,
        cal_event_type_slug: null,
        cal_username: null,
        cal_team_slug: null,
        cal_organization_slug: null,
        cal_time_zone: null,
      })
      .eq("user_id", req.user.id);
    return res.json({ connected: false });
  } catch (err) {
    return res.status(500).json({ error: "Unable to disconnect calendar" });
  }
});

const retellWebhookHandler = async (req, res) => {
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

    if (eventType === "call_started" || eventType === "call_initiated") {
      const agentId = call.agent_id || payload.agent_id;
      const callId = call.call_id || payload.call_id || payload.id || null;
      const { data: agentRow } = await supabaseAdmin
        .from("agents")
        .select("user_id")
        .eq("agent_id", agentId)
        .maybeSingle();
      if (agentRow?.user_id) {
        await logEvent({
          userId: agentRow.user_id,
          actionType: "OUTBOUND_CALL_INITIATED",
          req,
          metaData: {
            call_id: callId,
            from_number: call.from_number || payload.from_number || null,
            to_number: call.to_number || payload.to_number || null,
          },
        });
      }
    }

    if (eventType === "call_ended") {
      const transcript = call.transcript || payload.transcript || "";
      const extractedVars =
        payload.variables ||
        call.variables ||
        call.retell_llm_dynamic_variables ||
        payload.retell_llm_dynamic_variables ||
        null;
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
      const disposition =
        call.disposition ||
        call.status ||
        payload.disposition ||
        payload.status ||
        null;
      const callCost =
        call.cost ||
        call.cost_cents ||
        payload.cost ||
        payload.cost_cents ||
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
        name: extracted.name || extractedVars?.customer_name || null,
        phone: extracted.phone || extractedVars?.customer_phone || null,
        status: "New",
        summary: extracted.summary,
        transcript,
        sentiment: extracted.sentiment,
        recording_url: recordingUrl,
        call_duration_seconds: durationSeconds || null,
        metadata: extractedVars ? { extracted: extractedVars } : null,
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
      await logEvent({
        userId: agentRow.user_id,
        actionType: "OUTBOUND_CALL_ENDED",
        req,
        metaData: {
          call_id: callId,
          duration_seconds: durationSeconds,
          cost: callCost,
          recording_url: recordingUrl,
          disposition,
        },
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
      await logEvent({
        userId: agentRow.user_id,
        actionType: "SMS_RECEIVED",
        req,
        metaData: {
          direction: "inbound",
          body,
          from: fromNumber,
          to: null,
        },
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

    if (eventType === "tool_call" || eventType === "function_call") {
      const toolCalls = normalizeToolPayload(payload);
      const agentId = payload.agent_id || call.agent_id || payload.data?.agent_id;
      if (!agentId) {
        return res.status(400).json({ error: "Missing agent_id" });
      }
      const { data: agentRow, error: agentError } = await supabaseAdmin
        .from("agents")
        .select("user_id")
        .eq("agent_id", agentId)
        .maybeSingle();
      if (agentError || !agentRow) {
        return res.status(404).json({ error: "Agent not found" });
      }
      const calls = Array.isArray(toolCalls) ? toolCalls : [toolCalls];
      const results = [];
      for (const tool of calls.filter(Boolean)) {
        // eslint-disable-next-line no-await-in-loop
        const result = await handleToolCall({
          tool,
          agentId,
          userId: agentRow.user_id,
        });
        results.push({ tool: tool.name || tool.tool_name, result });
      }
      return res.json({ ok: true, results });
    }

    return res.json({ received: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

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
        calComLink,
        dispatchBaseLocation,
        travelLimitValue,
        travelLimitMode,
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

      const { data: profileRows, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("consent_accepted_at, consent_version, role")
        .eq("user_id", req.user.id)
        .order("created_at", { ascending: false })
        .limit(1);
      if (profileError) {
        return res.status(500).json({ error: profileError.message });
      }
      const profile = profileRows?.[0] || null;

      if (
        !profile?.consent_accepted_at ||
        profile?.consent_version !== currentConsentVersion
      ) {
        return res.status(403).json({ error: "Consent required" });
      }

      if (profile?.role !== "admin") {
        const { data: subscriptionRows, error: subError } = await supabaseAdmin
          .from("subscriptions")
          .select("status, plan_type, current_period_end")
          .eq("user_id", req.user.id)
          .order("created_at", { ascending: false })
          .limit(1);

        if (subError) {
          return res.status(500).json({ error: subError.message });
        }

        const subscription = subscriptionRows?.[0] || null;
        if (!isSubscriptionActive(subscription)) {
          return res.status(402).json({ error: "Active subscription required" });
        }

        const planTier = String(subscription?.plan_type || "").toLowerCase();
        const allowMultiple =
          planTier.includes("elite") || planTier.includes("scale");
        if (!allowMultiple) {
          const { data: existingAgents, error: agentCheckError } =
            await supabaseAdmin
              .from("agents")
              .select("id")
              .eq("user_id", req.user.id)
              .limit(1);
          if (agentCheckError) {
            return res.status(500).json({ error: agentCheckError.message });
          }
          if (existingAgents && existingAgents.length > 0) {
            return res.status(403).json({
              error:
                "Additional agents are available on Elite/Scale plans only.",
            });
          }
        }
      }

      const llmId = pickLlmId(industry);
      const llmVersion = pickLlmVersion(industry);
      const cleanTransfer =
        transferNumber && String(transferNumber).replace(/[^\d+]/g, "");
      const baseInput = String(dispatchBaseLocation || "").trim();
      if (!baseInput) {
        return res
          .status(400)
          .json({ error: "dispatchBaseLocation is required" });
      }
      const travelValue = Number(travelLimitValue);
      if (!travelValue || travelValue <= 0) {
        return res
          .status(400)
          .json({ error: "travelLimitValue must be greater than 0" });
      }
      const travelMode =
        String(travelLimitMode || "").toLowerCase() === "miles"
          ? "miles"
          : "minutes";
      const travelInstruction = buildTravelInstruction({
        dispatchBaseLocation: baseInput,
        travelLimitValue: travelValue,
        travelLimitMode: travelMode,
      });
      if (cleanTransfer && cleanTransfer.length < 8) {
        return res
          .status(400)
          .json({ error: "transferNumber must be a valid phone number" });
      }

      const legacyPrompt = `You are the AI phone agent for ${businessName}, a ${industry} business. Be concise, professional, and focus on booking service calls. Voice tone: ${
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
      } ${travelInstruction}`.trim();

      const dynamicVars = {
        business_name: String(businessName || ""),
        industry: String(industry || ""),
        transfer_number: String(cleanTransfer || ""),
        cal_com_link: String(calComLink || ""),
        agent_tone: String(tone || "Calm & Professional"),
        schedule_summary: String(scheduleSummary || ""),
        standard_fee: String(standardFee || ""),
        emergency_fee: String(emergencyFee || ""),
        caller_name: "",
        call_reason: "",
        safety_check_result: "",
        current_temp: "",
        service_address: "",
        callback_number: "",
        urgency_level: "",
        vulnerable_flag: "",
        issue_type: "",
      };
      const greeting = interpolateTemplate(
        "Thank you for calling {{business_name}}. I'm Grace, the automated {{industry}} dispatch. Briefly, how may I help you today?",
        dynamicVars
      );

      const promptMode = normalizePromptMode(RETELL_PROMPT_MODE, industry);
      const useBackendPrompt =
        promptMode !== "template" &&
        shouldUseBackendPrompt({
          userId: req.user.id,
          industry,
        });
      const backendPrompt = buildDispatchPrompt({
        mode: promptMode,
        industry,
        businessName,
        agentTone: tone,
        scheduleSummary,
        standardFee,
        emergencyFee,
        transferNumber: cleanTransfer,
        travelInstruction,
      });
      const finalPrompt = promptMode === "template"
        ? null
        : useBackendPrompt
        ? backendPrompt
        : `${legacyPrompt}

Greeting:
${greeting}

Business Variables:
- business_name: ${businessName}
- cal_com_link: ${calComLink || "not_set"}
- transfer_number: ${cleanTransfer || "not_set"}`.trim();

      const resolvedVoiceId = voiceId || RETELL_VOICE_ID || "11labs-Grace";
      if (!resolvedVoiceId) {
        return res.status(500).json({
          error: "Missing voice_id",
          details:
            "Set RETELL_VOICE_ID in the backend environment or pass voiceId.",
        });
      }

      const responseEngine = {
        type: "retell-llm",
        llm_id: llmId,
      };
      if (llmVersion) {
        responseEngine.llm_version = llmVersion;
      }
      const agentPayload = {
        response_engine: responseEngine,
        agent_name: `${businessName} AI Agent`,
        retell_llm_dynamic_variables: {
          business_name: dynamicVars.business_name,
          cal_com_link: dynamicVars.cal_com_link,
          transfer_number: dynamicVars.transfer_number,
        },
        webhook_url: `${serverBaseUrl.replace(/\/$/, "")}/retell-webhook`,
        webhook_timeout_ms: 10000,
      };
      if (finalPrompt) {
        agentPayload.prompt = finalPrompt;
      }
      agentPayload.voice_id = resolvedVoiceId;

      const agentResponse = await retellClient.post("/create-agent", agentPayload);

      const agentId = agentResponse.data.agent_id || agentResponse.data.id;
      if (!agentId) {
        return res.status(500).json({ error: "Retell agent_id missing" });
      }
      const toolCopy = await applyMasterAgentTools({
        industry,
        agentId,
        llmId,
        llmVersion,
      });
      console.info("[retell] agent created", {
        agent_id: agentId,
        llm_id: llmId,
        llm_version: llmVersion || null,
        master_agent_id: toolCopy?.masterAgentId || null,
        tool_count_after_copy: toolCopy?.toolCount || 0,
        tools_source: toolCopy?.toolCount ? "master_agent" : "none",
      });

      const phonePayload = {
        inbound_agent_id: agentId,
        outbound_agent_id: agentId,
        area_code:
          areaCode && String(areaCode).length === 3
            ? Number(areaCode)
            : undefined,
        country_code: "US",
        nickname: `${businessName} Line`,
        inbound_webhook_url: `${serverBaseUrl.replace(/\/$/, "")}/webhooks/retell-inbound`,
        inbound_sms_enabled: true,
      };
      const phoneResponse = await retellClient.post(
        "/create-phone-number",
        phonePayload
      );

      const phoneNumber =
        phoneResponse.data.phone_number || phoneResponse.data.number;

      const { error: insertError } = await supabaseAdmin.from("agents").insert({
        user_id: req.user.id,
        agent_id: agentId,
        phone_number: phoneNumber,
        voice_id: voiceId || null,
        llm_id: llmId,
        prompt: finalPrompt || null,
        area_code: areaCode || null,
        tone: tone || null,
        schedule_summary: scheduleSummary || null,
        standard_fee: standardFee || null,
        emergency_fee: emergencyFee || null,
        payment_id: paymentId || null,
        transfer_number: cleanTransfer || null,
        dispatch_base_location: baseInput || null,
        travel_limit_value: travelValue || null,
        travel_limit_mode: travelMode || null,
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
        metadata: {
          industry,
          phone_number: phoneNumber,
          dispatch_base: baseInput,
          travel_limit_value: travelValue,
          travel_limit_mode: travelMode,
        },
      });

      return res.json({ agent_id: agentId, phone_number: phoneNumber });
    } catch (err) {
      const details = err.response?.data || null;
      const message =
        err.response?.data?.error_message ||
        err.response?.data?.error ||
        err.message;
      const status = err.response?.status || 500;
      console.error("deploy-agent error:", message, details);
      return res.status(status).json({ error: message, details });
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

    const updateResponse = await retellClient.patch(
      `/update-agent/${agentId}`,
      payload
    );

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

const syncRetellTemplates = async ({ llmId }) => {
  if (!llmId) {
    throw new Error("llmId is required to sync templates.");
  }

  const { data: agents, error: agentsError } = await supabaseAdmin
    .from("agents")
    .select(
      "agent_id, llm_id, user_id, transfer_number, schedule_summary, standard_fee, emergency_fee, tone, dispatch_base_location, travel_limit_value, travel_limit_mode"
    )
    .eq("llm_id", llmId);

  if (agentsError) {
    throw new Error(agentsError.message);
  }

  const webhookUrl = `${serverBaseUrl.replace(/\/$/, "")}/retell-webhook`;
  const results = [];
  const derivedIndustry =
    llmId === RETELL_LLM_ID_PLUMBING ? "plumbing" : "hvac";
  const llmVersion = pickLlmVersion(derivedIndustry);
    const promptMode = normalizePromptMode(RETELL_PROMPT_MODE, derivedIndustry);

  for (const agent of agents || []) {
    const agentId = agent?.agent_id;
    if (!agentId) continue;
    try {
        const useBackendPrompt =
          promptMode !== "template" &&
          shouldUseBackendPrompt({
            userId: agent.user_id,
            industry: derivedIndustry,
          });
      let promptOverride = null;
      if (useBackendPrompt) {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("business_name")
          .eq("user_id", agent.user_id)
          .maybeSingle();
        const travelInstruction = buildTravelInstruction({
          dispatchBaseLocation: agent.dispatch_base_location,
          travelLimitValue: agent.travel_limit_value,
          travelLimitMode: agent.travel_limit_mode,
        });
        promptOverride = buildDispatchPrompt({
          mode: promptMode,
          industry: derivedIndustry,
          businessName: profile?.business_name,
          agentTone: agent.tone,
          scheduleSummary: agent.schedule_summary,
          standardFee: agent.standard_fee,
          emergencyFee: agent.emergency_fee,
          transferNumber: agent.transfer_number,
          travelInstruction,
        });
      }

      const responseEngine = { type: "retell-llm", llm_id: llmId };
      if (llmVersion) {
        responseEngine.llm_version = llmVersion;
      }
      const updatePayload = {
        response_engine: responseEngine,
        webhook_url: webhookUrl,
        webhook_timeout_ms: 10000,
      };
      if (promptOverride) {
        updatePayload.prompt = promptOverride;
      }
      // Force the agent to rebind to the latest LLM template + webhook config.
      await retellClient.patch(`/update-agent/${agentId}`, updatePayload);
      if (promptOverride) {
        await supabaseAdmin
          .from("agents")
          .update({ prompt: promptOverride })
          .eq("agent_id", agentId);
      }
      results.push({ agent_id: agentId, ok: true });
    } catch (err) {
      const message =
        err.response?.data?.error ||
        err.response?.data?.error_message ||
        err.message;
      results.push({ agent_id: agentId, ok: false, error: message });
    }
  }

  const successCount = results.filter((item) => item.ok).length;
  const failureCount = results.length - successCount;
  return {
    llm_id: llmId,
    total: results.length,
    success: successCount,
    failed: failureCount,
    results,
  };
};

app.post(
  "/admin/retell/sync-templates",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const { industry, llmId } = req.body || {};
      const targetLlmId = llmId || (industry ? pickLlmId(industry) : null);
      if (!targetLlmId) {
        return res.status(400).json({
          error: "Provide llmId or industry to sync templates.",
        });
      }
      const syncResult = await syncRetellTemplates({ llmId: targetLlmId });
      return res.json({ ok: true, ...syncResult });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

app.get("/dashboard-stats", requireAuth, async (req, res) => {
  try {
    const stats = await getDashboardStats(req.user.id);
    return res.json(stats);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/dashboard/stats", requireAuth, async (req, res) => {
  try {
    const stats = await getDashboardStats(req.user.id);
    return res.json(stats);
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

app.get("/call-recordings", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("call_recordings")
      .select(
        `
        id,
        duration,
        recording_url,
        outcome,
        created_at,
        lead:leads(id, name, business_name, phone, summary, transcript)
      `
      )
      .eq("seller_id", req.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const recordings = (data || []).map((row) => ({
      ...row,
      caller_name:
        row.lead?.business_name || row.lead?.name || "Unknown Caller",
      caller_phone: row.lead?.phone || "--",
      transcript: row.lead?.transcript || row.lead?.summary || "",
    }));

    return res.json({ recordings });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/admin/dialer-queue", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("dialer_queue")
      .select("id,status,created_at,lead:leads(*)")
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const queue = (data || [])
      .map((entry) => {
        if (!entry.lead) return null;
        return {
          queue_id: entry.id,
          queue_status: entry.status,
          queue_created_at: entry.created_at,
          ...entry.lead,
        };
      })
      .filter(Boolean);

    return res.json({ queue });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post(
  "/admin/dialer-queue",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const { leadIds } = req.body || {};
      if (!Array.isArray(leadIds) || !leadIds.length) {
        return res.status(400).json({ error: "leadIds are required" });
      }

      const rows = leadIds.map((leadId) => ({
        lead_id: leadId,
        created_by: req.user.id,
      }));

      const { data, error } = await supabaseAdmin
        .from("dialer_queue")
        .upsert(rows, { onConflict: "lead_id" })
        .select("id,status,created_at,lead:leads(*)");

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      const queue = (data || [])
        .map((entry) => {
          if (!entry.lead) return null;
          return {
            queue_id: entry.id,
            queue_status: entry.status,
            queue_created_at: entry.created_at,
            ...entry.lead,
          };
        })
        .filter(Boolean);

      return res.json({ queue });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

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
      const { leadId, to, body, source } = req.body || {};
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

      const isSandbox =
        String(RETELL_SMS_SANDBOX || "").toLowerCase() === "true";
      const retellResponse = await sendSmsInternal({
        userId: req.user.id,
        to: destination,
        body,
        leadId,
        source: source || "manual",
        req,
      });

      await supabaseAdmin.from("messages").insert({
        user_id: req.user.id,
        lead_id: leadId || null,
        direction: "outbound",
        body,
      });

      await auditLog({
        userId: req.user.id,
        action: "sms_sent",
        entity: "message",
        entityId: leadId || null,
        metadata: { to: destination, source: source || "manual" },
      });

      return res.json({ sent: true, sandbox: isSandbox, data: retellResponse });
    } catch (err) {
      let message =
        err.response?.data?.error || err.response?.data || err.message;
      if (typeof message === "string" && message.includes("<!DOCTYPE")) {
        message = "SMS provider error. Check Retell SMS setup.";
      }
      return res.status(500).json({ error: message });
    }
  }
);

app.post("/webhooks/sms-inbound", async (req, res) => {
  try {
    const payload = req.body || {};
    const toNumber = payload.to_number || payload.to || payload.phone_number;
    const fromNumber = payload.from_number || payload.from || payload.sender;
    const body = payload.body || payload.text || payload.message || "";
    if (!toNumber || !fromNumber) {
      return res.status(400).json({ error: "to_number and from_number required" });
    }
    const { data: agentRow } = await supabaseAdmin
      .from("agents")
      .select("user_id, agent_id")
      .eq("phone_number", toNumber)
      .maybeSingle();
    if (!agentRow?.user_id) {
      return res.status(404).json({ error: "Agent not found for number" });
    }
    await supabaseAdmin.from("messages").insert({
      user_id: agentRow.user_id,
      direction: "inbound",
      body,
    });
    await auditLog({
      userId: agentRow.user_id,
      action: "sms_received",
      entity: "message",
      entityId: agentRow.agent_id || null,
      metadata: { from: fromNumber, to: toNumber },
    });
    await logEvent({
      userId: agentRow.user_id,
      actionType: "SMS_RECEIVED",
      req,
      metaData: {
        direction: "inbound",
        body,
        from: fromNumber,
        to: toNumber,
      },
    });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/webhooks/retell-inbound", async (req, res) => {
  try {
    const payload = req.body || {};
    const toNumber =
      payload.to_number ||
      payload.to ||
      payload.called_number ||
      payload.phone_number;
    if (!toNumber) {
      return res.status(400).json({ error: "to_number required" });
    }
    const { data: agentRow } = await supabaseAdmin
      .from("agents")
      .select("user_id, agent_id, transfer_number")
      .eq("phone_number", toNumber)
      .maybeSingle();
    if (!agentRow?.user_id) {
      return res.status(404).json({ error: "Agent not found for number" });
    }

    const [{ data: profile }, { data: integration }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("business_name")
        .eq("user_id", agentRow.user_id)
        .maybeSingle(),
      supabaseAdmin
        .from("integrations")
        .select("booking_url")
        .eq("user_id", agentRow.user_id)
        .eq("provider", "calcom")
        .maybeSingle(),
    ]);

    const businessName = profile?.business_name || "your business";
    const bookingUrl = integration?.booking_url || "";
    const transferNumber = agentRow.transfer_number || "";

    return res.json({
      agent_id: agentRow.agent_id,
      retell_llm_dynamic_variables: {
        business_name: String(businessName || ""),
        cal_com_link: String(bookingUrl || ""),
        transfer_number: String(transferNumber || ""),
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/retell-webhook", enforceIpAllowlist, retellWebhookHandler);
app.post("/api/retell/webhook", enforceIpAllowlist, retellWebhookHandler);

app.post(
  "/retell/demo-call",
  requireAuth,
  rateLimit({ keyPrefix: "retell-demo-call", limit: 8, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { to, name, leadId } = req.body || {};
      if (!to) {
        return res.status(400).json({ error: "to is required" });
      }
      if (!RETELL_DEMO_AGENT_ID || !RETELL_DEMO_FROM_NUMBER) {
        return res
          .status(500)
          .json({ error: "Retell demo call is not configured" });
      }

      const payload = {
        from_number: RETELL_DEMO_FROM_NUMBER,
        to_number: to,
        override_agent_id: RETELL_DEMO_AGENT_ID,
        retell_llm_dynamic_variables: name ? { customer_name: name } : undefined,
        metadata: {
          source: "admin_sniper_kit",
          lead_id: leadId || null,
          user_id: req.user.id,
        },
      };

      const retellResponse = await retellClient.post(
        "/create-phone-call",
        payload
      );

      await auditLog({
        userId: req.user.id,
        action: "demo_call_triggered",
        entity: "lead",
        entityId: leadId || null,
        metadata: { to, source: "admin_sniper_kit" },
      });
      await logEvent({
        userId: req.user.id,
        actionType: "OUTBOUND_CALL_INITIATED",
        req,
        metaData: {
          call_id: retellResponse.data?.call_id || retellResponse.data?.id || null,
          to_number: to,
          source: "admin_sniper_kit",
        },
      });

      return res.json({ call: retellResponse.data });
    } catch (err) {
      let message =
        err.response?.data?.error || err.response?.data || err.message;
      if (typeof message === "object" && message !== null) {
        message = message.message || JSON.stringify(message);
      }
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

app.post(
  "/appointments",
  requireAuth,
  rateLimit({ keyPrefix: "appointments", limit: 30, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const {
        customer_name,
        customer_phone,
        start_date,
        start_time,
        duration_minutes,
        location,
        notes,
        reminder_minutes,
        reminder_enabled,
        eta_enabled,
        eta_minutes,
        eta_link,
      } = req.body || {};

      if (!customer_name || !start_date || !start_time) {
        return res
          .status(400)
          .json({ error: "customer_name, start_date, start_time are required" });
      }

      const [year, month, day] = String(start_date).split("-").map(Number);
      const [hour, minute] = String(start_time).split(":").map(Number);
      const startTime = new Date(year, month - 1, day, hour, minute);
      const durationMinutes = parseInt(duration_minutes || "60", 10);
      const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

      const { data, error } = await supabaseAdmin
        .from("appointments")
        .insert({
          user_id: req.user.id,
          customer_name,
          customer_phone: customer_phone || null,
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          location: location || null,
          notes: notes || null,
          reminder_minutes: parseInt(reminder_minutes || "0", 10),
          reminder_enabled: Boolean(reminder_enabled),
          eta_enabled: Boolean(eta_enabled),
          eta_minutes: parseInt(eta_minutes || "10", 10),
          eta_link: eta_link || null,
          status: "booked",
        })
        .select("*")
        .single();

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      if (req.user?.email) {
        try {
          await sendBookingAlert(req.user.email, data);
        } catch (err) {
          console.error("sendBookingAlert error:", err.message);
        }
      }

      return res.json({ appointment: data });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

app.put(
  "/appointments/:id",
  requireAuth,
  rateLimit({ keyPrefix: "appointments-update", limit: 30, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { id } = req.params || {};
      if (!id) {
        return res.status(400).json({ error: "appointment id is required" });
      }
      const {
        customer_name,
        customer_phone,
        start_date,
        start_time,
        duration_minutes,
        location,
        notes,
        reminder_minutes,
        reminder_enabled,
        eta_enabled,
        eta_minutes,
        eta_link,
        status,
      } = req.body || {};

      const { data: existing, error: existingError } = await supabaseAdmin
        .from("appointments")
        .select("*")
        .eq("id", id)
        .eq("user_id", req.user.id)
        .maybeSingle();
      if (existingError) {
        return res.status(500).json({ error: existingError.message });
      }
      if (!existing) {
        return res.status(404).json({ error: "Appointment not found" });
      }

      const updates = {
        customer_name: customer_name !== undefined ? customer_name : undefined,
        customer_phone: customer_phone !== undefined ? customer_phone : undefined,
        location: location !== undefined ? location : undefined,
        notes: notes !== undefined ? notes : undefined,
        reminder_minutes:
          reminder_minutes !== undefined
            ? parseInt(reminder_minutes || "0", 10)
            : undefined,
        reminder_enabled:
          reminder_enabled !== undefined ? Boolean(reminder_enabled) : undefined,
        eta_enabled: eta_enabled !== undefined ? Boolean(eta_enabled) : undefined,
        eta_minutes:
          eta_minutes !== undefined ? parseInt(eta_minutes || "10", 10) : undefined,
        eta_link: eta_link !== undefined ? eta_link : undefined,
        status: status !== undefined ? status : undefined,
      };

      const existingStart = existing.start_time ? new Date(existing.start_time) : null;
      const needsTimeUpdate =
        start_date !== undefined ||
        start_time !== undefined ||
        duration_minutes !== undefined;
      if (needsTimeUpdate) {
        if (!existingStart && (!start_date || !start_time)) {
          return res
            .status(400)
            .json({ error: "start_date and start_time are required" });
        }
        const dateSource = start_date || (existingStart && formatDate(existingStart));
        const timeSource = start_time || (existingStart && formatTime(existingStart));
        const [year, month, day] = String(dateSource).split("-").map(Number);
        const [hour, minute] = String(timeSource).split(":").map(Number);
        const startTime = new Date(year, month - 1, day, hour, minute);
        const durationResolved = parseInt(
          duration_minutes || existing.duration_minutes || "60",
          10
        );
        const endTime = new Date(startTime.getTime() + durationResolved * 60000);
        updates.start_time = startTime.toISOString();
        updates.end_time = endTime.toISOString();
        updates.duration_minutes = durationResolved;
      }

      const attemptUpdate = async (payload) =>
        supabaseAdmin
          .from("appointments")
          .update(payload)
          .eq("id", id)
          .eq("user_id", req.user.id)
          .select("*")
          .single();

      let { data, error } = await attemptUpdate(updates);
      if (error) {
        const message = String(error.message || "");
        if (message.includes("duration_minutes") || message.includes("schema cache")) {
          const retryUpdates = { ...updates };
          delete retryUpdates.duration_minutes;
          ({ data, error } = await attemptUpdate(retryUpdates));
        }
      }
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      return res.json({ appointment: data });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

app.delete(
  "/appointments/:id",
  requireAuth,
  rateLimit({ keyPrefix: "appointments-delete", limit: 30, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { id } = req.params || {};
      if (!id) {
        return res.status(400).json({ error: "appointment id is required" });
      }
      const { data, error } = await supabaseAdmin
        .from("appointments")
        .delete()
        .eq("id", id)
        .eq("user_id", req.user.id)
        .select("id")
        .maybeSingle();
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      if (!data) {
        return res.status(404).json({ error: "Appointment not found" });
      }
      return res.json({ deleted: true });
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
      if (!["pro", "elite", "core", "starter", "scale"].includes(planTier.toLowerCase())) {
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
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const row = data?.[0] || null;
    return res.json({
      status: row?.status || "none",
      plan_type: row?.plan_type || null,
      current_period_end: row?.current_period_end || null,
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
      const adminEmails = ADMIN_EMAIL.split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);
      if (!adminEmails.length) {
        return res.status(500).json({ error: "Admin email not configured" });
      }
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

app.post("/black-box/event", requireAuth, async (req, res) => {
  try {
    const { action_type, meta_data } = req.body || {};
    if (!action_type) {
      return res.status(400).json({ error: "action_type is required" });
    }
    await logEvent({
      userId: req.user.id,
      actionType: action_type,
      req,
      metaData: meta_data || null,
    });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

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

const fetchCallRecordings = async ({ limit = 50, outcomeFilters = [] }) => {
  const query = supabaseAdmin
    .from("call_recordings")
    .select(
      `
      id,
      duration,
      recording_url,
      outcome,
      qa_flags,
      manager_notes,
      flagged_for_review,
      created_at,
      seller:profiles!call_recordings_seller_id_fkey(full_name, user_id),
      lead:leads!call_recordings_lead_id_fkey(name, business_name, id)
    `
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (outcomeFilters.length) {
    query.in("outcome", outcomeFilters);
  }
  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return (data || []).map((row) => ({
    ...row,
    seller_name: row.seller?.full_name || `Seller ${row.seller?.user_id}`,
    lead_name: row.lead?.business_name || row.lead?.name || "Unknown Lead",
  }));
};

app.get(
  "/admin/call-recordings",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-call-recordings", limit: 20, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { outcome } = req.query || {};
      const outcomeFilters = outcome ? String(outcome).split(",").map((item) => item.trim()) : [];
      const recordings = await fetchCallRecordings({ outcomeFilters });
      return res.json({ recordings });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

app.post(
  "/call-recordings",
  requireAuth,
  rateLimit({ keyPrefix: "call-recording", limit: 30, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { leadId, duration = 0, recordingUrl = null, outcome = "No Answer" } = req.body || {};
      const recording = {
        seller_id: req.user.id,
        lead_id: leadId || null,
        duration: Number(duration) || 0,
        recording_url: recordingUrl,
        outcome,
      };
      const { data, error } = await supabaseAdmin
        .from("call_recordings")
        .insert(recording)
        .select("*")
        .single();
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      return res.json({ call: data });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

app.post(
  "/admin/call-recordings/:recordingId/feedback",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-call-feedback", limit: 20, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { recordingId } = req.params || {};
      const { qaFlags, managerNotes, flaggedForReview } = req.body || {};
      if (!recordingId) {
        return res.status(400).json({ error: "recordingId is required" });
      }
      const updates = {
        qa_flags: qaFlags ? JSON.stringify(qaFlags) : undefined,
        manager_notes: managerNotes || undefined,
        flagged_for_review:
          flaggedForReview !== undefined ? Boolean(flaggedForReview) : undefined,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabaseAdmin
        .from("call_recordings")
        .update(updates)
        .eq("id", recordingId)
        .select("*")
        .single();
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      return res.json({ call: data });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

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
        referrerId: referrerOverride,
      } = req.body || {};

      if (!email) {
        return res.status(400).json({ error: "email is required" });
      }

      let referrerId = req.user.id;
      if (leadId) {
        const { data: leadRow } = await supabaseAdmin
          .from("leads")
          .select("owner_id")
          .eq("id", leadId)
          .maybeSingle();
        if (leadRow?.owner_id) {
          referrerId = leadRow.owner_id;
        }
      }
      if (referrerOverride) {
        referrerId = referrerOverride;
      }

      const planTier = String(tierId || "pro").toLowerCase();
      if (!["pro", "elite", "core", "starter", "scale"].includes(planTier)) {
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
        referrer_id: referrerId,
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
          seller_id: referrerId,
          referrer_id: referrerId,
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
        seller_id: referrerId,
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
          referrer_id: referrerId,
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

app.get(
  "/admin/users",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const { data: authUsers, error: authError } =
        await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        });
      if (authError) {
        return res.status(500).json({ error: authError.message });
      }
      const usersList = authUsers?.users || [];
      const userIds = usersList.map((user) => user.id);
      if (!userIds.length) {
        return res.json({ users: [] });
      }

      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("user_id, business_name, role")
        .in("user_id", userIds);
      const { data: subscriptions } = await supabaseAdmin
        .from("subscriptions")
        .select("user_id, status, plan_type")
        .in("user_id", userIds);
      const { data: usageLimits } = await supabaseAdmin
        .from("usage_limits")
        .select(
          "user_id, call_used_seconds, call_cap_seconds, call_credit_seconds, rollover_seconds"
        )
        .in("user_id", userIds);
      const { data: agents } = await supabaseAdmin
        .from("agents")
        .select("user_id, agent_id, phone_number, created_at")
        .in("user_id", userIds)
        .order("created_at", { ascending: false });

      const profileMap = new Map(
        (profiles || []).map((profile) => [profile.user_id, profile])
      );
      const subscriptionMap = new Map(
        (subscriptions || []).map((sub) => [sub.user_id, sub])
      );
      const usageMap = new Map(
        (usageLimits || []).map((usage) => [usage.user_id, usage])
      );
      const agentMap = new Map();
      (agents || []).forEach((agent) => {
        if (!agentMap.has(agent.user_id)) {
          agentMap.set(agent.user_id, agent);
        }
      });

      const rows = usersList.map((user) => {
        const profile = profileMap.get(user.id) || {};
        const subscription = subscriptionMap.get(user.id) || {};
        const usage = usageMap.get(user.id) || {};
        const agent = agentMap.get(user.id) || {};
        const totalSeconds =
          (usage.call_cap_seconds || 0) +
          (usage.call_credit_seconds || 0) +
          (usage.rollover_seconds || 0);
        const usedSeconds = usage.call_used_seconds || 0;
        const usagePercent =
          totalSeconds > 0
            ? Math.min(100, Math.round((usedSeconds / totalSeconds) * 100))
            : 0;

        return {
          id: user.id,
          business_name: profile.business_name || "Unassigned",
          email: user.email || "--",
          role: profile.role || "user",
          plan_type: subscription.plan_type || null,
          status: subscription.status || null,
          usage_percent: usagePercent,
          usage_minutes: Math.floor(usedSeconds / 60),
          usage_limit_minutes: Math.floor(totalSeconds / 60),
          agent_id: agent.agent_id || null,
          agent_phone: agent.phone_number || null,
        };
      });

      return res.json({ users: rows });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

app.get(
  "/admin/users/:userId",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const { userId } = req.params;
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("user_id, business_name, role, full_name")
        .eq("user_id", userId)
        .maybeSingle();
      const { data: subscription } = await supabaseAdmin
        .from("subscriptions")
        .select("status, plan_type, current_period_end, customer_id")
        .eq("user_id", userId)
        .maybeSingle();
      const { data: usage } = await supabaseAdmin
        .from("usage_limits")
        .select(
          "call_used_seconds, call_cap_seconds, call_credit_seconds, rollover_seconds"
        )
        .eq("user_id", userId)
        .maybeSingle();
      const { data: agent } = await supabaseAdmin
        .from("agents")
        .select("agent_id, phone_number, llm_id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: authUser } =
        await supabaseAdmin.auth.admin.getUserById(userId);
      const { data: lastAudit } = await supabaseAdmin
        .from("audit_logs")
        .select("ip, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const totalSeconds =
        (usage?.call_cap_seconds || 0) +
        (usage?.call_credit_seconds || 0) +
        (usage?.rollover_seconds || 0);
      const usedSeconds = usage?.call_used_seconds || 0;
      let billing = {
        customer_id: subscription?.customer_id || null,
        payment_method_last4: null,
        payment_method_brand: null,
        next_billing_date: subscription?.current_period_end || null,
        lifetime_revenue_cents: 0,
        currency: "usd",
      };

      if (STRIPE_SECRET_KEY && subscription?.customer_id) {
        try {
          const customer = await stripe.customers.retrieve(
            subscription.customer_id
          );
          const defaultPaymentMethod =
            customer?.invoice_settings?.default_payment_method || null;
          const paymentMethodId =
            typeof defaultPaymentMethod === "string"
              ? defaultPaymentMethod
              : defaultPaymentMethod?.id;
          if (paymentMethodId) {
            const paymentMethod = await stripe.paymentMethods.retrieve(
              paymentMethodId
            );
            billing.payment_method_last4 =
              paymentMethod?.card?.last4 || null;
            billing.payment_method_brand =
              paymentMethod?.card?.brand || null;
          }
          const invoices = await stripe.invoices.list({
            customer: subscription.customer_id,
            limit: 100,
          });
          const paidTotal = (invoices.data || []).reduce((sum, invoice) => {
            if (invoice.status === "paid") {
              return sum + (invoice.amount_paid || 0);
            }
            return sum;
          }, 0);
          billing.lifetime_revenue_cents = paidTotal;
          billing.currency = invoices.data?.[0]?.currency || billing.currency;
        } catch (err) {
          billing = {
            ...billing,
            payment_method_last4: null,
          };
        }
      }

      return res.json({
        user: {
          id: userId,
          business_name: profile?.business_name || "Unassigned",
          full_name:
            profile?.full_name ||
            authUser?.user?.user_metadata?.full_name ||
            null,
          email: authUser?.user?.email || "--",
          phone: authUser?.user?.phone || null,
          signup_date: authUser?.user?.created_at || null,
          ip_address: lastAudit?.ip || null,
          role: profile?.role || "user",
          plan_type: subscription?.plan_type || null,
          status: subscription?.status || null,
          usage_minutes: Math.floor(usedSeconds / 60),
          usage_limit_minutes: Math.floor(totalSeconds / 60),
        },
        billing,
        config: {
          agent_id: agent?.agent_id || null,
          phone_number: agent?.phone_number || null,
          script_version: agent?.llm_id || null,
        },
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

const scheduleRetellTemplateSync = () => {
  const intervalMinutes = Number(RETELL_AUTO_SYNC_MINUTES || 0);
  if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
    return;
  }
  const intervalMs = Math.max(5, intervalMinutes) * 60_000;
  const runSync = async () => {
    for (const llmId of [RETELL_LLM_ID_PLUMBING, RETELL_LLM_ID_HVAC]) {
      if (!llmId) continue;
      try {
        const result = await syncRetellTemplates({ llmId });
        console.log(
          `Retell template sync: ${llmId} ok=${result.success} failed=${result.failed}`
        );
      } catch (err) {
        console.error(
          `Retell template sync failed for ${llmId}: ${err.message}`
        );
      }
    }
  };

  setTimeout(runSync, 15_000);
  setInterval(runSync, intervalMs);
};

scheduleRetellTemplateSync();