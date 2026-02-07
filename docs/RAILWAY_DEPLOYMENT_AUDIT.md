# Railway Deployment – Full Technical Audit

This document is an explicit, exhaustive audit of what the **Railway project** (this backend) does, what it automates, what triggers exist, and how agent provisioning and variable injection work. It also covers gaps, scale risks, and Retell version behavior.

---

## 1. What This Railway Project Is Doing

### 1.1 Single Service: Node.js Express API

- **Entrypoint:** `node server.js` (see `package.json` `"main": "server.js"`, `"start": "node server.js"`).
- **No separate worker process.** All logic runs in one process: HTTP server, scheduled intervals, and in-process background work.
- **No Railway-specific config in repo.** There is no `railway.json`, `Procfile`, or `nixpacks.toml` checked in. Railway runs whatever `start` is (node server.js). Port is taken from `process.env.PORT` (default 3000 in code; Railway injects `PORT`).
- **Responsibilities of this service:**
  - Authenticate users (Supabase JWT via `requireAuth`).
  - Serve all REST API routes (dashboard, settings, appointments, referrals, admin, etc.).
  - Receive **inbound webhooks** from Retell (call lifecycle, tool calls, SMS), Stripe (payments/subscriptions), Cal.com (bookings), and Twilio (or similar) for SMS.
  - **Provision “agents”** for users: either (a) create a **Retell phone number** linked to a **shared master agent** and store `(user_id, phone_number, agent_id)` in Supabase, or (b) in admin-only flows, **clone** the master agent in Retell and then create a phone number for that clone.
  - On each **inbound call**, respond to Retell’s inbound webhook with **per-user dynamic variables** (business name, schedule, transfer number, cal_com_link, etc.) so the **same** master agent speaks with the right context.
  - Track usage (calls, SMS), enforce caps, run reconciliation, and send outbound webhooks (Zapier, etc.).
  - Run **scheduled tasks** in-process: webhook health check, health scores, inactivity check, webhook retries, nightly reconciliation, optional Retell template sync.

### 1.2 What It Does NOT Do (No Separate Workers / Serverless)

- **No dedicated background worker.** Cron-style work is `setInterval` / `setTimeout` inside the same Node process. If the app restarts, in-memory state (e.g. rate-limit buckets) resets; next run times are recalculated on startup.
- **No serverless functions.** All behavior is in `server.js` (and its required modules). There are no Vercel serverless API routes or Lambda-style handlers for this backend; the “backend” is this single Express app, intended to run on Railway (or any Node host).
- **No direct “clone per user” in the main user flow.** The primary path (wizard → payment → deploy) does **not** create a new Retell agent per user; it creates a **phone number** and points it at a **shared master agent**. Variable injection is done at **call time** via the inbound webhook. The **legacy** `POST /deploy-agent` and the **admin** “quick onboard” flow do create (or clone) one agent per user in Retell.

---

## 2. Environment Variables (Full List)

All of these are read from `process.env` in `server.js` (and some in frontend; not listed here). **Required** means the server throws at startup if missing.

