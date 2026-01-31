# Ops Infrastructure Checklist

This document tracks the implementation status of the ops infrastructure per the specification.

---

## Core Entities and Canonical Fields

| Field | Table | Status |
|-------|-------|--------|
| phone_number (E.164) | agents | ✅ Implemented |
| user_id | agents | ✅ Implemented |
| agent_id | agents | ✅ Implemented (pending-{userId} pattern) |
| provider_number_id | agents | ✅ Added in agents_deploy_trace.sql |
| deploy_request_id | agents | ✅ Added in agents_deploy_trace.sql |
| nickname | agents | ✅ Added in agents_deploy_trace.sql |
| status | agents | ✅ Added in ops_infrastructure.sql |
| is_active | agents | ✅ Implemented |
| created_at | agents | ✅ Implemented |
| updated_at | agents | ✅ Added in ops_infrastructure.sql |
| provisioned_by | agents | ✅ Added in ops_infrastructure.sql |
| provider | agents | ✅ Added in ops_infrastructure.sql |

---

## Webhook Handling

| Feature | Status | Notes |
|---------|--------|-------|
| Raw payload persistence before processing | ✅ Implemented | `persistRawWebhook()` in server.js |
| Idempotency key generation | ✅ Implemented | `generateIdempotencyKey()` |
| Duplicate detection | ✅ Implemented | `isDuplicateEvent()` |
| Unknown phone storage | ✅ Implemented | `storeUnknownPhone()` → unknown_phone table |
| Webhook queue for replay | ✅ Implemented | webhook_queue table |
| Mark processed | ✅ Implemented | `markWebhookProcessed()` |

---

## Event Storage

| Table | Status | Notes |
|-------|--------|-------|
| call_events | ✅ Schema created | ops_infrastructure.sql |
| sms_events | ✅ Schema created | ops_infrastructure.sql |
| webhook_queue | ✅ Schema created | ops_infrastructure.sql |
| unknown_phone | ✅ Schema created | ops_infrastructure.sql |

---

## Usage & Billing

| Feature | Status | Notes |
|---------|--------|-------|
| usage_limits enhancements | ✅ Schema created | tier fields, limit_state |
| tier_snapshots | ✅ Schema created | Historical billing accuracy |
| billing_line_items | ✅ Schema created | Traceable billing |
| Threshold evaluation | ✅ Implemented | `evaluateUsageThresholds()` |

---

## Alerting

| Feature | Status | Notes |
|---------|--------|-------|
| alerts table | ✅ Schema created | ops_infrastructure.sql |
| Usage warning alerts | ✅ Implemented | Created on soft threshold |
| Usage blocked alerts | ✅ Implemented | Created on hard threshold |

---

## Reconciliation

| Feature | Status | Notes |
|---------|--------|-------|
| reconciliation_runs table | ✅ Schema created | ops_infrastructure.sql |
| Nightly reconciliation job | ⏳ TODO | Need cron/scheduler |

---

## To Run

1. **Run the migration in Supabase SQL Editor:**
   ```sql
   -- Run: supabase/ops_infrastructure.sql
   ```

2. **Deploy server.js** to Railway with the new webhook handlers.

3. **Verify tables exist:**
   ```sql
   SELECT table_name FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name IN ('webhook_queue', 'unknown_phone', 'call_events', 'sms_events', 'alerts', 'tier_snapshots', 'billing_line_items', 'reconciliation_runs');
   ```

---

## Testing Checklist

- [ ] Raw webhook persistence verified for test events
- [ ] Normalized event records created with required fields for calls and SMS
- [ ] Usage counters update atomically and reflect test events
- [ ] Tier enforcement triggers at soft and hard thresholds during tests
- [ ] Unknown phone and webhook_queue behavior tested and logged
- [ ] Manual replay flow tested end-to-end and audit logs recorded

---

## Future Enhancements

1. **Webhook signature validation** - Verify provider signatures on all webhooks
2. **Replay UI** - Admin interface to replay queued webhooks
3. **Reconciliation cron job** - Nightly comparison with provider usage
4. **Dashboard metrics** - Real-time aggregates for calls, SMS, errors
5. **PII masking** - Sanitize message bodies in logs

---

*Last updated: 2026-01-30*
