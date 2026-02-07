# Supabase Database

This folder contains all SQL schema files and migrations for the Kryonex platform.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Migration Order](#migration-order)
3. [Schema Files](#schema-files)
4. [Core Tables](#core-tables)
5. [Operations Tables](#operations-tables)
6. [Billing Tables](#billing-tables)
7. [Row Level Security](#row-level-security)
8. [Common Queries](#common-queries)

---

## Quick Start

1. Open Supabase Dashboard → SQL Editor
2. Run migrations **in order** (see below)
3. Test in staging before production

---

## Migration Order

Run these files in the Supabase SQL Editor in this exact order:

| Order | File | Description |
|-------|------|-------------|
| 1 | `command_suite.sql` | Core tables (profiles, leads, agents, etc.) |
| 2 | `ops_infrastructure.sql` | Ops tables (webhooks, events, alerts) |
| 3 | `god_tier_hardening.sql` | Health scores, error tracking, sessions |
| 4 | `fix_agents_constraints.sql` | **REQUIRED** - Fixes agent unique constraints |
| 5 | `referral_system.sql` | Referral program tables |
| 6 | `sms_automation.sql` | SMS automation and webhooks |
| 7 | `usage_tracking.sql` | Usage tracking enhancements |
| 8 | `shared_sms_upgrade.sql` | Shared SMS number infrastructure |

**Important:** `fix_agents_constraints.sql` MUST be run to prevent "duplicate key" errors during agent deployment.

---

## Schema Files

| File | Description |
|------|-------------|
| `command_suite.sql` | Core tables: profiles, leads, deals, commissions, call_recordings, integrations, tracking, appointments, audit_logs, black_box_logs, dialer_queue |
| `ops_infrastructure.sql` | Ops tables: webhook_queue, unknown_phone, call_events, sms_events, alerts, tier_snapshots, billing_line_items, reconciliation_runs |
| `god_tier_hardening.sql` | Customer health: customer_health_scores, churn_alerts, error_logs, ops_alerts, latency_logs, active_sessions, upgrade_prompts_shown |
| `fix_agents_constraints.sql` | Fixes agents table to use user_id as unique key instead of agent_id |
| `referral_system.sql` | Referral program: referral_codes, referrals, referral_commissions, referral_settings |
| `sms_automation.sql` | SMS: post_call_sms fields, review_request fields, webhook_configs, webhook_deliveries, user_premium_features |
| `usage_tracking.sql` | Usage: usage_calls, usage_sms tables |
| `shared_sms_upgrade.sql` | Shared SMS: sms_opt_out, sms_thread_locks, outbound_sms_log |
| `business_hours.sql` | Business hours JSON column on profiles |
| `consent_logs.sql` | Consent tracking for compliance |
| `agents_deploy_trace.sql` | Deploy tracing columns on agents |

---

## Core Tables

### profiles

User metadata and settings.

| Column | Type | Description |
|--------|------|-------------|
| user_id | uuid | Primary key, references auth.users |
| email | text | User email |
| business_name | text | Business display name |
| area_code | text | Preferred area code for phone |
| role | text | 'user' or 'admin' |
| tier | text | 'core', 'pro', 'elite', 'scale' |
| industry | text | 'hvac', 'plumbing', 'electrical' |
| cal_com_url | text | Cal.com booking URL |
| transfer_number | text | Call transfer number (E.164) |
| business_hours | jsonb | Operating hours |
| post_call_sms_enabled | boolean | Enable post-call SMS |
| review_request_enabled | boolean | Enable review requests |

### agents

Deployed Retell agents.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Owner (UNIQUE) |
| agent_id | text | Retell agent ID (shared master) |
| phone_number | text | Provisioned phone (E.164, UNIQUE) |
| nickname | text | Business name fallback |
| status | text | 'active', 'pending', 'disabled' |
| inbound_webhook_url | text | Webhook URL for this agent |

**Key Constraints:**
- `agents_user_id_key` - One agent per user
- `agents_phone_number_key` - Each phone unique

### leads

Customer leads from calls.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Owner |
| phone | text | Customer phone |
| name | text | Customer name |
| business_name | text | Customer business |
| transcript | text | Call transcript |
| summary | text | AI summary |
| sentiment | text | 'positive', 'neutral', 'negative' |
| status | text | Lead status |
| call_duration_seconds | integer | Call length |
| appointment_booked | boolean | Booking indicator |
| flagged_for_review | boolean | Admin flag |

### messages

SMS conversation history.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Owner |
| thread_id | text | Conversation thread |
| direction | text | 'inbound' or 'outbound' |
| from_number | text | Sender phone |
| to_number | text | Recipient phone |
| body | text | Message content |
| created_at | timestamptz | Timestamp |

### appointments

Calendar bookings.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Owner |
| customer_name | text | Customer name |
| customer_phone | text | Customer phone (E.164) |
| customer_email | text | Customer email |
| start_time | timestamptz | Appointment start |
| end_time | timestamptz | Appointment end |
| status | text | 'scheduled', 'completed', 'cancelled' |
| notes | text | Appointment notes |
| cal_booking_uid | text | Cal.com booking ID |

### subscriptions

Stripe subscription state.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Owner |
| stripe_subscription_id | text | Stripe subscription ID |
| stripe_customer_id | text | Stripe customer ID |
| tier | text | Subscription tier |
| status | text | 'active', 'canceled', etc. |
| current_period_start | timestamptz | Billing period start |
| current_period_end | timestamptz | Billing period end |

### usage_limits

Usage tracking per user.

| Column | Type | Description |
|--------|------|-------------|
| user_id | uuid | Primary key |
| tier | text | Current tier |
| call_cap_seconds | integer | Monthly call limit |
| call_used_seconds | integer | Used call seconds |
| call_credit | integer | Bonus call seconds |
| sms_cap | integer | Monthly SMS limit |
| sms_used | integer | Used SMS count |
| sms_credit | integer | Bonus SMS |
| period_start | timestamptz | Current period start |
| period_end | timestamptz | Current period end |
| limit_state | text | 'under', 'soft', 'hard' |
| hard_stop_active | boolean | Usage blocked |

---

## Operations Tables

### webhook_queue

Raw webhook storage for audit and replay.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| phone_number | text | Associated phone |
| user_id | uuid | Associated user |
| event_type | text | Event type |
| raw_payload | jsonb | Full webhook payload |
| idempotency_key | text | Deduplication key |
| received_at | timestamptz | Receive time |
| processed_at | timestamptz | Process time |
| processed_by | text | Processor ID |
| result | text | Processing result |
| error_message | text | Error if failed |
| attempts | integer | Retry count |

### error_logs

Application error tracking.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| error_type | text | Error category |
| endpoint | text | API endpoint |
| user_id | uuid | Associated user |
| message | text | Error message |
| stack_trace | text | Stack trace |
| request_body | jsonb | Request that caused error |
| resolved_at | timestamptz | Resolution time |
| resolved_by | uuid | Resolver ID |
| resolution_notes | text | Resolution notes |

### ops_alerts

Operational alerts.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| alert_type | text | Alert category |
| severity | text | 'info', 'warning', 'critical' |
| user_id | uuid | Associated user |
| message | text | Alert message |
| details | jsonb | Additional data |
| acknowledged_at | timestamptz | Acknowledgment time |
| acknowledged_by | uuid | Acknowledger ID |

### customer_health_scores

User health grading.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | User (UNIQUE) |
| score | integer | Health score (0-100) |
| grade | text | 'A', 'B', 'C', 'D', 'F' |
| risk_level | text | 'low', 'medium', 'high', 'critical' |
| factors | jsonb | Score breakdown |
| last_calculated | timestamptz | Calculation time |

### churn_alerts

Churn risk notifications.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | At-risk user |
| reason | text | Churn indicator |
| severity | text | Risk severity |
| resolved_at | timestamptz | Resolution time |

### reconciliation_runs

Usage reconciliation history.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| run_type | text | 'nightly', 'manual' |
| started_at | timestamptz | Start time |
| completed_at | timestamptz | End time |
| status | text | 'running', 'completed', 'failed' |
| records_checked | integer | Users checked |
| discrepancies_found | integer | Issues found |
| discrepancy_details | jsonb | Issue details |
| triggered_by | text | Trigger source |

### active_sessions

Session tracking.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Session owner |
| token_hash | text | Hashed token (UNIQUE) |
| ip_address | text | Client IP |
| user_agent | text | Client agent |
| created_at | timestamptz | Session start |
| last_active | timestamptz | Last activity |
| revoked_at | timestamptz | Revocation time |

---

## Billing Tables

### usage_calls

Individual call records for billing.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | Call owner |
| call_id | text | Call identifier |
| phone_number | text | Phone used |
| direction | text | 'inbound', 'outbound' |
| seconds | integer | Call duration |
| provider_call_id | text | Retell call ID |
| created_at | timestamptz | Call time |

### usage_sms

Individual SMS records for billing.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | SMS owner |
| message_id | text | Message identifier |
| phone_number | text | Phone used |
| direction | text | 'inbound', 'outbound' |
| provider_message_id | text | Provider message ID |
| created_at | timestamptz | SMS time |

---

## Row Level Security

### User Tables

Users can only access their own data:

```sql
CREATE POLICY "users_own_data" ON leads
FOR ALL USING (user_id = auth.uid());
```

### Admin Tables

Ops tables are admin-only:

```sql
CREATE POLICY "admins_full_access" ON webhook_queue
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles p 
    WHERE p.user_id = auth.uid() 
    AND p.role = 'admin'
  )
);
```

### Service Role

The backend uses `SUPABASE_SERVICE_ROLE_KEY` which bypasses RLS.
**Never expose this key to the frontend.**

---

## Common Queries

### Check User's Usage

```sql
SELECT 
  tier,
  call_used_seconds,
  call_cap_seconds,
  call_credit,
  sms_used,
  sms_cap,
  sms_credit,
  limit_state
FROM usage_limits
WHERE user_id = 'USER_ID';
```

### Find Agent by Phone

```sql
SELECT * FROM agents
WHERE phone_number = '+14155551234';
```

### Check Webhook Queue

```sql
SELECT 
  id, event_type, phone_number,
  processed_at, error_message, attempts
FROM webhook_queue
WHERE processed_at IS NULL
ORDER BY received_at DESC
LIMIT 50;
```

### View Recent Errors

```sql
SELECT 
  error_type, endpoint, message,
  created_at, resolved_at
FROM error_logs
WHERE resolved_at IS NULL
ORDER BY created_at DESC
LIMIT 20;
```

### Customer Health Distribution

```sql
SELECT 
  grade,
  COUNT(*) as count
FROM customer_health_scores
GROUP BY grade
ORDER BY grade;
```

### Reconciliation Status

```sql
SELECT 
  run_type, status,
  records_checked, discrepancies_found,
  started_at, completed_at
FROM reconciliation_runs
ORDER BY started_at DESC
LIMIT 10;
```

---

## Troubleshooting

### "Duplicate key" on agent deploy

Run `fix_agents_constraints.sql` to change unique constraint from `agent_id` to `user_id`.

### Missing columns

If queries fail with "column does not exist", run the appropriate migration file.

### RLS blocking access

- Check `profiles.role` for admin status
- Verify `auth.uid()` matches expected user
- Backend uses service role (bypasses RLS)
