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
  MASTER_SMS_NUMBER,
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
  // Add common Vercel domains
  "https://kryonex-wizard.vercel.app",
  "https://kryonex.vercel.app",
].filter(Boolean);

// Vercel deployment URL patterns (dynamic preview URLs)
const vercelPatterns = [
  /^https:\/\/kryonex.*\.vercel\.app$/,
  /^https:\/\/.*kryonex.*\.vercel\.app$/,
  /^https:\/\/.*-kryonex-technologies-llc.*\.vercel\.app$/,
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // Allow any Vercel deployment URL for this project
      if (vercelPatterns.some(pattern => pattern.test(origin))) {
        return callback(null, true);
      }
      console.warn(`[CORS] Blocked origin: ${origin}`);
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

// Latency tracking middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", async () => {
    const duration = Date.now() - start;
    const isSlow = duration > 2000; // 2 seconds threshold
    
    // Log slow requests to console
    if (isSlow) {
      console.warn(`[SLOW] ${req.method} ${req.path} took ${duration}ms`);
    }
    
    // Store latency for significant endpoints (skip static assets)
    const shouldTrack = !req.path.startsWith("/assets") && 
                        !req.path.startsWith("/static") && 
                        !req.path.endsWith(".js") && 
                        !req.path.endsWith(".css") &&
                        !req.path.endsWith(".ico");
    
    if (shouldTrack && (isSlow || Math.random() < 0.01)) { // Log all slow + 1% sample
      try {
        await supabaseAdmin.from("latency_logs").insert({
          endpoint: req.path,
          method: req.method,
          duration_ms: duration,
          status_code: res.statusCode,
          user_id: req.user?.id || null,
          request_id: req.requestId,
          is_slow: isSlow,
        });
      } catch (err) {
        // Silent fail - don't break request for latency logging
      }
    }
  });
  next();
});

app.use(morgan("combined"));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

const allowlist = ADMIN_IP_ALLOWLIST
  ? ADMIN_IP_ALLOWLIST.split(",").map((ip) => ip.trim()).filter(Boolean)
  : [];

const generateToken = (size = 16) => crypto.randomBytes(size).toString("hex");
const pad2 = (value) => String(value).padStart(2, "0");
const formatDate = (date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const formatTime = (date) => `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

const formatPrimaryService = (industry) => {
  const value = String(industry || "").trim();
  const normalized = value.toLowerCase();
  if (normalized === "hvac") return "HVAC";
  if (normalized === "plumbing") return "Plumbing";
  return value;
};

/**
 * Generates current date/time variables for AI agent context.
 * This ensures the agent knows the current date/time for booking appointments.
 * @param {string} [timezone] - Optional timezone (defaults to America/New_York)
 * @returns {Object} - Date/time variables for Retell dynamic_variables
 */
const getCurrentDateTimeVars = (timezone = "America/New_York") => {
  const now = new Date();
  // Format in the target timezone
  const options = { timeZone: timezone };
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    ...options,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    ...options,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
    ...options,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  
  // Get day of week
  const dayOfWeek = new Intl.DateTimeFormat("en-US", {
    ...options,
    weekday: "long",
  }).format(now);
  
  // Get month name
  const monthName = new Intl.DateTimeFormat("en-US", {
    ...options,
    month: "long",
  }).format(now);
  
  // Get year
  const year = new Intl.DateTimeFormat("en-US", {
    ...options,
    year: "numeric",
  }).format(now);

  // Build a comprehensive date context for the AI
  const fullDate = dateFormatter.format(now);
  const fullTime = timeFormatter.format(now);
  const dateContext = `IMPORTANT: Today is ${fullDate}. The current time is ${fullTime} (${timezone}). When scheduling appointments, use this as the reference date. Do not schedule appointments for past dates or incorrect months.`;

  return {
    current_date: fullDate, // "Friday, February 6, 2026"
    current_time: fullTime, // "3:45 PM"
    current_date_short: shortDateFormatter.format(now), // "02/06/2026"
    current_day: dayOfWeek, // "Friday"
    current_month: monthName, // "February"
    current_year: year, // "2026"
    timezone: timezone,
    date_context: dateContext, // Full instruction for AI
  };
};

/**
 * Calculate fraud score for a referral.
 * Score determines commission processing:
 * - 0-20: Auto-approve
 * - 21-40: Normal processing (30-day hold)
 * - 41-60: Extended 45-day hold
 * - 61-80: Manual review required
 * - 81+: Auto-reject
 * 
 * @param {Object} referral - The referral record
 * @param {Object} referrerProfile - The referrer's profile
 * @param {Object} referredProfile - The referred user's profile
 * @param {Object} [options] - Additional options
 * @returns {Promise<{score: number, reasons: string[]}>}
 */
const calculateFraudScore = async (referral, referrerProfile, referredProfile, options = {}) => {
  let score = 0;
  const reasons = [];

  try {
    // 1. Check same IP (10 points)
    if (referral.signup_ip && referrerProfile?.signup_ip) {
      if (referral.signup_ip === referrerProfile.signup_ip) {
        score += 10;
        reasons.push("Same IP address as affiliate");
      }
    }

    // 2. Check same email domain (15 points) - skip common domains
    if (referrerProfile?.user_id && referredProfile?.user_id) {
      const { data: referrerUser } = await supabaseAdmin.auth.admin.getUserById(referrerProfile.user_id);
      const { data: referredUser } = await supabaseAdmin.auth.admin.getUserById(referredProfile.user_id);
      
      const referrerEmail = referrerUser?.user?.email || "";
      const referredEmail = referredUser?.user?.email || "";
      
      const getDomain = (email) => email.split("@")[1]?.toLowerCase() || "";
      const commonDomains = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "aol.com"];
      
      const referrerDomain = getDomain(referrerEmail);
      const referredDomain = getDomain(referredEmail);
      
      if (referrerDomain && referredDomain && 
          referrerDomain === referredDomain && 
          !commonDomains.includes(referrerDomain)) {
        score += 15;
        reasons.push(`Same email domain: ${referrerDomain}`);
      }
    }

    // 3. Check rapid cancellation (20 points) - cancelled within 7 days
    if (referral.status === "cancelled") {
      const signupDate = new Date(referral.signup_at || referral.created_at);
      const daysSinceSignup = (Date.now() - signupDate.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceSignup < 7) {
        score += 20;
        reasons.push("Cancelled within 7 days of signup");
      }
    }

    // 4. Check refund status (25 points)
    if (referral.status === "clawed_back" || referral.status === "refunded") {
      score += 25;
      reasons.push("Refund or clawback occurred");
    }

    // 5. Check for existing fraud flags (variable)
    if (referral.fraud_flags && referral.fraud_flags.length > 0) {
      for (const flag of referral.fraud_flags) {
        if (flag.type === "self_referral") {
          score += 30;
          reasons.push("Self-referral detected");
        } else if (flag.type === "same_payment_method") {
          score += 25;
          reasons.push("Same payment method as affiliate");
        } else if (flag.type === "same_device") {
          score += 15;
          reasons.push("Same device fingerprint");
        }
      }
    }

    // 6. Check multiple referrals same day (15 points)
    const { data: sameDayReferrals } = await supabaseAdmin
      .from("referrals")
      .select("id")
      .eq("referrer_id", referral.referrer_id)
      .gte("signup_at", new Date(new Date(referral.signup_at).setHours(0, 0, 0, 0)).toISOString())
      .lte("signup_at", new Date(new Date(referral.signup_at).setHours(23, 59, 59, 999)).toISOString())
      .neq("id", referral.id);
    
    if (sameDayReferrals && sameDayReferrals.length >= 3) {
      score += 15;
      reasons.push(`Multiple referrals same day (${sameDayReferrals.length + 1} total)`);
    }

    // 7. Check for no activity after 14 days (10 points)
    if (referredProfile) {
      const signupDate = new Date(referral.signup_at || referral.created_at);
      const daysSinceSignup = (Date.now() - signupDate.getTime()) / (1000 * 60 * 60 * 24);
      
      // Check if user has created an agent (indicator of activity)
      if (daysSinceSignup > 14) {
        const { data: agents } = await supabaseAdmin
          .from("agents")
          .select("id")
          .eq("user_id", referredProfile.user_id)
          .limit(1);
        
        if (!agents || agents.length === 0) {
          score += 10;
          reasons.push("No activity after 14 days");
        }
      }
    }

    // Update the referral with the calculated score
    await supabaseAdmin
      .from("referrals")
      .update({ 
        fraud_score: score,
        updated_at: new Date().toISOString(),
      })
      .eq("id", referral.id);

    console.info("[fraud-score] Calculated", {
      referral_id: referral.id,
      score,
      reasons,
    });

  } catch (err) {
    console.error("[fraud-score] Error calculating score:", err.message);
  }

  return { score, reasons };
};

/**
 * Get fraud score thresholds from settings or use defaults
 */
const getFraudThresholds = async () => {
  const { data: settings } = await supabaseAdmin
    .from("referral_settings")
    .select("fraud_auto_approve_max, fraud_extended_hold_min, fraud_manual_review_min, fraud_auto_reject_min, extended_hold_days")
    .eq("id", 1)
    .maybeSingle();
  
  return {
    autoApproveMax: settings?.fraud_auto_approve_max ?? 20,
    extendedHoldMin: settings?.fraud_extended_hold_min ?? 41,
    manualReviewMin: settings?.fraud_manual_review_min ?? 61,
    autoRejectMin: settings?.fraud_auto_reject_min ?? 81,
    extendedHoldDays: settings?.extended_hold_days ?? 45,
  };
};

/**
 * Builds a human-readable schedule summary from wizard inputs.
 * Used in AI prompts so the agent knows business hours.
 * @param {Object} params - Schedule parameters
 * @returns {string} - e.g., "Monday-Friday 8am-5pm, Saturday 9am-2pm, Sunday Closed (24/7 emergency dispatch available)"
 */
const buildScheduleSummary = ({
  weekdayOpen = "08:00 AM",
  weekdayClose = "05:00 PM",
  weekendEnabled = false,
  saturdayOpen = "09:00 AM",
  saturdayClose = "02:00 PM",
  emergency247 = false,
}) => {
  // Helper to convert "08:00 AM" or "08:00" to "8am"
  const formatTimeShort = (timeStr) => {
    const clean = String(timeStr || "").trim();
    // Try to parse "08:00 AM" format
    const match12 = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
    if (match12) {
      let hour = parseInt(match12[1], 10);
      const mins = match12[2];
      const period = (match12[3] || "").toUpperCase();
      
      // If period is specified, use it
      if (period === "PM" && hour < 12) hour += 12;
      if (period === "AM" && hour === 12) hour = 0;
      
      const ampm = hour >= 12 ? "pm" : "am";
      const h12 = hour % 12 || 12;
      return mins === "00" ? `${h12}${ampm}` : `${h12}:${mins}${ampm}`;
    }
    // Fallback - return as-is
    return clean || "9am";
  };

  let summary = `Monday-Friday ${formatTimeShort(weekdayOpen)}-${formatTimeShort(weekdayClose)}`;

  if (weekendEnabled) {
    summary += `, Saturday ${formatTimeShort(saturdayOpen)}-${formatTimeShort(saturdayClose)}`;
  }

  summary += ", Sunday Closed";

  if (emergency247) {
    summary += " (24/7 emergency dispatch available)";
  }

  return summary;
};

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
// CENTRALIZED ERROR TRACKING
// =============================================================================

/**
 * Track errors in the error_logs table for observability
 */
const trackError = async ({ error, context, userId, severity, requestId, endpoint, method, req }) => {
  try {
    await supabaseAdmin.from("error_logs").insert({
      error_type: error?.name || "Error",
      error_message: error?.message || String(error),
      stack_trace: error?.stack?.substring(0, 5000) || null,
      context: context || {},
      user_id: userId || null,
      severity: severity || "medium",
      request_id: requestId || null,
      endpoint: endpoint || null,
      method: method || null,
      ip_address: req?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() || req?.socket?.remoteAddress || null,
      user_agent: req?.headers?.["user-agent"] || null,
    });
  } catch (err) {
    console.error("[trackError] Failed to log error:", err.message);
  }
};

// Sensitive actions that require extra logging
const SENSITIVE_ACTIONS = [
  "password_change", "email_change", "phone_change",
  "api_key_created", "webhook_created", "admin_impersonation",
  "payout_approved", "subscription_cancelled", "data_export",
  "user_deleted", "role_changed", "impersonation_started"
];

// =============================================================================
// OPS ALERTING SYSTEM
// =============================================================================

/**
 * Create operational alert for system issues
 */
const createOpsAlert = async ({ alertType, severity, title, message, metadata, source }) => {
  try {
    await supabaseAdmin.from("ops_alerts").insert({
      alert_type: alertType,
      severity: severity || "warning",
      title,
      message,
      metadata: metadata || {},
      source: source || "system",
    });
    
    // Send email for critical alerts
    if (severity === "critical" && resend && ADMIN_EMAIL) {
      try {
        await resend.emails.send({
          from: "Kryonex Ops <ops@kryonex.com>",
          to: ADMIN_EMAIL,
          subject: `🚨 CRITICAL: ${title}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #dc2626;">Critical Alert</h2>
              <p><strong>Type:</strong> ${alertType}</p>
              <p><strong>Message:</strong> ${message}</p>
              <p><strong>Source:</strong> ${source || "system"}</p>
              <p><strong>Time:</strong> ${new Date().toISOString()}</p>
              ${metadata ? `<pre style="background: #f3f4f6; padding: 1rem; border-radius: 8px;">${JSON.stringify(metadata, null, 2)}</pre>` : ""}
              <p style="color: #6b7280; font-size: 12px;">This is an automated alert from Kryonex Platform.</p>
            </div>
          `,
        });
        console.log("[ops-alert] Critical alert email sent:", title);
      } catch (emailErr) {
        console.error("[ops-alert] Failed to send alert email:", emailErr.message);
      }
    }
    
    console.log(`[ops-alert] ${severity.toUpperCase()}: ${title}`);
  } catch (err) {
    console.error("[createOpsAlert] error:", err.message);
  }
};

/**
 * Check webhook health and create alert if failure rate is high
 */
const checkWebhookHealth = async () => {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    const { data: deliveries } = await supabaseAdmin
      .from("webhook_deliveries")
      .select("delivery_status")
      .gte("created_at", oneHourAgo);
    
    if (!deliveries || deliveries.length < 10) return; // Not enough data
    
    const failed = deliveries.filter(d => d.delivery_status === "failed" || d.delivery_status === "exhausted").length;
    const failureRate = (failed / deliveries.length) * 100;
    
    if (failureRate > 50) {
      await createOpsAlert({
        alertType: "webhook_failure_rate",
        severity: "critical",
        title: "High Webhook Failure Rate",
        message: `${failureRate.toFixed(1)}% of webhooks failed in the last hour (${failed}/${deliveries.length})`,
        metadata: { failure_rate: failureRate, failed_count: failed, total_count: deliveries.length },
        source: "webhook",
      });
    }
  } catch (err) {
    console.error("[checkWebhookHealth] error:", err.message);
  }
};

// Run webhook health check every 15 minutes (with distributed locking)
setInterval(async () => {
  const gotLock = await acquireDistributedLock("webhook-health-check", 120);
  if (!gotLock) return;
  try {
    await checkWebhookHealth();
  } finally {
    await releaseDistributedLock("webhook-health-check");
  }
}, 15 * 60 * 1000);

// =============================================================================
// CUSTOMER HEALTH SCORING SYSTEM
// =============================================================================

/**
 * Calculate customer health score based on multiple factors
 * Score: 0-100, Grade: A-F, Churn Risk: low/medium/high/critical
 */
const calculateHealthScore = async (userId) => {
  try {
    // Get user data
    const [
      { data: profile },
      { data: subscription },
      { data: usage },
      { data: agents },
      { data: recentLeads },
      { data: lastAudit },
      { data: webhooks },
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabaseAdmin.from("subscriptions").select("*").eq("user_id", userId).maybeSingle(),
      supabaseAdmin.from("usage_limits").select("*").eq("user_id", userId).maybeSingle(),
      supabaseAdmin.from("agents").select("id, created_at").eq("user_id", userId),
      supabaseAdmin.from("leads").select("id, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
      supabaseAdmin.from("audit_logs").select("created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1),
      supabaseAdmin.from("webhook_configs").select("id").eq("user_id", userId).eq("is_active", true),
    ]);
    
    const factors = {};
    
    // 1. USAGE SCORE (0-25 points)
    let usageScore = 0;
    if (usage) {
      const usedMinutes = Math.ceil((usage.call_used_seconds || 0) / 60);
      const capMinutes = Math.ceil((usage.call_cap_seconds || 0) / 60);
      const usagePercent = capMinutes > 0 ? (usedMinutes / capMinutes) * 100 : 0;
      
      // Ideal usage is 50-80%
      if (usagePercent >= 50 && usagePercent <= 80) {
        usageScore = 25;
      } else if (usagePercent >= 30 && usagePercent < 50) {
        usageScore = 20;
      } else if (usagePercent >= 10 && usagePercent < 30) {
        usageScore = 15;
      } else if (usagePercent > 80) {
        usageScore = 22; // High usage is good but might churn if capped
      } else {
        usageScore = 5; // Very low usage is a churn risk
      }
      factors.usage_percent = usagePercent;
    }
    factors.usage_score = usageScore;
    
    // 2. ENGAGEMENT SCORE (0-25 points)
    let engagementScore = 0;
    const now = new Date();
    
    // Last login/activity
    const lastActivityDate = lastAudit?.[0]?.created_at ? new Date(lastAudit[0].created_at) : null;
    if (lastActivityDate) {
      const daysSinceActivity = (now - lastActivityDate) / (1000 * 60 * 60 * 24);
      if (daysSinceActivity <= 1) engagementScore += 15;
      else if (daysSinceActivity <= 3) engagementScore += 12;
      else if (daysSinceActivity <= 7) engagementScore += 8;
      else if (daysSinceActivity <= 14) engagementScore += 4;
      else engagementScore += 0;
      factors.days_since_activity = Math.floor(daysSinceActivity);
    }
    
    // Recent leads (activity indicator)
    const leadsLast7Days = (recentLeads || []).filter(l => {
      const leadDate = new Date(l.created_at);
      return (now - leadDate) / (1000 * 60 * 60 * 24) <= 7;
    }).length;
    if (leadsLast7Days >= 10) engagementScore += 10;
    else if (leadsLast7Days >= 5) engagementScore += 7;
    else if (leadsLast7Days >= 1) engagementScore += 4;
    factors.leads_last_7_days = leadsLast7Days;
    factors.engagement_score = engagementScore;
    
    // 3. FEATURE ADOPTION SCORE (0-25 points)
    let featureAdoptionScore = 0;
    
    // Has active agent
    if (agents && agents.length > 0) featureAdoptionScore += 10;
    
    // Has webhooks/integrations
    if (webhooks && webhooks.length > 0) featureAdoptionScore += 5;
    
    // Has calendar connected (check profile)
    if (profile?.cal_api_key || profile?.cal_event_type_id) featureAdoptionScore += 5;
    
    // Has SMS enabled (check usage)
    if (usage?.sms_cap > 0) featureAdoptionScore += 3;
    
    // Has personal phone for notifications
    if (profile?.user_personal_phone) featureAdoptionScore += 2;
    
    factors.has_agent = !!(agents && agents.length > 0);
    factors.has_webhooks = !!(webhooks && webhooks.length > 0);
    factors.has_calendar = !!(profile?.cal_api_key);
    factors.feature_adoption_score = featureAdoptionScore;
    
    // 4. PAYMENT SCORE (0-25 points)
    let paymentScore = 0;
    if (subscription) {
      const status = subscription.status;
      if (status === "active") paymentScore = 25;
      else if (status === "trialing") paymentScore = 20;
      else if (status === "past_due") paymentScore = 5;
      else if (status === "canceled" || status === "cancelled") paymentScore = 0;
      else paymentScore = 15;
      factors.subscription_status = status;
    } else {
      paymentScore = 10; // No subscription data
    }
    factors.payment_score = paymentScore;
    
    // TOTAL SCORE
    const totalScore = usageScore + engagementScore + featureAdoptionScore + paymentScore;
    
    // Calculate grade
    let grade;
    if (totalScore >= 90) grade = "A";
    else if (totalScore >= 80) grade = "B";
    else if (totalScore >= 70) grade = "C";
    else if (totalScore >= 60) grade = "D";
    else grade = "F";
    
    // Calculate churn risk
    let churnRisk;
    if (totalScore >= 80) churnRisk = "low";
    else if (totalScore >= 60) churnRisk = "medium";
    else if (totalScore >= 40) churnRisk = "high";
    else churnRisk = "critical";
    
    // Upsert health score
    const healthData = {
      user_id: userId,
      score: totalScore,
      grade,
      usage_score: usageScore,
      engagement_score: engagementScore,
      feature_adoption_score: featureAdoptionScore,
      payment_score: paymentScore,
      churn_risk: churnRisk,
      factors,
      last_activity_at: lastActivityDate?.toISOString() || null,
      calculated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    await supabaseAdmin
      .from("customer_health_scores")
      .upsert(healthData, { onConflict: "user_id" });
    
    // Store history
    await supabaseAdmin.from("customer_health_history").insert({
      user_id: userId,
      score: totalScore,
      grade,
      churn_risk: churnRisk,
      factors,
    });
    
    // Get previous score for churn evaluation
    const { data: previousHistory } = await supabaseAdmin
      .from("customer_health_history")
      .select("score")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(1, 1); // Second most recent (skip current)
    
    const previousScore = previousHistory?.[0]?.score || null;
    
    // Evaluate churn risk and trigger alerts if needed
    await evaluateChurnRisk(userId, totalScore, previousScore);
    
    return healthData;
  } catch (err) {
    console.error("[calculateHealthScore] error:", err.message);
    return null;
  }
};

/**
 * Recalculate health scores for all active users
 */
const recalculateAllHealthScores = async () => {
  try {
    console.log("[health-scores] Starting recalculation for all users...");
    
    // Get all users with active subscriptions or recent activity
    const { data: users } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .limit(1000);
    
    if (!users || users.length === 0) return;
    
    let processed = 0;
    for (const user of users) {
      await calculateHealthScore(user.user_id);
      processed++;
      
      // Rate limit: 10 per second
      if (processed % 10 === 0) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    
    console.log(`[health-scores] Recalculated ${processed} health scores`);
  } catch (err) {
    console.error("[recalculateAllHealthScores] error:", err.message);
  }
};

// Schedule health score recalculation (every 6 hours, with distributed locking)
setInterval(async () => {
  const gotLock = await acquireDistributedLock("health-score-recalc", 300);
  if (!gotLock) return;
  try {
    await recalculateAllHealthScores();
    await recordJobRun("health-score-recalc", "success");
  } catch (err) {
    await recordJobRun("health-score-recalc", "failed", err.message);
  } finally {
    await releaseDistributedLock("health-score-recalc");
  }
}, 6 * 60 * 60 * 1000);

// =============================================================================
// CHURN PREVENTION SYSTEM
// =============================================================================

/**
 * Evaluate churn risk and trigger alerts/emails when needed
 */
const evaluateChurnRisk = async (userId, currentScore, previousScore) => {
  try {
    // Check if score dropped significantly
    const scoreDrop = (previousScore || 100) - currentScore;
    
    // Alert if score dropped by 15+ points
    if (scoreDrop >= 15 && previousScore) {
      await supabaseAdmin.from("churn_alerts").insert({
        user_id: userId,
        alert_type: "score_drop",
        severity: scoreDrop >= 30 ? "critical" : scoreDrop >= 20 ? "high" : "medium",
        title: `Health score dropped ${scoreDrop} points`,
        message: `Customer health score dropped from ${previousScore} to ${currentScore}`,
        score_before: previousScore,
        score_after: currentScore,
        metadata: { drop_amount: scoreDrop },
      });
    }
    
    // Send proactive email if score drops below 40 (critical churn risk)
    if (currentScore < 40 && (!previousScore || previousScore >= 40)) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("email, business_name")
        .eq("user_id", userId)
        .maybeSingle();
      
      if (profile?.email && resend) {
        try {
          await resend.emails.send({
            from: "Kryonex Team <support@kryonex.com>",
            to: profile.email,
            subject: "We miss you! Here's how to get back on track",
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #0f172a;">Hey${profile.business_name ? ` ${profile.business_name}` : ""}!</h2>
                
                <p style="color: #475569; line-height: 1.6;">
                  We noticed your AI agent hasn't been as busy lately, and we want to make sure everything's working great for you.
                </p>
                
                <p style="color: #475569; line-height: 1.6;">
                  Here are a few quick wins to get the most out of Kryonex:
                </p>
                
                <ul style="color: #475569; line-height: 2;">
                  <li>Make sure your phone number is forwarding to your agent</li>
                  <li>Update your business hours if they've changed</li>
                  <li>Connect your calendar for automatic appointment syncing</li>
                </ul>
                
                <a href="${FRONTEND_URL}/dashboard" style="display: inline-block; padding: 12px 24px; background: #0f172a; color: white; text-decoration: none; border-radius: 8px; margin-top: 16px;">
                  Check Your Dashboard
                </a>
                
                <p style="color: #475569; margin-top: 24px;">
                  Need help? Just reply to this email and our team will jump in.
                </p>
                
                <p style="color: #94a3b8; font-size: 12px; margin-top: 32px;">
                  - The Kryonex Team
                </p>
              </div>
            `,
          });
          
          // Mark email as sent
          await supabaseAdmin
            .from("churn_alerts")
            .update({ email_sent: true, email_sent_at: new Date().toISOString() })
            .eq("user_id", userId)
            .eq("alert_type", "score_drop")
            .is("email_sent", false)
            .order("created_at", { ascending: false })
            .limit(1);
            
          console.log("[churn-prevention] Sent proactive email to:", profile.email);
        } catch (emailErr) {
          console.error("[churn-prevention] Email error:", emailErr.message);
        }
      }
    }
  } catch (err) {
    console.error("[evaluateChurnRisk] error:", err.message);
  }
};

/**
 * Check for inactive users and create alerts
 */
const checkInactiveUsers = async () => {
  try {
    console.log("[churn-prevention] Checking for inactive users...");
    
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    // Get users with health scores who haven't been active
    const { data: inactiveUsers } = await supabaseAdmin
      .from("customer_health_scores")
      .select("user_id, last_activity_at, score")
      .lt("last_activity_at", sevenDaysAgo)
      .gt("score", 0); // Exclude already churned
    
    if (!inactiveUsers || inactiveUsers.length === 0) return;
    
    for (const user of inactiveUsers) {
      // Check if we already alerted recently
      const { data: existingAlert } = await supabaseAdmin
        .from("churn_alerts")
        .select("id")
        .eq("user_id", user.user_id)
        .eq("alert_type", "inactivity")
        .gte("created_at", sevenDaysAgo)
        .maybeSingle();
      
      if (existingAlert) continue; // Already alerted
      
      await supabaseAdmin.from("churn_alerts").insert({
        user_id: user.user_id,
        alert_type: "inactivity",
        severity: "medium",
        title: "No activity for 7+ days",
        message: "User has not logged in or made calls for over a week",
        score_after: user.score,
        metadata: { last_activity_at: user.last_activity_at },
      });
    }
    
    console.log(`[churn-prevention] Created ${inactiveUsers.length} inactivity alerts`);
  } catch (err) {
    console.error("[checkInactiveUsers] error:", err.message);
  }
};

