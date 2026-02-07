# Kryonex Wizard — Complete Handoff Document

**Purpose:** This document brings a new developer, buyer, or AI assistant up to speed as if they've been on the project from day one. It covers architecture, features, critical flows, debugging, and operational knowledge.

**Last updated:** February 6, 2026

---

## Table of Contents

1. [What This App Is](#1-what-this-app-is)
2. [Architecture Overview](#2-architecture-overview)
3. [Feature Inventory](#3-feature-inventory)
4. [Critical Flows](#4-critical-flows)
5. [Key Files Reference](#5-key-files-reference)
6. [Environment Variables](#6-environment-variables)
7. [Database Schema](#7-database-schema)
8. [Webhooks](#8-webhooks)
9. [Error Handling](#9-error-handling)
10. [Testing](#10-testing)
11. [Deployment](#11-deployment)
12. [Operations](#12-operations)
13. [Common Issues & Solutions](#13-common-issues--solutions)
14. [Recent Major Updates](#14-recent-major-updates)
15. [Documentation Index](#15-documentation-index)

---

## 1. What This App Is

**Kryonex Wizard** is an enterprise-grade SaaS platform for deploying and managing AI phone agents for field-service businesses (HVAC, Plumbing, Electrical). 

### Core Value Proposition

- **24/7 AI Receptionist**: Never miss a call. AI agent (Grace) answers with personalized greeting.
- **Automated Booking**: Cal.com integration for real-time appointment scheduling.
- **Lead Intelligence**: Every call transcribed, summarized, and scored.
- **Usage-Based Billing**: Stripe subscriptions with minute/SMS tracking.
- **Admin Control Plane**: Full fleet management, manual onboarding, financials.

### Who Uses It

- **End Users (Plumbers/HVAC techs)**: Use the wizard to deploy their AI agent, manage leads, view analytics
- **Platform Admin**: Manages all users, approves referrals, monitors ops

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FRONTEND (Vite + React 18)                                                  │
│  ├── Landing Page (marketing, pricing)                                       │
│  ├── Auth (login, signup with Supabase)                                     │
│  ├── Wizard (5-step onboarding with Stripe)                                 │
│  ├── User Portal (dashboard, leads, calendar, messages, analytics)          │
│  └── Admin Portal (users, referrals, financials, ops)                       │
└─────────────────────────────────────────┬───────────────────────────────────┘
                                          │ axios → VITE_API_URL
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  SERVER (Express.js - server.js, ~16,000 lines)                              │
│  ├── Auth Middleware (requireAuth, requireAdmin, resolveEffectiveUser)      │
│  ├── Rate Limiting (per-endpoint, configurable)                              │
│  ├── Webhook Handlers (Retell, Stripe, Cal.com, SMS)                        │
│  ├── Business Logic (deploy, billing, usage, referrals)                     │
│  └── Ops Infrastructure (error tracking, alerts, reconciliation)            │
└─────────────────────────────────────────┬───────────────────────────────────┘
                                          │
              ┌───────────────────────────┼───────────────────────────────────┐
              ▼                           ▼                                   ▼
        SUPABASE                     RETELL AI                           STRIPE
        (PostgreSQL)                 (Voice/SMS)                         (Billing)
        - Auth                       - Master agent                      - Subscriptions
        - 40+ tables                 - Phone provisioning                - Top-ups
        - RLS policies               - Dynamic variables                 - Webhooks
        - Real-time                  - Call recordings
```

### Tech Stack Details

| Component | Technology | Notes |
|-----------|------------|-------|
| Frontend | Vite + React 18 | Lucide icons, responsive CSS |
| Backend | Express.js (Node 20+) | Single monolith, no microservices |
| Database | Supabase PostgreSQL | RLS for security, 40+ tables |
| AI Calls | Retell AI | Master agent with per-user phone numbers |
| Payments | Stripe | Checkout sessions, subscriptions, webhooks |
| Calendar | Cal.com | OAuth integration |
| Email | Resend | Transactional emails |
| Frontend Host | Vercel | Auto-deploy from main branch |
| Backend Host | Railway | Auto-deploy from main branch |

---

## 3. Feature Inventory

### Core Platform Features

| Feature | Status | Description |
|---------|--------|-------------|
| User Onboarding Wizard | ✅ Complete | 5-step: Identity → Plan → Payment → Deploy → Dashboard |
| AI Call Agent (Grace) | ✅ Complete | Dynamic greeting with business name, Cal.com URL |
| Lead Management | ✅ Complete | CRUD, transcripts, sentiment, AI summaries |
| Calendar/Appointments | ✅ Complete | Cal.com integration, color-coded status |
| SMS Messaging | ✅ Complete | Shared number with per-tenant routing |
| Black Box Recordings | ✅ Complete | Waveform visualization, flagging, download |
| Real-time Tracking | ✅ Complete | Technician GPS with ETA notifications |
| Customer CRM | ✅ Complete | History grouped by phone number |

### Revenue Features

| Feature | Status | Price | Description |
|---------|--------|-------|-------------|
| Referral Program | ✅ Complete | Free | $25 + 10% × 12 months |
| Post-Call SMS | ✅ Complete | $29/mo | Auto-text after calls |
| Review Requests | ✅ Complete | $19/mo | Auto-request Google reviews |
| Zapier Integration | ✅ Complete | $49/mo | Outbound webhooks |

### Retention Features

| Feature | Status | Description |
|---------|--------|-------------|
| ROI Dashboard | ✅ Complete | Revenue tracking, conversion rates |
| Smart Upgrade Prompts | ✅ Complete | Usage-based upsell at 80%+ |
| Customer Health Scores | ✅ Complete | A-F grading system |
| Churn Prevention Alerts | ✅ Complete | Proactive admin notifications |
| Analytics Dashboard | ✅ Complete | Charts, trends, performance |

### Enterprise Operations

| Feature | Status | Description |
|---------|--------|-------------|
| Ops Dashboard | ✅ Complete | Errors, alerts, health, webhooks, reconciliation |
| Error Tracking | ✅ Complete | Centralized error_logs table with resolution |
| Webhook Queue | ✅ Complete | Raw storage, replay capability |
| Reconciliation Job | ✅ Complete | Nightly usage comparison at 3 AM UTC |
| Session Management | ✅ Complete | Active sessions with revocation |
| Audit Trails | ✅ Complete | All actions logged |

---

## 4. Critical Flows

### 4.1 User Wizard Flow

```
Step 1: Identity
├── Business name, area code, consent
├── Saves to localStorage (kryonex:wizard.form + kryonex:wizard.form.{userId})
└── API: POST /onboarding/identity

Step 2: Plan Selection
├── PRO ($249), ELITE ($497), SCALE ($997)
└── Shows feature comparison

Step 3: Payment
├── Stripe Checkout Session
├── Success URL: /wizard?checkout=success
└── Stripe webhook creates subscription record

Step 4: Deploy (after payment)
├── API: POST /deploy-agent-self
├── Creates/updates profile with business_name
├── Provisions phone number via Retell
├── Sets inbound webhook URL
└── Creates agent record in DB

Step 5: Dashboard
└── Shows agent phone, Cal.com CTA, usage stats
```

### 4.2 Inbound Call Flow

```
1. Caller dials provisioned number
   ↓
2. Retell receives call, POSTs to /webhooks/retell-inbound
   ↓
3. Server:
   a. Persist raw webhook to webhook_queue
   b. Check idempotency (skip if duplicate)
   c. Look up agent by phone number
   d. Load profile (business_name, cal_com_url, settings)
   e. Build dynamic_variables object
   f. Return call_inbound response with override_agent_id
   ↓
4. Retell connects caller to master agent with variables
   ↓
5. Grace greets: "Hello, thank you for calling {business_name}..."
   ↓
6. Call ends → Retell POSTs to /retell-webhook (call_ended)
   ↓
7. Server:
   a. Create lead record with transcript
   b. Update usage_limits (call_used_seconds)
   c. Store call_event for billing
   d. Trigger post-call SMS if enabled
   e. Send outbound webhooks (Zapier)
```

### 4.3 SMS Flow (Shared Number)

```
1. Inbound SMS to shared number
   ↓
2. Retell POSTs to /webhooks/sms-inbound
   ↓
3. Server determines routing:
   a. Check sms_thread_locks (active conversation lock)
   b. Check recent outbound SMS (last sent to this number)
   c. Check leads table (customer phone matches)
   d. If multiple tenants match → send disambiguation SMS
   ↓
4. Route to correct user, store message
   ↓
5. Process keywords (STOP, HELP, YES, NO)
   ↓
6. If keyword requires auto-response → send it
```

### 4.4 Admin Quick Onboard

```
1. Admin visits /admin/wizard/create
2. Fills: Business Name, Area Code, Email
3. API: POST /admin/quick-onboard
4. Server:
   a. Creates/finds user by email
   b. Saves profile with business_name
   c. Sets tier to CORE (free)
   d. Provisions Retell phone number
   e. No Stripe (admin-provisioned)
5. User can log in and start receiving calls
```

---

## 5. Key Files Reference

### Backend

| File | Purpose |
|------|---------|
| `server.js` | All backend logic (~16,000 lines) |
| `env.template` | Environment variable template |
| `package.json` | Dependencies, scripts |

### Frontend

| File | Purpose |
|------|---------|
| `frontend/src/App.jsx` | React Router config |
| `frontend/src/pages/WizardPage.jsx` | Onboarding wizard |
| `frontend/src/pages/DashboardPage.jsx` | User dashboard |
| `frontend/src/pages/AdminOpsPage.jsx` | Operations dashboard |
| `frontend/src/lib/api.js` | Axios API client |
| `frontend/src/lib/phone.js` | E.164 phone normalization |
| `frontend/src/lib/persistence.js` | localStorage helpers |

### Database

| File | Purpose |
|------|---------|
| `supabase/command_suite.sql` | Core tables |
| `supabase/ops_infrastructure.sql` | Ops tables |
| `supabase/god_tier_hardening.sql` | Health, sessions, errors |
| `supabase/fix_agents_constraints.sql` | Agent unique constraints |
| `supabase/referral_system.sql` | Referral program |

---

## 6. Environment Variables

### Backend (.env)

```bash
# === REQUIRED ===

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # Never expose to frontend!

# Retell AI
RETELL_API_KEY=key_...
RETELL_LLM_ID_HVAC=llm_...
RETELL_LLM_ID_PLUMBING=llm_...
RETELL_MASTER_AGENT_ID=agent_...  # Shared agent for all users

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_CORE=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_ELITE=price_...
STRIPE_PRICE_SCALE=price_...
STRIPE_TOPUP_300MIN=price_...
STRIPE_TOPUP_800MIN=price_...
STRIPE_TOPUP_500SMS=price_...
STRIPE_TOPUP_1000SMS=price_...

# URLs (must be publicly accessible for webhooks)
SERVER_URL=https://your-backend.railway.app
FRONTEND_URL=https://your-frontend.vercel.app
APP_URL=https://your-frontend.vercel.app

# Email
RESEND_API_KEY=re_...

# Admin (comma-separated emails)
ADMIN_EMAIL=admin@example.com

# === OPTIONAL ===
RETELL_AUTO_SYNC_MINUTES=60    # Sync templates every N minutes
PORT=3000
```

### Frontend (frontend/.env)

```bash
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...   # Public anon key, safe to expose
VITE_API_URL=http://localhost:3000
VITE_ADMIN_EMAIL=admin@example.com
```

---

## 7. Database Schema

### Core Tables

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `profiles` | user_id, business_name, area_code, role | User settings |
| `agents` | user_id, agent_id, phone_number | Retell agent config |
| `leads` | user_id, phone, name, transcript, sentiment | Customer leads |
| `messages` | user_id, thread_id, direction, body | SMS history |
| `appointments` | user_id, customer_phone, start_time | Bookings |
| `subscriptions` | user_id, stripe_subscription_id, tier | Billing state |
| `usage_limits` | user_id, call_used_seconds, sms_used | Usage tracking |

### Operations Tables

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `webhook_queue` | phone_number, event_type, raw_payload | Raw webhook storage |
| `error_logs` | error_type, message, stack_trace, resolved_at | Error tracking |
| `ops_alerts` | alert_type, severity, message | Operational alerts |
| `customer_health_scores` | user_id, score, grade, risk_level | Health grading |
| `churn_alerts` | user_id, reason, severity | Churn warnings |
| `active_sessions` | user_id, token_hash, created_at | Session tracking |
| `reconciliation_runs` | run_type, status, discrepancies_found | Reconciliation logs |

---

## 8. Webhooks

### Incoming Webhooks

| Endpoint | Source | Purpose |
|----------|--------|---------|
| `POST /webhooks/retell-inbound` | Retell | Inbound call routing |
| `POST /retell-webhook` | Retell | Call events (started, ended) |
| `POST /webhooks/sms-inbound` | Retell | Inbound SMS routing |
| `POST /stripe-webhook` | Stripe | Payment events |
| `POST /webhooks/calcom` | Cal.com | Booking events |

### Outgoing Webhooks (Zapier)

Events sent to user-configured webhook URLs:

- `call_ended` - Call completed with duration, outcome
- `call_started` - Call initiated
- `appointment_booked` - New appointment created
- `appointment_updated` - Appointment modified
- `lead_created` - New lead from call
- `sms_received` - Inbound text message

---

## 9. Error Handling

### Frontend

- **Global axios interceptor** in `api.js` transforms all API errors
- **User-friendly messages** based on status code
- **Auto-redirect on 401** to login page
- **Error states** (`loadError`, `actionError`) on all data-loading pages
- **Error banners** with retry buttons

### Backend

- **Centralized `trackError()` function** logs to `error_logs` table
- **Global error handler** catches unhandled exceptions
- **Per-webhook error handling** with graceful degradation
- **Ops alerts** created for critical failures

### Error Log Schema

```sql
error_logs (
  id, error_type, endpoint, user_id, message, 
  stack_trace, request_body, resolved_at, resolved_by
)
```

---

## 10. Testing

### E2E Tests (Cypress)

```bash
# Set credentials
$env:CYPRESS_TEST_EMAIL="test@example.com"
$env:CYPRESS_TEST_PASSWORD="password123"

# Run all tests
npm run test:e2e

# Run specific spec
npx cypress run --spec "cypress/e2e/smoke.spec.js"
```

### Test Specs

| Spec | Coverage |
|------|----------|
| `smoke.spec.js` | Dashboard, leads, calendar, messages, black box |
| `critical.spec.js` | Auth, core navigation |
| `wizard-matrix.spec.js` | Wizard field combinations |

### API Health Check

```bash
npm run test:api
```

### Simulate Webhook

```powershell
$env:WEBHOOK_URL="https://your-backend/webhooks/retell-inbound"
$env:TO_NUMBER="+14155551234"  # Must exist in agents table
node scripts/simulate_retell.js
```

---

## 11. Deployment

### Frontend → Vercel

1. Connect GitHub repo
2. Build command: `cd frontend && npm run build`
3. Output directory: `frontend/dist`
4. Environment variables from `frontend/.env`

### Backend → Railway

1. Connect GitHub repo
2. Start command: `node server.js`
3. Environment variables from `.env`
4. Note public URL for webhook config

### Post-Deploy Checklist

- [ ] Run all SQL migrations in Supabase
- [ ] Configure Stripe webhook: `{SERVER_URL}/stripe-webhook`
- [ ] Configure Retell phone webhooks: `{SERVER_URL}/webhooks/retell-inbound`
- [ ] Test wizard flow: signup → payment → deploy
- [ ] Test call flow: dial number → verify greeting
- [ ] Verify admin access: `/admin/dashboard`
- [ ] Check Ops Dashboard for errors

---

## 12. Operations

### Scheduled Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| Nightly Reconciliation | 3:00 AM UTC | Compare usage aggregates vs actual |
| Appointment Reminders | Continuous | Send 24h/1h reminders |
| Template Sync | Configurable | Sync Retell templates |

### Monitoring

- **Ops Dashboard** (`/admin/ops`): Errors, alerts, webhooks, reconciliation
- **Error Logs Tab**: All tracked errors with resolution
- **Webhook Queue Tab**: Pending/failed webhooks with replay
- **Reconciliation Tab**: Usage discrepancy reports

### Alerts

Automatic alerts created for:
- Usage thresholds (80%, 100%, hard stop)
- Webhook delivery failures
- Reconciliation discrepancies
- Churn risk indicators

---

## 13. Common Issues & Solutions

### "Agent not found for number" (404)

**Cause**: Phone number lookup failed
**Solution**: 
1. Verify number is in E.164 format (+1XXXXXXXXXX)
2. Check `agents` table for matching `phone_number`
3. Run `fix_agents_constraints.sql` if duplicate key errors

### Business Name Not Showing in Greeting

**Cause**: Profile not saved or variable not passed
**Solution**:
1. Check `profiles.business_name` for user
2. Check `agents.nickname` as fallback
3. Verify `/webhooks/retell-inbound` returns `dynamic_variables.business_name`

### Duplicate Key Error on Deploy

**Cause**: Wrong unique constraint on `agents` table
**Solution**: Run `supabase/fix_agents_constraints.sql`

### Stripe Redirect Goes to Wrong Step

**Cause**: Outdated `persistStep()` call
**Solution**: Verify `WizardPage.jsx` uses `persistStep(5)` after payment success

### SMS Not Sending

**Cause**: Usage cap reached
**Solution**:
1. Check `usage_limits.sms_used` vs `sms_cap + sms_credit`
2. Add top-up or reset period

### Phone Numbers Missing +1

**Cause**: Number not normalized to E.164
**Solution**: 
1. `normalizePhoneE164()` in `frontend/src/lib/phone.js`
2. All phone fields use `onBlur` normalization
3. Backend normalizes on save

---

## 14. Recent Major Updates

### God-Tier Launch Hardening (Feb 2026)

1. **Customer Health Scores**: A-F grading based on usage, engagement, billing
2. **Churn Prevention**: Proactive alerts when users show decline
3. **ROI Dashboard**: Revenue tracking visible on user dashboard
4. **Smart Upgrade Prompts**: Usage-based upsell at 80%+
5. **Session Security**: Active session tracking with revocation
6. **Error Tracking**: Centralized `trackError()` with `error_logs` table
7. **Ops Dashboard**: Full admin visibility into system health

### Ops Infrastructure

1. **Webhook Queue**: Raw storage, replay capability
2. **Reconciliation Job**: Nightly usage comparison (3 AM UTC)
3. **Ops Alerts**: Automatic alerts for critical issues

### Critical Bug Fixes

1. **Duplicate Agent Key**: Changed to upsert with `user_id` conflict
2. **Stripe Redirect**: Now goes to Deploy step (5) not Communications (3)
3. **Phone Normalization**: E.164 format on all devices (including mobile)
4. **Error Handling**: Global interceptor + per-page error states

---

## 15. Documentation Index

| Document | Location | Description |
|----------|----------|-------------|
| Main README | `README.md` | Architecture, quick start, features |
| **This Handoff** | `docs/HANDOFF.md` | Complete handoff for new devs |
| Admin Workflow | `docs/ADMIN_WORKFLOW.md` | Admin portal documentation |
| Ops Checklist | `docs/OPS_CHECKLIST.md` | Operations status |
| Implementation Audit | `docs/IMPLEMENTATION_AND_AUDIT.md` | Feature audit trail |
| Agent Prompt | `docs/AGENT_PROMPT_GRACE.md` | Grace AI configuration |
| Variables Reference | `docs/VARIABLES_AND_PROMPTS.md` | Dynamic variables |
| Frontend README | `frontend/README.md` | Frontend architecture |
| Server README | `server/README.md` | Backend API reference |
| Database README | `supabase/README.md` | Schema documentation |
| Scripts README | `scripts/README.md` | Utility scripts |
| Cypress README | `cypress/README.md` | E2E testing guide |

---

## Quick Reference Card

```
DEPLOY NEW USER:
1. User: Wizard → Pay → Deploy
2. Admin: /admin/wizard/create → Quick Onboard

TEST A CALL:
1. Get phone from agents table
2. Dial number
3. Listen for business name in greeting

DEBUG MISSING DATA:
1. Check profiles.business_name
2. Check agents.nickname
3. Check localStorage (kryonex:wizard.form.{userId})
4. Check server logs for deploy response

REPLAY FAILED WEBHOOK:
1. /admin/ops → Webhook Queue tab
2. Filter by "failed"
3. Click Replay button

CHECK USAGE:
1. /billing page shows user usage
2. usage_limits table has raw numbers
3. /admin/financials shows platform-wide

MONITOR ERRORS:
1. /admin/ops → Errors tab
2. Click "Resolve" when fixed
3. Check error_logs table for details
```

---

*This handoff is the source of truth for anyone taking over this codebase. Keep it updated.*