| Variable | Purpose | Required |
|----------|---------|----------|
| `PORT` | HTTP server port (Railway sets this) | No (default 3000) |
| `RETELL_API_KEY` | Retell API authentication | **Yes** |
| `RETELL_LLM_ID_HVAC` | Retell LLM id for HVAC | **Yes** |
| `RETELL_LLM_ID_PLUMBING` | Retell LLM id for plumbing | **Yes** |
| `SUPABASE_URL` | Supabase project URL | **Yes** |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role (bypass RLS) | **Yes** |
| `STRIPE_SECRET_KEY` | Stripe API key | **Yes** |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature verification | **Yes** |
| `STRIPE_PRICE_ID_PRO` or `STRIPE_PRICE_ID_HVAC` | At least one Stripe price | **Yes** |
| `STRIPE_PRICE_ID_ELITE` or `STRIPE_PRICE_ID_PLUMBING` | At least one Stripe price | **Yes** |
| `STRIPE_PRICE_ID_SCALE` | Scale tier price | **Yes** |
| `FRONTEND_URL` | Frontend origin (redirects, CORS, emails) | **Yes** |
| `RETELL_LLM_VERSION_HVAC` | Lock HVAC LLM to version (optional) | No |
| `RETELL_LLM_VERSION_PLUMBING` | Lock plumbing LLM to version (optional) | No |
| `RETELL_MASTER_AGENT_ID_HVAC` | Master agent for HVAC (shared by all users) | Used by provision path |
| `RETELL_MASTER_AGENT_ID_PLUMBING` | Master agent for plumbing | Used by provision path |
| `RETELL_AGENT_VERSION_HVAC` | Lock phone number to published agent version (HVAC) | No |
| `RETELL_AGENT_VERSION_PLUMBING` | Same for plumbing | No |
| `RETELL_VOICE_ID` | Default voice (e.g. 11labs-Grace) | No |
| `RETELL_DEMO_AGENT_ID` | Agent for demo outbound calls | No |
| `RETELL_DEMO_FROM_NUMBER` | Caller id for demo calls | No |
| `RETELL_SMS_SANDBOX` | SMS sandbox mode | No |
| `RETELL_WEBHOOK_SECRET` | Verify Retell webhook payloads | No (verification skipped if unset) |
| `RETELL_AUTO_SYNC_MINUTES` | Interval (minutes) for Retell template sync; 0 = off | No |
| `RETELL_USE_BACKEND_PROMPT`, `RETELL_PROMPT_MODE`, `RETELL_BACKEND_PROMPT_ALLOWLIST` | Prompt source (template vs backend) | No |
| `SERVER_URL` | Public backend URL (webhooks, redirects) | No (falls back to APP_URL/FRONTEND_URL) |
| `APP_URL` | App base URL | No |
| `STRIPE_PRICE_ID_CORE` | Core tier price | No |
| `STRIPE_TOPUP_CALL_300`, `STRIPE_TOPUP_CALL_800`, `STRIPE_TOPUP_SMS_500`, `STRIPE_TOPUP_SMS_1000` | Top-up product prices | No |
| `MASTER_SMS_NUMBER` | Shared A2P number for SMS | No |
| `RESEND_API_KEY` | Transactional email (Resend) | No |
| `CALCOM_CLIENT_ID`, `CALCOM_CLIENT_SECRET` | Cal.com OAuth | No |
| `CALCOM_ENCRYPTION_KEY` | Encrypt Cal.com tokens (32 chars) | No |
| `ADMIN_EMAIL` | Comma-separated admin emails | No |
| `ADMIN_ACCESS_CODE` | Optional admin access code | No |
| `ADMIN_IP_ALLOWLIST` | Optional IP allowlist for admin | No |
| `CONSENT_VERSION` | Consent version (e.g. v1) | No |
| `WIZARD_MAINTENANCE_MODE` | If "true", wizard disabled for non-admins | No |

**Railway:** Set these in the Railway project (e.g. Service → Variables). Do not commit `.env`. `SERVER_URL` should be the public Railway URL (e.g. `https://<app>.up.railway.app`) so Retell/Stripe/Cal.com can reach webhooks.

---

## 3. Build and Deploy (Railway)

- **Build:** Railway typically runs `npm install` (no custom build script for the backend). There is no `npm run build` for the server.
- **Start:** `npm start` → `node server.js`.
- **No deploy scripts** in the repo that run on Railway deploy. Scripts in `scripts/` (e.g. `api-check.js`, `create-test-user.js`, `simulate_retell.js`) are for local/CI use, not executed by Railway.
- **Logs:** All behavior is via `console.log` / `console.info` / `console.warn` / `console.error`. Railway captures stdout/stderr. Use Railway Logs or Log Explorer and filter e.g. by path (e.g. `POST /webhooks/retell-inbound`) or by `[retell-inbound]`, `[deploy-agent-self]`, `[stripe-webhook]`, etc.

---

## 4. Connected Resources

### 4.1 Database: Supabase (Postgres)

- **Single Postgres project.** All tables live in Supabase; the app uses `SUPABASE_SERVICE_ROLE_KEY` (admin client), so RLS is bypassed for backend logic.
- **Key tables used by this service:**  
  `profiles`, `agents`, `subscriptions`, `usage_limits`, `usage_calls`, `usage_sms`, `integrations`, `webhook_configs`, `webhook_deliveries`, `webhook_queue`, `appointments`, `leads`, `call_recordings`, `audit_logs`, `customer_health_scores`, `churn_alerts`, `error_logs`, `ops_alerts`, `reconciliation_runs`, `referrals`, `payout_requests`, `consent_logs`, etc. Migrations live in `supabase/*.sql`; run order is documented in `supabase/README.md`.

