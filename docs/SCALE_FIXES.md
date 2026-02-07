# Scale Fixes - Production Hardening

This document describes the production hardening implemented to address scale risks and gaps in the system.

## Overview of Fixes

### 1. Distributed Locking (Multi-Instance Safety)

**Problem:** Single process with all jobs and rate limits in memory. Multiple Railway replicas would run duplicate scheduled jobs.

**Solution:** Database-backed distributed locking using Supabase PostgreSQL.

- New table: `distributed_locks` - Stores lock ownership with TTL
- New functions: `acquire_distributed_lock()`, `release_distributed_lock()`
- Each Railway instance gets a unique `INSTANCE_ID` on startup
- Before running any scheduled job, the instance must acquire the lock
- If another instance holds the lock, the job is skipped
- Locks expire automatically (TTL-based) to prevent deadlocks

**Affected Jobs:**
- Nightly reconciliation (3 AM UTC)
- Health score recalculation (every 6 hours)
- Inactive user checks (daily)
- Webhook retries (every 30 seconds)
- Webhook health checks (every 15 minutes)
- Retell template sync (configurable interval)

### 2. Deploy Idempotency (No Duplicate Phone Numbers)

**Problem:** Duplicate Stripe events or double-clicking Deploy could create multiple phone numbers per user.

**Solution:** Multi-layer protection:

1. **Existing Phone Check:** `deployAgentForUser()` now checks if user already has a phone number and returns early if so (idempotent)
2. **Deployment Locks:** New table `deployment_locks` prevents concurrent deployments for the same user
3. **Lock Functions:** `acquire_deployment_lock()`, `release_deployment_lock()`
4. **Unique Constraint:** `agents_phone_number_unique` constraint on the `agents` table

**Code Flow:**
```
deployAgentForUser(userId)
├── Check if user already has phone number → Return existing (idempotent)
├── Acquire deployment lock
│   └── If lock failed → Check again for phone number → Error if still none
├── Provision phone number
└── Release lock (success or failure)
```

### 3. Stripe Webhook Idempotency

**Problem:** Stripe retries webhooks on 5xx errors, potentially processing the same event multiple times.

**Solution:**

- New table: `stripe_processed_events` - Tracks all processed Stripe event IDs
- Before processing any Stripe event, check if already processed
- After processing (success or failure), mark as processed
- Old events cleaned up after 30 days

**Benefits:**
- Prevents duplicate subscriptions
- Prevents duplicate agent deployments from Stripe checkout completion
- Prevents duplicate referral commission processing

### 4. Cal.com Webhook User Resolution

**Problem:** Cal.com webhook user resolution depends on organizer username/email matching your DB. Mismatches can drop or mis-attribute bookings.

**Solution:** Enhanced resolution with 6 fallback methods:

1. **Cal.com User ID:** Look up by `cal_user_id` in integrations table
2. **Cal.com Username (integrations):** Match `cal_username` in integrations
3. **Cal.com Username (profiles):** Match `cal_username` in profiles
4. **Organizer Email (profiles):** Match email in profiles
5. **Auth Users Email:** Look up in `auth.users` by email
6. **URL Pattern Matching:** Extract username from booking URL

**Additional Improvements:**
- Cal.com OAuth now fetches and stores `cal_user_id` during connection
- New column: `integrations.cal_user_id`
- New column: `integrations.cal_organization_id`
- Better error tracking when user not found

### 5. Master Agent Health Validation

**Problem:** One master agent per industry - if misconfigured or disabled, all users on that industry are affected.

**Solution:**

- On server startup, validate both master agents (HVAC & Plumbing)
- Verify agent exists and is accessible via Retell API
- Log agent details (name, LLM ID, version)
- If agent is inaccessible, create `ops_alerts` record with severity "critical"

### 6. Job Run History

**Problem:** No visibility into whether scheduled jobs are running successfully.

**Solution:**

- New table: `scheduled_job_runs` - Tracks job execution history
- Each job run records: timestamp, instance ID, result, error message
- Persists across restarts
- Enables monitoring dashboards

## Database Migration

Run this SQL migration in Supabase before deploying:

```bash
# In Supabase SQL Editor, run:
supabase/scale_fixes.sql
```

The migration creates:
- `distributed_locks` table
- `deployment_locks` table  
- `stripe_processed_events` table
- `scheduled_job_runs` table
- PostgreSQL functions for lock management
- Unique constraint on `agents.phone_number`
- Cal.com resolution columns on `integrations`

## Backwards Compatibility

All fixes are designed to be backwards compatible:

1. **Graceful Degradation:** If distributed lock tables don't exist, code falls back to single-instance behavior
2. **Fail Open:** Lock acquisition failures allow the job to proceed (prevents total system lockout)
3. **No Breaking Changes:** Existing API contracts remain unchanged
4. **Idempotent Returns:** Duplicate deploys return existing data instead of error

## Monitoring

After deployment, monitor these metrics:

1. **Job Runs:** Query `scheduled_job_runs` for job execution history
2. **Lock Contention:** Query `distributed_locks` to see which jobs are locked
3. **Stripe Events:** Query `stripe_processed_events` to verify event processing
4. **Ops Alerts:** Check `ops_alerts` for master agent validation failures

## Scale Recommendations

For true horizontal scaling beyond these fixes:

1. **External Job Queue:** Consider moving to a dedicated queue service (e.g., BullMQ with Redis)
2. **Centralized Rate Limiting:** Use Redis for shared rate limit state
3. **Read Replicas:** Add Supabase read replicas for heavy read workloads
4. **Caching Layer:** Add Redis/Memcached for frequently accessed data
5. **CDN:** Ensure static assets are served via CDN
