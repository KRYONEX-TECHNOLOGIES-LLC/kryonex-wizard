# Kryonex Wizard — Full Handoff Document

**Purpose:** Bring a new developer or AI up to speed as if they’ve always been on the project. Covers app architecture, what was recently built, critical flows, debugging, and what to do next.

**Last updated:** January 30, 2026

---

## 1. What This App Is

**Kryonex Wizard** is a full-stack SaaS for onboarding, deploying, and managing AI phone agents (Retell AI) for field-service businesses (HVAC, Plumbing). It includes:

- **User onboarding wizard** — Business name, area code, consent, plan selection → Stripe checkout → Retell agent provisioning
- **AI call agent (Grace)** — Answers inbound calls with personalized greeting using `{{business_name}}` and other dynamic variables
- **Admin control plane** — Fleet registry, manual onboarding, call center, financials, logs
- **Ops infrastructure** — Raw webhook persistence, idempotency, event storage, usage enforcement, alerts
- **Integrations** — Stripe (billing), Retell (calls, SMS), Cal.com (booking), Resend (email), Supabase (auth, DB)

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FRONTEND (Vite + React)                                                     │
│  - Landing, Login, Wizard, Dashboard, Billing, Calendar, Leads, Messages     │
│  - Admin suite: /admin/dashboard, /admin/users, /admin/wizard/create, etc.   │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │ VITE_API_URL (backend)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  SERVER (Express, server.js at repo root)                                    │
│  - Auth, webhooks, deploy, billing, calendar, tracking, admin ops            │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │ SUPABASE_SERVICE_ROLE_KEY
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  SUPABASE                                                                   │
│  - Auth, profiles, agents, leads, subscriptions, usage_limits, webhook_queue │
│  - call_events, sms_events, unknown_phone, alerts, billing_line_items        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
              RETELL AI         STRIPE            CAL.COM
              (calls, SMS)      (billing)         (bookings)