### 4.2 External APIs

- **Retell AI:**  
  - Base URL: `https://api.retellai.com` (axios client in server).  
  - Used: `get-agent`, `create-agent`, `update-agent`, `create-phone-number`, `copy-agent` (only in legacy `/deploy-agent` and in `createAdminAgent`).  
  - Inbound webhook: Retell calls **this** Railway app; the app does not poll Retell.

- **Stripe:**  
  - Webhook: Stripe sends `checkout.session.completed`, `customer.subscription.updated/deleted`, `invoice.payment_failed`, etc. to this app.  
  - Server uses Stripe SDK for subscription/checkout and for signature verification.

- **Cal.com:**  
  - OAuth: app redirects users to Cal.com, then handles callback; tokens stored encrypted in `integrations`.  
  - Cal.com API: get event types, get slots, create/reschedule bookings.  
  - Inbound webhook: Cal.com sends booking created/rescheduled/cancelled to `POST /webhooks/calcom`.

- **Resend:**  
  - Transactional email (e.g. post-signup, notifications) when `RESEND_API_KEY` is set.

- **Twilio (or similar):**  
  - Inbound SMS webhook: `POST /webhooks/sms-inbound`. The app receives SMS, routes by `MASTER_SMS_NUMBER` + conversation, and may reply (e.g. opt-out, keyword replies).

### 4.3 Cron Jobs / Scheduled Tasks (All In-Process)

There are **no external cron services** (e.g. no Railway cron, no separate worker). All scheduling is inside the Node process:

| What | Interval | Function / Behavior |
|------|----------|---------------------|
| Webhook health check | 15 min | `checkWebhookHealth()` – samples recent webhook deliveries, computes failure rate; if high, creates `ops_alerts` entry. |
| Health score recalculation | 6 h | `recalculateAllHealthScores()` – recalculates customer health scores for all users with health records. |
| Inactivity check | 24 h | `checkInactiveUsers()` – finds users with old `last_activity_at`, creates `churn_alerts` for inactivity. |
| Rate limit bucket cleanup | 5 min | Cleans old entries from in-memory rate-limit map. |
| Webhook retry | 30 s | `retryFailedWebhooks()` – processes `webhook_deliveries` (or queue) and retries failed outbound webhooks. |
| Nightly reconciliation | Once per day at 3:00 UTC | `scheduleNightlyReconciliation()` – `setTimeout` to next 3 AM UTC, then `runReconciliation("scheduler")`; then reschedules next run. Compares `usage_limits` aggregates to `usage_calls` / `usage_sms` and corrects drift. |
| Retell template sync | Configurable (e.g. 60 min), default off if 0 | `scheduleRetellTemplateSync()` – if `RETELL_AUTO_SYNC_MINUTES` > 0, runs `syncRetellTemplates` for HVAC and plumbing LLM IDs every N minutes. |

If the Railway service restarts, all of these restart with the process; the “next run” for nightly reconciliation is recalculated on startup.

### 4.4 Background Workers

- **None.** There is no separate worker process, no Redis queue, no Bull/BullMQ. “Background” work is either:
  - Synchronous inside a request (e.g. deploy, webhook handler), or  
  - Fired by `setInterval`/`setTimeout` in the same process (health, reconciliation, retries).

---

## 5. Webhooks (Inbound → This Railway App)

| URL | Method | Caller | Purpose |
|-----|--------|--------|---------|
| `/webhooks/retell-inbound` | POST | Retell | Inbound call: Retell sends call_inbound; app returns `override_agent_id` (optional) and **dynamic_variables** (business_name, cal_com_link, transfer_number, etc.) so the same master agent gets per-user context. |
| `/retell-webhook` or `/api/retell/webhook` | POST | Retell | Call lifecycle and tools: call_started, call_ended, tool_call (e.g. check_calendar_availability, book_appointment), sms_received. Signature verified if `RETELL_WEBHOOK_SECRET` set. |
| `/webhooks/stripe` or Stripe Dashboard URL | POST | Stripe | checkout.session.completed (create subscription, usage_limits, then **deployAgentForUser**), customer.subscription.updated/deleted, invoice.payment_failed. |
| `/webhooks/calcom` | POST | Cal.com | Booking created/rescheduled/cancelled; app upserts `appointments` and may send outbound webhooks. |
| `/webhooks/sms-inbound` | POST | Twilio (or SMS provider) | Inbound SMS; route by number/conversation, opt-out handling, keyword detection (e.g. STOP, RESCHEDULE), store in DB, optionally reply. |

