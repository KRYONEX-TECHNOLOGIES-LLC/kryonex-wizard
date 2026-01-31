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
  RETELL_MASTER_AGENT_ID_PLUMBING,
  RETELL_AGENT_VERSION_HVAC,
  RETELL_AGENT_VERSION_PLUMBING,
  WIZARD_MAINTENANCE_MODE,
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

// =============================================================================
// OPS INFRASTRUCTURE HELPERS
// =============================================================================

/**
 * Generate idempotency key from webhook payload
 */
const generateIdempotencyKey = (payload) => {
  const hash = crypto.createHash("sha256");
  hash.update(JSON.stringify(payload));
  return hash.digest("hex");
};

/**
 * Persist raw webhook to queue before processing (critical for audit)
 */
const persistRawWebhook = async ({ phoneNumber, userId, agentId, eventType, rawPayload, idempotencyKey }) => {
  try {
    const { error } = await supabaseAdmin.from("webhook_queue").insert({
      phone_number: phoneNumber || "",
      user_id: userId || null,
      agent_id: agentId || null,
      event_type: eventType,
      raw_payload: rawPayload,
      idempotency_key: idempotencyKey,
      received_at: new Date().toISOString(),
    });
    if (error && !error.message.includes("duplicate")) {
      console.error("[persistRawWebhook] insert error", error.message);
    }
    return !error;
  } catch (err) {
    console.error("[persistRawWebhook] error", err.message);
    return false;
  }
};

/**
 * Mark webhook as processed in queue
 */
const markWebhookProcessed = async (idempotencyKey, result, errorMessage = null) => {
  try {
    await supabaseAdmin.from("webhook_queue").update({
      processed_at: new Date().toISOString(),
      processed_by: "system",
      result,
      error_message: errorMessage,
    }).eq("idempotency_key", idempotencyKey);
  } catch (err) {
    console.error("[markWebhookProcessed] error", err.message);
  }
};

/**
 * Check if event is duplicate by idempotency key
 */
const isDuplicateEvent = async (idempotencyKey, table = "webhook_queue") => {
  if (!idempotencyKey) return false;
  try {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select("id, processed_at")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    return !!data;
  } catch (err) {
    return false;
  }
};

/**
 * Store unknown phone webhook for ops review
 */
const storeUnknownPhone = async ({ phoneNumber, eventType, rawPayload }) => {
  try {
    await supabaseAdmin.from("unknown_phone").insert({
      phone_number: phoneNumber,
      event_type: eventType,
      raw_payload: rawPayload,
      received_at: new Date().toISOString(),
    });
    console.warn("[storeUnknownPhone] unknown number stored", { phoneNumber, eventType });
  } catch (err) {
    console.error("[storeUnknownPhone] error", err.message);
  }
};

/**
 * Store call event with normalized fields
 */
const storeCallEvent = async ({
  eventId,
  idempotencyKey,
  phoneNumber,
  userId,
  agentId,
  callSid,
  direction,
  fromNumber,
  toNumber,
  startTime,
  answerTime,
  endTime,
  durationSeconds,
  billedSeconds,
  callStatus,
  disconnectReason,
  recordingUrl,
  transcriptId,
  agentUsed,
  callTags,
  rawPayload,
  signatureValid,
}) => {
  try {
    await supabaseAdmin.from("call_events").insert({
      event_id: eventId || `call_${generateToken(12)}`,
      idempotency_key: idempotencyKey,
      phone_number: phoneNumber,
      user_id: userId,
      agent_id: agentId,
      call_sid: callSid,
      direction,
      from_number: fromNumber,
      to_number: toNumber,
      start_time: startTime,
      answer_time: answerTime,
      end_time: endTime,
      duration_seconds: durationSeconds || 0,
      billed_seconds: billedSeconds || durationSeconds || 0,
      call_status: callStatus,
      disconnect_reason: disconnectReason,
      recording_url: recordingUrl,
      transcript_id: transcriptId,
      agent_used: agentUsed,
      call_tags: callTags,
      raw_payload: rawPayload,
      received_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
      signature_valid: signatureValid,
    });
  } catch (err) {
    if (!err.message?.includes("duplicate")) {
      console.error("[storeCallEvent] error", err.message);
    }
  }
};

/**
 * Store SMS event with normalized fields
 */
const storeSmsEvent = async ({
  eventId,
  idempotencyKey,
  phoneNumber,
  userId,
  agentId,
  messageSid,
  direction,
  fromNumber,
  toNumber,
  body,
  mediaUrls,
  status,
  billedUnits,
  rawPayload,
  signatureValid,
}) => {
  try {
    await supabaseAdmin.from("sms_events").insert({
      event_id: eventId || `sms_${generateToken(12)}`,
      idempotency_key: idempotencyKey,
      phone_number: phoneNumber,
      user_id: userId,
      agent_id: agentId,
      message_sid: messageSid,
      direction,
      from_number: fromNumber,
      to_number: toNumber,
      body,
      media_urls: mediaUrls,
      status: status || "received",
      billed_units: billedUnits || 1,
      raw_payload: rawPayload,
      received_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
      signature_valid: signatureValid,
    });
  } catch (err) {
    if (!err.message?.includes("duplicate")) {
      console.error("[storeSmsEvent] error", err.message);
    }
  }
};

/**
 * Create operational alert and send email notifications for usage alerts
 */
const createAlert = async ({ alertType, severity, userId, phoneNumber, message, details }) => {
  try {
    await supabaseAdmin.from("alerts").insert({
      alert_type: alertType,
      severity,
      user_id: userId,
      phone_number: phoneNumber,
      message,
      details,
    });
    
    // Send email for usage alerts
    if (alertType === "usage_warning" || alertType === "usage_blocked") {
      const usagePercent = details?.percent || 0;
      await sendUsageAlertEmail(userId, alertType, usagePercent, details);
    }
  } catch (err) {
    console.error("[createAlert] error", err.message);
  }
};

/**
 * Update limit_state based on usage (immediate enforcement)
 */
const evaluateUsageThresholds = async (userId, usage) => {
  if (!usage) return;
  const capSeconds = usage.call_cap_seconds || 0;
  const usedSeconds = usage.call_used_seconds || 0;
  const softThreshold = usage.soft_limit_threshold || 80;
  const hardThreshold = usage.hard_limit_threshold || 100;
  
  if (capSeconds <= 0) return;
  
  const usagePercent = (usedSeconds / capSeconds) * 100;
  let newState = "ok";
  
  if (usagePercent >= hardThreshold) {
    newState = "blocked";
  } else if (usagePercent >= softThreshold) {
    newState = "warning";
  }
  
  if (newState !== usage.limit_state) {
    await supabaseAdmin.from("usage_limits").update({
      limit_state: newState,
      ...(newState === "warning" ? { last_warning_at: new Date().toISOString() } : {}),
      ...(newState === "blocked" ? { last_block_at: new Date().toISOString() } : {}),
    }).eq("user_id", userId);
    
    if (newState === "warning") {
      await createAlert({
        alertType: "usage_warning",
        severity: "warning",
        userId,
        message: `Usage at ${Math.round(usagePercent)}% of limit`,
        details: { usedSeconds, capSeconds, percent: usagePercent },
      });
    } else if (newState === "blocked") {
      await createAlert({
        alertType: "usage_blocked",
        severity: "critical",
        userId,
        message: `Usage blocked at ${Math.round(usagePercent)}% of limit`,
        details: { usedSeconds, capSeconds, percent: usagePercent },
      });
    }
  }
};

// =============================================================================
// END OPS INFRASTRUCTURE HELPERS
// =============================================================================

