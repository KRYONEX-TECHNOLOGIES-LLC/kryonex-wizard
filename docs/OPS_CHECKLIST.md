# Ops Infrastructure Checklist

This document tracks the implementation status of the ops infrastructure for the Kryonex platform.

**Last updated:** February 6, 2026

---

## Implementation Status

### ✅ COMPLETE - All Core Features Implemented

---

## Core Entities and Canonical Fields

| Field | Table | Status |
|-------|-------|--------|
| phone_number (E.164) | agents | ✅ Implemented |
| user_id | agents | ✅ Implemented (UNIQUE constraint) |
| agent_id | agents | ✅ Implemented (shared master agent) |
| provider_number_id | agents | ✅ Added |
| deploy_request_id | agents | ✅ Added |
| nickname | agents | ✅ Added |
| status | agents | ✅ Added |
| is_active | agents | ✅ Implemented |
| created_at | agents | ✅ Implemented |
| updated_at | agents | ✅ Added |
| provisioned_by | agents | ✅ Added |
| provider | agents | ✅ Added |

---

## Webhook Handling

| Feature | Status | Notes |
|---------|--------|-------|
| Raw payload persistence | ✅ Implemented | `persistRawWebhook()` → webhook_queue |
| Idempotency key generation | ✅ Implemented | `generateIdempotencyKey()` SHA256 |
| Duplicate detection | ✅ Implemented | `isDuplicateEvent()` |
| Unknown phone storage | ✅ Implemented | `storeUnknownPhone()` → unknown_phone |
| Webhook queue for replay | ✅ Implemented | webhook_queue table |
| Mark processed | ✅ Implemented | `markWebhookProcessed()` |
| **Webhook Queue UI** | ✅ Implemented | Admin Ops Dashboard tab |
| **Replay API** | ✅ Implemented | POST /admin/webhook-queue/:id/replay |

---

## Event Storage

| Table | Status | Notes |
|-------|--------|-------|
| webhook_queue | ✅ Complete | Raw storage with replay support |
| unknown_phone | ✅ Complete | Unrecognized numbers |
| call_events | ✅ Complete | Normalized call records |
| sms_events | ✅ Complete | Normalized SMS records |
| usage_calls | ✅ Complete | Individual call tracking |
| usage_sms | ✅ Complete | Individual SMS tracking |

---

## Usage & Billing

| Feature | Status | Notes |
|---------|--------|-------|
| usage_limits table | ✅ Complete | Tier, caps, credits, state |
| Threshold evaluation | ✅ Implemented | `evaluateUsageThresholds()` |
| Hard stop enforcement | ✅ Implemented | Blocks calls/SMS at limit |
| tier_snapshots | ✅ Schema created | Historical billing accuracy |
| billing_line_items | ✅ Schema created | Traceable billing |
| SMS credit inclusion | ✅ Implemented | Adds sms_credit to cap |

---

## Error Tracking

| Feature | Status | Notes |
|---------|--------|-------|
| error_logs table | ✅ Complete | Centralized error storage |
| `trackError()` function | ✅ Implemented | All webhook errors tracked |
| Error resolution UI | ✅ Implemented | Admin Ops Dashboard |
| Stack trace storage | ✅ Implemented | Full debugging info |
| Request body logging | ✅ Implemented | Reproducing issues |

---

## Operational Alerting

| Feature | Status | Notes |
|---------|--------|-------|
| ops_alerts table | ✅ Complete | Alert storage |
| `createOpsAlert()` function | ✅ Implemented | Programmatic alerts |
| Usage threshold alerts | ✅ Implemented | 80%, 100%, hard stop |
| Reconciliation alerts | ✅ Implemented | Discrepancy notifications |
| Alert acknowledgment UI | ✅ Implemented | Admin Ops Dashboard |

---

## Customer Health

| Feature | Status | Notes |
|---------|--------|-------|
| customer_health_scores table | ✅ Complete | A-F grading |
| Health calculation | ✅ Implemented | Usage, engagement, billing |
| churn_alerts table | ✅ Complete | At-risk notifications |
| Churn alert UI | ✅ Implemented | Admin Ops Dashboard |
| Risk level tracking | ✅ Implemented | low/medium/high/critical |

---

## Session Management