All of these must be **publicly reachable** at `SERVER_URL` (your Railway URL). No auth on Stripe/Retell/Cal.com/SMS webhooks beyond signature verification where implemented.

---

## 6. API Endpoints Exposed by This Project

Below is a **full list** of routes registered in `server.js` (order and grouping may vary in file). Anything not listed is not exposed.

- **Root:** `GET /` → health-style JSON.
- **Auth-required (user or admin):** Most routes use `requireAuth`; many use `resolveEffectiveUser` (impersonation). Admin-only use `requireAdmin`.
- **Cal.com:**  
  `GET /api/calcom/authorize`, `GET /api/calcom/authorize-url`, `GET /api/calcom/callback`, `GET /api/calcom/status`, `POST /api/calcom/disconnect`.
- **Deploy / agent:**  
  `POST /deploy-agent` (legacy: clone agent + create phone),  
  `POST /deploy-agent-self` (main flow: provision phone only via `deployAgentForUser`),  
  `POST /update-agent` (patch Retell agent by id).
- **Dashboard / stats:**  
  `GET /dashboard-stats`, `GET /api/dashboard/stats`, `GET /api/dashboard/stats-enhanced`.
- **Settings:**  
  `GET /api/settings`, `PUT /api/settings`.
- **Sessions:**  
  `GET /api/sessions`, `DELETE /api/sessions/:sessionId`, `DELETE /api/sessions`.
- **Referrals:**  
  `GET /referral/my-code`, `GET /referral/stats`, `GET /referral/history`, `POST /referral/request-payout`, `GET /referral/payout-history`, `POST /referral/record-signup`.  
  Admin: `GET /admin/referrals`, `GET /admin/referrals/:id`, `POST /admin/referrals/:id/approve`, `POST /admin/referrals/:id/reject`, `POST /admin/referrals/:id/mark-paid`, `GET /admin/referral-settings`, `PUT /admin/referral-settings`, `GET /admin/referral-payout-requests`, `POST /admin/referral-payout-requests/:id/approve`, `POST /admin/referral-payout-requests/:id/reject`, `POST /admin/referral-payout-requests/:id/mark-paid`.
- **Customers:**  
  `GET /api/customers`, `GET /api/customers/:phone/history`.
- **Webhooks (user config):**  
  `GET /api/webhooks`, `POST /api/webhooks`, `PUT /api/webhooks/:id`, `DELETE /api/webhooks/:id`, `POST /api/webhooks/:id/test`, `GET /api/webhooks/:id/deliveries`.
- **Leads:**  
  `GET /leads`, `POST /leads/:leadId/flag`. Admin: `GET /admin/leads`.
- **Messages / SMS:**  
  `GET /messages`, `POST /messages/send`, etc. Admin: `GET /admin/messages`.
- **Call recordings / Black Box:**  
  `GET /call-recordings`, etc.
- **Appointments:**  
  `GET /appointments`, `POST /appointments`, `GET /appointments/:id`, `PUT /appointments/:id`, `DELETE /appointments/:id`, `PATCH /appointments/:id/reschedule`, etc.
- **Analytics:**  
  `GET /api/analytics`.
- **Subscription / billing:**  
  `GET /subscription-status`, `POST /create-checkout-session`, etc.
- **Tracking:**  
  `GET /tracking/session/:token`, `GET /tracking/points/:token`, `POST /tracking/...`.
- **Black box events:**  
  `POST /black-box/event`, etc.
- **Admin:**  
  `GET /admin/dialer-queue`, `POST /admin/...`, `GET /admin/users`, `GET /admin/appointments`, `GET /admin/webhook-queue`, `POST /admin/webhook-queue/:id/replay`, `GET /admin/reconciliation-runs`, `POST /admin/reconciliation-runs/trigger`, `POST /admin/deploy-agent`, `POST /admin/quick-onboard`, `POST /admin/impersonation/start`, `POST /admin/impersonation/end`, and others.
