# Kryonex API Server

The backend is a single Express server in `server.js`. It handles agent deployment,
billing, calendar bookings, SMS automation, referrals, webhooks, and admin operations.

## Run
```bash
npm install
npm start
```

## Environment

Copy `env.template` to `.env` at repo root. Required keys:

```bash
# Supabase
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

# Stripe
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
STRIPE_PRICE_*=... (tier price IDs)

# Retell
RETELL_API_KEY=...
RETELL_LLM_ID_*=... (industry LLM IDs)
RETELL_WEBHOOK_SECRET=...

# URLs
FRONTEND_URL=...
APP_URL=...
SERVER_URL=... (public URL for webhooks)

# Admin
ADMIN_EMAIL=admin@domain.com (comma-separated for multiple)

# Email
RESEND_API_KEY=...
```

## Auth Model
- Most routes require Supabase JWT in `Authorization: Bearer <token>`
- Admin routes use `requireAdmin`: `profiles.role === 'admin'` OR `email` matches `ADMIN_EMAIL`

## API Endpoints

### User Endpoints

#### Dashboard
```
GET /api/dashboard/stats           - Basic stats
GET /api/dashboard/stats-enhanced  - Enhanced stats with insights
GET /usage/status                  - Usage limits and state
GET /deploy-status                 - Agent deployment status
```

#### Referral Program
```
GET  /referral/my-code             - Get/create referral code
GET  /referral/stats               - Earnings summary
GET  /referral/history             - Detailed referral history
POST /referral/request-payout      - Request payout (min $50)
POST /referral/record-signup       - Record referral on signup
```

#### Customer CRM
```
GET /api/customers                 - List customers grouped by phone
GET /api/customers/:phone/history  - Full customer timeline
```

#### Webhooks (Zapier)
```
GET    /api/webhooks               - List user's webhooks
POST   /api/webhooks               - Create webhook
PUT    /api/webhooks/:id           - Update webhook
DELETE /api/webhooks/:id           - Delete webhook
POST   /api/webhooks/:id/test      - Test webhook delivery
GET    /api/webhooks/:id/deliveries - Delivery history
```

#### Settings (includes SMS automation)
```
GET /api/settings                  - Get all settings
PUT /api/settings                  - Update settings
    - post_call_sms_enabled        - Enable post-call SMS
    - post_call_sms_template       - SMS template
    - post_call_sms_delay_seconds  - Delay before sending
    - review_request_enabled       - Enable review requests
    - google_review_url            - Google review link
    - review_request_template      - Review request template
```

#### Reviews
```
POST /appointments/:id/request-review - Send review request SMS
```

#### Leads & Messages
```
GET  /leads                        - User's leads
POST /leads/update-status          - Update lead status
GET  /messages                     - SMS messages
POST /send-sms                     - Send SMS
```

#### Calendar
```
GET    /appointments               - List appointments
POST   /appointments               - Create appointment
PUT    /appointments/:id           - Update appointment
DELETE /appointments/:id           - Delete appointment
```

### Admin Endpoints

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

#### Fleet Management
```
GET  /admin/users                  - All users
GET  /admin/users/:userId          - User details
GET  /admin/metrics                - Platform metrics
GET  /admin/metrics-enhanced       - Enhanced metrics
GET  /admin/timeseries             - Time series data
```

#### Quick Onboarding
```
POST /admin/quick-onboard          - Deploy client (no Stripe)
POST /admin/create-account         - Create user account
POST /admin/stripe-link            - Generate Stripe link
```

## Webhooks (Inbound)

### Retell
```
POST /webhooks/retell-inbound      - Inbound call, returns dynamic vars
POST /retell-webhook               - Call events (started, ended)
POST /webhooks/sms-inbound         - Inbound SMS
```

### Stripe
```
POST /stripe-webhook               - Payment events
    - checkout.session.completed   - New subscription, referral credit
    - invoice.payment_succeeded    - Recurring payment, referral commission
    - charge.refunded              - Refund, referral clawback
    - charge.dispute.created       - Dispute, referral clawback
```

## Outbound Webhooks

The system can send webhooks to external services (Zapier, custom endpoints).

### Available Events
- `call_ended` - Call completed
- `call_started` - Call began
- `appointment_booked` - New appointment
- `appointment_updated` - Appointment changed
- `lead_created` - New lead from call
- `sms_received` - Inbound SMS

### Webhook Payload
```json
{
  "event": "call_ended",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": { ... }
}
```

### Security
- Optional HMAC signature via `X-Kryonex-Signature` header
- Set secret in webhook config to enable

## SMS Automation

### Post-Call SMS
When enabled, sends follow-up SMS after every completed call:
1. Check `agents.post_call_sms_enabled`
2. Wait `post_call_sms_delay_seconds` (default 60s)
3. Send template with variable substitution
4. Log to `sms_automation_log`

### Review Requests
When appointment status changes to "completed":
1. Check `profiles.review_request_enabled`
2. Wait `review_request_delay_hours` (default 24h)
3. Send template with Google review link
4. Log to `sms_automation_log`

## Ops Infrastructure

### Helper Functions
- `generateIdempotencyKey(payload)` - SHA256 deduplication
- `persistRawWebhook({...})` - Store raw payload
- `markWebhookProcessed(key, result)` - Mark completion
- `isDuplicateEvent(key, table)` - Check duplicates
- `storeCallEvent({...})` - Normalized call storage
- `storeSmsEvent({...})` - Normalized SMS storage
- `sendOutboundWebhook(userId, event, payload)` - Deliver webhooks

### Webhook Flow
1. Raw payload persisted to `webhook_queue`
2. Idempotency check prevents duplicates
3. Unknown numbers stored in `unknown_phone`
4. Normalized events in `call_events`/`sms_events`
5. Outbound webhooks triggered for subscribers

## Rate Limits
- Appointments: 30/min
- Admin quick-onboard: 6/min
- Deploy: 6/min
- Review requests: 10/min

## Logging
- Morgan HTTP request logs
- Structured logs with deploy_request_id, event_id
- Console prefixes: `📞` call, `📱` SMS, `🔗` webhook, `⭐` review, `🔥` error
