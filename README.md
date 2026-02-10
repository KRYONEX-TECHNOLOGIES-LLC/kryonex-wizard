# Kryonex Wizard

**Enterprise-grade AI receptionist platform for HVAC, Plumbing, and field-service businesses.**

Kryonex Wizard is a full-stack SaaS platform that deploys and manages 24/7 AI phone agents powered by Retell AI. Features include automated booking, lead management, SMS automation, real-time tracking, comprehensive analytics, referral programs, and enterprise integrations.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Features](#features)
3. [Quick Start](#quick-start)
4. [Environment Variables](#environment-variables)
5. [Database Setup](#database-setup)
6. [User Portal Pages](#user-portal-pages)
7. [Admin Portal Pages](#admin-portal-pages)
8. [API Reference](#api-reference)
9. [Billing & Pricing](#billing--pricing)
10. [Testing](#testing)
11. [Deployment](#deployment)
12. [Security](#security)
13. [Documentation Index](#documentation-index)

---

## Architecture

```
kryonex-wizard/
├── frontend/           # Vite + React UI (user + admin portals)
│   ├── src/
│   │   ├── pages/      # All page components (Dashboard, Wizard, Admin, etc.)
│   │   ├── components/ # Reusable UI components
│   │   └── lib/        # API client, utilities, constants
│   └── package.json
├── server.js           # Express API (15,800+ lines - all backend logic)
├── supabase/           # SQL migrations and schema files
├── cypress/            # E2E tests (smoke, critical, wizard-matrix)
├── scripts/            # Utility scripts (API checks, test users, simulations)
└── docs/               # Comprehensive documentation
```

### Tech Stack

| Layer | Technology | Description |
|-------|------------|-------------|
| Frontend | Vite + React 18 | Modern SPA with Lucide icons, responsive design |
| Backend | Express.js (Node 20+) | Single-file API with comprehensive middleware |
| Database | Supabase (PostgreSQL) | Auth, RLS policies, real-time subscriptions |
| AI Calls | Retell AI | Voice agents with dynamic variables |
| Payments | Stripe | Subscriptions, top-ups, webhooks |
| Calendar | Cal.com | Appointment booking integration |
| Email | Resend | Transactional emails |
| Hosting | Vercel (frontend) + Railway (backend) | Auto-deploy from GitHub |

### System Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FRONTEND (Vite + React)                                                     │
│  Landing → Login → Wizard → Dashboard → Leads/Calendar/Messages/Analytics   │
│  Admin: Dashboard → Users → Wizard → Referrals → Financials → Ops           │
└─────────────────────────────────────────┬───────────────────────────────────┘
                                          │ API calls
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  SERVER (Express - server.js)                                                │
│  Auth middleware → Rate limiting → Request validation → Business logic       │
│  Webhooks: Retell (calls/SMS), Stripe (billing), Cal.com (bookings)         │
└─────────────────────────────────────────┬───────────────────────────────────┘
                                          │
              ┌───────────────────────────┼───────────────────────────┐
              ▼                           ▼                           ▼
        SUPABASE                     RETELL AI                    STRIPE
        (PostgreSQL)                 (Voice/SMS)                  (Billing)
        - Auth                       - Inbound calls              - Subscriptions
        - 40+ tables                 - Outbound SMS               - Top-ups
        - RLS policies               - Call recordings            - Webhooks
```

---

## Features

### Core Platform

| Feature | Description |
|---------|-------------|
| **AI Call Agent (Grace)** | 24/7 automated call handling with dynamic greeting using business name |
| **Multi-step Wizard** | Business onboarding: Identity → Plan → Payment → Deploy |
| **Lead Management** | Full CRM with transcripts, sentiment analysis, AI summaries |
| **Calendar Booking** | Cal.com integration with color-coded appointments |
| **Black Box Recordings** | Call recordings with waveform visualization and flagging |
| **Real-time Tracking** | Live technician tracking with ETA notifications |
| **SMS Messaging** | Shared SMS number with intelligent per-tenant routing |

### Revenue Features

| Feature | Price | Description |
|---------|-------|-------------|
| **Referral Program** | Free | $25 upfront + 10% recurring for 12 months. 30-day fraud protection. |
| **Post-Call SMS** | $29/mo | Auto-text customers after every call with customizable template |
| **Review Requests** | $19/mo | Auto-request Google reviews after completed appointments |
| **Zapier Integration** | $49/mo | Outbound webhooks to 5000+ apps (call_ended, lead_created, etc.) |

### Retention & Analytics

| Feature | Description |
|---------|-------------|
| **ROI Dashboard** | Revenue tracking, booking rates, call-to-appointment conversion |
| **Customer Health Scores** | A-F grading based on usage, engagement, billing status |
| **Churn Prevention** | Proactive alerts when users show decline patterns |
| **Smart Upgrade Prompts** | Usage-based upsell modals at optimal moments |
| **Analytics Dashboard** | Charts for calls, booking rates, peak hours, trends |

### Enterprise Operations

| Feature | Description |
|---------|-------------|
| **Ops Dashboard** | Error logs, alerts, churn risk, health overview |
| **Webhook Queue** | View/replay failed webhooks with full audit trail |
| **Usage Reconciliation** | Nightly job comparing aggregates vs actual usage |
| **Session Management** | Active session tracking with revocation capability |
| **Audit Trails** | Comprehensive logging of all admin and system actions |

---

## SMS & Appointment Notifications

### Universal SMS Number System

The platform uses a **shared SMS number** (`MASTER_SMS_NUMBER`) for all tenants. Messages are automatically prefixed with `[Business Name]` so recipients know which business sent the message.

**Important:** Until your universal SMS number is fully activated, set `SMS_SENDING_ENABLED=false` in Railway. This ensures:
- ✅ SMS attempts are logged (system is ready)
- ✅ **NO messages are actually sent**
- ✅ **NO usage is counted** toward user accounts
- ✅ When you flip the switch, everything starts working immediately

**To activate SMS when ready:**
1. Ensure `MASTER_SMS_NUMBER` is set in Railway
2. Set `SMS_SENDING_ENABLED=true` in Railway
3. Redeploy (or wait for auto-deploy)
4. SMS will now send and count usage

### Appointment Booking Notifications

When appointments are booked (via AI calls, Cal.com, or manual entry):

**1. Customer SMS Confirmation** (if enabled)
- Sent automatically to customer's phone
- Includes: business name, date, time, location
- Controlled by `agents.confirmation_sms_enabled` (default: true)

**2. Business Owner SMS Notification**
- Sent to owner's phone number (`profiles.phone`)
- Format: `NEW BOOKING: [Customer] for [Date] at [Time] - [Service Type] at [Location]. Customer: [Phone]`
- Controlled by `profiles.appointment_sms_enabled` (default: true)

**3. Business Owner Email Alert**
- Beautiful HTML email with full appointment details
- Includes deep-link button that opens directly to the appointment in calendar
- Shows: customer info, time, location, service type, booking source, notes

### Enhanced Calendar Display

Appointment cards now show:
- Customer name, phone, email
- Service address/location
- Issue type (NO_HEAT, NO_AC, LEAK, etc.)
- Duration in minutes
- Job value (if set)
- Booking source (AI Booked, Manual, Cal.com, etc.)
- Direct link to Cal.com booking (if applicable)

---

## Quick Start

### Prerequisites

- Node.js 20+
- npm 9+
- Supabase account (free tier works)
- Stripe account
- Retell AI account
- Cal.com account (optional)

### 1. Clone and Install

```bash
git clone <repo-url>
cd kryonex-wizard

# Install backend dependencies
npm install

# Install frontend dependencies
cd frontend && npm install
```

### 2. Configure Environment

```bash
# Copy template and fill in values
cp env.template .env

# Create frontend env
cp frontend/.env.example frontend/.env
```

See [Environment Variables](#environment-variables) section for all required values.

### 3. Setup Database

Run these SQL files in Supabase SQL Editor **in order**:

1. `supabase/command_suite.sql` - Core tables (profiles, leads, agents, etc.)
2. `supabase/ops_infrastructure.sql` - Ops tables (webhooks, events, alerts)
3. `supabase/god_tier_hardening.sql` - Health scores, error tracking, sessions
4. `supabase/fix_agents_constraints.sql` - Agent constraints (required)
5. `supabase/referral_system.sql` - Referral program
6. `supabase/sms_automation.sql` - SMS automation
7. `supabase/appointments_enhancement.sql` - Enhanced appointment fields (issue_type, source, duration_minutes, owner notifications)

### 4. Start Development

```bash
# Terminal 1: Backend (port 3000)
npm start

# Terminal 2: Frontend (port 5173)
cd frontend && npm run dev
```

### 5. Access the App

- Frontend: http://localhost:5173
- Backend: http://localhost:3000

---

## Environment Variables

### Backend (.env)

```bash
# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Retell AI
RETELL_API_KEY=key_...
RETELL_LLM_ID_HVAC=llm_...
RETELL_LLM_ID_PLUMBING=llm_...
RETELL_MASTER_AGENT_ID=agent_...
RETELL_PHONE_NUMBER=+1...

# SMS (Universal Number System)
MASTER_SMS_NUMBER=+1...              # Shared SMS number for all tenants
SMS_SENDING_ENABLED=false            # Set to "true" when number is fully active
                                     # When false: SMS attempts logged but NOT sent or counted

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_CORE=price_...
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_ELITE=price_...
STRIPE_PRICE_SCALE=price_...

# URLs (must be public for webhooks)
SERVER_URL=https://your-backend.railway.app
FRONTEND_URL=https://your-frontend.vercel.app
APP_URL=https://your-frontend.vercel.app

# Email
RESEND_API_KEY=re_...

# Admin
ADMIN_EMAIL=admin@example.com,admin2@example.com

# Optional
RETELL_AUTO_SYNC_MINUTES=60
PORT=3000
```

### Frontend (frontend/.env)

```bash
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_API_URL=http://localhost:3000
VITE_ADMIN_EMAIL=admin@example.com
```

---

## Database Setup

### Core Tables

| Table | Purpose |
|-------|---------|
| `profiles` | User metadata, business info, settings |
| `agents` | Retell agent config, phone numbers |
| `leads` | Lead/customer records with transcripts |
| `messages` | SMS conversation history |
| `appointments` | Calendar bookings |
| `subscriptions` | Stripe subscription state |
| `usage_limits` | Minutes/SMS caps per user |
| `usage_calls` | Individual call records |
| `usage_sms` | Individual SMS records |

### Operations Tables

| Table | Purpose |
|-------|---------|
| `webhook_queue` | Raw webhook storage for replay/audit |
| `error_logs` | Application error tracking |
| `ops_alerts` | Operational alerts (usage, failures) |
| `customer_health_scores` | User health grading |
| `churn_alerts` | Churn risk notifications |
| `active_sessions` | Session management |
| `reconciliation_runs` | Usage reconciliation history |

See `supabase/README.md` for complete schema documentation.

---

## User Portal Pages

| Page | Route | Description |
|------|-------|-------------|
| **Dashboard** | `/dashboard` | KPIs, activity feed, ROI metrics, live clock |
| **Leads** | `/leads` | Lead management with filters, export |
| **Customers** | `/customers` | CRM with full customer history by phone |
| **Calendar** | `/calendar` | Appointments with color coding by status |
| **Messages** | `/messages` | SMS inbox with quick actions, threading |
| **Black Box** | `/black-box` | Call recordings, transcripts, AI summaries |
| **Analytics** | `/analytics` | Charts, trends, performance metrics |
| **Referrals** | `/referrals` | Referral dashboard, earnings, payouts |
| **Integrations** | `/integrations` | Webhook/Zapier configuration |
| **Settings** | `/settings` | Business settings, SMS templates, hours |
| **Billing** | `/billing` | Subscription management, top-ups |

---

## Admin Portal Pages

| Page | Route | Description |
|------|-------|-------------|
| **Dashboard** | `/admin/dashboard` | Platform metrics, quick actions |
| **Fleet Registry** | `/admin/users` | All users, quick deploy, impersonation |
| **Client Wizard** | `/admin/wizard/create` | Deploy new clients manually |
| **Leads Hub** | `/admin/leads` | All leads across platform |
| **Messages** | `/admin/messages` | All SMS conversations |
| **Call Center** | `/admin/call-center` | Real-time call monitoring |
| **Black Box** | `/admin/black-box` | All call recordings |
| **Referrals** | `/admin/referrals` | Approve/reject payouts |
| **Financials** | `/admin/financials` | MRR, churn, revenue analytics |
| **Ops Dashboard** | `/admin/ops` | Errors, alerts, webhooks, reconciliation |
| **Activity Logs** | `/admin/logs` | System activity feed |

---

## API Reference

### Authentication

All API endpoints (except webhooks) require Bearer token:

```
Authorization: Bearer <supabase_access_token>
```

### User Endpoints

```
# Dashboard
GET /api/dashboard/stats-enhanced

# Leads
GET /api/leads
POST /api/leads
PUT /api/leads/:id
DELETE /api/leads/:id

# Appointments
GET /api/appointments
POST /api/appointments
PUT /api/appointments/:id
DELETE /api/appointments/:id

# Messages
GET /api/messages
POST /send-sms

# Usage
GET /usage/status

# Settings
GET /api/settings
PUT /api/settings

# Referrals
GET /referral/my-code
GET /referral/stats
GET /referral/history
POST /referral/request-payout

# Webhooks (Zapier)
GET /api/webhooks
POST /api/webhooks
PUT /api/webhooks/:id
DELETE /api/webhooks/:id
POST /api/webhooks/:id/test
```

### Admin Endpoints

```
# Dashboard
GET /admin/metrics-enhanced

# Users
GET /admin/users
POST /admin/quick-onboard
PUT /admin/users/:id

# Referrals
GET /admin/referrals
POST /admin/referrals/:id/approve
POST /admin/referrals/:id/reject

# Ops
GET /admin/error-logs
POST /admin/error-logs/:id/resolve
GET /admin/ops-alerts
POST /admin/ops-alerts/:id/acknowledge
GET /admin/health-scores
GET /admin/churn-alerts

# Webhook Queue
GET /admin/webhook-queue
POST /admin/webhook-queue/:id/replay

# Reconciliation
GET /admin/reconciliation-runs
POST /admin/reconciliation-runs/trigger
```

### Webhook Endpoints

```
POST /webhooks/retell-inbound    # Retell inbound calls
POST /retell-webhook             # Retell call events
POST /webhooks/sms-inbound       # Retell inbound SMS
POST /stripe-webhook             # Stripe events
POST /webhooks/calcom            # Cal.com bookings
```

---

## Billing & Pricing

### Subscription Tiers

| Tier | Monthly | Minutes | SMS | Features |
|------|---------|---------|-----|----------|
| **CORE** | $149 | 150 | 50 | Basic AI receptionist |
| **PRO** | $249 | 500 | 200 | + Call recordings, SMS automation |
| **ELITE** | $497 | 1,200 | 500 | + Multi-location, priority support |
| **SCALE** | $997 | 3,000 | 1,000 | Enterprise, white-glove onboarding |

### Top-Up Packages

| Package | Price |
|---------|-------|
| +300 Minutes | $99 |
| +800 Minutes | $265 |
| +500 SMS | $40 |
| +1,000 SMS | $80 |

### Usage Enforcement

- **80% threshold**: Smart upgrade prompt shown
- **100% threshold**: Soft warning, usage continues
- **110% threshold (with credit)**: Hard stop, calls/SMS blocked

---

## Testing

### E2E Tests (Cypress)

```bash
# Set environment variables
$env:CYPRESS_TEST_EMAIL="test@example.com"
$env:CYPRESS_TEST_PASSWORD="password123"

# Run tests
npm run test:e2e
```

Test specs:
- `cypress/e2e/smoke.spec.js` - Core functionality
- `cypress/e2e/critical.spec.js` - Critical paths
- `cypress/e2e/wizard-matrix.spec.js` - Wizard combinations

### API Health Check

```bash
npm run test:api
```

### Create Test User

```bash
npm run seed:test-user
```

### Simulate Webhook

```powershell
$env:WEBHOOK_URL="https://your-backend/webhooks/retell-inbound"
$env:TO_NUMBER="+14155551234"
node scripts/simulate_retell.js
```

---

## Deployment

### Frontend (Vercel)

1. Connect GitHub repo to Vercel
2. Set build command: `cd frontend && npm run build`
3. Set output directory: `frontend/dist`
4. Add environment variables from `frontend/.env`

### Backend (Railway)

1. Connect GitHub repo to Railway
2. Set start command: `node server.js`
3. Add environment variables from `.env`
4. Note the public URL for webhook configuration

### Post-Deploy Checklist

1. Run all SQL migrations in Supabase
2. Configure Stripe webhooks to `{SERVER_URL}/stripe-webhook`
3. Configure Retell phone numbers with `{SERVER_URL}/webhooks/retell-inbound`
4. Test full wizard flow: signup → payment → deploy → call
5. Verify admin access at `/admin/dashboard`

---

## Security

### Authentication
- Supabase Auth with JWT tokens
- Session tracking with revocation capability
- Admin role verification on all admin endpoints

### Data Protection
- Row Level Security (RLS) on all tables
- Service role key never exposed to frontend
- User data isolation enforced at database level

### API Security
- Rate limiting on all endpoints
- Request validation with Joi schemas
- HMAC signature verification for webhooks

### Sensitive Data
- Never commit `.env` files (gitignored)
- Stripe webhook secrets validated
- 30-day hold on referral payouts (fraud prevention)

---

## Documentation Index

| Document | Description |
|----------|-------------|
| **[TECHNICAL_SUMMARY.md](TECHNICAL_SUMMARY.md)** | Complete technical specs (130+ endpoints, 40+ tables, all features) |
| **[docs/HANDOFF.md](docs/HANDOFF.md)** | Complete handoff for new developers |
| [docs/ADMIN_WORKFLOW.md](docs/ADMIN_WORKFLOW.md) | Admin portal workflows |
| [docs/OPS_CHECKLIST.md](docs/OPS_CHECKLIST.md) | Operations infrastructure status |
| [docs/IMPLEMENTATION_AND_AUDIT.md](docs/IMPLEMENTATION_AND_AUDIT.md) | Feature audit trail |
| [docs/AGENT_PROMPT_GRACE.md](docs/AGENT_PROMPT_GRACE.md) | AI agent prompt configuration |
| [docs/VARIABLES_AND_PROMPTS.md](docs/VARIABLES_AND_PROMPTS.md) | Dynamic variables reference |
| [frontend/README.md](frontend/README.md) | Frontend architecture |
| [server/README.md](server/README.md) | Backend API reference |
| [supabase/README.md](supabase/README.md) | Database schema |
| [scripts/README.md](scripts/README.md) | Utility scripts |
| [cypress/README.md](cypress/README.md) | E2E testing guide |

---

## Recent Updates & Improvements

### Appointment Booking Enhancements (Feb 2026)

**Enhanced Calendar Display:**
- Appointment cards now show full details: customer email, issue type, service address, booking source
- Direct links to Cal.com bookings when applicable
- Color-coded status indicators

**Automated Notifications:**
- **Customer SMS confirmations** sent automatically when appointments are booked
- **Owner SMS notifications** alert business owners of new bookings
- **Owner email alerts** with beautiful HTML formatting and deep-links to calendar

**Database Enhancements:**
- Added `issue_type` field to track service type (NO_HEAT, NO_AC, LEAK, etc.)
- Added `source` field to track booking origin (retell_calcom, manual, etc.)
- Added `duration_minutes` for accurate appointment duration tracking
- Added `customer_email` for complete customer records
- Added `appointment_sms_enabled` and `phone` to profiles for owner notifications

### SMS System Improvements

**Universal Number Architecture:**
- All SMS sent from shared `MASTER_SMS_NUMBER`
- Automatic business name prefixing: `[Business Name] message text`
- Per-tenant usage tracking and opt-out compliance
- Intelligent conversation routing via thread locks

**SMS Gate System:**
- `SMS_SENDING_ENABLED` environment variable controls SMS sending
- When `false`: SMS attempts logged but NOT sent or counted (perfect for pre-launch)
- When `true`: Full SMS functionality active, usage counted
- Allows system to be production-ready before number activation

**Notification Types:**
- Booking confirmations (to customers)
- Appointment notifications (to owners)
- Post-call SMS (automated follow-ups)
- Review requests (after completed appointments)

### Cal.com Integration Fixes

**Booking Reliability:**
- Fixed `eventTypeId` type validation (must be integer)
- Removed `lengthInMinutes` for fixed-duration event types
- Enhanced metadata handling (no null values, length limits)
- Improved error handling with detailed Cal.com API error logging

**Webhook Processing:**
- Fixed `call_ended` webhook 500 errors
- Improved duplicate detection
- Better error recovery and logging

---

## Support & Maintenance

### Common Issues

1. **"Agent not found for number"**: Phone number not in E.164 format or not in `agents` table
2. **Webhook failures**: Check `webhook_queue` table and Ops Dashboard
3. **Usage not tracking**: Verify `usage_limits` record exists for user
4. **SMS not sending**: Check SMS cap and `sms_credit` balance

### Monitoring

- **Ops Dashboard** (`/admin/ops`): Real-time error and alert monitoring
- **Reconciliation**: Runs nightly at 3 AM UTC, flags discrepancies
- **Health Scores**: Updated on each significant user action

### Getting Help

1. Check relevant documentation in `docs/` folder
2. Review error logs in Ops Dashboard
3. Check Supabase logs for database errors
4. Review Railway/Vercel logs for deployment issues

---

**Built with precision for billion-dollar scale.**