- **Retell demo:**  
  `POST /retell/demo-call`.
- **Webhooks (inbound):**  
  Already listed above (retell-inbound, retell-webhook, stripe, calcom, sms-inbound).

Rate limiting is applied to many of these via an in-memory middleware (keyed by IP or user); limits are per key prefix and window (e.g. 6 per minute for deploy-agent-self).

---

## 7. Automation and Provisioning Logic

### 7.1 What Gets Automated

- **After first successful Stripe checkout (subscription created):**  
  The Stripe webhook handler creates/updates `subscriptions` and `usage_limits`, then **calls `deployAgentForUser(userId)`**. That function checks consent, active subscription, and profile (business_name, area_code); then calls **`provisionPhoneNumberOnly`**. So **payment → deploy is automatic** for the main flow (no manual “deploy” click required after pay).

- **Per-call variable injection:**  
  When a call hits a number owned by the app, Retell calls `/webhooks/retell-inbound`. The app looks up `agents` by `to_number` (phone_number), gets `user_id`, then loads `profiles` + `integrations` (Cal.com) and builds **dynamic_variables** (business_name, cal_com_link, transfer_number, schedule_summary, etc.). It returns these in the webhook response so the **single master agent** speaks with that user’s context. No manual step.

- **Usage enforcement:**  
  On `call_started` and before allowing the call to proceed, the app checks `usage_limits` and may return 402 or reject the webhook so Retell doesn’t connect. SMS sends are gated by usage. Reconciliation and health scores run on schedules above.

- **Outbound webhooks:**  
  When events occur (call_ended, lead_created, appointment_booked, etc.), the app enqueues or immediately sends HTTP POSTs to user-configured webhook URLs (Zapier, etc.) with retries and delivery logging.

- **Cal.com:**  
  Bookings created by the AI (tool call) or by the Cal.com webhook are written to `appointments` and optionally trigger outbound webhooks.

### 7.2 Triggers Summary

| Trigger | Type | Action |
|--------|------|--------|
| Retell: call arrives at a number | Webhook (POST /webhooks/retell-inbound) | Look up user by phone_number, return dynamic_variables. |
| Retell: call_started / call_ended / tool_call / sms_received | Webhook (POST /retell-webhook) | Update usage, store recordings/leads, run tools (e.g. book_appointment), send outbound webhooks. |
| Stripe: checkout.session.completed | Webhook | Create subscription, usage_limits, then **deployAgentForUser** (provision phone). |
| Stripe: subscription.updated/deleted, invoice.payment_failed | Webhook | Update subscription status, optionally revoke role. |
| Cal.com: booking created/rescheduled/cancelled | Webhook (POST /webhooks/calcom) | Upsert appointments, send outbound webhooks. |
| User: POST /deploy-agent-self | API | Update profile, then **deployAgentForUser** (provision phone). |
| Admin: POST /admin/deploy-agent | API | **deployAgentForUser(targetUserId)** (provision phone). |
| Admin: POST /admin/quick-onboard | API | Create user/profile/subscription, then **createAdminAgent** (clone + phone). |
| Timer: 15 min | setInterval | Webhook health check. |
| Timer: 6 h | setInterval | Recalculate health scores. |
| Timer: 24 h | setInterval | Inactivity / churn alerts. |
| Timer: 30 s | setInterval | Retry failed outbound webhooks. |
| Timer: 3 AM UTC daily | setTimeout loop | Run reconciliation. |
| Timer: N min (if RETELL_AUTO_SYNC_MINUTES) | setInterval | Retell template sync. |

---

## 8. Onboarding, Agent Creation, Variable Injection, and Deployment

### 8.1 Onboarding (Wizard → Payment → Deploy)

- **Frontend:** User goes through wizard steps (identity, logistics, communications, payment, deploy). Data is sent to backend via onboarding/identity, settings, and **POST /deploy-agent-self** (and Stripe Checkout for payment).
- **Backend:**  
  - Profile and consent are updated from wizard/API.  
  - Payment is handled by Stripe; on **checkout.session.completed**, the server creates subscription and **calls `deployAgentForUser(userId)`**.  
  - User can also click “Deploy” on the deploy step, which calls **POST /deploy-agent-self** with current wizard state; that again calls **deployAgentForUser(uid, deployRequestId, options)** with options (transferNumber, agentTone, scheduleSummary, etc.).