// Run inactivity check daily (with distributed locking)
setInterval(async () => {
  const gotLock = await acquireDistributedLock("inactive-users-check", 600);
  if (!gotLock) return;
  try {
    await checkInactiveUsers();
    await recordJobRun("inactive-users-check", "success");
  } catch (err) {
    await recordJobRun("inactive-users-check", "failed", err.message);
  } finally {
    await releaseDistributedLock("inactive-users-check");
  }
}, 24 * 60 * 60 * 1000);

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
 * Create operational alert and send email/SMS notifications for usage alerts
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
    
    // Send email + SMS for usage alerts
    if (alertType === "usage_warning" || alertType === "usage_blocked") {
      const usagePercent = details?.percent || 0;
      const usedMinutes = Math.ceil((details?.usedSeconds || 0) / 60);
      const capMinutes = Math.ceil((details?.capSeconds || 0) / 60);
      const remainingMinutes = Math.max(0, capMinutes - usedMinutes);
      
      // Send email alert
      await sendUsageAlertEmail(userId, alertType, usagePercent, details);
      
      // Send SMS alert to owner's personal phone
      await sendUsageAlertSms({
        userId,
        alertType: alertType === "usage_blocked" ? "100" : "80",
        usagePercent,
        usedMinutes,
        capMinutes,
        remainingMinutes,
      });
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

// =============================================================================
// SESSION SECURITY SYSTEM
// =============================================================================

const MAX_SESSIONS_PER_USER = 5;

/**
 * Create or update session tracking for a user
 */
const trackSession = async (userId, tokenHash, req) => {
  try {
    // Determine device type from user agent
    const userAgent = req?.headers?.["user-agent"] || "";
    let deviceType = "desktop";
    if (/mobile|android|iphone|ipad/i.test(userAgent)) {
      deviceType = /ipad|tablet/i.test(userAgent) ? "tablet" : "mobile";
    }
    
    const ipAddress = req?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() || 
                      req?.socket?.remoteAddress || null;
    
    // Check for existing session with this token
    const { data: existing } = await supabaseAdmin
      .from("active_sessions")
      .select("id")
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .maybeSingle();
    
    if (existing) {
      // Update last active time
      await supabaseAdmin
        .from("active_sessions")
        .update({ last_active_at: new Date().toISOString() })
        .eq("id", existing.id);
      return;
    }
    
    // Count active sessions for this user
    const { data: activeSessions } = await supabaseAdmin
      .from("active_sessions")
      .select("id, created_at")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .order("created_at", { ascending: true });
    
    // If at limit, revoke oldest session
    if ((activeSessions?.length || 0) >= MAX_SESSIONS_PER_USER) {
      const oldestSession = activeSessions[0];
      await supabaseAdmin
        .from("active_sessions")
        .update({ 
          revoked_at: new Date().toISOString(), 
          revoked_reason: "session_limit_reached" 
        })
        .eq("id", oldestSession.id);
    }
    
    // Create new session record
    await supabaseAdmin.from("active_sessions").insert({
      user_id: userId,
      token_hash: tokenHash,
      ip_address: ipAddress,
      user_agent: userAgent.substring(0, 500),
      device_type: deviceType,
    });
  } catch (err) {
    console.error("[trackSession] error:", err.message);
  }
};

/**
 * Check if a session is revoked
 */
const isSessionRevoked = async (tokenHash) => {
  try {
    const { data: session } = await supabaseAdmin
      .from("active_sessions")
      .select("revoked_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    
    return session?.revoked_at != null;
  } catch (err) {
    return false; // Allow on error (fail open for availability)
  }
};

/**
 * Revoke all sessions for a user (e.g., on password change)
 */
const revokeAllUserSessions = async (userId, reason = "password_changed") => {
  try {
    const { data: updated } = await supabaseAdmin
      .from("active_sessions")
      .update({ 
        revoked_at: new Date().toISOString(), 
        revoked_reason: reason 
      })
      .eq("user_id", userId)
      .is("revoked_at", null)
      .select("id");
    
    console.log(`[session-security] Revoked ${updated?.length || 0} sessions for user ${userId}`);
    return updated?.length || 0;
  } catch (err) {
    console.error("[revokeAllUserSessions] error:", err.message);
    return 0;
  }
};

/**
 * Generate hash of token for storage (we don't store raw tokens)
 */
const hashToken = (token) => {
  if (!token) return null;
  return crypto.createHash("sha256").update(token).digest("hex").substring(0, 64);
};

// =============================================================================
// END SESSION SECURITY SYSTEM
// =============================================================================

// =============================================================================
// BULLETPROOF SMS SYSTEM - Thread Locking, Rate Limiting, Keyword Handling
// =============================================================================

// Allowed SMS source types - freeform manual sends are NOT allowed
const ALLOWED_SMS_SOURCES = [
  "auto_post_call",
  "auto_reminder",
  "auto_review_request",
  "auto_eta",
  "auto_confirmation",
  "quick_action_enroute",
  "quick_action_arrived",
  "quick_action_complete",
  "quick_action_delayed",
  "system_disambiguation",
  "system_opt_out",
  "system_rate_limit",
  "system_usage_alert",
];

// SMS Keywords for auto-handling
const SMS_KEYWORDS = {
  OPT_OUT: ["stop", "unsubscribe", "cancel", "end", "quit", "optout", "opt-out"],
  OPT_IN: ["start", "unstop", "subscribe", "resume", "yes"],  // Re-subscribe keywords
  HELP: ["help", "info", "?"],
  CONFIRM: ["yes", "confirm", "ok", "y", "yep", "yeah", "confirmed"],
  DECLINE: ["no", "n", "nope", "decline"],
  RESCHEDULE: ["reschedule", "change", "move"],
};

// Update thread owner on every outbound SMS (sticky lock for 72h)
const updateThreadOwner = async ({ toNumber, tenantId, businessName }) => {
  if (!toNumber || !tenantId) return;
  
  const normalizedPhone = normalizePhoneForLookup(toNumber);
  const lockDurationHours = 72;
  const lockedUntil = new Date(Date.now() + lockDurationHours * 60 * 60 * 1000);
  
  try {
    // Upsert - update if exists, insert if not
    const { error } = await supabaseAdmin
      .from("phone_thread_owner")
      .upsert({
        from_number: normalizedPhone,
        tenant_id: tenantId,
        locked_until: lockedUntil.toISOString(),
        last_outbound_at: new Date().toISOString(),
        business_name: businessName || null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "from_number",
      });
    
    if (error) {
      console.warn("[updateThreadOwner] Failed to update thread lock:", error.message);
    } else {
      console.log("[updateThreadOwner] Thread locked for", normalizedPhone, "to tenant", tenantId, "until", lockedUntil.toISOString());
    }
  } catch (err) {
    console.warn("[updateThreadOwner] Error:", err.message);
  }
};

// Get thread owner for inbound routing
const getThreadOwner = async (fromNumber) => {
  const normalizedPhone = normalizePhoneForLookup(fromNumber);
  
  const { data, error } = await supabaseAdmin
    .from("phone_thread_owner")
    .select("tenant_id, business_name, locked_until")
    .eq("from_number", normalizedPhone)
    .gt("locked_until", new Date().toISOString())
    .maybeSingle();
  
  if (error || !data) return null;
  return data;
};

// Check for collision - multiple tenants contacted this phone recently
const checkCollision = async (fromNumber) => {
  const normalizedPhone = normalizePhoneForLookup(fromNumber);
  const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  
  // Find all unique tenants who sent outbound to this number in last 72h
  const { data: recentOutbound, error } = await supabaseAdmin
    .from("messages")
    .select("user_id")
    .eq("to_number", normalizedPhone)
    .eq("direction", "outbound")
    .gte("created_at", seventyTwoHoursAgo)
    .order("created_at", { ascending: false });
  
  if (error || !recentOutbound?.length) {
    return { hasCollision: false, tenants: [] };
  }
  
  // Get unique tenant IDs
  const uniqueTenantIds = [...new Set(recentOutbound.map(m => m.user_id))];
  
  if (uniqueTenantIds.length <= 1) {
    return { hasCollision: false, tenants: uniqueTenantIds };
  }
  
  // Multiple tenants - need to get their business names
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("user_id, business_name")
    .in("user_id", uniqueTenantIds);
  
  const tenantsWithNames = uniqueTenantIds.map(id => {
    const profile = profiles?.find(p => p.user_id === id);
    return {
      tenant_id: id,
      business_name: profile?.business_name || `Business ${id.slice(0, 8)}`,
    };
  });
  
  return { hasCollision: true, tenants: tenantsWithNames };
};

// Log collision for audit
const logCollision = async ({ fromNumber, tenants, disambiguationSent }) => {
  try {
    await supabaseAdmin.from("sms_collision_log").insert({
      from_number: normalizePhoneForLookup(fromNumber),
      tenant_ids: tenants.map(t => t.tenant_id),
      business_names: tenants.map(t => t.business_name),
      disambiguation_sent: disambiguationSent,
    });
  } catch (err) {
    console.warn("[logCollision] Error:", err.message);
  }
};

// Check pending collision waiting for customer response
const getPendingCollision = async (fromNumber) => {
  const normalizedPhone = normalizePhoneForLookup(fromNumber);
  
  const { data } = await supabaseAdmin
    .from("sms_collision_log")
    .select("*")
    .eq("from_number", normalizedPhone)
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  
  return data;
};

// Resolve collision based on customer's choice
const resolveCollision = async (collisionId, choice, tenantId) => {
  await supabaseAdmin
    .from("sms_collision_log")
    .update({
      customer_choice: choice,
      resolved_tenant_id: tenantId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", collisionId);
};

// Check inbound rate limit for a phone number
const checkInboundRateLimit = async (fromNumber) => {
  const normalizedPhone = normalizePhoneForLookup(fromNumber);
  const now = new Date();
  const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  
  // Check if currently blocked
  const { data: rateLimit } = await supabaseAdmin
    .from("sms_inbound_rate_limits")
    .select("blocked_until, block_reason")
    .eq("from_number", normalizedPhone)
    .gte("blocked_until", now.toISOString())
    .maybeSingle();
  
  if (rateLimit?.blocked_until) {
    return { allowed: false, reason: rateLimit.block_reason || "rate_limited" };
  }
  
  // Count recent inbound from this number (10 min window)
  const { count: recent10min } = await supabaseAdmin
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("from_number", normalizedPhone)
    .eq("direction", "inbound")
    .gte("created_at", tenMinAgo.toISOString());
  
  // Count today's inbound
  const { count: todayCount } = await supabaseAdmin
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("from_number", normalizedPhone)
    .eq("direction", "inbound")
    .gte("created_at", todayStart.toISOString());
  
  // Check limits: 5 per 10 min, 20 per day
  if ((recent10min || 0) >= 5) {
    // Block for 10 minutes
    const blockUntil = new Date(now.getTime() + 10 * 60 * 1000);
    await supabaseAdmin.from("sms_inbound_rate_limits").upsert({
      from_number: normalizedPhone,
      window_date: now.toISOString().slice(0, 10),
      count_10min: recent10min,
      count_daily: todayCount,
      blocked_until: blockUntil.toISOString(),
      block_reason: "rate_limit_10min",
      last_message_at: now.toISOString(),
      updated_at: now.toISOString(),
    }, { onConflict: "from_number,window_date" });
    
    return { allowed: false, reason: "rate_limit_10min" };
  }
  
  if ((todayCount || 0) >= 20) {
    // Block until tomorrow
    const tomorrow = new Date(todayStart);
    tomorrow.setDate(tomorrow.getDate() + 1);
    await supabaseAdmin.from("sms_inbound_rate_limits").upsert({
      from_number: normalizedPhone,
      window_date: now.toISOString().slice(0, 10),
      count_10min: recent10min,
      count_daily: todayCount,
      blocked_until: tomorrow.toISOString(),
      block_reason: "rate_limit_daily",
      last_message_at: now.toISOString(),
      updated_at: now.toISOString(),
    }, { onConflict: "from_number,window_date" });
    
    return { allowed: false, reason: "rate_limit_daily" };
  }
  
  return { allowed: true };
};

// Check outbound throttle (60 SMS per minute per tenant)
const checkOutboundThrottle = async (tenantId) => {
  const now = new Date();
  // Truncate to current minute
  const windowMinute = new Date(now);
  windowMinute.setSeconds(0, 0);
  
  const { data: throttle } = await supabaseAdmin
    .from("sms_outbound_throttle")
    .select("count")
    .eq("tenant_id", tenantId)
    .eq("window_minute", windowMinute.toISOString())
    .maybeSingle();
  
  const currentCount = throttle?.count || 0;
  
  if (currentCount >= 60) {
    return { allowed: false, reason: "outbound_throttle", waitMs: 60000 - (now.getTime() % 60000) };
  }
  
  // Increment counter
  await supabaseAdmin.from("sms_outbound_throttle").upsert({
    tenant_id: tenantId,
    window_minute: windowMinute.toISOString(),
    count: currentCount + 1,
  }, { onConflict: "tenant_id,window_minute" });
  
  return { allowed: true };
};

// Detect keyword in message body
const detectKeyword = (body) => {
  if (!body) return null;
  const normalizedBody = body.trim().toLowerCase();
  
  // Check for opt-out keywords
  if (SMS_KEYWORDS.OPT_OUT.some(k => normalizedBody === k || normalizedBody.startsWith(k + " "))) {
    return { type: "OPT_OUT", keyword: normalizedBody.split(" ")[0] };
  }
  
  // Check for opt-in/re-subscribe keywords (START, UNSTOP)
  // Note: "yes" is in both OPT_IN and CONFIRM - OPT_OUT takes priority, then we check context
  if (SMS_KEYWORDS.OPT_IN.some(k => normalizedBody === k && k !== "yes")) {
    return { type: "OPT_IN", keyword: normalizedBody };
  }
  
  // Check for help keywords
  if (SMS_KEYWORDS.HELP.some(k => normalizedBody === k)) {
    return { type: "HELP", keyword: normalizedBody };
  }
  
  // Check for confirm keywords (exact match or starts with)
  if (SMS_KEYWORDS.CONFIRM.some(k => normalizedBody === k || normalizedBody.startsWith(k + " ") || normalizedBody.startsWith(k + "!"))) {
    return { type: "CONFIRM", keyword: normalizedBody.split(/[\s!]/)[0] };
  }
  
  // Check for decline keywords
  if (SMS_KEYWORDS.DECLINE.some(k => normalizedBody === k)) {
    return { type: "DECLINE", keyword: normalizedBody };
  }
  
  // Check for reschedule keywords
  if (SMS_KEYWORDS.RESCHEDULE.some(k => normalizedBody.includes(k))) {
    return { type: "RESCHEDULE", keyword: "reschedule" };
  }
  
  // Check if it's a number (collision disambiguation response)
  if (/^[1-9]$/.test(normalizedBody)) {
    return { type: "COLLISION_CHOICE", keyword: normalizedBody, choice: parseInt(normalizedBody, 10) };
  }
  
  return null;
};

// Log keyword response for audit
const logKeywordResponse = async ({ fromNumber, tenantId, keyword, originalBody, autoResponse, action, appointmentId }) => {
  try {
    await supabaseAdmin.from("sms_keyword_responses").insert({
      from_number: normalizePhoneForLookup(fromNumber),
      tenant_id: tenantId || null,
      keyword_detected: keyword,
      original_body: originalBody,
      auto_response_sent: autoResponse || null,
      action_taken: action,
      appointment_id: appointmentId || null,
    });
  } catch (err) {
    console.warn("[logKeywordResponse] Error:", err.message);
  }
};

// Send auto-reply (used for system responses like opt-out, disambiguation, rate limit)
const sendAutoReply = async ({ toNumber, body, source }) => {
  if (!MASTER_SMS_NUMBER) {
    console.warn("[sendAutoReply] No MASTER_SMS_NUMBER configured, skipping auto-reply");
    return null;
  }
  
  try {
    const payload = { to: toNumber, body, from_number: MASTER_SMS_NUMBER };
    const response = await retellSmsClient.post("/sms", payload);
    console.log("[sendAutoReply] Sent:", body.slice(0, 50));
    return response.data;
  } catch (err) {
    console.error("[sendAutoReply] Failed:", err.message);
    return null;
  }
};

// Normalize phone number for lookup
const normalizePhoneForLookup = (phone) => {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return String(phone).trim();
};

// Get all possible phone format variants for database lookup
// Returns array of formats to try: E.164, with/without +, 10-digit, original
const getPhoneVariantsForLookup = (phone) => {
  if (!phone) return [];
  const raw = String(phone).trim();
  if (!raw) return [];
  
  const digits = raw.replace(/\D/g, "");
  const variants = new Set();
  
  // Add original trimmed value
  variants.add(raw);
  
  if (digits.length === 10) {
    // US 10-digit: add all variants
    variants.add(`+1${digits}`);      // E.164: +1XXXXXXXXXX
    variants.add(`1${digits}`);        // 1XXXXXXXXXX
    variants.add(digits);              // XXXXXXXXXX
  } else if (digits.length === 11 && digits.startsWith("1")) {
    // US 11-digit with country code
    variants.add(`+${digits}`);        // E.164: +1XXXXXXXXXX
    variants.add(digits);              // 1XXXXXXXXXX
    variants.add(digits.slice(1));     // XXXXXXXXXX (strip leading 1)
  } else if (digits.length > 0) {
    // Other formats - add with and without + prefix
    variants.add(digits);
    if (!raw.startsWith("+")) {
      variants.add(`+${digits}`);
    }
  }
  
  return Array.from(variants).filter(Boolean);
};

// Normalize phone to E.164 format (+1XXXXXXXXXX for US) - used for saving and API calls
const normalizePhoneE164 = (phone) => {
  if (!phone) return null;
  const raw = String(phone).trim();
  if (!raw) return null;
  
  // Remove all non-digit characters except leading +
  const digits = raw.replace(/\D/g, "");
  
  if (digits.length < 10 || digits.length > 15) return null;
  
  // 10 digits = US number without country code
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  
  // 11 digits starting with 1 = US number with country code
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  
  // Already has country code
  return `+${digits}`;
};

// Get business phone for "call us" messages
const getBusinessPhone = async (tenantId) => {
  if (!tenantId) return null;
  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("phone_number")
    .eq("user_id", tenantId)
    .eq("is_active", true)
    .maybeSingle();
  return agent?.phone_number || null;
};

// =============================================================================
// END BULLETPROOF SMS SYSTEM
// =============================================================================

// =============================================================================
// SMS OPT-OUT CHECK - CRITICAL FOR LEGAL COMPLIANCE
// Call this before ANY outbound SMS to a customer
// =============================================================================
const canSendSmsToCustomer = async (customerPhone, userId) => {
  if (!customerPhone) return false;
  
  const normalizedPhone = normalizePhoneForLookup(customerPhone);
  
  // Check user-specific opt-out
  const { data: userOptOut } = await supabaseAdmin
    .from("sms_opt_outs")
    .select("id")
    .eq("user_id", userId)
    .eq("phone", normalizedPhone)
    .maybeSingle();
  
  if (userOptOut) {
    console.log("[canSendSmsToCustomer] Blocked - user-specific opt-out", { phone: normalizedPhone, userId });
    return false;
  }
  
  // Check global opt-out (shared number mode)
  if (MASTER_SMS_NUMBER) {
    const { data: globalOptOut } = await supabaseAdmin
      .from("sms_opt_outs")
      .select("id")
      .eq("phone", normalizedPhone)
      .eq("global_opt_out", true)
      .maybeSingle();
    
    if (globalOptOut) {
      console.log("[canSendSmsToCustomer] Blocked - global opt-out", { phone: normalizedPhone });
      return false;
    }
  }
  
  return true;
};

const sendSmsInternal = async ({
  userId,
  to,
  body,
  leadId,
  source,
  req,
  bypassUsage = false,
  skipBusinessPrefix = false,
}) => {
  if (!body || !to) {
    throw new Error("body and to are required");
  }
  
  // Normalize phone to E.164 format (+1XXXXXXXXXX for US)
  const normalizedTo = normalizePhoneE164(to);
  if (!normalizedTo) {
    throw new Error("Invalid phone number format");
  }
  // Use normalized phone for all operations
  to = normalizedTo;

  // BULLETPROOF SMS: Validate source type - reject freeform manual sends
  const normalizedSource = (source || "manual").toLowerCase();
  const isAllowedSource = ALLOWED_SMS_SOURCES.some(s => normalizedSource === s || normalizedSource.startsWith(s.split("_")[0]));
  
  if (!isAllowedSource && normalizedSource === "manual" && !bypassUsage) {
    // Reject pure "manual" freeform messages - must use quick actions or automation
    console.warn("[sendSms] Rejected freeform manual SMS - use quick actions or automated messages", { userId, source });
    const err = new Error("Freeform SMS not allowed. Use quick actions or automated notifications.");
    err.code = "FREEFORM_NOT_ALLOWED";
    throw err;
  }

  // BULLETPROOF SMS: Check outbound throttle (60/min per tenant)
  if (!bypassUsage) {
    const throttleCheck = await checkOutboundThrottle(userId);
    if (!throttleCheck.allowed) {
      console.warn("[sendSms] Outbound throttle reached", { userId, waitMs: throttleCheck.waitMs });
      const err = new Error("Sending too fast. Please wait a moment.");
      err.code = "OUTBOUND_THROTTLE";
      throw err;
    }
  }

  // Check for opt-outs: per-tenant AND global (for shared number compliance)
  const lookupPhone = normalizePhoneForLookup(to);
  const { data: optOut } = await supabaseAdmin
    .from("sms_opt_outs")
    .select("id, global_opt_out")
    .eq("user_id", userId)
    .eq("phone", lookupPhone)
    .maybeSingle();
  
  // Also check for GLOBAL opt-out (customer said STOP on shared number)
  let globalOptOut = null;
  if (MASTER_SMS_NUMBER) {
    const { data: globalCheck } = await supabaseAdmin
      .from("sms_opt_outs")
      .select("id")
      .eq("phone", lookupPhone)
      .eq("global_opt_out", true)
      .maybeSingle();
    globalOptOut = globalCheck;
  }
  
  if (optOut || globalOptOut) {
    console.log("[sendSms] Blocked - recipient opted out", { phone: lookupPhone, global: !!globalOptOut });
    throw new Error("Recipient opted out");
  }

  // Get user's profile for business name (needed for shared number branding)
  const { data: userProfile } = await supabaseAdmin
    .from("profiles")
    .select("business_name")
    .eq("user_id", userId)
    .maybeSingle();
  const businessName = userProfile?.business_name || "Your service provider";

  // Prepend business name to message if using shared number (unless explicitly skipped)
  let finalBody = body;
  if (!skipBusinessPrefix && MASTER_SMS_NUMBER) {
    // Only prepend if body doesn't already start with the business name
    if (!body.startsWith(`[${businessName}]`)) {
      finalBody = `[${businessName}] ${body}`;
    }
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
  const smsCredit = usage.sms_credit ?? 0;
  const totalSmsCap = smsCap + smsCredit;
  const newSmsUsed = (usage.sms_used || 0) + 1;
  if (!bypassUsage && newSmsUsed > totalSmsCap) {
    console.warn("[sendSms] SMS blocked: usage cap reached", {
      user_id: userId,
      sms_used: usage.sms_used,
      sms_cap: smsCap,
      sms_credit: smsCredit,
      total_cap: totalSmsCap,
    });
    await supabaseAdmin
      .from("usage_limits")
      .update({ limit_state: "paused", updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    const err = new Error("Usage cap reached");
    err.code = "USAGE_CAP_REACHED";
    throw err;
  }

  // Determine which phone number to send from:
  // 1. If MASTER_SMS_NUMBER is set, use it (shared number model)
  // 2. Otherwise, use the user's agent phone number
  let fromNumber = MASTER_SMS_NUMBER || null;
  if (!fromNumber) {
    const { data: agentRow, error: agentError } = await supabaseAdmin
      .from("agents")
      .select("phone_number")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .maybeSingle();
    if (agentError || !agentRow?.phone_number) {
      throw new Error("Agent phone number not found and no MASTER_SMS_NUMBER configured");
    }
    fromNumber = agentRow.phone_number;
  }

  if (String(RETELL_SMS_SANDBOX || "").toLowerCase() === "true") {
    await supabaseAdmin.from("messages").insert({
      user_id: userId,
      lead_id: leadId || null,
      direction: "outbound",
      body: finalBody,
      from_number: fromNumber,
      to_number: to,
    });
    await auditLog({
      userId,
      action: "sms_sandboxed",
      entity: "message",
      entityId: leadId || null,
      metadata: { to, from: fromNumber, source: source || "manual" },
    });
    await logEvent({
      userId,
      actionType: "SMS_SENT",
      req,
      metaData: {
        direction: "outbound",
        body: finalBody,
        to,
        from: fromNumber,
        source: source || "manual",
        cost: 0,
        sandbox: true,
      },
    });
    // BULLETPROOF SMS: Update thread owner even in sandbox mode
    await updateThreadOwner({ toNumber: to, tenantId: userId, businessName });
    return { sandbox: true };
  }

  const payload = { to, body: finalBody, from_number: fromNumber };
  const retellResponse = await retellSmsClient.post("/sms", payload);

  // Store message with full phone tracking for conversation routing
  await supabaseAdmin.from("messages").insert({
    user_id: userId,
    lead_id: leadId || null,
    direction: "outbound",
    body: finalBody,
    from_number: fromNumber,
    to_number: to,
  });

  // Insert SMS record (with message_id for idempotency if unique constraint exists)
  const messageId = retellResponse.data?.id || null;
  await supabaseAdmin.from("usage_sms").insert({
    user_id: userId,
    message_id: messageId,
    segments: 1,
    cost_cents: 0,
  });
  
  // ATOMIC UPDATE: Use RPC function to prevent race conditions
  let atomicSmsSuccess = false;
  try {
    const { data: atomicResult, error: rpcError } = await supabaseAdmin
      .rpc("increment_sms_usage", {
        p_user_id: userId,
        p_count: 1,
      });
    
    if (!rpcError && atomicResult && atomicResult.length > 0) {
      atomicSmsSuccess = true;
      console.log("[sendSms] ATOMIC SMS INCREMENT SUCCESS:", {
        user_id: userId,
        new_sms_used: atomicResult[0].new_sms_used,
      });
    }
  } catch (rpcErr) {
    console.warn("[sendSms] ATOMIC SMS INCREMENT FAILED, using fallback:", rpcErr.message);
  }
  
  // Fallback if RPC not available
  if (!atomicSmsSuccess) {
    const nextSmsUsed = (usage.sms_used || 0) + 1;
    await supabaseAdmin
      .from("usage_limits")
      .update({
        sms_used: nextSmsUsed,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
  }

  await auditLog({
    userId,
    action: "sms_sent",
    entity: "message",
    entityId: leadId || null,
    metadata: { to, from: fromNumber, source: source || "manual" },
  });
  await logEvent({
    userId,
    actionType: "SMS_SENT",
    req,
    metaData: {
      direction: "outbound",
      body: finalBody,
      to,
      from: fromNumber,
      source: source || "manual",
      cost: retellResponse.data?.cost || retellResponse.data?.cost_cents || null,
    },
  });

  // BULLETPROOF SMS: Update thread owner for conversation routing
  await updateThreadOwner({
    toNumber: to,
    tenantId: userId,
    businessName,
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

  const effectiveUserId = userId || agentRow.user_id;
  
  // Get user's profile for business name (shared number branding)
  const { data: userProfile } = await supabaseAdmin
    .from("profiles")
    .select("business_name")
    .eq("user_id", effectiveUserId)
    .maybeSingle();
  const businessName = userProfile?.business_name || "Your service provider";

  // Prepend business name if using shared number
  let finalBody = body;
  if (MASTER_SMS_NUMBER && !body.startsWith(`[${businessName}]`)) {
    finalBody = `[${businessName}] ${body}`;
  }

  // Use master number if set, otherwise use agent's number
  const fromNumber = MASTER_SMS_NUMBER || agentRow.phone_number;

  if (String(RETELL_SMS_SANDBOX || "").toLowerCase() === "true") {
    await supabaseAdmin.from("messages").insert({
      user_id: effectiveUserId,
      lead_id: null,
      direction: "outbound",
      body: finalBody,
      from_number: fromNumber,
      to_number: to,
    });
    await auditLog({
      userId: effectiveUserId,
      action: "sms_sandboxed",
      entity: "message",
      entityId: agentId,
      metadata: { to, from: fromNumber, source: source || "agent_tool" },
    });
    await logEvent({
      userId: effectiveUserId,
      actionType: "SMS_SENT",
      metaData: {
        direction: "outbound",
        body: finalBody,
        to,
        from: fromNumber,
        source: source || "agent_tool",
        cost: 0,
        sandbox: true,
      },
    });
    // BULLETPROOF SMS: Update thread owner
    await updateThreadOwner({ toNumber: to, tenantId: effectiveUserId, businessName });
    return { sandbox: true };
  }

  const payload = {
    to,
    body: finalBody,
    from_number: fromNumber,
  };
  const retellResponse = await retellSmsClient.post("/sms", payload);

  await supabaseAdmin.from("messages").insert({
    user_id: effectiveUserId,
    lead_id: null,
    direction: "outbound",
    body: finalBody,
    from_number: fromNumber,
    to_number: to,
  });
  await auditLog({
    userId: effectiveUserId,
    action: "sms_sent",
    entity: "message",
    entityId: agentId,
    metadata: { to, from: fromNumber, source: source || "agent_tool" },
  });
  await logEvent({
    userId: effectiveUserId,
    actionType: "SMS_SENT",
    metaData: {
      direction: "outbound",
      body: finalBody,
      to,
      from: fromNumber,
      source: source || "agent_tool",
      cost: retellResponse.data?.cost || retellResponse.data?.cost_cents || null,
    },
  });

  // BULLETPROOF SMS: Update thread owner for conversation routing
  await updateThreadOwner({ toNumber: to, tenantId: effectiveUserId, businessName });

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

// Send SMS alert for low usage (to business owner's personal phone)
const sendUsageAlertSms = async ({ userId, alertType, usagePercent, usedMinutes, capMinutes, remainingMinutes }) => {
  try {
    // Get user profile with personal phone and notification preferences
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("user_personal_phone, business_name, notification_preferences")
      .eq("user_id", userId)
      .maybeSingle();
    
    if (!profile?.user_personal_phone) {
      console.log("[sendUsageAlertSms] skipped - no personal phone", { userId });
      return;
    }
    
    // Check notification preferences
    const notifPrefs = profile.notification_preferences || {};
    if (notifPrefs.sms_on_low_usage === false) {
      console.log("[sendUsageAlertSms] skipped - user disabled SMS alerts", { userId });
      return;
    }
    
    const businessName = profile.business_name || "Your business";
    const isBlocked = alertType === "100" || remainingMinutes <= 0;
    
    // Build alert message
    let message;
    if (isBlocked) {
      message = `KRYONEX ALERT: ${businessName} has used 100% of call minutes. Your AI agent is paused. Top up now to resume: ${FRONTEND_URL}/usage`;
    } else {
      message = `KRYONEX ALERT: ${businessName} has used ${usagePercent}% of call minutes (${remainingMinutes} min remaining). Top up to avoid interruptions: ${FRONTEND_URL}/usage`;
    }
    
    // Get user's first agent for sending SMS
    const { data: agent } = await supabaseAdmin
      .from("agents")
      .select("id, phone_number")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    
    if (!agent?.id) {
      console.log("[sendUsageAlertSms] skipped - no agent found", { userId });
      return;
    }
    
    // Send SMS via internal function (bypasses usage since it's a system alert)
    await sendSmsInternal({
      userId,
      agentId: agent.id,
      to: profile.user_personal_phone,
      body: message,
      source: "system_usage_alert",
      bypassUsage: true, // Don't count against user's SMS usage
    });
    
    console.log("[sendUsageAlertSms] sent", { userId, alertType, usagePercent, phone: profile.user_personal_phone.slice(-4) });
  } catch (err) {
    console.error("[sendUsageAlertSms] error", err.message);
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
        // IDEMPOTENCY CHECK: Skip if already processed
        const alreadyProcessed = await isStripeEventProcessed(event.id);
        if (alreadyProcessed) {
          console.log("[stripe-webhook] Event already processed, skipping", { eventId: event.id, eventType: event.type });
          return;
        }
        
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
              // TOP-UP FIX: Add to credit fields, NOT cap fields
              // Credit fields persist across billing resets and ADD to existing balance
              const addedCallSeconds = Math.max(0, extraMinutes) * 60;
              const addedSms = Math.max(0, extraSms);
              
              // Add to existing credits (stacks with any previous top-ups)
              const newCallCredit = (usageRow.call_credit_seconds || 0) + addedCallSeconds;
              const newSmsCredit = (usageRow.sms_credit || 0) + addedSms;
              
              // Calculate new total available for hard_stop check
              const totalAvailable = 
                (usageRow.call_cap_seconds || 0) + 
                newCallCredit + 
                (usageRow.rollover_seconds || 0) +
                (usageRow.grace_seconds ?? 600);
              const totalSmsAvailable = (usageRow.sms_cap || 0) + newSmsCredit;
              
              const underLimit =
                (usageRow.call_used_seconds || 0) <= totalAvailable &&
                (usageRow.sms_used || 0) <= totalSmsAvailable;
              
              await supabaseAdmin
                .from("usage_limits")
                .update({
                  // ADD to credit fields (persists across resets, stacks with existing)
                  call_credit_seconds: newCallCredit,
                  sms_credit: newSmsCredit,
                  // Unlock the account if they were paused
                  limit_state: "ok",
                  force_pause: false,
                  force_resume: true,
                  // Clear hard stop if they're now under limit
                  hard_stop_active: underLimit ? false : (usageRow.hard_stop_active ?? false),
                  updated_at: new Date().toISOString(),
                })
                .eq("user_id", userId);
              
              console.info("[stripe-webhook] topup applied (CREDIT)", {
                user_id: userId,
                topup_type: session.metadata?.topup_type || null,
                extra_minutes: extraMinutes,
                extra_sms: extraSms,
                previous_call_credit: usageRow.call_credit_seconds || 0,
                new_call_credit: newCallCredit,
                previous_sms_credit: usageRow.sms_credit || 0,
                new_sms_credit: newSmsCredit,
                total_minutes_now: Math.ceil(((usageRow.call_cap_seconds || 0) + newCallCredit + (usageRow.rollover_seconds || 0)) / 60),
                total_sms_now: (usageRow.sms_cap || 0) + newSmsCredit,
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
                trackError({
                  error: refErr,
                  context: { source: "stripe-webhook", action: "referral_processing" },
                  severity: "medium",
                  endpoint: "/stripe-webhook",
                  method: "POST",
                });
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
          const priceId = subscription.items.data?.[0]?.price?.id;
          const newTier = resolvePlanTierFromPriceId(priceId);
          const caps = newTier ? getPlanCaps(newTier) : null;

          console.log("[stripe-webhook] subscription.updated:", {
            customer_id: subscription.customer,
            price_id: priceId,
            resolved_tier: newTier,
            caps: caps,
            status: subscription.status,
          });

          // Update subscription with plan_type if we can resolve it
          const { data: subRow } = await supabaseAdmin
            .from("subscriptions")
            .update({
              status: subscription.status,
              plan_type: newTier || undefined,
              current_period_end: new Date(
                subscription.current_period_end * 1000
              ).toISOString(),
            })
            .eq("customer_id", subscription.customer)
            .select("user_id")
            .maybeSingle();

          // CRITICAL: Sync usage caps when plan changes
          if (caps && subRow?.user_id) {
            const { error: capsError } = await supabaseAdmin
              .from("usage_limits")
              .update({
                call_cap_seconds: caps.minutesCap * 60,
                sms_cap: caps.smsCap,
                updated_at: new Date().toISOString(),
              })
              .eq("user_id", subRow.user_id);

            console.log("[stripe-webhook] Synced usage caps for plan change:", {
              user_id: subRow.user_id,
              new_tier: newTier,
              new_cap_minutes: caps.minutesCap,
              new_sms_cap: caps.smsCap,
              error: capsError?.message || null,
            });

            await auditLog({
              userId: subRow.user_id,
              action: "usage_caps_synced",
              entity: "usage_limits",
              entityId: subRow.user_id,
              req,
              metadata: {
                new_tier: newTier,
                new_cap_minutes: caps.minutesCap,
                new_sms_cap: caps.smsCap,
                trigger: "subscription.updated",
              },
            });
          }
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
            
            // REFERRAL SYSTEM: Void pending commissions when subscription is cancelled
            try {
              const { data: referral } = await supabaseAdmin
                .from("referrals")
                .select("*")
                .eq("referred_id", subRow.user_id)
                .maybeSingle();
              
              if (referral) {
                // Void pending commissions (not yet cleared/paid)
                const { data: voidedCommissions, error: voidError } = await supabaseAdmin
                  .from("referral_commissions")
                  .update({ 
                    status: "clawed_back", 
                    notes: "Customer cancelled subscription",
                    updated_at: new Date().toISOString(),
                  })
                  .eq("referral_id", referral.id)
                  .in("status", ["pending", "approved"])
                  .select();
                
                // Update referral status to cancelled
                await supabaseAdmin
                  .from("referrals")
                  .update({ 
                    status: "cancelled",
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", referral.id);
                
                const voidedCount = voidedCommissions?.length || 0;
                const voidedAmount = voidedCommissions?.reduce((sum, c) => sum + (c.amount_cents || 0), 0) || 0;
                
                console.info("[stripe-webhook] Referral commissions voided due to subscription cancellation", {
                  referral_id: referral.id,
                  referred_user_id: subRow.user_id,
                  voided_count: voidedCount,
                  voided_amount_cents: voidedAmount,
                });
                
                await auditLog({
                  userId: referral.referrer_id,
                  action: "referral_commissions_voided",
                  entity: "referral",
                  entityId: referral.id,
                  req,
                  metadata: { 
                    reason: "subscription_cancelled",
                    voided_count: voidedCount,
                    voided_amount_cents: voidedAmount,
                  },
                });
              }
            } catch (refErr) {
              console.error("[stripe-webhook] Error voiding referral commissions:", refErr.message);
              trackError({
                error: refErr,
                context: { source: "stripe-webhook", action: "void_referral_commissions" },
                severity: "medium",
                endpoint: "/stripe-webhook",
                method: "POST",
              });
            }
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
                
                // Get profiles for fraud scoring
                const { data: referrerProfile } = await supabaseAdmin
                  .from("profiles")
                  .select("*")
                  .eq("user_id", referral.referrer_id)
                  .maybeSingle();
                
                const { data: referredProfile } = await supabaseAdmin
                  .from("profiles")
                  .select("*")
                  .eq("user_id", referral.referred_id)
                  .maybeSingle();
                
                // Calculate comprehensive fraud score
                const { score: fraudScore, reasons: fraudReasons } = await calculateFraudScore(
                  referral, 
                  referrerProfile, 
                  referredProfile
                );
                
                // Get fraud thresholds
                const thresholds = await getFraudThresholds();
                
                // Check if past hold period (30 days standard, 45 days for high fraud score)
                const standardHoldPassed = eligibleAt && now >= eligibleAt;
                const extendedHoldRequired = fraudScore >= thresholds.extendedHoldMin && fraudScore < thresholds.autoRejectMin;
                const extendedHoldDate = eligibleAt ? new Date(eligibleAt.getTime() + (thresholds.extendedHoldDays - 30) * 24 * 60 * 60 * 1000) : null;
                const extendedHoldPassed = extendedHoldDate ? now >= extendedHoldDate : true;
                
                // Determine if we should process based on fraud score
                const shouldAutoReject = fraudScore >= thresholds.autoRejectMin;
                const needsManualReview = fraudScore >= thresholds.manualReviewMin && fraudScore < thresholds.autoRejectMin;
                const holdPassed = extendedHoldRequired ? (standardHoldPassed && extendedHoldPassed) : standardHoldPassed;
                
                if (shouldAutoReject) {
                  // Auto-reject high fraud score referrals
                  await supabaseAdmin
                    .from("referrals")
                    .update({
                      status: "rejected",
                      rejection_reason: `Fraud score too high (${fraudScore}): ${fraudReasons.join(", ")}`,
                      fraud_score: fraudScore,
                      updated_at: now.toISOString(),
                    })
                    .eq("id", referral.id);
                  console.warn("[stripe-webhook] Referral auto-rejected due to high fraud score", { 
                    referral_id: referral.id, 
                    fraud_score: fraudScore,
                    reasons: fraudReasons,
                  });
                } else if (needsManualReview && !referral.fraud_reviewed) {
                  // Flag for manual review
                  await supabaseAdmin
                    .from("referrals")
                    .update({
                      fraud_score: fraudScore,
                      updated_at: now.toISOString(),
                    })
                    .eq("id", referral.id);
                  console.info("[stripe-webhook] Referral flagged for manual review", { 
                    referral_id: referral.id, 
                    fraud_score: fraudScore,
                    reasons: fraudReasons,
                  });
                  // Skip commission processing until manually reviewed
                } else if (holdPassed || referral.fraud_reviewed) {
                  // Process commission - either hold passed or admin approved after review
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
            } catch (refErr) {
              console.error("[stripe-webhook] Referral commission error:", refErr.message);
              trackError({
                error: refErr,
                context: { source: "stripe-webhook", action: "referral_commission" },
                severity: "medium",
                endpoint: "/stripe-webhook",
                method: "POST",
              });
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
              trackError({
                error: clawErr,
                context: { source: "stripe-webhook", action: "clawback" },
                severity: "high",
                endpoint: "/stripe-webhook",
                method: "POST",
              });
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
            trackError({
              error: disputeErr,
              context: { source: "stripe-webhook", action: "dispute_clawback" },
              severity: "high",
              endpoint: "/stripe-webhook",
              method: "POST",
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
        
        // Mark event as successfully processed
        await markStripeEventProcessed(event.id, event.type, { success: true });
      } catch (err) {
        console.error("Stripe webhook processing error:", err.message);
        trackError({
          error: err,
          context: { source: "stripe-webhook", action: "processing" },
          severity: "high",
          endpoint: "/stripe-webhook",
          method: "POST",
        });
        // Mark as processed even on error to prevent infinite retries
        // (Stripe will retry webhooks that return 5xx, so marking prevents duplicate processing)
        await markStripeEventProcessed(event.id, event.type, { success: false, error: err.message });
      }
    });
  }
);

// Configure JSON parsing with raw body capture for webhook signature verification
// Also limit body size for security (prevents DoS attacks with large payloads)
app.use(express.json({ 
  limit: "1mb",
  verify: (req, res, buf) => {
    // Store raw body for webhook signature verification
    req.rawBody = buf.toString("utf8");
  }
}));

const retellClient = axios.create({
  baseURL: "https://api.retellai.com",
  headers: {
    Authorization: `Bearer ${RETELL_API_KEY}`,
    "Content-Type": "application/json",
  },
});

// =============================================================================
// INSTANCE ID - Unique identifier for this server instance
// Used for distributed locking across multiple Railway replicas
// =============================================================================
const INSTANCE_ID = `${process.env.RAILWAY_REPLICA_ID || "local"}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
console.log(`[INSTANCE] Started with ID: ${INSTANCE_ID}`);

// =============================================================================
// DISTRIBUTED LOCKING - Prevents duplicate job execution across instances
// =============================================================================

/**
 * Acquire a distributed lock using Supabase
 * Returns true if lock acquired, false otherwise
 */
const acquireDistributedLock = async (lockName, ttlSeconds = 300) => {
  try {
    const { data, error } = await supabaseAdmin.rpc("acquire_distributed_lock", {
      p_lock_name: lockName,
      p_instance_id: INSTANCE_ID,
      p_ttl_seconds: ttlSeconds,
    });
    
    if (error) {
      // Fallback: try direct insert if function doesn't exist
      if (error.message.includes("does not exist")) {
        const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
        const { error: insertError } = await supabaseAdmin
          .from("distributed_locks")
          .upsert({
            lock_name: lockName,
            instance_id: INSTANCE_ID,
            acquired_at: new Date().toISOString(),
            expires_at: expiresAt,
          }, { 
            onConflict: "lock_name",
            ignoreDuplicates: false 
          });
        
        if (insertError) {
          // Check if another instance has the lock
          const { data: existing } = await supabaseAdmin
            .from("distributed_locks")
            .select("instance_id, expires_at")
            .eq("lock_name", lockName)
            .maybeSingle();
          
          if (existing) {
            const expired = new Date(existing.expires_at) < new Date();
            return expired || existing.instance_id === INSTANCE_ID;
          }
          return false;
        }
        return true;
      }
      console.warn(`[distributed-lock] Error acquiring ${lockName}:`, error.message);
      return false;
    }
    
    return data === true;
  } catch (err) {
    // If table doesn't exist, just proceed (single instance mode)
    if (err.message?.includes("does not exist")) {
      console.warn("[distributed-lock] Tables not set up, running in single-instance mode");
      return true;
    }
    console.warn(`[distributed-lock] Exception acquiring ${lockName}:`, err.message);
    return true; // Fail open for backwards compatibility
  }
};

/**
 * Release a distributed lock
 */
const releaseDistributedLock = async (lockName) => {
  try {
    await supabaseAdmin.rpc("release_distributed_lock", {
      p_lock_name: lockName,
      p_instance_id: INSTANCE_ID,
    });
  } catch (err) {
    // Try direct delete if function doesn't exist
    try {
      await supabaseAdmin
        .from("distributed_locks")
        .delete()
        .eq("lock_name", lockName)
        .eq("instance_id", INSTANCE_ID);
    } catch {
      // Ignore - lock will expire
    }
  }
};

/**
 * Record that a scheduled job ran (for observability)
 */
const recordJobRun = async (jobName, result, errorMessage = null) => {
  try {
    await supabaseAdmin.from("scheduled_job_runs").upsert({
      job_name: jobName,
      last_run_at: new Date().toISOString(),
      last_run_by: INSTANCE_ID,
      last_result: result,
      error_message: errorMessage,
      run_count: 1, // Will be incremented by trigger if exists
    }, { onConflict: "job_name" });
  } catch (err) {
    // Non-critical, just log
    console.warn(`[job-run] Failed to record ${jobName}:`, err.message);
  }
};

// =============================================================================
// DEPLOYMENT LOCKING - Prevents duplicate phone number creation
// =============================================================================

/**
 * Acquire deployment lock for a user
 * Prevents duplicate deploys from Stripe webhook + wizard race conditions
 */
const acquireDeploymentLock = async (userId, requestId, source = "unknown") => {
  try {
    const { data, error } = await supabaseAdmin.rpc("acquire_deployment_lock", {
      p_user_id: userId,
      p_request_id: requestId,
      p_source: source,
      p_ttl_seconds: 120,
    });
    
    if (error) {
      // Fallback to direct check
      if (error.message.includes("does not exist")) {
        return true; // No lock table, proceed
      }
      console.warn(`[deploy-lock] Error for ${userId}:`, error.message);
      return true; // Fail open
    }
    
    return data === true;
  } catch (err) {
    console.warn(`[deploy-lock] Exception for ${userId}:`, err.message);
    return true; // Fail open for backwards compatibility
  }
};

/**
 * Release deployment lock for a user
 */
const releaseDeploymentLock = async (userId, requestId) => {
  try {
    await supabaseAdmin.rpc("release_deployment_lock", {
      p_user_id: userId,
      p_request_id: requestId,
    });
  } catch {
    // Try direct delete
    try {
      await supabaseAdmin
        .from("deployment_locks")
        .delete()
        .eq("user_id", userId)
        .eq("request_id", requestId);
    } catch {
      // Ignore - lock will expire
    }
  }
};

// =============================================================================
// STRIPE EVENT IDEMPOTENCY
// =============================================================================

/**
 * Check if Stripe event was already processed
 */
const isStripeEventProcessed = async (eventId) => {
  try {
    const { data } = await supabaseAdmin
      .from("stripe_processed_events")
      .select("event_id")
      .eq("event_id", eventId)
      .maybeSingle();
    
    return !!data;
  } catch {
    return false; // Fail open - proceed if check fails
  }
};

/**
 * Mark Stripe event as processed
 */
const markStripeEventProcessed = async (eventId, eventType, result = null) => {
  try {
    await supabaseAdmin.from("stripe_processed_events").upsert({
      event_id: eventId,
      event_type: eventType,
      processed_at: new Date().toISOString(),
      result: result,
    }, { onConflict: "event_id" });
  } catch (err) {
    console.warn(`[stripe-idempotency] Failed to mark ${eventId}:`, err.message);
  }
};

const retellSmsClient = axios.create({
  baseURL: "https://api.retellai.com",
  headers: {
    Authorization: `Bearer ${RETELL_API_KEY}`,
    "Content-Type": "application/json",
  },
});

// ==========================================
// RATE LIMITING SYSTEM
// ==========================================
const rateBuckets = new Map();

// Clean up old rate limit buckets periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, bucket] of rateBuckets.entries()) {
    if (now > bucket.resetAt + 60000) { // Remove buckets that expired 1 minute ago
      rateBuckets.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`[rate-limit] Cleaned ${cleaned} expired rate limit buckets`);
  }
}, 5 * 60 * 1000);

// Per-route rate limiter middleware
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
    console.warn(`[rate-limit] ${keyPrefix} limit exceeded for ${req.user?.id || req.ip}`);
    return res.status(429).json({ error: "Too many requests. Please wait before trying again." });
  }
  return next();
};

// Global rate limiter - applies to all requests per IP
// Allows 200 requests per minute per IP (very generous, just prevents abuse)
const globalRateLimitBuckets = new Map();
const globalRateLimit = (req, res, next) => {
  // Skip rate limiting for webhooks (they come from trusted sources)
  if (req.path.includes("/webhook") || req.path.includes("/stripe")) {
    return next();
  }
  
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.ip || "unknown";
  const key = `global:${ip}`;
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  const limit = 200; // 200 requests per minute per IP
  
  const bucket = globalRateLimitBuckets.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }
  bucket.count += 1;
  globalRateLimitBuckets.set(key, bucket);
  
  // Add rate limit headers
  res.set({
    "X-RateLimit-Limit": limit,
    "X-RateLimit-Remaining": Math.max(0, limit - bucket.count),
    "X-RateLimit-Reset": Math.ceil(bucket.resetAt / 1000),
  });
  
  if (bucket.count > limit) {
    console.warn(`[global-rate-limit] IP ${ip} exceeded global rate limit`);
    return res.status(429).json({ error: "Too many requests. Please slow down." });
  }
  return next();
};

// Apply global rate limit to all requests
app.use(globalRateLimit);

// Auth-specific stricter rate limiter for login/signup attempts
// 10 attempts per 5 minutes per IP
const authRateLimitBuckets = new Map();
const authRateLimit = (req, res, next) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0] || req.ip || "unknown";
  const key = `auth:${ip}`;
  const now = Date.now();
  const windowMs = 5 * 60 * 1000; // 5 minutes
  const limit = 10;
  
  const bucket = authRateLimitBuckets.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }
  bucket.count += 1;
  authRateLimitBuckets.set(key, bucket);
  
  if (bucket.count > limit) {
    console.warn(`[auth-rate-limit] IP ${ip} exceeded auth rate limit`);
    return res.status(429).json({ error: "Too many authentication attempts. Please try again in a few minutes." });
  }
  return next();
};

// ==========================================
// INPUT VALIDATION UTILITIES
// ==========================================

// Common validation patterns
const validationPatterns = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  phone: /^\+?[1-9]\d{1,14}$/,
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  url: /^https?:\/\/.+/,
  alphanumeric: /^[a-zA-Z0-9]+$/,
  safeString: /^[a-zA-Z0-9\s\-_.,!?'"()@#$%&*+=/\\:;]+$/,
};

// Sanitize string input - remove dangerous characters
const sanitizeString = (str, maxLength = 1000) => {
  if (typeof str !== "string") return "";
  return str
    .slice(0, maxLength)
    .replace(/[<>]/g, "") // Remove HTML tags
    .trim();
};

// Sanitize phone number (alias for normalizePhoneE164 defined earlier)
const sanitizePhone = normalizePhoneE164;

// Validate email format
const isValidEmail = (email) => {
  return typeof email === "string" && validationPatterns.email.test(email);
};

// Validate UUID format
const isValidUuid = (uuid) => {
  return typeof uuid === "string" && validationPatterns.uuid.test(uuid);
};

// Validate and sanitize URL
const sanitizeUrl = (url) => {
  if (typeof url !== "string") return null;
  const trimmed = url.trim().slice(0, 2000);
  return validationPatterns.url.test(trimmed) ? trimmed : null;
};

// Input validation middleware factory
const validateBody = (schema) => (req, res, next) => {
  const errors = [];
  const body = req.body || {};
  
  for (const [field, rules] of Object.entries(schema)) {
    const value = body[field];
    
    if (rules.required && (value === undefined || value === null || value === "")) {
      errors.push(`${field} is required`);
      continue;
    }
    
    if (value === undefined || value === null) continue;
    
    if (rules.type === "string" && typeof value !== "string") {
      errors.push(`${field} must be a string`);
    } else if (rules.type === "number" && typeof value !== "number") {
      errors.push(`${field} must be a number`);
    } else if (rules.type === "boolean" && typeof value !== "boolean") {
      errors.push(`${field} must be a boolean`);
    } else if (rules.type === "array" && !Array.isArray(value)) {
      errors.push(`${field} must be an array`);
    }
    
    if (typeof value === "string") {
      if (rules.minLength && value.length < rules.minLength) {
        errors.push(`${field} must be at least ${rules.minLength} characters`);
      }
      if (rules.maxLength && value.length > rules.maxLength) {
        errors.push(`${field} must be at most ${rules.maxLength} characters`);
      }
      if (rules.pattern && !rules.pattern.test(value)) {
        errors.push(`${field} has invalid format`);
      }
      if (rules.email && !isValidEmail(value)) {
        errors.push(`${field} must be a valid email`);
      }
      if (rules.uuid && !isValidUuid(value)) {
        errors.push(`${field} must be a valid UUID`);
      }
    }
    
    if (typeof value === "number") {
      if (rules.min !== undefined && value < rules.min) {
        errors.push(`${field} must be at least ${rules.min}`);
      }
      if (rules.max !== undefined && value > rules.max) {
        errors.push(`${field} must be at most ${rules.max}`);
      }
    }
    
    if (Array.isArray(value) && rules.maxItems && value.length > rules.maxItems) {
      errors.push(`${field} must have at most ${rules.maxItems} items`);
    }
    
    if (rules.enum && !rules.enum.includes(value)) {
      errors.push(`${field} must be one of: ${rules.enum.join(", ")}`);
    }
  }
  
  if (errors.length > 0) {
    return res.status(400).json({ error: errors.join(". ") });
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
    return { call_minutes: 800, sms_count: 3000, grace_seconds: 600 };
  }
  if (plan.includes("pro")) {
    return { call_minutes: 300, sms_count: 1000, grace_seconds: 600 };
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
  core: {
    priceId: STRIPE_PRICE_ID_CORE,
    minutesCap: 150,
    smsCap: 250,
  },
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
  // Include grace_seconds in total for accurate remaining calculation
  const graceSeconds = usage.grace_seconds ?? 600; // Default 10 minutes grace
  const total =
    (usage.call_cap_seconds || 0) +
    (usage.call_credit_seconds || 0) +
    (usage.rollover_seconds || 0) +
    graceSeconds; // Users can use up to cap + credits + rollover + grace
  const remaining = Math.max(0, total - (usage.call_used_seconds || 0));
  return { total, remaining, graceSeconds };
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
  // Use UTC-aware dates to match Supabase timestamp storage
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - now.getUTCDay())).toISOString();
  
  // Parallel queries for efficiency - includes usage_calls as backup source
  const [
    allLeadsResult,
    todayLeadsResult,
    weekLeadsResult,
    bookedLeadsResult,
    lastLeadResult,
    avgDurationResult,
    todayApptsResult,
    weekApptsResult,
    allApptsResult,
    // BACKUP: usage_calls for call count (in case leads creation failed)
    usageCallsAllResult,
    usageCallsTodayResult,
    usageCallsWeekResult,
    lastUsageCallResult,
    // BACKUP: usage_limits for duration/minutes
    usageLimitsResult
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
    
    // Average call duration from leads
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
      .eq("user_id", userId),
    
    // BACKUP: All time usage_calls count (tracks calls even if lead creation failed)
    supabaseAdmin
      .from("usage_calls")
      .select("id, seconds", { count: "exact", head: false })
      .eq("user_id", userId),
    
    // BACKUP: Today's usage_calls
    supabaseAdmin
      .from("usage_calls")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", todayStart),
    
    // BACKUP: This week's usage_calls
    supabaseAdmin
      .from("usage_calls")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", weekStart),
    
    // BACKUP: Most recent usage_call for "last call" fallback
    supabaseAdmin
      .from("usage_calls")
      .select("created_at, seconds")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    
    // BACKUP: usage_limits for total seconds and duration
    supabaseAdmin
      .from("usage_limits")
      .select("call_used_seconds, sms_used")
      .eq("user_id", userId)
      .maybeSingle()
  ]);
  
  // Calculate stats - use usage_calls as the SOURCE OF TRUTH for call counts
  // Leads are a DIFFERENT concept (potential customers extracted from calls)
  // Not every call creates a lead, so we track calls separately
  const usageCallsAllTime = usageCallsAllResult.count || 0;
  const callsAllTime = usageCallsAllTime;
  
  const usageCallsToday = usageCallsTodayResult.count || 0;
  const callsToday = usageCallsToday;
  
  const usageCallsThisWeek = usageCallsWeekResult.count || 0;
  const callsThisWeek = usageCallsThisWeek;
  
  // Keep leads count separate for reference
  const leadsAllTime = allLeadsResult.count || 0;
  const leadsToday = todayLeadsResult.count || 0;
  const leadsThisWeek = weekLeadsResult.count || 0;
  const bookedCount = bookedLeadsResult.count || 0;
  
  // Booking rate
  const bookingRatePercent = callsAllTime > 0 
    ? Math.round((bookedCount / callsAllTime) * 100) 
    : 0;
  
  // Average call duration - try leads first, then usage_calls, then usage_limits
  const leadDurations = (avgDurationResult.data || [])
    .map(r => r.call_duration_seconds)
    .filter(d => d && d > 0);
  const usageCallDurations = (usageCallsAllResult.data || [])
    .map(r => r.seconds)
    .filter(d => d && d > 0);
  
  let avgCallDurationSeconds = 0;
  if (leadDurations.length > 0) {
    avgCallDurationSeconds = Math.round(leadDurations.reduce((a, b) => a + b, 0) / leadDurations.length);
  } else if (usageCallDurations.length > 0) {
    avgCallDurationSeconds = Math.round(usageCallDurations.reduce((a, b) => a + b, 0) / usageCallDurations.length);
  } else if (usageLimitsResult.data?.call_used_seconds > 0 && callsAllTime > 0) {
    // Fallback: calculate avg from total usage
    avgCallDurationSeconds = Math.round(usageLimitsResult.data.call_used_seconds / callsAllTime);
  }
  
  // Last call info - try leads first, then usage_calls as backup
  const lastLead = lastLeadResult.data;
  const lastUsageCall = lastUsageCallResult.data;
  let lastCallAt = lastLead?.created_at || null;
  let lastCallName = lastLead?.name || null;
  let lastCallSummary = lastLead?.summary || null;
  
  // If no lead but we have usage_call, use that timestamp
  if (!lastCallAt && lastUsageCall?.created_at) {
    lastCallAt = lastUsageCall.created_at;
    lastCallName = null; // No name in usage_calls
    lastCallSummary = `Call duration: ${Math.round((lastUsageCall.seconds || 0) / 60)} min`;
  }
  
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
    // CALLS = actual phone calls received (from usage_calls table)
    calls_today: callsToday,
    calls_this_week: callsThisWeek,
    calls_all_time: callsAllTime,
    // LEADS = potential customers extracted from calls (separate metric)
    leads_today: leadsToday,
    leads_this_week: leadsThisWeek,
    leads_all_time: leadsAllTime,
    // Other metrics
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
    
    // SECURITY: Query param tokens removed for security (tokens in URLs can be logged and leaked)
    // All API requests should use Authorization: Bearer <token> header
    const token = bearerToken;

    if (!token) {
      return res.status(401).json({ error: "Missing auth token. Use Authorization: Bearer <token> header." });
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data || !data.user) {
      console.warn("[requireAuth] Token validation failed:", {
        hasError: !!error,
        errorMessage: error?.message,
        errorStatus: error?.status,
        hasData: !!data,
        hasUser: !!data?.user,
        tokenPreview: token ? `${token.substring(0, 20)}...` : "none",
      });
      return res.status(401).json({ error: "Invalid auth token" });
    }

    // Session security: check if token is revoked
    const tokenHash = hashToken(token);
    if (tokenHash) {
      const revoked = await isSessionRevoked(tokenHash);
      if (revoked) {
        return res.status(401).json({ error: "Session has been revoked. Please log in again." });
      }
      
      // Track session activity (async, don't block request)
      trackSession(data.user.id, tokenHash, req).catch((err) => {
        console.warn("[auth] session tracking failed", { userId: data.user.id, error: err.message });
      });
    }

    req.user = data.user;
    req.tokenHash = tokenHash; // Store for potential revocation
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

// Token refresh: refresh Cal.com OAuth token if expired or expiring soon
const refreshCalcomToken = async (userId, refreshToken) => {
  if (!refreshToken || !CALCOM_CLIENT_ID || !CALCOM_CLIENT_SECRET) {
    console.warn("[calcom] Cannot refresh token - missing credentials");
    return null;
  }
  try {
    const response = await axios.post("https://api.cal.com/v2/auth/oauth2/token", {
      client_id: CALCOM_CLIENT_ID,
      client_secret: CALCOM_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }, {
      headers: { "Content-Type": "application/json" },
    });
    const newAccessToken = response.data?.access_token;
    const newRefreshToken = response.data?.refresh_token || refreshToken;
    const expiresIn = response.data?.expires_in || 2592000; // default 30 days
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    if (!newAccessToken) {
      console.error("[calcom] Token refresh returned no access_token");
      return null;
    }

    // Update stored tokens
    await supabaseAdmin
      .from("integrations")
      .update({
        access_token: encryptCalcomToken(newAccessToken),
        refresh_token: encryptCalcomToken(newRefreshToken),
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("provider", "calcom");

    console.log("[calcom] Token refreshed for user", userId);
    return newAccessToken;
  } catch (err) {
    console.error("[calcom] Token refresh failed:", err.response?.data || err.message);
    return null;
  }
};

const getCalIntegration = async (userId) => {
  const { data } = await supabaseAdmin
    .from("integrations")
    .select("access_token, refresh_token, expires_at, is_active")
    .eq("user_id", userId)
    .eq("provider", "calcom")
    .maybeSingle();
  if (!data?.is_active || !data?.access_token) return null;

  let accessToken = decryptCalcomToken(data.access_token);
  const refreshToken = decryptCalcomToken(data.refresh_token);

  // Check if token is expired or expiring within 5 minutes
  const expiresAt = data.expires_at ? new Date(data.expires_at) : null;
  const isExpiringSoon = expiresAt && (expiresAt.getTime() - Date.now() < 5 * 60 * 1000);

  if (isExpiringSoon && refreshToken) {
    console.log("[calcom] Token expiring soon, refreshing...");
    const newToken = await refreshCalcomToken(userId, refreshToken);
    if (newToken) {
      accessToken = newToken;
    }
  }

  return {
    ...data,
    access_token: accessToken,
    refresh_token: refreshToken,
    user_id: userId,
  };
};

// Retry wrapper for Cal.com API calls with auto-refresh on 401
const calApiWithRetry = async (userId, apiCall, maxRetries = 2) => {
  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (err) {
      lastError = err;
      const status = err.response?.status;

      // If 401 Unauthorized, try to refresh token and retry
      if (status === 401 && attempt < maxRetries) {
        console.log("[calcom] Got 401, attempting token refresh...");
        const integration = await supabaseAdmin
          .from("integrations")
          .select("refresh_token")
          .eq("user_id", userId)
          .eq("provider", "calcom")
          .maybeSingle();
        const refreshToken = integration.data?.refresh_token
          ? decryptCalcomToken(integration.data.refresh_token)
          : null;
        if (refreshToken) {
          const newToken = await refreshCalcomToken(userId, refreshToken);
          if (newToken) {
            // Update the config for retry - caller should re-fetch
            continue;
          }
        }
      }

      // If 429 rate limit, wait and retry
      if (status === 429 && attempt < maxRetries) {
        const retryAfter = parseInt(err.response?.headers?.["retry-after"] || "2", 10);
        console.log(`[calcom] Rate limited, waiting ${retryAfter}s...`);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }

      // If 5xx server error, brief retry
      if (status >= 500 && attempt < maxRetries) {
        console.log(`[calcom] Server error ${status}, retrying in 1s...`);
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }

      // Non-retryable error
      throw err;
    }
  }
  throw lastError;
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

const fetchCalSlots = async ({ config, userId, start, end, durationMinutes }) => {
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

  // Use retry wrapper with auto-refresh
  return calApiWithRetry(userId, async () => {
    // Re-fetch token in case it was refreshed
    const freshConfig = await getCalConfig(userId);
    const token = freshConfig?.cal_access_token || config.cal_access_token || config.cal_api_key;
    
    const response = await calClient.get("/slots", {
      params,
      headers: {
        Authorization: `Bearer ${token}`,
        "cal-api-version": CAL_API_VERSION_SLOTS,
      },
    });
    return response.data?.data || {};
  });
};

const createCalBooking = async ({ config, userId, start, args }) => {
  const customerPhone = normalizePhoneE164(args.customer_phone || args.phone);
  const body = {
    start: start.toISOString(),
    attendee: {
      name: args.customer_name || args.name || "Customer",
      email: args.customer_email || args.email || "unknown@kryonex.local",
      timeZone: args.time_zone || config.cal_time_zone || "UTC",
      phoneNumber: customerPhone,
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

  // Use retry wrapper with auto-refresh
  return calApiWithRetry(userId, async () => {
    // Re-fetch token in case it was refreshed
    const freshConfig = await getCalConfig(userId);
    const token = freshConfig?.cal_access_token || config.cal_access_token || config.cal_api_key;

    const response = await calClient.post("/bookings", body, {
      headers: {
        Authorization: `Bearer ${token}`,
        "cal-api-version": CAL_API_VERSION_BOOKINGS,
        "Content-Type": "application/json",
      },
    });
    return response.data?.data || response.data;
  });
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
        userId,
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
    console.log("[book_appointment] CALLED by agent:", agentId, "for user:", userId, "args:", JSON.stringify(args).slice(0, 500));
    const { start, end } = resolveToolAppointmentWindow(args);
    if (!start || !end) {
      console.warn("[book_appointment] Missing start time, args:", JSON.stringify(args).slice(0, 300));
      return { ok: false, error: "Missing start time" };
    }
    console.log("[book_appointment] Resolved window:", { start: start.toISOString(), end: end.toISOString() });
    const calConfig = await getCalConfig(userId);
    console.log("[book_appointment] Cal config found:", Boolean(calConfig), calConfig ? { hasToken: Boolean(calConfig.cal_access_token), eventTypeId: calConfig.cal_event_type_id } : "null");
    if (calConfig) {
      const booking = await createCalBooking({ config: calConfig, userId, start, args });
      console.log("[book_appointment] Cal.com booking result:", booking ? { uid: booking.uid || booking.id, start: booking.start } : "null");
      
      // Also insert into appointments table so it appears in calendar UI
      const normalizedCustomerPhone = normalizePhoneE164(args.customer_phone || booking?.attendee?.phoneNumber);
      const calBookingUid = booking?.uid || booking?.id || null;
      
      // Use upsert on cal_booking_uid to prevent duplicates if webhook arrives first
      const appointmentPayload = {
        user_id: userId,
        customer_name: args.customer_name || booking?.attendee?.name || "Customer",
        customer_phone: normalizedCustomerPhone,
        customer_email: args.customer_email || args.email || booking?.attendee?.email || null,
        start_time: booking?.start || start.toISOString(),
        end_time: booking?.end || end.toISOString(),
        location: args.service_address || args.location || null,
        notes: args.service_issue || args.notes || `Booked via Cal.com`,
        status: "scheduled",
        cal_booking_uid: calBookingUid,
      };
      
      let appointmentData, appointmentError;
      if (calBookingUid) {
        // Check if webhook already created this appointment
        const { data: existing } = await supabaseAdmin
          .from("appointments")
          .select("id")
          .eq("cal_booking_uid", calBookingUid)
          .maybeSingle();
        if (existing) {
          // Webhook beat us; just use the existing record
          appointmentData = existing;
          appointmentError = null;
        } else {
          const result = await supabaseAdmin
            .from("appointments")
            .insert(appointmentPayload)
            .select("*")
            .single();
          appointmentData = result.data;
          appointmentError = result.error;
        }
      } else {
        const result = await supabaseAdmin
          .from("appointments")
          .insert(appointmentPayload)
          .select("*")
          .single();
        appointmentData = result.data;
        appointmentError = result.error;
      }
      
      if (appointmentError) {
        console.error("[book_appointment] Cal.com booking succeeded but DB insert FAILED:", {
          userId,
          booking_uid: booking?.uid,
          error: appointmentError.message,
          code: appointmentError.code,
          details: appointmentError.details,
        });
      } else {
        console.log("[book_appointment] Cal.com + DB insert SUCCESS, appointment_id:", appointmentData?.id, "booking_uid:", booking?.uid || booking?.id);
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
      
      // Send appointment_booked webhook (Cal.com)
      sendOutboundWebhook(userId, "appointment_booked", {
        appointment_id: appointmentData?.id || null,
        cal_booking_uid: booking?.uid || booking?.id || null,
        user_id: userId,
        customer_name: args.customer_name || booking?.attendee?.name || "Customer",
        customer_phone: normalizedCustomerPhone,
        start_time: booking?.start || start.toISOString(),
        end_time: booking?.end || end.toISOString(),
        location: args.service_address || args.location || null,
        notes: args.service_issue || args.notes || null,
        source: "cal.com",
        created_at: new Date().toISOString(),
      }).catch(err => {
        console.error("[webhook] appointment_booked (cal.com) error:", err.message);
        trackError({ error: err, context: { source: "cal.com", action: "appointment_booked" }, severity: "medium" });
      });
      
      return { ok: true, source: "cal.com", booking, appointment: appointmentData };
    }
    console.log("[book_appointment] No Cal.com config, using INTERNAL booking for user:", userId);
    const internalCustomerPhone = normalizePhoneE164(args.customer_phone);
    const insertPayload = {
      user_id: userId,
      customer_name: args.customer_name || "Customer",
      customer_phone: internalCustomerPhone,
      customer_email: args.customer_email || args.email || null,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      location: args.service_address || args.location || null,
      notes: args.service_issue || args.notes || null,
      status: "booked",
    };
    console.log("[book_appointment] Inserting into appointments:", JSON.stringify(insertPayload).slice(0, 500));
    const { data, error } = await supabaseAdmin
      .from("appointments")
      .insert(insertPayload)
      .select("*")
      .single();
    if (error) {
      console.error("[book_appointment] INTERNAL INSERT FAILED:", error.message, error.code, error.details);
      return { ok: false, error: error.message };
    }
    console.log("[book_appointment] INTERNAL INSERT SUCCESS, id:", data?.id);
    await logEvent({
      userId,
      actionType: "APPOINTMENT_BOOKED",
      metaData: {
        appointment_id: data?.id || null,
        start: data?.start_time || start.toISOString(),
        source: "internal",
      },
    });
    
    // Send appointment_booked webhook (internal booking)
    sendOutboundWebhook(userId, "appointment_booked", {
      appointment_id: data?.id || null,
      user_id: userId,
      customer_name: args.customer_name || "Customer",
      customer_phone: internalCustomerPhone,
      customer_email: args.customer_email || args.email || null,
      start_time: data?.start_time || start.toISOString(),
      end_time: data?.end_time || end.toISOString(),
      location: args.service_address || args.location || null,
      notes: args.service_issue || args.notes || null,
      source: "internal",
      created_at: new Date().toISOString(),
    }).catch(err => {
      console.error("[webhook] appointment_booked (internal) error:", err.message);
      trackError({ error: err, context: { source: "internal", action: "appointment_booked" }, severity: "medium" });
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

  if (toolName === "after_hours_check") {
    // Get business hours config from profile
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("business_hours, business_timezone, emergency_24_7")
      .eq("user_id", userId)
      .maybeSingle();

    const isEmergency = args.is_emergency === true || args.emergency === true;
    const emergency24_7 = profile?.emergency_24_7 === true;

    // If emergency mode is on and this is emergency, always open
    if (isEmergency && emergency24_7) {
      return {
        ok: true,
        is_open: true,
        reason: "24/7 emergency service available",
        emergency_mode: true,
      };
    }

    const timezone = profile?.business_timezone || "America/Chicago";
    const hours = profile?.business_hours || {};

    // Get current time in business timezone
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const weekday = parts.find((p) => p.type === "weekday")?.value?.toLowerCase() || "monday";
    const hourStr = parts.find((p) => p.type === "hour")?.value || "12";
    const minuteStr = parts.find((p) => p.type === "minute")?.value || "00";
    const currentTime = `${hourStr}:${minuteStr}`;

    const dayHours = hours[weekday] || {};
    const isClosed = dayHours.closed === true;
    const openTime = dayHours.open || null;
    const closeTime = dayHours.close || null;

    if (isClosed || !openTime || !closeTime) {
      return {
        ok: true,
        is_open: false,
        reason: `Closed on ${weekday.charAt(0).toUpperCase() + weekday.slice(1)}`,
        current_time: currentTime,
        timezone,
        emergency_available: emergency24_7,
      };
    }

    // Compare times (simple string comparison works for HH:MM format)
    const isOpen = currentTime >= openTime && currentTime < closeTime;

    return {
      ok: true,
      is_open: isOpen,
      reason: isOpen
        ? `Open now (${openTime} - ${closeTime})`
        : `Currently closed. Hours: ${openTime} - ${closeTime}`,
      current_time: currentTime,
      timezone,
      hours_today: { open: openTime, close: closeTime },
      emergency_available: emergency24_7,
    };
  }

  if (toolName === "cancel_booking" || toolName === "cancel_appointment") {
    // Find booking by cal_booking_uid, appointment_id, or customer_phone
    const customerPhone = args.customer_phone || args.phone || null;
    const bookingUid = args.cal_booking_uid || args.booking_uid || args.uid || null;
    const appointmentId = args.appointment_id || args.id || null;
    const reason = args.reason || "Cancelled by customer";

    let appointment = null;
    // Priority 1: cal_booking_uid
    if (bookingUid) {
      const { data } = await supabaseAdmin
        .from("appointments")
        .select("*")
        .eq("user_id", userId)
        .eq("cal_booking_uid", bookingUid)
        .maybeSingle();
      appointment = data;
    }
    // Priority 2: appointment_id
    if (!appointment && appointmentId) {
      const { data } = await supabaseAdmin
        .from("appointments")
        .select("*")
        .eq("user_id", userId)
        .eq("id", appointmentId)
        .maybeSingle();
      appointment = data;
    }
    // Priority 3: customer_phone (most recent upcoming)
    if (!appointment && customerPhone) {
      const { data } = await supabaseAdmin
        .from("appointments")
        .select("*")
        .eq("user_id", userId)
        .eq("customer_phone", customerPhone)
        .in("status", ["booked", "confirmed", "rescheduled"])
        .gte("start_time", new Date().toISOString())
        .order("start_time", { ascending: true })
        .limit(1)
        .maybeSingle();
      appointment = data;
    }

    if (!appointment) {
      return { ok: false, source: "internal", error: "No appointment found matching the provided identifiers" };
    }

    // Idempotency: already cancelled
    if (appointment.status === "cancelled") {
      return {
        ok: true,
        source: appointment.cal_booking_uid ? "cal.com" : "internal",
        status: "already_cancelled",
        appointment_id: appointment.id,
        customer_name: appointment.customer_name,
        original_time: appointment.start_time,
      };
    }

    // Cancel in Cal.com if linked
    let calCancelled = false;
    if (appointment.cal_booking_uid) {
      try {
        const calConfig = await getCalConfig(userId);
        if (calConfig?.cal_access_token) {
          await calApiWithRetry(userId, async () => {
            const freshConfig = await getCalConfig(userId);
            const token = freshConfig?.cal_access_token || calConfig.cal_access_token;
            await calClient.post(`/bookings/${appointment.cal_booking_uid}/cancel`, {
              cancellationReason: reason,
            }, {
              headers: {
                Authorization: `Bearer ${token}`,
                "cal-api-version": CAL_API_VERSION_BOOKINGS,
              },
            });
          });
          calCancelled = true;
        }
      } catch (calErr) {
        console.warn("[cancel_appointment] Cal.com cancel failed:", calErr.message);
        // Continue with local cancellation
      }
    }

    // Update local
    await supabaseAdmin
      .from("appointments")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("id", appointment.id);

    await logEvent({
      userId,
      actionType: "APPOINTMENT_CANCELLED",
      metaData: { appointment_id: appointment.id, reason, cal_synced: calCancelled },
    });

    return {
      ok: true,
      source: calCancelled ? "cal.com" : "internal",
      status: "cancelled",
      appointment_id: appointment.id,
      customer_name: appointment.customer_name,
      original_time: appointment.start_time,
      appointment: { id: appointment.id, status: "cancelled" },
    };
  }

  if (toolName === "reschedule_booking" || toolName === "reschedule_appointment") {
    const customerPhone = args.customer_phone || args.phone || null;
    const bookingUid = args.cal_booking_uid || args.booking_uid || args.uid || null;
    const appointmentId = args.appointment_id || args.id || null;
    const newStartIso = args.new_start_time_iso || args.new_start || null;
    const newDate = args.new_start_date || args.new_date || null;
    const newTime = args.new_start_time || args.new_time || null;
    const reason = args.reason || null;

    // Parse new time
    let newStart;
    if (newStartIso) {
      newStart = new Date(newStartIso);
    } else if (newDate && newTime) {
      newStart = new Date(`${newDate}T${newTime}`);
    }
    if (!newStart || isNaN(newStart.getTime())) {
      return { ok: false, source: "internal", error: "Valid new time required (new_start_time_iso or new_start_date + new_start_time)" };
    }

    // Validate time is in future (allow 5 min grace)
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (newStart < fiveMinAgo) {
      return { ok: false, source: "internal", error: "New appointment time must be in the future" };
    }

    // Find appointment - Priority: cal_booking_uid > appointment_id > customer_phone
    let appointment = null;
    if (bookingUid) {
      const { data } = await supabaseAdmin
        .from("appointments")
        .select("*")
        .eq("user_id", userId)
        .eq("cal_booking_uid", bookingUid)
        .maybeSingle();
      appointment = data;
    }
    if (!appointment && appointmentId) {
      const { data } = await supabaseAdmin
        .from("appointments")
        .select("*")
        .eq("user_id", userId)
        .eq("id", appointmentId)
        .maybeSingle();
      appointment = data;
    }
    if (!appointment && customerPhone) {
      const { data } = await supabaseAdmin
        .from("appointments")
        .select("*")
        .eq("user_id", userId)
        .eq("customer_phone", customerPhone)
        .in("status", ["booked", "confirmed", "rescheduled"])
        .gte("start_time", new Date().toISOString())
        .order("start_time", { ascending: true })
        .limit(1)
        .maybeSingle();
      appointment = data;
    }

    if (!appointment) {
      return { ok: false, source: "internal", error: "No appointment found matching the provided identifiers" };
    }

    // Cannot reschedule cancelled appointments
    if (appointment.status === "cancelled") {
      return { ok: false, source: "internal", error: "Cannot reschedule a cancelled appointment" };
    }

    const durationMs = (args.duration_minutes || 60) * 60 * 1000;
    const newEnd = new Date(newStart.getTime() + durationMs);

    // Idempotency: same time = no change
    const existingStart = new Date(appointment.start_time);
    if (Math.abs(existingStart.getTime() - newStart.getTime()) < 60000) {
      return {
        ok: true,
        source: appointment.cal_booking_uid ? "cal.com" : "internal",
        status: "no_change",
        appointment_id: appointment.id,
        customer_name: appointment.customer_name,
        start_time: appointment.start_time,
      };
    }

    // Reschedule in Cal.com if linked
    let calRescheduled = false;
    let newCalUid = appointment.cal_booking_uid;
    if (appointment.cal_booking_uid) {
      try {
        const calConfig = await getCalConfig(userId);
        if (calConfig?.cal_access_token) {
          const calResult = await calApiWithRetry(userId, async () => {
            const freshConfig = await getCalConfig(userId);
            const token = freshConfig?.cal_access_token || calConfig.cal_access_token;
            const response = await calClient.post(
              `/bookings/${appointment.cal_booking_uid}/reschedule`,
              {
                start: newStart.toISOString(),
                ...(reason && { rescheduleReason: reason }),
              },
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                  "cal-api-version": CAL_API_VERSION_BOOKINGS,
                  "Content-Type": "application/json",
                },
              }
            );
            return response.data?.data || response.data;
          });
          calRescheduled = true;
          newCalUid = calResult?.uid || calResult?.id || appointment.cal_booking_uid;
        }
      } catch (calErr) {
        console.warn("[reschedule_appointment] Cal.com reschedule failed:", calErr.message);
        // Continue with local reschedule
      }
    }

    // Update local - keep status as "booked" per spec (or "rescheduled" for tracking)
    const { data: updatedAppointment } = await supabaseAdmin
      .from("appointments")
      .update({
        start_time: newStart.toISOString(),
        end_time: newEnd.toISOString(),
        cal_booking_uid: newCalUid,
        status: "booked",
        updated_at: new Date().toISOString(),
      })
      .eq("id", appointment.id)
      .select("*")
      .single();

    await logEvent({
      userId,
      actionType: "APPOINTMENT_RESCHEDULED",
      metaData: {
        appointment_id: appointment.id,
        old_time: appointment.start_time,
        new_time: newStart.toISOString(),
        cal_synced: calRescheduled,
        reason,
      },
    });

    return {
      ok: true,
      source: calRescheduled ? "cal.com" : "internal",
      status: "rescheduled",
      appointment_id: appointment.id,
      customer_name: appointment.customer_name,
      old_time: appointment.start_time,
      new_start: newStart.toISOString(),
      new_end: newEnd.toISOString(),
      booking: calRescheduled ? { uid: newCalUid } : undefined,
      appointment: updatedAppointment,
    };
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

const getCalcomAuthorizeUrl = (userId) => {
  if (!CALCOM_CLIENT_ID) {
    throw new Error("Missing CALCOM_CLIENT_ID");
  }
  const state = signCalcomState({
    userId,
    ts: Date.now(),
  });
  const params = new URLSearchParams({
    client_id: CALCOM_CLIENT_ID,
    redirect_uri: calcomRedirectUri,
    response_type: "code",
    state,
  });
  return `https://app.cal.com/auth/oauth2/authorize?${params.toString()}`;
};

// Debug endpoint to check Cal.com configuration
app.get("/api/calcom/debug", requireAuth, async (req, res) => {
  const uid = req.user.id;
  const { data: integration } = await supabaseAdmin
    .from("integrations")
    .select("is_active, booking_url, cal_username, cal_user_id, updated_at")
    .eq("user_id", uid)
    .eq("provider", "calcom")
    .maybeSingle();
  
  return res.json({
    configured: Boolean(CALCOM_CLIENT_ID && CALCOM_CLIENT_SECRET && CALCOM_ENCRYPTION_KEY),
    redirectUri: calcomRedirectUri,
    hasIntegration: !!integration,
    integration: integration ? {
      is_active: integration.is_active,
      booking_url: integration.booking_url,
      cal_username: integration.cal_username,
      cal_user_id: integration.cal_user_id,
      updated_at: integration.updated_at,
    } : null,
  });
});

app.get("/api/calcom/authorize", requireAuth, (req, res) => {
  try {
    const url = getCalcomAuthorizeUrl(req.user.id);
    return res.redirect(url);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/calcom/authorize-url", requireAuth, (req, res) => {
  try {
    const url = getCalcomAuthorizeUrl(req.user.id);
    return res.json({ url });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/calcom/callback", async (req, res) => {
  const code = req.query.code;
  const state = req.query.state;
  const error = req.query.error;
  
  console.log("[calcom-callback] Received callback:", { 
    hasCode: !!code, 
    hasState: !!state, 
    error,
    redirectUri: calcomRedirectUri 
  });
  
  if (error) {
    console.error("[calcom-callback] OAuth error from Cal.com:", error);
    return res.redirect(`${FRONTEND_URL}/dashboard?cal_status=error&cal_error=${encodeURIComponent(error)}`);
  }
  if (!code) {
    console.error("[calcom-callback] Missing code");
    return res.redirect(`${FRONTEND_URL}/dashboard?cal_status=error&cal_error=missing_code`);
  }
  if (!CALCOM_CLIENT_ID || !CALCOM_CLIENT_SECRET) {
    console.error("[calcom-callback] Missing Cal.com OAuth credentials");
    return res.redirect(`${FRONTEND_URL}/dashboard?cal_status=error&cal_error=missing_credentials`);
  }
  if (!CALCOM_ENCRYPTION_KEY) {
    console.error("[calcom-callback] Missing CALCOM_ENCRYPTION_KEY");
    return res.redirect(`${FRONTEND_URL}/dashboard?cal_status=error&cal_error=missing_encryption_key`);
  }
  const stateData = verifyCalcomState(state);
  if (!stateData?.userId) {
    console.error("[calcom-callback] Invalid state:", state);
    return res.redirect(`${FRONTEND_URL}/dashboard?cal_status=error&cal_error=invalid_state`);
  }
  
  console.log("[calcom-callback] Valid state for user:", stateData.userId);
  
  try {
    console.log("[calcom-callback] Attempting token exchange with redirect_uri:", calcomRedirectUri);
    const tokenResponse = await axios.post(
      "https://api.cal.com/v2/auth/oauth2/token",
      {
        code,
        client_id: CALCOM_CLIENT_ID,
        client_secret: CALCOM_CLIENT_SECRET,
        grant_type: "authorization_code",
        redirect_uri: calcomRedirectUri,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    
    console.log("[calcom-callback] Token exchange successful, response keys:", Object.keys(tokenResponse.data || {}));
    const accessToken = tokenResponse.data?.access_token;
    const refreshToken = tokenResponse.data?.refresh_token;
    if (!accessToken) {
      throw new Error("Missing access token");
    }
    
    // Fetch Cal.com user info for better webhook resolution
    let calUserId = null;
    let calUserEmail = null;
    try {
      const meResponse = await calClient.get("/me", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "cal-api-version": "2024-08-13",
        },
      });
      calUserId = meResponse.data?.data?.id || meResponse.data?.id || null;
      calUserEmail = meResponse.data?.data?.email || meResponse.data?.email || null;
      console.log("[calcom-oauth] Fetched user info:", { calUserId, calUserEmail });
    } catch (meErr) {
      console.warn("[calcom-oauth] Could not fetch /me:", meErr.message);
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

    const upsertData = {
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
      // Store Cal.com user ID for better webhook resolution
      cal_user_id: calUserId ? String(calUserId) : null,
      updated_at: new Date().toISOString(),
    };
    
    const { error: upsertError } = await supabaseAdmin.from("integrations").upsert(
      upsertData,
      { onConflict: "user_id,provider" }
    );
    
    if (upsertError) {
      console.error("[calcom-callback] Upsert failed:", upsertError);
      return res.redirect(`${FRONTEND_URL}/dashboard?cal_status=error&cal_error=db_error`);
    }
    
    console.log("[calcom-callback] Successfully saved integration for user:", stateData.userId, { bookingUrl, calUserId });
    
    // =========================================================================
    // REGISTER WEBHOOK with Cal.com so it sends booking events to our server
    // =========================================================================
    const webhookUrl = `${serverBaseUrl}/webhooks/calcom`;
    try {
      // First, check if we already have a webhook registered for this event type
      if (eventType?.id) {
        // Try event-type-level webhook first (more specific)
        const existingWH = await calClient.get(`/event-types/${eventType.id}/webhooks`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "cal-api-version": "2024-08-13",
          },
        }).catch(() => null);
        
        const existingWebhooks = existingWH?.data?.data || existingWH?.data || [];
        const alreadyRegistered = Array.isArray(existingWebhooks) && existingWebhooks.some(
          (wh) => wh.subscriberUrl === webhookUrl || wh.url === webhookUrl
        );
        
        if (!alreadyRegistered) {
          const whResult = await calClient.post(`/event-types/${eventType.id}/webhooks`, {
            subscriberUrl: webhookUrl,
            triggers: ["BOOKING_CREATED", "BOOKING_RESCHEDULED", "BOOKING_CANCELLED"],
            active: true,
          }, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "cal-api-version": "2024-08-13",
              "Content-Type": "application/json",
            },
          });
          console.log("[calcom-callback] Webhook registered on event type:", eventType.id, whResult.data?.data?.id || whResult.data?.id || "ok");
        } else {
          console.log("[calcom-callback] Webhook already registered for event type:", eventType.id);
        }
      }
    } catch (whErr) {
      // Webhook registration is best-effort; log but don't fail the OAuth flow
      console.warn("[calcom-callback] Webhook registration failed (non-blocking):", whErr.response?.data || whErr.message);
      console.warn("[calcom-callback] Webhook URL attempted:", webhookUrl);
    }
    
    return res.redirect(
      `${FRONTEND_URL}/dashboard?cal_status=success&status=success`
    );
  } catch (err) {
    const errorDetail = err.response?.data 
      ? JSON.stringify(err.response.data) 
      : err.message;
    console.error("[calcom-callback] Error:", errorDetail);
    console.error("[calcom-callback] Status:", err.response?.status);
    console.error("[calcom-callback] redirect_uri used:", calcomRedirectUri);
    return res.redirect(`${FRONTEND_URL}/dashboard?cal_status=error&cal_error=${encodeURIComponent(err.response?.data?.error || err.message)}`);
  }
});

app.get("/api/calcom/status", requireAuth, resolveEffectiveUser, async (req, res) => {
  const uid = req.effectiveUserId ?? req.user.id;
  const [{ data: profile }, { data: integration }] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select("cal_com_url, cal_event_type_slug")
      .eq("user_id", uid)
      .maybeSingle(),
    supabaseAdmin
      .from("integrations")
      .select("is_active, access_token, booking_url, event_type_id, event_type_slug")
      .eq("user_id", uid)
      .eq("provider", "calcom")
      .maybeSingle(),
  ]);
  const hasActiveIntegration = integration?.is_active && integration?.access_token;
  const calUrl = profile?.cal_com_url || integration?.booking_url || null;
  const connected = Boolean(hasActiveIntegration || calUrl);
  const eventType = integration?.event_type_slug || profile?.cal_event_type_slug || null;
  return res.json({
    connected,
    cal_com_url: calUrl,
    event_type_id: integration?.event_type_id || null,
    event_type_slug: eventType,
  });
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

// =============================================================================
// CAL.COM WEBHOOK - Receive booking notifications from Cal.com
// =============================================================================
app.post("/webhooks/calcom", async (req, res) => {
  try {
    const payload = req.body || {};
    const triggerEvent = payload.triggerEvent || payload.event || payload.type;
    const bookingData = payload.payload || payload.data || payload;
    
    console.log("[calcom-webhook] Received:", triggerEvent, JSON.stringify(bookingData, null, 2).slice(0, 500));
    
    // Extract booking details
    const attendee = bookingData.attendees?.[0] || bookingData.attendee || {};
    const customerEmail = attendee.email || bookingData.email || null;
    const customerName = attendee.name || bookingData.name || "Customer";
    const customerPhone = normalizePhoneE164(attendee.phoneNumber || bookingData.phoneNumber || "");
    const startTime = bookingData.startTime || bookingData.start || null;
    const endTime = bookingData.endTime || bookingData.end || null;
    const bookingUid = bookingData.uid || bookingData.id || bookingData.bookingId || null;
    const status = bookingData.status || "confirmed";
    const location = bookingData.location || bookingData.where || null;
    const eventType = bookingData.eventType || {};
    const organizer = bookingData.organizer || eventType.users?.[0] || {};
    
    // Enhanced user resolution with multiple fallback methods
    let userId = null;
    const calUsername = organizer.username || eventType.slug || null;
    const organizerEmail = organizer.email || null;
    const calUserId = organizer.id || bookingData.userId || null;
    
    // Method 1: Try Cal.com user ID if stored
    if (!userId && calUserId) {
      const { data: integration } = await supabaseAdmin
        .from("integrations")
        .select("user_id")
        .eq("provider", "calcom")
        .eq("cal_user_id", String(calUserId))
        .maybeSingle();
      if (integration?.user_id) {
        userId = integration.user_id;
        console.log("[calcom-webhook] Found user by cal_user_id", { calUserId, userId });
      }
    }
    
    // Method 2: Try Cal.com username in integrations
    if (!userId && calUsername) {
      const { data: integration } = await supabaseAdmin
        .from("integrations")
        .select("user_id")
        .eq("provider", "calcom")
        .eq("cal_username", calUsername)
        .maybeSingle();
      if (integration?.user_id) {
        userId = integration.user_id;
        console.log("[calcom-webhook] Found user by cal_username in integrations", { calUsername, userId });
      }
    }
    
    // Method 3: Try Cal.com username in profiles
    if (!userId && calUsername) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("user_id")
        .eq("cal_username", calUsername)
        .maybeSingle();
      if (profile?.user_id) {
        userId = profile.user_id;
        console.log("[calcom-webhook] Found user by cal_username in profiles", { calUsername, userId });
      }
    }
    
    // Method 4: Try organizer email in profiles
    if (!userId && organizerEmail) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("user_id")
        .eq("email", organizerEmail)
        .maybeSingle();
      if (profile?.user_id) {
        userId = profile.user_id;
        console.log("[calcom-webhook] Found user by email in profiles", { organizerEmail, userId });
      }
    }
    
    // Method 5: Try organizer email via auth.users (email match)
    if (!userId && organizerEmail) {
      const { data: users } = await supabaseAdmin.auth.admin.listUsers();
      const matchingUser = users?.users?.find(u => u.email?.toLowerCase() === organizerEmail.toLowerCase());
      if (matchingUser?.id) {
        userId = matchingUser.id;
        console.log("[calcom-webhook] Found user by email in auth.users", { organizerEmail, userId });
      }
    }
    
    // Method 6: Try Cal.com booking URL pattern match
    if (!userId && bookingData.booking?.url) {
      // Extract username from URL like "https://cal.com/username/event"
      const urlMatch = bookingData.booking.url.match(/cal\.com\/([^\/]+)/i);
      if (urlMatch?.[1]) {
        const urlUsername = urlMatch[1];
        const { data: integration } = await supabaseAdmin
          .from("integrations")
          .select("user_id")
          .eq("provider", "calcom")
          .ilike("cal_username", urlUsername)
          .maybeSingle();
        if (integration?.user_id) {
          userId = integration.user_id;
          console.log("[calcom-webhook] Found user by URL pattern", { urlUsername, userId });
        }
      }
    }
    
    if (!userId) {
      console.warn("[calcom-webhook] Could not find user for booking after all fallbacks", { 
        calUsername, 
        organizerEmail, 
        calUserId,
        eventSlug: eventType.slug,
      });
      // Track this for debugging
      trackError({
        error: new Error("Cal.com webhook - user not found"),
        context: { 
          source: "calcom-webhook", 
          calUsername, 
          organizerEmail, 
          calUserId,
          triggerEvent,
        },
        severity: "medium",
        endpoint: "/webhooks/calcom",
        method: "POST",
      });
      // Still return 200 to acknowledge receipt
      return res.json({ ok: true, warning: "User not found" });
    }
    
    // Handle different event types
    if (triggerEvent === "BOOKING_CREATED" || triggerEvent === "booking.created") {
      // Check if appointment already exists (might have been created by AI)
      const { data: existing } = await supabaseAdmin
        .from("appointments")
        .select("id")
        .eq("cal_booking_uid", bookingUid)
        .maybeSingle();
      
      if (existing) {
        console.log("[calcom-webhook] Booking already exists in DB", { bookingUid });
        return res.json({ ok: true, existing: true });
      }
      
      // Create appointment
      const { data: appointment, error: appointmentError } = await supabaseAdmin
        .from("appointments")
        .insert({
          user_id: userId,
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_email: customerEmail,
          start_time: startTime,
          end_time: endTime,
          location: location,
          notes: `Booked via Cal.com: ${eventType.title || "Service Call"}`,
          status: status === "ACCEPTED" || status === "confirmed" ? "scheduled" : "pending",
          cal_booking_uid: bookingUid,
        })
        .select("*")
        .single();
      
      if (appointmentError) {
        console.error("[calcom-webhook] Failed to create appointment", appointmentError.message);
        return res.status(500).json({ error: appointmentError.message });
      }
      
      // Log event
      await logEvent({
        userId,
        actionType: "APPOINTMENT_BOOKED",
        metaData: {
          booking_uid: bookingUid,
          appointment_id: appointment.id,
          source: "cal.com_webhook",
        },
      });
      
      // Send outbound webhook
      sendOutboundWebhook(userId, "appointment_booked", {
        appointment_id: appointment.id,
        cal_booking_uid: bookingUid,
        user_id: userId,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        start_time: startTime,
        end_time: endTime,
        location: location,
        source: "cal.com_webhook",
        created_at: new Date().toISOString(),
      }).catch(err => console.error("[calcom-webhook] outbound webhook error:", err.message));
      
      console.log("[calcom-webhook] Created appointment", { appointmentId: appointment.id, bookingUid });
      return res.json({ ok: true, appointment_id: appointment.id });
    }
    
    if (triggerEvent === "BOOKING_RESCHEDULED" || triggerEvent === "booking.rescheduled") {
      // Update existing appointment
      const { data: updated, error: updateError } = await supabaseAdmin
        .from("appointments")
        .update({
          start_time: startTime,
          end_time: endTime,
          location: location,
          status: "rescheduled",
          updated_at: new Date().toISOString(),
        })
        .eq("cal_booking_uid", bookingUid)
        .select("*")
        .single();
      
      if (updateError) {
        console.error("[calcom-webhook] Failed to update appointment", updateError.message);
        // Try to create if not found
        if (updateError.code === "PGRST116") {
          // No rows returned - appointment doesn't exist, create it
          const { data: newAppt } = await supabaseAdmin
            .from("appointments")
            .insert({
              user_id: userId,
              customer_name: customerName,
              customer_phone: customerPhone,
              customer_email: customerEmail,
              start_time: startTime,
              end_time: endTime,
              location: location,
              notes: `Rescheduled via Cal.com`,
              status: "rescheduled",
              cal_booking_uid: bookingUid,
            })
            .select("*")
            .single();
          
          return res.json({ ok: true, appointment_id: newAppt?.id, action: "created_from_reschedule" });
        }
        return res.status(500).json({ error: updateError.message });
      }
      
      // Send outbound webhook
      sendOutboundWebhook(userId, "appointment_updated", {
        appointment_id: updated.id,
        cal_booking_uid: bookingUid,
        user_id: userId,
        customer_name: customerName,
        start_time: startTime,
        end_time: endTime,
        action: "rescheduled",
        source: "cal.com_webhook",
      }).catch(err => console.error("[calcom-webhook] outbound webhook error:", err.message));
      
      console.log("[calcom-webhook] Updated appointment", { appointmentId: updated.id, bookingUid });
      return res.json({ ok: true, appointment_id: updated.id });
    }
    
    if (triggerEvent === "BOOKING_CANCELLED" || triggerEvent === "booking.cancelled") {
      // Cancel appointment
      const { data: cancelled, error: cancelError } = await supabaseAdmin
        .from("appointments")
        .update({
          status: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("cal_booking_uid", bookingUid)
        .select("*")
        .single();
      
      if (cancelError && cancelError.code !== "PGRST116") {
        console.error("[calcom-webhook] Failed to cancel appointment", cancelError.message);
      }
      
      if (cancelled) {
        sendOutboundWebhook(userId, "appointment_updated", {
          appointment_id: cancelled.id,
          cal_booking_uid: bookingUid,
          user_id: userId,
          action: "cancelled",
          source: "cal.com_webhook",
        }).catch(err => console.error("[calcom-webhook] outbound webhook error:", err.message));
      }
      
      console.log("[calcom-webhook] Cancelled appointment", { bookingUid });
      return res.json({ ok: true, cancelled: true });
    }
    
    // Unknown event type - just acknowledge
    console.log("[calcom-webhook] Unhandled event type:", triggerEvent);
    return res.json({ ok: true, event: triggerEvent, handled: false });
    
  } catch (err) {
    console.error("[calcom-webhook] Error:", err.message);
    trackError({
      error_type: "calcom_webhook_error",
      message: err.message,
      endpoint: "/webhooks/calcom",
    });
    return res.status(500).json({ error: err.message });
  }
});

// Helper: Verify Retell webhook signature (HMAC-SHA256)
// Retell signature format: v=<timestamp>,d=<hmac_hex>
// Uses the Retell API Key (not a separate webhook secret)
// Message = body + timestamp
const verifyRetellSignature = (body, signature, apiKey) => {
  if (!apiKey) {
    // If no API key configured, skip verification (should never happen in prod)
    console.warn("[retell-webhook] RETELL_API_KEY not configured, skipping signature verification");
    return true;
  }
  if (!signature) {
    console.warn("[retell-webhook] No x-retell-signature header found");
    return false;
  }
  
  try {
    // Retell signature format: v=<timestamp>,d=<hmac_hex>
    const match = /v=(\d+),d=(.*)/.exec(signature);
    if (!match) {
      console.error("[retell-webhook] Invalid signature format - expected v=timestamp,d=digest, got:", signature?.substring(0, 50));
      return false;
    }
    
    const timestamp = Number(match[1]);
    const digest = match[2];
    
    // Check timestamp is within 5 minutes to prevent replay attacks
    const FIVE_MINUTES = 5 * 60 * 1000;
    const now = Date.now();
    if (Math.abs(now - timestamp) > FIVE_MINUTES) {
      console.error("[retell-webhook] Signature expired - timestamp:", timestamp, "now:", now, "diff:", Math.abs(now - timestamp));
      return false;
    }
    
    // Compute expected HMAC: sha256(body + timestamp)
    const expectedDigest = crypto
      .createHmac("sha256", apiKey)
      .update(body + timestamp)
      .digest("hex");
    
    const isValid = digest === expectedDigest;
    if (!isValid) {
      console.error("[retell-webhook] Signature mismatch");
    }
    return isValid;
  } catch (err) {
    console.error("[retell-webhook] Signature verification error:", err.message);
    trackError({
      error: err,
      context: { source: "retell-webhook", action: "signature_verification" },
      severity: "high",
      endpoint: "/retell-webhook",
      method: "POST",
    });
    return false;
  }
};

const retellWebhookHandler = async (req, res) => {
  try {
    lastRetellWebhookAt = new Date().toISOString();
    
    // Verify Retell webhook signature for security
    // Retell uses the API key for signature verification, NOT a separate webhook secret
    const signature = req.headers["x-retell-signature"];
    if (RETELL_API_KEY && !verifyRetellSignature(JSON.stringify(req.body), signature, RETELL_API_KEY)) {
      console.error("[retell-webhook] Invalid signature - rejecting request");
      return res.status(401).json({ error: "Invalid webhook signature" });
    }
    
    const payload = req.body || {};
    const eventType =
      payload.event_type || payload.event || payload.type || "unknown";
    const call = payload.call || payload.data || {};

    // COMPREHENSIVE RAW LOGGING - Log EVERY webhook with full details for debugging
    console.log("📞 [RETELL RAW] Event received:", {
      timestamp: new Date().toISOString(),
      event_type: eventType,
      call_id: call.call_id || payload.call_id,
      agent_id: call.agent_id || payload.agent_id,
      from_number: call.from_number || payload.from_number,
      to_number: call.to_number || payload.to_number,
      duration_ms: call.duration_ms || payload.duration_ms,
      duration_seconds: call.duration_seconds || payload.duration_seconds,
      direction: call.direction || payload.direction,
      disconnection_reason: call.disconnection_reason || payload.disconnection_reason,
      call_status: call.call_status || payload.call_status || call.status || payload.status,
      payload_keys: Object.keys(payload),
      call_keys: Object.keys(call),
      raw_payload_preview: JSON.stringify(payload).substring(0, 800),
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

      // PRIMARY: Look up by phone_number, FALLBACK: agent_id
      let agentRow = null;
      if (normalizedToNumber) {
        const { data: phoneRow } = await supabaseAdmin
          .from("agents")
          .select("user_id")
          .eq("phone_number", normalizedToNumber)
          .maybeSingle();
        if (phoneRow?.user_id) agentRow = phoneRow;
      }
      // Fallback: Look up by agent_id if phone lookup failed
      if (!agentRow?.user_id && agentId) {
        const { data: agentIdRow } = await supabaseAdmin
          .from("agents")
          .select("user_id")
          .eq("agent_id", agentId)
          .maybeSingle();
        if (agentIdRow?.user_id) {
          agentRow = agentIdRow;
          console.warn("📞 [call_started] Found user via agent_id fallback");
        }
      }

      // LOG ERROR if we couldn't map the call to a user
      if (!agentRow?.user_id) {
        console.error("📞 [RETELL MAPPING ERROR] Could not find user for call_started:", {
          normalized_to_number: normalizedToNumber,
          raw_to_number: toNumber,
          agent_id: agentId,
          event_type: eventType,
          call_id: callId,
          timestamp: new Date().toISOString(),
        });
        // Return 200 to avoid Retell retries, but call won't be tracked
        return res.status(200).json({ warning: "User not found for phone/agent" });
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

        // Send call_started webhook
        sendOutboundWebhook(agentRow.user_id, "call_started", {
          call_id: callId,
          agent_id: agentId,
          user_id: agentRow.user_id,
          from_number: call.from_number || payload.from_number || null,
          to_number: call.to_number || payload.to_number || null,
          direction: call.direction || payload.direction || "inbound",
          started_at: new Date().toISOString(),
        }).catch(err => {
          console.error("[webhook] call_started error:", err.message);
          trackError({ error: err, context: { source: "retell", action: "call_started" }, severity: "medium" });
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
      let recordingUrl =
        call.recording_url ||
        call.recordingUrl ||
        call.recording?.url ||
        payload.recording_url ||
        payload.recordingUrl ||
        payload.recording?.url ||
        null;
      
      // If no recording_url in payload, fetch it from Retell API
      if (!recordingUrl && callId) {
        try {
          console.log("📞 [call_ended] No recording_url in webhook, fetching from Retell API for call:", callId);
          const callDetailsResponse = await retellClient.get(`/v2/get-call/${callId}`);
          if (callDetailsResponse?.data?.recording_url) {
            recordingUrl = callDetailsResponse.data.recording_url;
            console.log("📞 [call_ended] Fetched recording_url from Retell API:", recordingUrl);
          } else {
            console.log("📞 [call_ended] No recording_url available from Retell API yet");
          }
        } catch (fetchErr) {
          console.warn("📞 [call_ended] Failed to fetch recording from Retell API:", fetchErr.message);
        }
      }
      
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
      
      // Get all phone format variants to try for lookup (handles format mismatches)
      const phoneVariants = getPhoneVariantsForLookup(toNumber);
      const normalizedToNumber = normalizePhoneForLookup(toNumber);

      console.log("📞 [call_ended] parsed values:", {
        agentId,
        callId,
        durationSeconds,
        disposition,
        hasTranscript: transcript.length > 0,
        toNumber: normalizedToNumber,
        phoneVariants,
        fromNumber,
      });

      // PRIMARY: Look up by phone_number using ALL format variants (most reliable)
      // FALLBACK: Look up by agent_id if phone lookup fails
      let agentRow = null;
      let lookupMethod = null;

      // Try phone number first - use .in() with all variants for broader matching
      if (phoneVariants.length > 0) {
        const { data: phoneRow, error: phoneErr } = await supabaseAdmin
          .from("agents")
          .select("user_id, agent_id, phone_number, post_call_sms_enabled, post_call_sms_template, post_call_sms_delay_seconds")
          .in("phone_number", phoneVariants)
          .limit(1)
          .maybeSingle();
        
        if (phoneErr) {
          console.error("📞 [call_ended] Phone lookup error:", phoneErr.message);
        }
        
        if (phoneRow?.user_id) {
          agentRow = phoneRow;
          lookupMethod = "phone_number";
          console.log("📞 [call_ended] Phone lookup SUCCESS:", {
            matchedPhone: phoneRow.phone_number,
            triedVariants: phoneVariants,
            user_id: phoneRow.user_id,
          });
        } else {
          console.warn("📞 [call_ended] Phone lookup FAILED - no match for any variant:", {
            triedVariants: phoneVariants,
            rawToNumber: toNumber,
          });
        }
      }

      // Fallback: Look up by agent_id if phone lookup failed
      if (!agentRow?.user_id && agentId) {
        const { data: agentIdRow } = await supabaseAdmin
          .from("agents")
          .select("user_id, agent_id, phone_number, post_call_sms_enabled, post_call_sms_template, post_call_sms_delay_seconds")
          .eq("agent_id", agentId)
          .maybeSingle();
        
        if (agentIdRow?.user_id) {
          agentRow = agentIdRow;
          lookupMethod = "agent_id";
          console.warn("📞 [call_ended] Found user via agent_id fallback - phone_number mismatch:", {
            expectedPhone: agentIdRow.phone_number,
            receivedPhone: normalizedToNumber,
            phoneVariantsTried: phoneVariants,
            agentId,
          });
        }
      }

      console.log("📞 [call_ended] agent lookup result:", {
        toNumber: normalizedToNumber,
        phoneVariantsTried: phoneVariants,
        agentId,
        found: !!agentRow,
        lookupMethod,
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

      // ========================================
      // IDEMPOTENCY CHECK: Skip if already processed this call_id
      // This prevents duplicate counting when Retell retries webhooks
      // ========================================
      if (callId) {
        // Check leads table for existing call_id
        const { data: existingLead } = await supabaseAdmin
          .from("leads")
          .select("id")
          .eq("user_id", agentRow.user_id)
          .eq("call_id", callId)
          .maybeSingle();
        
        if (existingLead) {
          console.log("📞 [call_ended] DUPLICATE WEBHOOK - already processed call_id:", {
            call_id: callId,
            existing_lead_id: existingLead.id,
            user_id: agentRow.user_id,
          });
          // Return 200 so Retell doesn't retry
          return res.json({ received: true, duplicate: true, existing_lead_id: existingLead.id });
        }
        
        // Also check usage_calls as backup
        const { data: existingUsageCall } = await supabaseAdmin
          .from("usage_calls")
          .select("id")
          .eq("call_id", callId)
          .maybeSingle();
        
        if (existingUsageCall) {
          console.log("📞 [call_ended] DUPLICATE WEBHOOK (usage_calls) - already processed call_id:", {
            call_id: callId,
            existing_usage_call_id: existingUsageCall.id,
          });
          return res.json({ received: true, duplicate: true, existing_usage_call_id: existingUsageCall.id });
        }
      }

      // ========================================
      // CRITICAL: Update usage FIRST before any other operations
      // This ensures minutes are tracked even if later steps fail/timeout
      // ========================================
      let usageUpdateResult = null;
      if (durationSeconds > 0) {
        console.log("📞 [call_ended] UPDATING USAGE FIRST for user:", agentRow.user_id);
        
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
        const capSeconds = usage.call_cap_seconds || 0;
        const graceSeconds = usage.grace_seconds ?? 600;
        const hardStopThreshold = capSeconds + graceSeconds;
        const overCapPlusGrace = updatedUsed > hardStopThreshold;
        
        if (overCapPlusGrace) {
          console.warn("[call_ended] user over cap+grace, setting hard_stop_active", {
            user_id: agentRow.user_id,
            newCallUsed: updatedUsed,
            call_cap_seconds: capSeconds,
            grace_seconds: graceSeconds,
          });
        }
        
        const graceLimit = capSeconds + graceSeconds + (usage.call_credit_seconds || 0) + (usage.rollover_seconds || 0);
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

        // UPSERT usage_calls with ignoreDuplicates to prevent double-counting
        const { error: usageCallsError } = await supabaseAdmin
          .from("usage_calls")
          .upsert(
            {
              user_id: agentRow.user_id,
              agent_id: agentId,
              call_id: callId,
              seconds: durationSeconds,
              cost_cents: 0,
            },
            { onConflict: "call_id", ignoreDuplicates: true }
          );

        if (usageCallsError) {
          console.error("📞 [call_ended] USAGE_CALLS UPSERT FAILED:", {
            user_id: agentRow.user_id,
            call_id: callId,
            seconds: durationSeconds,
            error: usageCallsError.message,
          });
        } else {
          console.log("📞 [call_ended] USAGE_CALLS UPSERT SUCCESS:", {
            user_id: agentRow.user_id,
            call_id: callId,
            seconds: durationSeconds,
          });
        }

        // ATOMIC UPDATE: Use RPC function to prevent race conditions
        // This ensures concurrent webhooks don't lose usage data
        let atomicUpdateSuccess = false;
        let actualNewTotal = updatedUsed;
        
        try {
          const { data: atomicResult, error: rpcError } = await supabaseAdmin
            .rpc("increment_call_usage", {
              p_user_id: agentRow.user_id,
              p_seconds: durationSeconds,
              p_hard_stop_active: overCapPlusGrace,
              p_limit_state: nextState,
            });
          
          if (rpcError) {
            console.warn("📞 [call_ended] ATOMIC INCREMENT RPC FAILED, falling back:", rpcError.message);
          } else if (atomicResult && atomicResult.length > 0) {
            atomicUpdateSuccess = true;
            actualNewTotal = atomicResult[0].new_call_used_seconds;
            console.log("📞 [call_ended] ATOMIC INCREMENT SUCCESS:", {
              user_id: agentRow.user_id,
              added_seconds: durationSeconds,
              new_total_seconds: actualNewTotal,
            });
          }
        } catch (rpcErr) {
          console.warn("📞 [call_ended] ATOMIC INCREMENT EXCEPTION, falling back:", rpcErr.message);
        }

        // Fallback to regular update if RPC not available (e.g., function not created yet)
        let updateError = null;
        if (!atomicUpdateSuccess) {
          const { error: fallbackError } = await supabaseAdmin
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
          updateError = fallbackError;
        }

        // Store result for logging
        usageUpdateResult = {
          previous_seconds: usage.call_used_seconds || 0,
          added_seconds: durationSeconds,
          new_total_seconds: atomicUpdateSuccess ? actualNewTotal : updatedUsed,
          remaining_seconds: remaining,
          limit_state: nextState,
          update_error: updateError?.message || null,
          atomic_update: atomicUpdateSuccess,
        };

        console.log("📞 [USAGE UPDATE - PRIORITY PATH]", {
          user_id: agentRow.user_id,
          call_id: callId,
          ...usageUpdateResult,
          previous_minutes: Math.ceil((usage.call_used_seconds || 0) / 60),
          added_minutes: Math.ceil(durationSeconds / 60),
          new_total_minutes: Math.ceil(updatedUsed / 60),
          timestamp: new Date().toISOString(),
        });

        // Insert usage snapshot
        await supabaseAdmin.from("usage_snapshots").insert({
          user_id: agentRow.user_id,
          source: "call_ended",
          minutes_used: Math.ceil(updatedUsed / 60),
          cap_minutes: Math.ceil(total / 60),
          remaining_minutes: Math.ceil(remaining / 60),
        });

        // Evaluate usage thresholds
        await evaluateUsageThresholds(agentRow.user_id, {
          ...usage,
          call_used_seconds: updatedUsed,
        });
      }

      // Extract data with priority: post-call analysis > extracted vars > regex fallback
      const regexExtracted = extractLead(transcript);
      
      // Determine best values (post-call AI analysis is most reliable)
      const bestName = 
        analysisData.customer_name || 
        extractedVars?.customer_name || 
        regexExtracted.name || 
        null;
      const bestPhone = normalizePhoneE164(
        analysisData.customer_phone || 
        extractedVars?.customer_phone || 
        regexExtracted.phone || 
        fromNumber
      );
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
      
      // BULLETPROOF: Use upsert with onConflict to handle duplicates at database level
      // Even if app-level idempotency check somehow misses, this prevents duplicate leads
      let newLead = null;
      let leadError = null;
      
      if (callId) {
        // If we have call_id, use upsert to prevent duplicates
        const { data, error } = await supabaseAdmin
          .from("leads")
          .upsert(
            {
              user_id: agentRow.user_id,
              owner_id: agentRow.user_id,
              agent_id: agentId,
              call_id: callId,
              name: bestName,
              phone: bestPhone,
              status: leadStatus,
              summary: bestSummary,
              transcript,
              sentiment: bestSentiment,
              recording_url: recordingUrl,
              call_duration_seconds: durationSeconds || null,
              service_address: analysisData.service_address || null,
              issue_type: analysisData.issue_type || null,
              call_outcome: analysisData.call_outcome || null,
              appointment_booked: analysisData.appointment_booked === true,
              metadata: {
                post_call_analysis: Object.keys(postCallAnalysis).length > 0 ? postCallAnalysis : null,
                extracted_vars: extractedVars || null,
                regex_extracted: regexExtracted || null,
                from_number: fromNumber || null,
                to_number: normalizedToNumber || null,
              },
            },
            { 
              onConflict: "call_id",
              ignoreDuplicates: true  // Skip if call_id already exists - NO duplicate counting
            }
          )
          .select("id")
          .maybeSingle();
        
        newLead = data;
        leadError = error;
      } else {
        // No call_id - use regular insert (rare edge case)
        console.warn("📞 [call_ended] WARNING: No call_id provided, using regular insert");
        const { data, error } = await supabaseAdmin.from("leads").insert({
          user_id: agentRow.user_id,
          owner_id: agentRow.user_id,
          agent_id: agentId,
          call_id: null,
          name: bestName,
          phone: bestPhone,
          status: leadStatus,
          summary: bestSummary,
          transcript,
          sentiment: bestSentiment,
          recording_url: recordingUrl,
          call_duration_seconds: durationSeconds || null,
          service_address: analysisData.service_address || null,
          issue_type: analysisData.issue_type || null,
          call_outcome: analysisData.call_outcome || null,
          appointment_booked: analysisData.appointment_booked === true,
          metadata: {
            post_call_analysis: Object.keys(postCallAnalysis).length > 0 ? postCallAnalysis : null,
            extracted_vars: extractedVars || null,
            regex_extracted: regexExtracted || null,
            from_number: fromNumber || null,
            to_number: normalizedToNumber || null,
          },
        }).select("id").single();
        newLead = data;
        leadError = error;
      }

      // Handle duplicate key errors gracefully (don't return 500, return 200)
      if (leadError) {
        // Check if it's a duplicate key error
        const isDuplicateError = leadError.message?.includes("duplicate") || 
                                  leadError.message?.includes("unique") ||
                                  leadError.code === "23505";
        
        if (isDuplicateError) {
          console.log("📞 [call_ended] DUPLICATE LEAD BLOCKED BY DATABASE:", {
            call_id: callId,
            user_id: agentRow.user_id,
            error: leadError.message,
          });
          // Return 200 so Retell doesn't retry - this is expected behavior
          return res.json({ received: true, duplicate: true, blocked_by: "database_constraint" });
        }
        
        // Actual error - log and return 500
        console.error("📞 [call_ended] LEAD INSERT FAILED:", {
          user_id: agentRow.user_id,
          error: leadError.message,
          leadData: { bestName, bestPhone, leadStatus, durationSeconds },
        });
        return res.status(500).json({ error: leadError.message });
      }

      console.log("📞 [call_ended] LEAD INSERT SUCCESS:", {
        lead_id: newLead?.id,
        user_id: agentRow.user_id,
        name: bestName,
        phone: bestPhone,
        status: leadStatus,
        duration_seconds: durationSeconds,
      });

      // Send lead_created webhook
      if (newLead?.id) {
        sendOutboundWebhook(agentRow.user_id, "lead_created", {
          lead_id: newLead.id,
          user_id: agentRow.user_id,
          agent_id: agentId,
          call_id: callId,
          name: bestName,
          phone: bestPhone,
          status: leadStatus,
          summary: bestSummary,
          sentiment: bestSentiment,
          service_address: analysisData.service_address || null,
          issue_type: analysisData.issue_type || null,
          call_outcome: analysisData.call_outcome || null,
          appointment_booked: analysisData.appointment_booked === true,
          recording_url: recordingUrl,
          call_duration_seconds: durationSeconds,
          created_at: new Date().toISOString(),
        }).catch(err => {
          console.error("[webhook] lead_created error:", err.message);
          trackError({ error: err, context: { source: "retell", action: "lead_created" }, severity: "high" });
        });
      }

      // Also insert into call_recordings for Black Box page
      try {
        // Map leadStatus to valid call_outcome enum values
        // Enum values: 'No Answer', 'Gatekeeper', 'Not Interested', 'Hangup', 'Pitch Delivered', 'Demo Set'
        let callOutcome = "Pitch Delivered"; // Default for completed calls
        const statusLower = (leadStatus || "").toLowerCase();
        if (statusLower.includes("book") || statusLower.includes("appointment")) {
          callOutcome = "Demo Set";
        } else if (statusLower.includes("not interested") || statusLower.includes("declined")) {
          callOutcome = "Not Interested";
        } else if (statusLower.includes("no answer") || statusLower.includes("missed")) {
          callOutcome = "No Answer";
        } else if (statusLower.includes("hangup") || statusLower.includes("hung up")) {
          callOutcome = "Hangup";
        } else if (statusLower.includes("callback") || statusLower.includes("transfer")) {
          callOutcome = "Gatekeeper";
        }
        
        await supabaseAdmin.from("call_recordings").insert({
          seller_id: agentRow.user_id,
          lead_id: newLead?.id || null,
          call_id: callId, // Store call_id for backfilling recording URLs later
          duration: durationSeconds || 0,
          recording_url: recordingUrl,
          outcome: callOutcome,
        });
        console.log("📞 [call_ended] call_recording inserted for Black Box:", { callOutcome, leadStatus, hasRecordingUrl: !!recordingUrl });
      } catch (recErr) {
        console.warn("📞 [call_ended] call_recordings insert failed (non-fatal):", recErr.message);
      }

      // =====================================================================
      // CREATE APPOINTMENT from call_ended when booking was made
      // Retell's built-in Book Calendar and custom tool calls don't send
      // a separate "tool_call" webhook event. The booking happens during the
      // call, and we only learn about it here via post_call_analysis fields
      // or the transcript_with_tool_calls data. Create the appointment row
      // so it shows up on our /calendar page.
      // =====================================================================
      if (analysisData.appointment_booked === true) {
        try {
          // Extract booking details from post-call analysis and tool calls
          const toolCalls = call.transcript_with_tool_calls || payload.transcript_with_tool_calls || [];
          let bookingTime = postCallAnalysis.appointment_time || postCallAnalysis.booked_time || postCallAnalysis.scheduled_time || null;
          let bookingUid = null;
          
          // Try to extract booking details from Retell's tool call results
          for (const entry of (Array.isArray(toolCalls) ? toolCalls : [])) {
            if (entry.tool_call_result || entry.function_call_result) {
              const result = entry.tool_call_result || entry.function_call_result;
              const resultStr = typeof result === "string" ? result : JSON.stringify(result || "");
              // Look for Cal.com booking UID in tool call results
              const uidMatch = resultStr.match(/"uid"\s*:\s*"([^"]+)"/);
              if (uidMatch) bookingUid = uidMatch[1];
              // Look for start time in tool call results
              const startMatch = resultStr.match(/"start(?:Time)?"\s*:\s*"([^"]+)"/);
              if (startMatch && !bookingTime) bookingTime = startMatch[1];
            }
          }
          
          // Build appointment start/end times
          let appointmentStart = null;
          let appointmentEnd = null;
          if (bookingTime) {
            appointmentStart = new Date(bookingTime).toISOString();
            appointmentEnd = new Date(new Date(bookingTime).getTime() + 60 * 60 * 1000).toISOString(); // default 1hr
          } else {
            // No specific time found - use tomorrow 9am in user's timezone as placeholder
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(9, 0, 0, 0);
            appointmentStart = tomorrow.toISOString();
            appointmentEnd = new Date(tomorrow.getTime() + 60 * 60 * 1000).toISOString();
          }
          
          const customerName = analysisData.customer_name || regexExtracted?.callerName || "Customer";
          const customerPhone = normalizePhoneE164(analysisData.customer_phone || fromNumber || "");
          
          // Check if this appointment already exists (tool_call or Cal.com webhook may have beaten us)
          let appointmentExists = false;
          if (bookingUid) {
            const { data: existing } = await supabaseAdmin
              .from("appointments")
              .select("id")
              .eq("cal_booking_uid", bookingUid)
              .maybeSingle();
            if (existing) appointmentExists = true;
          }
          // Also check by user + start_time to prevent duplicates when Cal.com isn't involved
          if (!appointmentExists && appointmentStart) {
            const windowStart = new Date(new Date(appointmentStart).getTime() - 5 * 60 * 1000).toISOString();
            const windowEnd = new Date(new Date(appointmentStart).getTime() + 5 * 60 * 1000).toISOString();
            const { data: timeMatch } = await supabaseAdmin
              .from("appointments")
              .select("id")
              .eq("user_id", agentRow.user_id)
              .gte("start_time", windowStart)
              .lte("start_time", windowEnd)
              .limit(1)
              .maybeSingle();
            if (timeMatch) {
              appointmentExists = true;
              console.log("📞 [call_ended] Appointment already exists by time match, skipping:", timeMatch.id);
            }
          }
          
          if (!appointmentExists) {
            const { data: newAppointment, error: apptError } = await supabaseAdmin
              .from("appointments")
              .insert({
                user_id: agentRow.user_id,
                customer_name: customerName,
                customer_phone: customerPhone,
                customer_email: null,
                start_time: appointmentStart,
                end_time: appointmentEnd,
                location: analysisData.service_address || null,
                notes: `Booked via AI call. ${analysisData.issue_type ? "Service: " + analysisData.issue_type + ". " : ""}${analysisData.call_summary || ""}`.trim(),
                status: "scheduled",
                cal_booking_uid: bookingUid,
              })
              .select("id")
              .single();
            
            if (apptError) {
              console.warn("📞 [call_ended] appointment insert failed:", apptError.message);
            } else {
              console.log("📞 [call_ended] ✅ Appointment created from booked call:", {
                appointment_id: newAppointment?.id,
                customer_name: customerName,
                start_time: appointmentStart,
                booking_uid: bookingUid,
                lead_id: newLead?.id,
              });
              
              // Log event
              await logEvent({
                userId: agentRow.user_id,
                actionType: "APPOINTMENT_BOOKED",
                metaData: {
                  appointment_id: newAppointment?.id,
                  lead_id: newLead?.id,
                  call_id: callId,
                  source: "retell_call_ended",
                  booking_uid: bookingUid,
                },
              });
              
              // Send outbound webhook
              sendOutboundWebhook(agentRow.user_id, "appointment_booked", {
                appointment_id: newAppointment?.id,
                user_id: agentRow.user_id,
                customer_name: customerName,
                customer_phone: customerPhone,
                start_time: appointmentStart,
                end_time: appointmentEnd,
                location: analysisData.service_address || null,
                source: "retell_call_ended",
                cal_booking_uid: bookingUid,
                call_id: callId,
              }).catch(err => console.error("[call_ended] appointment webhook error:", err.message));
            }
          } else {
            console.log("📞 [call_ended] Appointment already exists for booking_uid:", bookingUid);
          }
        } catch (apptErr) {
          console.warn("📞 [call_ended] appointment creation from call failed (non-fatal):", apptErr.message);
        }
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

      // NOTE: Usage tracking (usage_limits, usage_calls) was MOVED to earlier in this handler
      // to ensure minutes are recorded FIRST before any other operations that might fail/timeout.
      // See "CRITICAL: Update usage FIRST" section above the lead extraction code.
      
      // Usage 80% threshold alert (check only, usage already updated)
      if (durationSeconds > 0 && usageUpdateResult) {
        const remaining = usageUpdateResult.remaining_seconds;
        const total = usageUpdateResult.new_total_seconds + remaining;
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

      // Send call_ended webhook
      sendOutboundWebhook(agentRow.user_id, "call_ended", {
        call_id: callId,
        agent_id: agentId,
        user_id: agentRow.user_id,
        duration_seconds: durationSeconds,
        recording_url: recordingUrl,
        transcript: transcript?.substring(0, 5000) || null,
        from_number: fromNumber,
        to_number: normalizedToNumber,
        disposition,
        lead_id: newLead?.id || null,
        customer_name: bestName,
        customer_phone: bestPhone,
        summary: bestSummary,
        sentiment: bestSentiment,
        service_address: analysisData.service_address || null,
        issue_type: analysisData.issue_type || null,
        call_outcome: analysisData.call_outcome || null,
        appointment_booked: analysisData.appointment_booked === true,
        ended_at: new Date().toISOString(),
      }).catch(err => {
        console.error("[webhook] call_ended error:", err.message);
        trackError({ error: err, context: { source: "retell", action: "call_ended" }, severity: "medium" });
      });
    }

    // Handle call.transferred events for tracking
    if (eventType === "call_transferred" || eventType === "call.transferred") {
      const agentId = call.agent_id || payload.agent_id;
      const callId = call.call_id || payload.call_id;
      const transferTarget = call.transfer_to || payload.transfer_to || call.forwarded_to || payload.forwarded_to;
      
      console.log("📞 [call_transferred] Transfer event:", {
        agent_id: agentId,
        call_id: callId,
        transfer_target: transferTarget,
        timestamp: new Date().toISOString(),
      });
      
      // Log the transfer in audit log if we can find the user
      if (agentId) {
        const { data: agentRow } = await supabaseAdmin
          .from("agents")
          .select("user_id")
          .eq("agent_id", agentId)
          .maybeSingle();
        
        if (agentRow?.user_id) {
          await logEvent({
            userId: agentRow.user_id,
            actionType: "CALL_TRANSFERRED",
            req,
            metaData: {
              call_id: callId,
              agent_id: agentId,
              transfer_target: transferTarget,
            },
          });
        }
      }
      return res.json({ received: true, event: "call_transferred" });
    }

    if (eventType === "sms_received") {
      const agentId = payload.agent_id || call.agent_id;
      const body = payload.body || call.body || payload.message || "";
      const fromNumber = payload.from || call.from || payload.from_number;

      console.log("📱 [sms_received] Inbound SMS:", {
        agent_id: agentId,
        from_number: fromNumber,
        body_preview: body?.substring(0, 100),
        timestamp: new Date().toISOString(),
      });

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

      // Check for opt-out keywords
      const optOutKeywords = /^(stop|unsubscribe|cancel|end)\b/i;
      const isOptOut = fromNumber && optOutKeywords.test(body.trim());

      // Send sms_received webhook
      sendOutboundWebhook(agentRow.user_id, "sms_received", {
        user_id: agentRow.user_id,
        agent_id: agentId,
        from_number: fromNumber,
        body,
        direction: "inbound",
        keyword_detected: isOptOut ? body.trim().split(/\s+/)[0].toLowerCase() : null,
        is_opt_out: isOptOut,
        received_at: new Date().toISOString(),
      }).catch(err => {
        console.error("[webhook] sms_received error:", err.message);
        trackError({ error: err, context: { source: "sms", action: "sms_received" }, severity: "medium" });
      });

      if (isOptOut) {
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
      console.log("[retell-webhook] TOOL_CALL received, raw tool names:", JSON.stringify((payload?.tool_calls || payload?.tool_call || []).map?.(t => t?.name || t?.tool_name) || payload?.tool_call?.name || "unknown"));
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
      const cleanTransfer = normalizePhoneE164(transferNumber);
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

      // Get current date/time for agent context
      const dateTimeVars = getCurrentDateTimeVars("America/New_York");
      
      const dynamicVars = {
        business_name: String(businessName || ""),
        industry: String(industry || ""),
        primary_service: String(formatPrimaryService(industry) || ""),
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
        // Date/time awareness
        ...dateTimeVars,
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

      // CRITICAL: Validate required fields before insert to prevent attribution issues
      if (!agentId) {
        console.error("[deploy-agent] CRITICAL: Missing agent_id, cannot insert agent record");
        return res.status(500).json({ error: "Agent creation failed: missing agent_id" });
      }
      if (!phoneNumber) {
        console.error("[deploy-agent] CRITICAL: Missing phone_number, cannot insert agent record");
        return res.status(500).json({ error: "Agent creation failed: missing phone_number" });
      }

      // Use upsert on user_id to handle re-deploys gracefully
      const { error: upsertError } = await supabaseAdmin.from("agents").upsert({
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
      }, { onConflict: "user_id" });

      if (upsertError) {
        return res.status(500).json({ error: upsertError.message });
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

// Primary line number - backend read (bypasses RLS); dashboard uses this so green box always shows
app.get("/api/primary-number", requireAuth, resolveEffectiveUser, async (req, res) => {
  try {
    const uid = req.effectiveUserId ?? req.user.id;
    const { data: agents } = await supabaseAdmin
      .from("agents")
      .select("phone_number, is_active, created_at")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    const withNumber = (agents || []).find((a) => a.phone_number);
    const agent = withNumber || (agents && agents[0]) || null;
    return res.json({
      phone_number: agent?.phone_number || null,
      is_active: agent?.is_active !== false,
    });
  } catch (err) {
    console.error("[primary-number] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ROI Dashboard - calculate value generated for customer
app.get(
  "/api/dashboard/roi",
  requireAuth,
  resolveEffectiveUser,
  rateLimit({ keyPrefix: "dashboard-roi", limit: 30, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const uid = req.effectiveUserId ?? req.user.id;
      
      // Get profile and subscription
      const [
        { data: profile },
        { data: subscription },
        { data: usage },
        { data: leads },
        { data: appointments },
      ] = await Promise.all([
        supabaseAdmin.from("profiles").select("plan_type, business_name, created_at").eq("user_id", uid).maybeSingle(),
        supabaseAdmin.from("subscriptions").select("plan_type, status").eq("user_id", uid).maybeSingle(),
        supabaseAdmin.from("usage_limits").select("call_used_seconds, sms_used").eq("user_id", uid).maybeSingle(),
        supabaseAdmin.from("leads").select("id, created_at, status, call_duration_seconds").eq("user_id", uid),
        supabaseAdmin.from("appointments").select("id, status").eq("user_id", uid),
      ]);
      
      const allLeads = leads || [];
      const allAppointments = appointments || [];
      
      // Calculate metrics
      const totalCalls = allLeads.length;
      const totalDurationSeconds = allLeads.reduce((sum, l) => sum + (l.call_duration_seconds || 0), 0);
      const avgCallDuration = totalCalls > 0 ? totalDurationSeconds / totalCalls : 0;
      
      const bookedAppointments = allAppointments.filter(a => 
        a.status === "booked" || a.status === "confirmed"
      ).length;
      
      // ROI Calculations
      const avgTicketValue = 450; // Average service ticket
      const receptionistMonthlyCost = 3500; // Full-time receptionist salary
      const hoursSaved = totalDurationSeconds / 3600;
      const revenueGenerated = bookedAppointments * avgTicketValue;
      
      // Get plan cost - MUST match billingConstants.js
      const planCosts = { 
        core: 149, 
        pro: 249, 
        elite: 497, 
        scale: 997,
        white_glove: 997, // Legacy alias for scale
      };
      const planType = (subscription?.plan_type || profile?.plan_type || "pro").toLowerCase();
      const monthlyCost = planCosts[planType] || 249; // Default to pro if unknown
      
      // Calculate ROI
      const laborSavings = (hoursSaved / 160) * receptionistMonthlyCost; // Pro-rated receptionist salary
      const totalValue = revenueGenerated + laborSavings;
      const roi = monthlyCost > 0 ? ((totalValue - monthlyCost) / monthlyCost) * 100 : 0;
      
      // Time-based metrics
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const leadsLast30Days = allLeads.filter(l => new Date(l.created_at) >= thirtyDaysAgo).length;
      const appointmentsLast30Days = allAppointments.filter(a => 
        new Date(a.created_at || 0) >= thirtyDaysAgo
      ).length;
      
      return res.json({
        roi: {
          total_calls: totalCalls,
          calls_last_30_days: leadsLast30Days,
          booked_appointments: bookedAppointments,
          appointments_last_30_days: appointmentsLast30Days,
          hours_saved: Math.round(hoursSaved * 10) / 10,
          avg_call_duration_seconds: Math.round(avgCallDuration),
          revenue_generated: revenueGenerated,
          labor_savings: Math.round(laborSavings),
          total_value: Math.round(totalValue),
          monthly_cost: monthlyCost,
          roi_percent: Math.round(roi),
          avg_ticket_value: avgTicketValue,
          receptionist_monthly_cost: receptionistMonthlyCost,
        },
        plan_type: planType,
        subscription_status: subscription?.status || "none",
      });
    } catch (err) {
      console.error("[dashboard-roi] error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// Health Score - get user's customer health score
app.get(
  "/api/health-score",
  requireAuth,
  resolveEffectiveUser,
  rateLimit({ keyPrefix: "health-score", limit: 30, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const uid = req.effectiveUserId ?? req.user.id;
      
      // Get existing health score
      let { data: healthScore } = await supabaseAdmin
        .from("customer_health_scores")
        .select("*")
        .eq("user_id", uid)
        .maybeSingle();
      
      // Calculate if doesn't exist or is stale (> 1 hour old)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (!healthScore || new Date(healthScore.calculated_at) < oneHourAgo) {
        healthScore = await calculateHealthScore(uid);
      }
      
      if (!healthScore) {
        return res.status(404).json({ error: "Health score not available" });
      }
      
      return res.json({ health_score: healthScore });
    } catch (err) {
      console.error("[health-score] error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// Admin: Get all health scores
app.get(
  "/admin/health-scores",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-health-scores", limit: 30, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { churn_risk, grade, limit = 100, offset = 0 } = req.query;
      
      let query = supabaseAdmin
        .from("customer_health_scores")
        .select("*, profiles!inner(email, business_name)")
        .order("score", { ascending: true });
      
      if (churn_risk) {
        query = query.eq("churn_risk", churn_risk);
      }
      if (grade) {
        query = query.eq("grade", grade);
      }
      
      query = query.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
      
      const { data: scores, error } = await query;
      
      if (error) throw error;
      
      // Get summary stats
      const { data: summary } = await supabaseAdmin
        .from("customer_health_scores")
        .select("churn_risk, grade");
      
      const stats = {
        total: summary?.length || 0,
        by_risk: {
          critical: summary?.filter(s => s.churn_risk === "critical").length || 0,
          high: summary?.filter(s => s.churn_risk === "high").length || 0,
          medium: summary?.filter(s => s.churn_risk === "medium").length || 0,
          low: summary?.filter(s => s.churn_risk === "low").length || 0,
        },
        by_grade: {
          A: summary?.filter(s => s.grade === "A").length || 0,
          B: summary?.filter(s => s.grade === "B").length || 0,
          C: summary?.filter(s => s.grade === "C").length || 0,
          D: summary?.filter(s => s.grade === "D").length || 0,
          F: summary?.filter(s => s.grade === "F").length || 0,
        },
      };
      
      return res.json({ health_scores: scores || [], stats });
    } catch (err) {
      console.error("[admin/health-scores] error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// Admin: Recalculate health score for a user
app.post(
  "/admin/health-scores/:userId/recalculate",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-recalc-health", limit: 10, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { userId } = req.params;
      const healthScore = await calculateHealthScore(userId);
      
      if (!healthScore) {
        return res.status(500).json({ error: "Failed to calculate health score" });
      }
      
      await auditLog({
        userId,
        actorId: req.user.id,
        action: "health_score_recalculated",
        entity: "health_score",
        entityId: userId,
        req,
      });
      
      return res.json({ health_score: healthScore });
    } catch (err) {
      console.error("[admin/health-recalc] error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// Admin: Get churn alerts
app.get(
  "/admin/churn-alerts",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-churn-alerts", limit: 30, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { resolved, severity, limit = 100, offset = 0 } = req.query;
      
      let query = supabaseAdmin
        .from("churn_alerts")
        .select("*, profiles!inner(email, business_name)")
        .order("created_at", { ascending: false });
      
      if (resolved === "true") {
        query = query.eq("resolved", true);
      } else if (resolved === "false") {
        query = query.eq("resolved", false);
      }
      
      if (severity) {
        query = query.eq("severity", severity);
      }
      
      query = query.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
      
      const { data: alerts, error } = await query;
      
      if (error) throw error;
      
      // Get unresolved count by severity
      const { data: unresolvedCounts } = await supabaseAdmin
        .from("churn_alerts")
        .select("severity")
        .eq("resolved", false);
      
      const stats = {
        unresolved_total: unresolvedCounts?.length || 0,
        by_severity: {
          critical: unresolvedCounts?.filter(a => a.severity === "critical").length || 0,
          high: unresolvedCounts?.filter(a => a.severity === "high").length || 0,
          medium: unresolvedCounts?.filter(a => a.severity === "medium").length || 0,
          low: unresolvedCounts?.filter(a => a.severity === "low").length || 0,
        },
      };
      
      return res.json({ alerts: alerts || [], stats });
    } catch (err) {
      console.error("[admin/churn-alerts] error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// Admin: Acknowledge/resolve churn alert
app.post(
  "/admin/churn-alerts/:alertId/resolve",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-resolve-alert", limit: 30, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { alertId } = req.params;
      const { notes } = req.body;
      
      const { data: updated, error } = await supabaseAdmin
        .from("churn_alerts")
        .update({
          resolved: true,
          resolved_at: new Date().toISOString(),
          acknowledged: true,
          acknowledged_by: req.user.id,
          acknowledged_at: new Date().toISOString(),
        })
        .eq("id", alertId)
        .select()
        .single();
      
      if (error) throw error;
      
      await auditLog({
        userId: updated.user_id,
        actorId: req.user.id,
        action: "churn_alert_resolved",
        entity: "churn_alert",
        entityId: alertId,
        req,
        metadata: { notes },
      });
      
      return res.json({ alert: updated });
    } catch (err) {
      console.error("[admin/resolve-alert] error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// Admin: Get ops alerts
app.get(
  "/admin/ops-alerts",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-ops-alerts", limit: 30, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { acknowledged, severity, limit = 100, offset = 0 } = req.query;
      
      let query = supabaseAdmin
        .from("ops_alerts")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (acknowledged === "true") {
        query = query.eq("acknowledged", true);
      } else if (acknowledged === "false") {
        query = query.eq("acknowledged", false);
      }
      
      if (severity) {
        query = query.eq("severity", severity);
      }
      
      query = query.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
      
      const { data: alerts, error } = await query;
      
      if (error) throw error;
      
      return res.json({ alerts: alerts || [] });
    } catch (err) {
      console.error("[admin/ops-alerts] error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// Admin: Acknowledge ops alert
app.post(
  "/admin/ops-alerts/:alertId/acknowledge",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-ack-ops", limit: 30, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { alertId } = req.params;
      
      const { data: updated, error } = await supabaseAdmin
        .from("ops_alerts")
        .update({
          acknowledged: true,
          acknowledged_by: req.user.id,
          acknowledged_at: new Date().toISOString(),
        })
        .eq("id", alertId)
        .select()
        .single();
      
      if (error) throw error;
      
      return res.json({ alert: updated });
    } catch (err) {
      console.error("[admin/ack-ops] error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// Admin: Get error logs
app.get(
  "/admin/error-logs",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-error-logs", limit: 30, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { resolved, severity, limit = 100, offset = 0 } = req.query;
      
      let query = supabaseAdmin
        .from("error_logs")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (resolved === "true") {
        query = query.eq("resolved", true);
      } else if (resolved === "false") {
        query = query.eq("resolved", false);
      }
      
      if (severity) {
        query = query.eq("severity", severity);
      }
      
      query = query.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
      
      const { data: errors, error } = await query;
      
      if (error) throw error;
      
      // Get unresolved count
      const { data: unresolvedCount } = await supabaseAdmin
        .from("error_logs")
        .select("id", { count: "exact" })
        .eq("resolved", false);
      
      return res.json({ 
        errors: errors || [], 
        unresolved_count: unresolvedCount?.length || 0 
      });
    } catch (err) {
      console.error("[admin/error-logs] error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// Admin: Resolve error
app.post(
  "/admin/error-logs/:errorId/resolve",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-resolve-error", limit: 30, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { errorId } = req.params;
      const { notes } = req.body;
      
      const { data: updated, error } = await supabaseAdmin
        .from("error_logs")
        .update({
          resolved: true,
          resolved_by: req.user.id,
          resolved_at: new Date().toISOString(),
          resolution_notes: notes || null,
        })
        .eq("id", errorId)
        .select()
        .single();
      
      if (error) throw error;
      
      return res.json({ error_log: updated });
    } catch (err) {
      console.error("[admin/resolve-error] error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// =============================================================================
// WEBHOOK QUEUE / REPLAY ENDPOINTS
// =============================================================================

// Admin: Get webhook queue with filters
app.get(
  "/admin/webhook-queue",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-webhook-queue", limit: 30, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { status, phone, event_type, limit: queryLimit, offset } = req.query;
      const itemLimit = Math.min(parseInt(queryLimit) || 50, 200);
      const itemOffset = parseInt(offset) || 0;
      
      let query = supabaseAdmin
        .from("webhook_queue")
        .select("*", { count: "exact" })
        .order("received_at", { ascending: false })
        .range(itemOffset, itemOffset + itemLimit - 1);
      
      // Filter by status (pending = not processed, failed = has error, success = processed ok)
      if (status === "pending") {
        query = query.is("processed_at", null);
      } else if (status === "failed") {
        query = query.not("error_message", "is", null);
      } else if (status === "success") {
        query = query.not("processed_at", "is", null).is("error_message", null);
      }
      
      // Filter by phone number
      if (phone) {
        query = query.ilike("phone_number", `%${phone}%`);
      }
      
      // Filter by event type
      if (event_type) {
        query = query.eq("event_type", event_type);
      }
      
      const { data, error, count } = await query;
      
      if (error) throw error;
      
      return res.json({
        items: data || [],
        total: count || 0,
        limit: itemLimit,
        offset: itemOffset,
      });
    } catch (err) {
      console.error("[admin/webhook-queue] error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// Admin: Replay a queued webhook
app.post(
  "/admin/webhook-queue/:id/replay",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-webhook-replay", limit: 10, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { id } = req.params;
      
      // Fetch the queued webhook
      const { data: queuedItem, error: fetchError } = await supabaseAdmin
        .from("webhook_queue")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      
      if (fetchError) throw fetchError;
      if (!queuedItem) {
        return res.status(404).json({ error: "Webhook queue item not found" });
      }
      
      const { event_type, raw_payload, idempotency_key } = queuedItem;
      
      // Update attempts count
      await supabaseAdmin
        .from("webhook_queue")
        .update({
          attempts: (queuedItem.attempts || 0) + 1,
          last_attempt_at: new Date().toISOString(),
        })
        .eq("id", id);
      
      let replayResult = { success: false, error: null };
      
      try {
        // Route replay based on event_type
        if (event_type === "call_inbound" || event_type === "call_ended" || event_type === "call_started") {
          // For call events, we log that replay is not fully supported (needs manual reprocessing)
          // because the Retell webhook handlers expect live request/response flow
          replayResult = {
            success: true,
            note: "Call event logged for review. Full replay requires manual investigation.",
            event_type,
          };
        } else if (event_type === "sms_inbound" || event_type === "sms_inbound_unknown") {
          // SMS events also need manual review for now
          replayResult = {
            success: true,
            note: "SMS event logged for review. Routing may need manual verification.",
            event_type,
          };
        } else {
          replayResult = {
            success: true,
            note: `Event type '${event_type}' logged for manual review.`,
          };
        }
        
        // Mark as replayed
        await supabaseAdmin
          .from("webhook_queue")
          .update({
            processed_at: new Date().toISOString(),
            processed_by: `admin:${req.user.id}`,
            result: "replayed",
            error_message: null,
          })
          .eq("id", id);
        
      } catch (replayErr) {
        replayResult = { success: false, error: replayErr.message };
        
        // Update with error
        await supabaseAdmin
          .from("webhook_queue")
          .update({
            last_attempt_at: new Date().toISOString(),
            error_message: replayErr.message,
          })
          .eq("id", id);
      }
      
      return res.json({
        ok: replayResult.success,
        queue_id: id,
        event_type,
        ...replayResult,
      });
    } catch (err) {
      console.error("[admin/webhook-queue/replay] error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// =============================================================================
// RECONCILIATION FUNCTIONS AND ENDPOINTS
// =============================================================================

/**
 * Run internal usage reconciliation
 * Compares usage_limits aggregates vs actual usage_calls/usage_sms sums
 */
const runReconciliation = async (triggeredBy = "scheduler") => {
  const runId = require("crypto").randomUUID();
  const startedAt = new Date().toISOString();
  
  // Create run record
  await supabaseAdmin.from("reconciliation_runs").insert({
    id: runId,
    run_type: triggeredBy === "scheduler" ? "nightly" : "manual",
    started_at: startedAt,
    status: "running",
    triggered_by: triggeredBy,
  });
  
  try {
    // Get all users with usage_limits
    const { data: usageLimits, error: limitsError } = await supabaseAdmin
      .from("usage_limits")
      .select("user_id, call_used_seconds, sms_used, period_start, period_end");
    
    if (limitsError) throw limitsError;
    
    const discrepancies = [];
    let recordsChecked = 0;
    
    for (const usage of (usageLimits || [])) {
      recordsChecked++;
      const userId = usage.user_id;
      const periodStart = usage.period_start;
      const periodEnd = usage.period_end || new Date().toISOString();
      
      // Sum actual call seconds from usage_calls
      const { data: callsData } = await supabaseAdmin
        .from("usage_calls")
        .select("seconds")
        .eq("user_id", userId)
        .gte("created_at", periodStart)
        .lte("created_at", periodEnd);
      
      const actualCallSeconds = (callsData || []).reduce((sum, c) => sum + (c.seconds || 0), 0);
      
      // Sum actual SMS from usage_sms (or count rows if no 'count' column)
      const { data: smsData, count: smsCount } = await supabaseAdmin
        .from("usage_sms")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", periodStart)
        .lte("created_at", periodEnd);
      
      const actualSms = smsCount || 0;
      
      // Compare with stored aggregates
      const storedCallSeconds = usage.call_used_seconds || 0;
      const storedSms = usage.sms_used || 0;
      
      const callDiff = Math.abs(actualCallSeconds - storedCallSeconds);
      const smsDiff = Math.abs(actualSms - storedSms);
      
      // Flag if difference > 5% or > 60 seconds / 5 SMS
      const callThreshold = Math.max(storedCallSeconds * 0.05, 60);
      const smsThreshold = Math.max(storedSms * 0.05, 5);
      
      if (callDiff > callThreshold || smsDiff > smsThreshold) {
        discrepancies.push({
          user_id: userId,
          call_stored: storedCallSeconds,
          call_actual: actualCallSeconds,
          call_diff: callDiff,
          sms_stored: storedSms,
          sms_actual: actualSms,
          sms_diff: smsDiff,
          period_start: periodStart,
          period_end: periodEnd,
        });
      }
    }
    
    // Update run record
    await supabaseAdmin
      .from("reconciliation_runs")
      .update({
        completed_at: new Date().toISOString(),
        status: "completed",
        records_checked: recordsChecked,
        discrepancies_found: discrepancies.length,
        discrepancy_details: discrepancies.length > 0 ? discrepancies : null,
      })
      .eq("id", runId);
    
    // Create alert if discrepancies found
    if (discrepancies.length > 0) {
      await createOpsAlert({
        alert_type: "reconciliation_discrepancy",
        severity: discrepancies.length > 5 ? "critical" : "warning",
        message: `Reconciliation found ${discrepancies.length} discrepancies across ${recordsChecked} users`,
        details: { run_id: runId, count: discrepancies.length },
      });
    }
    
    console.log(`[Reconciliation] Completed: ${recordsChecked} checked, ${discrepancies.length} discrepancies`);
    
    return {
      run_id: runId,
      records_checked: recordsChecked,
      discrepancies_found: discrepancies.length,
      discrepancies,
    };
  } catch (err) {
    // Update run as failed
    await supabaseAdmin
      .from("reconciliation_runs")
      .update({
        completed_at: new Date().toISOString(),
        status: "failed",
        notes: err.message,
      })
      .eq("id", runId);
    
    console.error("[Reconciliation] Failed:", err.message);
    throw err;
  }
};

// Admin: Get reconciliation runs
app.get(
  "/admin/reconciliation-runs",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-recon-runs", limit: 30, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { status, limit: queryLimit, offset } = req.query;
      const itemLimit = Math.min(parseInt(queryLimit) || 25, 100);
      const itemOffset = parseInt(offset) || 0;
      
      let query = supabaseAdmin
        .from("reconciliation_runs")
        .select("*", { count: "exact" })
        .order("started_at", { ascending: false })
        .range(itemOffset, itemOffset + itemLimit - 1);
      
      if (status) {
        query = query.eq("status", status);
      }
      
      const { data, error, count } = await query;
      
      if (error) throw error;
      
      return res.json({
        runs: data || [],
        total: count || 0,
        limit: itemLimit,
        offset: itemOffset,
      });
    } catch (err) {
      console.error("[admin/reconciliation-runs] error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// Admin: Trigger manual reconciliation
app.post(
  "/admin/reconciliation-runs/trigger",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-recon-trigger", limit: 5, windowMs: 300_000 }),
  async (req, res) => {
    try {
      const result = await runReconciliation(`admin:${req.user.id}`);
      return res.json({ ok: true, ...result });
    } catch (err) {
      console.error("[admin/reconciliation/trigger] error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

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
        .select("business_name, email, phone, industry, google_review_url, review_request_enabled, review_request_template, business_hours, business_timezone, emergency_24_7, user_personal_phone, notification_preferences")
        .eq("user_id", uid)
        .maybeSingle(),
      supabaseAdmin
        .from("agents")
        .select("transfer_number, schedule_summary, standard_fee, emergency_fee, tone, phone_number, industry, post_call_sms_enabled, post_call_sms_template, post_call_sms_delay_seconds, confirmation_sms_enabled")
        .eq("user_id", uid)
        .maybeSingle()
    ]);
    
    const profile = profileResult.data || {};
    const agent = agentResult.data || {};
    
    // Default business hours
    const defaultHours = {
      monday: { open: "08:00", close: "18:00", closed: false },
      tuesday: { open: "08:00", close: "18:00", closed: false },
      wednesday: { open: "08:00", close: "18:00", closed: false },
      thursday: { open: "08:00", close: "18:00", closed: false },
      friday: { open: "08:00", close: "18:00", closed: false },
      saturday: { open: "09:00", close: "14:00", closed: false },
      sunday: { open: null, close: null, closed: true },
    };
    
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
      notification_preferences: profile.notification_preferences || {
        email_on_booking: true,
        sms_on_booking: true,
        daily_summary: false
      },
      user_personal_phone: profile.user_personal_phone || "",
      // Business hours settings
      business_hours: profile.business_hours || defaultHours,
      business_timezone: profile.business_timezone || "America/Chicago",
      emergency_24_7: profile.emergency_24_7 || false,
      // Post-call SMS settings
      post_call_sms_enabled: agent.post_call_sms_enabled || false,
      post_call_sms_template: agent.post_call_sms_template || "Thanks for calling {business}! We appreciate your call and will follow up shortly if needed.",
      post_call_sms_delay_seconds: agent.post_call_sms_delay_seconds || 60,
      // Confirmation SMS settings
      confirmation_sms_enabled: agent.confirmation_sms_enabled ?? true,
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
      // Business Hours settings
      business_hours,
      business_timezone,
      emergency_24_7,
      // Confirmation SMS and user notifications
      confirmation_sms_enabled,
      user_personal_phone,
    } = req.body;
    
    // Update profile if business_name or review settings provided
    const profileUpdates = {};
    if (business_name !== undefined) profileUpdates.business_name = business_name;
    if (industry !== undefined) profileUpdates.industry = industry;
    if (review_request_enabled !== undefined) profileUpdates.review_request_enabled = review_request_enabled;
    if (google_review_url !== undefined) profileUpdates.google_review_url = google_review_url;
    if (review_request_template !== undefined) profileUpdates.review_request_template = review_request_template;
    // Business hours fields
    if (business_hours !== undefined) profileUpdates.business_hours = business_hours;
    if (business_timezone !== undefined) profileUpdates.business_timezone = business_timezone;
    if (emergency_24_7 !== undefined) profileUpdates.emergency_24_7 = emergency_24_7;
    // User personal phone for notifications (normalize to E.164)
    if (user_personal_phone !== undefined) profileUpdates.user_personal_phone = normalizePhoneE164(user_personal_phone);
    // Notification preferences (stored in profiles)
    if (notification_preferences !== undefined) profileUpdates.notification_preferences = notification_preferences;
    
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
    if (transfer_number !== undefined) agentUpdates.transfer_number = normalizePhoneE164(transfer_number);
    if (service_call_fee !== undefined) agentUpdates.standard_fee = service_call_fee;
    if (emergency_fee !== undefined) agentUpdates.emergency_fee = emergency_fee;
    if (schedule_summary !== undefined) agentUpdates.schedule_summary = schedule_summary;
    if (agent_tone !== undefined) agentUpdates.tone = agent_tone;
    if (industry !== undefined) agentUpdates.industry = industry;
    // Post-call SMS automation fields
    if (post_call_sms_enabled !== undefined) agentUpdates.post_call_sms_enabled = post_call_sms_enabled;
    if (post_call_sms_template !== undefined) agentUpdates.post_call_sms_template = post_call_sms_template;
    if (post_call_sms_delay_seconds !== undefined) agentUpdates.post_call_sms_delay_seconds = post_call_sms_delay_seconds;
    // Confirmation SMS
    if (confirmation_sms_enabled !== undefined) agentUpdates.confirmation_sms_enabled = confirmation_sms_enabled;
    
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
// SESSION MANAGEMENT ENDPOINTS
// ============================================

// GET /api/sessions - Get user's active sessions
app.get("/api/sessions", requireAuth, async (req, res) => {
  try {
    const { data: sessions, error } = await supabaseAdmin
      .from("active_sessions")
      .select("id, device_type, ip_address, last_active_at, created_at")
      .eq("user_id", req.user.id)
      .is("revoked_at", null)
      .order("last_active_at", { ascending: false });
    
    if (error) throw error;
    
    // Mark current session
    const currentTokenHash = req.tokenHash;
    const sessionsWithCurrent = (sessions || []).map(s => ({
      ...s,
      is_current: false, // We can't easily determine this without token hash in response
    }));
    
    return res.json({ sessions: sessionsWithCurrent });
  } catch (err) {
    console.error("[sessions] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/sessions/:sessionId - Revoke a specific session
app.delete("/api/sessions/:sessionId", requireAuth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Verify ownership
    const { data: session } = await supabaseAdmin
      .from("active_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("user_id", req.user.id)
      .maybeSingle();
    
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    
    await supabaseAdmin
      .from("active_sessions")
      .update({ 
        revoked_at: new Date().toISOString(), 
        revoked_reason: "user_revoked" 
      })
      .eq("id", sessionId);
    
    await auditLog({
      userId: req.user.id,
      action: "session_revoked",
      entity: "session",
      entityId: sessionId,
      req,
    });
    
    return res.json({ ok: true, message: "Session revoked" });
  } catch (err) {
    console.error("[session delete] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/sessions - Revoke all sessions (except current)
app.delete("/api/sessions", requireAuth, async (req, res) => {
  try {
    const currentTokenHash = req.tokenHash;
    
    // Revoke all except current
    let query = supabaseAdmin
      .from("active_sessions")
      .update({ 
        revoked_at: new Date().toISOString(), 
        revoked_reason: "user_revoked_all" 
      })
      .eq("user_id", req.user.id)
      .is("revoked_at", null);
    
    // Exclude current session if we have the hash
    if (currentTokenHash) {
      query = query.neq("token_hash", currentTokenHash);
    }
    
    const { data: revoked } = await query.select("id");
    
    await auditLog({
      userId: req.user.id,
      action: "all_sessions_revoked",
      entity: "session",
      req,
      metadata: { revoked_count: revoked?.length || 0 },
    });
    
    return res.json({ ok: true, revoked: revoked?.length || 0 });
  } catch (err) {
    console.error("[session delete all] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/change-password - Change password and revoke other sessions
app.post(
  "/api/change-password",
  requireAuth,
  rateLimit({ keyPrefix: "change-password", limit: 3, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { new_password } = req.body;
      
      if (!new_password || new_password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }
      
      // Update password in Supabase Auth
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
        req.user.id,
        { password: new_password }
      );
      
      if (authError) {
        return res.status(400).json({ error: authError.message });
      }
      
      // Revoke all other sessions (security best practice)
      const currentTokenHash = req.tokenHash;
      if (currentTokenHash) {
        await supabaseAdmin
          .from("active_sessions")
          .update({ 
            revoked_at: new Date().toISOString(), 
            revoked_reason: "password_changed" 
          })
          .eq("user_id", req.user.id)
          .is("revoked_at", null)
          .neq("token_hash", currentTokenHash);
      }
      
      await auditLog({
        userId: req.user.id,
        action: "password_change",
        entity: "user",
        entityId: req.user.id,
        req,
      });
      
      return res.json({ ok: true, message: "Password changed successfully. Other sessions have been logged out." });
    } catch (err) {
      console.error("[change-password] error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

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
    const { payment_email, payment_method } = req.body;
    
    // Check for pending payout requests
    const { data: pendingRequests } = await supabaseAdmin
      .from("payout_requests")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "pending")
      .limit(1);
    
    if (pendingRequests?.length > 0) {
      return res.status(400).json({ 
        error: "You already have a pending payout request. Please wait for it to be processed."
      });
    }
    
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
    
    const commissionIds = (commissions || []).map(c => c.id);
    
    // Get user's payout email from profile if not provided
    let payoutEmail = payment_email;
    if (!payoutEmail) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("payout_email")
        .eq("user_id", userId)
        .maybeSingle();
      payoutEmail = profile?.payout_email;
    }
    
    // Create payout request record
    const { data: payoutRequest, error: payoutError } = await supabaseAdmin
      .from("payout_requests")
      .insert({
        user_id: userId,
        amount_cents: availableCents,
        status: "pending",
        payment_method: payment_method || "paypal",
        payment_email: payoutEmail,
        notes: JSON.stringify({ commission_ids: commissionIds }),
      })
      .select()
      .single();
    
    if (payoutError) {
      // If payout_requests table doesn't exist, fall back to alerts
      console.warn("[referral/request-payout] payout_requests table not found, using alerts fallback");
      await supabaseAdmin.from("alerts").insert({
        alert_type: "payout_request",
        severity: "info",
        user_id: userId,
        message: `Payout requested: $${(availableCents / 100).toFixed(2)}`,
        details: { commission_ids: commissionIds, amount_cents: availableCents },
      });
    } else {
      // Also create an alert for admin notification
      await supabaseAdmin.from("alerts").insert({
        alert_type: "payout_request",
        severity: "info",
        user_id: userId,
        message: `Payout requested: $${(availableCents / 100).toFixed(2)}`,
        details: { 
          payout_request_id: payoutRequest.id,
          commission_ids: commissionIds, 
          amount_cents: availableCents,
          payment_email: payoutEmail,
        },
      });
    }
    
    // Update user's payout email in profile if provided
    if (payment_email) {
      await supabaseAdmin
        .from("profiles")
        .update({ payout_email: payment_email, payout_method: payment_method || "paypal" })
        .eq("user_id", userId);
    }
    
    return res.json({ 
      ok: true, 
      message: `Payout request submitted for $${(availableCents / 100).toFixed(2)}. Admin will process within 3-5 business days.`,
      amount_cents: availableCents,
      request_id: payoutRequest?.id,
    });
  } catch (err) {
    console.error("[referral/request-payout] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// GET /referral/payout-history - Get user's payout request history
app.get("/referral/payout-history", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const { data: requests, error } = await supabaseAdmin
      .from("payout_requests")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    
    if (error) {
      // If table doesn't exist, return empty array
      console.warn("[referral/payout-history] error (table may not exist):", error.message);
      return res.json({ payout_requests: [] });
    }
    
    return res.json({ payout_requests: requests || [] });
  } catch (err) {
    console.error("[referral/payout-history] error:", err.message);
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
    // Try payout_requests table first (new system)
    const { data: payoutRequests, error: payoutError } = await supabaseAdmin
      .from("payout_requests")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (!payoutError && payoutRequests) {
      // Get user emails
      const userIds = [...new Set(payoutRequests.map(p => p.user_id).filter(Boolean))];
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
      
      const formatted = payoutRequests.map(p => ({
        ...p,
        user_email: emailMap[p.user_id] || "Unknown",
      }));
      
      return res.json({ payout_requests: formatted });
    }
    
    // Fallback to alerts table (legacy system)
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

// POST /admin/referral-payout-requests/:id/approve - Approve payout request
app.post("/admin/referral-payout-requests/:id/approve", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { admin_notes } = req.body;
    
    // Update payout request status
    const { data: updated, error } = await supabaseAdmin
      .from("payout_requests")
      .update({
        status: "approved",
        processed_at: new Date().toISOString(),
        admin_notes: admin_notes || null,
      })
      .eq("id", id)
      .select()
      .single();
    
    if (error) {
      console.error("[admin/payout-approve] error:", error.message);
      return res.status(400).json({ error: error.message });
    }
    
    // Log admin action
    await auditLog({
      userId: updated.user_id,
      actorId: req.user.id,
      action: "payout_request_approved",
      entity: "payout_request",
      entityId: id,
      req,
      metadata: { 
        amount_cents: updated.amount_cents,
        notes: admin_notes,
      },
    });
    
    return res.json({ 
      message: "Payout request approved successfully", 
      payout_request: updated 
    });
  } catch (err) {
    console.error("[admin/payout-approve] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /admin/referral-payout-requests/:id/reject - Reject payout request
app.post("/admin/referral-payout-requests/:id/reject", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, admin_notes } = req.body;
    
    // Update payout request status
    const { data: updated, error } = await supabaseAdmin
      .from("payout_requests")
      .update({
        status: "rejected",
        processed_at: new Date().toISOString(),
        rejection_reason: reason || "Rejected by admin",
        admin_notes: admin_notes || null,
      })
      .eq("id", id)
      .select()
      .single();
    
    if (error) {
      console.error("[admin/payout-reject] error:", error.message);
      return res.status(400).json({ error: error.message });
    }
    
    // Log admin action
    await auditLog({
      userId: updated.user_id,
      actorId: req.user.id,
      action: "payout_request_rejected",
      entity: "payout_request",
      entityId: id,
      req,
      metadata: { 
        amount_cents: updated.amount_cents,
        reason: reason || "Rejected by admin",
        notes: admin_notes,
      },
    });
    
    return res.json({ 
      message: "Payout request rejected successfully", 
      payout_request: updated 
    });
  } catch (err) {
    console.error("[admin/payout-reject] error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// POST /admin/referral-payout-requests/:id/mark-paid - Mark payout as paid
app.post("/admin/referral-payout-requests/:id/mark-paid", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_reference, admin_notes } = req.body;
    
    // Update payout request status
    const { data: updated, error } = await supabaseAdmin
      .from("payout_requests")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        payment_reference: payment_reference || null,
        admin_notes: admin_notes || null,
      })
      .eq("id", id)
      .select()
      .single();
    
    if (error) {
      console.error("[admin/payout-mark-paid] error:", error.message);
      return res.status(400).json({ error: error.message });
    }
    
    // Mark corresponding commissions as paid
    const { data: commissions } = await supabaseAdmin
      .from("referral_commissions")
      .select("*")
      .eq("referrer_id", updated.user_id)
      .eq("status", "approved");
    
    if (commissions && commissions.length > 0) {
      await supabaseAdmin
        .from("referral_commissions")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("referrer_id", updated.user_id)
        .eq("status", "approved");
    }
    
    // Log admin action
    await auditLog({
      userId: updated.user_id,
      actorId: req.user.id,
      action: "payout_request_paid",
      entity: "payout_request",
      entityId: id,
      req,
      metadata: { 
        amount_cents: updated.amount_cents,
        payment_reference: payment_reference,
        notes: admin_notes,
        commissions_paid: commissions?.length || 0,
      },
    });
    
    return res.json({ 
      message: "Payout marked as paid successfully", 
      payout_request: updated,
      commissions_updated: commissions?.length || 0,
    });
  } catch (err) {
    console.error("[admin/payout-mark-paid] error:", err.message);
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

// Webhook retry delays (exponential backoff): 30s, 2min, 10min
const WEBHOOK_RETRY_DELAYS = [30_000, 120_000, 600_000];

// Helper: Send outbound webhook with retry support
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
          "X-Kryonex-Timestamp": new Date().toISOString(),
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
        
        const responseBody = await response.text().catch(() => null);
        
        // Log the successful delivery
        await supabaseAdmin.from("webhook_deliveries").insert({
          webhook_id: webhook.id,
          user_id: userId,
          event_type: eventType,
          payload,
          status_code: response.status,
          response_body: responseBody,
          delivered_at: response.ok ? new Date().toISOString() : null,
          delivery_status: response.ok ? "delivered" : "failed",
          retry_count: 0,
          max_retries: 3,
          next_retry_at: response.ok ? null : new Date(Date.now() + WEBHOOK_RETRY_DELAYS[0]).toISOString(),
          last_error: response.ok ? null : `HTTP ${response.status}: ${responseBody?.substring(0, 200) || "No response body"}`,
        });
        
        results.push({ webhook_id: webhook.id, success: response.ok, status: response.status });
        console.log(`🔗 [webhook] Delivered ${eventType} to ${webhook.name}:`, response.status);
      } catch (webhookErr) {
        // Log the failed delivery with retry scheduling
        await supabaseAdmin.from("webhook_deliveries").insert({
          webhook_id: webhook.id,
          user_id: userId,
          event_type: eventType,
          payload,
          error_message: webhookErr.message,
          delivery_status: "failed",
          retry_count: 0,
          max_retries: 3,
          next_retry_at: new Date(Date.now() + WEBHOOK_RETRY_DELAYS[0]).toISOString(),
          last_error: webhookErr.message,
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

// Retry failed webhooks (runs every 30 seconds)
const retryFailedWebhooks = async () => {
  try {
    // Get failed deliveries that are due for retry
    const { data: pending, error } = await supabaseAdmin
      .from("webhook_deliveries")
      .select("*, webhook_configs!inner(url, secret, headers, name, is_active)")
      .eq("delivery_status", "failed")
      .lt("retry_count", 3)
      .lt("next_retry_at", new Date().toISOString())
      .limit(50);
    
    if (error || !pending || pending.length === 0) return;
    
    console.log(`🔗 [webhook-retry] Processing ${pending.length} failed deliveries...`);
    
    for (const delivery of pending) {
      const webhook = delivery.webhook_configs;
      
      // Skip if webhook is now inactive
      if (!webhook?.is_active) {
        await supabaseAdmin
          .from("webhook_deliveries")
          .update({ delivery_status: "cancelled", last_error: "Webhook disabled" })
          .eq("id", delivery.id);
        continue;
      }
      
      try {
        // Build headers
        const headers = {
          "Content-Type": "application/json",
          "X-Kryonex-Event": delivery.event_type,
          "X-Kryonex-Webhook-Id": delivery.webhook_id,
          "X-Kryonex-Timestamp": new Date().toISOString(),
          "X-Kryonex-Retry": String(delivery.retry_count + 1),
          ...(webhook.headers || {}),
        };
        
        // Add HMAC signature if secret is set
        if (webhook.secret) {
          const crypto = require("crypto");
          const signature = crypto
            .createHmac("sha256", webhook.secret)
            .update(JSON.stringify(delivery.payload))
            .digest("hex");
          headers["X-Kryonex-Signature"] = signature;
        }
        
        // Retry the webhook
        const response = await fetch(webhook.url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            event: delivery.event_type,
            timestamp: new Date().toISOString(),
            data: delivery.payload,
            retry: delivery.retry_count + 1,
          }),
          timeout: 10000,
        });
        
        const responseBody = await response.text().catch(() => null);
        const newRetryCount = delivery.retry_count + 1;
        
        if (response.ok) {
          // Success! Update delivery
          await supabaseAdmin
            .from("webhook_deliveries")
            .update({
              delivery_status: "delivered",
              status_code: response.status,
              response_body: responseBody,
              delivered_at: new Date().toISOString(),
              retry_count: newRetryCount,
              next_retry_at: null,
              last_error: null,
            })
            .eq("id", delivery.id);
          console.log(`🔗 [webhook-retry] Success on retry ${newRetryCount} for ${webhook.name}`);
        } else {
          // Failed again
          const nextRetryDelay = WEBHOOK_RETRY_DELAYS[newRetryCount] || null;
          await supabaseAdmin
            .from("webhook_deliveries")
            .update({
              delivery_status: newRetryCount >= 3 ? "exhausted" : "failed",
              status_code: response.status,
              response_body: responseBody,
              retry_count: newRetryCount,
              next_retry_at: nextRetryDelay ? new Date(Date.now() + nextRetryDelay).toISOString() : null,
              last_error: `HTTP ${response.status}: ${responseBody?.substring(0, 200) || "No response"}`,
            })
            .eq("id", delivery.id);
          console.warn(`🔗 [webhook-retry] Retry ${newRetryCount} failed for ${webhook.name}: ${response.status}`);
        }
      } catch (retryErr) {
        // Network/timeout error on retry
        const newRetryCount = delivery.retry_count + 1;
        const nextRetryDelay = WEBHOOK_RETRY_DELAYS[newRetryCount] || null;
        
        await supabaseAdmin
          .from("webhook_deliveries")
          .update({
            delivery_status: newRetryCount >= 3 ? "exhausted" : "failed",
            retry_count: newRetryCount,
            next_retry_at: nextRetryDelay ? new Date(Date.now() + nextRetryDelay).toISOString() : null,
            last_error: retryErr.message,
          })
          .eq("id", delivery.id);
        console.error(`🔗 [webhook-retry] Retry ${newRetryCount} error for ${webhook.name}:`, retryErr.message);
      }
    }
  } catch (err) {
    console.error("[retryFailedWebhooks] error:", err.message);
  }
};

// Start webhook retry interval (every 30 seconds, with distributed locking)
setInterval(async () => {
  const gotLock = await acquireDistributedLock("webhook-retry", 60);
  if (!gotLock) return;
  try {
    await retryFailedWebhooks();
  } finally {
    await releaseDistributedLock("webhook-retry");
  }
}, 30_000);
console.log("🔗 [webhook-retry] Webhook retry system started (30s interval, distributed lock)");

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
    // Graceful fallback if webhook_configs table doesn't exist yet
    if (err.message?.includes("webhook_configs") || err.message?.includes("does not exist")) {
      console.warn("[webhooks GET] webhook_configs table not found - returning empty array");
      return res.json({ webhooks: [] });
    }
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
    // Graceful fallback if webhook_configs table doesn't exist yet
    if (err.message?.includes("webhook_configs") || err.message?.includes("does not exist")) {
      return res.status(503).json({ error: "Webhook feature not available - database migration required" });
    }
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
    // Graceful fallback if webhook_configs table doesn't exist yet
    if (err.message?.includes("webhook_configs") || err.message?.includes("does not exist")) {
      return res.status(503).json({ error: "Webhook feature not available - database migration required" });
    }
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
    // Graceful fallback if webhook_configs table doesn't exist yet
    if (err.message?.includes("webhook_configs") || err.message?.includes("does not exist")) {
      return res.status(503).json({ error: "Webhook feature not available - database migration required" });
    }
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
    // Graceful fallback if webhook_configs table doesn't exist yet
    if (err.message?.includes("webhook_configs") || err.message?.includes("does not exist")) {
      return res.status(503).json({ error: "Webhook feature not available - database migration required" });
    }
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
    // Graceful fallback if tables don't exist yet
    if (err.message?.includes("webhook_configs") || err.message?.includes("webhook_deliveries") || err.message?.includes("does not exist")) {
      return res.json({ deliveries: [] });
    }
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/webhooks/:webhookId/deliveries/:deliveryId/retry - Manual retry
app.post(
  "/api/webhooks/:webhookId/deliveries/:deliveryId/retry",
  requireAuth,
  resolveEffectiveUser,
  rateLimit({ keyPrefix: "webhook-retry-manual", limit: 10, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const uid = req.effectiveUserId ?? req.user.id;
      const { webhookId, deliveryId } = req.params;
      
      // Verify ownership
      const { data: webhook } = await supabaseAdmin
        .from("webhook_configs")
        .select("id, url, secret, headers, name, is_active")
        .eq("id", webhookId)
        .eq("user_id", uid)
        .maybeSingle();
      
      if (!webhook) {
        return res.status(404).json({ error: "Webhook not found" });
      }
      
      if (!webhook.is_active) {
        return res.status(400).json({ error: "Webhook is disabled" });
      }
      
      // Get the delivery
      const { data: delivery } = await supabaseAdmin
        .from("webhook_deliveries")
        .select("*")
        .eq("id", deliveryId)
        .eq("webhook_id", webhookId)
        .maybeSingle();
      
      if (!delivery) {
        return res.status(404).json({ error: "Delivery not found" });
      }
      
      if (delivery.delivery_status === "delivered") {
        return res.status(400).json({ error: "Delivery already succeeded" });
      }
      
      // Retry the webhook
      try {
        const headers = {
          "Content-Type": "application/json",
          "X-Kryonex-Event": delivery.event_type,
          "X-Kryonex-Webhook-Id": webhookId,
          "X-Kryonex-Timestamp": new Date().toISOString(),
          "X-Kryonex-Retry": "manual",
          ...(webhook.headers || {}),
        };
        
        if (webhook.secret) {
          const crypto = require("crypto");
          const signature = crypto
            .createHmac("sha256", webhook.secret)
            .update(JSON.stringify(delivery.payload))
            .digest("hex");
          headers["X-Kryonex-Signature"] = signature;
        }
        
        const response = await fetch(webhook.url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            event: delivery.event_type,
            timestamp: new Date().toISOString(),
            data: delivery.payload,
            retry: "manual",
          }),
          timeout: 10000,
        });
        
        const responseBody = await response.text().catch(() => null);
        
        // Update delivery record
        await supabaseAdmin
          .from("webhook_deliveries")
          .update({
            delivery_status: response.ok ? "delivered" : "failed",
            status_code: response.status,
            response_body: responseBody,
            delivered_at: response.ok ? new Date().toISOString() : null,
            retry_count: (delivery.retry_count || 0) + 1,
            last_error: response.ok ? null : `HTTP ${response.status}: ${responseBody?.substring(0, 200) || "No response"}`,
          })
          .eq("id", deliveryId);
        
        if (response.ok) {
          return res.json({ success: true, message: "Delivery retried successfully" });
        } else {
          return res.status(200).json({ success: false, message: `Retry failed: HTTP ${response.status}` });
        }
      } catch (retryErr) {
        // Update delivery with error
        await supabaseAdmin
          .from("webhook_deliveries")
          .update({
            retry_count: (delivery.retry_count || 0) + 1,
            last_error: retryErr.message,
          })
          .eq("id", deliveryId);
        
        return res.status(200).json({ success: false, message: `Retry failed: ${retryErr.message}` });
      }
    } catch (err) {
      console.error("[webhook manual retry] error:", err.message);
      // Graceful fallback if tables don't exist yet
      if (err.message?.includes("webhook_configs") || err.message?.includes("webhook_deliveries") || err.message?.includes("does not exist")) {
        return res.status(503).json({ error: "Webhook feature not available - database migration required" });
      }
      return res.status(500).json({ error: err.message });
    }
  }
);

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

// GET /admin/messages - List all SMS messages across all tenants
app.get("/admin/messages", requireAuth, requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 200;
    const offset = parseInt(req.query.offset) || 0;
    
    // Get messages with user profile info for business name
    const { data: messages, error } = await supabaseAdmin
      .from("messages")
      .select(`
        id,
        user_id,
        lead_id,
        direction,
        from_number,
        to_number,
        body,
        keyword_detected,
        auto_handled,
        routing_method,
        created_at,
        profiles:user_id(business_name)
      `)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("[admin/messages] DB error:", error);
      return res.status(500).json({ error: error.message });
    }

    // Flatten the profile data
    const formattedMessages = (messages || []).map(msg => ({
      id: msg.id,
      user_id: msg.user_id,
      lead_id: msg.lead_id,
      direction: msg.direction,
      from_number: msg.from_number,
      to_number: msg.to_number,
      body: msg.body,
      keyword_detected: msg.keyword_detected,
      auto_handled: msg.auto_handled,
      routing_method: msg.routing_method,
      created_at: msg.created_at,
      business_name: msg.profiles?.business_name || null
    }));

    return res.json({ messages: formattedMessages });
  } catch (err) {
    console.error("[admin/messages] Error:", err);
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
        flagged_for_review,
        lead:leads(id, name, business_name, phone, summary, transcript, sentiment, status, issue_type, appointment_booked, service_address, flagged_for_review)
      `
      )
      .eq("seller_id", uid)
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    const recordings = (data || []).map((row) => ({
      ...row,
      caller_name: row.lead?.business_name || row.lead?.name || "Unknown Caller",
      caller_phone: row.lead?.phone || "--",
      transcript: row.lead?.transcript || row.lead?.summary || "",
      summary: row.lead?.summary || "",
      sentiment: row.lead?.sentiment || null,
      status: row.lead?.status || row.outcome || "Inquiry",
      issue_type: row.lead?.issue_type || null,
      appointment_booked: row.lead?.appointment_booked || false,
      service_address: row.lead?.service_address || null,
      flagged_for_review: row.flagged_for_review || row.lead?.flagged_for_review || false,
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

// Import leads from external sources (paste list from AI, spreadsheet, etc.)
app.post(
  "/admin/import-leads",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "import-leads", limit: 20, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { leads } = req.body || {};
      if (!Array.isArray(leads) || leads.length === 0) {
        return res.status(400).json({ error: "leads array is required" });
      }

      // Limit to 500 leads per import
      if (leads.length > 500) {
        return res.status(400).json({ error: "Maximum 500 leads per import" });
      }

      // Normalize phone numbers to E.164
      const normalizePhone = (phone) => {
        if (!phone) return "";
        const digits = phone.replace(/\D/g, "");
        if (digits.length === 10) return `+1${digits}`;
        if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
        if (digits.length > 10) return `+${digits}`;
        return phone;
      };

      // Build rows for insert - use only columns that exist in leads table
      const rows = leads.map((lead) => ({
        user_id: req.user.id, // Admin owns imported leads
        owner_id: req.user.id,
        name: (lead.business_name || lead.contact || "Unknown").substring(0, 200),
        phone: normalizePhone(lead.phone || ""),
        status: "new",
        summary: lead.email ? `Imported lead. Email: ${lead.email}` : "Imported lead",
      }));

      const { data, error } = await supabaseAdmin
        .from("leads")
        .insert(rows)
        .select("id");

      if (error) {
        console.error("[import-leads] DB error:", error);
        return res.status(500).json({ error: error.message });
      }

      console.log(`[import-leads] Imported ${data?.length || 0} leads by admin ${req.user.id}`);
      return res.json({ inserted: data?.length || 0 });
    } catch (err) {
      console.error("[import-leads] Error:", err);
      trackError({ type: "import_leads_error", error: err.message, userId: req.user?.id });
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
  validateBody({
    body: { required: true, type: "string", minLength: 1, maxLength: 1600 },
    to: { type: "string", maxLength: 20 },
    leadId: { type: "string", maxLength: 50 },
    source: { type: "string", maxLength: 50 },
    appointmentId: { type: "string", maxLength: 50 },
  }),
  async (req, res) => {
    try {
      const uid = req.effectiveUserId ?? req.user.id;
      const { leadId, to, body, source } = req.body || {};
      // Sanitize inputs
      const sanitizedBody = sanitizeString(body, 1600);
      if (!sanitizedBody) {
        return res.status(400).json({ error: "Message body is required" });
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

      // Note: sendSmsInternal already inserts to messages table and handles audit logging
      // No need to duplicate here

      return res.json({ sent: true, sandbox: isSandbox, data: retellResponse });
    } catch (err) {
      // Handle specific error codes from bulletproof SMS system
      if (err.code === "USAGE_CAP_REACHED") {
        return res.status(402).json({ error: "USAGE_CAP_REACHED" });
      }
      if (err.code === "FREEFORM_NOT_ALLOWED") {
        return res.status(400).json({ error: "FREEFORM_NOT_ALLOWED", message: err.message });
      }
      if (err.code === "OUTBOUND_THROTTLE") {
        return res.status(429).json({ error: "OUTBOUND_THROTTLE", message: err.message });
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

// =============================================================================
// BULLETPROOF SMS INBOUND HANDLER
// Implements: Thread locking, collision detection, rate limiting, keyword handling
// =============================================================================
app.post("/webhooks/sms-inbound", async (req, res) => {
  const receivedAt = new Date().toISOString();
  try {
    const payload = req.body || {};
    const toNumber = payload.to_number || payload.to || payload.phone_number;
    const fromNumber = payload.from_number || payload.from || payload.sender;
    const body = payload.body || payload.text || payload.message || "";
    const messageSid = payload.message_sid || payload.sid || payload.id || null;
    
    console.log("[sms-inbound] Received:", { fromNumber, toNumber, body: body.slice(0, 50) });
    
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
    
    const normalizedFromNumber = normalizePhoneForLookup(fromNumber);
    
    // Persist raw webhook immediately (before processing)
    await persistRawWebhook({
      phoneNumber: toNumber,
      eventType: "sms_inbound",
      rawPayload: payload,
      idempotencyKey,
    });
    
    // ==========================================================================
    // STEP 0: Check per-customer rate limit FIRST (prevent spam)
    // ==========================================================================
    const rateLimitCheck = await checkInboundRateLimit(normalizedFromNumber);
    if (!rateLimitCheck.allowed) {
      console.warn("[sms-inbound] Rate limit exceeded:", { fromNumber: normalizedFromNumber, reason: rateLimitCheck.reason });
      
      // Send one-time rate limit response (only if not already blocked today)
      if (rateLimitCheck.reason === "rate_limit_10min") {
        await sendAutoReply({
          toNumber: fromNumber,
          body: "Too many messages. Please wait a few minutes or call the office directly.",
          source: "system_rate_limit",
        });
      }
      
      await markWebhookProcessed(idempotencyKey, "rate_limited", rateLimitCheck.reason);
      return res.json({ ok: true, rate_limited: true, reason: rateLimitCheck.reason });
    }
    
    // ==========================================================================
    // STEP 1: Detect keyword FIRST (before routing) for special handling
    // ==========================================================================
    const detectedKeyword = detectKeyword(body);
    console.log("[sms-inbound] Keyword detection:", detectedKeyword);
    
    // ==========================================================================
    // STEP 2: Check for pending collision disambiguation
    // ==========================================================================
    const pendingCollision = await getPendingCollision(normalizedFromNumber);
    if (pendingCollision && detectedKeyword?.type === "COLLISION_CHOICE") {
      // Customer is responding to "Which business?" prompt
      const choice = detectedKeyword.choice;
      const tenantIds = pendingCollision.tenant_ids || [];
      
      if (choice >= 1 && choice <= tenantIds.length) {
        const selectedTenantId = tenantIds[choice - 1];
        await resolveCollision(pendingCollision.id, choice, selectedTenantId);
        
        // Update thread owner with their choice
        const businessNames = pendingCollision.business_names || [];
        await updateThreadOwner({
          toNumber: normalizedFromNumber,
          tenantId: selectedTenantId,
          businessName: businessNames[choice - 1] || null,
        });
        
        // Get business phone for "call us" message
        const businessPhone = await getBusinessPhone(selectedTenantId);
        await sendAutoReply({
          toNumber: fromNumber,
          body: `Got it! For ${businessNames[choice - 1] || "that business"}, please call ${businessPhone || "the office"} or we'll reach out shortly.`,
          source: "system_disambiguation",
        });
        
        await logKeywordResponse({
          fromNumber: normalizedFromNumber,
          tenantId: selectedTenantId,
          keyword: `collision_choice_${choice}`,
          originalBody: body,
          autoResponse: "Collision resolved",
          action: "collision_resolved",
        });
        
        await markWebhookProcessed(idempotencyKey, "success", "collision_resolved");
        return res.json({ ok: true, collision_resolved: true, tenant_id: selectedTenantId });
      }
    }
    
    // ==========================================================================
    // STEP 3: BULLETPROOF ROUTING - Thread lock > Recent outbound > Lead match
    // ==========================================================================
    let userId = null;
    let agentId = null;
    let routingMethod = null;
    let businessName = null;
    
    // Check if this is a shared number (MASTER_SMS_NUMBER)
    const isSharedNumber = MASTER_SMS_NUMBER && (toNumber === MASTER_SMS_NUMBER || normalizePhoneForLookup(toNumber) === normalizePhoneForLookup(MASTER_SMS_NUMBER));
    
    if (isSharedNumber) {
      console.log("[sms-inbound] Shared number mode - bulletproof routing");
      
      // STEP A: Check phone_thread_owner (sticky lock) - STRONGEST
      const threadOwner = await getThreadOwner(normalizedFromNumber);
      if (threadOwner?.tenant_id) {
        userId = threadOwner.tenant_id;
        businessName = threadOwner.business_name;
        routingMethod = "thread_lock";
        console.log("[sms-inbound] Routed via thread lock to:", userId);
      }
      
      // STEP B+C COMBINED: Check for collisions FIRST, then route if safe
      // This ensures we never skip collision detection when thread lock is expired
      if (!userId) {
        const collisionCheck = await checkCollision(normalizedFromNumber);
        
        if (collisionCheck.hasCollision && collisionCheck.tenants.length > 1) {
          // Multiple tenants - send disambiguation prompt
          console.log("[sms-inbound] COLLISION DETECTED:", collisionCheck.tenants.map(t => t.business_name));
          
          const options = collisionCheck.tenants.map((t, i) => `${i + 1} for ${t.business_name}`).join(", ");
          await sendAutoReply({
            toNumber: fromNumber,
            body: `Which business is this about? Reply ${options}`,
            source: "system_disambiguation",
          });
          
          await logCollision({
            fromNumber: normalizedFromNumber,
            tenants: collisionCheck.tenants,
            disambiguationSent: true,
          });
          
          // Store the message but mark as pending collision
          await supabaseAdmin.from("messages").insert({
            user_id: collisionCheck.tenants[0].tenant_id, // Temporarily assign to first
            direction: "inbound",
            body,
            from_number: normalizedFromNumber,
            to_number: toNumber,
            keyword_detected: "collision_pending",
            auto_handled: false,
            routing_method: "collision_pending",
          });
          
          await markWebhookProcessed(idempotencyKey, "collision_pending");
          return res.json({ ok: true, collision_pending: true, tenants: collisionCheck.tenants.length });
        } else if (collisionCheck.tenants.length === 1) {
          // Only one tenant - safe to route
          userId = collisionCheck.tenants[0].tenant_id;
          businessName = collisionCheck.tenants[0].business_name;
          routingMethod = "single_tenant_history";
          console.log("[sms-inbound] Routed via single tenant history to:", userId);
        }
      }
      
      // STEP D: Fallback - Check leads table
      if (!userId) {
        const { data: leadMatch } = await supabaseAdmin
          .from("leads")
          .select("user_id")
          .eq("phone", normalizedFromNumber)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (leadMatch?.user_id) {
          userId = leadMatch.user_id;
          routingMethod = "lead_match";
          console.log("[sms-inbound] Routed via lead match to:", userId);
        }
      }
      
      // STEP E: UNKNOWN NUMBER - Cannot route, respond with "call the office"
      if (!userId) {
        console.warn("[sms-inbound] UNKNOWN NUMBER - no routing possible:", normalizedFromNumber);
        
        await sendAutoReply({
          toNumber: fromNumber,
          body: "I don't see an active conversation with this number. Please call the office directly for assistance.",
          source: "system_unknown",
        });
        
        await storeUnknownPhone({
          phoneNumber: normalizedFromNumber,
          eventType: "sms_inbound_unknown",
          rawPayload: { ...payload, routing_note: "No thread lock, no recent outbound, no lead match" },
        });
        
        await markWebhookProcessed(idempotencyKey, "unknown_number");
        return res.json({ ok: true, unknown_number: true });
      }
    } else {
      // DEDICATED NUMBER: Route by agent phone number (original logic)
      const { data: agentRow } = await supabaseAdmin
        .from("agents")
        .select("user_id, agent_id")
        .eq("phone_number", toNumber)
        .maybeSingle();
      
      if (!agentRow?.user_id) {
        await storeUnknownPhone({ phoneNumber: toNumber, eventType: "sms_inbound", rawPayload: payload });
        await markWebhookProcessed(idempotencyKey, "failed", "Agent not found for number");
        return res.status(404).json({ error: "Agent not found for number" });
      }
      
      userId = agentRow.user_id;
      agentId = agentRow.agent_id;
      routingMethod = "agent_phone_number";
    }
    
    // ==========================================================================
    // STEP 4: Get business info for keyword responses
    // ==========================================================================
    if (!businessName) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("business_name")
        .eq("user_id", userId)
        .maybeSingle();
      businessName = profile?.business_name || "the business";
    }
    const businessPhone = await getBusinessPhone(userId);
    
    // ==========================================================================
    // STEP 5: KEYWORD HANDLING - Auto-respond to known keywords
    // ==========================================================================
    let autoHandled = false;
    let autoResponse = null;
    let actionTaken = null;
    
    if (detectedKeyword) {
      switch (detectedKeyword.type) {
        case "OPT_OUT": {
          // GLOBAL STOP - opt out from ALL tenants on this shared number (safest for carrier compliance)
          // This prevents complaints when customer says STOP but another tenant tries to message them
          await supabaseAdmin.from("sms_opt_outs").upsert({
            user_id: userId,
            phone: normalizedFromNumber,
            global_opt_out: true,  // Mark as global for shared number
          }, { onConflict: "user_id,phone" });
          
          // Also insert a global opt-out record (no user_id) for master number blocking
          if (MASTER_SMS_NUMBER) {
            await supabaseAdmin.from("sms_opt_outs").upsert({
              phone: normalizedFromNumber,
              global_opt_out: true,
              opted_out_at: new Date().toISOString(),
            }, { onConflict: "phone", ignoreDuplicates: true }).catch((err) => {
              console.error("[sms-inbound] failed to upsert global opt-out", { phone: normalizedFromNumber, error: err.message });
            });
          }
          
          autoResponse = `You've been unsubscribed and will no longer receive texts from this number. Call the office directly if you need service.`;
          await sendAutoReply({ toNumber: fromNumber, body: autoResponse, source: "system_opt_out" });
          autoHandled = true;
          actionTaken = "global_opt_out";
          console.log("[sms-inbound] GLOBAL OPT_OUT processed for:", normalizedFromNumber);
          break;
        }
        
        case "OPT_IN": {
          // Re-subscribe: Remove from opt-out list
          await supabaseAdmin
            .from("sms_opt_outs")
            .delete()
            .eq("phone", normalizedFromNumber);
          
          // Also remove global opt-out
          await supabaseAdmin
            .from("sms_opt_outs")
            .delete()
            .eq("phone", normalizedFromNumber)
            .eq("global_opt_out", true);
          
          autoResponse = `You've been re-subscribed to notifications. Reply STOP anytime to opt out.`;
          await sendAutoReply({ toNumber: fromNumber, body: autoResponse, source: "system_opt_in" });
          autoHandled = true;
          actionTaken = "opt_in";
          console.log("[sms-inbound] OPT_IN processed for:", normalizedFromNumber);
          break;
        }
        
        case "HELP": {
          // Carrier-compliant HELP response with required elements
          autoResponse = `${businessName}: Service appointment notifications. Msg frequency varies. Reply STOP to opt out. For help call ${businessPhone || "the office"}.`;
          await sendAutoReply({ toNumber: fromNumber, body: autoResponse, source: "system_help" });
          autoHandled = true;
          actionTaken = "help_sent";
          break;
        }
        
        case "CONFIRM": {
          // Find pending appointment for this customer
          const { data: pendingAppt } = await supabaseAdmin
            .from("appointments")
            .select("id, start_time")
            .eq("user_id", userId)
            .eq("customer_phone", normalizedFromNumber)
            .in("status", ["booked", "pending"])
            .gte("start_time", new Date().toISOString())
            .order("start_time", { ascending: true })
            .limit(1)
            .maybeSingle();
          
          if (pendingAppt) {
            await supabaseAdmin.from("appointments").update({ status: "confirmed" }).eq("id", pendingAppt.id);
            actionTaken = "appointment_confirmed";
            autoHandled = true;
            // No auto-response needed for confirmation - just log it
          } else {
            actionTaken = "confirm_no_appointment";
          }
          break;
        }
        
        case "DECLINE": {
          actionTaken = "declined";
          // Log but don't auto-respond - let business handle
          break;
        }
        
        case "RESCHEDULE": {
          // Get reschedule link or phone
          autoResponse = `To reschedule with ${businessName}, please call ${businessPhone || "the office"}.`;
          await sendAutoReply({ toNumber: fromNumber, body: autoResponse, source: "system_reschedule" });
          autoHandled = true;
          actionTaken = "reschedule_link_sent";
          break;
        }
        
        default:
          actionTaken = "logged";
      }
      
      // Log keyword response
      await logKeywordResponse({
        fromNumber: normalizedFromNumber,
        tenantId: userId,
        keyword: detectedKeyword.keyword,
        originalBody: body,
        autoResponse,
        action: actionTaken,
      });
    }
    
    // ==========================================================================
    // STEP 6: Store message and finalize
    // ==========================================================================
    await storeSmsEvent({
      idempotencyKey,
      phoneNumber: toNumber,
      userId,
      agentId,
      messageSid,
      direction: "inbound",
      fromNumber: normalizedFromNumber,
      toNumber,
      body,
      status: "received",
      rawPayload: payload,
    });
    
    await supabaseAdmin.from("messages").insert({
      user_id: userId,
      direction: "inbound",
      body,
      from_number: normalizedFromNumber,
      to_number: toNumber,
      keyword_detected: detectedKeyword?.keyword || null,
      auto_handled: autoHandled,
      routing_method: routingMethod,
    });
    
    await auditLog({
      userId,
      action: "sms_received",
      entity: "message",
      entityId: agentId || null,
      metadata: {
        from: normalizedFromNumber,
        to: toNumber,
        routing_method: routingMethod,
        keyword: detectedKeyword?.type || null,
        auto_handled: autoHandled,
      },
    });
    
    await logEvent({
      userId,
      actionType: "SMS_RECEIVED",
      req,
      metaData: {
        direction: "inbound",
        body: body.slice(0, 100),
        from: normalizedFromNumber,
        to: toNumber,
        routing_method: routingMethod,
        keyword_detected: detectedKeyword?.keyword || null,
        auto_handled: autoHandled,
      },
    });
    
    await markWebhookProcessed(idempotencyKey, "success");
    
    return res.json({
      ok: true,
      routing_method: routingMethod,
      keyword_detected: detectedKeyword?.type || null,
      auto_handled: autoHandled,
    });
    
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
    
    // Check ALL usage limit conditions including hard_stop_active
    const usedSeconds = usage.call_used_seconds || 0;
    const capSeconds = usage.call_cap_seconds || 0;
    const graceSeconds = usage.grace_seconds ?? 600;
    const overCapPlusGrace = usedSeconds >= capSeconds + graceSeconds;
    const hardStop = usage.hard_stop_active === true || overCapPlusGrace;
    
    if (
      hardStop ||
      (usage.force_pause && !usage.force_resume) ||
      usage.limit_state === "paused" ||
      remaining <= 0
    ) {
      console.warn("[retell-inbound] Call blocked due to usage limits:", {
        user_id: agentRow.user_id,
        hardStop,
        hard_stop_active: usage.hard_stop_active,
        overCapPlusGrace,
        usedSeconds,
        capSeconds,
        graceSeconds,
        remaining,
        limit_state: usage.limit_state,
        force_pause: usage.force_pause,
      });
      return res.status(402).json({ error: "Usage limit reached" });
    }

    const [{ data: profile }, { data: integration }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("business_name, cal_com_url, industry")
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
      supabaseAdmin.from("profiles").update({ business_name: agentNickname }).eq("user_id", agentRow.user_id)
        .then(() => console.info("[retell-inbound] backfilled business_name from nickname", { userId: agentRow.user_id }))
        .catch((err) => console.error("[retell-inbound] failed to backfill business_name", { userId: agentRow.user_id, error: err.message }));
    }
    // Determine if calendar booking is available
    const calendarLink = profile?.cal_com_url || integration?.booking_url || "";
    const calendarEnabled = Boolean(calendarLink);
    
    // Get current date/time for agent context (prevents booking in wrong month/year)
    const dateTimeVars = getCurrentDateTimeVars("America/New_York");
    
    const dynamicVariables = {
      business_name: businessName,
      primary_service: String(formatPrimaryService(profile?.industry) || ""),
      cal_com_link: String(calendarLink),
      calendar_enabled: calendarEnabled ? "true" : "false",
      transfer_number: String(agentRow.transfer_number || ""),
      agent_tone: String(agentRow.tone || "Calm & Professional"),
      schedule_summary: String(agentRow.schedule_summary || ""),
      standard_fee: String(agentRow.standard_fee != null ? agentRow.standard_fee : ""),
      emergency_fee: String(agentRow.emergency_fee != null ? agentRow.emergency_fee : ""),
      // Date/time awareness - critical for accurate appointment booking
      ...dateTimeVars,
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
          begin_message: `Hi, thanks for calling {{business_name}} — this is Grace. Quick question so I can route you correctly: Are you calling to (1) book new service, (2) reschedule an existing appointment, or (3) cancel an existing appointment?`,
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
// Security is handled via RETELL_API_KEY signature verification in retellWebhookHandler
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
      const normalizedTo = normalizePhoneE164(to);
      if (!normalizedTo) {
        return res.status(400).json({ error: "Invalid phone number format" });
      }
      if (!RETELL_DEMO_AGENT_ID || !RETELL_DEMO_FROM_NUMBER) {
        return res
          .status(500)
          .json({ error: "Retell demo call is not configured" });
      }

      // Include date/time variables for accurate booking
      const dateTimeVars = getCurrentDateTimeVars("America/New_York");
      
      const payload = {
        from_number: RETELL_DEMO_FROM_NUMBER,
        to_number: normalizedTo,
        override_agent_id: RETELL_DEMO_AGENT_ID,
        retell_llm_dynamic_variables: {
          ...(name ? { customer_name: name } : {}),
          ...dateTimeVars,
        },
        metadata: {
          source: "admin_sniper_kit",
          lead_id: leadId || null,
          user_id: req.user.id,
        },
      };

      const retellResponse = await retellClient.post(
        "/v2/create-phone-call",
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
  validateBody({
    customer_name: { required: true, type: "string", minLength: 1, maxLength: 200 },
    customer_phone: { type: "string", maxLength: 20 },
    start_date: { required: true, type: "string", maxLength: 20 },
    start_time: { required: true, type: "string", maxLength: 10 },
    duration_minutes: { type: "string", maxLength: 10 },
    location: { type: "string", maxLength: 500 },
    notes: { type: "string", maxLength: 2000 },
    reminder_minutes: { type: "string", maxLength: 10 },
  }),
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
        tracking_enabled,
      } = req.body || {};

      // Sanitize inputs
      const sanitizedName = sanitizeString(customer_name, 200);
      const sanitizedPhone = customer_phone ? sanitizePhone(customer_phone) : null;
      const sanitizedLocation = location ? sanitizeString(location, 500) : null;
      const sanitizedNotes = notes ? sanitizeString(notes, 2000) : null;

      if (!sanitizedName || !start_date || !start_time) {
        return res
          .status(400)
          .json({ error: "customer_name, start_date, start_time are required" });
      }

      const [year, month, day] = String(start_date).split("-").map(Number);
      const [hour, minute] = String(start_time).split(":").map(Number);
      const startTime = new Date(year, month - 1, day, hour, minute);
      const durationMinutes = parseInt(duration_minutes || "60", 10);
      const endTime = new Date(startTime.getTime() + durationMinutes * 60000);

      // Check Cal.com integration and sync if connected
      let calBookingUid = null;
      try {
        const calConfig = await getCalConfig(uid);
        if (calConfig) {
          console.log("[appointments] Cal.com connected, creating booking...");
          const calBooking = await createCalBooking({
            config: calConfig,
            userId: uid,
            start: startTime,
            args: {
              customer_name,
              customer_phone,
              duration_minutes: durationMinutes,
              notes,
            },
          });
          calBookingUid = calBooking?.uid || calBooking?.id || null;
          console.log("[appointments] Cal.com booking created:", calBookingUid);
        }
      } catch (calErr) {
        console.warn("[appointments] Cal.com sync failed (continuing with local):", calErr.message);
        // Continue with local appointment even if Cal.com fails
      }

      // Auto-create tracking session if enabled
      let etaLink = null;
      let trackingUrls = null;
      if (tracking_enabled && sanitizedPhone) {
        try {
          const token = generateToken(12);
          const updateKey = generateToken(16);
          const eta = parseInt(eta_minutes || "10", 10);

          const { data: trackingData } = await supabaseAdmin
            .from("tracking_sessions")
            .insert({
              token,
              update_key: updateKey,
              created_by: uid,
              customer_phone: sanitizedPhone,
              eta_minutes: eta,
              status: "active",
            })
            .select("*")
            .single();

          if (trackingData) {
            etaLink = `${FRONTEND_URL}/track/${token}`;
            trackingUrls = {
              customer_url: etaLink,
              tech_url: `${FRONTEND_URL}/tech/track/${token}?key=${updateKey}`,
            };
            console.log("[appointments] Tracking session created:", token);
          }
        } catch (trackErr) {
          console.warn("[appointments] Tracking creation failed:", trackErr.message);
        }
      }

      const { data, error } = await supabaseAdmin
        .from("appointments")
        .insert({
          user_id: uid,
          customer_name: sanitizedName,
          customer_phone: sanitizedPhone,
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          location: sanitizedLocation,
          notes: sanitizedNotes,
          reminder_minutes: parseInt(reminder_minutes || "0", 10),
          reminder_enabled: Boolean(reminder_enabled),
          eta_enabled: Boolean(eta_enabled),
          eta_minutes: parseInt(eta_minutes || "10", 10),
          eta_link: etaLink,
          cal_booking_uid: calBookingUid,
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

      // Send appointment_booked webhook (API endpoint)
      sendOutboundWebhook(uid, "appointment_booked", {
        appointment_id: data?.id || null,
        cal_booking_uid: calBookingUid || null,
        user_id: uid,
        customer_name: data?.customer_name || customer_name,
        customer_phone: data?.customer_phone || customer_phone || null,
        start_time: data?.start_time || startTime.toISOString(),
        end_time: data?.end_time || endTime.toISOString(),
        location: data?.location || location || null,
        notes: data?.notes || notes || null,
        source: "api",
        eta_link: etaLink || null,
        created_at: new Date().toISOString(),
      }).catch(err => console.error("[webhook] appointment_booked (api) error:", err.message));

      return res.json({ 
        appointment: data,
        cal_synced: Boolean(calBookingUid),
        tracking: trackingUrls,
      });
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

// Cancel appointment - syncs with Cal.com if linked
app.delete(
  "/appointments/:id",
  requireAuth,
  resolveEffectiveUser,
  rateLimit({ keyPrefix: "appointments-delete", limit: 30, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const uid = req.effectiveUserId ?? req.user.id;
      const { id } = req.params || {};
      const { reason } = req.body || {};
      if (!id) {
        return res.status(400).json({ error: "appointment id is required" });
      }

      // Get appointment first to check for Cal.com booking
      const { data: appointment, error: fetchError } = await supabaseAdmin
        .from("appointments")
        .select("id, cal_booking_uid, customer_name, customer_phone")
        .eq("id", id)
        .eq("user_id", uid)
        .maybeSingle();

      if (fetchError || !appointment) {
        return res.status(404).json({ error: "Appointment not found" });
      }

      // Cancel in Cal.com if linked
      let calCancelled = false;
      if (appointment.cal_booking_uid) {
        try {
          const calConfig = await getCalConfig(uid);
          if (calConfig?.cal_access_token) {
            await calApiWithRetry(uid, async () => {
              const freshConfig = await getCalConfig(uid);
              const token = freshConfig?.cal_access_token || calConfig.cal_access_token;
              await calClient.post(`/bookings/${appointment.cal_booking_uid}/cancel`, {
                cancellationReason: reason || "Cancelled by business",
              }, {
                headers: {
                  Authorization: `Bearer ${token}`,
                  "cal-api-version": CAL_API_VERSION_BOOKINGS,
                },
              });
            });
            calCancelled = true;
            console.log("[appointments] Cal.com booking cancelled:", appointment.cal_booking_uid);
          }
        } catch (calErr) {
          console.warn("[appointments] Cal.com cancel failed:", calErr.message);
          // Continue with local delete even if Cal.com fails
        }
      }

      // Update local appointment to cancelled (or delete)
      const { error } = await supabaseAdmin
        .from("appointments")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", uid);

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.json({ ok: true, status: "cancelled", cal_synced: calCancelled });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

// Reschedule appointment - syncs with Cal.com if linked
app.patch(
  "/appointments/:id/reschedule",
  requireAuth,
  resolveEffectiveUser,
  rateLimit({ keyPrefix: "appointments-reschedule", limit: 20, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const uid = req.effectiveUserId ?? req.user.id;
      const { id } = req.params || {};
      const { new_start_time_iso, new_start_date, new_start_time, duration_minutes } = req.body || {};

      if (!id) {
        return res.status(400).json({ error: "appointment id is required" });
      }

      // Parse new start time
      let newStart;
      if (new_start_time_iso) {
        newStart = new Date(new_start_time_iso);
      } else if (new_start_date && new_start_time) {
        newStart = new Date(`${new_start_date}T${new_start_time}`);
      }
      if (!newStart || isNaN(newStart.getTime())) {
        return res.status(400).json({ error: "Valid new start time required (new_start_time_iso or new_start_date + new_start_time)" });
      }

      // Get existing appointment
      const { data: appointment, error: fetchError } = await supabaseAdmin
        .from("appointments")
        .select("*")
        .eq("id", id)
        .eq("user_id", uid)
        .maybeSingle();

      if (fetchError || !appointment) {
        return res.status(404).json({ error: "Appointment not found" });
      }

      // Calculate new end time
      const durationMs = (duration_minutes || 60) * 60 * 1000;
      const newEnd = new Date(newStart.getTime() + durationMs);

      // Reschedule in Cal.com if linked
      let calRescheduled = false;
      let newCalBookingUid = appointment.cal_booking_uid;
      if (appointment.cal_booking_uid) {
        try {
          const calConfig = await getCalConfig(uid);
          if (calConfig?.cal_access_token) {
            const calResult = await calApiWithRetry(uid, async () => {
              const freshConfig = await getCalConfig(uid);
              const token = freshConfig?.cal_access_token || calConfig.cal_access_token;
              const response = await calClient.post(
                `/bookings/${appointment.cal_booking_uid}/reschedule`,
                { start: newStart.toISOString() },
                {
                  headers: {
                    Authorization: `Bearer ${token}`,
                    "cal-api-version": CAL_API_VERSION_BOOKINGS,
                    "Content-Type": "application/json",
                  },
                }
              );
              return response.data?.data || response.data;
            });
            calRescheduled = true;
            newCalBookingUid = calResult?.uid || calResult?.id || appointment.cal_booking_uid;
            console.log("[appointments] Cal.com booking rescheduled:", newCalBookingUid);
          }
        } catch (calErr) {
          console.warn("[appointments] Cal.com reschedule failed:", calErr.message);
          // Continue with local update even if Cal.com fails
        }
      }

      // Update local appointment
      const { data: updated, error } = await supabaseAdmin
        .from("appointments")
        .update({
          start_time: newStart.toISOString(),
          end_time: newEnd.toISOString(),
          cal_booking_uid: newCalBookingUid,
          status: "rescheduled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("user_id", uid)
        .select("*")
        .single();

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.json({
        ok: true,
        new_start: newStart.toISOString(),
        new_end: newEnd.toISOString(),
        cal_synced: calRescheduled,
        appointment: updated,
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
      const body = req.body || {};
      
      // Extract identity fields
      const transferNumber = normalizePhoneE164(body.transfer_number);
      const businessNameRaw = body.business_name != null ? String(body.business_name || "").trim() : null;
      const areaCodeRaw = body.area_code != null ? String(body.area_code || "").trim() : null;
      
      // Extract logistics fields
      const agentTone = String(body.agent_tone || body.toneInput || "Calm & Professional").trim();
      const weekdayOpen = String(body.weekday_open || body.weekdayOpen || "08:00 AM").trim();
      const weekdayClose = String(body.weekday_close || body.weekdayClose || "05:00 PM").trim();
      const weekendEnabled = body.weekend_enabled ?? body.weekendEnabled ?? false;
      const saturdayOpen = String(body.saturday_open || body.saturdayOpen || "09:00 AM").trim();
      const saturdayClose = String(body.saturday_close || body.saturdayClose || "02:00 PM").trim();
      const emergency247 = body.emergency_24_7 ?? body.emergency247 ?? false;
      const businessTimezone = String(body.business_timezone || body.businessTimezone || "America/Chicago").trim();
      const standardFee = String(body.standard_fee || body.standardFee || "89").replace(/[^0-9]/g, "") || "89";
      const emergencyFee = String(body.emergency_fee || body.emergencyFee || "189").replace(/[^0-9]/g, "") || "189";
      
      // Extract communications fields
      const postCallSmsEnabled = body.post_call_sms_enabled ?? body.postCallSmsEnabled ?? true;
      const confirmationSmsEnabled = body.confirmation_sms_enabled ?? body.confirmationSmsEnabled ?? true;
      const userPersonalPhone = normalizePhoneE164(body.user_personal_phone || body.userPersonalPhone);
      const emailOnBooking = body.email_on_booking ?? body.emailOnBooking ?? true;
      const smsOnBooking = body.sms_on_booking ?? body.smsOnBooking ?? true;
      
      // Build schedule summary for AI prompt
      const scheduleSummary = buildScheduleSummary({
        weekdayOpen,
        weekdayClose,
        weekendEnabled,
        saturdayOpen,
        saturdayClose,
        emergency247,
      });
      
      console.info("[deploy-agent-self] identity payload", { business_name: businessNameRaw || "(empty)", area_code: areaCodeRaw || "(empty)" });
      console.info("[deploy-agent-self] logistics payload", { agentTone, scheduleSummary, standardFee, emergencyFee, transferNumber });
      console.info("[deploy-agent-self] comms payload", { postCallSmsEnabled, confirmationSmsEnabled, userPersonalPhone, emailOnBooking, smsOnBooking });
      
      // Build business_hours JSON for profiles
      const businessHours = {
        weekday: { open: weekdayOpen, close: weekdayClose },
        weekend_enabled: weekendEnabled,
        saturday: weekendEnabled ? { open: saturdayOpen, close: saturdayClose } : null,
        sunday: null,
      };
      
      // Build notification preferences JSON
      const notificationPreferences = {
        email_on_booking: emailOnBooking,
        sms_on_booking: smsOnBooking,
      };
      
      // Update profiles with all new fields
      if (businessNameRaw && businessNameRaw.length >= 2 && businessNameRaw.length <= 80) {
        const { error: upsertErr } = await supabaseAdmin.from("profiles").upsert({
          user_id: uid,
          business_name: businessNameRaw,
          ...(areaCodeRaw && /^\d{3}$/.test(areaCodeRaw) ? { area_code: areaCodeRaw } : {}),
          business_hours: businessHours,
          business_timezone: businessTimezone,
          emergency_24_7: emergency247,
          user_personal_phone: userPersonalPhone,
          notification_preferences: notificationPreferences,
        }, { onConflict: "user_id" });
        if (upsertErr) {
          console.error("🔥 DB SAVE FAILED (profiles):", { userId: uid, error: upsertErr.message });
        } else {
          const { data: verify } = await supabaseAdmin.from("profiles").select("business_name").eq("user_id", uid).maybeSingle();
          console.info("[deploy-agent-self] profiles updated", { userId: uid, business_name: businessNameRaw, verified_in_db: verify?.business_name || "(empty)" });
        }
      } else if (areaCodeRaw && /^\d{3}$/.test(areaCodeRaw)) {
        await supabaseAdmin.from("profiles").update({ 
          area_code: areaCodeRaw,
          business_hours: businessHours,
          business_timezone: businessTimezone,
          emergency_24_7: emergency247,
          user_personal_phone: userPersonalPhone,
          notification_preferences: notificationPreferences,
        }).eq("user_id", uid);
      } else if (!businessNameRaw || businessNameRaw.length < 2) {
        console.warn("[deploy-agent-self] no valid business_name in request — profile not updated");
      }
      
      const result = await deployAgentForUser(uid, deployRequestId, {
        transferNumber,
        agentTone,
        scheduleSummary,
        standardFee,
        emergencyFee,
        postCallSmsEnabled,
        confirmationSmsEnabled,
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
      // Try to log consent (non-blocking if table doesn't exist)
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
      } catch (logErr) {
        console.warn("[consent] consent_logs insert failed (table may not exist):", logErr.message);
      }

      // Update profile with consent - this is the critical part
      const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
        user_id: req.user.id,
        consent_accepted_at: new Date().toISOString(),
        consent_version: currentConsentVersion,
      });

      if (profileError) {
        console.error("[consent] profile upsert failed:", profileError.message);
        return res.status(500).json({ error: profileError.message });
      }

      await auditLog({
        userId: req.user.id,
        action: "consent_accepted",
        entity: "consent",
        req,
        metadata: { version: currentConsentVersion },
      });

      return res.json({ ok: true, version: currentConsentVersion });
    } catch (err) {
      console.error("[consent] error:", err.message);
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

// Backfill recording URLs for call_recordings and leads that are missing them
app.post(
  "/admin/backfill-recordings",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-backfill-recordings", limit: 5, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { limit = 50 } = req.body || {};
      
      // Find leads with call_id but no recording_url
      const { data: leadsToFix, error: leadsError } = await supabaseAdmin
        .from("leads")
        .select("id, call_id")
        .not("call_id", "is", null)
        .or("recording_url.is.null,recording_url.eq.")
        .limit(limit);
      
      if (leadsError) {
        return res.status(500).json({ error: leadsError.message });
      }
      
      // Also find call_recordings missing recording_url (check call_id column or lead's call_id)
      const { data: recordingsToFix, error: recordingsError } = await supabaseAdmin
        .from("call_recordings")
        .select("id, call_id, lead_id, leads(call_id)")
        .or("recording_url.is.null,recording_url.eq.")
        .limit(limit);
      
      let updated = 0;
      let failed = 0;
      const results = [];
      
      // Process leads
      for (const lead of (leadsToFix || [])) {
        if (!lead.call_id) continue;
        try {
          const callResponse = await retellClient.get(`/v2/get-call/${lead.call_id}`);
          const recordingUrl = callResponse?.data?.recording_url;
          
          if (recordingUrl) {
            await supabaseAdmin
              .from("leads")
              .update({ recording_url: recordingUrl })
              .eq("id", lead.id);
            
            // Also update call_recordings if linked
            await supabaseAdmin
              .from("call_recordings")
              .update({ recording_url: recordingUrl })
              .eq("lead_id", lead.id);
            
            updated++;
            results.push({ lead_id: lead.id, call_id: lead.call_id, status: "updated", recording_url: recordingUrl });
          } else {
            results.push({ lead_id: lead.id, call_id: lead.call_id, status: "no_recording" });
          }
        } catch (fetchErr) {
          failed++;
          results.push({ lead_id: lead.id, call_id: lead.call_id, status: "error", error: fetchErr.message });
        }
        
        // Rate limit - don't hammer Retell API
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // Process call_recordings that have call_id (direct or via lead)
      for (const rec of (recordingsToFix || [])) {
        const callId = rec.call_id || rec.leads?.call_id;
        if (!callId) continue;
        try {
          const callResponse = await retellClient.get(`/v2/get-call/${callId}`);
          const recordingUrl = callResponse?.data?.recording_url;
          
          if (recordingUrl) {
            await supabaseAdmin
              .from("call_recordings")
              .update({ recording_url: recordingUrl })
              .eq("id", rec.id);
            
            updated++;
            results.push({ recording_id: rec.id, call_id: callId, status: "updated", recording_url: recordingUrl });
          }
        } catch (fetchErr) {
          failed++;
          results.push({ recording_id: rec.id, call_id: callId, status: "error", error: fetchErr.message });
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      return res.json({
        success: true,
        updated,
        failed,
        total_processed: (leadsToFix?.length || 0) + (recordingsToFix?.length || 0),
        results,
      });
    } catch (err) {
      console.error("[admin/backfill-recordings] Error:", err);
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
  
  // Get current date/time for agent context
  const dateTimeVars = getCurrentDateTimeVars("America/New_York");
  
  const dynamicVars = {
    business_name: String(businessName || ""),
    industry: String(industry || ""),
    primary_service: String(formatPrimaryService(industry) || ""),
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
    // Date/time awareness
    ...dateTimeVars,
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
  const rawPhone = phoneResponse.data.phone_number || phoneResponse.data.number;
  const phoneNumber = normalizePhoneE164(rawPhone) || normalizePhoneForLookup(rawPhone) || String(rawPhone || "").trim();

  // CRITICAL: Validate required fields before insert to prevent attribution issues
  if (!agentId) {
    console.error("[createAdminAgent] CRITICAL: Missing agent_id, cannot insert agent record", { userId, deployRequestId: reqId });
    throw new Error("Agent creation failed: missing agent_id");
  }
  if (!phoneNumber) {
    console.error("[createAdminAgent] CRITICAL: Missing phone_number, cannot insert agent record", { userId, deployRequestId: reqId });
    throw new Error("Agent creation failed: missing phone_number");
  }

  // Use upsert on user_id to handle re-deploys gracefully (phone_number in E.164 for call_ended lookup)
  const { error: upsertError } = await supabaseAdmin.from("agents").upsert({
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
  }, { onConflict: "user_id" });

  if (upsertError) {
    throw new Error(upsertError.message);
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
  // New wizard fields
  agentTone = "Calm & Professional",
  scheduleSummary = null,
  standardFee = null,
  emergencyFee = null,
  postCallSmsEnabled = true,
  confirmationSmsEnabled = true,
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
  
  const rawPhone = phoneResponse.data?.phone_number || phoneResponse.data?.number;
  if (!rawPhone) {
    throw new Error("Retell create-phone-number did not return phone_number");
  }
  // Normalize to E.164 so call_ended lookup always matches
  const phoneNumber = normalizePhoneE164(rawPhone) || normalizePhoneForLookup(rawPhone) || String(rawPhone).trim();
  
  console.info("[provisionAgent] phone number created and linked to master", {
    deployRequestId: reqId,
    phone_number: phoneNumber,
    raw_from_retell: rawPhone,
    masterAgentId,
    industry,
  });
  
  // STEP 3: Store in database - phone_number is the KEY for tracking
  // We store masterAgentId for reference but tracking uses phone_number
  
  // CRITICAL: Validate required fields before insert to prevent attribution issues
  if (!masterAgentId) {
    console.error("[provisionAgent] CRITICAL: Missing masterAgentId, cannot insert agent record", { userId, deployRequestId: reqId });
    throw new Error("Agent creation failed: missing agent_id");
  }
  if (!phoneNumber) {
    console.error("[provisionAgent] CRITICAL: Missing phoneNumber, cannot insert agent record", { userId, deployRequestId: reqId });
    throw new Error("Agent creation failed: missing phone_number");
  }
  
  const transferNumber = normalizePhoneE164(transferNumberRaw);
  
  const agentRow = {
    agent_id: masterAgentId,  // Reference to master (tracking uses phone_number)
    phone_number: phoneNumber,  // E.164 so call_ended lookup matches
    voice_id: null,
    llm_id: null,
    prompt: null,
    area_code: areaCode || null,
    tone: agentTone || "Calm & Professional",
    schedule_summary: scheduleSummary || null,
    standard_fee: standardFee || null,
    emergency_fee: emergencyFee || null,
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
    post_call_sms_enabled: postCallSmsEnabled ?? true,
    confirmation_sms_enabled: confirmationSmsEnabled ?? true,
  };
  
  // Use upsert on user_id to handle re-deploys gracefully
  // This prevents "duplicate key" errors when user deploys again
  const { error: upsertError } = await supabaseAdmin.from("agents").upsert({
    user_id: userId,
    ...agentRow,
  }, { onConflict: "user_id" });
  
  if (upsertError) {
    console.error("[provisionAgent] upsert failed", { userId, error: upsertError.message });
    throw new Error(upsertError.message);
  }
  
  console.info("[provisionAgent] agent upserted", { userId, phone_number: phoneNumber, masterAgentId, wasUpdate: updateExisting });

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

  // Check if user already has a phone number deployed (IDEMPOTENCY CHECK)
  const { data: existingAgent } = await supabaseAdmin
    .from("agents")
    .select("agent_id, phone_number")
    .eq("user_id", targetUserId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  
  // If already has phone number, return success (idempotent)
  if (existingAgent?.phone_number) {
    console.info("[deployAgentForUser] User already has phone number, returning existing", {
      deployRequestId: reqId,
      userId: targetUserId,
      phone_number: existingAgent.phone_number,
      agent_id: existingAgent.agent_id,
    });
    return {
      ok: true,
      phone_number: existingAgent.phone_number,
      agent_id: existingAgent.agent_id,
      existing: true,
    };
  }
  
  // Acquire deployment lock to prevent race conditions
  const source = options.source || "wizard";
  const gotLock = await acquireDeploymentLock(targetUserId, reqId, source);
  if (!gotLock) {
    console.warn("[deployAgentForUser] Could not acquire deployment lock", {
      deployRequestId: reqId,
      userId: targetUserId,
    });
    // Re-check if phone was created by concurrent request
    const { data: recheckAgent } = await supabaseAdmin
      .from("agents")
      .select("agent_id, phone_number")
      .eq("user_id", targetUserId)
      .not("phone_number", "is", null)
      .maybeSingle();
    
    if (recheckAgent?.phone_number) {
      return {
        ok: true,
        phone_number: recheckAgent.phone_number,
        agent_id: recheckAgent.agent_id,
        existing: true,
      };
    }
    return { error: "Deployment already in progress. Please wait." };
  }

  const plan = sub?.plan_type || null;
  console.info("[deployAgentForUser] calling provisionPhoneNumberOnly", {
    deployRequestId: reqId,
    userId: targetUserId,
    businessName,
    areaCode,
    plan,
    hasLock: true,
  });
  const transferNumber = normalizePhoneE164(options.transferNumber);
  const industry = String(profile.industry || "hvac").toLowerCase();
  
  // Extract new wizard options with defaults
  const agentTone = options.agentTone || "Calm & Professional";
  const scheduleSummary = options.scheduleSummary || "Monday-Friday 8am-5pm, Sunday Closed";
  const standardFee = options.standardFee || "89";
  const emergencyFee = options.emergencyFee || "189";
  const postCallSmsEnabled = options.postCallSmsEnabled ?? true;
  const confirmationSmsEnabled = options.confirmationSmsEnabled ?? true;
  
  try {
    const result = await provisionPhoneNumberOnly({
      userId: targetUserId,
      businessName,
      areaCode,
      deployRequestId: reqId,
      transferNumber: transferNumber || undefined,
      updateExisting: false,  // Never update existing, we return early if exists
      industry,  // Pass industry so correct master template is used
      // New wizard fields
      agentTone,
      scheduleSummary,
      standardFee,
      emergencyFee,
      postCallSmsEnabled,
      confirmationSmsEnabled,
    });
    await supabaseAdmin
      .from("profiles")
      .update({ deploy_error: null })
      .eq("user_id", targetUserId);
    
    // Release deployment lock on success
    await releaseDeploymentLock(targetUserId, reqId);
    
    return {
      ok: true,
      phone_number: result.phone_number,
      agent_id: result.agent_id,
    };
  } catch (err) {
    // Release deployment lock on error
    await releaseDeploymentLock(targetUserId, reqId);
    
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

        // Use business_name, or fallback to email prefix, then "Pending Setup"
        const displayName = profile.business_name || 
          (user.email ? user.email.split("@")[0].replace(/[._-]/g, " ") : "Pending Setup");
        
        return {
          id: user.id,
          business_name: displayName,
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
          has_business_name: Boolean(profile.business_name),
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

      // Use business_name, or fallback to email prefix, then "Pending Setup"
      const userEmail = authUser?.user?.email || "";
      const displayName = profile?.business_name || 
        (userEmail ? userEmail.split("@")[0].replace(/[._-]/g, " ") : "Pending Setup");

      return res.json({
        user: {
          id: userId,
          business_name: displayName,
          has_business_name: Boolean(profile?.business_name),
          area_code: profile?.area_code || null,
          cal_com_url: profile?.cal_com_url || null,
          full_name:
            profile?.full_name ||
            authUser?.user?.user_metadata?.full_name ||
            null,
          email: userEmail || "--",
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

// Admin: Get all appointments across all users
app.get(
  "/admin/appointments",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("appointments")
        .select(`
          *,
          profile:profiles(business_name, user_id)
        `)
        .order("start_time", { ascending: false })
        .limit(200);

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      const appointments = (data || []).map((apt) => ({
        ...apt,
        business_name: apt.profile?.business_name || "Unknown Business",
        user_id: apt.profile?.user_id || apt.user_id,
      }));

      return res.json({ appointments });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
);

// Admin: Get comprehensive usage stats across all users
app.get(
  "/admin/usage-stats",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const { data: usageLimits, error } = await supabaseAdmin
        .from("usage_limits")
        .select(`
          user_id,
          call_used_seconds,
          call_cap_seconds,
          call_credit_seconds,
          rollover_seconds,
          sms_used,
          sms_cap,
          sms_credit,
          hard_stop_active,
          force_pause,
          period_start,
          period_end
        `);

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("user_id, business_name");

      const profileMap = new Map(
        (profiles || []).map((p) => [p.user_id, p])
      );

      const usageStats = (usageLimits || []).map((usage) => {
        const profile = profileMap.get(usage.user_id) || {};
        const totalSeconds =
          (usage.call_cap_seconds || 0) +
          (usage.call_credit_seconds || 0) +
          (usage.rollover_seconds || 0);
        const usedSeconds = usage.call_used_seconds || 0;
        const remainingSeconds = Math.max(0, totalSeconds - usedSeconds);
        const usagePercent = totalSeconds > 0 
          ? Math.round((usedSeconds / totalSeconds) * 100) 
          : 0;

        return {
          user_id: usage.user_id,
          business_name: profile.business_name || "Unknown",
          minutes_used: Math.floor(usedSeconds / 60),
          minutes_total: Math.floor(totalSeconds / 60),
          minutes_remaining: Math.floor(remainingSeconds / 60),
          usage_percent: usagePercent,
          sms_used: usage.sms_used || 0,
          sms_remaining: Math.max(0, (usage.sms_cap || 0) + (usage.sms_credit || 0) - (usage.sms_used || 0)),
          hard_stop_active: usage.hard_stop_active || false,
          force_pause: usage.force_pause || false,
          period_start: usage.period_start,
          period_end: usage.period_end,
        };
      });

      // Sort by usage percent descending (highest usage first)
      usageStats.sort((a, b) => b.usage_percent - a.usage_percent);

      return res.json({ 
        usage_stats: usageStats,
        totals: {
          total_users: usageStats.length,
          users_over_80_percent: usageStats.filter(u => u.usage_percent >= 80).length,
          users_hard_stopped: usageStats.filter(u => u.hard_stop_active).length,
          total_minutes_used: usageStats.reduce((sum, u) => sum + u.minutes_used, 0),
        }
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

// ============================================
// DEBUG ENDPOINTS - For troubleshooting usage tracking
// ============================================

// GET /debug/user-state - Full user diagnostics (works for any authenticated user)
app.get(
  "/debug/user-state",
  requireAuth,
  resolveEffectiveUser,
  rateLimit({ keyPrefix: "debug-user", limit: 30, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const uid = req.effectiveUserId ?? req.user.id;

      const [subResult, usageResult, agentsResult, leadsResult, callsResult, smsResult] = await Promise.all([
        supabaseAdmin.from("subscriptions").select("*").eq("user_id", uid).maybeSingle(),
        supabaseAdmin.from("usage_limits").select("*").eq("user_id", uid).maybeSingle(),
        supabaseAdmin.from("agents").select("agent_id, phone_number, is_active, created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(5),
        supabaseAdmin.from("leads").select("id, name, phone, status, call_duration_seconds, created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(10),
        supabaseAdmin.from("usage_calls").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(10),
        supabaseAdmin.from("sms_messages").select("id, direction, to_number, from_number, created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(10),
      ]);

      const usage = usageResult.data;
      
      return res.json({
        user_id: uid,
        subscription: subResult.data,
        usage_limits: usage ? {
          ...usage,
          cap_minutes: Math.floor((usage.call_cap_seconds || 0) / 60),
          used_minutes: Math.floor((usage.call_used_seconds || 0) / 60),
          remaining_minutes: Math.floor(Math.max(0, (usage.call_cap_seconds || 0) - (usage.call_used_seconds || 0)) / 60),
        } : null,
        agents: agentsResult.data || [],
        recent_leads: leadsResult.data || [],
        recent_usage_calls: callsResult.data || [],
        recent_sms: smsResult.data || [],
        system: {
          last_retell_webhook: lastRetellWebhookAt || "never",
          last_stripe_webhook: lastStripeWebhookAt || "never",
          server_time: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.error("[debug/user-state] error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// POST /admin/sync-user-caps - Manually sync a user's usage caps based on their subscription tier
app.post(
  "/admin/sync-user-caps",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-sync-caps", limit: 20, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { user_id } = req.body || {};
      if (!user_id) {
        return res.status(400).json({ error: "user_id is required" });
      }

      // Get the user's subscription
      const { data: sub } = await supabaseAdmin
        .from("subscriptions")
        .select("plan_type")
        .eq("user_id", user_id)
        .maybeSingle();

      const tier = sub?.plan_type || "core";
      const caps = getPlanCaps(tier);

      // Check if usage_limits row exists
      const { data: existingUsage } = await supabaseAdmin
        .from("usage_limits")
        .select("id")
        .eq("user_id", user_id)
        .maybeSingle();

      if (existingUsage) {
        // Update existing row
        const { error } = await supabaseAdmin
          .from("usage_limits")
          .update({
            call_cap_seconds: caps.minutesCap * 60,
            sms_cap: caps.smsCap,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user_id);

        if (error) {
          return res.status(500).json({ error: error.message });
        }
      } else {
        // Create new row
        const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        const { error } = await supabaseAdmin
          .from("usage_limits")
          .insert({
            user_id,
            call_cap_seconds: caps.minutesCap * 60,
            sms_cap: caps.smsCap,
            grace_seconds: 600,
            call_used_seconds: 0,
            sms_used: 0,
            period_start: new Date().toISOString(),
            period_end: periodEnd,
          });

        if (error) {
          return res.status(500).json({ error: error.message });
        }
      }

      await auditLog({
        userId: req.user.id,
        action: "admin_sync_caps",
        entity: "usage_limits",
        entityId: user_id,
        req,
        metadata: {
          tier,
          new_cap_minutes: caps.minutesCap,
          new_sms_cap: caps.smsCap,
        },
      });

      console.log("[admin/sync-user-caps] Synced caps:", {
        admin_id: req.user.id,
        target_user_id: user_id,
        tier,
        new_cap_minutes: caps.minutesCap,
        new_sms_cap: caps.smsCap,
      });

      return res.json({
        success: true,
        user_id,
        tier,
        new_cap_minutes: caps.minutesCap,
        new_sms_cap: caps.smsCap,
        action: existingUsage ? "updated" : "created",
      });
    } catch (err) {
      console.error("[admin/sync-user-caps] error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// POST /admin/sync-usage-from-calls - Recalculate usage_limits from actual usage_calls records
// Use this to backfill/fix usage_limits.call_used_seconds if webhooks failed to update it
app.post(
  "/admin/sync-usage-from-calls",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-sync-usage", limit: 20, windowMs: 60_000 }),
  async (req, res) => {
    try {
      const { user_id } = req.body || {};
      if (!user_id) {
        return res.status(400).json({ error: "user_id is required" });
      }

      // Sum all call seconds from usage_calls for this user
      const { data: callRecords, error: callsError } = await supabaseAdmin
        .from("usage_calls")
        .select("seconds")
        .eq("user_id", user_id);

      if (callsError) {
        console.error("[admin/sync-usage-from-calls] Failed to fetch usage_calls:", callsError.message);
        return res.status(500).json({ error: callsError.message });
      }

      const totalCallSeconds = (callRecords || []).reduce((sum, row) => sum + (row.seconds || 0), 0);

      // Sum all SMS from usage_sms for this user (if table exists)
      let totalSmsUsed = 0;
      try {
        const { data: smsRecords, error: smsError } = await supabaseAdmin
          .from("usage_sms")
          .select("count")
          .eq("user_id", user_id);
        
        if (!smsError && smsRecords) {
          totalSmsUsed = smsRecords.reduce((sum, row) => sum + (row.count || 1), 0);
        }
      } catch (smsErr) {
        // usage_sms table might not exist, that's ok
        console.log("[admin/sync-usage-from-calls] No usage_sms table or error:", smsErr.message);
      }

      // Get current usage_limits
      const { data: currentUsage } = await supabaseAdmin
        .from("usage_limits")
        .select("call_used_seconds, sms_used")
        .eq("user_id", user_id)
        .maybeSingle();

      const previousCallSeconds = currentUsage?.call_used_seconds || 0;
      const previousSmsUsed = currentUsage?.sms_used || 0;

      // Update usage_limits with the calculated totals
      const { error: updateError } = await supabaseAdmin
        .from("usage_limits")
        .update({
          call_used_seconds: totalCallSeconds,
          sms_used: totalSmsUsed > 0 ? totalSmsUsed : previousSmsUsed, // Only update SMS if we found records
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user_id);

      if (updateError) {
        console.error("[admin/sync-usage-from-calls] Failed to update usage_limits:", updateError.message);
        return res.status(500).json({ error: updateError.message });
      }

      await auditLog({
        userId: req.user.id,
        action: "admin_sync_usage_from_calls",
        entity: "usage_limits",
        entityId: user_id,
        req,
        metadata: {
          previous_call_seconds: previousCallSeconds,
          new_call_seconds: totalCallSeconds,
          call_records_count: (callRecords || []).length,
          previous_sms_used: previousSmsUsed,
          new_sms_used: totalSmsUsed > 0 ? totalSmsUsed : previousSmsUsed,
        },
      });

      console.log("[admin/sync-usage-from-calls] Synced usage:", {
        admin_id: req.user.id,
        target_user_id: user_id,
        previous_call_seconds: previousCallSeconds,
        new_call_seconds: totalCallSeconds,
        call_records_count: (callRecords || []).length,
        previous_minutes: Math.floor(previousCallSeconds / 60),
        new_minutes: Math.floor(totalCallSeconds / 60),
      });

      return res.json({
        success: true,
        user_id,
        previous_call_seconds: previousCallSeconds,
        new_call_seconds: totalCallSeconds,
        call_records_count: (callRecords || []).length,
        previous_minutes: Math.floor(previousCallSeconds / 60),
        new_minutes: Math.floor(totalCallSeconds / 60),
        sms_synced: totalSmsUsed > 0,
      });
    } catch (err) {
      console.error("[admin/sync-usage-from-calls] error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// GET /admin/test-retell-webhook - Check Retell webhook health
app.get(
  "/admin/test-retell-webhook",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-retell-test", limit: 30, windowMs: 60_000 }),
  async (req, res) => {
    try {
      // Check if any leads created in last 24 hours (indicates webhooks working)
      const { count: recentLeadsCount } = await supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      // Check recent usage_calls
      const { count: recentCallsCount } = await supabaseAdmin
        .from("usage_calls")
        .select("id", { count: "exact", head: true })
        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      // Get the Railway public domain for expected URL
      const expectedWebhookUrl = process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/retell-webhook`
        : `https://kryonex-wizard-production.up.railway.app/retell-webhook`;

      return res.json({
        retell_configured: Boolean(RETELL_API_KEY),
        webhook_signature_enabled: Boolean(RETELL_API_KEY),
        last_webhook_received: lastRetellWebhookAt || "never",
        expected_webhook_url: expectedWebhookUrl,
        leads_created_last_24h: recentLeadsCount || 0,
        usage_calls_last_24h: recentCallsCount || 0,
        status: lastRetellWebhookAt ? "RECEIVING" : "NOT_RECEIVING",
        recommendation: !lastRetellWebhookAt
          ? "Check that the webhook URL in Retell dashboard matches: " + expectedWebhookUrl
          : "Webhooks appear to be working",
        server_time: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[admin/test-retell-webhook] error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// GET /admin/sync-all-caps - Sync ALL users' caps based on their subscription tier
app.post(
  "/admin/sync-all-caps",
  requireAuth,
  requireAdmin,
  rateLimit({ keyPrefix: "admin-sync-all", limit: 5, windowMs: 300_000 }),
  async (req, res) => {
    try {
      // Get all subscriptions
      const { data: subs, error: subsError } = await supabaseAdmin
        .from("subscriptions")
        .select("user_id, plan_type");

      if (subsError) {
        return res.status(500).json({ error: subsError.message });
      }

      const results = { updated: 0, created: 0, errors: [] };

      for (const sub of subs || []) {
        const tier = sub.plan_type || "core";
        const caps = getPlanCaps(tier);

        const { data: existing } = await supabaseAdmin
          .from("usage_limits")
          .select("id, call_cap_seconds")
          .eq("user_id", sub.user_id)
          .maybeSingle();

        if (existing) {
          // Only update if caps are different
          if (existing.call_cap_seconds !== caps.minutesCap * 60) {
            const { error } = await supabaseAdmin
              .from("usage_limits")
              .update({
                call_cap_seconds: caps.minutesCap * 60,
                sms_cap: caps.smsCap,
                updated_at: new Date().toISOString(),
              })
              .eq("user_id", sub.user_id);

            if (error) {
              results.errors.push({ user_id: sub.user_id, error: error.message });
            } else {
              results.updated++;
            }
          }
        } else {
          // Create new usage_limits row
          const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          const { error } = await supabaseAdmin
            .from("usage_limits")
            .insert({
              user_id: sub.user_id,
              call_cap_seconds: caps.minutesCap * 60,
              sms_cap: caps.smsCap,
              grace_seconds: 600,
              call_used_seconds: 0,
              sms_used: 0,
              period_start: new Date().toISOString(),
              period_end: periodEnd,
            });

          if (error) {
            results.errors.push({ user_id: sub.user_id, error: error.message });
          } else {
            results.created++;
          }
        }
      }

      console.log("[admin/sync-all-caps] Completed:", results);

      return res.json({
        success: true,
        total_subscriptions: (subs || []).length,
        updated: results.updated,
        created: results.created,
        errors: results.errors,
      });
    } catch (err) {
      console.error("[admin/sync-all-caps] error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }
);

// ============================================
// END DEBUG ENDPOINTS
// ============================================

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
      
      const response = {
        call_minutes_remaining: Math.floor(remaining / 60),
        call_minutes_total: Math.floor(total / 60),
        call_used_minutes: Math.floor((usage.call_used_seconds || 0) / 60),
        sms_remaining: Math.max(
          0,
          (usage.sms_cap || 0) + (usage.sms_credit || 0) - (usage.sms_used || 0)
        ),
        sms_total: (usage.sms_cap || 0) + (usage.sms_credit || 0),
        sms_used: usage.sms_used || 0,
        sms_credit: usage.sms_credit || 0,
        limit_state: usage.limit_state || "active",
        period_start: usage.period_start,
        period_end: usage.period_end,
      };
      
      // Debug logging for usage tracking verification
      console.log("[usage/status] returning:", {
        user_id: uid,
        call_used_seconds: usage.call_used_seconds || 0,
        call_cap_seconds: usage.call_cap_seconds || 0,
        call_credit_seconds: usage.call_credit_seconds || 0,
        call_minutes_used: response.call_used_minutes,
        call_minutes_total: response.call_minutes_total,
        call_minutes_remaining: response.call_minutes_remaining,
        sms_used: response.sms_used,
        sms_total: response.sms_total,
      });
      
      return res.json(response);
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

// =============================================================================
// GLOBAL ERROR HANDLER (must be last middleware)
// =============================================================================
app.use(async (err, req, res, next) => {
  const statusCode = err.status || err.statusCode || 500;
  const severity = statusCode >= 500 ? "high" : "medium";
  
  // Track error in database
  await trackError({
    error: err,
    context: {
      path: req.path,
      method: req.method,
      query: req.query,
      body: req.body ? JSON.stringify(req.body).substring(0, 1000) : null,
    },
    userId: req.user?.id || null,
    severity,
    requestId: req.requestId,
    endpoint: req.path,
    method: req.method,
    req,
  });
  
  // Create ops alert for 500 errors
  if (statusCode >= 500) {
    await createOpsAlert({
      alertType: "server_error",
      severity: "warning",
      title: `Server Error: ${err.message?.substring(0, 100) || "Unknown error"}`,
      message: `${req.method} ${req.path} returned ${statusCode}`,
      metadata: {
        error_type: err.name,
        request_id: req.requestId,
        user_id: req.user?.id,
        path: req.path,
      },
      source: "error_handler",
    });
  }
  
  // Send response
  res.status(statusCode).json({
    error: err.message || "Internal server error",
    request_id: req.requestId,
  });
});

app.listen(PORT, () => {
  console.log(`Kryonex backend running on port ${PORT}`);
  
  // Validate master agents on startup
  validateMasterAgents();
});

// =============================================================================
// MASTER AGENT HEALTH VALIDATION
// =============================================================================
const validateMasterAgents = async () => {
  console.log("[startup] Validating master agents...");
  
  const agents = [
    { id: RETELL_MASTER_AGENT_ID_HVAC, industry: "HVAC", version: RETELL_AGENT_VERSION_HVAC },
    { id: RETELL_MASTER_AGENT_ID_PLUMBING, industry: "Plumbing", version: RETELL_AGENT_VERSION_PLUMBING },
  ];
  
  for (const agent of agents) {
    if (!agent.id) {
      console.warn(`[startup] ⚠️ RETELL_MASTER_AGENT_ID_${agent.industry.toUpperCase()} not configured`);
      continue;
    }
    
    try {
      const response = await retellClient.get(`/get-agent/${encodeURIComponent(agent.id)}`);
      const agentData = response.data;
      
      console.log(`[startup] ✅ Master agent ${agent.industry}: ${agent.id}`);
      console.log(`         - Name: ${agentData.agent_name || "N/A"}`);
      console.log(`         - LLM ID: ${agentData.response_engine?.llm_id || agentData.llm_id || "N/A"}`);
      console.log(`         - Version: ${agent.version || "draft (latest)"}`);
      
      // Verify the LLM is configured
      const llmId = agent.industry === "HVAC" ? RETELL_LLM_ID_HVAC : RETELL_LLM_ID_PLUMBING;
      if (llmId && agentData.response_engine?.llm_id !== llmId && agentData.llm_id !== llmId) {
        console.warn(`[startup] ⚠️ ${agent.industry} agent LLM mismatch: expected ${llmId}, got ${agentData.response_engine?.llm_id || agentData.llm_id}`);
      }
    } catch (err) {
      console.error(`[startup] ❌ Master agent ${agent.industry} FAILED: ${err.message}`);
      
      // Log critical alert to database
      supabaseAdmin.from("ops_alerts").insert({
        alert_type: "master_agent_unavailable",
        severity: "critical",
        message: `Master agent ${agent.industry} (${agent.id}) is not accessible`,
        details: { agent_id: agent.id, error: err.message },
        acknowledged: false,
      }).catch(() => {}); // Don't block startup on DB error
    }
  }
  
  console.log("[startup] Master agent validation complete.");
};

scheduleAppointmentReminders();

// =============================================================================
// NIGHTLY RECONCILIATION SCHEDULER
// =============================================================================
const scheduleNightlyReconciliation = () => {
  // Run at 3 AM UTC daily
  const TARGET_HOUR_UTC = 3;
  const LOCK_NAME = "nightly-reconciliation";
  const LOCK_TTL_SECONDS = 600; // 10 minutes
  
  const calculateNextRun = () => {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(TARGET_HOUR_UTC, 0, 0, 0);
    
    // If we've passed today's target hour, schedule for tomorrow
    if (now >= next) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    
    return next.getTime() - now.getTime();
  };
  
  const runAndReschedule = async () => {
    // Distributed lock: only one instance should run reconciliation
    const gotLock = await acquireDistributedLock(LOCK_NAME, LOCK_TTL_SECONDS);
    
    if (!gotLock) {
      console.log("[NightlyReconciliation] Another instance is running, skipping");
      await recordJobRun(LOCK_NAME, "skipped", "Another instance has lock");
    } else {
      try {
        console.log("[NightlyReconciliation] Starting scheduled run...");
        await runReconciliation("scheduler");
        console.log("[NightlyReconciliation] Completed.");
        await recordJobRun(LOCK_NAME, "success");
      } catch (err) {
        console.error("[NightlyReconciliation] Error:", err.message);
        await recordJobRun(LOCK_NAME, "failed", err.message);
      } finally {
        await releaseDistributedLock(LOCK_NAME);
      }
    }
    
    // Schedule next run
    const msUntilNext = calculateNextRun();
    console.log(`[NightlyReconciliation] Next run in ${Math.round(msUntilNext / 3600000)}h`);
    setTimeout(runAndReschedule, msUntilNext);
  };
  
  // Schedule first run
  const msUntilFirst = calculateNextRun();
  console.log(`[NightlyReconciliation] First run in ${Math.round(msUntilFirst / 3600000)}h (at ${TARGET_HOUR_UTC}:00 UTC)`);
  setTimeout(runAndReschedule, msUntilFirst);
};

scheduleNightlyReconciliation();

const scheduleRetellTemplateSync = () => {
  const intervalMinutes = Number(RETELL_AUTO_SYNC_MINUTES || 0);
  if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
    return;
  }
  const intervalMs = Math.max(5, intervalMinutes) * 60_000;
  const LOCK_NAME = "retell-template-sync";
  const LOCK_TTL_SECONDS = 300;
  
  const runSync = async () => {
    // Distributed lock: only one instance should run sync
    const gotLock = await acquireDistributedLock(LOCK_NAME, LOCK_TTL_SECONDS);
    if (!gotLock) {
      console.log("[RetellSync] Another instance is running, skipping");
      return;
    }
    
    try {
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
      await recordJobRun(LOCK_NAME, "success");
    } finally {
      await releaseDistributedLock(LOCK_NAME);
    }
  };

  setTimeout(runSync, 15_000);
  setInterval(runSync, intervalMs);
};

scheduleRetellTemplateSync();