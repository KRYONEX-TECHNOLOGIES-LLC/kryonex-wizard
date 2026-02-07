# Documentation Index

Comprehensive documentation for the Kryonex Wizard platform. Start with the HANDOFF.md for a complete overview.

---

## Quick Start

| If you want to... | Read this |
|-------------------|-----------|
| Understand the entire system | [HANDOFF.md](./HANDOFF.md) |
| Get complete technical specs | [../TECHNICAL_SUMMARY.md](../TECHNICAL_SUMMARY.md) |
| Get a quick reference card | [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) |
| Set up the project | [../README.md](../README.md) |
| Understand admin workflows | [ADMIN_WORKFLOW.md](./ADMIN_WORKFLOW.md) |
| Check ops infrastructure | [OPS_CHECKLIST.md](./OPS_CHECKLIST.md) |
| Configure the AI agent | [AGENT_PROMPT_GRACE.md](./AGENT_PROMPT_GRACE.md) |

---

## Document Map

### Core Documentation

| Document | Description |
|----------|-------------|
| **[HANDOFF.md](./HANDOFF.md)** | **START HERE** - Complete handoff for new developers, buyers, or AI assistants |
| [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) | One-page reference card for common tasks |
| [../README.md](../README.md) | Architecture, quick start, features, API reference |
| [IMPLEMENTATION_AND_AUDIT.md](./IMPLEMENTATION_AND_AUDIT.md) | Feature implementation audit trail |

### Operations

| Document | Description |
|----------|-------------|
| [OPS_CHECKLIST.md](./OPS_CHECKLIST.md) | Operations infrastructure status and testing checklist |
| [ADMIN_WORKFLOW.md](./ADMIN_WORKFLOW.md) | Admin portal security, quick onboard, Fleet Registry |

### Technical Reference

| Document | Description |
|----------|-------------|
| [AGENT_PROMPT_GRACE.md](./AGENT_PROMPT_GRACE.md) | Grace AI agent prompt with dynamic variables |
| [VARIABLES_AND_PROMPTS.md](./VARIABLES_AND_PROMPTS.md) | All dynamic variables reference |
| [RETELL_DYNAMIC_VARS_DEBUG_PROMPT.md](./RETELL_DYNAMIC_VARS_DEBUG_PROMPT.md) | Debugging dynamic variables |
| [RETELL_RAILWAY_REFERENCE.md](./RETELL_RAILWAY_REFERENCE.md) | Retell + Railway integration notes |

### Deployment & Troubleshooting

| Document | Description |
|----------|-------------|
| [DEPLOY_DEBUG.md](./DEPLOY_DEBUG.md) | Deployment debugging guide |
| [DEPLOY_404_TROUBLESHOOTING.md](./DEPLOY_404_TROUBLESHOOTING.md) | 404 error troubleshooting |
| [SUPABASE_AUTH_PRODUCTION.md](./SUPABASE_AUTH_PRODUCTION.md) | Supabase auth production setup |
| [EMAIL_VERIFICATION_SETUP.md](./EMAIL_VERIFICATION_SETUP.md) | Email verification configuration |

### Component READMEs

| Document | Description |
|----------|-------------|
| [../frontend/README.md](../frontend/README.md) | Frontend architecture, pages, components |
| [../server/README.md](../server/README.md) | Backend API endpoints, webhooks, ops |
| [../supabase/README.md](../supabase/README.md) | Database schema, migrations, RLS |
| [../scripts/README.md](../scripts/README.md) | Utility scripts documentation |
| [../cypress/README.md](../cypress/README.md) | E2E testing guide |

---

## Feature Status

### Core Platform ✅

| Feature | Status |
|---------|--------|
| User Onboarding Wizard | Complete |
| AI Call Agent (Grace) | Complete |
| Lead Management | Complete |
| Calendar/Appointments | Complete |
| SMS Messaging | Complete |
| Black Box Recordings | Complete |
| Real-time Tracking | Complete |
| Customer CRM | Complete |

### Revenue Features ✅

| Feature | Price | Status |
|---------|-------|--------|
| Referral Program | Free | Complete |
| Post-Call SMS | $29/mo | Complete |
| Review Requests | $19/mo | Complete |
| Zapier Integration | $49/mo | Complete |

### Retention Features ✅

| Feature | Status |
|---------|--------|
| ROI Dashboard | Complete |
| Smart Upgrade Prompts | Complete |
| Customer Health Scores | Complete |
| Churn Prevention Alerts | Complete |
| Analytics Dashboard | Complete |

### Enterprise Operations ✅

| Feature | Status |
|---------|--------|
| Ops Dashboard | Complete |
| Error Tracking | Complete |
| Webhook Queue + Replay | Complete |
| Usage Reconciliation | Complete |
| Session Management | Complete |

---

## API Quick Reference

### User Endpoints

```
GET  /api/dashboard/stats-enhanced
GET  /api/leads
GET  /api/customers
GET  /api/appointments
GET  /api/messages
GET  /api/webhooks
GET  /api/settings
GET  /referral/my-code
GET  /usage/status
```

### Admin Endpoints

```
GET  /admin/users
GET  /admin/metrics-enhanced
GET  /admin/referrals
GET  /admin/error-logs
GET  /admin/ops-alerts
GET  /admin/webhook-queue
GET  /admin/reconciliation-runs
POST /admin/quick-onboard
```

### Webhooks

```
POST /webhooks/retell-inbound   (Retell calls)
POST /retell-webhook            (Retell events)
POST /webhooks/sms-inbound      (Retell SMS)
POST /stripe-webhook            (Stripe events)
POST /webhooks/calcom           (Cal.com events)
```

---

## Database Migrations

Run in Supabase SQL Editor in this order:

1. `supabase/command_suite.sql`
2. `supabase/ops_infrastructure.sql`
3. `supabase/god_tier_hardening.sql`
4. `supabase/fix_agents_constraints.sql` ← **Required**
5. `supabase/referral_system.sql`
6. `supabase/sms_automation.sql`

---

## Environment Variables

### Backend (.env)

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
RETELL_API_KEY=...
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
SERVER_URL=...
FRONTEND_URL=...
ADMIN_EMAIL=...
RESEND_API_KEY=...
```

### Frontend (frontend/.env)

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_API_URL=...
VITE_ADMIN_EMAIL=...
```

---

## Support

1. Check [HANDOFF.md](./HANDOFF.md) for comprehensive overview
2. Search relevant documentation above
3. Check `error_logs` table in Supabase
4. Review Ops Dashboard at `/admin/ops`
