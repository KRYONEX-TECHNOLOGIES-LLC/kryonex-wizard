# Docs

Feature and workflow documentation for Kryonex Wizard.

## Contents

| Doc | Description |
|-----|-------------|
| **[HANDOFF.md](./HANDOFF.md)** | **Start here** — Full handoff for new devs/AI: app overview, recent work, flows, debugging, next steps. |
| [ADMIN_WORKFLOW.md](./ADMIN_WORKFLOW.md) | Admin menu security, admin user-dashboard access, mini Admin Quick Onboarding, and Fleet Registry. |
| [IMPLEMENTATION_AND_AUDIT.md](./IMPLEMENTATION_AND_AUDIT.md) | Feature implementation audit trail and system architecture details. |
| [OPS_CHECKLIST.md](./OPS_CHECKLIST.md) | Ops infrastructure implementation status, testing checklist, and future enhancements. |
| [AGENT_PROMPT_GRACE.md](./AGENT_PROMPT_GRACE.md) | Grace AI agent prompt with dynamic variables context section. |

## Feature Overview

### Revenue Features (Money Printers)

| Feature | Status | Description |
|---------|--------|-------------|
| **Referral Program** | Complete | $25 upfront + 10% recurring for 12 months. Anti-fraud with 30-day hold. |
| **Upsell Automation** | Complete | Smart modal prompts at 80%+ usage with one-click upgrades. |
| **Post-Call SMS** | Complete | Auto-text customers after every call ($29/mo add-on). |
| **Review Requests** | Complete | Auto-request Google reviews after completed appointments ($19/mo). |
| **Zapier Integration** | Complete | Outbound webhooks to 5000+ apps ($49/mo add-on). |

### Retention Features

| Feature | Status | Description |
|---------|--------|-------------|
| **Customer CRM** | Complete | Full customer history grouped by phone number. |
| **Appointment Reminders** | Complete | Auto SMS 24h/1h before appointments. |
| **ETA Notifications** | Complete | Text customers when technician is X minutes away. |
| **Analytics Dashboard** | Complete | Charts for calls, booking rates, peak hours. |

### Core Platform

| Feature | Status | Description |
|---------|--------|-------------|
| **AI Call Agent** | Complete | 24/7 automated call handling via Retell AI. |
| **Lead Management** | Complete | CRM with transcripts, sentiment, AI summaries. |
| **Calendar Booking** | Complete | Cal.com integration with color-coded appointments. |
| **Black Box** | Complete | Call recordings with waveform visualization. |
| **Live Tracking** | Complete | Real-time technician tracking maps. |
| **Billing/Stripe** | Complete | Subscription tiers, top-ups, usage tracking. |

## Database Migrations

Run these in Supabase SQL Editor (in order):

1. `supabase/command_suite.sql` - Core tables (profiles, leads, agents, etc.)
2. `supabase/ops_infrastructure.sql` - Ops tables (webhooks, events, alerts)
3. `supabase/referral_system.sql` - Referral program tables
4. `supabase/sms_automation.sql` - SMS automation + webhook configs

## API Endpoints

### User Endpoints
```
# Dashboard
GET /api/dashboard/stats-enhanced

# Referrals
GET  /referral/my-code
GET  /referral/stats
GET  /referral/history
POST /referral/request-payout

# Customers
GET /api/customers
GET /api/customers/:phone/history

# Webhooks
GET    /api/webhooks
POST   /api/webhooks
PUT    /api/webhooks/:id
DELETE /api/webhooks/:id
POST   /api/webhooks/:id/test

# Settings (includes SMS automation)
GET /api/settings
PUT /api/settings
```

### Admin Endpoints
```
GET  /admin/metrics-enhanced
GET  /admin/referrals
POST /admin/referrals/:id/approve
POST /admin/referrals/:id/reject
GET  /admin/referral-settings
PUT  /admin/referral-settings
```

## Related

- Root [README.md](../README.md) — Architecture, quick start, key flows.
- [frontend/README.md](../frontend/README.md) — Routes, wizard flow, admin UI.
- [server/README.md](../server/README.md) — Auth, endpoints, webhooks.
- [supabase/README.md](../supabase/README.md) — Schema, migrations, ops tables.