| Feature | Status | Notes |
|---------|--------|-------|
| active_sessions table | ✅ Complete | Token tracking |
| Session tracking | ✅ Implemented | `trackSession()` |
| Session revocation | ✅ Implemented | `revokeAllUserSessions()` |
| Sessions API | ✅ Implemented | GET/DELETE /api/sessions |
| Password change | ✅ Implemented | POST /api/change-password |

---

## Reconciliation

| Feature | Status | Notes |
|---------|--------|-------|
| reconciliation_runs table | ✅ Complete | Audit trail |
| `runReconciliation()` function | ✅ Implemented | Compare aggregates vs actual |
| Nightly scheduler | ✅ Implemented | Runs at 3 AM UTC |
| Manual trigger | ✅ Implemented | POST /admin/reconciliation-runs/trigger |
| Reconciliation UI | ✅ Implemented | Admin Ops Dashboard tab |
| Discrepancy detection | ✅ Implemented | 5% threshold |
| Alert on discrepancies | ✅ Implemented | Creates ops_alert |

---

## Admin Ops Dashboard

All ops features accessible at `/admin/ops`:

| Tab | Features |
|-----|----------|
| **Errors** | Error log list, resolution buttons, stack traces |
| **Alerts** | Ops alerts with severity, acknowledgment |
| **Churn Risk** | At-risk users with severity, resolution |
| **Health Overview** | Grade distribution, risk distribution |
| **Webhook Queue** | Pending/failed webhooks, replay buttons |
| **Reconciliation** | Run history, manual trigger, discrepancy counts |

---

## Database Migrations Required

Run these in Supabase SQL Editor:

```sql
-- 1. Core ops tables
-- Run: supabase/ops_infrastructure.sql

-- 2. Customer health and sessions
-- Run: supabase/god_tier_hardening.sql

-- 3. Agent constraints (REQUIRED)
-- Run: supabase/fix_agents_constraints.sql
```

Verify tables exist:

```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'webhook_queue', 'unknown_phone', 'call_events', 'sms_events',
  'error_logs', 'ops_alerts', 'customer_health_scores', 'churn_alerts',
  'active_sessions', 'reconciliation_runs', 'tier_snapshots', 
  'billing_line_items', 'usage_calls', 'usage_sms'
);
```

---

## Testing Checklist

- [x] Raw webhook persistence verified
- [x] Normalized event records created
- [x] Usage counters update atomically
- [x] Tier enforcement at soft/hard thresholds
- [x] Unknown phone handling
- [x] Webhook queue replay UI
- [x] Error tracking and resolution
- [x] Ops alerts creation and acknowledgment
- [x] Customer health score calculation
- [x] Churn alert generation
- [x] Session tracking and revocation
- [x] Nightly reconciliation execution
- [x] Manual reconciliation trigger
- [x] Discrepancy detection and alerting

---

## Phone Number Normalization

All phone numbers normalized to E.164 format (+1XXXXXXXXXX):

| Location | Status |
|----------|--------|
| Wizard form inputs | ✅ onBlur normalization |
| Deploy payload | ✅ normalizePhoneE164() |
| Settings save | ✅ normalizePhoneE164() |
| Calendar appointments | ✅ normalizePhoneE164() |
| SMS sending | ✅ normalizePhoneE164() |
| Backend webhook handling | ✅ normalizePhoneE164() |

---

## Completed Improvements (Feb 2026)

1. **Dashboard webhooks flag** - `integrationsEnabled` now checks real webhook config
2. **Webhook Queue UI** - Admin can view/filter/replay failed webhooks
3. **Nightly Reconciliation** - Runs at 3 AM UTC, compares aggregates
4. **Reconciliation UI** - View history, trigger manual runs
5. **Comprehensive Error Handling** - Frontend interceptor + backend trackError()
6. **Phone Normalization** - E.164 format on all devices (mobile/tablet/desktop)
7. **Stripe Redirect Fix** - Goes to Deploy step (5) after payment
8. **Agent Constraint Fix** - Unique on user_id, not agent_id

---

## Future Enhancements (Nice to Have)

These are NOT blocking launch:

1. **Webhook signature validation** - Verify HMAC on provider webhooks
2. **PII masking** - Sanitize phone numbers in public logs
3. **Export functionality** - CSV export for reconciliation reports
4. **Advanced analytics** - Time-series aggregations in ops dashboard
5. **External reconciliation** - Compare with Retell billing API

---

*All core ops infrastructure is complete and production-ready.*