```

| Layer     | Tech             | Location                         |
|----------|------------------|-----------------------------------|
| Frontend | Vite + React     | `frontend/`                       |
| Backend  | Express (Node 20+)| `server.js` (root)               |
| Database | Supabase (Postgres) | `supabase/*.sql`              |
| Hosting  | Vercel (frontend), Railway (server) | —             |

---

## 3. What Was Just Done (Recent Work)

### 3.1 `business_name` Persistence Fix

**Problem:** The AI agent (Grace) was saying `{{business_name}}` literally instead of the actual business name (e.g. "CUT GAMING HVAC").

**Root causes:**
1. **localStorage keys** — After Stripe redirect, the wizard checked `wizard.form` instead of `wizard.form.{userId}`, so form data looked empty.
2. **Initial state race** — `form` initialized as empty before `loadProfile`/localStorage restore ran.
3. **Single-key saves** — `updateField` only saved to one key; if `userId` wasn’t ready, data was lost.

**Fixes:**
- Form saved to both `wizard.form` and `wizard.form.{userId}`.
- Initial `useState` for `form` restores from localStorage (generic and user-specific keys) on first render.
- `checkWizardAccess` uses the correct user-specific key.
- **Server backfill:** If `profiles.business_name` is empty but `agents.nickname` exists (from provision time), we update `profiles` and use `nickname` as fallback.
- **Fallback chain:** `profiles.business_name` → `agents.nickname` → `"your business"`.

**Key files:** `frontend/src/pages/WizardPage.jsx`, `server.js` (`/webhooks/retell-inbound`, `/deploy-agent-self`).

### 3.2 Ops Infrastructure

**Goal:** Reliable webhook handling, event storage, and billing attribution.

**Implemented:**
- **Raw webhook persistence** — All webhooks stored in `webhook_queue` before processing (replay/audit).
- **Idempotency** — SHA256-based keys; duplicate events are detected and skipped.
- **Unknown phone handling** — Webhooks for numbers not in `agents` go to `unknown_phone`, not dropped.
- **Event storage** — `call_events`, `sms_events` with normalized fields for billing.
- **Alerts** — Usage warnings and blocks stored in `alerts`.
- **Tier enforcement** — `evaluateUsageThresholds()` for soft/hard limits.

**Migration:** `supabase/ops_infrastructure.sql` (run in Supabase SQL Editor).

**Helper functions in `server.js`:**  
`generateIdempotencyKey`, `persistRawWebhook`, `markWebhookProcessed`, `isDuplicateEvent`,  
`storeUnknownPhone`, `storeCallEvent`, `storeSmsEvent`, `createAlert`, `evaluateUsageThresholds`.

### 3.3 README Updates

All READMEs updated for:
- Ops infrastructure
- Form persistence and wizard behavior
- Webhook simulation script
- Supabase schema and migrations

---

## 4. Critical Flows

### 4.1 User Wizard (Deployment Wizard v3)

1. **Step 1 — Identity:** Business name, area code, consent.  
   - Saves via `POST /onboarding/identity`.  
   - Persists in localStorage (`kryonex:wizard.form`, `kryonex:wizard.form.{userId}`).
2. **Step 2 — Plan Selection:** PRO ($249), ELITE ($497), SCALE ($997). CORE is backend-only.
3. **Stripe:** User clicks "Select Plan" → Stripe checkout → redirect to success.
4. **Step 3 / Deploy:** After payment, user sees deploy step.  
   - `POST /deploy-agent-self` with `business_name`, `area_code`.  
   - Creates Retell agent, provisions phone number, sets `inbound_webhook_url` to our server.
5. **Dashboard:** Shows agent phone, business info, Cal.com CTA.

### 4.2 Inbound Call Flow

1. Caller dials provisioned number → Retell receives call.
2. Retell `POST`s to `{SERVER_URL}/webhooks/retell-inbound` with `call_inbound` payload.
3. Server:
   - Looks up `agents` by `to_number` → gets `user_id`.
   - Loads `profiles` (business_name, cal_com_url).
   - Computes `business_name` (profile → agent nickname → fallback).
   - Returns `call_inbound` with `override_agent_id`, `dynamic_variables`, `begin_message`.
4. Retell connects caller to agent; Grace uses `{{business_name}}` in greeting.

### 4.3 Admin Quick Onboard

- **Where:** `/admin/wizard/create` → Mini Onboarding Wizard.
- **Fields:** Business Name, Area Code, Email.
- **API:** `POST /admin/quick-onboard` (admin-only, rate-limited).
- **Behavior:** Creates/finds user, saves profile, sets Core tier, provisions Retell agent. No Stripe.

---

## 5. Key Files Reference

| Purpose             | Location                                      |
|---------------------|-----------------------------------------------|
| Backend entry       | `server.js`                                   |
| Frontend entry      | `frontend/src/main.jsx`                       |
| Routes              | `frontend/src/App.jsx`                        |
| Wizard logic        | `frontend/src/pages/WizardPage.jsx`           |
| Persistence helpers | `frontend/src/lib/persistence.js`             |
| API client          | `frontend/src/lib/api.js`                     |
| Wizard constants    | `frontend/src/lib/wizardConstants.js`         |
| Core schema         | `supabase/command_suite.sql`                  |
| Ops schema          | `supabase/ops_infrastructure.sql`             |
| Env template        | `env.template`                                |
| Simulate webhook    | `scripts/simulate_retell.js`                  |

---

## 6. Environment Variables

**Root `.env` (backend):**
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `RETELL_API_KEY`, `RETELL_LLM_ID_HVAC`, `RETELL_LLM_ID_PLUMBING`, etc.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs
- `FRONTEND_URL`, `APP_URL`, `SERVER_URL` — webhooks need public `SERVER_URL`
- `ADMIN_EMAIL` — comma-separated admin emails

**Frontend `frontend/.env`:**
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `VITE_API_URL` — backend URL
- `VITE_ADMIN_EMAIL` or `VITE_ADMIN_EMAILS` — admin UI visibility

See `env.template` for full list.

---

## 7. Webhooks

| Endpoint                   | Provider | Purpose                                         |
|---------------------------|----------|--------------------------------------------------|
| `POST /webhooks/retell-inbound` | Retell   | Inbound calls; returns dynamic vars             |
| `POST /retell-webhook`    | Retell   | Call events (started, ended)                     |
| `POST /webhooks/sms-inbound`    | Retell   | Inbound SMS                                      |
| `POST /stripe-webhook`    | Stripe   | Checkout, subscriptions                          |

**Retell inbound webhook URL:** Set on each phone number in Retell dashboard, or via API when provisioning. Must be `{SERVER_URL}/webhooks/retell-inbound`.

---

## 8. Testing & Debugging

### Simulate inbound webhook

```powershell
$env:WEBHOOK_URL="https://YOUR-RAILWAY-URL/webhooks/retell-inbound"
$env:TO_NUMBER="+14154297307"   # Must exist in agents table
node scripts/simulate_retell.js
```

Verifies: HTTP 200, `call_inbound.dynamic_variables.business_name` set, `begin_message` override present.

### API check

```bash
npm run test:api
```

### E2E tests

```bash
npm run test:e2e
```

Requires: `CYPRESS_TEST_EMAIL`, `CYPRESS_TEST_PASSWORD`, `CYPRESS_SUPABASE_URL`, `CYPRESS_SUPABASE_ANON_KEY`.

### Deploy verification

- **Server:** `[deploy-agent-self] profiles updated` with `verified_in_db` in logs.
- **DB:** `profiles.business_name` for user.
- **Webhook:** `simulate_retell.js` returns correct `business_name`.

---

## 9. Database Tables (High Level)

| Table               | Purpose                                      |
|---------------------|----------------------------------------------|
| `profiles`          | User metadata, business_name, area_code, role|
| `agents`            | Retell agents, phone_number, user_id, nickname |
| `subscriptions`     | Stripe subscription state                    |
| `usage_limits`      | Minutes/SMS caps, tier, limit_state          |
| `webhook_queue`     | Raw webhooks for replay/audit                |
| `unknown_phone`     | Webhooks for unrecognized numbers            |
| `call_events`       | Normalized call records                      |
| `sms_events`        | Normalized SMS records                       |
| `alerts`            | Usage warnings, blocks, failures             |
| `leads`, `messages` | CRM and comms                                |

---

## 10. Common Gotchas

1. **`business_name` empty after deploy**  
   - Check localStorage keys (`wizard.form`, `wizard.form.{userId}`).  
   - Check `profiles.business_name` and `agents.nickname` in DB.  
   - Server falls back to `agents.nickname` if profile is empty.

2. **"Agent not found for number" (404)**  
   - `TO_NUMBER` in simulate script must match `agents.phone_number` exactly (E.164).

3. **Pending agent IDs**  
   - Agents can have `agent_id` like `pending-{uuid}` until Retell finishes provisioning; webhook may receive different `agent_id` from Retell.

4. **Stripe redirect clears form**  
   - Form is restored from user-specific localStorage; ensure both keys are written in `updateField`.

5. **Ops tables missing**  
   - Run `supabase/ops_infrastructure.sql` in Supabase SQL Editor.

---

## 11. What to Do Next

1. **Deploy** — Commit and push; Railway deploys server, Vercel deploys frontend.
2. **Run ops migration** — If not done: `supabase/ops_infrastructure.sql`.
3. **Test webhook** — Use `simulate_retell.js` with a real provisioned number.
4. **Test full flow** — New account → wizard → Stripe → deploy → call number.
5. **Future work (from OPS_CHECKLIST.md):**
   - Webhook signature validation
   - Replay UI for queued webhooks
   - Nightly reconciliation job
   - Dashboard metrics for calls/SMS/errors

---

## 12. Doc Index

| Doc                      | Content                                      |
|--------------------------|----------------------------------------------|
| `docs/README.md`         | Doc index                                    |
| `docs/ADMIN_WORKFLOW.md` | Admin security, quick onboard, Fleet Registry|
| `docs/OPS_CHECKLIST.md`  | Ops implementation status                    |
| `docs/AGENT_PROMPT_GRACE.md` | Grace prompt and dynamic vars            |
| `docs/RETELL_RAILWAY_REFERENCE.md` | Retell/Railway reference            |
| `docs/RETELL_DYNAMIC_VARS_DEBUG_PROMPT.md` | Dynamic vars debugging   |
| `README.md` (root)       | Architecture, quick start, flows             |
| `frontend/README.md`     | Routes, wizard, env                          |
| `server/README.md`       | Endpoints, webhooks, ops helpers             |
| `supabase/README.md`     | Schema files and tables                      |
| `scripts/README.md`      | api-check, create-test-user, simulate_retell |

---

*This handoff is maintained as the source of truth for onboarding new contributors and AI assistants.*
