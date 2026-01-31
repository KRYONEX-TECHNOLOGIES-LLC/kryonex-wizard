# Kryonex API Server

The backend is a single Express server in `server.js`. It handles agent deployment,
billing, calendar bookings, tracking, webhooks, and admin operations.

## Run
From repo root:
```
npm install
npm start
```

## Environment
Copy `env.template` to `.env` at repo root and fill in the values.
Required keys (high-level):
- Supabase: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, price IDs
- Retell: `RETELL_API_KEY`, `RETELL_LLM_ID_*`, `RETELL_DEMO_AGENT_ID`, `RETELL_WEBHOOK_SECRET`
- URLs: `FRONTEND_URL`, `APP_URL`, `SERVER_URL`
- Admin: `ADMIN_EMAIL` (comma-separated for multiple)

## Auth Model
- Most routes require a Supabase JWT in `Authorization: Bearer <token>`.
- Admin routes use `requireAdmin`: user is allowed if `profiles.role === 'admin'` **or** `req.user.email` matches one of the emails in `ADMIN_EMAIL`. Same logic secures admin-only endpoints.

## Core Endpoints (selection)
- Wizard + onboarding: `POST /onboarding/identity`, `POST /deploy-agent-self`, `POST /consent`
- Dashboard + usage: `GET /api/dashboard/stats`, `GET /usage/status`, `GET /deploy-status`
- Leads: `GET /leads`, `GET /admin/leads`, `POST /leads/update-status`
- Messaging: `GET /messages`, `POST /send-sms`, `POST /webhooks/sms-inbound`
- Calendar: `POST /appointments`, `PUT /appointments/:id`, `DELETE /appointments/:id`
- Tracking: `POST /tracking/create`, `POST /tracking/update`, `GET /tracking/session/:token`
- Billing: `POST /create-checkout-session`, `POST /create-portal-session`,
  `POST /create-topup-session`, `POST /verify-checkout-session`
- Admin ops: `GET /admin/users`, `GET /admin/users/:userId`, `GET /admin/metrics`,
  `GET /admin/health`, `GET /admin/timeseries`, `POST /admin/sync-stripe`
- **Admin quick onboard:** `POST /admin/quick-onboard` — admin-only.
- **Admin create account:** `POST /admin/create-account` — admin-only.
- **Admin Stripe link:** `POST /admin/stripe-link` — admin-only.
- Call center: `GET /admin/dialer-queue`, `POST /admin/dialer-queue`

## Webhooks
- `POST /webhooks/retell-inbound` — Inbound call webhook from Retell. Returns dynamic variables.
- `POST /retell-webhook` (and `/api/retell/webhook`) — Call events (started, ended).
- `POST /webhooks/sms-inbound` — Inbound SMS from Retell.
- `POST /stripe-webhook` — Stripe payment events.

## Ops Infrastructure
The server includes enterprise-grade webhook handling:

### Helper Functions
- `generateIdempotencyKey(payload)` — SHA256 hash for deduplication.
- `persistRawWebhook({...})` — Store raw payload before processing.
- `markWebhookProcessed(key, result)` — Mark success/failure after processing.
- `isDuplicateEvent(key, table)` — Check for duplicate events.
- `storeUnknownPhone({...})` — Store webhooks for unrecognized numbers.
- `storeCallEvent({...})` — Normalized call event storage.
- `storeSmsEvent({...})` — Normalized SMS event storage.
- `createAlert({...})` — Create operational alerts.
- `evaluateUsageThresholds(userId, usage)` — Immediate tier enforcement.

### Webhook Flow
1. Raw payload persisted to `webhook_queue` immediately.
2. Idempotency check prevents duplicate processing.
3. Unknown numbers stored in `unknown_phone` (not dropped).
4. Normalized events stored in `call_events` / `sms_events`.
5. Webhook marked as processed with result.

## Rate Limits
- Appointment routes: 30/min
- Admin quick-onboard: 6/min
- Deploy: 6/min

## Logging
- Morgan logs HTTP requests.
- Structured logs with deploy_request_id, event_id for tracing.
- Console emoji prefixes: `📞` call, `📥` received, `📤` response, `🔥` error.
