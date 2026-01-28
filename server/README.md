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
- Admin: `ADMIN_EMAIL` (comma-separated for multiple)

## Auth Model
- Most routes require a Supabase JWT in `Authorization: Bearer <token>`.
- Admin routes use `requireAdmin`: user is allowed if `profiles.role === 'admin'` **or** `req.user.email` matches one of the emails in `ADMIN_EMAIL`. Same logic secures admin-only endpoints.

## Core Endpoints (selection)
- Wizard + onboarding: `POST /onboarding/identity`, `POST /deploy-agent`, `POST /consent`
- Dashboard + usage: `GET /api/dashboard/stats`, `GET /usage/status`
- Leads: `GET /leads`, `GET /admin/leads`, `POST /leads/update-status`
- Messaging: `GET /messages`, `POST /send-sms`, `POST /webhooks/sms-inbound`
- Calendar: `POST /appointments`, `PUT /appointments/:id`, `DELETE /appointments/:id`
- Tracking: `POST /tracking/create`, `POST /tracking/update`, `GET /tracking/session/:token`
- Billing: `POST /create-checkout-session`, `POST /create-portal-session`,
  `POST /create-topup-session`, `POST /verify-checkout-session`
- Admin ops: `GET /admin/users`, `GET /admin/users/:userId`, `GET /admin/metrics`,
  `GET /admin/health`, `GET /admin/timeseries`, `POST /admin/sync-stripe`
- **Admin quick onboard:** `POST /admin/quick-onboard` — admin-only. Body: `{ businessName, areaCode, email }`. Creates/finds user by email, saves business_name + area_code + email to profiles, sets Core tier, initializes usage_limits, creates Retell agent, sets `admin_onboarded`. No Stripe. See `docs/ADMIN_WORKFLOW.md`.
- **Admin create account:** `POST /admin/create-account` — admin-only. Body: `{ email, password }`. Creates a real user with temp password and `role=owner`.
- **Admin Stripe link:** `POST /admin/stripe-link` — admin-only. Body: `{ planTier: "pro" | "elite" | "scale" }`. Returns a checkout URL using existing Stripe price IDs.
- Call center: `GET /admin/dialer-queue`, `POST /admin/dialer-queue`
- Webhooks: `POST /retell-webhook` (and `/api/retell/webhook`)

## Rate Limits
Appointment create/update routes use an in-memory rate limiter (30/min). Admin quick-onboard is rate-limited (e.g. 6/min).

## Logging
Morgan logs requests to stdout; errors return JSON `{ error }`.
