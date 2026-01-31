# Kryonex Wizard

Kryonex Wizard is a full-stack app for onboarding, deploying, and managing AI call agents,
with an admin control plane, calendar booking, live tracking, billing flows, and ops infrastructure.

## Architecture
- `frontend/`: Vite + React UI for user and admin portals.
- `server.js`: Express API server for Retell, Stripe, messaging, webhooks, and data orchestration.
- `supabase/`: SQL schema, migrations, and RLS policies for Supabase storage.
- `cypress/`: End-to-end tests (smoke + wizard matrix).
- `scripts/`: Utility scripts for API checks, test users, and webhook simulation.
- `docs/`: Admin workflow, ops checklist, and feature docs.

## Quick Start
1) Install deps:
```
npm install
cd frontend
npm install
```

2) Configure env:
- Copy `env.template` to `.env` at repo root and fill values.
- Create `frontend/.env` with:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_API_URL=http://localhost:3000
```

3) Run backend API:
```
npm start
```

4) Run frontend UI (new terminal):
```
cd frontend
npm run dev
```

## Key Flows

### User Wizard (Deployment Wizard v3)
- **Step 1 — Identity:** Business Name, Area Code, consent. Saves identity via `/onboarding/identity`.
- **Step 2 — Plan Selection:** PRO ($249/mo), ELITE ($497/mo), SCALE ($997/mo). CORE is backend-only.
- **Stripe:** After plan choice, user goes to Stripe checkout for that plan.
- **Dashboard:** Shown after successful payment (agent number, business info, Cal.com CTA).
- Wizard state is persisted in localStorage and via backend.

### Admin-Only Flows
- **Mini Admin Onboarding:** On Admin Client Wizard (`/admin/wizard/create`), a small “Admin Quick Onboarding” box lets admins deploy a client with Business Name + Area Code + Email and **Deploy Agent**. No Stripe, no tier picker; creates/finds user, saves identity, sets Core tier, initializes usage limits, creates Retell agent, marks `admin_onboarded`. See `docs/ADMIN_WORKFLOW.md`.
- **Admin menu:** “Admin Command” link and ADMIN COMMAND / USER VIEW buttons are visible only when `user.role === 'admin'` or the logged-in email matches `VITE_ADMIN_EMAIL` / `VITE_ADMIN_EMAILS`. Route guard enforces the same.
- **Admin user dashboard access:** Admins (by role or env email) can open the user dashboard, billing, calendar, etc., **without** completing the wizard or having an agent. They are not redirected to wizard step 1 when using “User view” or dashboard.
- **Landing (“/”):** Logged-in users who already have an agent, or any admin, are sent to `/dashboard`; others see the marketing landing. No screen glitch.
- **Fleet Registry:** `/admin/users` — newest-first sort, instant search (business, email, area code), scrollable list, right-side cheat-sheet drawer with summary and quick-copy for Business Name, Agent Phone, Cal.com URL, Transfer Number, Retell Agent ID, User ID.

### Other Flows
- Calendar bookings write to Supabase and trigger email alerts.
- Admin tools pull global fleet data, leads, logs, and financials.

## Tests
```
npm run test:e2e
```

Common env vars for Cypress:
- `CYPRESS_TEST_EMAIL`, `CYPRESS_TEST_PASSWORD`
- `CYPRESS_SUPABASE_URL`, `CYPRESS_SUPABASE_ANON_KEY`
- `MATRIX_LIMIT` (e.g. `1000` for full sweep)

## Scripts
- `npm run test:api` runs `scripts/api-check.js`
- `npm run seed:test-user` runs `scripts/create-test-user.js`

## Docs
- **`docs/HANDOFF.md`** — Full handoff for new devs/AI (start here).
- `docs/README.md` — Index of feature docs.
- `docs/ADMIN_WORKFLOW.md` — Admin mini onboarding, Fleet Registry, and admin menu security.
- `docs/OPS_CHECKLIST.md` — Ops infrastructure implementation status and testing checklist.
- `docs/AGENT_PROMPT_GRACE.md` — Grace AI agent prompt with dynamic variables.

## Ops Infrastructure
The system includes enterprise-grade webhook handling and event storage:
- **Raw webhook persistence** — All webhooks stored before processing for replay/audit.
- **Idempotency** — SHA256-based deduplication prevents double-counting.
- **Event storage** — `call_events` and `sms_events` tables with normalized fields.
- **Unknown phone handling** — Webhooks for unrecognized numbers stored, not dropped.
- **Usage enforcement** — Soft/hard thresholds with immediate blocking.
- **Alerting** — Operational alerts for usage warnings, blocks, and failures.

See `supabase/ops_infrastructure.sql` for the full schema.

## Notes
- Do not commit real secrets (`.env` files are gitignored).
- Retell/Stripe webhooks require a public `SERVER_URL`.
- Run `supabase/ops_infrastructure.sql` in Supabase SQL Editor to create ops tables.