const sendSmsInternal = async ({
  userId,
  to,
  body,
  leadId,
  source,
  req,
  bypassUsage = false,
}) => {
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

  if (bypassUsage) {
    // Admin view bypass: allow send without usage gating.
  } else if (usage.force_pause && !usage.force_resume) {
    throw new Error("Usage paused by admin");
  }
  if (!bypassUsage && usage.limit_state === "paused") {
    throw new Error("Usage limit reached");
  }
  const smsCap = usage.sms_cap ?? 0;
  const newSmsUsed = (usage.sms_used || 0) + 1;
  if (!bypassUsage && newSmsUsed > smsCap) {
    console.warn("[sendSms] SMS blocked: usage cap reached", {
      user_id: userId,
      sms_used: usage.sms_used,
      sms_cap: smsCap,
      grace_seconds: usage.grace_seconds ?? 600,
    });
    await supabaseAdmin
      .from("usage_limits")
      .update({ limit_state: "paused", updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    const err = new Error("Usage cap reached");
    err.code = "USAGE_CAP_REACHED";
    throw err;
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

/**
 * Send usage alert email when user hits 80% or 100% of their limit
 */
const sendUsageAlertEmail = async (userId, alertType, usagePercent, details = {}) => {
  if (!resend) {
    console.warn("[sendUsageAlertEmail] Resend not configured, skipping email");
    return;
  }
  
  try {
    // Get user email from profiles
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email, business_name")
      .eq("id", userId)
      .maybeSingle();
    
    if (!profile?.email) {
      console.warn("[sendUsageAlertEmail] No email found for user", { userId });
      return;
    }
    
    const businessName = profile.business_name || "Your Business";
    const usedMinutes = Math.ceil((details.usedSeconds || 0) / 60);
    const capMinutes = Math.ceil((details.capSeconds || 0) / 60);
    const remainingMinutes = Math.max(0, capMinutes - usedMinutes);
    const dashboardUrl = `${appBaseUrl}/dashboard`;
    const billingUrl = `${appBaseUrl}/billing`;
    
    const isWarning = alertType === "usage_warning";
    const isBlocked = alertType === "usage_blocked";
    
    const subject = isBlocked 
      ? `Action Required: ${businessName} AI Minutes Depleted`
      : `Usage Alert: ${businessName} at ${Math.round(usagePercent)}% of AI Minutes`;
    
    const headerColor = isBlocked ? "#dc2626" : "#f59e0b";
    const headerText = isBlocked 
      ? "Your AI minutes have been exhausted" 
      : "You're approaching your AI minutes limit";
    
    const actionText = isBlocked
      ? "Your AI agent is currently paused. Add more minutes to resume service."
      : "Consider upgrading your plan or purchasing additional minutes to avoid service interruption.";
    
    const ctaText = isBlocked ? "Add More Minutes" : "View Usage & Upgrade";
    const ctaUrl = isBlocked ? billingUrl : dashboardUrl;
    
    await resend.emails.send({
      from: "Kryonex Alerts <alerts@kryonextech.com>",
      to: profile.email,
      subject,
      html: `
        <div style="font-family: 'Inter', system-ui, sans-serif; color: #0f172a; background:#f8fafc; padding:24px; border-radius:20px;">
          <div style="background:${headerColor}; color:white; padding:16px; border-radius:12px; margin-bottom:20px;">
            <h2 style="margin:0; font-size:18px;">${headerText}</h2>
          </div>
          
          <p style="margin:0 0 18px; color:#475569;">${actionText}</p>
          
          <table cellspacing="0" cellpadding="0" style="width:100%; border-collapse:collapse; background:#fff; border-radius:12px; overflow:hidden; border:1px solid rgba(15,23,42,0.08); margin-bottom:20px;">
            <tr>
              <td style="padding:12px 16px; color:#475569; font-weight:600; border-bottom:1px solid #e2e8f0;">Usage</td>
              <td style="padding:12px 16px; color:#0f172a; border-bottom:1px solid #e2e8f0;">${Math.round(usagePercent)}%</td>
            </tr>
            <tr>
              <td style="padding:12px 16px; color:#475569; font-weight:600; border-bottom:1px solid #e2e8f0;">Minutes Used</td>
              <td style="padding:12px 16px; color:#0f172a; border-bottom:1px solid #e2e8f0;">${usedMinutes} / ${capMinutes}</td>
            </tr>
            <tr>
              <td style="padding:12px 16px; color:#475569; font-weight:600;">Remaining</td>
              <td style="padding:12px 16px; color:${isBlocked ? '#dc2626' : '#0f172a'}; font-weight:${isBlocked ? '700' : '400'};">${remainingMinutes} minutes</td>
            </tr>
          </table>
          
          <a href="${ctaUrl}" style="display:inline-block;padding:14px 22px;background:${isBlocked ? '#dc2626' : '#0f172a'};color:#f8fafc;text-decoration:none;border-radius:10px;font-weight:700;">
            ${ctaText}
          </a>
          
          <p style="margin:20px 0 0; color:#94a3b8; font-size:12px;">
            You're receiving this because you're the owner of ${businessName} on Kryonex.
          </p>
        </div>
      `,
    });
    
    console.log("[sendUsageAlertEmail] sent", { userId, alertType, usagePercent });
  } catch (err) {
    console.error("[sendUsageAlertEmail] error", err.message);
  }
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
            const extraMinutes = parseInt(
              session.metadata?.extra_minutes ||
                String(Math.floor((session.metadata?.call_seconds || 0) / 60)) ||
                "0",
              10
            );
            const extraSms = parseInt(
              session.metadata?.extra_sms ||
                session.metadata?.sms_count ||
                "0",
              10
            );
            if (!userId) {
              console.error("[stripe-webhook] topup missing user_id", {
                sessionId: session.id,
                metadataKeys: session.metadata
                  ? Object.keys(session.metadata)
                  : [],
              });
              return;
            }
            if (extraMinutes <= 0 && extraSms <= 0) {
              console.error("[stripe-webhook] topup missing cap metadata", {
                user_id: userId,
                topup_type: session.metadata?.topup_type || null,
                extra_minutes: extraMinutes,
                extra_sms: extraSms,
              });
              return;
            }
            const { data: usage } = await supabaseAdmin
              .from("usage_limits")
              .select("*")
              .eq("user_id", userId)
              .maybeSingle();
            let usageRow = usage;
            if (!usageRow) {
              const { data: created } = await supabaseAdmin
                .from("usage_limits")
                .insert({
                  user_id: userId,
                  call_cap_seconds: 0,
                  sms_cap: 0,
                  grace_seconds: 600,
                  call_used_seconds: 0,
                  sms_used: 0,
                  period_start: new Date().toISOString(),
                  period_end: new Date(
                    Date.now() + 30 * 24 * 60 * 60 * 1000
                  ).toISOString(),
                })
                .select("*")
                .single();
              usageRow = created || null;
            }
            if (usageRow) {
              const addedCallSeconds = Math.max(0, extraMinutes) * 60;
              const addedSms = Math.max(0, extraSms);
              const nextCallCap =
                (usageRow.call_cap_seconds || 0) + addedCallSeconds;
              const nextSmsCap = (usageRow.sms_cap || 0) + addedSms;
              const graceSeconds = usageRow.grace_seconds ?? 600;
              const underCapPlusGrace =
                (usageRow.call_used_seconds || 0) <=
                  nextCallCap + graceSeconds &&
                (usageRow.sms_used || 0) <= nextSmsCap;
              await supabaseAdmin
                .from("usage_limits")
                .update({
                  call_cap_seconds: nextCallCap,
                  sms_cap: nextSmsCap,
                  limit_state: "ok",
                  force_pause: false,
                  hard_stop_active: usageRow.hard_stop_active
                    ? !underCapPlusGrace
                    : usageRow.hard_stop_active,
                  updated_at: new Date().toISOString(),
                })
                .eq("user_id", userId);
              console.info("[stripe-webhook] topup applied", {
                user_id: userId,
                topup_type: session.metadata?.topup_type || null,
                extra_minutes: extraMinutes,
                extra_sms: extraSms,
                new_call_cap_seconds: nextCallCap,
                new_sms_cap: nextSmsCap,
              });
            }
            await auditLog({
              userId,
              action: "topup_applied",
              entity: "usage",
              entityId: session.id,
              req,
              metadata: {
                topup_type: session.metadata?.topup_type || null,
                extra_minutes: extraMinutes,
                extra_sms: extraSms,
              },
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
            return;
          }
          if (session.mode === "subscription" && session.subscription) {
            const subscription = await stripe.subscriptions.retrieve(
              session.subscription
            );
            const userId =
              session.metadata?.user_id || session.client_reference_id;
            const metaPlanTier =
              session.metadata?.planTier || session.metadata?.plan_type;
            const metaMinutesCap = session.metadata?.minutesCap;
            const metaSmsCap = session.metadata?.smsCap;

            if (!userId) {
              console.error(
                "[stripe-webhook] checkout.session.completed subscription: missing user_id, abort",
                {
                  sessionId: session.id,
                  subscriptionId: subscription.id,
                  metadataKeys: session.metadata
                    ? Object.keys(session.metadata)
                    : [],
                }
              );
            } else {
              const planType =
                metaPlanTier && String(metaPlanTier).trim() !== ""
                  ? metaPlanTier
                  : subscription.items.data?.[0]?.price?.nickname || "pro";
              if (!metaPlanTier || String(metaPlanTier).trim() === "") {
                console.warn(
                  "[stripe-webhook] checkout.session.completed: planTier missing in metadata; usage_limits from metadata skipped, plan_type fallback used",
                  { sessionId: session.id, userId, planType }
                );
              }

              await supabaseAdmin.from("subscriptions").upsert({
                user_id: userId,
                customer_id: subscription.customer,
                status: subscription.status,
                plan_type: planType,
                current_period_end: new Date(
                  subscription.current_period_end * 1000
                ).toISOString(),
              });
              await supabaseAdmin
                .from("profiles")
                .update({ role: "active", onboarding_step: 3 })
                .eq("user_id", userId);

              if (
                metaMinutesCap != null &&
                metaSmsCap != null &&
                (String(metaMinutesCap).trim() !== "" ||
                  String(metaSmsCap).trim() !== "")
              ) {
                const minutesCap = Number(metaMinutesCap);
                const smsCap = Number(metaSmsCap);
                if (
                  Number.isFinite(minutesCap) &&
                  Number.isFinite(smsCap) &&
                  minutesCap >= 0 &&
                  smsCap >= 0
                ) {
                  const { data: existingUsage } = await supabaseAdmin
                    .from("usage_limits")
                    .select("id, user_id")
                    .eq("user_id", userId)
                    .maybeSingle();
                  if (existingUsage) {
                    await supabaseAdmin
                      .from("usage_limits")
                      .update({
                        call_cap_seconds: Math.round(minutesCap * 60),
                        sms_cap: Math.round(smsCap),
                        updated_at: new Date().toISOString(),
                      })
                      .eq("user_id", userId);
                  } else {
                    const periodEnd = new Date(
                      subscription.current_period_end * 1000
                    ).toISOString();
                    const periodStart = new Date().toISOString();
                    await supabaseAdmin.from("usage_limits").insert({
                      user_id: userId,
                      call_cap_seconds: Math.round(minutesCap * 60),
                      sms_cap: Math.round(smsCap),
                      grace_seconds: 600,
                      call_used_seconds: 0,
                      sms_used: 0,
                      period_start: periodStart,
                      period_end: periodEnd,
                    });
                  }
                } else {
                  console.error(
                    "[stripe-webhook] invalid minutesCap/smsCap in metadata",
                    { userId, metaMinutesCap, metaSmsCap, sessionId: session.id }
                  );
                }
              }

              await auditLog({
                userId,
                action: "subscription_activated",
                entity: "subscription",
                entityId: subscription.id,
                req,
                metadata: {
                  status: subscription.status,
                  plan_type: planType,
                  minutesCap: metaMinutesCap,
                  smsCap: metaSmsCap,
                },
              });
              await logEvent({
                userId,
                actionType: "PLAN_UPGRADED",
                req,
                metaData: {
                  transaction_id: session.id,
                  status: subscription.status,
                  plan_type: planType,
                },
              });

              try {
                const deployResult = await deployAgentForUser(userId);
                if (deployResult.error) {
                  console.warn("[stripe-webhook] deployAgentForUser failed", {
                    userId,
                    error: deployResult.error,
                  });
                } else {
                  console.info("[stripe-webhook] agent provisioned", {
                    userId,
                    phone_number: deployResult.phone_number,
                  });
                }
              } catch (deployErr) {
                console.error("[stripe-webhook] deployAgentForUser threw", {
                  userId,
                  message: deployErr.message,
                });
              }

              // REFERRAL SYSTEM: Process first payment
              try {
                const { data: referral } = await supabaseAdmin
                  .from("referrals")
                  .select("*")
                  .eq("referred_id", userId)
                  .eq("status", "pending")
                  .maybeSingle();
                
                if (referral) {
                  const { data: settings } = await supabaseAdmin
                    .from("referral_settings")
                    .select("*")
                    .eq("id", 1)
                    .maybeSingle();
                  
                  const holdDays = settings?.hold_days || 30;
                  const eligibleAt = new Date();
                  eligibleAt.setDate(eligibleAt.getDate() + holdDays);
                  
                  // Update referral with first payment info
                  await supabaseAdmin
                    .from("referrals")
                    .update({
                      first_payment_at: new Date().toISOString(),
                      eligible_at: eligibleAt.toISOString(),
                      updated_at: new Date().toISOString(),
                    })
                    .eq("id", referral.id);
                  
                  console.info("[stripe-webhook] Referral first payment recorded", {
                    referral_id: referral.id,
                    referrer_id: referral.referrer_id,
                    referred_id: userId,
                    eligible_at: eligibleAt.toISOString(),
                  });
                }
              } catch (refErr) {
                console.error("[stripe-webhook] Referral processing error:", refErr.message);
              }
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

            // REFERRAL SYSTEM: Process recurring commission
            try {
              const { data: referral } = await supabaseAdmin
                .from("referrals")
                .select("*")
                .eq("referred_id", userId)
                .in("status", ["pending", "eligible"])
                .maybeSingle();
              
              if (referral) {
                const { data: settings } = await supabaseAdmin
                  .from("referral_settings")
                  .select("*")
                  .eq("id", 1)
                  .maybeSingle();
                
                const now = new Date();
                const eligibleAt = referral.eligible_at ? new Date(referral.eligible_at) : null;
                
                // Check if past hold period (30 days)
                if (eligibleAt && now >= eligibleAt) {
                  // Check for fraud flags
                  const hasSeriousFraud = (referral.fraud_flags || []).some(f => 
                    f.type === "same_payment_method" || f.type === "self_referral"
                  );
                  
                  if (hasSeriousFraud) {
                    // Reject the referral
                    await supabaseAdmin
                      .from("referrals")
                      .update({
                        status: "rejected",
                        rejection_reason: "Fraud detected",
                        updated_at: now.toISOString(),
                      })
                      .eq("id", referral.id);
                    console.warn("[stripe-webhook] Referral rejected due to fraud flags", { referral_id: referral.id });
                  } else {
                    const maxMonths = settings?.max_months || 12;
                    const monthlyPercent = settings?.monthly_percent || 10;
                    const upfrontCents = settings?.upfront_amount_cents || 2500;
                    const autoApproveCents = settings?.auto_approve_under_cents || 10000;
                    
                    // Mark as eligible if not already
                    if (referral.status === "pending") {
                      await supabaseAdmin
                        .from("referrals")
                        .update({
                          status: "eligible",
                          updated_at: now.toISOString(),
                        })
                        .eq("id", referral.id);
                    }
                    
                    // Process upfront bonus (once)
                    if (!referral.upfront_paid) {
                      const upfrontStatus = upfrontCents <= autoApproveCents ? "approved" : "pending";
                      await supabaseAdmin.from("referral_commissions").insert({
                        referral_id: referral.id,
                        referrer_id: referral.referrer_id,
                        amount_cents: upfrontCents,
                        commission_type: "upfront",
                        month_number: null,
                        status: upfrontStatus,
                        stripe_invoice_id: invoice.id,
                        stripe_subscription_id: invoice.subscription || null,
                      });
                      
                      await supabaseAdmin
                        .from("referrals")
                        .update({
                          upfront_paid: true,
                          upfront_paid_at: now.toISOString(),
                          total_commission_cents: (referral.total_commission_cents || 0) + upfrontCents,
                          updated_at: now.toISOString(),
                        })
                        .eq("id", referral.id);
                      
                      console.info("[stripe-webhook] Referral upfront commission created", {
                        referral_id: referral.id,
                        amount_cents: upfrontCents,
                        status: upfrontStatus,
                      });
                    }
                    
                    // Process monthly commission (up to 12 months)
                    const monthsPaid = referral.months_paid || 0;
                    if (monthsPaid < maxMonths) {
                      const invoiceAmountCents = invoice.amount_paid || 0;
                      const commissionCents = Math.floor(invoiceAmountCents * (monthlyPercent / 100));
                      
                      if (commissionCents > 0) {
                        const monthlyStatus = commissionCents <= autoApproveCents ? "approved" : "pending";
                        await supabaseAdmin.from("referral_commissions").insert({
                          referral_id: referral.id,
                          referrer_id: referral.referrer_id,
                          amount_cents: commissionCents,
                          commission_type: "monthly",
                          month_number: monthsPaid + 1,
                          status: monthlyStatus,
                          stripe_invoice_id: invoice.id,
                          stripe_subscription_id: invoice.subscription || null,
                        });
                        
                        await supabaseAdmin
                          .from("referrals")
                          .update({
                            months_paid: monthsPaid + 1,
                            total_commission_cents: (referral.total_commission_cents || 0) + commissionCents,
                            updated_at: now.toISOString(),
                          })
                          .eq("id", referral.id);
                        
                        console.info("[stripe-webhook] Referral monthly commission created", {
                          referral_id: referral.id,
                          month: monthsPaid + 1,
                          amount_cents: commissionCents,
                          status: monthlyStatus,
                        });
                      }
                    }
                  }
                }
              }
            } catch (refErr) {
              console.error("[stripe-webhook] Referral commission error:", refErr.message);
            }
          }
        }

        // REFERRAL SYSTEM: Handle refunds (clawback)
        if (event.type === "charge.refunded") {
          const charge = event.data.object;
          const customerId = charge.customer;
          const userId = customerId ? await lookupUserIdByCustomerId(customerId) : null;
          
          if (userId) {
            try {
              // Find referral for this user
              const { data: referral } = await supabaseAdmin
                .from("referrals")
                .select("id, referrer_id, status")
                .eq("referred_id", userId)
                .maybeSingle();
              
              if (referral && referral.status !== "clawed_back") {
                // Clawback all commissions
                await supabaseAdmin
                  .from("referral_commissions")
                  .update({ status: "clawed_back" })
                  .eq("referral_id", referral.id);
                
                await supabaseAdmin
                  .from("referrals")
                  .update({
                    status: "clawed_back",
                    rejection_reason: "Refund processed",
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", referral.id);
                
                console.warn("[stripe-webhook] Referral clawed back due to refund", {
                  referral_id: referral.id,
                  charge_id: charge.id,
                });
                
                // Alert admin
                await supabaseAdmin.from("alerts").insert({
                  alert_type: "referral_clawback",
                  severity: "warning",
                  user_id: referral.referrer_id,
                  message: "Referral commission clawed back due to refund",
                  details: { referral_id: referral.id, charge_id: charge.id },
                });
              }
            } catch (clawErr) {
              console.error("[stripe-webhook] Clawback error:", clawErr.message);
            }
          }
        }

        // REFERRAL SYSTEM: Handle disputes/chargebacks (clawback)
        if (event.type === "charge.dispute.created") {
          const dispute = event.data.object;
          const chargeId = dispute.charge;
          
          try {
            // Get the charge to find the customer
            const charge = await stripe.charges.retrieve(chargeId);
            const customerId = charge?.customer;
            const userId = customerId ? await lookupUserIdByCustomerId(customerId) : null;
            
            if (userId) {
              const { data: referral } = await supabaseAdmin
                .from("referrals")
                .select("id, referrer_id, status")
                .eq("referred_id", userId)
                .maybeSingle();
              
              if (referral && referral.status !== "clawed_back") {
                // Clawback all commissions
                await supabaseAdmin
                  .from("referral_commissions")
                  .update({ status: "clawed_back" })
                  .eq("referral_id", referral.id);
                
                await supabaseAdmin
                  .from("referrals")
                  .update({
                    status: "clawed_back",
                    rejection_reason: "Chargeback/dispute filed",
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", referral.id);
                
                console.warn("[stripe-webhook] Referral clawed back due to dispute", {
                  referral_id: referral.id,
                  dispute_id: dispute.id,
                });
                
                // Alert admin
                await supabaseAdmin.from("alerts").insert({
                  alert_type: "referral_clawback",
                  severity: "critical",
                  user_id: referral.referrer_id,
                  message: "Referral commission clawed back due to chargeback",
                  details: { referral_id: referral.id, dispute_id: dispute.id },
                });
              }
            }
          } catch (disputeErr) {
            console.error("[stripe-webhook] Dispute clawback error:", disputeErr.message);
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

/** Single source of truth: tier → Stripe price ID + minutes/SMS caps. Used by /admin/stripe-link and webhook metadata. */
const PLAN_TIERS = ["pro", "elite", "scale"];
const PLAN_CONFIG = {
  pro: {
    priceId: STRIPE_PRICE_ID_PRO || STRIPE_PRICE_ID_HVAC,
    minutesCap: 300,
    smsCap: 1000,
  },
  elite: {
    priceId: STRIPE_PRICE_ID_ELITE || STRIPE_PRICE_ID_PLUMBING,
    minutesCap: 800,
    smsCap: 3000,
  },
  scale: {
    priceId: STRIPE_PRICE_ID_SCALE,
    minutesCap: 3000,
    smsCap: 5000,
  },
};

const resolvePlanTierFromPriceId = (priceId) => {
  if (!priceId) return null;
  if (priceId === STRIPE_PRICE_ID_SCALE) return "scale";
  if ([STRIPE_PRICE_ID_ELITE, STRIPE_PRICE_ID_PLUMBING].includes(priceId)) {
    return "elite";
  }
  if (priceId === STRIPE_PRICE_ID_CORE) return "core";
  if ([STRIPE_PRICE_ID_PRO, STRIPE_PRICE_ID_HVAC].includes(priceId)) {
    return "pro";
  }
  return null;
};

const getPlanCaps = (planTier) => {
  const tier = String(planTier || "").toLowerCase();
  if (PLAN_CONFIG[tier]) {
    return {
      minutesCap: PLAN_CONFIG[tier].minutesCap,
      smsCap: PLAN_CONFIG[tier].smsCap,
    };
  }
  const fallback = planConfig(tier || "core");
  return {
    minutesCap: fallback.call_minutes,
    smsCap: fallback.sms_count,
  };
};

const isValidEmailFormat = (value) => {
  const s = String(value || "").trim();
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 256;
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
      hard_stop_active: false,
      period_start: new Date().toISOString(),
      period_end: nextEnd.toISOString(),
    })
    .eq("user_id", usage.user_id)
    .select("*")
    .single();
  return data || usage;
};

const findAuthUserByEmail = async (email) => {
  const target = String(email || "").trim().toLowerCase();
  if (!target) return null;
  let page = 1;
  while (page <= 10) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;
    const users = data?.users || [];
    const match = users.find(
      (user) => String(user.email || "").toLowerCase() === target
    );
    if (match) return match;
    if (users.length < 1000) break;
    page += 1;
  }
  return null;
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

/**
 * Enhanced dashboard stats with time breakdowns, rates, and trends
 */
const getEnhancedDashboardStats = async (userId) => {
  const avgJobValue = 450;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).toISOString();
  
  // Parallel queries for efficiency
  const [
    allLeadsResult,
    todayLeadsResult,
    weekLeadsResult,
    bookedLeadsResult,
    lastLeadResult,
    avgDurationResult,
    todayApptsResult,
    weekApptsResult,
    allApptsResult
  ] = await Promise.all([
    // All time leads count
    supabaseAdmin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    
    // Today's leads
    supabaseAdmin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", todayStart),
    
    // This week's leads
    supabaseAdmin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", weekStart),
    
    // Booked leads (for booking rate)
    supabaseAdmin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", ["Booked", "booked", "confirmed"]),
    
    // Most recent lead for "last call"
    supabaseAdmin
      .from("leads")
      .select("created_at, name, summary")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    
    // Average call duration
    supabaseAdmin
      .from("leads")
      .select("call_duration_seconds")
      .eq("user_id", userId)
      .not("call_duration_seconds", "is", null),
    
    // Today's appointments
    supabaseAdmin
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("start_time", todayStart),
    
    // This week's appointments
    supabaseAdmin
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("start_time", weekStart),
    
    // All appointments with job values
    supabaseAdmin
      .from("appointments")
      .select("job_value")
      .eq("user_id", userId)
  ]);
  
  // Calculate stats
  const callsAllTime = allLeadsResult.count || 0;
  const callsToday = todayLeadsResult.count || 0;
  const callsThisWeek = weekLeadsResult.count || 0;
  const bookedCount = bookedLeadsResult.count || 0;
  
  // Booking rate
  const bookingRatePercent = callsAllTime > 0 
    ? Math.round((bookedCount / callsAllTime) * 100) 
    : 0;
  
  // Average call duration
  const durations = (avgDurationResult.data || [])
    .map(r => r.call_duration_seconds)
    .filter(d => d && d > 0);
  const avgCallDurationSeconds = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;
  
  // Last call info
  const lastLead = lastLeadResult.data;
  const lastCallAt = lastLead?.created_at || null;
  const lastCallName = lastLead?.name || null;
  const lastCallSummary = lastLead?.summary || null;
  
  // Appointments
  const appointmentsToday = todayApptsResult.count || 0;
  const appointmentsThisWeek = weekApptsResult.count || 0;
  const appointmentsAllTime = (allApptsResult.data || []).length;
  
  // Pipeline value
  const jobValues = (allApptsResult.data || [])
    .map(r => Number(r.job_value))
    .filter(v => Number.isFinite(v) && v > 0);
  const pipelineValue = jobValues.length > 0
    ? jobValues.reduce((a, b) => a + b, 0)
    : bookedCount * avgJobValue;
  
  return {
    calls_today: callsToday,
    calls_this_week: callsThisWeek,
    calls_all_time: callsAllTime,
    appointments_today: appointmentsToday,
    appointments_this_week: appointmentsThisWeek,
    appointments_all_time: appointmentsAllTime,
    booking_rate_percent: bookingRatePercent,
    avg_call_duration_seconds: avgCallDurationSeconds,
    last_call_at: lastCallAt,
    last_call_name: lastCallName,
    last_call_summary: lastCallSummary,
    pipeline_value: pipelineValue,
    estimated_revenue: pipelineValue,
    avg_job_value: avgJobValue,
    booked_leads: bookedCount,
  };
};

const isAdminEmail = (email) => {
  if (!email || !ADMIN_EMAIL) return false;
  const adminEmails = ADMIN_EMAIL.split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (!adminEmails.length) return false;
  return adminEmails.includes(String(email).trim().toLowerCase());
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
    if (profile?.role !== "admin" && !isAdminEmail(req.user.email)) {
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

const isAdminViewRequest = (req) => {
  return String(req.headers["x-admin-mode"] || "").toLowerCase() === "admin";
};

/** When X-Impersonation-Mode & X-Impersonated-User-ID are set and requester is admin, set req.effectiveUserId for data scope. */
const resolveEffectiveUser = async (req, res, next) => {
  req.effectiveUserId = req.user?.id ?? null;
  const mode = String(req.headers["x-impersonation-mode"] || "").toLowerCase();
  const targetId = String(req.headers["x-impersonated-user-id"] || "").trim();
  if (mode !== "true" || !targetId) return next();
  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("user_id", req.user.id)
      .maybeSingle();
    const isAdmin =
      profile?.role === "admin" || isAdminEmail(req.user?.email);
    if (!isAdmin) return next();
    req.effectiveUserId = targetId;
  } catch {
    // leave effectiveUserId as req.user.id
  }
  return next();
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

const parseRetellVersionNumber = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const match = text.match(/\d+/);
  if (!match) return null;
  const parsed = parseInt(match[0], 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const pickMasterAgentId = (industry) => {
  if (industry && industry.toLowerCase().includes("plumb")) {
    return RETELL_MASTER_AGENT_ID_PLUMBING || null;
  }
  return RETELL_MASTER_AGENT_ID_HVAC;
};

const normalizeRetellAgent = (payload) =>
  payload?.agent || payload?.data?.agent || payload?.data || payload;

const extractToolPayload = (payload) => {
  const toolPayload = {};
  const rawTools =
    payload?.general_tools ||
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
  const stateTools = Array.isArray(payload?.states)
    ? payload.states.flatMap((state) => state?.tools || []).filter(Boolean)
    : [];
  const toolCount =
    (Array.isArray(rawTools) ? rawTools.length : 0) + stateTools.length;
  return { toolPayload, toolCount };
};

const fetchLlmTools = async ({ llmId, llmVersion }) => {
  if (!llmId) return null;
  const attempts = [
    { path: `/get-retell-llm/${encodeURIComponent(llmId)}` },
    llmVersion !== null
      ? {
          path: `/get-retell-llm/${encodeURIComponent(llmId)}?version=${encodeURIComponent(
            llmVersion
          )}`,
        }
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
      
      // Also insert into appointments table so it appears in calendar UI
      const { data: appointmentData, error: appointmentError } = await supabaseAdmin
        .from("appointments")
        .insert({
          user_id: userId,
          customer_name: args.customer_name || booking?.attendee?.name || "Customer",
          customer_phone: args.customer_phone || booking?.attendee?.phoneNumber || null,
          start_time: booking?.start || start.toISOString(),
          end_time: booking?.end || end.toISOString(),
          location: args.service_address || args.location || null,
          notes: args.service_issue || args.notes || `Booked via Cal.com`,
          status: "booked",
          cal_booking_uid: booking?.uid || booking?.id || null,
        })
        .select("*")
        .single();
      
      if (appointmentError) {
        console.warn("[book_appointment] Cal.com booking succeeded but DB insert failed", {
          userId,
          booking_uid: booking?.uid,
          error: appointmentError.message,
        });
      }
      
      await logEvent({
        userId,
        actionType: "APPOINTMENT_BOOKED",
        metaData: {
          booking_uid: booking?.uid || booking?.id || null,
          appointment_id: appointmentData?.id || null,
          start: booking?.start || start.toISOString(),
          source: "cal.com",
        },
      });
      return { ok: true, source: "cal.com", booking, appointment: appointmentData };
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
        const calComUrl = username
          ? `https://cal.com/${username}/service-call`
          : null;
        bookingUrl =
          calComUrl ||
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
            cal_com_url: calComUrl,
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
      `${FRONTEND_URL}/dashboard?cal_status=success&status=success`
    );
  } catch (err) {
    return res.redirect(`${FRONTEND_URL}/dashboard?cal_status=error&status=error`);
  }
});

app.get("/api/calcom/status", requireAuth, resolveEffectiveUser, async (req, res) => {
  const uid = req.effectiveUserId ?? req.user.id;
  const [{ data: profile }, { data: integration }] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("cal_com_url")
      .eq("user_id", uid)
      .maybeSingle(),
    supabaseAdmin
      .from("integrations")
      .select("is_active, access_token, booking_url")
      .eq("user_id", uid)
      .eq("provider", "calcom")
      .maybeSingle(),
  ]);
  const calUrl = profile?.cal_com_url || integration?.booking_url || null;
  const connected = Boolean(calUrl);
  return res.json({ connected, cal_com_url: calUrl });
});

app.post("/api/calcom/disconnect", requireAuth, resolveEffectiveUser, async (req, res) => {
  try {
    const uid = req.effectiveUserId ?? req.user.id;
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
      .eq("user_id", uid)
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
        cal_com_url: null,
      })
      .eq("user_id", uid);
    return res.json({ connected: false });
  } catch (err) {
    return res.status(500).json({ error: "Unable to disconnect calendar" });
  }
});

const retellWebhookHandler = async (req, res) => {
  try {
    lastRetellWebhookAt = new Date().toISOString();
    // Note: Retell uses x-retell-signature header with HMAC, not a simple secret
    // For now, we skip verification - the webhook URL is private and only known to Retell
    // TODO: Implement proper HMAC signature verification per Retell docs if needed
    const payload = req.body || {};
    const eventType =
      payload.event_type || payload.event || payload.type || "unknown";
    const call = payload.call || payload.data || {};

    // Debug logging - see exactly what Retell sends
    console.log("📞 [retell-webhook] received:", {
      eventType,
      call_id: call.call_id || payload.call_id,
      agent_id: call.agent_id || payload.agent_id,
      duration_ms: call.duration_ms || payload.duration_ms,
      duration_seconds: call.duration_seconds || payload.duration_seconds,
      from_number: call.from_number || payload.from_number,
      to_number: call.to_number || payload.to_number,
      payload_keys: Object.keys(payload),
      call_keys: Object.keys(call),
    });

    if (eventType === "call_started" || eventType === "call_initiated") {
      const agentId = call.agent_id || payload.agent_id;
      const callId = call.call_id || payload.call_id || payload.id || null;
      const toNumber = call.to_number || payload.to_number || null;
      
      // Normalize to_number for lookup
      let normalizedToNumber = null;
      if (toNumber) {
        const digits = String(toNumber).replace(/\D/g, "");
        normalizedToNumber = digits.length === 10
          ? `+1${digits}`
          : digits.length === 11 && digits.startsWith("1")
            ? `+${digits}`
            : String(toNumber).trim();
      }

      // PHONE NUMBER IS THE ONLY LOOKUP METHOD - NO AGENT_ID FALLBACK
      let agentRow = null;
      if (normalizedToNumber) {
        const { data: phoneRow } = await supabaseAdmin
          .from("agents")
          .select("user_id")
          .eq("phone_number", normalizedToNumber)
          .maybeSingle();
        if (phoneRow?.user_id) agentRow = phoneRow;
      }

      if (agentRow?.user_id) {
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
        const capSeconds = usage.call_cap_seconds || 0;
        const graceSeconds = usage.grace_seconds ?? 600;
        const usedSeconds = usage.call_used_seconds || 0;
        const overCapPlusGrace = usedSeconds >= capSeconds + graceSeconds;
        const hardStop = usage.hard_stop_active === true || overCapPlusGrace;
        const { remaining } = getUsageRemaining(usage);
        if (
          hardStop ||
          (usage.force_pause && !usage.force_resume) ||
          usage.limit_state === "paused" ||
          remaining <= 0
        ) {
          if (hardStop) {
            console.warn(
              "[retell call_started] call blocked: over cap+grace or hard_stop_active",
              {
                user_id: agentRow.user_id,
                call_used_seconds: usedSeconds,
                call_cap_seconds: capSeconds,
                grace_seconds: graceSeconds,
                hard_stop_active: usage.hard_stop_active,
              }
            );
          }
          await supabaseAdmin
            .from("usage_limits")
            .update({
              limit_state: "paused",
              force_pause: true,
              force_resume: false,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", agentRow.user_id);
          await auditLog({
            userId: agentRow.user_id,
            action: "usage_blocked_call",
            entity: "usage",
            entityId: agentId,
            req,
            metadata: { call_id: callId, hard_stop: hardStop },
          });
          return res.status(402).json({ error: "Usage limit reached" });
        }
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
      console.log("📞 [call_ended] processing call_ended event...");
      const transcript = call.transcript || payload.transcript || "";
      const extractedVars =
        payload.variables ||
        call.variables ||
        call.retell_llm_dynamic_variables ||
        payload.retell_llm_dynamic_variables ||
        null;
      
      // POST-CALL ANALYSIS - Retell AI extracts structured data from transcript
      const postCallAnalysis = 
        call.call_analysis ||
        payload.call_analysis ||
        call.post_call_analysis ||
        payload.post_call_analysis ||
        {};
      
      // Extract specific fields from post-call analysis
      const analysisData = {
        customer_name: postCallAnalysis.customer_name || postCallAnalysis.caller_name || null,
        customer_phone: postCallAnalysis.customer_phone || postCallAnalysis.phone_number || null,
        service_address: postCallAnalysis.service_address || postCallAnalysis.address || null,
        issue_type: postCallAnalysis.issue_type || postCallAnalysis.service_type || null,
        issue_description: postCallAnalysis.issue_description || postCallAnalysis.problem_description || null,
        appointment_booked: postCallAnalysis.appointment_booked ?? postCallAnalysis.booked ?? null,
        call_outcome: postCallAnalysis.call_outcome || postCallAnalysis.outcome || null,
        call_successful: postCallAnalysis.call_successful ?? null,
        call_summary: postCallAnalysis.user_summary || postCallAnalysis.summary || postCallAnalysis.call_summary || null,
      };
      
      console.log("📞 [call_ended] post-call analysis data:", {
        hasAnalysis: Object.keys(postCallAnalysis).length > 0,
        analysisData,
        rawAnalysisKeys: Object.keys(postCallAnalysis),
      });
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

      // Extract phone numbers for lookup - to_number is our golden key for tracking
      const toNumber = call.to_number || payload.to_number || null;
      const fromNumber = call.from_number || payload.from_number || null;
      
      // Normalize to_number to E.164 for consistent DB lookup
      let normalizedToNumber = null;
      if (toNumber) {
        const digits = String(toNumber).replace(/\D/g, "");
        normalizedToNumber = digits.length === 10
          ? `+1${digits}`
          : digits.length === 11 && digits.startsWith("1")
            ? `+${digits}`
            : String(toNumber).trim();
      }

      console.log("📞 [call_ended] parsed values:", {
        agentId,
        callId,
        durationSeconds,
        disposition,
        hasTranscript: transcript.length > 0,
        toNumber: normalizedToNumber,
        fromNumber,
      });

      // PHONE NUMBER IS THE ONLY LOOKUP METHOD - NO AGENT_ID FALLBACK
      // This prevents accidental mis-attribution if multiple numbers share an agent
      let agentRow = null;

      if (normalizedToNumber) {
        const { data: phoneRow } = await supabaseAdmin
          .from("agents")
          .select("user_id, agent_id, phone_number, post_call_sms_enabled, post_call_sms_template, post_call_sms_delay_seconds")
          .eq("phone_number", normalizedToNumber)
          .maybeSingle();
        
        if (phoneRow?.user_id) {
          agentRow = phoneRow;
        }
      }

      console.log("📞 [call_ended] agent lookup (phone_number ONLY):", {
        toNumber: normalizedToNumber,
        found: !!agentRow,
        user_id: agentRow?.user_id || null,
      });

      // FAILSAFE: If we can't find the owner, DO NOT attribute to anyone
      // This prevents accidentally charging the wrong user
      if (!agentRow?.user_id) {
        console.error("📞 [call_ended] FAILSAFE: Cannot determine call owner, skipping attribution", {
          toNumber: normalizedToNumber,
          agentId,
          callId,
        });
        // Store in unknown_phone for manual review
        await storeUnknownPhone({
          phoneNumber: normalizedToNumber || agentId || "unknown",
          eventType: "call_ended_unattributed",
          rawPayload: payload,
        });
        // Return 200 so Retell doesn't retry, but we didn't process it
        return res.json({ received: true, warning: "Could not attribute call to user" });
      }

      // Extract data with priority: post-call analysis > extracted vars > regex fallback
      const regexExtracted = extractLead(transcript);
      
      // Determine best values (post-call AI analysis is most reliable)
      const bestName = 
        analysisData.customer_name || 
        extractedVars?.customer_name || 
        regexExtracted.name || 
        null;
      const bestPhone = 
        analysisData.customer_phone || 
        extractedVars?.customer_phone || 
        regexExtracted.phone || 
        fromNumber ||
        null;
      const bestSummary = 
        analysisData.call_summary || 
        analysisData.issue_description ||
        regexExtracted.summary || 
        null;
      const bestSentiment = 
        postCallAnalysis.user_sentiment || 
        regexExtracted.sentiment || 
        "neutral";
      
      // Determine call outcome status
      let leadStatus = "New";
      if (analysisData.appointment_booked === true) {
        leadStatus = "Booked";
      } else if (analysisData.call_outcome === "transferred") {
        leadStatus = "Transferred";
      } else if (analysisData.call_outcome === "callback") {
        leadStatus = "Callback Requested";
      } else if (analysisData.call_outcome === "declined" || analysisData.call_outcome === "not_interested") {
        leadStatus = "Not Interested";
      }
      
      console.log("📞 [call_ended] lead extraction results:", {
        bestName,
        bestPhone,
        bestSummary: bestSummary?.substring(0, 50),
        bestSentiment,
        leadStatus,
        sources: {
          fromPostCallAnalysis: !!analysisData.customer_name,
          fromExtractedVars: !!extractedVars?.customer_name,
          fromRegex: !!regexExtracted.name,
        },
      });
      
      const { error: leadError } = await supabaseAdmin.from("leads").insert({
        user_id: agentRow.user_id,
        owner_id: agentRow.user_id,
        agent_id: agentId,
        name: bestName,
        phone: bestPhone,
        status: leadStatus,
        summary: bestSummary,
        transcript,
        sentiment: bestSentiment,
        recording_url: recordingUrl,
        call_duration_seconds: durationSeconds || null,
        // Post-call analysis fields (direct columns for easier querying)
        service_address: analysisData.service_address || null,
        issue_type: analysisData.issue_type || null,
        call_outcome: analysisData.call_outcome || null,
        appointment_booked: analysisData.appointment_booked === true,
        // Full metadata for debugging/reference
        metadata: {
          post_call_analysis: Object.keys(postCallAnalysis).length > 0 ? postCallAnalysis : null,
          extracted_vars: extractedVars || null,
          regex_extracted: regexExtracted || null,
          from_number: fromNumber || null,
          to_number: normalizedToNumber || null,
        },
      });

      if (leadError) {
        return res.status(500).json({ error: leadError.message });
      }
      
      // Store call event (completed)
      const idempotencyKey = callId || generateIdempotencyKey(payload);
      await storeCallEvent({
        eventId: callId,
        idempotencyKey,
        phoneNumber: call.to_number || payload.to_number || "",
        userId: agentRow.user_id,
        agentId,
        callSid: callId,
        direction: call.direction || "inbound",
        fromNumber: call.from_number || payload.from_number,
        toNumber: call.to_number || payload.to_number,
        endTime: new Date().toISOString(),
        durationSeconds,
        billedSeconds: durationSeconds,
        callStatus: "completed",
        disconnectReason: disposition,
        recordingUrl,
        transcriptId: null,
        agentUsed: agentId,
        rawPayload: payload,
      });
      
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

      // POST-CALL SMS FOLLOW-UP AUTOMATION
      try {
        // Check if post-call SMS is enabled for this agent
        if (agentRow.post_call_sms_enabled && bestPhone) {
          const delayMs = (agentRow.post_call_sms_delay_seconds || 60) * 1000;
          
          // Get user's profile for business name
          const { data: userProfile } = await supabaseAdmin
            .from("profiles")
            .select("business_name")
            .eq("user_id", agentRow.user_id)
            .maybeSingle();
          
          const businessName = userProfile?.business_name || agentRow.business_name || "our team";
          
          // Replace template variables
          let smsBody = agentRow.post_call_sms_template || "Thanks for calling {business}! We appreciate your call and will follow up shortly if needed.";
          smsBody = smsBody.replace(/\{business\}/gi, businessName);
          smsBody = smsBody.replace(/\{customer_name\}/gi, bestName || "");
          
          // Log the automation attempt
          await supabaseAdmin.from("sms_automation_log").insert({
            user_id: agentRow.user_id,
            lead_id: null, // We don't have the lead ID yet
            automation_type: "post_call",
            to_number: bestPhone,
            message_body: smsBody,
            status: "pending",
            metadata: { delay_ms: delayMs, call_id: callId },
          });
          
          // Schedule the SMS with delay
          setTimeout(async () => {
            try {
              await sendSmsInternal({
                userId: agentRow.user_id,
                agentId: agentRow.id,
                to: bestPhone,
                body: smsBody,
                leadId: null,
                source: "auto_post_call",
              });
              
              // Update automation log
              await supabaseAdmin
                .from("sms_automation_log")
                .update({ status: "sent", sent_at: new Date().toISOString() })
                .eq("to_number", bestPhone)
                .eq("automation_type", "post_call")
                .eq("status", "pending")
                .order("created_at", { ascending: false })
                .limit(1);
                
              console.log("📱 [post_call_sms] Sent follow-up SMS to", bestPhone);
            } catch (smsErr) {
              console.error("📱 [post_call_sms] Failed to send:", smsErr.message);
              await supabaseAdmin
                .from("sms_automation_log")
                .update({ status: "failed", error_message: smsErr.message })
                .eq("to_number", bestPhone)
                .eq("automation_type", "post_call")
                .eq("status", "pending")
                .order("created_at", { ascending: false })
                .limit(1);
            }
          }, delayMs);
          
          console.log("📱 [post_call_sms] Scheduled follow-up SMS in", delayMs, "ms");
        }
      } catch (postCallSmsErr) {
        console.error("📱 [post_call_sms] Error setting up post-call SMS:", postCallSmsErr.message);
      }

      console.log("📞 [call_ended] checking durationSeconds:", { durationSeconds, willUpdateUsage: durationSeconds > 0 });

      if (durationSeconds > 0) {
        console.log("📞 [call_ended] updating usage for user:", agentRow.user_id);
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

        console.log("📞 [call_ended] current usage:", {
          call_used_seconds: usage.call_used_seconds,
          call_cap_seconds: usage.call_cap_seconds,
          addingSeconds: durationSeconds,
        });

        const updatedUsed = (usage.call_used_seconds || 0) + durationSeconds;
        const capSeconds = usage.call_cap_seconds || 0;
        const graceSeconds = usage.grace_seconds ?? 600;
        const hardStopThreshold = capSeconds + graceSeconds;
        const overCapPlusGrace = updatedUsed > hardStopThreshold;
        if (overCapPlusGrace) {
          console.warn(
            "[retell call_ended] user over cap+grace, setting hard_stop_active",
            {
              user_id: agentRow.user_id,
              newCallUsed: updatedUsed,
              call_cap_seconds: capSeconds,
              grace_seconds: graceSeconds,
            }
          );
        }
        const graceLimit =
          capSeconds +
          graceSeconds +
          (usage.call_credit_seconds || 0) +
          (usage.rollover_seconds || 0);
        let nextState = usage.limit_state;
        if (updatedUsed >= graceLimit) {
          nextState = "paused";
        } else if (updatedUsed >= capSeconds) {
          nextState = "pending";
        }
        const { total, remaining } = getUsageRemaining({
          ...usage,
          call_used_seconds: updatedUsed,
        });
        const shouldForcePause = remaining <= 0;
        if (shouldForcePause) {
          nextState = "paused";
        }

        await supabaseAdmin.from("usage_calls").insert({
          user_id: agentRow.user_id,
          agent_id: agentId,
          call_id: callId,
          seconds: durationSeconds,
          cost_cents: 0,
        });

        const { error: updateError } = await supabaseAdmin
          .from("usage_limits")
          .update({
            call_used_seconds: updatedUsed,
            limit_state: nextState,
            force_pause: shouldForcePause ? true : usage.force_pause,
            force_resume: shouldForcePause ? false : usage.force_resume,
            hard_stop_active: overCapPlusGrace ? true : (usage.hard_stop_active ?? false),
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", agentRow.user_id);

        console.log("📞 [call_ended] usage_limits updated:", {
          user_id: agentRow.user_id,
          newCallUsedSeconds: updatedUsed,
          newCallUsedMinutes: Math.ceil(updatedUsed / 60),
          error: updateError?.message || null,
        });

        await supabaseAdmin.from("usage_snapshots").insert({
          user_id: agentRow.user_id,
          source: "call_ended",
          minutes_used: Math.ceil(updatedUsed / 60),
          cap_minutes: Math.ceil(total / 60),
          remaining_minutes: Math.ceil(remaining / 60),
        });

        // Evaluate usage thresholds and trigger alerts/emails if needed
        await evaluateUsageThresholds(agentRow.user_id, {
          ...usage,
          call_used_seconds: updatedUsed,
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

      const wizardMaintenance =
        String(WIZARD_MAINTENANCE_MODE || "").toLowerCase() === "true";
      const adminBypass =
        profile?.role === "admin" && isAdminViewRequest(req);
      if (wizardMaintenance && !adminBypass) {
        return res.status(503).json({
          error: "Wizard temporarily disabled. Please contact support.",
        });
      }

      if (!adminBypass) {
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
      const llmVersionNumber = parseRetellVersionNumber(llmVersion);
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

      const sourceAgentId = pickMasterAgentId(industry);
      if (!sourceAgentId) {
        return res.status(500).json({
          error: "Missing master agent id for industry",
          details: industry?.toLowerCase()?.includes("plumb")
            ? "Set RETELL_MASTER_AGENT_ID_PLUMBING in the backend environment."
            : "Set RETELL_MASTER_AGENT_ID_HVAC in the backend environment.",
        });
      }

      const copyResponse = await retellClient.post(
        `/copy-agent/${encodeURIComponent(sourceAgentId)}`,
        {}
      );
      const copiedAgent = normalizeRetellAgent(copyResponse.data);
      const agentId =
        copiedAgent?.agent_id ||
        copiedAgent?.id ||
        copyResponse.data?.agent_id ||
        copyResponse.data?.id;
      if (!agentId) {
        return res.status(500).json({ error: "Retell agent_id missing" });
      }
      const updatePayload = {
        agent_name: `${businessName} AI Agent`,
        retell_llm_dynamic_variables: dynamicVars,
        webhook_url: `${serverBaseUrl.replace(/\/$/, "")}/retell-webhook`,
        webhook_timeout_ms: 10000,
        voice_id: resolvedVoiceId,
      };
      if (finalPrompt) {
        updatePayload.prompt = finalPrompt;
      }
      await retellClient.patch(`/update-agent/${agentId}`, updatePayload);

      console.info("[retell] agent copied", {
        agent_id: agentId,
        llm_id: llmId,
        llm_version: llmVersionNumber,
        source_agent_id: sourceAgentId,
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
  const llmVersion = parseRetellVersionNumber(pickLlmVersion(derivedIndustry));
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
      if (llmVersion !== null) {
        responseEngine.version = llmVersion;
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

app.get("/dashboard-stats", requireAuth, resolveEffectiveUser, async (req, res) => {
  try {
    const uid = req.effectiveUserId ?? req.user.id;
    const stats = await getDashboardStats(uid);
    return res.json(stats);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/dashboard/stats", requireAuth, resolveEffectiveUser, async (req, res) => {
  try {
    const uid = req.effectiveUserId ?? req.user.id;
    const stats = await getDashboardStats(uid);
    return res.json(stats);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Enhanced dashboard stats with time breakdowns and metrics
app.get("/api/dashboard/stats-enhanced", requireAuth, resolveEffectiveUser, async (req, res) => {
  try {
    const uid = req.effectiveUserId ?? req.user.id;
    const stats = await getEnhancedDashboardStats(uid);
    return res.json(stats);
  } catch (err) {
    console.error("[stats-enhanced] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Analytics endpoint with charts data
app.get("/api/analytics", requireAuth, resolveEffectiveUser, async (req, res) => {
  try {
    const uid = req.effectiveUserId ?? req.user.id;
    const period = req.query.period || "7d";
    
    // Calculate date range based on period
    const now = new Date();
    let daysBack = 7;
    if (period === "30d") daysBack = 30;
    if (period === "90d") daysBack = 90;
    
    const startDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000).toISOString();
    
    // Fetch all leads in the period
    const { data: leads, error: leadsError } = await supabaseAdmin
      .from("leads")
      .select("id, created_at, status, sentiment, call_duration_seconds, call_outcome, appointment_booked")
      .eq("user_id", uid)
      .gte("created_at", startDate)
      .order("created_at", { ascending: true });
    
    if (leadsError) throw leadsError;
    
    const allLeads = leads || [];
    
    // Calls per day
    const callsByDay = {};
    const bookingsByDay = {};
    allLeads.forEach(lead => {
      const day = lead.created_at.split("T")[0];
      callsByDay[day] = (callsByDay[day] || 0) + 1;
      if (lead.status?.toLowerCase() === "booked" || lead.appointment_booked) {
        bookingsByDay[day] = (bookingsByDay[day] || 0) + 1;
      }
    });
    
    // Generate all days in range for complete chart
    const calls_per_day = [];
    const booking_rate_trend = [];
    for (let i = daysBack - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split("T")[0];
      const callCount = callsByDay[dateStr] || 0;
      const bookedCount = bookingsByDay[dateStr] || 0;
      calls_per_day.push({ date: dateStr, count: callCount });
      booking_rate_trend.push({ 
        date: dateStr, 
        rate: callCount > 0 ? Math.round((bookedCount / callCount) * 100) : 0 
      });
    }
    
    // Peak hours (0-23)
    const hourCounts = Array(24).fill(0);
    allLeads.forEach(lead => {
      const hour = new Date(lead.created_at).getHours();
      hourCounts[hour]++;
    });
    const peak_hours = hourCounts.map((count, hour) => ({ hour, count }));
    
    // Sentiment breakdown
    const sentiment_breakdown = { positive: 0, neutral: 0, negative: 0 };
    allLeads.forEach(lead => {
      const s = (lead.sentiment || "neutral").toLowerCase();
      if (s === "positive") sentiment_breakdown.positive++;
      else if (s === "negative") sentiment_breakdown.negative++;
      else sentiment_breakdown.neutral++;
    });
    
    // Outcome breakdown
    const outcome_breakdown = { booked: 0, transferred: 0, missed: 0, callback: 0, declined: 0, other: 0 };
    allLeads.forEach(lead => {
      const outcome = (lead.call_outcome || lead.status || "other").toLowerCase();
      if (outcome.includes("book") || outcome.includes("confirm")) outcome_breakdown.booked++;
      else if (outcome.includes("transfer")) outcome_breakdown.transferred++;
      else if (outcome.includes("miss") || outcome.includes("hangup")) outcome_breakdown.missed++;
      else if (outcome.includes("callback")) outcome_breakdown.callback++;
      else if (outcome.includes("decline") || outcome.includes("not interested")) outcome_breakdown.declined++;
      else outcome_breakdown.other++;
    });
    
    // Average duration trend (by week)
    const durationsByWeek = {};
    allLeads.forEach(lead => {
      if (lead.call_duration_seconds && lead.call_duration_seconds > 0) {
        const weekStart = new Date(lead.created_at);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        const weekKey = weekStart.toISOString().split("T")[0];
        if (!durationsByWeek[weekKey]) durationsByWeek[weekKey] = [];
        durationsByWeek[weekKey].push(lead.call_duration_seconds);
      }
    });
    const avg_duration_trend = Object.entries(durationsByWeek).map(([date, durations]) => ({
      date,
      avg_seconds: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    })).sort((a, b) => a.date.localeCompare(b.date));
    
    // Summary stats
    const total_calls = allLeads.length;
    const total_booked = outcome_breakdown.booked;
    const overall_booking_rate = total_calls > 0 ? Math.round((total_booked / total_calls) * 100) : 0;
    const avgDuration = allLeads
      .filter(l => l.call_duration_seconds > 0)
      .reduce((sum, l) => sum + l.call_duration_seconds, 0) / 
      (allLeads.filter(l => l.call_duration_seconds > 0).length || 1);
    
    return res.json({
      period,
      calls_per_day,
      booking_rate_trend,
      peak_hours,
      sentiment_breakdown,
      outcome_breakdown,
      avg_duration_trend,
      summary: {
        total_calls,
        total_booked,
        overall_booking_rate,
        avg_duration_seconds: Math.round(avgDuration)
      }
    });
  } catch (err) {
    console.error("[analytics] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Settings endpoints - Get user business settings
app.get("/api/settings", requireAuth, resolveEffectiveUser, async (req, res) => {
  try {
    const uid = req.effectiveUserId ?? req.user.id;
    
    // Fetch profile and agent data with extended fields
    const [profileResult, agentResult] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("business_name, email, phone, industry, google_review_url, review_request_enabled, review_request_template")
        .eq("user_id", uid)
        .maybeSingle(),
      supabaseAdmin
        .from("agents")
        .select("transfer_number, schedule_summary, standard_fee, emergency_fee, tone, phone_number, industry, post_call_sms_enabled, post_call_sms_template, post_call_sms_delay_seconds")
        .eq("user_id", uid)
        .maybeSingle()
    ]);
    
    const profile = profileResult.data || {};
    const agent = agentResult.data || {};
    
    return res.json({
      business_name: profile.business_name || "",
      email: profile.email || "",
      phone: profile.phone || "",
      industry: agent.industry || profile.industry || "hvac",
      transfer_number: agent.transfer_number || "",
      service_call_fee: agent.standard_fee || "",
      emergency_fee: agent.emergency_fee || "",
      schedule_summary: agent.schedule_summary || "",
      agent_tone: agent.tone || "Calm & Professional",
      phone_number: agent.phone_number || "",
      notification_preferences: {
        email_on_booking: true,
        sms_on_booking: true,
        daily_summary: false
      },
      // Post-call SMS settings
      post_call_sms_enabled: agent.post_call_sms_enabled || false,
      post_call_sms_template: agent.post_call_sms_template || "Thanks for calling {business}! We appreciate your call and will follow up shortly if needed.",
      post_call_sms_delay_seconds: agent.post_call_sms_delay_seconds || 60,
      // Review request settings
      review_request_enabled: profile.review_request_enabled || false,
      google_review_url: profile.google_review_url || "",
      review_request_template: profile.review_request_template || "Thanks for choosing {business}! We hope you had a great experience. Please leave us a review: {review_link}",
    });
  } catch (err) {
    console.error("[settings GET] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Settings endpoints - Update user business settings
app.put("/api/settings", requireAuth, resolveEffectiveUser, async (req, res) => {
  try {
    const uid = req.effectiveUserId ?? req.user.id;
    const {
      business_name,
      transfer_number,
      service_call_fee,
      emergency_fee,
      schedule_summary,
      agent_tone,
      industry,
      notification_preferences,
      // SMS Automation settings
      post_call_sms_enabled,
      post_call_sms_template,
      post_call_sms_delay_seconds,
      // Review Request settings
      review_request_enabled,
      google_review_url,
      review_request_template,
    } = req.body;
    
    // Update profile if business_name or review settings provided
    const profileUpdates = {};
    if (business_name !== undefined) profileUpdates.business_name = business_name;
    if (industry !== undefined) profileUpdates.industry = industry;
    if (review_request_enabled !== undefined) profileUpdates.review_request_enabled = review_request_enabled;
    if (google_review_url !== undefined) profileUpdates.google_review_url = google_review_url;
    if (review_request_template !== undefined) profileUpdates.review_request_template = review_request_template;
    
    if (Object.keys(profileUpdates).length > 0) {
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update(profileUpdates)
        .eq("user_id", uid);
      
      if (profileError) {
        console.error("[settings PUT] profile update error:", profileError.message);
      }
    }
    
    // Update agent settings (including SMS automation)
    const agentUpdates = {};
    if (transfer_number !== undefined) agentUpdates.transfer_number = transfer_number;
    if (service_call_fee !== undefined) agentUpdates.standard_fee = service_call_fee;
    if (emergency_fee !== undefined) agentUpdates.emergency_fee = emergency_fee;
    if (schedule_summary !== undefined) agentUpdates.schedule_summary = schedule_summary;
    if (agent_tone !== undefined) agentUpdates.tone = agent_tone;
    if (industry !== undefined) agentUpdates.industry = industry;
    // Post-call SMS automation fields
    if (post_call_sms_enabled !== undefined) agentUpdates.post_call_sms_enabled = post_call_sms_enabled;
    if (post_call_sms_template !== undefined) agentUpdates.post_call_sms_template = post_call_sms_template;
    if (post_call_sms_delay_seconds !== undefined) agentUpdates.post_call_sms_delay_seconds = post_call_sms_delay_seconds;
    
    if (Object.keys(agentUpdates).length > 0) {
      const { error: agentError } = await supabaseAdmin
        .from("agents")
        .update(agentUpdates)
        .eq("user_id", uid);
      
      if (agentError) {
        console.error("[settings PUT] agent update error:", agentError.message);
      }
    }
    
    // Return updated settings
    return res.json({ ok: true, message: "Settings updated successfully" });
  } catch (err) {
    console.error("[settings PUT] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ============================================
// REFERRAL SYSTEM ENDPOINTS
// ============================================

// Helper: Generate unique 8-char referral code
const generateReferralCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // No I, O, 0, 1 to avoid confusion
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Helper: Get or create referral code for user
const getOrCreateReferralCode = async (userId) => {
  // Check if user already has a code
  const { data: existing } = await supabaseAdmin
    .from("referral_codes")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  
  if (existing) {
    return existing;
  }
  
  // Generate unique code (retry if collision)
  let code;
  let attempts = 0;
  while (attempts < 10) {
    code = generateReferralCode();
    const { data: collision } = await supabaseAdmin
      .from("referral_codes")
      .select("id")
      .eq("code", code)
      .maybeSingle();
    
    if (!collision) break;
    attempts++;
  }
  
  if (attempts >= 10) {
    throw new Error("Failed to generate unique referral code");
  }
  
  // Create the code
  const { data: newCode, error } = await supabaseAdmin
    .from("referral_codes")
    .insert({ user_id: userId, code, is_active: true })
    .select()
    .single();
  
  if (error) throw error;
  return newCode;
};

// GET /referral/my-code - Get or create user's referral code
app.get("/referral/my-code", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const referralCode = await getOrCreateReferralCode(userId);
    
    // Get user's business name for display
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("business_name")
      .eq("user_id", userId)
      .maybeSingle();
    
    const baseUrl = process.env.FRONTEND_URL || "https://app.kryonextech.com";
    const referralLink = `${baseUrl}/login?ref=${referralCode.code}`;
    
    return res.json({
      code: referralCode.code,
      link: referralLink,
      is_active: referralCode.is_active,
      created_at: referralCode.created_at,
      business_name: profile?.business_name || null,
    });
  } catch (err) {
    console.error("[referral/my-code] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /referral/stats - Get user's referral statistics
app.get("/referral/stats", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get all referrals made by this user
    const { data: referrals, error: referralsError } = await supabaseAdmin
      .from("referrals")
      .select("id, status, total_commission_cents, upfront_paid, created_at")
      .eq("referrer_id", userId);
    
    if (referralsError) throw referralsError;
    
    const allReferrals = referrals || [];
    
    // Calculate stats
    const totalReferrals = allReferrals.length;
    const activeReferrals = allReferrals.filter(r => 
      r.status === "eligible" || r.status === "paid"
    ).length;
    const pendingReferrals = allReferrals.filter(r => r.status === "pending").length;
    const rejectedReferrals = allReferrals.filter(r => 
      r.status === "rejected" || r.status === "clawed_back"
    ).length;
    
    // Get commissions
    const { data: commissions, error: commissionsError } = await supabaseAdmin
      .from("referral_commissions")
      .select("amount_cents, status")
      .eq("referrer_id", userId);
    
    if (commissionsError) throw commissionsError;
    
    const allCommissions = commissions || [];
    
    const totalEarnedCents = allCommissions
      .filter(c => c.status === "paid" || c.status === "approved")
      .reduce((sum, c) => sum + (c.amount_cents || 0), 0);
    
    const pendingEarningsCents = allCommissions
      .filter(c => c.status === "pending")
      .reduce((sum, c) => sum + (c.amount_cents || 0), 0);
    
    const availablePayoutCents = allCommissions
      .filter(c => c.status === "approved")
      .reduce((sum, c) => sum + (c.amount_cents || 0), 0);
    
    // Get settings for min payout
    const { data: settings } = await supabaseAdmin
      .from("referral_settings")
      .select("min_payout_cents")
      .eq("id", 1)
      .maybeSingle();
    
    const minPayoutCents = settings?.min_payout_cents || 5000;
    const canRequestPayout = availablePayoutCents >= minPayoutCents;
    
    return res.json({
      total_referrals: totalReferrals,
      active_referrals: activeReferrals,
      pending_referrals: pendingReferrals,
      rejected_referrals: rejectedReferrals,
      total_earned_cents: totalEarnedCents,
      pending_earnings_cents: pendingEarningsCents,
      available_payout_cents: availablePayoutCents,
      min_payout_cents: minPayoutCents,
      can_request_payout: canRequestPayout,
    });
  } catch (err) {
    console.error("[referral/stats] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /referral/history - Get detailed referral history
app.get("/referral/history", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get all referrals with referred user info (masked email)
    const { data: referrals, error } = await supabaseAdmin
      .from("referrals")
      .select(`
        id, 
        referral_code, 
        status, 
        signup_at, 
        first_payment_at,
        eligible_at,
        upfront_paid,
        total_commission_cents,
        months_paid,
        rejection_reason,
        fraud_flags,
        referred_id
      `)
      .eq("referrer_id", userId)
      .order("created_at", { ascending: false });
    
    if (error) throw error;
    
    // Get referred user emails (masked)
    const referredIds = (referrals || []).map(r => r.referred_id).filter(Boolean);
    let emailMap = {};
    
    if (referredIds.length > 0) {
      const { data: users } = await supabaseAdmin.auth.admin.listUsers();
      if (users?.users) {
        users.users.forEach(u => {
          if (referredIds.includes(u.id)) {
            // Mask email: j***@example.com
            const email = u.email || "";
            const [local, domain] = email.split("@");
            const masked = local ? `${local[0]}***@${domain || ""}` : "***";
            emailMap[u.id] = masked;
          }
        });
      }
    }
    
    // Format response
    const history = (referrals || []).map(r => ({
      id: r.id,
      referred_email: emailMap[r.referred_id] || "Unknown",
      status: r.status,
      signup_date: r.signup_at,
      first_payment_date: r.first_payment_at,
      eligible_date: r.eligible_at,
      upfront_paid: r.upfront_paid,
      total_earned_cents: r.total_commission_cents || 0,
      months_paid: r.months_paid || 0,
      rejection_reason: r.rejection_reason,
      has_fraud_flags: (r.fraud_flags || []).length > 0,
    }));
    
    return res.json({ referrals: history });
  } catch (err) {
    console.error("[referral/history] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /referral/request-payout - Request payout (if eligible balance >= min)
app.post("/referral/request-payout", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get settings
    const { data: settings } = await supabaseAdmin
      .from("referral_settings")
      .select("min_payout_cents")
      .eq("id", 1)
      .maybeSingle();
    
    const minPayoutCents = settings?.min_payout_cents || 5000;
    
    // Get available balance (approved commissions not yet paid)
    const { data: commissions } = await supabaseAdmin
      .from("referral_commissions")
      .select("id, amount_cents")
      .eq("referrer_id", userId)
      .eq("status", "approved");
    
    const availableCents = (commissions || []).reduce((sum, c) => sum + (c.amount_cents || 0), 0);
    
    if (availableCents < minPayoutCents) {
      return res.status(400).json({ 
        error: `Minimum payout is $${(minPayoutCents / 100).toFixed(2)}. You have $${(availableCents / 100).toFixed(2)} available.`
      });
    }
    
    // Mark commissions as "requested" (admin will process manually for now)
    // In future, could integrate with Stripe Connect for automatic payouts
    const commissionIds = (commissions || []).map(c => c.id);
    
    // Create an alert for admin
    await supabaseAdmin.from("alerts").insert({
      alert_type: "payout_request",
      severity: "info",
      user_id: userId,
      message: `Payout requested: $${(availableCents / 100).toFixed(2)}`,
      details: { commission_ids: commissionIds, amount_cents: availableCents },
    });
    
    return res.json({ 
      ok: true, 
      message: `Payout request submitted for $${(availableCents / 100).toFixed(2)}. Admin will process within 3-5 business days.`,
      amount_cents: availableCents,
    });
  } catch (err) {
    console.error("[referral/request-payout] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Helper: Process referral on signup (called from signup flow)
const processReferralSignup = async ({ referredUserId, referralCode, signupIp }) => {
  if (!referralCode) return null;
  
  // Find the referral code
  const { data: codeData } = await supabaseAdmin
    .from("referral_codes")
    .select("user_id, code, is_active")
    .eq("code", referralCode.toUpperCase())
    .maybeSingle();
  
  if (!codeData || !codeData.is_active) {
    console.log("[referral] Invalid or inactive code:", referralCode);
    return null;
  }
  
  const referrerId = codeData.user_id;
  
  // Fraud check: Can't refer yourself
  if (referrerId === referredUserId) {
    console.log("[referral] Self-referral blocked");
    return { blocked: true, reason: "self_referral" };
  }
  
  // Get referrer's email for domain check
  const { data: referrerAuth } = await supabaseAdmin.auth.admin.getUserById(referrerId);
  const { data: referredAuth } = await supabaseAdmin.auth.admin.getUserById(referredUserId);
  
  const referrerEmail = referrerAuth?.user?.email || "";
  const referredEmail = referredAuth?.user?.email || "";
  
  // Fraud check: Same email domain (might be same company)
  const referrerDomain = referrerEmail.split("@")[1]?.toLowerCase();
  const referredDomain = referredEmail.split("@")[1]?.toLowerCase();
  
  const fraudFlags = [];
  if (referrerDomain && referredDomain && referrerDomain === referredDomain) {
    // Don't block common domains like gmail, yahoo, etc.
    const commonDomains = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "aol.com"];
    if (!commonDomains.includes(referrerDomain)) {
      fraudFlags.push({ type: "same_domain", domain: referrerDomain });
    }
  }
  
  // Store the referral (pending until payment)
  const { data: referral, error } = await supabaseAdmin
    .from("referrals")
    .insert({
      referrer_id: referrerId,
      referred_id: referredUserId,
      referral_code: referralCode.toUpperCase(),
      status: "pending",
      signup_ip: signupIp,
      signup_at: new Date().toISOString(),
      fraud_flags: fraudFlags,
    })
    .select()
    .single();
  
  if (error) {
    console.error("[referral] Failed to create referral:", error.message);
    return null;
  }
  
  // Update referred user's profile
  await supabaseAdmin
    .from("profiles")
    .update({
      referred_by_code: referralCode.toUpperCase(),
      referred_by_user_id: referrerId,
      signup_ip: signupIp,
    })
    .eq("user_id", referredUserId);
  
  console.log("[referral] Created referral:", { referral_id: referral.id, referrer_id: referrerId, referred_id: referredUserId });
  return referral;
};

// Endpoint to record referral from signup (called by frontend)
app.post("/referral/record-signup", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { referral_code } = req.body;
    const signupIp = req.headers["x-forwarded-for"]?.split(",")[0] || req.ip || null;
    
    if (!referral_code) {
      return res.json({ ok: true, message: "No referral code provided" });
    }
    
    // Check if user already has a referral recorded
    const { data: existingReferral } = await supabaseAdmin
      .from("referrals")
      .select("id")
      .eq("referred_id", userId)
      .maybeSingle();
    
    if (existingReferral) {
      return res.json({ ok: true, message: "Referral already recorded" });
    }
    
    const result = await processReferralSignup({
      referredUserId: userId,
      referralCode: referral_code,
      signupIp,
    });
    
    if (result?.blocked) {
      return res.json({ ok: false, message: "Invalid referral" });
    }
    
    return res.json({ ok: true, message: "Referral recorded successfully" });
  } catch (err) {
    console.error("[referral/record-signup] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ============================================
// END REFERRAL SYSTEM ENDPOINTS
// ============================================

// ============================================
// ADMIN REFERRAL MANAGEMENT ENDPOINTS
// ============================================

// GET /admin/referrals - List all referrals with filters
app.get("/admin/referrals", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    
    let query = supabaseAdmin
      .from("referrals")
      .select(`
        *,
        referrer:referrer_id(id),
        referred:referred_id(id)
      `, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + Number(limit) - 1);
    
    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    
    const { data: referrals, count, error } = await query;
    if (error) throw error;
    
    // Get user emails
    const referrerIds = [...new Set((referrals || []).map(r => r.referrer_id).filter(Boolean))];
    const referredIds = [...new Set((referrals || []).map(r => r.referred_id).filter(Boolean))];
    const allIds = [...new Set([...referrerIds, ...referredIds])];
    
    let emailMap = {};
    if (allIds.length > 0) {
      const { data: users } = await supabaseAdmin.auth.admin.listUsers();
      if (users?.users) {
        users.users.forEach(u => {
          if (allIds.includes(u.id)) {
            emailMap[u.id] = u.email || "Unknown";
          }
        });
      }
    }
    
    // Format response with emails
    const formatted = (referrals || []).map(r => ({
      ...r,
      referrer_email: emailMap[r.referrer_id] || "Unknown",
      referred_email: emailMap[r.referred_id] || "Unknown",
    }));
    
    // Get summary stats
    const { data: allReferrals } = await supabaseAdmin
      .from("referrals")
      .select("status");
    
    const summary = {
      total: allReferrals?.length || 0,
      pending: allReferrals?.filter(r => r.status === "pending").length || 0,
      eligible: allReferrals?.filter(r => r.status === "eligible").length || 0,
      paid: allReferrals?.filter(r => r.status === "paid").length || 0,
      rejected: allReferrals?.filter(r => r.status === "rejected").length || 0,
      clawed_back: allReferrals?.filter(r => r.status === "clawed_back").length || 0,
    };
    
    return res.json({
      referrals: formatted,
      summary,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: count || 0,
        pages: Math.ceil((count || 0) / Number(limit)),
      },
    });
  } catch (err) {
    console.error("[admin/referrals] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /admin/referrals/:id - Get single referral with full details
app.get("/admin/referrals/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data: referral, error } = await supabaseAdmin
      .from("referrals")
      .select("*")
      .eq("id", id)
      .single();
    
    if (error || !referral) {
      return res.status(404).json({ error: "Referral not found" });
    }
    
    // Get commissions for this referral
    const { data: commissions } = await supabaseAdmin
      .from("referral_commissions")
      .select("*")
      .eq("referral_id", id)
      .order("created_at", { ascending: false });
    
    // Get user emails
    const { data: referrerAuth } = await supabaseAdmin.auth.admin.getUserById(referral.referrer_id);
    const { data: referredAuth } = await supabaseAdmin.auth.admin.getUserById(referral.referred_id);
    
    return res.json({
      ...referral,
      referrer_email: referrerAuth?.user?.email || "Unknown",
      referred_email: referredAuth?.user?.email || "Unknown",
      commissions: commissions || [],
    });
  } catch (err) {
    console.error("[admin/referrals/:id] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /admin/referrals/:id/approve - Approve pending commissions
app.post("/admin/referrals/:id/approve", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Update all pending commissions for this referral to approved
    const { data: updated, error } = await supabaseAdmin
      .from("referral_commissions")
      .update({ 
        status: "approved",
        approved_at: new Date().toISOString(),
      })
      .eq("referral_id", id)
      .eq("status", "pending")
      .select();
    
    if (error) throw error;
    
    // Update referral status if needed
    await supabaseAdmin
      .from("referrals")
      .update({ 
        status: "eligible",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "pending");
    
    // Log action
    await auditLog({
      userId: req.user.id,
      action: "referral_commissions_approved",
      entity: "referral",
      entityId: id,
      req,
      metadata: { commissions_approved: updated?.length || 0 },
    });
    
    return res.json({ 
      ok: true, 
      message: `Approved ${updated?.length || 0} commission(s)`,
      commissions: updated,
    });
  } catch (err) {
    console.error("[admin/referrals/:id/approve] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /admin/referrals/:id/reject - Reject a referral
app.post("/admin/referrals/:id/reject", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    // Update referral status to rejected
    const { error: referralError } = await supabaseAdmin
      .from("referrals")
      .update({ 
        status: "rejected",
        rejection_reason: reason || "Admin rejected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    
    if (referralError) throw referralError;
    
    // Cancel all pending commissions
    await supabaseAdmin
      .from("referral_commissions")
      .update({ status: "clawed_back" })
      .eq("referral_id", id)
      .in("status", ["pending", "approved"]);
    
    // Log action
    await auditLog({
      userId: req.user.id,
      action: "referral_rejected",
      entity: "referral",
      entityId: id,
      req,
      metadata: { reason: reason || "Admin rejected" },
    });
    
    return res.json({ 
      ok: true, 
      message: "Referral rejected successfully",
    });
  } catch (err) {
    console.error("[admin/referrals/:id/reject] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /admin/referrals/:id/mark-paid - Mark commissions as paid
app.post("/admin/referrals/:id/mark-paid", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Update approved commissions to paid
    const { data: updated, error } = await supabaseAdmin
      .from("referral_commissions")
      .update({ 
        status: "paid",
        paid_at: new Date().toISOString(),
      })
      .eq("referral_id", id)
      .eq("status", "approved")
      .select();
    
    if (error) throw error;
    
    // Update referral status
    await supabaseAdmin
      .from("referrals")
      .update({ 
        status: "paid",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    
    // Log action
    await auditLog({
      userId: req.user.id,
      action: "referral_commissions_paid",
      entity: "referral",
      entityId: id,
      req,
      metadata: { commissions_paid: updated?.length || 0 },
    });
    
    return res.json({ 
      ok: true, 
      message: `Marked ${updated?.length || 0} commission(s) as paid`,
    });
  } catch (err) {
    console.error("[admin/referrals/:id/mark-paid] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /admin/referral-settings - Get referral program settings
app.get("/admin/referral-settings", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { data: settings, error } = await supabaseAdmin
      .from("referral_settings")
      .select("*")
      .eq("id", 1)
      .single();
    
    if (error && error.code !== "PGRST116") throw error;
    
    // Return defaults if no settings exist
    return res.json(settings || {
      id: 1,
      upfront_amount_cents: 2500,
      monthly_percent: 10,
      max_months: 12,
      hold_days: 30,
      min_payout_cents: 5000,
      auto_approve_under_cents: 10000,
      is_active: true,
    });
  } catch (err) {
    console.error("[admin/referral-settings] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// PUT /admin/referral-settings - Update referral program settings
app.put("/admin/referral-settings", requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      upfront_amount_cents,
      monthly_percent,
      max_months,
      hold_days,
      min_payout_cents,
      auto_approve_under_cents,
      is_active,
    } = req.body;
    
    const updates = { updated_at: new Date().toISOString() };
    if (upfront_amount_cents !== undefined) updates.upfront_amount_cents = upfront_amount_cents;
    if (monthly_percent !== undefined) updates.monthly_percent = monthly_percent;
    if (max_months !== undefined) updates.max_months = max_months;
    if (hold_days !== undefined) updates.hold_days = hold_days;
    if (min_payout_cents !== undefined) updates.min_payout_cents = min_payout_cents;
    if (auto_approve_under_cents !== undefined) updates.auto_approve_under_cents = auto_approve_under_cents;
    if (is_active !== undefined) updates.is_active = is_active;
    
    const { data: settings, error } = await supabaseAdmin
      .from("referral_settings")
      .upsert({ id: 1, ...updates })
      .select()
      .single();
    
    if (error) throw error;
    
    // Log action
    await auditLog({
      userId: req.user.id,
      action: "referral_settings_updated",
      entity: "referral_settings",
      entityId: "1",
      req,
      metadata: updates,
    });
    
    return res.json({ ok: true, settings });
  } catch (err) {
    console.error("[admin/referral-settings] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /admin/referral-payout-requests - Get pending payout requests
app.get("/admin/referral-payout-requests", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { data: alerts, error } = await supabaseAdmin
      .from("alerts")
      .select("*")
      .eq("alert_type", "payout_request")
      .order("created_at", { ascending: false });
    
    if (error) throw error;
    
    // Get user emails
    const userIds = [...new Set((alerts || []).map(a => a.user_id).filter(Boolean))];
    let emailMap = {};
    
    if (userIds.length > 0) {
      const { data: users } = await supabaseAdmin.auth.admin.listUsers();
      if (users?.users) {
        users.users.forEach(u => {
          if (userIds.includes(u.id)) {
            emailMap[u.id] = u.email || "Unknown";
          }
        });
      }
    }
    
    const formatted = (alerts || []).map(a => ({
      ...a,
      user_email: emailMap[a.user_id] || "Unknown",
    }));
    
    return res.json({ payout_requests: formatted });
  } catch (err) {
    console.error("[admin/referral-payout-requests] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ============================================
// END ADMIN REFERRAL MANAGEMENT
// ============================================

// ============================================
// CUSTOMER CRM ENDPOINTS
// ============================================

// GET /api/customers - Get customers grouped by phone number
app.get("/api/customers", requireAuth, resolveEffectiveUser, async (req, res) => {
  try {
    const uid = req.effectiveUserId ?? req.user.id;
    const { search, sort = "last_call", order = "desc", limit = 50, offset = 0 } = req.query;
    
    // Get all leads for this user
    let query = supabaseAdmin
      .from("leads")
      .select("id, phone, name, status, sentiment, created_at, call_duration_seconds, appointment_booked, call_outcome, summary")
      .eq("user_id", uid)
      .not("phone", "is", null);
    
    if (search) {
      query = query.or(`phone.ilike.%${search}%,name.ilike.%${search}%`);
    }
    
    const { data: leads, error } = await query;
    if (error) throw error;
    
    // Group by phone number
    const customerMap = {};
    (leads || []).forEach(lead => {
      const phone = lead.phone;
      if (!phone) return;
      
      if (!customerMap[phone]) {
        customerMap[phone] = {
          phone,
          name: lead.name || "Unknown",
          total_calls: 0,
          total_duration_seconds: 0,
          appointments_booked: 0,
          last_call_at: null,
          last_status: null,
          last_sentiment: null,
          calls: [],
        };
      }
      
      const customer = customerMap[phone];
      customer.total_calls++;
      customer.total_duration_seconds += lead.call_duration_seconds || 0;
      if (lead.appointment_booked) customer.appointments_booked++;
      
      // Track latest call
      const callDate = new Date(lead.created_at);
      if (!customer.last_call_at || callDate > new Date(customer.last_call_at)) {
        customer.last_call_at = lead.created_at;
        customer.last_status = lead.status;
        customer.last_sentiment = lead.sentiment;
        customer.name = lead.name || customer.name;
      }
      
      customer.calls.push({
        id: lead.id,
        date: lead.created_at,
        duration: lead.call_duration_seconds,
        status: lead.status,
        sentiment: lead.sentiment,
        outcome: lead.call_outcome,
        summary: lead.summary,
      });
    });
    
    // Convert to array and sort
    let customers = Object.values(customerMap);
    
    if (sort === "last_call") {
      customers.sort((a, b) => {
        const dateA = a.last_call_at ? new Date(a.last_call_at) : new Date(0);
        const dateB = b.last_call_at ? new Date(b.last_call_at) : new Date(0);
        return order === "desc" ? dateB - dateA : dateA - dateB;
      });
    } else if (sort === "total_calls") {
      customers.sort((a, b) => order === "desc" ? b.total_calls - a.total_calls : a.total_calls - b.total_calls);
    } else if (sort === "name") {
      customers.sort((a, b) => order === "desc" ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name));
    }
    
    // Apply pagination
    const total = customers.length;
    customers = customers.slice(Number(offset), Number(offset) + Number(limit));
    
    return res.json({
      customers,
      pagination: {
        total,
        limit: Number(limit),
        offset: Number(offset),
      },
    });
  } catch (err) {
    console.error("[customers] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/customers/:phone/history - Get full history for a customer
app.get("/api/customers/:phone/history", requireAuth, resolveEffectiveUser, async (req, res) => {
  try {
    const uid = req.effectiveUserId ?? req.user.id;
    const phone = decodeURIComponent(req.params.phone);
    
    // Get all leads for this phone number
    const { data: leads, error: leadsError } = await supabaseAdmin
      .from("leads")
      .select("*")
      .eq("user_id", uid)
      .eq("phone", phone)
      .order("created_at", { ascending: false });
    
    if (leadsError) throw leadsError;
    
    // Get all appointments for this phone number
    const { data: appointments, error: apptError } = await supabaseAdmin
      .from("appointments")
      .select("*")
      .eq("user_id", uid)
      .eq("customer_phone", phone)
      .order("start_time", { ascending: false });
    
    // Get all messages for this phone number
    const { data: messages, error: msgError } = await supabaseAdmin
      .from("messages")
      .select("*")
      .eq("user_id", uid)
      .or(`to_number.eq.${phone},from_number.eq.${phone}`)
      .order("timestamp", { ascending: false })
      .limit(50);
    
    // Build timeline
    const timeline = [];
    
    // Add calls to timeline
    (leads || []).forEach(lead => {
      timeline.push({
        type: "call",
        id: lead.id,
        date: lead.created_at,
        data: {
          duration: lead.call_duration_seconds,
          status: lead.status,
          sentiment: lead.sentiment,
          outcome: lead.call_outcome,
          summary: lead.summary,
          transcript: lead.transcript,
          recording_url: lead.recording_url,
        },
      });
    });
    
    // Add appointments to timeline
    (appointments || []).forEach(appt => {
      timeline.push({
        type: "appointment",
        id: appt.id,
        date: appt.start_time,
        data: {
          status: appt.status,
          location: appt.location,
          notes: appt.notes,
          duration_minutes: appt.duration_minutes,
        },
      });
    });
    
    // Add messages to timeline
    (messages || []).forEach(msg => {
      timeline.push({
        type: "message",
        id: msg.id,
        date: msg.timestamp,
        data: {
          direction: msg.direction,
          body: msg.body,
        },
      });
    });
    
    // Sort timeline by date (newest first)
    timeline.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Get customer summary
    const customer = {
      phone,
      name: leads?.[0]?.name || "Unknown",
      total_calls: leads?.length || 0,
      total_appointments: appointments?.length || 0,
      total_messages: messages?.length || 0,
      first_contact: leads?.length > 0 ? leads[leads.length - 1].created_at : null,
      last_contact: leads?.[0]?.created_at || null,
    };
    
    return res.json({
      customer,
      timeline,
      leads: leads || [],
      appointments: appointments || [],
      messages: messages || [],
    });
  } catch (err) {
    console.error("[customers/:phone/history] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ============================================
// END CUSTOMER CRM ENDPOINTS
// ============================================

// ============================================
// WEBHOOK (ZAPIER) INTEGRATION ENDPOINTS
// ============================================

// Helper: Send outbound webhook
const sendOutboundWebhook = async (userId, eventType, payload) => {
  try {
    // Get active webhooks for this user that listen to this event
    const { data: webhooks, error } = await supabaseAdmin
      .from("webhook_configs")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .contains("events", [eventType]);
    
    if (error || !webhooks || webhooks.length === 0) {
      return { sent: 0, webhooks: [] };
    }
    
    const results = [];
    
    for (const webhook of webhooks) {
      try {
        // Build headers
        const headers = {
          "Content-Type": "application/json",
          "X-Kryonex-Event": eventType,
          "X-Kryonex-Webhook-Id": webhook.id,
          ...(webhook.headers || {}),
        };
        
        // Add HMAC signature if secret is set
        if (webhook.secret) {
          const crypto = require("crypto");
          const signature = crypto
            .createHmac("sha256", webhook.secret)
            .update(JSON.stringify(payload))
            .digest("hex");
          headers["X-Kryonex-Signature"] = signature;
        }
        
        // Send the webhook
        const response = await fetch(webhook.url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            event: eventType,
            timestamp: new Date().toISOString(),
            data: payload,
          }),
          timeout: 10000,
        });
        
        // Log the delivery
        await supabaseAdmin.from("webhook_deliveries").insert({
          webhook_id: webhook.id,
          user_id: userId,
          event_type: eventType,
          payload,
          status_code: response.status,
          response_body: await response.text().catch(() => null),
          delivered_at: new Date().toISOString(),
        });
        
        results.push({ webhook_id: webhook.id, success: response.ok, status: response.status });
        console.log(`🔗 [webhook] Delivered ${eventType} to ${webhook.name}:`, response.status);
      } catch (webhookErr) {
        // Log the failed delivery
        await supabaseAdmin.from("webhook_deliveries").insert({
          webhook_id: webhook.id,
          user_id: userId,
          event_type: eventType,
          payload,
          error_message: webhookErr.message,
        });
        results.push({ webhook_id: webhook.id, success: false, error: webhookErr.message });
        console.error(`🔗 [webhook] Failed to deliver ${eventType} to ${webhook.name}:`, webhookErr.message);
      }
    }
    
    return { sent: results.filter(r => r.success).length, webhooks: results };
  } catch (err) {
    console.error("[sendOutboundWebhook] error:", err.message);
    return { sent: 0, error: err.message };
  }
};

// GET /api/webhooks - List user's webhooks
app.get("/api/webhooks", requireAuth, resolveEffectiveUser, async (req, res) => {
  try {
    const uid = req.effectiveUserId ?? req.user.id;
    
    const { data: webhooks, error } = await supabaseAdmin
      .from("webhook_configs")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    
    if (error) throw error;
    
    // Get delivery stats for each webhook
    const webhooksWithStats = await Promise.all((webhooks || []).map(async (webhook) => {
      const { count: totalDeliveries } = await supabaseAdmin
        .from("webhook_deliveries")
        .select("id", { count: "exact", head: true })
        .eq("webhook_id", webhook.id);
      
      const { count: successfulDeliveries } = await supabaseAdmin
        .from("webhook_deliveries")
        .select("id", { count: "exact", head: true })
        .eq("webhook_id", webhook.id)
        .gte("status_code", 200)
        .lt("status_code", 300);
      
      return {
        ...webhook,
        secret: webhook.secret ? "••••••••" : null, // Hide actual secret
        stats: {
          total_deliveries: totalDeliveries || 0,
          successful_deliveries: successfulDeliveries || 0,
        },
      };
    }));
    
    return res.json({ webhooks: webhooksWithStats });
  } catch (err) {
    console.error("[webhooks GET] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/webhooks - Create a new webhook
app.post("/api/webhooks", requireAuth, resolveEffectiveUser, async (req, res) => {
  try {
    const uid = req.effectiveUserId ?? req.user.id;
    const { name, url, events, secret, headers } = req.body;
    
    if (!name || !url) {
      return res.status(400).json({ error: "Name and URL are required" });
    }
    
    // Validate URL
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: "Invalid URL format" });
    }
    
    // Validate events
    const validEvents = ["call_ended", "call_started", "appointment_booked", "appointment_updated", "lead_created", "sms_received"];
    const eventList = events || [];
    const invalidEvents = eventList.filter(e => !validEvents.includes(e));
    if (invalidEvents.length > 0) {
      return res.status(400).json({ error: `Invalid events: ${invalidEvents.join(", ")}` });
    }
    
    const { data: webhook, error } = await supabaseAdmin
      .from("webhook_configs")
      .insert({
        user_id: uid,
        name,
        url,
        events: eventList,
        secret: secret || null,
        headers: headers || {},
        is_active: true,
      })
      .select()
      .single();
    
    if (error) throw error;
    
    return res.json({ 
      ok: true, 
      webhook: { ...webhook, secret: webhook.secret ? "••••••••" : null },
    });
  } catch (err) {
    console.error("[webhooks POST] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// PUT /api/webhooks/:id - Update a webhook
app.put("/api/webhooks/:id", requireAuth, resolveEffectiveUser, async (req, res) => {
  try {
    const uid = req.effectiveUserId ?? req.user.id;
    const { id } = req.params;
    const { name, url, events, secret, headers, is_active } = req.body;
    
    const updates = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (url !== undefined) {
      try {
        new URL(url);
        updates.url = url;
      } catch {
        return res.status(400).json({ error: "Invalid URL format" });
      }
    }
    if (events !== undefined) updates.events = events;
    if (secret !== undefined) updates.secret = secret || null;
    if (headers !== undefined) updates.headers = headers;
    if (is_active !== undefined) updates.is_active = is_active;
    
    const { data: webhook, error } = await supabaseAdmin
      .from("webhook_configs")
      .update(updates)
      .eq("id", id)
      .eq("user_id", uid)
      .select()
      .single();
    
    if (error) throw error;
    
    return res.json({ 
      ok: true, 
      webhook: { ...webhook, secret: webhook.secret ? "••••••••" : null },
    });
  } catch (err) {
    console.error("[webhooks PUT] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/webhooks/:id - Delete a webhook
app.delete("/api/webhooks/:id", requireAuth, resolveEffectiveUser, async (req, res) => {
  try {
    const uid = req.effectiveUserId ?? req.user.id;
    const { id } = req.params;
    
    const { error } = await supabaseAdmin
      .from("webhook_configs")
      .delete()
      .eq("id", id)
      .eq("user_id", uid);
    
    if (error) throw error;
    
    return res.json({ ok: true });
  } catch (err) {
    console.error("[webhooks DELETE] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/webhooks/:id/test - Test a webhook
app.post("/api/webhooks/:id/test", requireAuth, resolveEffectiveUser, async (req, res) => {
  try {
    const uid = req.effectiveUserId ?? req.user.id;
    const { id } = req.params;
    
    // Get the webhook
    const { data: webhook, error: webhookError } = await supabaseAdmin
      .from("webhook_configs")
      .select("*")
      .eq("id", id)
      .eq("user_id", uid)
      .single();
    
    if (webhookError || !webhook) {
      return res.status(404).json({ error: "Webhook not found" });
    }
    
    // Send test payload
    const testPayload = {
      test: true,
      message: "This is a test webhook from Kryonex",
      webhook_name: webhook.name,
      timestamp: new Date().toISOString(),
    };
    
    try {
      const headers = {
        "Content-Type": "application/json",
        "X-Kryonex-Event": "test",
        "X-Kryonex-Webhook-Id": webhook.id,
        ...(webhook.headers || {}),
      };
      
      if (webhook.secret) {
        const crypto = require("crypto");
        const signature = crypto
          .createHmac("sha256", webhook.secret)
          .update(JSON.stringify(testPayload))
          .digest("hex");
        headers["X-Kryonex-Signature"] = signature;
      }
      
      const response = await fetch(webhook.url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          event: "test",
          timestamp: new Date().toISOString(),
          data: testPayload,
        }),
        timeout: 10000,
      });
      
      const responseText = await response.text().catch(() => "");
      
      // Log the test delivery
      await supabaseAdmin.from("webhook_deliveries").insert({
        webhook_id: webhook.id,
        user_id: uid,
        event_type: "test",
        payload: testPayload,
        status_code: response.status,
        response_body: responseText,
        delivered_at: new Date().toISOString(),
      });
      
      return res.json({
        ok: response.ok,
        status_code: response.status,
        response: responseText.substring(0, 500),
      });
    } catch (fetchErr) {
      // Log the failed test
      await supabaseAdmin.from("webhook_deliveries").insert({
        webhook_id: webhook.id,
        user_id: uid,
        event_type: "test",
        payload: testPayload,
        error_message: fetchErr.message,
      });
      
      return res.json({
        ok: false,
        error: fetchErr.message,
      });
    }
  } catch (err) {
    console.error("[webhooks test] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/webhooks/:id/deliveries - Get delivery history
app.get("/api/webhooks/:id/deliveries", requireAuth, resolveEffectiveUser, async (req, res) => {
  try {
    const uid = req.effectiveUserId ?? req.user.id;
    const { id } = req.params;
    const { limit = 20 } = req.query;
    
    // Verify ownership
    const { data: webhook } = await supabaseAdmin
      .from("webhook_configs")
      .select("id")
      .eq("id", id)
      .eq("user_id", uid)
      .maybeSingle();
    
    if (!webhook) {
      return res.status(404).json({ error: "Webhook not found" });
    }
    
    const { data: deliveries, error } = await supabaseAdmin
      .from("webhook_deliveries")
      .select("*")
      .eq("webhook_id", id)
      .order("created_at", { ascending: false })
      .limit(Number(limit));
    
    if (error) throw error;
    
    return res.json({ deliveries: deliveries || [] });
  } catch (err) {
    console.error("[webhook deliveries] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ============================================
// END WEBHOOK INTEGRATION ENDPOINTS
// ============================================

app.get("/leads", requireAuth, resolveEffectiveUser, async (req, res) => {
  try {
    const uid = req.effectiveUserId ?? req.user.id;
    const { status, sentiment, date_from, date_to, has_transcript } = req.query;
    
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("user_id", uid)
      .maybeSingle();
    const role = profile?.role || "owner";
    
    // Build query with filters
    let query = supabaseAdmin
      .from("leads")
      .select("*")
      .eq(role === "seller" ? "owner_id" : "user_id", uid);
    
    // Apply filters
    if (status && status !== "all") {
      query = query.ilike("status", `%${status}%`);
    }
    if (sentiment && sentiment !== "all") {
      query = query.ilike("sentiment", `%${sentiment}%`);
    }
    if (date_from) {
      query = query.gte("created_at", date_from);
    }
    if (date_to) {
      // Add 1 day to include the end date fully
      const endDate = new Date(date_to);
      endDate.setDate(endDate.getDate() + 1);
      query = query.lt("created_at", endDate.toISOString());
    }
    if (has_transcript === "true") {
      query = query.not("transcript", "is", null).neq("transcript", "");
    }
    
    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({ leads: data || [] });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Flag a lead/recording for review
app.post("/leads/:leadId/flag", requireAuth, resolveEffectiveUser, async (req, res) => {
  try {
    const uid = req.effectiveUserId ?? req.user.id;
    const { leadId } = req.params;
    const { flagged } = req.body;
    
    const { data, error } = await supabaseAdmin
      .from("leads")
      .update({ 
        flagged_for_review: flagged === true,
        flagged_at: flagged === true ? new Date().toISOString() : null
      })
      .eq("id", leadId)
      .eq("user_id", uid)
      .select()
      .single();
    
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    
    return res.json({ ok: true, lead: data });
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

app.get("/call-recordings", requireAuth, resolveEffectiveUser, async (req, res) => {
  try {
    const uid = req.effectiveUserId ?? req.user.id;
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
      .eq("seller_id", uid)
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
  resolveEffectiveUser,
  rateLimit({ keyPrefix: "leads-status", limit: 30, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const uid = req.effectiveUserId ?? req.user.id;
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("user_id", uid)
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
        .eq(role === "seller" ? "owner_id" : "user_id", uid)
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

app.get("/messages", requireAuth, resolveEffectiveUser, async (req, res) => {
  try {
    const uid = req.effectiveUserId ?? req.user.id;
    const { data, error } = await supabaseAdmin
      .from("messages")
      .select("*")
      .eq("user_id", uid)
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
  resolveEffectiveUser,
  rateLimit({ keyPrefix: "sms", limit: 20, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const uid = req.effectiveUserId ?? req.user.id;
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
          .eq("user_id", uid)
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
      let bypassUsage = false;
      // No admin bypass when impersonating (effective user !== authenticated user)
      const isImpersonating = req.effectiveUserId && req.effectiveUserId !== req.user.id;
      if (!isImpersonating && isAdminViewRequest(req)) {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("role")
          .eq("user_id", req.user.id)
          .maybeSingle();
        bypassUsage = profile?.role === "admin";
      }
      const retellResponse = await sendSmsInternal({
        userId: uid,
        to: destination,
        body,
        leadId,
        source: source || "manual",
        req,
        bypassUsage,
      });

      await supabaseAdmin.from("messages").insert({
        user_id: uid,
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
      if (err.code === "USAGE_CAP_REACHED") {
        return res.status(402).json({ error: "USAGE_CAP_REACHED" });
      }
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
  const receivedAt = new Date().toISOString();
  try {
    const payload = req.body || {};
    const toNumber = payload.to_number || payload.to || payload.phone_number;
    const fromNumber = payload.from_number || payload.from || payload.sender;
    const body = payload.body || payload.text || payload.message || "";
    const messageSid = payload.message_sid || payload.sid || payload.id || null;
    
    // Generate idempotency key for deduplication
    const idempotencyKey = messageSid || generateIdempotencyKey(payload);
    
    // Check for duplicate
    if (await isDuplicateEvent(idempotencyKey, "sms_events")) {
      console.log("[sms-inbound] duplicate event, skipping", { idempotencyKey });
      return res.json({ ok: true, duplicate: true });
    }
    
    if (!toNumber || !fromNumber) {
      return res.status(400).json({ error: "to_number and from_number required" });
    }
    
    // Persist raw webhook immediately (before processing)
    await persistRawWebhook({
      phoneNumber: toNumber,
      eventType: "sms_inbound",
      rawPayload: payload,
      idempotencyKey,
    });
    
    const { data: agentRow } = await supabaseAdmin
      .from("agents")
      .select("user_id, agent_id")
      .eq("phone_number", toNumber)
      .maybeSingle();
    
    if (!agentRow?.user_id) {
      // Store unknown phone for ops review
      await storeUnknownPhone({ phoneNumber: toNumber, eventType: "sms_inbound", rawPayload: payload });
      await markWebhookProcessed(idempotencyKey, "failed", "Agent not found for number");
      return res.status(404).json({ error: "Agent not found for number" });
    }
    
    // Store normalized SMS event
    await storeSmsEvent({
      idempotencyKey,
      phoneNumber: toNumber,
      userId: agentRow.user_id,
      agentId: agentRow.agent_id,
      messageSid,
      direction: "inbound",
      fromNumber,
      toNumber,
      body,
      status: "received",
      rawPayload: payload,
    });
    
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
    
    await markWebhookProcessed(idempotencyKey, "success");
    return res.json({ ok: true });
  } catch (err) {
    console.error("[sms-inbound] error", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Retell Inbound Webhook: POST with body { event: "call_inbound", call_inbound: { agent_id?, agent_version?, from_number, to_number } }
// Response: 2xx + { call_inbound: { override_agent_id?, override_agent_version?, dynamic_variables?, metadata?, agent_override? } }
app.post("/webhooks/retell-inbound", async (req, res) => {
  const startMs = Date.now();
  console.log("📞 [retell-inbound] hit", JSON.stringify(req.body?.call_inbound ?? req.body, null, 2));
  try {
    const payload = req.body || {};
    const inbound = payload.call_inbound || payload;
    
    // Generate idempotency key for this call event
    const callId = inbound.call_id || payload.call_id || null;
    const idempotencyKey = callId || generateIdempotencyKey(payload);
    
    // Persist raw webhook immediately (before any processing)
    await persistRawWebhook({
      phoneNumber: inbound.to_number || payload.to_number || "",
      eventType: "call_inbound",
      rawPayload: payload,
      idempotencyKey,
    });
    
    // Doc: to_number always in payload (receiver); from_number always (caller)
    const rawTo =
      inbound.to_number ??
      payload.to_number ??
      inbound.to ??
      payload.to ??
      inbound.called_number ??
      payload.called_number ??
      inbound.phone_number ??
      payload.phone_number;
    if (!rawTo) {
      await markWebhookProcessed(idempotencyKey, "failed", "to_number required");
      return res.status(400).json({ error: "to_number required" });
    }
    // Normalize to E.164 so lookup matches DB (e.g. +15045021309)
    const digits = String(rawTo).replace(/\D/g, "");
    const toNumber =
      digits.length === 10
        ? `+1${digits}`
        : digits.length === 11 && digits.startsWith("1")
          ? `+${digits}`
          : String(rawTo).trim();
    const fromNumber = inbound.from_number ?? payload.from_number ?? null;
    
    let agentRow = (
      await supabaseAdmin
        .from("agents")
        .select("user_id, agent_id, transfer_number, tone, schedule_summary, standard_fee, emergency_fee, nickname")
        .eq("phone_number", toNumber)
        .maybeSingle()
    ).data;
    if (!agentRow?.user_id) {
      agentRow = (
        await supabaseAdmin
          .from("agents")
          .select("user_id, agent_id, transfer_number, tone, schedule_summary, standard_fee, emergency_fee, nickname")
          .eq("phone_number", rawTo)
          .maybeSingle()
      ).data;
    }
    if (!agentRow?.user_id && digits.length >= 10) {
      const last10 = digits.slice(-10);
      const { data: rows } = await supabaseAdmin
        .from("agents")
        .select("user_id, agent_id, transfer_number, tone, schedule_summary, standard_fee, emergency_fee, nickname")
        .like("phone_number", `%${last10}`);
      agentRow = rows?.[0] || null;
    }
    if (!agentRow?.user_id) {
      console.warn("[retell-inbound] agent not found", { to_number: toNumber, rawTo, digits });
      // Store unknown phone for ops review (don't drop the event)
      await storeUnknownPhone({ phoneNumber: toNumber, eventType: "call_inbound", rawPayload: payload });
      await markWebhookProcessed(idempotencyKey, "failed", "Agent not found for number");
      return res.status(404).json({ error: "Agent not found for number" });
    }
    
    // Update webhook queue with user info
    await supabaseAdmin.from("webhook_queue").update({
      user_id: agentRow.user_id,
      agent_id: agentRow.agent_id,
    }).eq("idempotency_key", idempotencyKey);
    
    // Store call event (inbound initiated)
    await storeCallEvent({
      eventId: callId || `call_inbound_${generateToken(8)}`,
      idempotencyKey,
      phoneNumber: toNumber,
      userId: agentRow.user_id,
      agentId: agentRow.agent_id,
      direction: "inbound",
      fromNumber,
      toNumber,
      callStatus: "ringing",
      rawPayload: payload,
    });

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
    const { remaining } = getUsageRemaining(usage);
    if (
      (usage.force_pause && !usage.force_resume) ||
      usage.limit_state === "paused" ||
      remaining <= 0
    ) {
      return res.status(402).json({ error: "Usage limit reached" });
    }

    const [{ data: profile }, { data: integration }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("business_name, cal_com_url")
        .eq("user_id", agentRow.user_id)
        .maybeSingle(),
      supabaseAdmin
        .from("integrations")
        .select("booking_url")
        .eq("user_id", agentRow.user_id)
        .eq("provider", "calcom")
        .maybeSingle(),
    ]);

    // Doc: dynamic_variables values must be strings; fallback: profiles.business_name → agents.nickname (set at provision)
    const profileName = (profile?.business_name && profile.business_name.trim()) ? profile.business_name.trim() : "";
    const agentNickname = (agentRow?.nickname && String(agentRow.nickname).trim()) ? String(agentRow.nickname).trim() : "";
    const businessName = profileName || agentNickname || "your business";
    // Backfill: if profile was empty but we have nickname from provision, save it so next call has it
    if (!profileName && agentNickname && agentNickname !== "Business" && agentNickname.length >= 2) {
      supabaseAdmin.from("profiles").update({ business_name: agentNickname }).eq("user_id", agentRow.user_id).then(() => {});
    }
    const dynamicVariables = {
      business_name: businessName,
      cal_com_link: String(profile?.cal_com_url || integration?.booking_url || ""),
      transfer_number: String(agentRow.transfer_number || ""),
      agent_tone: String(agentRow.tone || "Calm & Professional"),
      schedule_summary: String(agentRow.schedule_summary || ""),
      standard_fee: String(agentRow.standard_fee != null ? agentRow.standard_fee : ""),
      emergency_fee: String(agentRow.emergency_fee != null ? agentRow.emergency_fee : ""),
    };

    const isPendingAgent = String(agentRow.agent_id || "").startsWith("pending-");
    const requestAgentId = inbound.agent_id ?? payload.agent_id;
    const overrideId = !isPendingAgent && agentRow.agent_id ? agentRow.agent_id : (isPendingAgent && requestAgentId ? requestAgentId : null);

    // Only send override_agent_id when it actually changes the agent. If same as request, omit so Retell applies vars without "resetting".
    const sendOverride = overrideId && overrideId !== requestAgentId;

    const callInbound = {
      ...(sendOverride && { override_agent_id: overrideId, override_agent_version: 1 }),
      agent_override: {
        retell_llm: {
          begin_message: `Thanks for calling {{business_name}}, this is Grace. How can I help you?`,
        },
      },
      dynamic_variables: dynamicVariables,
    };
    const responsePayload = { call_inbound: callInbound };
    const elapsed = Date.now() - startMs;
    console.log("📤 [retell-inbound] response", JSON.stringify(responsePayload, null, 2));
    console.log(`⏱️ [retell-inbound] ${elapsed}ms`);
    if (elapsed > 5000) console.warn("⚠️ [retell-inbound] Slow: Retell timeout ~10s.");
    
    // Mark webhook as processed
    await markWebhookProcessed(idempotencyKey, "success");
    
    return res.status(200).json(responsePayload);
  } catch (err) {
    console.error("🔥 [retell-inbound] error", err);
    return res.status(500).json({ error: err.message });
  }
});

// Note: Retell webhooks should NOT use IP allowlist - they come from Retell's servers
// Security is handled via RETELL_WEBHOOK_SECRET signature verification in retellWebhookHandler
app.post("/retell-webhook", retellWebhookHandler);
app.post("/api/retell/webhook", retellWebhookHandler);

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
  resolveEffectiveUser,
  rateLimit({ keyPrefix: "tracking-create", limit: 10, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const uid = req.effectiveUserId ?? req.user.id;
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
          created_by: uid,
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

app.get(
  "/appointments",
  requireAuth,
  resolveEffectiveUser,
  rateLimit({ keyPrefix: "appointments-list", limit: 60, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const uid = req.effectiveUserId ?? req.user.id;
      const startTime = req.query.start_time || req.query.start;
      const endTime = req.query.end_time || req.query.end;
      if (!startTime || !endTime) {
        return res.status(400).json({ error: "start_time and end_time are required" });
      }
      const { data, error } = await supabaseAdmin
        .from("appointments")
        .select("*")
        .eq("user_id", uid)
        .gte("start_time", startTime)
        .lte("start_time", endTime)
        .order("start_time", { ascending: true });
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      return res.json({ appointments: data || [] });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

app.post(
  "/appointments",
  requireAuth,
  resolveEffectiveUser,
  rateLimit({ keyPrefix: "appointments", limit: 30, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const uid = req.effectiveUserId ?? req.user.id;
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
          user_id: uid,
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
  resolveEffectiveUser,
  rateLimit({ keyPrefix: "appointments-update", limit: 30, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const uid = req.effectiveUserId ?? req.user.id;
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
        .eq("user_id", uid)
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
          .eq("user_id", uid)
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
      
      // REVIEW REQUEST AUTOMATION: Trigger when appointment is completed
      if (status === "completed" && existing.status !== "completed" && data.customer_phone) {
        try {
          // Check if review requests are enabled for this user
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("review_request_enabled, google_review_url, review_request_template, business_name")
            .eq("user_id", uid)
            .maybeSingle();
          
          if (profile?.review_request_enabled && profile?.google_review_url) {
            const delayHours = profile.review_request_delay_hours || 24;
            const delayMs = delayHours * 60 * 60 * 1000;
            
            // Build the review request message
            let reviewMsg = profile.review_request_template || 
              "Thanks for choosing {business}! We hope you had a great experience. Please leave us a review: {review_link}";
            reviewMsg = reviewMsg.replace(/\{business\}/gi, profile.business_name || "us");
            reviewMsg = reviewMsg.replace(/\{review_link\}/gi, profile.google_review_url);
            
            // Get agent for sending SMS
            const { data: agent } = await supabaseAdmin
              .from("agents")
              .select("id")
              .eq("user_id", uid)
              .maybeSingle();
            
            // Log the automation
            await supabaseAdmin.from("sms_automation_log").insert({
              user_id: uid,
              appointment_id: data.id,
              automation_type: "review_request",
              to_number: data.customer_phone,
              message_body: reviewMsg,
              status: "pending",
              metadata: { delay_ms: delayMs, google_review_url: profile.google_review_url },
            });
            
            // Schedule the review request SMS
            setTimeout(async () => {
              try {
                await sendSmsInternal({
                  userId: uid,
                  agentId: agent?.id,
                  to: data.customer_phone,
                  body: reviewMsg,
                  source: "auto_review_request",
                });
                
                // Update automation log
                await supabaseAdmin
                  .from("sms_automation_log")
                  .update({ status: "sent", sent_at: new Date().toISOString() })
                  .eq("appointment_id", data.id)
                  .eq("automation_type", "review_request")
                  .eq("status", "pending");
                
                console.log("⭐ [review_request] Sent review request to", data.customer_phone);
              } catch (smsErr) {
                console.error("⭐ [review_request] Failed:", smsErr.message);
                await supabaseAdmin
                  .from("sms_automation_log")
                  .update({ status: "failed", error_message: smsErr.message })
                  .eq("appointment_id", data.id)
                  .eq("automation_type", "review_request")
                  .eq("status", "pending");
              }
            }, delayMs);
            
            console.log("⭐ [review_request] Scheduled review request in", delayHours, "hours");
          }
        } catch (reviewErr) {
          console.error("⭐ [review_request] Error:", reviewErr.message);
        }
      }
      
      return res.json({ appointment: data });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

// Manual review request endpoint
app.post(
  "/appointments/:id/request-review",
  requireAuth,
  resolveEffectiveUser,
  rateLimit({ keyPrefix: "review-request", limit: 10, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const uid = req.effectiveUserId ?? req.user.id;
      const { id } = req.params;
      
      // Get the appointment
      const { data: appointment, error: apptError } = await supabaseAdmin
        .from("appointments")
        .select("*")
        .eq("id", id)
        .eq("user_id", uid)
        .maybeSingle();
      
      if (apptError || !appointment) {
        return res.status(404).json({ error: "Appointment not found" });
      }
      
      if (!appointment.customer_phone) {
        return res.status(400).json({ error: "No customer phone number for this appointment" });
      }
      
      // Get user's review settings
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("google_review_url, review_request_template, business_name")
        .eq("user_id", uid)
        .maybeSingle();
      
      if (!profile?.google_review_url) {
        return res.status(400).json({ error: "Please configure your Google Review URL in Settings first" });
      }
      
      // Build the review request message
      let reviewMsg = profile.review_request_template || 
        "Thanks for choosing {business}! We hope you had a great experience. Please leave us a review: {review_link}";
      reviewMsg = reviewMsg.replace(/\{business\}/gi, profile.business_name || "us");
      reviewMsg = reviewMsg.replace(/\{review_link\}/gi, profile.google_review_url);
      
      // Get agent for sending SMS
      const { data: agent } = await supabaseAdmin
        .from("agents")
        .select("id")
        .eq("user_id", uid)
        .maybeSingle();
      
      // Send immediately
      await sendSmsInternal({
        userId: uid,
        agentId: agent?.id,
        to: appointment.customer_phone,
        body: reviewMsg,
        source: "manual_review_request",
      });
      
      // Log the automation
      await supabaseAdmin.from("sms_automation_log").insert({
        user_id: uid,
        appointment_id: appointment.id,
        automation_type: "review_request",
        to_number: appointment.customer_phone,
        message_body: reviewMsg,
        status: "sent",
        sent_at: new Date().toISOString(),
        metadata: { manual: true, google_review_url: profile.google_review_url },
      });
      
      return res.json({ ok: true, message: "Review request sent successfully" });
    } catch (err) {
      console.error("[request-review] error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

app.delete(
  "/appointments/:id",
  requireAuth,
  resolveEffectiveUser,
  rateLimit({ keyPrefix: "appointments-delete", limit: 30, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const uid = req.effectiveUserId ?? req.user.id;
      const { id } = req.params || {};
      if (!id) {
        return res.status(400).json({ error: "appointment id is required" });
      }
      const { data, error } = await supabaseAdmin
        .from("appointments")
        .delete()
        .eq("id", id)
        .eq("user_id", uid)
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
  resolveEffectiveUser,
  rateLimit({ keyPrefix: "checkout", limit: 8, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const uid = req.effectiveUserId ?? req.user.id;
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

      const resolvedTier =
        String(planTier || "").trim().toLowerCase() ||
        resolvePlanTierFromPriceId(priceId) ||
        "pro";
      const caps = getPlanCaps(resolvedTier);

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: safeSuccessUrl,
        cancel_url: safeCancelUrl,
        client_reference_id: uid,
        metadata: {
          user_id: String(uid),
          email: String(req.user.email || ""),
          planTier: resolvedTier,
          minutesCap: String(caps.minutesCap),
          smsCap: String(caps.smsCap),
          plan_type: resolvedTier,
        },
      });

      await auditLog({
        userId: req.user.id,
        action: "checkout_created",
        entity: "stripe_session",
        entityId: session.id,
        req,
        metadata: {
          plan_type: resolvedTier || null,
          lookup_key: lookup_key || null,
        },
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
  resolveEffectiveUser,
  rateLimit({ keyPrefix: "portal", limit: 8, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const uid = req.effectiveUserId ?? req.user.id;
      const { data: subscription, error } = await supabaseAdmin
        .from("subscriptions")
        .select("customer_id")
        .eq("user_id", uid)
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
  resolveEffectiveUser,
  rateLimit({ keyPrefix: "topup", limit: 8, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const uid = req.effectiveUserId ?? req.user.id;
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
        client_reference_id: uid,
        metadata: {
          type: "topup",
          user_id: String(uid),
          email: String(req.user.email || ""),
          call_seconds: String(topup.call_seconds),
          sms_count: String(topup.sms_count),
          topup_type: topupType,
          extra_minutes: String(Math.floor((topup.call_seconds || 0) / 60)),
          extra_sms: String(topup.sms_count || 0),
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

app.get("/subscription-status", requireAuth, resolveEffectiveUser, async (req, res) => {
  try {
    const uid = req.effectiveUserId ?? req.user.id;
    const { data, error } = await supabaseAdmin
      .from("subscriptions")
      .select("status, plan_type, current_period_end")
      .eq("user_id", uid)
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

app.get(
  "/deploy-status",
  requireAuth,
  resolveEffectiveUser,
  rateLimit({ keyPrefix: "deploy-status", limit: 60, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const uid = req.effectiveUserId ?? req.user.id;
      const [profileRes, agentRes, subRes] = await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("business_name, area_code, deploy_error")
          .eq("user_id", uid)
          .maybeSingle(),
        supabaseAdmin
          .from("agents")
          .select("agent_id, phone_number")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabaseAdmin
          .from("subscriptions")
          .select("plan_type, status")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const profile = profileRes.data;
      const agent = agentRes.data;
      const sub = subRes.data;
      const has_agent =
        Boolean(agent?.agent_id) && Boolean(agent?.phone_number);
      return res.json({
        has_agent: !!has_agent,
        phone_number: agent?.phone_number || null,
        agent_id: agent?.agent_id || null,
        deploy_error: profile?.deploy_error || null,
        business_name: profile?.business_name || null,
        area_code: profile?.area_code || null,
        plan_type: sub?.plan_type || null,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

app.post(
  "/deploy-agent-self",
  requireAuth,
  resolveEffectiveUser,
  rateLimit({ keyPrefix: "deploy-agent-self", limit: 6, windowMs: 60_000 }),
  async (req, res) => {
    const deployRequestId = `deploy-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const ts = new Date().toISOString();
    const uid = req.effectiveUserId ?? req.user.id;
    console.log("📥 SERVER RECEIVED:", req.body || {});
    console.info("[deploy-agent-self] start", {
      deployRequestId,
      userId: uid,
      timestamp: ts,
      method: req.method,
      body: req.body || {},
      headers: {
        "content-type": req.headers["content-type"],
        authorization: req.headers.authorization ? "Bearer ***" : undefined,
      },
    });
    try {
      const transferNumber =
        req.body && typeof req.body.transfer_number !== "undefined"
          ? String(req.body.transfer_number || "").trim() || null
          : null;
      const businessNameRaw = req.body && req.body.business_name != null ? String(req.body.business_name || "").trim() : null;
      const areaCodeRaw = req.body && req.body.area_code != null ? String(req.body.area_code || "").trim() : null;
      console.info("[deploy-agent-self] identity payload", { business_name: businessNameRaw || "(empty)", area_code: areaCodeRaw || "(empty)" });
      if (businessNameRaw && businessNameRaw.length >= 2 && businessNameRaw.length <= 80) {
        const { error: upsertErr } = await supabaseAdmin.from("profiles").upsert({
          user_id: uid,
          business_name: businessNameRaw,
          ...(areaCodeRaw && /^\d{3}$/.test(areaCodeRaw) ? { area_code: areaCodeRaw } : {}),
        }, { onConflict: "user_id" });
        if (upsertErr) {
          console.error("🔥 DB SAVE FAILED (profiles):", { userId: uid, error: upsertErr.message });
        } else {
          const { data: verify } = await supabaseAdmin.from("profiles").select("business_name").eq("user_id", uid).maybeSingle();
          console.info("[deploy-agent-self] profiles updated", { userId: uid, business_name: businessNameRaw, verified_in_db: verify?.business_name || "(empty)" });
        }
      } else if (areaCodeRaw && /^\d{3}$/.test(areaCodeRaw)) {
        await supabaseAdmin.from("profiles").update({ area_code: areaCodeRaw }).eq("user_id", uid);
      } else if (!businessNameRaw || businessNameRaw.length < 2) {
        console.warn("[deploy-agent-self] no valid business_name in request — profile not updated");
      }
      const result = await deployAgentForUser(uid, deployRequestId, {
        transferNumber,
      });
      if (result.error) {
        const status =
          result.error === "AREA_CODE_UNAVAILABLE" ? 400 : 500;
        console.warn("[deploy-agent-self] deployAgentForUser returned error", {
          deployRequestId,
          userId: uid,
          error: result.error,
          httpStatus: status,
        });
        return res.status(status).json({ error: result.error });
      }
      await supabaseAdmin
        .from("profiles")
        .update({ onboarding_step: 3 })
        .eq("user_id", uid);
      return res.json({
        ok: true,
        phone_number: result.phone_number,
        agent_id: result.agent_id,
      });
    } catch (err) {
      const errResponse = err.response || {};
      const retellBody = errResponse.data;
      console.error("[deploy-agent-self] thrown", {
        deployRequestId,
        userId: uid,
        timestamp: new Date().toISOString(),
        message: err.message,
        responseStatus: errResponse.status,
        responseHeaders: errResponse.headers ? JSON.stringify(errResponse.headers) : undefined,
        responseData: retellBody,
        stack: err.stack?.split("\n").slice(0, 20).join("\n"),
      });
      // Surface Retell error so we can see exact cause (which call, what they said)
      return res.status(500).json({
        error: err.message,
        retell_status: errResponse.status,
        retell_error: retellBody,
      });
    }
  }
);

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
        .update({ role: "active", onboarding_step: 3 })
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
  "/onboarding/identity",
  requireAuth,
  rateLimit({ keyPrefix: "onboard", limit: 8, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { businessName, areaCode, industry } = req.body || {};
      const cleanName = String(businessName || "").trim();
      const cleanArea = String(areaCode || "").trim();
      const cleanIndustry = String(industry || "hvac").trim().toLowerCase();
      const allowedIndustry = ["hvac", "plumbing"].includes(cleanIndustry) ? cleanIndustry : "hvac";
      if (!cleanName || cleanName.length < 2 || cleanName.length > 80) {
        return res.status(400).json({ error: "businessName is invalid" });
      }
      if (cleanArea && !/^\d{3}$/.test(cleanArea)) {
        return res.status(400).json({ error: "areaCode must be 3 digits" });
      }

      const { error: upsertError } = await supabaseAdmin
        .from("profiles")
        .upsert(
          {
            user_id: req.user.id,
            business_name: cleanName,
            area_code: cleanArea || null,
            industry: allowedIndustry,
            onboarding_step: 2,
          },
          { onConflict: "user_id" }
        );
      if (upsertError) {
        console.error("[onboarding/identity] profiles upsert failed", { userId: req.user.id, error: upsertError });
        return res.status(500).json({ error: "Failed to save business name", details: upsertError.message });
      }

      await auditLog({
        userId: req.user.id,
        action: "onboarding_identity_saved",
        entity: "profile",
        entityId: req.user.id,
        req,
      });

      return res.json({ ok: true });
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

const ADMIN_ONBOARD_DEFAULTS = {
  industry: "hvac",
  tone: "Calm & Professional",
  travelLimitValue: 30,
  travelLimitMode: "minutes",
};

const buildAdminScheduleSummary = () =>
  "Standard operating hours are Monday through Friday, 08:00 AM to 05:00 PM. We are closed on weekends. We do NOT offer after-hours service. If they call late, ask them to call back in the morning.";

const createAdminAgent = async ({ userId, businessName, areaCode, industry: industryParam, deployRequestId: reqId }) => {
  const industry = industryParam && ["hvac", "plumbing"].includes(String(industryParam).toLowerCase())
    ? String(industryParam).toLowerCase()
    : ADMIN_ONBOARD_DEFAULTS.industry;
  const tone = ADMIN_ONBOARD_DEFAULTS.tone;
  const providerBaseUrl = (retellClient.defaults?.baseURL || "https://api.retellai.com").replace(/\/$/, "");
  const providerHeaders = {
    Authorization: "Bearer ***",
    "Content-Type": retellClient.defaults?.headers?.["Content-Type"] || "application/json",
  };
  console.info("[createAdminAgent] input", {
    deployRequestId: reqId,
    userId,
    businessName,
    areaCode,
    industry,
    profileIndustry: industryParam,
    providerBaseUrl,
    providerApiKeyEnvVar: "RETELL_API_KEY",
  });
  const scheduleSummary = buildAdminScheduleSummary();
  const dispatchBaseLocation = areaCode
    ? `Area Code ${areaCode}`
    : "Local Service Area";
  const travelValue = ADMIN_ONBOARD_DEFAULTS.travelLimitValue;
  const travelMode = ADMIN_ONBOARD_DEFAULTS.travelLimitMode;
  const travelInstruction = buildTravelInstruction({
    dispatchBaseLocation,
    travelLimitValue: travelValue,
    travelLimitMode: travelMode,
  });

  const llmId = pickLlmId(industry);
  const llmVersion = pickLlmVersion(industry);
  const llmVersionNumber = parseRetellVersionNumber(llmVersion);
  const dynamicVars = {
    business_name: String(businessName || ""),
    industry: String(industry || ""),
    transfer_number: "",
    cal_com_link: "",
    agent_tone: String(tone || ADMIN_ONBOARD_DEFAULTS.tone),
    schedule_summary: String(scheduleSummary || ""),
    standard_fee: "",
    emergency_fee: "",
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
      userId,
      industry,
    });
  const backendPrompt = buildDispatchPrompt({
    mode: promptMode,
    industry,
    businessName,
    agentTone: tone,
    scheduleSummary,
    standardFee: null,
    emergencyFee: null,
    transferNumber: null,
    travelInstruction,
  });
  const legacyPrompt = `You are the AI phone agent for ${businessName}, a ${industry} business. Be concise, professional, and focus on booking service calls. Voice tone: ${
    tone || ADMIN_ONBOARD_DEFAULTS.tone
  }. Collect caller name, phone, address, issue, and preferred time. Scheduling: ${scheduleSummary} ${travelInstruction}`.trim();
  const finalPrompt = promptMode === "template"
    ? null
    : useBackendPrompt
    ? backendPrompt
    : `${legacyPrompt}

Greeting:
${greeting}

Business Variables:
- business_name: ${businessName}
- cal_com_link: not_set
- transfer_number: not_set`.trim();

  const resolvedVoiceId = RETELL_VOICE_ID || "11labs-Grace";
  if (!resolvedVoiceId) {
    throw new Error("Missing voice_id");
  }

  const sourceAgentId = pickMasterAgentId(industry);
  if (!sourceAgentId) {
    throw new Error("Missing master agent id for industry");
  }
  // Single line to grep in Railway: exact agent + LLM we're calling
  console.info("[RETELL_IDS] deploy call", {
    deployRequestId: reqId,
    industry,
    masterAgentIdUsed: sourceAgentId,
    llmIdUsed: llmId,
    llmVersionUsed: llmVersion,
    env_RETELL_MASTER_AGENT_ID_HVAC: RETELL_MASTER_AGENT_ID_HVAC || "(missing)",
    env_RETELL_MASTER_AGENT_ID_PLUMBING: RETELL_MASTER_AGENT_ID_PLUMBING || "(missing)",
    env_RETELL_LLM_ID_HVAC: RETELL_LLM_ID_HVAC || "(missing)",
    env_RETELL_LLM_ID_PLUMBING: RETELL_LLM_ID_PLUMBING || "(missing)",
    env_RETELL_LLM_VERSION_HVAC: RETELL_LLM_VERSION_HVAC || "(missing)",
    env_RETELL_LLM_VERSION_PLUMBING: RETELL_LLM_VERSION_PLUMBING || "(missing)",
  });
  console.info("[createAdminAgent] template (agent/template selection)", {
    deployRequestId: reqId,
    industry,
    agentTemplateId: sourceAgentId,
    agentTemplateName: `${industry} master`,
    llmId,
    modelId: llmVersion,
    providerPath: `/get-agent/${sourceAgentId}`,
  });

  // Retell docs: no copy-agent; use GET agent + POST create-agent (https://docs.retellai.com/api-references/create-agent)
  let agentId = null;
  const getPath = `/get-agent/${encodeURIComponent(sourceAgentId)}`;
  const getUrl = `${providerBaseUrl}${getPath}`;
  console.info("[createAdminAgent] provider call about to run", {
    deployRequestId: reqId,
    providerUrl: getUrl,
    method: "GET",
    headers: providerHeaders,
    requestBody: null,
  });
  let getRes;
  try {
    getRes = await retellClient.get(getPath);
    console.info("[createAdminAgent] provider response", {
      deployRequestId: reqId,
      call: "get-agent",
      status: getRes.status,
      responseBody: getRes.data,
    });
  } catch (getErr) {
    const status = getErr.response?.status;
    const responseBody = getErr.response?.data;
    console.error("[createAdminAgent] provider call failed", {
      deployRequestId: reqId,
      providerUrl: getUrl,
      method: "GET",
      responseStatus: status,
      responseBody,
      stack: getErr.stack?.split("\n").slice(0, 20).join("\n"),
    });
    if (status === 404) {
      throw new Error(
        "Retell template agent not found (404). Check RETELL_MASTER_AGENT_ID_HVAC in server .env matches an agent in your Retell dashboard."
      );
    }
    throw getErr;
  }
  const template = getRes.data?.agent ?? getRes.data;
  if (!template?.response_engine || !template?.voice_id) {
    console.error("[createAdminAgent] Template agent missing response_engine or voice_id.", {
      sourceAgentId,
      hasResponseEngine: !!template?.response_engine,
      hasVoiceId: !!template?.voice_id,
    });
    throw new Error(
      "Retell template agent missing config. Check RETELL_MASTER_AGENT_ID_HVAC points to a valid agent with response_engine and voice_id."
    );
  }
  // Retell create-agent: response_engine with type and llm_id. Don't specify version on create - we'll update after.
  const re = template.response_engine || {};
  const masterLlmVersion = re.version; // Save master's LLM version to apply after creation
  const response_engine = {
    type: re.type || "retell-llm",
    llm_id: re.llm_id,
    // version omitted for creation - Retell doesn't allow version > 0 on create
  };
  if (!response_engine.llm_id) {
    throw new Error("Template agent response_engine missing llm_id. Check RETELL_MASTER_AGENT_ID_HVAC points to a Retell-LLM agent.");
  }
  const createBody = {
    response_engine,
    voice_id: template.voice_id,
    agent_name: `${businessName} AI Agent`,
  };
  const createPath = "/create-agent";
  const createUrl = `${providerBaseUrl}${createPath}`;
  console.info("[createAdminAgent] provider call about to run", {
    deployRequestId: reqId,
    providerUrl: createUrl,
    method: "POST",
    headers: providerHeaders,
    requestBody: createBody,
  });
  try {
    const createRes = await retellClient.post(createPath, createBody);
    console.info("[createAdminAgent] provider response", {
      deployRequestId: reqId,
      call: "create-agent",
      status: createRes.status,
      responseBody: createRes.data,
    });
    agentId =
      createRes.data?.agent_id ?? createRes.data?.agent?.agent_id ?? createRes.data?.id;
    if (!agentId) {
      throw new Error("Retell create-agent did not return agent_id");
    }
  } catch (createErr) {
    const status = createErr.response?.status;
    const responseBody = createErr.response?.data;
    console.error("[createAdminAgent] provider call failed", {
      deployRequestId: reqId,
      providerUrl: createUrl,
      method: "POST",
      requestBody: createBody,
      responseStatus: status,
      responseBody,
      stack: createErr.stack?.split("\n").slice(0, 20).join("\n"),
    });
    throw createErr;
  }

  // Retell update-agent: only documented fields (https://docs.retellai.com/api-references/update-agent)
  // Do not send retell_llm_dynamic_variables or prompt – they cause 400
  // Include response_engine.version to use the master's published LLM version (not draft)
  const updatePayload = {
    agent_name: `${businessName} AI Agent`,
    webhook_url: `${serverBaseUrl.replace(/\/$/, "")}/retell-webhook`,
    webhook_timeout_ms: 10000,
    voice_id: resolvedVoiceId,
    // Set the LLM version to match master's published version (if available)
    ...(masterLlmVersion && masterLlmVersion > 0 ? {
      response_engine: {
        type: re.type || "retell-llm",
        llm_id: re.llm_id,
        version: masterLlmVersion,
      },
    } : {}),
  };
  
  console.info("[createAdminAgent] will update agent with LLM version", {
    deployRequestId: reqId,
    masterLlmVersion,
    willSetVersion: masterLlmVersion && masterLlmVersion > 0,
  });
  const updatePath = `/update-agent/${agentId}`;
  const updateUrl = `${providerBaseUrl}${updatePath}`;
  console.info("[createAdminAgent] provider call about to run", {
    deployRequestId: reqId,
    providerUrl: updateUrl,
    method: "PATCH",
    headers: providerHeaders,
    requestBody: updatePayload,
  });
  try {
    await retellClient.patch(updatePath, updatePayload);
    console.info("[createAdminAgent] provider response", {
      deployRequestId: reqId,
      call: "update-agent",
      status: 200,
      responseBody: null,
    });
  } catch (updateErr) {
    console.error("[createAdminAgent] provider call failed", {
      deployRequestId: reqId,
      providerUrl: updateUrl,
      method: "PATCH",
      requestBody: updatePayload,
      responseStatus: updateErr.response?.status,
      responseBody: updateErr.response?.data,
      stack: updateErr.stack?.split("\n").slice(0, 20).join("\n"),
    });
    throw updateErr;
  }

  console.info("[retell] admin agent created", {
    agent_id: agentId,
    llm_id: llmId,
    llm_version: llmVersionNumber,
    source_agent_id: sourceAgentId,
  });

  // Retell create-phone-number: documented body only (https://docs.retellai.com/api-references/create-phone-number)
  const phonePayload = {
    inbound_agent_id: agentId,
    outbound_agent_id: agentId,
    area_code:
      areaCode && String(areaCode).length === 3 ? Number(areaCode) : undefined,
    country_code: "US",
    nickname: `${businessName} Line`,
    inbound_webhook_url: `${serverBaseUrl.replace(/\/$/, "")}/webhooks/retell-inbound`,
  };
  const phonePath = "/create-phone-number";
  const phoneUrl = `${providerBaseUrl}${phonePath}`;
  console.info("[createAdminAgent] provider call about to run", {
    deployRequestId: reqId,
    providerUrl: phoneUrl,
    method: "POST",
    headers: providerHeaders,
    requestBody: phonePayload,
    areaCode: phonePayload.area_code,
    plan: null,
  });
  let phoneResponse;
  try {
    phoneResponse = await retellClient.post(phonePath, phonePayload);
    console.info("[createAdminAgent] provider response", {
      deployRequestId: reqId,
      call: "create-phone-number",
      status: phoneResponse.status,
      responseBody: phoneResponse.data,
      phone_number: phoneResponse.data?.phone_number ?? phoneResponse.data?.number,
    });
  } catch (phoneErr) {
    console.error("[createAdminAgent] provider call failed", {
      deployRequestId: reqId,
      providerUrl: phoneUrl,
      method: "POST",
      requestBody: phonePayload,
      responseStatus: phoneErr.response?.status,
      responseBody: phoneErr.response?.data,
      stack: phoneErr.stack?.split("\n").slice(0, 20).join("\n"),
    });
    throw phoneErr;
  }
  const phoneNumber = phoneResponse.data.phone_number || phoneResponse.data.number;

  const { error: insertError } = await supabaseAdmin.from("agents").insert({
    user_id: userId,
    agent_id: agentId,
    phone_number: phoneNumber,
    voice_id: RETELL_VOICE_ID || null,
    llm_id: llmId,
    prompt: finalPrompt || null,
    area_code: areaCode || null,
    tone: tone || null,
    schedule_summary: scheduleSummary || null,
    standard_fee: null,
    emergency_fee: null,
    payment_id: "admin_onboarded",
    transfer_number: null,
    dispatch_base_location: dispatchBaseLocation || null,
    travel_limit_value: travelValue,
    travel_limit_mode: travelMode,
    is_active: true,
  });

  if (insertError) {
    throw new Error(insertError.message);
  }

  await auditLog({
    userId,
    action: "admin_agent_deployed",
    entity: "agent",
    entityId: agentId,
  });

  console.info("[createAdminAgent] output (agent/template/LLM selection result)", {
    deployRequestId: reqId,
    templateId: sourceAgentId,
    templateName: `${industry} master`,
    llmId,
    llmVersion,
    agent_id: agentId,
    phone_number: phoneNumber,
    functionsAttached: null,
  });

  return { agent_id: agentId, phone_number: phoneNumber };
};

/**
 * Full deploy: create Retell agent clone from master template + phone number.
 * Agent gets all functions/KB from master LLM. Phone number linked to agent.
 * Stores real agent_id in database (not pending).
 */
const provisionPhoneNumberOnly = async ({
  userId,
  businessName,
  areaCode,
  deployRequestId: reqId,
  transferNumber: transferNumberRaw,
  updateExisting = false,
  industry = "hvac",
}) => {
  const nickname = String(businessName || "").trim() || "Business";
  
  // STEP 1: Select the correct MASTER agent based on industry (NO CLONING)
  // All customers share the master agent - tracking is done via phone number
  const masterAgentId = industry === "plumbing" 
    ? RETELL_MASTER_AGENT_ID_PLUMBING 
    : RETELL_MASTER_AGENT_ID_HVAC;
  
  if (!masterAgentId) {
    throw new Error(`Missing RETELL_MASTER_AGENT_ID_${industry.toUpperCase()} env variable`);
  }
  
  console.info("[provisionAgent] using MASTER agent directly (no cloning)", {
    deployRequestId: reqId,
    masterAgentId,
    industry,
    businessName: nickname,
  });
  
  // Verify master agent exists
  try {
    await retellClient.get(`/get-agent/${encodeURIComponent(masterAgentId)}`);
    console.info("[provisionAgent] master agent verified", { masterAgentId });
  } catch (err) {
    console.error("[provisionAgent] master agent not found", {
      deployRequestId: reqId,
      masterAgentId,
      error: err.message,
    });
    throw new Error(`Master agent not found: ${masterAgentId}. Check RETELL_MASTER_AGENT_ID_${industry.toUpperCase()}`);
  }
  
  // STEP 2: Create phone number pointing to the MASTER agent
  // Inbound webhook is set so we can inject dynamic variables per-call
  // Version locks the phone to a specific published agent version (not draft)
  const agentVersion = industry === "plumbing"
    ? (RETELL_AGENT_VERSION_PLUMBING ? parseInt(RETELL_AGENT_VERSION_PLUMBING, 10) : null)
    : (RETELL_AGENT_VERSION_HVAC ? parseInt(RETELL_AGENT_VERSION_HVAC, 10) : null);
  
  const phonePayload = {
    inbound_agent_id: masterAgentId,
    outbound_agent_id: masterAgentId,
    area_code: areaCode && String(areaCode).length === 3 ? Number(areaCode) : undefined,
    country_code: "US",
    nickname: `${nickname} Line`,
    inbound_webhook_url: `${serverBaseUrl.replace(/\/$/, "")}/webhooks/retell-inbound`,
  };
  
  // Lock to specific published version if set (otherwise uses draft/latest)
  if (agentVersion !== null && !isNaN(agentVersion)) {
    phonePayload.inbound_agent_version = agentVersion;
    phonePayload.outbound_agent_version = agentVersion;
  }
  
  console.info("[provisionAgent] creating phone number linked to master", {
    deployRequestId: reqId,
    masterAgentId,
    agentVersion: agentVersion ?? "draft (latest)",
    area_code: phonePayload.area_code,
  });
  
  let phoneResponse;
  try {
    phoneResponse = await retellClient.post("/create-phone-number", phonePayload);
  } catch (err) {
    console.error("[provisionAgent] create-phone-number failed", {
      deployRequestId: reqId,
      responseStatus: err.response?.status,
      responseBody: err.response?.data,
    });
    const retellMsg = err.response?.data?.message || "";
    if (err.response?.status === 404 && retellMsg.toLowerCase().includes("no phone numbers")) {
      const userError = new Error(`No phone numbers available for area code ${areaCode}. Please choose a different area code and try again.`);
      userError.retellStatus = err.response.status;
      userError.retellError = err.response.data;
      userError.isAreaCodeUnavailable = true;
      throw userError;
    }
    throw err;
  }
  
  const phoneNumber = phoneResponse.data?.phone_number || phoneResponse.data?.number;
  if (!phoneNumber) {
    throw new Error("Retell create-phone-number did not return phone_number");
  }
  
  console.info("[provisionAgent] phone number created and linked to master", {
    deployRequestId: reqId,
    phone_number: phoneNumber,
    masterAgentId,
    industry,
  });
  
  // STEP 3: Store in database - phone_number is the KEY for tracking
  // We store masterAgentId for reference but tracking uses phone_number
  const transferNumber =
    transferNumberRaw != null
      ? String(transferNumberRaw).replace(/[^\d+]/g, "").trim() || null
      : null;
  
  const agentRow = {
    agent_id: masterAgentId,  // Reference to master (tracking uses phone_number)
    phone_number: phoneNumber,  // THIS IS THE GOLDEN KEY FOR TRACKING
    voice_id: null,
    llm_id: null,
    prompt: null,
    area_code: areaCode || null,
    tone: null,
    schedule_summary: null,
    standard_fee: null,
    emergency_fee: null,
    payment_id: "user_deployed",
    transfer_number: transferNumber || null,
    dispatch_base_location: null,
    travel_limit_value: null,
    travel_limit_mode: null,
    is_active: true,
    deploy_request_id: reqId || null,
    nickname: nickname || null,
    provider_number_id: phoneNumber || null,
    industry: industry || "hvac",  // Store industry for reference
  };
  
  if (updateExisting) {
    const { error: updateError } = await supabaseAdmin
      .from("agents")
      .update(agentRow)
      .eq("user_id", userId);
    if (updateError) {
      console.error("[provisionAgent] update failed", { userId, error: updateError.message });
      throw new Error(updateError.message);
    }
    console.info("[provisionAgent] updated existing row", { userId, phone_number: phoneNumber, masterAgentId });
  } else {
    const { error: insertError } = await supabaseAdmin.from("agents").insert({
      user_id: userId,
      ...agentRow,
    });
    if (insertError) {
      console.error("[provisionAgent] insert failed", { userId, error: insertError.message });
      throw new Error(insertError.message);
    }
  }

  await auditLog({
    userId,
    action: "agent_deployed",
    entity: "agent",
    entityId: masterAgentId,
  });

  console.info("[provisionAgent] done - using MASTER agent (no clone)", {
    deployRequestId: reqId,
    phone_number: phoneNumber,
    masterAgentId,
    industry,
  });
  
  return { phone_number: phoneNumber, agent_id: masterAgentId };
};

/**
 * Shared deploy logic: provision agent for a user (used by /admin/deploy-agent and Stripe webhook).
 * Requires: active subscription, consent, business_name. area_code optional but required for provisioning.
 * On area code unavailable or other failure, sets profiles.deploy_error and returns { error }.
 * @param {string} [deployRequestId] - Optional correlation id for logging.
 */
const deployAgentForUser = async (userId, deployRequestId, options = {}) => {
  const targetUserId = String(userId ?? "").trim();
  const reqId = deployRequestId || `deploy-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  if (!targetUserId) {
    return { error: "user_id required" };
  }
  const providerBaseUrl = retellClient.defaults?.baseURL || "https://api.retellai.com";
  console.info("[deployAgentForUser] context", {
    deployRequestId: reqId,
    providerBaseUrl,
    providerApiKeyEnvVar: "RETELL_API_KEY",
    userId: targetUserId,
  });

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("business_name, area_code, industry, consent_accepted_at, consent_version")
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (profileError || !profile) {
    console.warn("[deployAgentForUser] profile fetch failed", { targetUserId, error: profileError?.message });
    return { error: profileError?.message || "Profile not found" };
  }
  console.info("[deployAgentForUser] profile", {
    deployRequestId: reqId,
    userId: targetUserId,
    business_name: profile.business_name,
    area_code: profile.area_code,
    industry: profile.industry,
    hasConsent: !!profile.consent_accepted_at,
    consent_version: profile.consent_version,
  });
  if (
    !profile.consent_accepted_at ||
    profile.consent_version !== currentConsentVersion
  ) {
    return { error: "Consent required for this user" };
  }

  const { data: subRows, error: subError } = await supabaseAdmin
    .from("subscriptions")
    .select("status, plan_type, current_period_end")
    .eq("user_id", targetUserId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (subError) {
    return { error: subError.message };
  }
  const sub = subRows?.[0] || null;
  if (!isSubscriptionActive(sub)) {
    return { error: "Active subscription required" };
  }

  const businessName =
    String(profile.business_name || "").trim() || "Business";
  const areaCodeRaw = String(profile.area_code ?? "").trim();
  if (!/^\d{3}$/.test(areaCodeRaw)) {
    console.warn("[deployAgentForUser] area_code invalid", { userId: targetUserId, area_code: profile.area_code, areaCodeRaw, length: areaCodeRaw.length });
    await supabaseAdmin
      .from("profiles")
      .update({ deploy_error: "AREA_CODE_UNAVAILABLE" })
      .eq("user_id", targetUserId);
    return { error: "AREA_CODE_UNAVAILABLE" };
  }
  const areaCode = areaCodeRaw;

  const { data: existingAgent } = await supabaseAdmin
    .from("agents")
    .select("agent_id, phone_number")
    .eq("user_id", targetUserId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const updateExisting = Boolean(existingAgent?.phone_number);

  const plan = sub?.plan_type || null;
  console.info("[deployAgentForUser] calling provisionPhoneNumberOnly", {
    deployRequestId: reqId,
    userId: targetUserId,
    businessName,
    areaCode,
    plan,
    updateExisting: updateExisting || undefined,
  });
  const transferNumber =
    options.transferNumber != null
      ? String(options.transferNumber || "").trim().replace(/[^\d+]/g, "") || null
      : null;
  const industry = String(profile.industry || "hvac").toLowerCase();
  try {
    const result = await provisionPhoneNumberOnly({
      userId: targetUserId,
      businessName,
      areaCode,
      deployRequestId: reqId,
      transferNumber: transferNumber || undefined,
      updateExisting,
      industry,  // Pass industry so correct master template is used
    });
    await supabaseAdmin
      .from("profiles")
      .update({ deploy_error: null })
      .eq("user_id", targetUserId);
    return {
      ok: true,
      phone_number: result.phone_number,
      agent_id: result.agent_id,
    };
  } catch (err) {
    const msg = err.message || "";
    const isAreaCode =
      /area|area.?code|unavailable|not available|invalid/i.test(msg);
    const deployError = isAreaCode ? "AREA_CODE_UNAVAILABLE" : msg.slice(0, 200);
    await supabaseAdmin
      .from("profiles")
      .update({ deploy_error: deployError })
      .eq("user_id", targetUserId);
    const providerStatus = err.response?.status;
    const providerBody = err.response?.data;
    const providerUrl = err.config?.url || err.config?.baseURL;
    console.error("[deployAgentForUser] failed", {
      deployRequestId: reqId,
      userId: targetUserId,
      message: err.message,
      deployError,
      providerUrl,
      providerStatus,
      providerBody,
      responseHeaders: err.response?.headers ? JSON.stringify(err.response.headers) : undefined,
      isAreaCodeMapped: isAreaCode,
      stack: err.stack?.split("\n").slice(0, 20).join("\n"),
    });
    return {
      error: isAreaCode ? "AREA_CODE_UNAVAILABLE" : err.message,
    };
  }
};

app.post(
  "/admin/quick-onboard",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-quick-onboard", limit: 6, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { businessName, areaCode, email } = req.body || {};
      const cleanName = String(businessName || "").trim();
      const cleanArea = String(areaCode || "").trim();
      const cleanEmail = String(email || "").trim().toLowerCase();

      if (!cleanName || cleanName.length < 2 || cleanName.length > 80) {
        return res.status(400).json({ error: "businessName is invalid" });
      }
      if (!/^\d{3}$/.test(cleanArea)) {
        return res.status(400).json({ error: "areaCode must be 3 digits" });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ error: "email is invalid" });
      }

      let authUser = await findAuthUserByEmail(cleanEmail);
      if (!authUser) {
        const { data: userResult, error: userError } =
          await supabaseAdmin.auth.admin.createUser({
            email: cleanEmail,
            email_confirm: true,
          });
        if (userError || !userResult?.user) {
          return res.status(500).json({ error: userError?.message || "User create failed" });
        }
        authUser = userResult.user;
      }

      const userId = authUser.id;
      const { data: existingProfile } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();
      const resolvedRole =
        existingProfile?.role === "admin" ? "admin" : existingProfile?.role || "owner";

      await supabaseAdmin.from("profiles").upsert({
        user_id: userId,
        role: resolvedRole,
        business_name: cleanName,
        area_code: cleanArea,
        admin_onboarded: true,
        admin_onboarded_at: new Date().toISOString(),
      });

      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await supabaseAdmin.from("subscriptions").upsert({
        user_id: userId,
        status: "active",
        plan_type: "core",
        current_period_end: periodEnd,
      });
      await ensureUsageLimits({ userId, planType: "core", periodEnd });

      const { data: existingAgent } = await supabaseAdmin
        .from("agents")
        .select("agent_id, phone_number")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const agentInfo =
        existingAgent?.agent_id && existingAgent?.phone_number
          ? {
              agent_id: existingAgent.agent_id,
              phone_number: existingAgent.phone_number,
            }
          : await createAdminAgent({
              userId,
              businessName: cleanName,
              areaCode: cleanArea,
            });

      await auditLog({
        userId: req.user.id,
        actorId: req.user.id,
        action: "admin_quick_onboard",
        actionType: "admin_quick_onboard",
        entity: "user",
        entityId: userId,
        req,
        metadata: { plan_tier: "core" },
      });

      return res.json({ ok: true, user_id: userId, ...agentInfo });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

app.post(
  "/admin/impersonation/start",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-impersonation", limit: 30, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { user_id: impersonatedUserId } = req.body || {};
      if (!impersonatedUserId) {
        return res.status(400).json({ error: "user_id is required" });
      }
      await auditLog({
        userId: req.user.id,
        actorId: req.user.id,
        action: "impersonation_start",
        actionType: "impersonation_start",
        entity: "user",
        entityId: impersonatedUserId,
        req,
        metadata: { impersonated_user_id: impersonatedUserId },
      });
      console.info("[impersonation] start", {
        admin_id: req.user.id,
        impersonated_user_id: impersonatedUserId,
        timestamp: new Date().toISOString(),
      });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

app.post(
  "/admin/impersonation/end",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-impersonation", limit: 30, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { user_id: impersonatedUserId } = req.body || {};
      await auditLog({
        userId: req.user.id,
        actorId: req.user.id,
        action: "impersonation_end",
        actionType: "impersonation_end",
        entity: "user",
        entityId: impersonatedUserId || null,
        req,
        metadata: { impersonated_user_id: impersonatedUserId || null },
      });
      console.info("[impersonation] end", {
        admin_id: req.user.id,
        impersonated_user_id: impersonatedUserId || null,
        timestamp: new Date().toISOString(),
      });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

app.post(
  "/admin/create-account",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-create-account", limit: 10, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { email, password } = req.body || {};
      const cleanEmail = String(email || "").trim().toLowerCase();
      const cleanPassword = String(password || "");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ error: "email is invalid" });
      }
      if (!cleanPassword || cleanPassword.length < 8) {
        return res
          .status(400)
          .json({ error: "password must be at least 8 characters" });
      }

      const existingUser = await findAuthUserByEmail(cleanEmail);
      if (existingUser) {
        return res.status(409).json({ error: "User already exists" });
      }

      const { data: userResult, error: userError } =
        await supabaseAdmin.auth.admin.createUser({
          email: cleanEmail,
          password: cleanPassword,
          email_confirm: true,
        });
      if (userError || !userResult?.user) {
        return res.status(500).json({ error: userError?.message || "User create failed" });
      }

      const userId = userResult.user.id;
      await supabaseAdmin.from("profiles").upsert({
        user_id: userId,
        role: "owner",
      });

      await auditLog({
        userId: req.user.id,
        actorId: req.user.id,
        action: "admin_create_account",
        actionType: "admin_create_account",
        entity: "user",
        entityId: userId,
        req,
      });

      return res.json({ ok: true, user_id: userId });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

app.post(
  "/admin/onboarding/identity",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-onboard-identity", limit: 20, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { for_user_id, businessName, areaCode, industry } = req.body || {};
      const targetUserId = String(for_user_id ?? "").trim();
      const cleanName = String(businessName ?? "").trim();
      const cleanArea = String(areaCode ?? "").trim();
      const cleanIndustry = String(industry ?? "hvac").trim().toLowerCase();
      const allowedIndustry = ["hvac", "plumbing"].includes(cleanIndustry) ? cleanIndustry : "hvac";
      if (!targetUserId) {
        return res.status(400).json({ error: "for_user_id is required" });
      }
      if (!cleanName || cleanName.length < 2 || cleanName.length > 80) {
        return res.status(400).json({ error: "businessName is invalid" });
      }
      if (cleanArea && !/^\d{3}$/.test(cleanArea)) {
        return res.status(400).json({ error: "areaCode must be 3 digits" });
      }

      await supabaseAdmin.from("profiles").upsert({
        user_id: targetUserId,
        business_name: cleanName,
        area_code: cleanArea || null,
        industry: allowedIndustry,
        onboarding_step: 2,
      });

      await auditLog({
        userId: req.user.id,
        actorId: req.user.id,
        action: "admin_onboarding_identity",
        actionType: "admin_onboarding_identity",
        entity: "profile",
        entityId: targetUserId,
        req,
        metadata: { target_user_id: targetUserId },
      });

      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

app.post(
  "/admin/consent",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-consent", limit: 20, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { for_user_id } = req.body || {};
      const targetUserId = String(for_user_id ?? "").trim();
      if (!targetUserId) {
        return res.status(400).json({ error: "for_user_id is required" });
      }

      await supabaseAdmin.from("consent_logs").insert({
        user_id: targetUserId,
        version: currentConsentVersion,
        ip:
          req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
          req.socket?.remoteAddress ||
          null,
        user_agent: req.headers["user-agent"] || null,
      });

      await supabaseAdmin.from("profiles").upsert({
        user_id: targetUserId,
        consent_accepted_at: new Date().toISOString(),
        consent_version: currentConsentVersion,
      });

      await auditLog({
        userId: req.user.id,
        actorId: req.user.id,
        action: "admin_consent",
        actionType: "admin_consent",
        entity: "consent",
        entityId: targetUserId,
        req,
        metadata: { target_user_id: targetUserId, version: currentConsentVersion },
      });

      return res.json({ ok: true, version: currentConsentVersion });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

app.get(
  "/admin/user-by-email",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-user-by-email", limit: 30, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const rawEmail = String(req.query.email ?? "").trim().toLowerCase();
      if (!isValidEmailFormat(rawEmail)) {
        return res.status(400).json({ error: "Valid email is required" });
      }
      const user = await findAuthUserByEmail(rawEmail);
      if (!user || !user.id) {
        return res.status(404).json({ error: "USER_NOT_FOUND" });
      }
      return res.json({ user_id: user.id, email: user.email ?? rawEmail });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

app.post(
  "/admin/confirm-user-email",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-confirm-email", limit: 30, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const rawEmail = String(req.body?.email ?? "").trim().toLowerCase();
      if (!isValidEmailFormat(rawEmail)) {
        return res.status(400).json({ error: "Valid email is required" });
      }
      const user = await findAuthUserByEmail(rawEmail);
      if (!user || !user.id) {
        return res.status(404).json({ error: "USER_NOT_FOUND" });
      }
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        user.id,
        { email_confirm: true }
      );
      if (updateError) {
        return res.status(500).json({ error: updateError.message });
      }
      await auditLog({
        userId: req.user.id,
        actorId: req.user.id,
        action: "admin_confirm_user_email",
        actionType: "admin_confirm_user_email",
        entity: "user",
        entityId: user.id,
        req,
        metadata: { target_email: rawEmail },
      });
      return res.json({ ok: true, user_id: user.id });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

app.post(
  "/admin/stripe-link",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-stripe-link", limit: 10, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { email, planTier, embedded } = req.body || {};
      const rawTier = String(planTier ?? "").trim().toLowerCase();
      const rawEmail = String(email ?? "").trim();
      const useEmbeddedFlow = Boolean(embedded);

      if (!isValidEmailFormat(rawEmail)) {
        return res.status(400).json({
          error: "VALIDATION_ERROR",
          message: "email is required and must be a valid email address.",
        });
      }
      if (!PLAN_TIERS.includes(rawTier)) {
        return res.status(400).json({
          error: "VALIDATION_ERROR",
          message: "planTier must be one of: pro, elite, scale.",
        });
      }

      const user = await findAuthUserByEmail(rawEmail);
      if (!user || !user.id) {
        return res.status(404).json({ error: "USER_NOT_FOUND" });
      }

      await ensureUsageLimits({
        userId: user.id,
        planType: rawTier,
      });

      const config = PLAN_CONFIG[rawTier];
      if (!config || !config.priceId) {
        console.error("[admin/stripe-link] Missing Stripe price ID for tier", {
          tier: rawTier,
          email: rawEmail,
          userId: user.id,
        });
        return res.status(500).json({
          error: "CONFIG_ERROR",
          message: "Stripe price not configured for this tier.",
        });
      }

      const metadata = {
        user_id: String(user.id),
        email: String(user.email ?? rawEmail),
        planTier: rawTier,
        minutesCap: String(config.minutesCap),
        smsCap: String(config.smsCap),
      };

      const successUrl = useEmbeddedFlow
        ? `${FRONTEND_URL}/admin/stripe-success?user_id=${user.id}`
        : `${FRONTEND_URL}/login?checkout=success`;
      const cancelUrl = useEmbeddedFlow
        ? `${FRONTEND_URL}/thank-you?checkout=canceled`
        : `${FRONTEND_URL}/login?checkout=canceled`;

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: config.priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: user.id,
        metadata,
      });

      console.info("[admin/stripe-link] session created", {
        user_id: user.id,
        email: metadata.email,
        planTier: rawTier,
        priceId: config.priceId,
        sessionId: session.id,
        embedded: useEmbeddedFlow,
      });

      await auditLog({
        userId: req.user.id,
        actorId: req.user.id,
        action: "admin_stripe_link_created",
        actionType: "admin_stripe_link_created",
        entity: "stripe_session",
        entityId: session.id,
        req,
        metadata: {
          target_user_id: user.id,
          email: metadata.email,
          planTier: rawTier,
          priceId: config.priceId,
          sessionId: session.id,
          embedded: useEmbeddedFlow,
        },
      });

      return res.json({ url: session.url ?? null });
    } catch (err) {
      console.error("[admin/stripe-link] error", {
        message: err.message,
        name: err.name,
      });
      const message = err.message || "Internal server error";
      return res.status(500).json({
        error: "INTERNAL_ERROR",
        message,
      });
    }
  }
);

app.get(
  "/admin/subscription-status",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-sub-status", limit: 60, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const rawUserId = String(req.query.user_id ?? "").trim();
      if (!rawUserId) {
        return res.status(400).json({ error: "user_id is required" });
      }
      const { data, error } = await supabaseAdmin
        .from("subscriptions")
        .select("status, plan_type, current_period_end")
        .eq("user_id", rawUserId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) {
        return res.status(500).json({ error: error.message });
      }
      const row = data?.[0] || null;
      const status = row?.status || "none";
      const periodEnd = row?.current_period_end || null;
      const isActive = ["active", "trialing"].includes(
        String(status || "").toLowerCase()
      );
      const periodOk = periodEnd
        ? new Date(periodEnd).getTime() > Date.now()
        : false;
      return res.json({
        status,
        plan_type: row?.plan_type || null,
        current_period_end: periodEnd,
        is_active: isActive && periodOk,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

app.get(
  "/admin/deploy-status",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-deploy-status", limit: 60, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const rawUserId = String(req.query.user_id ?? "").trim();
      if (!rawUserId) {
        return res.status(400).json({ error: "user_id is required" });
      }
      const [profileRes, agentRes, subRes] = await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("business_name, area_code, deploy_error")
          .eq("user_id", rawUserId)
          .maybeSingle(),
        supabaseAdmin
          .from("agents")
          .select("agent_id, phone_number")
          .eq("user_id", rawUserId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabaseAdmin
          .from("subscriptions")
          .select("plan_type, status")
          .eq("user_id", rawUserId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const profile = profileRes.data;
      const agent = agentRes.data;
      const sub = subRes.data;
      const has_agent =
        Boolean(agent?.agent_id) && Boolean(agent?.phone_number);
      return res.json({
        has_agent: !!has_agent,
        phone_number: agent?.phone_number || null,
        agent_id: agent?.agent_id || null,
        deploy_error: profile?.deploy_error || null,
        business_name: profile?.business_name || null,
        area_code: profile?.area_code || null,
        plan_type: sub?.plan_type || null,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

app.post(
  "/admin/deploy-agent",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-deploy-agent", limit: 10, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { for_user_id } = req.body || {};
      const targetUserId = String(for_user_id ?? "").trim();
      if (!targetUserId) {
        return res.status(400).json({ error: "for_user_id is required" });
      }

      const result = await deployAgentForUser(targetUserId);
      if (result.error) {
        const status =
          result.error === "AREA_CODE_UNAVAILABLE" ? 400 : 500;
        return res.status(status).json({ error: result.error });
      }

      await auditLog({
        userId: req.user.id,
        actorId: req.user.id,
        action: "admin_deploy_agent",
        actionType: "admin_deploy_agent",
        entity: "agent",
        entityId: result.agent_id,
        req,
        metadata: {
          target_user_id: targetUserId,
          existing: result.existing || false,
        },
      });

      return res.json({
        ok: true,
        phone_number: result.phone_number,
        agent_id: result.agent_id,
        existing: result.existing || false,
      });
    } catch (err) {
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

// GRANDMASTER ADMIN - Enhanced metrics for full platform visibility
app.get(
  "/admin/metrics-enhanced",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).toISOString();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      
      // Parallel queries for maximum efficiency
      const [
        // Total counts
        totalUsersResult,
        totalLeadsResult,
        totalAppointmentsResult,
        totalAgentsResult,
        
        // Today's activity
        todayLeadsResult,
        todayAppointmentsResult,
        todayUsersResult,
        
        // This week
        weekLeadsResult,
        weekAppointmentsResult,
        
        // Subscriptions
        activeSubsResult,
        trialingSubsResult,
        pastDueSubsResult,
        cancelledSubsResult,
        
        // Recent leads for activity feed
        recentLeadsResult,
        
        // Recent appointments
        recentAppointmentsResult,
        
        // Usage stats
        usageStatsResult,
        
        // Agents by industry
        hvacAgentsResult,
        plumbingAgentsResult,
        
        // Flagged for review
        flaggedLeadsResult,
      ] = await Promise.all([
        // Total counts
        supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("leads").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("appointments").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("agents").select("id", { count: "exact", head: true }),
        
        // Today's activity
        supabaseAdmin.from("leads").select("id", { count: "exact", head: true }).gte("created_at", todayStart),
        supabaseAdmin.from("appointments").select("id", { count: "exact", head: true }).gte("created_at", todayStart),
        supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", todayStart),
        
        // This week
        supabaseAdmin.from("leads").select("id", { count: "exact", head: true }).gte("created_at", weekStart),
        supabaseAdmin.from("appointments").select("id", { count: "exact", head: true }).gte("created_at", weekStart),
        
        // Subscriptions
        supabaseAdmin.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabaseAdmin.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "trialing"),
        supabaseAdmin.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "past_due"),
        supabaseAdmin.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "canceled"),
        
        // Recent leads (last 20)
        supabaseAdmin
          .from("leads")
          .select("id, name, phone, status, sentiment, summary, created_at, user_id")
          .order("created_at", { ascending: false })
          .limit(20),
        
        // Recent appointments (last 10)
        supabaseAdmin
          .from("appointments")
          .select("id, customer_name, start_time, status, user_id")
          .order("created_at", { ascending: false })
          .limit(10),
        
        // Total usage across platform
        supabaseAdmin
          .from("usage_limits")
          .select("call_used_seconds, call_limit_seconds"),
        
        // Agents by industry
        supabaseAdmin.from("agents").select("id", { count: "exact", head: true }).eq("industry", "hvac"),
        supabaseAdmin.from("agents").select("id", { count: "exact", head: true }).eq("industry", "plumbing"),
        
        // Flagged leads
        supabaseAdmin.from("leads").select("id", { count: "exact", head: true }).eq("flagged_for_review", true),
      ]);
      
      // Calculate total minutes used across platform
      const usageData = usageStatsResult.data || [];
      const totalMinutesUsed = Math.floor(usageData.reduce((sum, u) => sum + (u.call_used_seconds || 0), 0) / 60);
      const totalMinutesAllocated = Math.floor(usageData.reduce((sum, u) => sum + (u.call_limit_seconds || 0), 0) / 60);
      
      // Calculate booking rate
      const bookedLeads = (recentLeadsResult.data || []).filter(l => 
        l.status?.toLowerCase().includes("book") || l.status?.toLowerCase().includes("confirm")
      ).length;
      const totalRecentLeads = (recentLeadsResult.data || []).length;
      const bookingRate = totalRecentLeads > 0 ? Math.round((bookedLeads / totalRecentLeads) * 100) : 0;
      
      // Format recent activity feed
      const activityFeed = (recentLeadsResult.data || []).slice(0, 10).map(lead => ({
        id: lead.id,
        type: "lead",
        name: lead.name || "Unknown",
        status: lead.status || "New",
        sentiment: lead.sentiment || "neutral",
        summary: lead.summary || "New lead captured",
        time: lead.created_at,
        user_id: lead.user_id,
      }));
      
      // Add appointments to activity feed
      (recentAppointmentsResult.data || []).forEach(appt => {
        activityFeed.push({
          id: appt.id,
          type: "appointment",
          name: appt.customer_name || "Unknown",
          status: appt.status || "booked",
          summary: `Appointment: ${appt.customer_name}`,
          time: appt.start_time,
          user_id: appt.user_id,
        });
      });
      
      // Sort by time
      activityFeed.sort((a, b) => new Date(b.time) - new Date(a.time));
      
      // System health check
      const systemHealth = {
        api: "operational",
        database: "operational",
        webhooks: lastRetellWebhookAt ? "operational" : "unknown",
        last_webhook: lastRetellWebhookAt || null,
      };
      
      return res.json({
        timestamp: now.toISOString(),
        
        // Platform totals
        totals: {
          users: totalUsersResult.count || 0,
          leads: totalLeadsResult.count || 0,
          appointments: totalAppointmentsResult.count || 0,
          agents: totalAgentsResult.count || 0,
          flagged_for_review: flaggedLeadsResult.count || 0,
        },
        
        // Today's activity
        today: {
          leads: todayLeadsResult.count || 0,
          appointments: todayAppointmentsResult.count || 0,
          new_users: todayUsersResult.count || 0,
        },
        
        // This week
        this_week: {
          leads: weekLeadsResult.count || 0,
          appointments: weekAppointmentsResult.count || 0,
        },
        
        // Subscriptions breakdown
        subscriptions: {
          active: activeSubsResult.count || 0,
          trialing: trialingSubsResult.count || 0,
          past_due: pastDueSubsResult.count || 0,
          cancelled: cancelledSubsResult.count || 0,
        },
        
        // Platform usage
        usage: {
          total_minutes_used: totalMinutesUsed,
          total_minutes_allocated: totalMinutesAllocated,
          utilization_percent: totalMinutesAllocated > 0 
            ? Math.round((totalMinutesUsed / totalMinutesAllocated) * 100) 
            : 0,
        },
        
        // Performance metrics
        performance: {
          booking_rate: bookingRate,
          agents_hvac: hvacAgentsResult.count || 0,
          agents_plumbing: plumbingAgentsResult.count || 0,
        },
        
        // Real-time activity feed
        activity_feed: activityFeed.slice(0, 15),
        
        // System health
        system_health: systemHealth,
      });
    } catch (err) {
      console.error("[admin/metrics-enhanced] error:", err.message);
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
        .select("user_id, business_name, role, area_code, cal_com_url")
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
        const { remaining } = getUsageRemaining({
          call_cap_seconds: usage.call_cap_seconds || 0,
          call_credit_seconds: usage.call_credit_seconds || 0,
          rollover_seconds: usage.rollover_seconds || 0,
          call_used_seconds: usedSeconds,
        });
        const usagePercent =
          totalSeconds > 0
            ? Math.min(100, Math.round((usedSeconds / totalSeconds) * 100))
            : 0;
        const subscriptionStatus = String(subscription.status || "none").toLowerCase();
        const isPaid = ["active", "trialing"].includes(subscriptionStatus);
        const isPaymentFailed = ["past_due", "unpaid", "canceled"].includes(
          subscriptionStatus
        );
        const hasIdentity =
          Boolean(profile.business_name) && Boolean(profile.area_code);
        const hasCalcom = Boolean(profile.cal_com_url);
        const remainingMinutes = Math.floor(remaining / 60);
        let fleetStatus = "Pending Setup";
        if (isPaymentFailed) {
          fleetStatus = "Payment Failed";
        } else if (isPaid && hasCalcom && remainingMinutes < 60) {
          fleetStatus = "Low Minutes";
        } else if (isPaid && hasCalcom && remainingMinutes > 0) {
          fleetStatus = "Live";
        } else if (isPaid && (!hasIdentity || !hasCalcom)) {
          fleetStatus = "Pending Setup";
        }

        return {
          id: user.id,
          business_name: profile.business_name || "Unassigned",
          email: user.email || "--",
          role: profile.role || "user",
          plan_type: subscription.plan_type || null,
          subscription_status: subscriptionStatus,
          fleet_status: fleetStatus,
          usage_percent: usagePercent,
          usage_minutes: Math.floor(usedSeconds / 60),
          usage_limit_minutes: Math.floor(totalSeconds / 60),
          usage_minutes_remaining: remainingMinutes,
          area_code: profile.area_code || null,
          cal_com_url: profile.cal_com_url || null,
          created_at: user.created_at || null,
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
        .select("user_id, business_name, role, full_name, area_code, cal_com_url")
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
          "call_used_seconds, call_cap_seconds, call_credit_seconds, rollover_seconds, sms_used, sms_cap, sms_credit"
        )
        .eq("user_id", userId)
        .maybeSingle();
      const { data: agent } = await supabaseAdmin
        .from("agents")
        .select("agent_id, phone_number, llm_id, transfer_number, created_at")
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
      const { remaining } = getUsageRemaining({
        call_cap_seconds: usage?.call_cap_seconds || 0,
        call_credit_seconds: usage?.call_credit_seconds || 0,
        rollover_seconds: usage?.rollover_seconds || 0,
        call_used_seconds: usedSeconds,
      });
      const smsRemaining = Math.max(
        0,
        (usage?.sms_cap || 0) + (usage?.sms_credit || 0) - (usage?.sms_used || 0)
      );
      const subscriptionStatus = String(subscription?.status || "none").toLowerCase();
      const isPaid = ["active", "trialing"].includes(subscriptionStatus);
      const isPaymentFailed = ["past_due", "unpaid", "canceled"].includes(
        subscriptionStatus
      );
      const hasIdentity =
        Boolean(profile?.business_name) && Boolean(profile?.area_code);
      const hasCalcom = Boolean(profile?.cal_com_url);
      const remainingMinutes = Math.floor(remaining / 60);
      let fleetStatus = "Pending Setup";
      if (isPaymentFailed) {
        fleetStatus = "Payment Failed";
      } else if (isPaid && hasCalcom && remainingMinutes < 60) {
        fleetStatus = "Low Minutes";
      } else if (isPaid && hasCalcom && remainingMinutes > 0) {
        fleetStatus = "Live";
      } else if (isPaid && (!hasIdentity || !hasCalcom)) {
        fleetStatus = "Pending Setup";
      }
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
          area_code: profile?.area_code || null,
          cal_com_url: profile?.cal_com_url || null,
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
          fleet_status: fleetStatus,
          usage_minutes: Math.floor(usedSeconds / 60),
          usage_limit_minutes: Math.floor(totalSeconds / 60),
          usage_minutes_remaining: Math.floor(remaining / 60),
          sms_remaining: smsRemaining,
          sms_total: usage?.sms_cap || 0,
        },
        billing,
        config: {
          agent_id: agent?.agent_id || null,
          phone_number: agent?.phone_number || null,
          transfer_number: agent?.transfer_number || null,
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
  resolveEffectiveUser,
  rateLimit({ keyPrefix: "usage-status", limit: 30, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const uid = req.effectiveUserId ?? req.user.id;
      const { data: subscription } = await supabaseAdmin
        .from("subscriptions")
        .select("plan_type, current_period_end")
        .eq("user_id", uid)
        .maybeSingle();
      let usage = await ensureUsageLimits({
        userId: uid,
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