### 8.2 Agent Creation: Two Models

**Model A – Shared master agent (current main path)**  
Used by: **deployAgentForUser** (hence Stripe post-payment, **/deploy-agent-self**, **/admin/deploy-agent**).

- **provisionPhoneNumberOnly** is used.
- It does **not** create a new Retell agent. It:
  1. Selects the **master agent** by industry: `RETELL_MASTER_AGENT_ID_HVAC` or `RETELL_MASTER_AGENT_ID_PLUMBING`.
  2. Calls Retell **POST /create-phone-number** with:  
     `inbound_agent_id` / `outbound_agent_id` = master agent id,  
     `area_code`, `country_code`, `nickname`,  
     **inbound_webhook_url** = `{SERVER_URL}/webhooks/retell-inbound`.
  3. Optionally sets `inbound_agent_version` / `outbound_agent_version` from `RETELL_AGENT_VERSION_*` so the number is pinned to a published version.
  4. Upserts **one row** in `agents`: `user_id`, `agent_id` = master agent id, `phone_number` = Retell’s E.164 number, plus tone, schedule_summary, transfer_number, etc.
- **Variable injection:** On every inbound call, Retell hits `/webhooks/retell-inbound`. The app looks up `agents` by `to_number` → `user_id`, then loads profile + Cal.com and returns **dynamic_variables** in the webhook response. The **same** master agent is used for all such users; only the variables change per call.

**Model B – One agent per user (clone)**  
Used by: **POST /deploy-agent** (legacy) and **createAdminAgent** (used by **/admin/quick-onboard**).

- **createAdminAgent** (admin quick onboard):
  1. **GET /get-agent/{masterAgentId}** to fetch the template.
  2. **POST /create-agent** with response_engine, voice_id, agent_name (no copy-agent).
  3. **PATCH /update-agent/{newAgentId}** with webhook_url, voice_id, optional prompt, **response_engine.version** (to lock LLM version).
  4. **POST /create-phone-number** with `inbound_agent_id` = **new** agent id, same inbound_webhook_url.
  5. Inserts into `agents`: `user_id`, **agent_id** = new agent id, `phone_number`.
- **POST /deploy-agent** (legacy):
  1. **POST /copy-agent/{sourceAgentId}** to clone the master.
  2. **PATCH /update-agent/{copiedAgentId}** with prompt and dynamic_variables.
  3. **POST /create-phone-number** with the copied agent id.
  4. Inserts into `agents` with the **cloned** agent id.

So: **default user flow = Model A** (no clone, variable injection at call time). **Admin quick onboard and legacy /deploy-agent = Model B** (one Retell agent per user).

### 8.3 Variable Injection (Model A)

- **Source of truth:** `profiles` (business_name, industry, cal_com_url, etc.), `agents` (transfer_number, tone, schedule_summary, standard_fee, emergency_fee), `integrations` (Cal.com booking_url).
- **When:** Only when Retell sends **POST /webhooks/retell-inbound** (inbound call).
- **Flow:** Normalize `to_number` → lookup `agents` by `phone_number` → get `user_id` → load profile + integration → build object with keys like `business_name`, `cal_com_link`, `calendar_enabled`, `transfer_number`, `agent_tone`, `schedule_summary`, `standard_fee`, `emergency_fee` (all strings) → return in response body under `call_inbound.dynamic_variables`.
- **Retell:** Uses these as `{{variable_name}}` in the agent’s prompt/begin_message. No per-user agent update is needed; injection is per request.

### 8.4 Deployment Summary

- **Stripe success:** Automatically calls **deployAgentForUser** → **provisionPhoneNumberOnly** → one new phone number + one DB row; **no** new Retell agent.
- **User clicks Deploy (wizard):** **POST /deploy-agent-self** → same **deployAgentForUser** → same provisioning.
- **Admin deploys for user:** **POST /admin/deploy-agent** with `user_id` → **deployAgentForUser** → same.
- **Admin quick onboard:** Creates user + subscription, then **createAdminAgent** → **new** Retell agent + phone number (Model B).

