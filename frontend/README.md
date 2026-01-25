# Kryonex Frontend

## Setup
```
npm install
npm run dev
```

## Env
Create `frontend/.env`:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_API_URL=http://localhost:3000
```

## Routes
- `/` landing, `/login` auth, `/wizard` onboarding
- `/dashboard` user ops, `/calendar` manifest, `/black-box` logs
- `/billing` billing status and upgrades
- `/admin/*` admin suite (dashboard, leads, logs, financials, users, call center)

## State + Persistence
- Wizard state is persisted via `localStorage` keys with `kryonex:` prefix.
- Admin mode toggles by writing `kryonex_admin_mode=admin`.

## Retell + Webhooks (Backend)
Retell webhooks must point to your public backend URL (Railway, etc).
Set this in the backend `.env`:
```
SERVER_URL=https://your-railway-service.up.railway.app
```
Required webhook routes:
- `POST /retell-webhook`
- `POST /webhooks/sms-inbound`

## Deploy Notes
- “Activate” in the Wizard deploys the Retell agent and provisions an SMS-enabled number.
- The agent selects HVAC vs Plumbing LLM based on the Wizard industry choice.
- Inbound SMS is synced into the Messages tab.

## Key Pages
- `src/pages/LandingPage.jsx`
- `src/pages/LoginPage.jsx`
- `src/pages/WizardPage.jsx`
- `src/pages/DashboardPage.jsx`
- `src/pages/BillingPage.jsx`
- `src/pages/AdminDashboardPage.jsx`

## API Layer
`src/lib/api.js` injects Supabase auth tokens into requests.
