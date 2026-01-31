# Kryonex Wizard

Kryonex Wizard is a full-stack SaaS platform for deploying and managing AI call agents for HVAC, Plumbing, and service businesses. Features include automated booking, lead tracking, SMS automation, referral programs, and enterprise integrations.

## Architecture

```
kryonex-wizard/
├── frontend/           # Vite + React UI (user + admin portals)
├── server.js           # Express API (Retell, Stripe, SMS, webhooks)
├── supabase/           # Database schemas, migrations, RLS policies
├── cypress/            # E2E tests (smoke + wizard matrix)
├── scripts/            # Utility scripts (API checks, test users)
└── docs/               # Feature docs, workflows, handoffs
```

## Features Overview

### Core Features
- **AI Call Agent** - 24/7 automated call handling via Retell AI
- **Appointment Booking** - Cal.com integration for real-time scheduling
- **Lead Management** - CRM with call history, transcripts, sentiment analysis
- **Live Tracking** - Real-time technician tracking with ETA notifications
- **Black Box Recordings** - Call recordings with AI summaries

### Revenue Features (Money Printers)
| Feature | Description | Price |
|---------|-------------|-------|
| **Referral Program** | Users earn $25 upfront + 10% recurring for 12 months | Free |
| **Post-Call SMS** | Auto-text customers after every call | $29/mo |
| **Review Requests** | Auto-request Google reviews after appointments | $19/mo |
| **Zapier Integration** | Send data to 5000+ apps via webhooks | $49/mo |

### Retention Features
- **Upsell Automation** - Smart upgrade prompts at 80% usage
- **Customer CRM** - Full customer history grouped by phone
- **Appointment Reminders** - Auto SMS 24h/1h before appointments
- **ETA Notifications** - Text customers when technician is nearby

## Quick Start

### 1. Install Dependencies
```bash
npm install
cd frontend && npm install
```

### 2. Configure Environment
```bash
# Root .env (copy from env.template)
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
RETELL_API_KEY=...
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
RESEND_API_KEY=...
SERVER_URL=https://your-backend.com

# frontend/.env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_API_URL=http://localhost:3000
```

### 3. Setup Database
Run these SQL files in Supabase SQL Editor (in order):
1. `supabase/command_suite.sql` - Core tables
2. `supabase/ops_infrastructure.sql` - Ops tables
3. `supabase/referral_system.sql` - Referral program
4. `supabase/sms_automation.sql` - SMS automation + webhooks

### 4. Start Development
```bash
# Terminal 1: Backend
npm start

# Terminal 2: Frontend
cd frontend && npm run dev
```

## Key Pages

### User Portal
| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/dashboard` | KPIs, activity feed, live clock |
| Leads | `/leads` | Lead management with filters |
| Customers | `/customers` | CRM with customer history |
| Calendar | `/calendar` | Appointments with color coding |
| Messages | `/messages` | SMS inbox with quick actions |
| Black Box | `/black-box` | Call recordings + transcripts |
| Analytics | `/analytics` | Charts and performance metrics |
| Referrals | `/referrals` | Referral program dashboard |
| Integrations | `/integrations` | Webhook/Zapier configuration |
| Settings | `/settings` | Business settings, SMS templates |

### Admin Portal
| Page | Route | Description |
|------|-------|-------------|
| Admin Dashboard | `/admin/dashboard` | Platform-wide metrics |
| Fleet Registry | `/admin/users` | All users + quick actions |
| Client Wizard | `/admin/wizard/create` | Deploy new clients |
| Referral Control | `/admin/referrals` | Manage referral payouts |
| Revenue Telemetry | `/admin/financials` | MRR, churn, revenue |
| Sales Floor | `/admin/logs` | Activity logs |

## API Endpoints

### Referral System
```
GET  /referral/my-code      - Get user's referral code
GET  /referral/stats        - Referral earnings summary
GET  /referral/history      - Detailed referral history
POST /referral/request-payout - Request payout (min $50)
```

### Customer CRM
```
GET /api/customers          - List customers grouped by phone
GET /api/customers/:phone/history - Full customer timeline
```

### Webhooks (Zapier)
```
GET    /api/webhooks        - List user's webhooks
POST   /api/webhooks        - Create new webhook
PUT    /api/webhooks/:id    - Update webhook
DELETE /api/webhooks/:id    - Delete webhook
POST   /api/webhooks/:id/test - Test webhook delivery
```

### SMS Automation
```
POST /appointments/:id/request-review - Send review request
# Post-call SMS is automatic when enabled in settings
```

## Webhook Events

Available events for Zapier/webhook integrations:
- `call_ended` - When a call completes
- `call_started` - When a call begins
- `appointment_booked` - New appointment created
- `appointment_updated` - Appointment modified
- `lead_created` - New lead from call
- `sms_received` - Inbound text message

## Billing Tiers

| Tier | Price | Minutes | Features |
|------|-------|---------|----------|
| CORE | $149/mo | 150 | Basic AI receptionist |
| PRO | $249/mo | 500 | + Call recordings, SMS |
| ELITE | $497/mo | 1200 | + Multi-location, VIP support |
| SCALE | $997/mo | 3000 | Enterprise, white-glove |

Top-ups available:
- +300 Minutes - $99
- +800 Minutes - $265
- +500 SMS - $40
- +1000 SMS - $80

## Testing

```bash
# Run E2E tests
npm run test:e2e

# API health check
npm run test:api

# Create test user
npm run seed:test-user
```

## Documentation

- `docs/HANDOFF.md` - Full handoff for new developers
- `docs/ADMIN_WORKFLOW.md` - Admin onboarding flows
- `docs/OPS_CHECKLIST.md` - Ops infrastructure status
- `docs/IMPLEMENTATION_AND_AUDIT.md` - Feature audit trail

## Security Notes

- Never commit `.env` files (gitignored)
- Retell/Stripe webhooks require public `SERVER_URL`
- RLS policies enforce user data isolation
- HMAC signatures available for webhook security
- 30-day hold period prevents referral fraud

## Support

For issues or feature requests, contact support or check the docs folder.