---

## 9. What Is Missing or Could Break Under Scale

- **Single process:** All traffic and all scheduled work share one Node process. Under high load, long-running work (reconciliation, health score run, Retell sync) can block or delay request handling unless carefully made async (they are async, but still compete for one event loop).
- **In-memory rate limiting:** Stored in a plain object; resets on deploy/restart. Not shared across multiple instances. If you run multiple Railway replicas, each has its own limit state.
- **In-memory scheduled jobs:** If you run more than one instance, **every** instance will run the same intervals (health check, reconciliation, retries, etc.). That can lead to duplicate reconciliation runs, duplicate alerts, or duplicate retries unless you add a distributed lock (e.g. DB or Redis).
- **No idempotency on deploy:** Multiple rapid calls to deploy-agent-self or Stripe retries can call **deployAgentForUser** multiple times. The code uses **upsert** on `agents` by `user_id`, and Retell’s create-phone-number is not idempotent — so you can end up with **multiple phone numbers** for one user if not guarded (e.g. by checking existing agent before creating a new number).
- **Area code exhaustion:** **provisionPhoneNumberOnly** requests one number per area code. If Retell has no inventory for that area code, it throws; the app sets `profiles.deploy_error` to `AREA_CODE_UNAVAILABLE`. No automatic fallback to another area code.
- **Master agent as single point of failure:** If the single HVAC or plumbing master agent is misconfigured or disabled in Retell, **all** users on that industry are affected. There is no per-user agent to isolate failure.
- **Webhook retries:** Retries are in-process and periodic. If the process dies, pending retries are lost unless you persist retry state to DB (the app does use `webhook_deliveries` / queue tables; exact retry semantics depend on that implementation).
- **Cal.com webhook user resolution:** Cal.com webhook identifies user by organizer username or email; if Cal.com payload doesn’t match your `integrations.cal_username` or profile, the booking may not be attributed and can be dropped or create an appointment without user_id.

---

## 10. Can This System Truly Auto-Deploy New Agents with Zero Manual Work?

**Yes, for the intended flow (Model A – shared master agent).**

- User completes wizard (identity, area code, business name, etc.) and pays via Stripe.
- Stripe sends **checkout.session.completed** to this backend.
- Backend creates subscription and **usage_limits**, then calls **deployAgentForUser(userId)**.
- **deployAgentForUser** checks consent + active subscription + valid profile (business_name, area_code), then **provisionPhoneNumberOnly**:
  - Creates **one** Retell phone number tied to the **master** agent and **inbound_webhook_url**.
  - Upserts **one** row in `agents` for that user.
- No manual “create agent” or “assign number” step in Retell dashboard. The only requirement is that **RETELL_MASTER_AGENT_ID_*** and Retell inventory for the user’s area code exist.

**Caveats:**

- If **consent** or **business_name** / **area_code** are missing, **deployAgentForUser** returns an error and does not provision; Stripe webhook logs the error but does not block subscription creation. So “zero manual” only when profile and consent are already set (e.g. by the wizard before payment).
- If the user never hits “Deploy” and Stripe webhook runs **before** profile/consent are saved (e.g. race), deploy can fail; the user would have subscription but no number until they hit Deploy or you fix profile and retry.
- **createAdminAgent** (admin quick onboard) is **not** zero-touch for Retell: it creates a **new** agent per user in Retell. That path is intentionally “one agent per user” and requires Retell API to succeed.

---

## 11. Parts of the Codebase Responsible for Provisioning, Cloning, or Configuring Agents

