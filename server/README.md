# Kryonex API Server

The backend is a single Express.js server (`server.js` at repo root, ~16,000 lines). It handles all business logic including agent deployment, billing, calendar bookings, SMS automation, referrals, webhooks, and admin operations.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Environment Variables](#environment-variables)
3. [Authentication](#authentication)
4. [API Endpoints](#api-endpoints)
5. [Webhooks](#webhooks)
6. [SMS Automation](#sms-automation)
7. [Operations Infrastructure](#operations-infrastructure)
8. [Error Handling](#error-handling)
9. [Rate Limiting](#rate-limiting)
10. [Scheduled Jobs](#scheduled-jobs)

---

## Quick Start

```bash
# From repo root
npm install
npm start

# Server runs on http://localhost:3000 (or PORT env var)
```

---

## Environment Variables

Copy `env.template` to `.env` at repo root:

```bash
# === REQUIRED ===

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...  # Never expose!

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

# Retell AI
RETELL_API_KEY=key_...
RETELL_LLM_ID_HVAC=llm_...
RETELL_LLM_ID_PLUMBING=llm_...
RETELL_MASTER_AGENT_ID=agent_...
RETELL_WEBHOOK_SECRET=...  # Optional, for signature verification

# URLs (must be publicly accessible for webhooks)
SERVER_URL=https://your-backend.railway.app
FRONTEND_URL=https://your-frontend.vercel.app
APP_URL=https://your-frontend.vercel.app

# Admin (comma-separated emails)
ADMIN_EMAIL=admin@example.com

# Email
RESEND_API_KEY=re_...

# SMS (Universal Number System)
MASTER_SMS_NUMBER=+1...              # Shared SMS number for all tenants
SMS_SENDING_ENABLED=false           # Set to "true" when number is fully active
                                    # When false: SMS logged but NOT sent or counted

# === OPTIONAL ===
PORT=3000
RETELL_AUTO_SYNC_MINUTES=60
RETELL_SMS_SANDBOX=false            # Set to "true" for testing (no actual SMS sent)
```

---

## Authentication

### JWT Token

Most endpoints require a Supabase JWT in the Authorization header:

```
Authorization: Bearer <supabase_access_token>
```

### Middleware

| Middleware | Purpose |
|------------|---------|
| `requireAuth` | Validates JWT, sets `req.user` |
| `requireAdmin` | Checks `profiles.role === 'admin'` OR email in `ADMIN_EMAIL` |
| `resolveEffectiveUser` | Handles admin impersonation via `X-Impersonate-User-Id` header |

### Admin Detection

A user is admin if:
1. `profiles.role === 'admin'` in database, OR
2. User's email matches any in `ADMIN_EMAIL` env var

---

## API Endpoints

### User Endpoints

#### Dashboard & Stats
```
GET /api/dashboard/stats           - Basic KPIs
GET /api/dashboard/stats-enhanced  - Enhanced stats with ROI
GET /usage/status                  - Usage limits and remaining
GET /deploy-status                 - Agent deployment status
GET /api/analytics                 - Charts and time series data
```

#### Leads
```
GET    /leads                      - List user's leads
POST   /leads                      - Create lead
PUT    /leads/:id                  - Update lead
DELETE /leads/:id                  - Delete lead
POST   /leads/update-status        - Bulk status update
POST   /leads/:id/flag             - Flag for review
```

#### Appointments
```
GET    /appointments               - List appointments
POST   /appointments               - Create appointment (triggers SMS notifications)
PUT    /appointments/:id           - Update appointment
DELETE /appointments/:id           - Delete appointment
POST   /appointments/:id/request-review - Send review request SMS
```

**Appointment Fields:**
- `customer_name`, `customer_phone`, `customer_email`
- `start_time`, `end_time`, `duration_minutes`
- `location` (service address)
- `issue_type` (NO_HEAT, NO_AC, LEAK, etc.)
- `notes`, `status`
- `cal_booking_uid` (if synced with Cal.com)
- `source` (retell_calcom, retell_internal, manual, etc.)

**Booking Notifications:**
- Customer SMS confirmation (if `agents.confirmation_sms_enabled`)
- Owner SMS notification (if `profiles.appointment_sms_enabled` and `profiles.phone` set)
- Owner email alert (always sent if Resend configured)

#### Messages
```
GET  /messages                     - SMS history
POST /send-sms                     - Send SMS message
```

#### Customers
```
GET /api/customers                 - List customers grouped by phone
GET /api/customers/:phone/history  - Full customer timeline
```

#### Referrals
```
GET  /referral/my-code             - Get/create referral code
GET  /referral/stats               - Earnings summary
GET  /referral/history             - Detailed referral history
POST /referral/request-payout      - Request payout (min $50)
POST /referral/record-signup       - Record referral on signup
```

#### Webhooks (Zapier Integration)
```
GET    /api/webhooks               - List user's webhooks
POST   /api/webhooks               - Create webhook
PUT    /api/webhooks/:id           - Update webhook
DELETE /api/webhooks/:id           - Delete webhook
POST   /api/webhooks/:id/test      - Test webhook delivery
GET    /api/webhooks/:id/deliveries - Delivery history
POST   /api/webhooks/:wid/deliveries/:did/retry - Retry delivery
```

#### Settings
```
GET /api/settings                  - Get all settings
PUT /api/settings                  - Update settings
```

Settings include:
- `post_call_sms_enabled` - Enable post-call SMS
- `post_call_sms_template` - SMS template
- `review_request_enabled` - Enable review requests
- `google_review_url` - Google review link
- `business_hours` - Operating hours
- `transfer_number` - Call transfer number

#### Sessions
```
GET    /api/sessions               - List active sessions
DELETE /api/sessions/:id           - Revoke specific session
DELETE /api/sessions               - Revoke all sessions
POST   /api/change-password        - Change password
```

### Admin Endpoints

#### Users & Metrics
```
GET  /admin/users                  - All users
GET  /admin/users/:userId          - User details
GET  /admin/metrics                - Platform metrics
GET  /admin/metrics-enhanced       - Enhanced metrics
GET  /admin/timeseries             - Time series data
```

#### Referral Management
```
GET  /admin/referrals              - All referrals
GET  /admin/referrals/:id          - Single referral details
POST /admin/referrals/:id/approve  - Approve payout
POST /admin/referrals/:id/reject   - Reject payout
POST /admin/referrals/:id/mark-paid - Mark as paid
GET  /admin/referral-settings      - Program settings
PUT  /admin/referral-settings      - Update settings
GET  /admin/referral-payout-requests - Pending payouts
```

#### Quick Onboarding
```
POST /admin/quick-onboard          - Deploy client (no Stripe)
POST /admin/create-account         - Create user account
POST /admin/stripe-link            - Generate Stripe checkout link
```

#### Operations
```
GET  /admin/error-logs             - Error logs
POST /admin/error-logs/:id/resolve - Resolve error
GET  /admin/ops-alerts             - Operational alerts
POST /admin/ops-alerts/:id/acknowledge - Acknowledge alert
GET  /admin/health-scores          - Customer health scores
GET  /admin/churn-alerts           - Churn risk alerts
POST /admin/churn-alerts/:id/resolve - Resolve churn alert
```

#### Webhook Queue
```
GET  /admin/webhook-queue          - Queued webhooks
POST /admin/webhook-queue/:id/replay - Replay webhook
```

#### Reconciliation
```
GET  /admin/reconciliation-runs    - Reconciliation history
POST /admin/reconciliation-runs/trigger - Trigger manual run
```

---

## Webhooks

### Inbound Webhooks

#### Retell AI
```
POST /webhooks/retell-inbound      - Inbound call routing
     - Persists raw payload to webhook_queue
     - Looks up agent by phone number
     - Returns dynamic_variables for personalization
     - Sets override_agent_id to master agent

POST /retell-webhook               - Call events
     - call_started: Log call start
     - call_ended: Create lead, update usage, trigger post-call SMS

POST /webhooks/sms-inbound         - Inbound SMS
     - Multi-tenant routing via thread locks
     - Keyword detection (STOP, HELP, YES, NO)
     - Auto-responses for common keywords
```

#### Stripe
```
POST /stripe-webhook               - Payment events
     - checkout.session.completed: Create subscription, record referral
     - invoice.payment_succeeded: Recurring payment, referral commission
     - charge.refunded: Refund handling, referral clawback
     - charge.dispute.created: Dispute handling
```

#### Cal.com
```
POST /webhooks/calcom              - Booking events
     - BOOKING_CREATED: Create appointment, send notifications
     - BOOKING_RESCHEDULED: Update appointment
     - BOOKING_CANCELLED: Cancel appointment
```

#### Retell Custom Functions (Tool Calls)
```
POST /retell-tool-call            - AI agent custom function calls
     - book_appointment: Create Cal.com booking + local appointment
     - check_calendar_availability: Query Cal.com availability
     - reschedule_appointment: Update existing booking
     - cancel_booking: Cancel Cal.com booking
```

**Tool Call Flow:**
1. Retell AI calls custom function during phone call
2. Request sent to `/retell-tool-call` with full call context
3. Function executes (e.g., creates Cal.com booking)
4. Response returned to Retell AI
5. AI communicates result to caller
6. Notifications sent (customer SMS, owner SMS/email)

### Outbound Webhooks

Send webhooks to user-configured endpoints (Zapier, custom URLs).

#### Available Events
- `call_ended` - Call completed with duration, outcome
- `call_started` - Call initiated
- `appointment_booked` - New appointment created
- `appointment_updated` - Appointment modified
- `lead_created` - New lead from call
- `sms_received` - Inbound SMS

#### Payload Format
```json
{
  "event": "call_ended",
  "timestamp": "2026-02-06T10:30:00Z",
  "data": {
    "call_id": "...",
    "duration_seconds": 120,
    "caller_phone": "+1...",
    "outcome": "Appointment booked"
  }
}
```

#### Security
Optional HMAC signature via `X-Kryonex-Signature` header.
Configure secret in webhook settings to enable.

---

## SMS Automation

### Universal Number System

All SMS sent through shared `MASTER_SMS_NUMBER` with automatic business name prefixing:
- Format: `[Business Name] message text`
- Per-tenant usage tracking
- Opt-out compliance (per-tenant and global)
- Conversation routing via thread locks

**SMS Gate Control:**
- Set `SMS_SENDING_ENABLED=false` to disable sending (messages logged but not sent or counted)
- Set `SMS_SENDING_ENABLED=true` to enable full SMS functionality
- Perfect for pre-launch: system ready but no messages sent until number activated

### Booking Confirmation SMS (to Customers)

Automatically sent when appointments are booked:

1. Check `agents.confirmation_sms_enabled` (default: true)
2. Format: `Hi [Name]! Your appointment with [Business] is confirmed for [Date] at [Time]. Location: [Address]. We'll see you then!`
3. Sent via `sendBookingConfirmationSms()` → `sendSmsInternal()`
4. Includes business name in message (skipBusinessPrefix: true)

**Triggered by:**
- AI phone call bookings (`book_appointment` tool)
- Cal.com webhook bookings (`BOOKING_CREATED`)
- Manual appointment creation (`POST /appointments`)

### Owner Notification SMS (to Business Owners)

Alert business owners of new bookings:

1. Check `profiles.appointment_sms_enabled` (default: true)
2. Requires `profiles.phone` to be set
3. Format: `NEW BOOKING: [Customer] for [Date] at [Time] - [Service Type] at [Location]. Customer: [Phone]`
4. Sent via `sendNewAppointmentSmsToOwner()` → `sendSmsInternal()`

**Triggered by:**
- All appointment booking sources (AI, Cal.com, manual)

### Post-Call SMS

Automatically sends follow-up SMS after every completed call:

1. Check `agents.post_call_sms_enabled`
2. Wait `post_call_sms_delay_seconds` (default 60s)
3. Substitute variables in template
4. Send SMS via Retell
5. Log to `sms_automation_log`

### Review Requests

Sends Google review request after completed appointments:

1. Check `profiles.review_request_enabled`
2. Triggered via `POST /appointments/:id/request-review`
3. Send template with Google review link
4. Log to `sms_automation_log`

### Template Variables

Available in SMS templates:
- `{{business_name}}` - User's business name
- `{{customer_name}}` - Customer name from lead
- `{{appointment_time}}` - Appointment datetime
- `{{review_link}}` - Google review URL

---

## Operations Infrastructure

### Webhook Queue

All incoming webhooks are persisted before processing:

```javascript
persistRawWebhook({
  phoneNumber,
  userId,
  agentId,
  eventType,
  rawPayload,
  idempotencyKey
})
```

### Idempotency

SHA256-based deduplication prevents duplicate processing:

```javascript
generateIdempotencyKey(payload) // → SHA256 hash
isDuplicateEvent(key, "call_events") // → boolean
```

### Event Storage

Normalized events for billing and analytics:

```javascript
storeCallEvent({
  userId, callId, phoneNumber, direction,
  durationSeconds, outcome, providerCallId
})

storeSmsEvent({
  userId, messageId, phoneNumber, direction,
  providerMessageId
})
```

### Usage Enforcement

Tiered usage limits with soft/hard stops:

```javascript
evaluateUsageThresholds(userId)
// Returns: under_limit | soft_limit | hard_limit

refreshUsagePeriod(userId)
// Resets usage counters on billing period
```

### Error Tracking

Centralized error logging:

```javascript
trackError({
  error_type: "webhook_failure",
  endpoint: "/webhooks/retell-inbound",
  user_id: userId,
  message: error.message,
  stack_trace: error.stack,
  request_body: req.body
})
```

### Ops Alerts

Automatic alerts for critical events:

```javascript
createOpsAlert({
  alert_type: "usage_hard_stop",
  severity: "critical",
  user_id: userId,
  message: "User exceeded usage limit"
})
```

---

## Error Handling

### Global Error Handler

Catches all unhandled errors and returns consistent response:

```javascript
{
  "error": "Error message",
  "request_id": "uuid"
}
```

### Logging

Structured logs with prefixes:
- `📞` Call events
- `📱` SMS events
- `🔗` Webhook events
- `⭐` Review requests
- `🔥` Errors
- `💰` Billing events

---

## Rate Limiting

| Endpoint | Limit |
|----------|-------|
| Deploy | 6/min |
| Quick onboard | 6/min |
| Appointments | 30/min |
| Review requests | 10/min |
| Admin error logs | 30/min |
| Webhook queue | 30/min |
| Reconciliation trigger | 5/5min |

---

## Scheduled Jobs

### Nightly Reconciliation

Runs at 3:00 AM UTC daily:

```javascript
scheduleNightlyReconciliation()
// Compares usage_limits aggregates vs actual usage_calls/usage_sms
// Flags discrepancies > 5%
// Creates ops alerts if issues found
```

### Appointment Reminders

Continuous background job:

```javascript
scheduleAppointmentReminders()
// Sends SMS 24h and 1h before appointments
```

### Template Sync

Optional Retell template synchronization:

```javascript
scheduleRetellTemplateSync()
// Syncs templates every RETELL_AUTO_SYNC_MINUTES
```

---

## Phone Number Normalization

All phone numbers normalized to E.164 format:

```javascript
normalizePhoneE164("5551234567")     // → "+15551234567"
normalizePhoneE164("(555) 123-4567") // → "+15551234567"
```

Applied to:
- Transfer numbers
- User phone numbers
- Customer phone numbers
- SMS recipients

---

## Debugging

### Check Webhook Flow

1. Look in `webhook_queue` table for raw payload
2. Check `error_logs` for processing errors
3. Verify `agents` table has matching phone number
4. Check `profiles` for user settings

### Simulate Webhook

```powershell
$env:WEBHOOK_URL="https://your-backend/webhooks/retell-inbound"
$env:TO_NUMBER="+14155551234"
node scripts/simulate_retell.js
```

### Common Issues

1. **"Agent not found"** - Phone number not in E.164 or not in `agents`
2. **"Usage exceeded"** - Check `usage_limits` table
3. **"Invalid token"** - Supabase JWT expired or invalid
4. **SMS not sending** - Check `SMS_SENDING_ENABLED=true` in Railway
5. **SMS counting but not sending** - `SMS_SENDING_ENABLED` is false, set to true
6. **Owner notifications not received** - Ensure `profiles.phone` is set and `profiles.appointment_sms_enabled=true`

### Enabling SMS When Universal Number is Ready

**Step-by-step activation:**

1. **Verify universal number is active:**
   - Number should be provisioned and active in Retell
   - Test inbound/outbound SMS manually

2. **Set environment variables in Railway:**
   ```
   MASTER_SMS_NUMBER=+1XXXXXXXXXX
   SMS_SENDING_ENABLED=true
   ```

3. **Redeploy (or wait for auto-deploy):**
   - Railway will automatically redeploy on env var change
   - Or trigger manual redeploy from Railway dashboard

4. **Verify SMS is working:**
   - Check logs for `[sendSms] SMS_SENDING_ENABLED is ON`
   - Test booking an appointment
   - Verify SMS sent and usage counted

5. **Monitor usage:**
   - Check `/admin/users` for SMS usage
   - Verify `usage_limits.sms_used` increments correctly
   - Check `messages` table for sent messages

**Before activation (SMS_SENDING_ENABLED=false):**
- ✅ System attempts to send SMS (logged)
- ✅ No actual SMS sent
- ✅ No usage counted
- ✅ Perfect for pre-launch testing

**After activation (SMS_SENDING_ENABLED=true):**
- ✅ SMS actually sent via Retell
- ✅ Usage counted per tenant
- ✅ All notifications active (booking confirmations, owner alerts)
