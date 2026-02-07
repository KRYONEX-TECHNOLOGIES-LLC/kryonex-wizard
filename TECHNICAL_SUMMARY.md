# KRYONEX WIZARD - COMPLETE TECHNICAL SUMMARY

**Generated:** February 6, 2026  
**Purpose:** Complete technical overview for pricing, selling, and positioning

---

## TABLE OF CONTENTS

1. [Executive Summary](#1-executive-summary)
2. [Backend Architecture](#2-backend-architecture)
3. [Database Schema](#3-database-schema)
4. [Frontend Architecture](#4-frontend-architecture)
5. [Operational Systems](#5-operational-systems)
6. [Deployment & Infrastructure](#6-deployment--infrastructure)
7. [Complete Feature List](#7-complete-feature-list)
8. [Business Logic Flows](#8-business-logic-flows)
9. [Integrations](#9-integrations)
10. [Pricing & Billing](#10-pricing--billing)

---

## 1. EXECUTIVE SUMMARY

### What It Is

**Kryonex Wizard** is an enterprise-grade B2B SaaS platform that deploys and manages AI-powered phone receptionists for field-service businesses (HVAC, Plumbing, Electrical). The platform provides:

- **24/7 AI Phone Agent** - Answers calls with personalized greetings
- **Appointment Booking** - Cal.com integration for real-time scheduling
- **Lead Intelligence** - Call transcripts, sentiment analysis, AI summaries
- **SMS Automation** - Post-call texts, review requests, ETA notifications
- **Usage-Based Billing** - Stripe subscriptions with minute/SMS tracking
- **Admin Control Plane** - Fleet management, referrals, financials

### Target Market

- **Primary:** HVAC and Plumbing companies (1-50 employees)
- **Secondary:** Electrical, Landscaping, Home Services
- **Revenue Model:** Monthly SaaS subscriptions ($149-$997/month) + top-ups

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + Vite |
| Backend | Express.js (Node 20+) |
| Database | Supabase (PostgreSQL) |
| AI Voice | Retell AI |
| Payments | Stripe |
| Calendar | Cal.com |
| Email | Resend |
| Hosting | Vercel + Railway |

### Key Metrics (Architecture)

- **Server.js:** ~16,000 lines of code
- **API Endpoints:** 130+ endpoints
- **Database Tables:** 40+ tables
- **Frontend Pages:** 36 pages
- **Components:** 16 reusable components

---

## 2. BACKEND ARCHITECTURE

### 2.1 Server Structure

Single monolithic Express.js server (`server.js`) handling all backend logic.

### 2.2 Middleware Stack

| Middleware | Purpose |
|------------|---------|
| `requireAuth` | JWT validation via Supabase |
| `requireAdmin` | Admin role verification |
| `resolveEffectiveUser` | Admin impersonation support |
| `rateLimit` | Per-endpoint rate limiting |
| `validateBody` | Request body validation |

### 2.3 Complete API Endpoints

#### Dashboard & Stats (6 endpoints)
```
GET  /                                    Health check
GET  /dashboard-stats                     Basic stats
GET  /api/dashboard/stats                 Dashboard KPIs
GET  /api/dashboard/stats-enhanced        Enhanced stats with ROI
GET  /api/dashboard/roi                   ROI metrics
GET  /api/analytics                       Charts and trends
```

#### Usage & Billing (8 endpoints)
```
GET  /usage/status                        Usage limits and remaining
GET  /subscription-status                 Subscription state
POST /create-checkout-session             Stripe checkout
POST /create-portal-session               Stripe billing portal
POST /create-topup-session                Top-up purchase
POST /verify-checkout-session             Verify payment
GET  /deploy-status                       Agent deployment status
POST /deploy-agent-self                   User self-deploy
```

#### Leads & CRM (8 endpoints)
```
GET  /leads                               List user's leads
POST /leads                               Create lead
PUT  /leads/:id                           Update lead
DELETE /leads/:id                         Delete lead
POST /leads/:leadId/flag                  Flag for review
POST /leads/update-status                 Bulk status update
GET  /api/customers                       Customer list (grouped by phone)
GET  /api/customers/:phone/history        Customer timeline
```

#### Appointments (6 endpoints)
```
GET    /appointments                      List appointments
POST   /appointments                      Create appointment
PUT    /appointments/:id                  Update appointment
DELETE /appointments/:id                  Delete appointment
PATCH  /appointments/:id                  Partial update
POST   /appointments/:id/request-review   Send review request
```

#### Messages & SMS (4 endpoints)
```
GET  /messages                            SMS history
POST /send-sms                            Send SMS
POST /tracking/eta-update                 Send ETA text
POST /tracking/send-link                  Send tracking link
```

#### Cal.com Integration (5 endpoints)
```
GET  /api/calcom/authorize                OAuth initiate
GET  /api/calcom/authorize-url            Get OAuth URL
GET  /api/calcom/callback                 OAuth callback
GET  /api/calcom/status                   Connection status
POST /api/calcom/disconnect               Disconnect
```

#### Settings (3 endpoints)
```
GET  /api/settings                        Get all settings
PUT  /api/settings                        Update settings
POST /api/change-password                 Change password
```

#### Session Management (3 endpoints)
```
GET    /api/sessions                      List active sessions
DELETE /api/sessions/:sessionId           Revoke session
DELETE /api/sessions                      Revoke all sessions
```

#### Referral System - User (6 endpoints)
```
GET  /referral/my-code                    Get/create referral code
GET  /referral/stats                      Earnings summary
GET  /referral/history                    Detailed history
POST /referral/request-payout             Request payout
GET  /referral/payout-history             Payout history
POST /referral/record-signup              Record referral signup
```

#### Referral System - Admin (9 endpoints)
```
GET  /admin/referrals                     All referrals
GET  /admin/referrals/:id                 Single referral
POST /admin/referrals/:id/approve         Approve
POST /admin/referrals/:id/reject          Reject
POST /admin/referrals/:id/mark-paid       Mark paid
GET  /admin/referral-settings             Settings
PUT  /admin/referral-settings             Update settings
GET  /admin/referral-payout-requests      Pending payouts
POST /admin/referral-payout-requests/:id/approve
POST /admin/referral-payout-requests/:id/reject
POST /admin/referral-payout-requests/:id/mark-paid
```

#### Webhooks - User (7 endpoints)
```
GET    /api/webhooks                      List webhooks
POST   /api/webhooks                      Create webhook
PUT    /api/webhooks/:id                  Update webhook
DELETE /api/webhooks/:id                  Delete webhook
POST   /api/webhooks/:id/test             Test delivery
GET    /api/webhooks/:id/deliveries       Delivery history
POST   /api/webhooks/:wid/deliveries/:did/retry  Retry delivery
```

#### Call Recordings (5 endpoints)
```
GET  /call-recordings                     User's recordings
POST /call-recordings                     Create recording
GET  /admin/call-recordings               All recordings (admin)
POST /admin/call-recordings/:id/feedback  Add feedback
POST /black-box/event                     Log black box event
```

#### Tracking (6 endpoints)
```
POST /tracking/create                     Create tracking session
GET  /tracking/session/:token             Get session (public)
GET  /tracking/points/:token              Get GPS points (public)
POST /tracking/update                     Post GPS update
POST /tracking/arrive                     Mark arrival
POST /tracking/complete                   Mark complete
```

#### Admin - Users & Metrics (12 endpoints)
```
GET  /admin/users                         All users
GET  /admin/users/:userId                 User details
GET  /admin/metrics                       Platform metrics
GET  /admin/metrics-enhanced              Enhanced metrics
GET  /admin/health                        Platform health
GET  /admin/timeseries                    Time series data
GET  /admin/leads                         All leads
GET  /admin/messages                      All messages
GET  /admin/appointments                  All appointments
GET  /admin/usage-stats                   Usage statistics
GET  /admin/audit-logs                    Audit logs
GET  /admin/dialer-queue                  Dialer queue
```

#### Admin - Onboarding (7 endpoints)
```
POST /admin/quick-onboard                 Quick deploy
POST /admin/create-account                Create account
POST /admin/onboarding/identity           Save identity
POST /admin/consent                       Accept consent
POST /admin/deploy-agent                  Deploy agent
POST /admin/stripe-link                   Generate Stripe link
GET  /admin/user-by-email                 Find user
```

#### Admin - Operations (12 endpoints)
```
GET  /admin/error-logs                    Error logs
POST /admin/error-logs/:id/resolve        Resolve error
GET  /admin/ops-alerts                    Ops alerts
POST /admin/ops-alerts/:id/acknowledge    Acknowledge alert
GET  /admin/health-scores                 Customer health
POST /admin/health-scores/:id/recalculate Recalculate
GET  /admin/churn-alerts                  Churn alerts
POST /admin/churn-alerts/:id/resolve      Resolve churn
GET  /admin/webhook-queue                 Webhook queue
POST /admin/webhook-queue/:id/replay      Replay webhook
GET  /admin/reconciliation-runs           Reconciliation history
POST /admin/reconciliation-runs/trigger   Manual trigger
```

#### Admin - Sellers (4 endpoints)
```
GET  /admin/sellers                       Seller roster
GET  /admin/sellers/:id/dossier           Seller details
GET  /admin/sellers/:id/audit             Seller audit
POST /admin/commissions/:id/approve       Approve commission
```

#### Webhook Handlers (5 endpoints)
```
POST /webhooks/retell-inbound             Retell inbound calls
POST /retell-webhook                      Retell events
POST /api/retell/webhook                  Retell events (alt)
POST /webhooks/sms-inbound                Retell SMS
POST /stripe-webhook                      Stripe events
POST /webhooks/calcom                     Cal.com events
```

#### Onboarding (3 endpoints)
```
POST /onboarding/identity                 Save identity
POST /consent                             Accept consent
POST /deploy-agent                        Deploy agent
```

#### Miscellaneous (6 endpoints)
```
POST /update-agent                        Update agent config
POST /retell/demo-call                    Trigger demo call
POST /admin/sync-stripe                   Sync Stripe data
POST /admin/retell/sync-templates         Sync Retell templates
POST /admin/verify-code                   Verify admin code
POST /admin/auto-grant                    Auto-grant admin
```

### 2.4 Webhook Handlers

#### Retell Inbound Call (`/webhooks/retell-inbound`)
```
Flow:
1. Persist raw webhook to webhook_queue
2. Check idempotency (skip duplicates)
3. Look up agent by phone number
4. Load user profile and settings
5. Build dynamic_variables object
6. Return call_inbound response with override_agent_id
```

Response Schema:
```json
{
  "call_inbound": {
    "override_agent_id": "agent_xxx",
    "dynamic_variables": {
      "business_name": "Acme Plumbing",
      "cal_com_url": "https://cal.com/...",
      "transfer_number": "+1...",
      "tone": "professional",
      "industry": "plumbing"
    },
    "begin_message": "Hello, thank you for calling..."
  }
}
```

#### Retell Events (`/retell-webhook`)
```
Events handled:
- call_started: Log call start, update active call count
- call_ended: Create lead, update usage, trigger post-call SMS
- call_analyzed: Store transcript and summary
```

#### SMS Inbound (`/webhooks/sms-inbound`)
```
Flow:
1. Persist raw webhook
2. Determine routing (thread lock, recent outbound, lead match)
3. Handle multi-tenant collision (disambiguation SMS)
4. Process keywords (STOP, HELP, YES, NO)
5. Store message, send auto-response if needed
```

#### Stripe Events (`/stripe-webhook`)
```
Events handled:
- checkout.session.completed: Create subscription, record referral
- invoice.payment_succeeded: Recurring payment, referral commission
- customer.subscription.updated: Update tier
- customer.subscription.deleted: Handle cancellation
- charge.refunded: Referral clawback
- charge.dispute.created: Dispute handling
```

### 2.5 Scheduled Jobs

| Job | Schedule | Function |
|-----|----------|----------|
| Appointment Reminders | Every 60s | `scheduleAppointmentReminders()` |
| Nightly Reconciliation | 3 AM UTC | `scheduleNightlyReconciliation()` |
| Retell Template Sync | Configurable | `scheduleRetellTemplateSync()` |

### 2.6 Error Handling

```javascript
// Centralized error tracking
trackError({
  error_type: "webhook_failure",
  endpoint: "/webhooks/retell-inbound",
  user_id: userId,
  message: error.message,
  stack_trace: error.stack,
  request_body: req.body
});

// Global error handler
app.use((err, req, res, next) => {
  trackError({...});
  res.status(statusCode).json({ error: err.message, request_id: req.requestId });
});
```

### 2.7 Rate Limiting

| Endpoint Category | Limit |
|-------------------|-------|
| Deploy | 6/min |
| Quick onboard | 6/min |
| Appointments | 30/min |
| Review requests | 10/min |
| Admin error logs | 30/min |
| Webhook queue | 30/min |
| Reconciliation | 5/5min |

---

## 3. DATABASE SCHEMA

### 3.1 Core Tables

#### profiles
```sql
CREATE TABLE profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT,
  business_name TEXT,
  area_code TEXT,
  role TEXT DEFAULT 'user',              -- 'user', 'admin', 'seller'
  tier TEXT DEFAULT 'core',              -- 'core', 'pro', 'elite', 'scale'
  industry TEXT,                         -- 'hvac', 'plumbing', 'electrical'
  phone TEXT,
  cal_com_url TEXT,
  transfer_number TEXT,                   -- E.164 format
  user_personal_phone TEXT,
  business_hours JSONB,
  
  -- SMS Automation
  post_call_sms_enabled BOOLEAN DEFAULT FALSE,
  post_call_sms_template TEXT,
  post_call_sms_delay_seconds INTEGER DEFAULT 60,
  review_request_enabled BOOLEAN DEFAULT FALSE,
  review_request_template TEXT,
  google_review_url TEXT,
  
  -- Onboarding
  onboarding_step INTEGER DEFAULT 0,
  consent_version TEXT,
  consent_accepted_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### agents
```sql
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id),  -- One agent per user
  agent_id TEXT,                          -- Retell agent ID (shared master)
  phone_number TEXT UNIQUE,               -- E.164 format
  nickname TEXT,                          -- Business name fallback
  status TEXT DEFAULT 'active',           -- 'active', 'pending', 'disabled'
  is_active BOOLEAN DEFAULT TRUE,
  inbound_webhook_url TEXT,
  provider TEXT DEFAULT 'retell',
  provider_number_id TEXT,
  deploy_request_id TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE UNIQUE INDEX agents_user_id_key ON agents(user_id);
CREATE UNIQUE INDEX agents_phone_number_key ON agents(phone_number);
CREATE INDEX agents_agent_id_idx ON agents(agent_id);
```

#### leads
```sql
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  phone TEXT,
  name TEXT,
  business_name TEXT,
  email TEXT,
  
  -- Call Data
  transcript TEXT,
  summary TEXT,
  sentiment TEXT,                         -- 'positive', 'neutral', 'negative'
  call_duration_seconds INTEGER,
  call_outcome TEXT,
  recording_url TEXT,
  
  -- Status
  status TEXT DEFAULT 'new',
  appointment_booked BOOLEAN DEFAULT FALSE,
  flagged_for_review BOOLEAN DEFAULT FALSE,
  
  -- Enrichment
  service_address TEXT,
  issue_type TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leads_user ON leads(user_id);
CREATE INDEX idx_leads_phone ON leads(phone);
CREATE INDEX idx_leads_created ON leads(created_at);
```

#### messages
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  thread_id TEXT,
  direction TEXT,                         -- 'inbound', 'outbound'
  from_number TEXT,
  to_number TEXT,
  body TEXT,
  status TEXT,
  provider_message_id TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_user ON messages(user_id);
CREATE INDEX idx_messages_thread ON messages(thread_id);
```

#### appointments
```sql
CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  service_type TEXT,
  
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  status TEXT DEFAULT 'scheduled',        -- 'scheduled', 'confirmed', 'completed', 'cancelled'
  
  notes TEXT,
  address TEXT,
  cal_booking_uid TEXT,
  
  reminder_24h_sent BOOLEAN DEFAULT FALSE,
  reminder_1h_sent BOOLEAN DEFAULT FALSE,
  review_requested BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### subscriptions
```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  tier TEXT,
  status TEXT,                            -- 'active', 'canceled', 'past_due'
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.2 Usage Tracking Tables

#### usage_limits
```sql
CREATE TABLE usage_limits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  tier TEXT DEFAULT 'core',
  
  -- Call Usage
  call_cap_seconds INTEGER DEFAULT 9000,  -- 150 min for CORE
  call_used_seconds INTEGER DEFAULT 0,
  call_credit INTEGER DEFAULT 0,          -- Bonus from top-ups
  
  -- SMS Usage
  sms_cap INTEGER DEFAULT 50,
  sms_used INTEGER DEFAULT 0,
  sms_credit INTEGER DEFAULT 0,
  
  -- Period
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  
  -- Enforcement
  limit_state TEXT DEFAULT 'under',       -- 'under', 'soft', 'hard'
  hard_stop_active BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### usage_calls
```sql
CREATE TABLE usage_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  call_id TEXT,
  phone_number TEXT,
  direction TEXT,
  seconds INTEGER,
  provider_call_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_usage_calls_user ON usage_calls(user_id);
CREATE INDEX idx_usage_calls_created ON usage_calls(created_at);
```

#### usage_sms
```sql
CREATE TABLE usage_sms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  message_id TEXT,
  phone_number TEXT,
  direction TEXT,
  provider_message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.3 Operations Tables

#### webhook_queue
```sql
CREATE TABLE webhook_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT,
  user_id UUID,
  agent_id TEXT,
  event_type TEXT,
  raw_payload JSONB,
  idempotency_key TEXT UNIQUE,
  
  received_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  processed_by TEXT,
  result TEXT,
  error_message TEXT,
  attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ
);

CREATE INDEX idx_webhook_queue_unprocessed ON webhook_queue(processed_at) WHERE processed_at IS NULL;
CREATE INDEX idx_webhook_queue_phone ON webhook_queue(phone_number);
```

#### error_logs
```sql
CREATE TABLE error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_type TEXT NOT NULL,
  endpoint TEXT,
  user_id UUID,
  message TEXT,
  stack_trace TEXT,
  request_body JSONB,
  
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  resolution_notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_error_logs_unresolved ON error_logs(resolved_at) WHERE resolved_at IS NULL;
```

#### ops_alerts
```sql
CREATE TABLE ops_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,                 -- 'info', 'warning', 'critical'
  user_id UUID,
  message TEXT NOT NULL,
  details JSONB,
  
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### customer_health_scores
```sql
CREATE TABLE customer_health_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id),
  score INTEGER,                          -- 0-100
  grade TEXT,                             -- 'A', 'B', 'C', 'D', 'F'
  risk_level TEXT,                        -- 'low', 'medium', 'high', 'critical'
  factors JSONB,
  last_calculated TIMESTAMPTZ DEFAULT NOW()
);
```

#### churn_alerts
```sql
CREATE TABLE churn_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  reason TEXT,
  severity TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### reconciliation_runs
```sql
CREATE TABLE reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type TEXT NOT NULL,                 -- 'nightly', 'manual'
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'running',          -- 'running', 'completed', 'failed'
  records_checked INTEGER DEFAULT 0,
  discrepancies_found INTEGER DEFAULT 0,
  discrepancy_details JSONB,
  triggered_by TEXT,
  notes TEXT
);
```

#### active_sessions
```sql
CREATE TABLE active_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  token_hash TEXT UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_active TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);
```

### 3.4 Referral System Tables

#### referral_codes
```sql
CREATE TABLE referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES auth.users(id),
  code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### referrals
```sql
CREATE TABLE referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID REFERENCES auth.users(id),
  referred_id UUID REFERENCES auth.users(id),
  referral_code TEXT,
  status TEXT DEFAULT 'pending',          -- 'pending', 'qualified', 'paid'
  upfront_paid BOOLEAN DEFAULT FALSE,
  hold_until TIMESTAMPTZ,                 -- 30-day fraud protection
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### referral_commissions
```sql
CREATE TABLE referral_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id UUID REFERENCES referrals(id),
  referrer_id UUID REFERENCES auth.users(id),
  commission_type TEXT,                   -- 'upfront', 'recurring'
  amount DECIMAL(10,2),
  month_number INTEGER,
  status TEXT DEFAULT 'pending',
  stripe_payment_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### payout_requests
```sql
CREATE TABLE payout_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  amount DECIMAL(10,2),
  status TEXT DEFAULT 'pending',          -- 'pending', 'approved', 'rejected', 'paid'
  payment_method TEXT,
  payment_details JSONB,
  admin_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  paid_at TIMESTAMPTZ,
  payment_reference TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.5 SMS & Automation Tables

#### sms_automation_log
```sql
CREATE TABLE sms_automation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  automation_type TEXT,                   -- 'post_call', 'review_request', 'reminder'
  trigger_id UUID,
  recipient_phone TEXT,
  template_used TEXT,
  status TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### webhook_configs
```sql
CREATE TABLE webhook_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  name TEXT,
  url TEXT NOT NULL,
  events TEXT[] NOT NULL,                 -- Array of event types
  secret TEXT,                            -- HMAC secret
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### webhook_deliveries
```sql
CREATE TABLE webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID REFERENCES webhook_configs(id),
  event_type TEXT,
  payload JSONB,
  status_code INTEGER,
  response_body TEXT,
  attempts INTEGER DEFAULT 1,
  last_error TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.6 Other Tables

#### call_recordings
```sql
CREATE TABLE call_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  lead_id UUID REFERENCES leads(id),
  duration INTEGER,
  recording_url TEXT,
  outcome TEXT,
  flagged_for_review BOOLEAN DEFAULT FALSE,
  admin_feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### tracking_sessions
```sql
CREATE TABLE tracking_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  appointment_id UUID REFERENCES appointments(id),
  token TEXT UNIQUE,
  customer_phone TEXT,
  technician_name TEXT,
  status TEXT DEFAULT 'active',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

#### tracking_points
```sql
CREATE TABLE tracking_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES tracking_sessions(id),
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  accuracy DECIMAL(10,2),
  heading DECIMAL(5,2),
  speed DECIMAL(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### consent_logs
```sql
CREATE TABLE consent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  consent_version TEXT,
  consent_type TEXT,
  accepted_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT
);
```

#### integrations
```sql
CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  provider TEXT,                          -- 'calcom', 'google', 'zapier'
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### audit_logs
```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  action TEXT,
  entity_type TEXT,
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 4. FRONTEND ARCHITECTURE

### 4.1 Tech Stack

- **Framework:** React 18
- **Build Tool:** Vite
- **Routing:** React Router v6
- **HTTP Client:** Axios
- **Icons:** Lucide React
- **Styling:** Custom CSS (dark theme)
- **Auth:** Supabase Auth

### 4.2 Complete Page List

#### Public Pages (4)
| Route | Component | Description |
|-------|-----------|-------------|
| `/` | LandingGate | Marketing landing page |
| `/login` | LoginPage | Auth with referral code capture |
| `/affiliate` | AffiliatePage | Affiliate signup |
| `/thank-you` | ThankYouPage | Post-signup confirmation |

#### Protected User Pages (15)
| Route | Component | Description |
|-------|-----------|-------------|
| `/wizard` | WizardPage | 5-step onboarding |
| `/dashboard` | DashboardPage | KPIs, activity feed, ROI |
| `/leads` | LeadsPage | Lead management |
| `/customers` | CustomersPage | CRM by phone |
| `/calendar` | CalendarPage | Appointments |
| `/messages` | MessagesPage | SMS inbox |
| `/black-box` | BlackBoxPage | Call recordings |
| `/analytics` | AnalyticsPage | Charts |
| `/referrals` | ReferralPage | Referral dashboard |
| `/integrations` | IntegrationsPage | Webhooks/Zapier |
| `/settings` | SettingsPage | Business settings |
| `/billing` | BillingPage | Subscription |
| `/billing/tiers` | BillingTiersPage | Plan selection |
| `/numbers` | NumbersPage | Phone numbers |
| `/track/:token` | TrackingSharePage | Public tracking |

#### Admin Pages (17)
| Route | Component | Description |
|-------|-----------|-------------|
| `/admin/dashboard` | AdminDashboardPage | Platform metrics |
| `/admin/users` | AdminUsersPage | Fleet Registry |
| `/admin/wizard/create` | AdminClientWizardPage | Deploy clients |
| `/admin/leads` | AdminLeadsPage | All leads |
| `/admin/messages` | AdminMessagesPage | All SMS |
| `/admin/calendar` | AdminCalendarPage | All appointments |
| `/admin/call-center` | AdminCallCenterPage | Live calls |
| `/admin/black-box` | AdminBlackBoxPage | All recordings |
| `/admin/referrals` | AdminReferralsPage | Referral management |
| `/admin/financials` | AdminFinancialsPage | Revenue |
| `/admin/ops` | AdminOpsPage | Operations dashboard |
| `/admin/logs` | AdminLogsPage | Activity logs |
| `/admin/final-logs` | AdminFinalLogsPage | Final logs |
| `/admin/sellers` | AdminSellersPage | Personnel |
| `/admin/stripe-success` | AdminStripeSuccessPage | Stripe callback |
| `/console/dialer` | SalesConsolePage | Sales dialer |
| `/tech/track/:token` | TechTrackingPage | Tech tracking |

### 4.3 Components

| Component | Purpose |
|-----------|---------|
| `SideNav` | Main navigation sidebar |
| `TopMenu` | Top navigation bar |
| `ProtectedRoute` | Auth wrapper |
| `RequireAdmin` | Admin role wrapper |
| `RequireOnboarding` | Onboarding check |
| `RequireRole` | Role-based access |
| `UpsellModal` | Usage-based upgrade prompts |
| `SmartUpgradePrompt` | Contextual upsells |
| `ROIDashboard` | ROI metrics display |
| `WizardEmbedded` | Embedded wizard for admin |
| `TrackingMap` | GPS tracking display |
| `LandingGate` | Landing page logic |
| `TimeSelect` | Time picker |
| `TerminalTyping` | Typing animation |
| `BackgroundGrid` | Visual effect |
| `AdminModeToggle` | Admin view switch |

### 4.4 State Management

#### localStorage Keys
```javascript
// Wizard
"kryonex:wizard.step"                    // Current step
"kryonex:wizard.form"                    // Generic form data
"kryonex:wizard.form.{userId}"           // User-specific form

// Admin
"kryonex_admin_mode"                     // Admin view toggle
"kryonex_impersonation_user_id"          // Impersonated user

// UI State
"kryonex_referral_code"                  // Captured referral
"kryonex_upsell_modal_dismissed_time"    // Dismiss timestamp
"kryonex_sms_banner_dismissed"           // Banner dismiss
```

### 4.5 API Layer

```javascript
// Base configuration
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL
});

// Request interceptor
- Injects Supabase JWT
- Adds admin mode header
- Adds impersonation headers

// Response interceptor
- Transforms errors to user-friendly messages
- Auto-redirect on 401
- Error logging in development
```

---

## 5. OPERATIONAL SYSTEMS

### 5.1 Webhook Queue & Replay

**Purpose:** Ensure no webhook is lost; enable replay for debugging.

```javascript
// Persist before processing
persistRawWebhook({
  phoneNumber,
  userId,
  eventType,
  rawPayload,
  idempotencyKey: generateIdempotencyKey(payload)
});

// Check for duplicates
isDuplicateEvent(idempotencyKey);

// Mark completion
markWebhookProcessed(idempotencyKey, result, errorMessage);
```

**Admin UI:** `/admin/ops` → Webhook Queue tab
- Filter by status (pending/failed/success)
- View raw payload
- Replay button

### 5.2 Nightly Reconciliation

**Purpose:** Compare usage aggregates with actual event records.

```javascript
runReconciliation() {
  // For each user with usage_limits
  // Sum usage_calls.seconds and usage_sms count
  // Compare with usage_limits.call_used_seconds and sms_used
  // Flag discrepancies > 5%
  // Insert into reconciliation_runs
  // Create ops_alert if issues found
}

// Schedule: 3 AM UTC daily
scheduleNightlyReconciliation();
```

### 5.3 Usage Enforcement

```javascript
evaluateUsageThresholds(userId) {
  // Check call and SMS usage
  // Return: 'under_limit' | 'soft_limit' | 'hard_limit'
  
  // 80%: Show upgrade prompt
  // 100%: Soft warning
  // 110% (with credit): Hard stop
}
```

### 5.4 Customer Health Scoring

**Factors:**
- Usage activity (calls, SMS)
- Engagement (logins, feature use)
- Billing status (on-time, failed)
- Trend (increasing/decreasing)

**Grades:** A (90-100), B (80-89), C (70-79), D (60-69), F (<60)

**Risk Levels:** low, medium, high, critical

### 5.5 Error Tracking

```javascript
trackError({
  error_type,
  endpoint,
  user_id,
  message,
  stack_trace,
  request_body
});

// Creates record in error_logs table
// Viewable in Admin Ops Dashboard
// Supports resolution with notes
```

### 5.6 Phone Provisioning Flow

```
1. User completes wizard Step 1 (Identity)
2. User selects plan in Step 2
3. Stripe checkout in Step 3
4. After payment, Step 5 (Deploy):
   a. Call POST /deploy-agent-self
   b. Create/update profile
   c. Call Retell API to provision phone number
   d. Set inbound webhook URL on phone
   e. Create agents record
   f. Create usage_limits record
5. User sees phone number on dashboard
```

### 5.7 Admin Quick Onboard Flow

```
1. Admin visits /admin/wizard/create
2. Enters: Business Name, Area Code, Email
3. POST /admin/quick-onboard:
   a. Create/find user by email
   b. Create profile with business_name
   c. Set tier to 'core' (no payment)
   d. Provision phone via Retell
   e. Create agent and usage_limits records
4. User can log in immediately
```

---

## 6. DEPLOYMENT & INFRASTRUCTURE

### 6.1 Frontend (Vercel)

**Build Configuration:**
```json
{
  "buildCommand": "cd frontend && npm run build",
  "outputDirectory": "frontend/dist",
  "framework": "vite"
}
```

**vercel.json:**
```json
{
  "routes": [
    { "handle": "filesystem" },
    { "src": "/(.*)", "dest": "/index.html" }
  ]
}
```

### 6.2 Backend (Railway)

**Start Command:** `node server.js`

**Environment Variables Required:**
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
RETELL_API_KEY
RETELL_LLM_ID_HVAC
RETELL_LLM_ID_PLUMBING
RETELL_MASTER_AGENT_ID
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_ID_*
SERVER_URL
FRONTEND_URL
ADMIN_EMAIL
RESEND_API_KEY
```

### 6.3 Supabase Configuration

**Tables:** 40+ (see Database Schema section)

**Auth:**
- Email/password authentication
- Email verification optional
- JWT tokens with 1-hour expiry

**RLS Policies:**
- User tables: `user_id = auth.uid()`
- Admin tables: `profiles.role = 'admin'`

### 6.4 External Services

| Service | Purpose | Webhook URL |
|---------|---------|-------------|
| Retell AI | Voice/SMS | `{SERVER_URL}/webhooks/retell-inbound` |
| Stripe | Payments | `{SERVER_URL}/stripe-webhook` |
| Cal.com | Booking | `{SERVER_URL}/webhooks/calcom` |

---

## 7. COMPLETE FEATURE LIST

### 7.1 User-Facing Features

#### AI Phone Agent
- **What:** 24/7 automated call answering with personalized greeting
- **How:** Retell AI master agent with dynamic variables
- **Files:** `server.js` (webhooks/retell-inbound)
- **Tables:** agents, profiles, leads
- **Endpoints:** POST /webhooks/retell-inbound

#### Lead Management
- **What:** Full CRM with call transcripts, sentiment, status
- **How:** Leads created from call_ended webhook
- **Files:** `LeadsPage.jsx`, `server.js`
- **Tables:** leads, call_recordings
- **Endpoints:** GET/POST/PUT/DELETE /leads

#### Appointment Booking
- **What:** Calendar with Cal.com integration
- **How:** Cal.com OAuth + webhooks
- **Files:** `CalendarPage.jsx`, `server.js`
- **Tables:** appointments, integrations
- **Endpoints:** /appointments/*, /api/calcom/*

#### SMS Messaging
- **What:** Inbox with threading, quick actions
- **How:** Shared number with tenant routing
- **Files:** `MessagesPage.jsx`, `server.js`
- **Tables:** messages, sms_thread_locks
- **Endpoints:** GET /messages, POST /send-sms

#### Black Box Recordings
- **What:** Call recordings with waveform visualization
- **How:** Retell provides recording URLs
- **Files:** `BlackBoxPage.jsx`, `server.js`
- **Tables:** call_recordings, leads
- **Endpoints:** GET /call-recordings

#### Customer CRM
- **What:** History grouped by phone number
- **How:** Aggregates leads, messages, appointments
- **Files:** `CustomersPage.jsx`, `server.js`
- **Tables:** leads, messages, appointments
- **Endpoints:** GET /api/customers

#### Analytics Dashboard
- **What:** Charts for calls, bookings, trends
- **How:** Aggregates from leads table
- **Files:** `AnalyticsPage.jsx`, `server.js`
- **Tables:** leads
- **Endpoints:** GET /api/analytics

#### Live Tracking
- **What:** GPS tracking with customer link
- **How:** Browser geolocation + Supabase realtime
- **Files:** `TrackingSharePage.jsx`, `TechTrackingPage.jsx`
- **Tables:** tracking_sessions, tracking_points
- **Endpoints:** /tracking/*

#### Referral Program
- **What:** $25 upfront + 10% recurring for 12 months
- **How:** Code tracking, 30-day hold, automated commissions
- **Files:** `ReferralPage.jsx`, `server.js`
- **Tables:** referral_codes, referrals, referral_commissions
- **Endpoints:** /referral/*

#### Zapier Integration
- **What:** Outbound webhooks to external services
- **How:** User configures URL + events
- **Files:** `IntegrationsPage.jsx`, `server.js`
- **Tables:** webhook_configs, webhook_deliveries
- **Endpoints:** /api/webhooks/*

### 7.2 Automation Features

#### Post-Call SMS
- **Price:** $29/month add-on
- **What:** Auto-text customers after every call
- **How:** Triggered in call_ended webhook
- **Tables:** sms_automation_log

#### Review Requests
- **Price:** $19/month add-on
- **What:** Auto-request Google reviews
- **How:** Manual trigger or appointment completion
- **Endpoints:** POST /appointments/:id/request-review

#### Appointment Reminders
- **What:** SMS 24h and 1h before appointments
- **How:** Scheduled job checks every 60s
- **Tables:** appointments (reminder_*_sent flags)

#### ETA Notifications
- **What:** Text customers with technician ETA
- **How:** Tracking session triggers SMS
- **Endpoints:** POST /tracking/eta-update

### 7.3 Admin Features

#### Fleet Registry
- **What:** All users with quick actions
- **Files:** `AdminUsersPage.jsx`
- **Endpoints:** GET /admin/users

#### Quick Onboard
- **What:** Deploy clients without payment
- **Files:** `AdminClientWizardPage.jsx`
- **Endpoints:** POST /admin/quick-onboard

#### Referral Management
- **What:** Approve/reject payouts
- **Files:** `AdminReferralsPage.jsx`
- **Endpoints:** /admin/referrals/*

#### Revenue Telemetry
- **What:** MRR, churn, financials
- **Files:** `AdminFinancialsPage.jsx`
- **Endpoints:** GET /admin/metrics-enhanced

#### Ops Dashboard
- **What:** Errors, alerts, webhooks, reconciliation
- **Files:** `AdminOpsPage.jsx`
- **Endpoints:** /admin/error-logs, /admin/ops-alerts, etc.

### 7.4 Enterprise Features

#### Customer Health Scores
- **What:** A-F grading with risk levels
- **Tables:** customer_health_scores

#### Churn Prevention
- **What:** Proactive alerts for at-risk users
- **Tables:** churn_alerts

#### Session Management
- **What:** View/revoke active sessions
- **Endpoints:** /api/sessions

#### Usage Reconciliation
- **What:** Nightly audit of usage
- **Tables:** reconciliation_runs

---

## 8. BUSINESS LOGIC FLOWS

### 8.1 User Onboarding

```
Landing Page → Login/Signup
        ↓
Step 1: Identity
  - Business name, area code
  - Industry selection
  - Consent acceptance
  - POST /onboarding/identity
        ↓
Step 2: Plan Selection
  - Display PRO/ELITE/SCALE
  - Feature comparison
        ↓
Step 3: Payment
  - POST /create-checkout-session
  - Redirect to Stripe
  - Return to /wizard?checkout=success
        ↓
Step 5: Deploy
  - POST /deploy-agent-self
  - Provision phone number
  - Create agent record
        ↓
Dashboard
  - Show phone number
  - Cal.com CTA
  - Usage stats
```

### 8.2 Inbound Call

```
Caller dials number
        ↓
Retell receives call
        ↓
POST /webhooks/retell-inbound
  1. Persist to webhook_queue
  2. Check idempotency
  3. Look up agent by phone
  4. Load profile settings
  5. Build dynamic_variables
  6. Return call_inbound response
        ↓
Retell connects to master agent
  - Uses dynamic_variables
  - Grace greets with business_name
        ↓
Call ends
        ↓
POST /retell-webhook (call_ended)
  1. Create lead with transcript
  2. Update usage_limits
  3. Store call_event
  4. Trigger post-call SMS (if enabled)
  5. Send outbound webhooks
```

### 8.3 SMS Routing (Shared Number)

```
Inbound SMS to shared number
        ↓
POST /webhooks/sms-inbound
        ↓
Determine routing:
  1. Check sms_thread_locks (active conversation)
  2. Check recent outbound (last 24h)
  3. Check leads table (phone match)
        ↓
Multiple tenants match?
  → Send disambiguation SMS
  → Wait for reply
        ↓
Single tenant match
  → Route to user
  → Store message
        ↓
Process keywords (STOP, HELP, etc.)
  → Send auto-response
  → Update opt-out status
```

### 8.4 Referral Attribution

```
Referrer shares link: /affiliate?ref=CODE
        ↓
New user clicks, code saved to localStorage
        ↓
User signs up
        ↓
POST /referral/record-signup
  - Create referral record
  - Set hold_until (30 days)
        ↓
User pays (Stripe webhook)
  - Mark referral qualified
  - Create upfront commission ($25)
        ↓
Wait 30 days (fraud protection)
        ↓
Referrer can request payout
        ↓
Admin approves/rejects
        ↓
Monthly recurring (10% × 12 months)
```

### 8.5 Usage Enforcement

```
Call or SMS event
        ↓
Update usage_limits
  - call_used_seconds += duration
  - sms_used += 1
        ↓
evaluateUsageThresholds()
        ↓
80% threshold reached?
  → Show SmartUpgradePrompt
  → Create usage_alert (soft)
        ↓
100% threshold reached?
  → Show warning banner
  → Create usage_alert (warning)
        ↓
110% threshold (with credit) reached?
  → Block new calls/SMS
  → hard_stop_active = true
  → Create usage_alert (critical)
```

---

## 9. INTEGRATIONS

### 9.1 Retell AI

**Purpose:** AI voice agent and SMS
**API Key:** `RETELL_API_KEY`

**Endpoints Used:**
```
POST /v1/phone-number          # Provision number
POST /v1/agent                 # Create agent
PATCH /v1/phone-number/:id     # Update webhook URL
POST /v1/send-sms              # Send SMS
POST /v1/demo-call             # Trigger demo
```

**Webhooks Received:**
```
POST /webhooks/retell-inbound  # Inbound call routing
POST /retell-webhook           # Call events
POST /webhooks/sms-inbound     # SMS routing
```

**Dynamic Variables:**
```
business_name, cal_com_url, transfer_number,
industry, tone, travel_radius, service_area,
emergency_enabled, weekend_enabled
```

### 9.2 Stripe

**Purpose:** Subscriptions and payments
**API Key:** `STRIPE_SECRET_KEY`

**Endpoints Used:**
```
POST /v1/checkout/sessions     # Create checkout
POST /v1/billing_portal/sessions # Billing portal
POST /v1/customers             # Create customer
```

**Webhooks Received:**
```
checkout.session.completed
invoice.payment_succeeded
customer.subscription.updated
customer.subscription.deleted
charge.refunded
charge.dispute.created
```

**Price IDs:**
```
STRIPE_PRICE_ID_CORE   = $149/mo
STRIPE_PRICE_ID_PRO    = $249/mo
STRIPE_PRICE_ID_ELITE  = $497/mo
STRIPE_PRICE_ID_SCALE  = $997/mo
STRIPE_TOPUP_CALL_300  = $195
STRIPE_TOPUP_CALL_800  = $520
STRIPE_TOPUP_SMS_500   = $50
STRIPE_TOPUP_SMS_1000  = $100
```

### 9.3 Supabase

**Purpose:** Database, auth, realtime
**URL:** `SUPABASE_URL`
**Keys:** `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`

**Features Used:**
- PostgreSQL database
- Auth (email/password)
- Row Level Security
- Realtime subscriptions

### 9.4 Cal.com

**Purpose:** Appointment booking
**OAuth:** `CALCOM_CLIENT_ID`, `CALCOM_CLIENT_SECRET`

**Endpoints:**
```
GET  /api/calcom/authorize-url
GET  /api/calcom/callback
GET  /api/calcom/status
POST /api/calcom/disconnect
```

**Webhooks:**
```
BOOKING_CREATED
BOOKING_RESCHEDULED
BOOKING_CANCELLED
```

### 9.5 Resend

**Purpose:** Transactional emails
**API Key:** `RESEND_API_KEY`

**Used For:**
- Email verification
- Password reset
- Admin notifications

---

## 10. PRICING & BILLING

### 10.1 Subscription Tiers

| Tier | Monthly | Minutes | SMS | Features |
|------|---------|---------|-----|----------|
| **CORE** | $149 | 150 | 50 | Basic AI receptionist |
| **PRO** | $249 | 500 | 200 | + Recordings, SMS automation |
| **ELITE** | $497 | 1,200 | 500 | + Multi-location, VIP |
| **SCALE** | $997 | 3,000 | 1,000 | Enterprise, white-glove |

### 10.2 Add-On Features

| Feature | Price | Description |
|---------|-------|-------------|
| Post-Call SMS | $29/mo | Auto-text after calls |
| Review Requests | $19/mo | Google review automation |
| Zapier Integration | $49/mo | Webhook to 5000+ apps |

### 10.3 Top-Up Packages

| Package | Price | Value |
|---------|-------|-------|
| +300 Minutes | $195 | $0.65/min |
| +800 Minutes | $520 | $0.65/min |
| +500 SMS | $50 | $0.10/SMS |
| +1,000 SMS | $100 | $0.10/SMS |

### 10.4 Referral Program

| Component | Value |
|-----------|-------|
| Upfront Bonus | $25 |
| Recurring Commission | 10% |
| Commission Duration | 12 months |
| Hold Period | 30 days |
| Minimum Payout | $50 |

### 10.5 Cost Structure

| Provider | Estimated Cost |
|----------|----------------|
| Retell AI | ~$0.10-0.15/min |
| Supabase | $25+/month |
| Vercel | $20+/month |
| Railway | $5-50/month |
| Resend | $20+/month |

### 10.6 Gross Margin Analysis

For PRO tier at $249/month with 500 minutes used:
- Revenue: $249
- Retell cost (~$0.12/min): ~$60
- Infrastructure: ~$15
- **Gross Margin: ~70%**

---

## SUMMARY

Kryonex Wizard is a fully-featured, production-ready SaaS platform with:

- **130+ API endpoints** covering all business operations
- **40+ database tables** with comprehensive data modeling
- **36 frontend pages** for user and admin experiences
- **Enterprise-grade ops** including error tracking, reconciliation, health scoring
- **4 subscription tiers** from $149 to $997/month
- **3 add-on features** generating additional MRR
- **Built-in referral program** for growth

The platform is designed for scale with:
- Rate limiting on all endpoints
- Webhook queue with replay capability
- Nightly reconciliation
- Centralized error tracking
- Customer health monitoring

**Ready for launch and monetization.**