- **provisionPhoneNumberOnly** (server.js): Shared path for “phone number only” provisioning. Used by **deployAgentForUser**. Creates Retell phone number, upserts **agents** row. Does **not** clone; uses master agent id.
- **deployAgentForUser** (server.js): Shared deploy orchestration. Validates profile (consent, business_name, area_code), subscription; pulls options from profile/options; calls **provisionPhoneNumberOnly**. Used by Stripe webhook, **/deploy-agent-self**, **/admin/deploy-agent**.
- **createAdminAgent** (server.js): Clones master (GET agent → POST create-agent → PATCH update-agent → POST create-phone-number). Used by **/admin/quick-onboard** when the user has no agent yet.
- **POST /deploy-agent** (server.js): Legacy path. Uses Retell **copy-agent**, then update-agent, then create-phone-number; writes to **agents** with the **copied** agent id. Not used by the current wizard flow (wizard uses **/deploy-agent-self**).
- **POST /deploy-agent-self** (server.js): Accepts wizard payload; updates profile (business_name, area_code, business_hours, etc.); calls **deployAgentForUser(uid, deployRequestId, options)**.
- **Stripe webhook** (server.js): On checkout.session.completed, creates subscription and usage_limits, then calls **deployAgentForUser(userId)** with no options (so profile must already have area_code, business_name, consent).
- **/webhooks/retell-inbound** (server.js): Does **not** provision; only returns **dynamic_variables** for the existing master agent so each call gets the right context.

---

## 12. Retell Versions and Automation Reliability

- **Agent version (phone number):**  
  In **provisionPhoneNumberOnly**, if `RETELL_AGENT_VERSION_HVAC` or `RETELL_AGENT_VERSION_PLUMBING` is set (integer), the payload to **create-phone-number** includes `inbound_agent_version` and `outbound_agent_version`. That **locks** the number to a specific **published** version of the master agent. If you leave these unset, Retell uses the “draft” or latest version; behavior can change when you publish or edit the master.

- **LLM version (createAdminAgent):**  
  When creating a **new** agent in **createAdminAgent**, the code copies the master’s **response_engine** and can set **response_engine.version** so the new agent uses a fixed LLM version. That only affects the **cloned** agents (admin quick onboard), not the shared master path.

- **Reliability:**  
  - **Variable injection:** Relies on Retell calling `/webhooks/retell-inbound` **before** connecting the call, and on your DB (Supabase) being up so lookup by phone_number and profile fetch succeed. If the inbound webhook is slow or fails, Retell may retry (see Retell docs); if your app returns 5xx, Retell may fall back to connecting without overrides.  
  - **Master agent:** One master per industry. Changes to the master (prompt, tools, LLM) affect all users on that industry immediately. Pinning phone numbers to a **published** version (RETELL_AGENT_VERSION_*) avoids surprise changes when you publish a new version.  
  - **Idempotency:** Retell’s create-phone-number and create-agent are not idempotent. Duplicate Stripe events or double-clicks on Deploy can create extra numbers or agents unless you add guards (e.g. “if user already has phone_number, skip create-phone-number” or use idempotency keys).

---

## 13. Summary Table

| Question | Answer |
|----------|--------|
| What is the Railway project? | Single Node.js Express app (server.js). Serves all API and receives all webhooks. No separate workers or serverless. |
| What does it automate? | Post-payment deploy (Stripe → deployAgentForUser), per-call variable injection (retell-inbound), usage enforcement, outbound webhooks, reconciliation, health scores, webhook retries. |
| Triggers | Webhooks: Retell (inbound + lifecycle), Stripe, Cal.com, SMS. API: deploy-agent-self, admin deploy, admin quick-onboard. Timers: 15m, 6h, 24h, 30s, nightly 3 AM UTC, optional Retell sync. |
| Onboarding / deploy | Wizard + Stripe → subscription + deployAgentForUser → provisionPhoneNumberOnly (phone + DB row). No new Retell agent. |
| Variable injection | Only at call time via POST /webhooks/retell-inbound; lookup by to_number → user_id → profile/agents/integrations → return dynamic_variables. |
| Zero manual deploy? | Yes, for the Stripe + deployAgentForUser path, provided profile (business_name, area_code, consent) is set before or with payment. |
| Provisioning code | provisionPhoneNumberOnly, deployAgentForUser, createAdminAgent; routes: /deploy-agent-self, /deploy-agent, /admin/deploy-agent, /admin/quick-onboard; Stripe handler. |
| Retell versions | Phone numbers can be pinned to published agent version via RETELL_AGENT_VERSION_*. Cloned agents (createAdminAgent) can pin LLM version. Master agent changes affect all shared-number users unless versions are pinned. |
| Scale risks | Single process; in-memory rate limits and timers; multiple instances would duplicate scheduled jobs and rate-limit state; possible duplicate numbers on duplicate deploy calls; master agent single point of failure. |

This audit reflects the codebase as of the audit date; any subsequent change to server.js or env should be re-checked against this document.
