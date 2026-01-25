# Kryonex Wizard

Kryonex Wizard is a full-stack app for onboarding, deploying, and managing AI call agents,
with an admin control plane, calendar booking, live tracking, and billing flows.

## Architecture
- `frontend/`: Vite + React UI for user and admin portals.
- `server.js`: Express API server for Retell, Stripe, messaging, and data orchestration.
- `supabase/`: SQL schema and RLS notes for Supabase storage.
- `cypress/`: End-to-end tests (smoke + wizard matrix).
- `scripts/`: Utility scripts for API checks and test user provisioning.

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
- Wizard onboarding persists state in localStorage and deploys Retell agents.
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

## Notes
- Do not commit real secrets.
- Retell/Stripe webhooks require a public `SERVER_URL`.
