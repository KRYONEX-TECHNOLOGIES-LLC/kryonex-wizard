# Kryonex API Server

The backend is a single Express server in `server.js`. It handles agent deployment,
billing, calendar bookings, tracking, and admin operations.

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
- Retell: `RETELL_API_KEY`, `RETELL_LLM_ID_*`, `RETELL_DEMO_AGENT_ID`
- URLs: `FRONTEND_URL`, `APP_URL`, `SERVER_URL`

## Auth Model
- Most routes require a Supabase JWT in `Authorization: Bearer <token>`.
- Admin routes validate an admin profile and/or access code.

## Core Endpoints (selection)
- Wizard + onboarding: `POST /deploy-agent`, `POST /consent`
- Dashboard + usage: `GET /api/dashboard/stats`, `GET /usage/status`
- Leads: `GET /leads`, `GET /admin/leads`, `POST /leads/update-status`
- Messaging: `GET /messages`, `POST /send-sms`, `POST /webhooks/sms-inbound`
- Calendar: `POST /appointments`, `PUT /appointments/:id`, `DELETE /appointments/:id`
- Tracking: `POST /tracking/create`, `POST /tracking/update`, `GET /tracking/session/:token`
- Billing: `POST /create-checkout-session`, `POST /create-portal-session`,
  `POST /create-topup-session`, `POST /verify-checkout-session`
- Admin ops: `GET /admin/users`, `GET /admin/users/:id`, `GET /admin/metrics`,
  `GET /admin/health`, `GET /admin/timeseries`, `POST /admin/sync-stripe`
- Call center: `GET /admin/dialer-queue`, `POST /admin/dialer-queue`
- Webhooks: `POST /retell-webhook` (and `/api/retell/webhook`)

## Rate Limits
Appointment create/update routes use an in-memory rate limiter (30/min).

## Logging
Morgan logs requests to stdout; errors return JSON `{ error }`.
