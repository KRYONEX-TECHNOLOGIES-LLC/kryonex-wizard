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

Optional for admin-only access:
```
VITE_ADMIN_EMAIL=you@domain.com
# or comma-separated:
VITE_ADMIN_EMAILS=admin1@domain.com,admin2@domain.com
```
The “Access Admin” / Admin Command menu option and admin routes are visible only when `user.role === 'admin'` or the logged-in email matches one of these. See `docs/ADMIN_WORKFLOW.md`.

## Routes
- `/` landing, `/login` auth, `/wizard` onboarding
- `/dashboard` user ops, `/calendar` manifest, `/black-box` logs
- `/billing` billing status and upgrades
- `/admin/*` admin suite (dashboard, leads, logs, financials, users, call center)
  - `/admin/wizard/create` — Admin Client Wizard (includes mini Admin Quick Onboarding box)
  - `/admin/users` — Fleet Registry (newest-first, search, cheat-sheet drawer, quick copy)

## User Wizard Flow (Deployment Wizard v3)
1. **Step 1 — Identity:** Business Name, Area Code, consent. Saves via `/onboarding/identity`.
2. **Step 2 — Plan Selection:** PRO ($249/mo), ELITE ($497/mo), SCALE ($997/mo). CORE is backend-only, not shown.
3. User clicks a plan’s “Select Plan” → Stripe checkout for that plan.
4. After success → redirect to `/dashboard` (agent number, business info, Cal.com CTA).

## Admin-Only UI
- **Admin Client Wizard** (`/admin/wizard/create`): “Admin Quick Onboarding” box — Business Name, Area Code, Email, **Deploy Agent**. No Stripe, no tier picker; calls `POST /admin/quick-onboard`. Stays on page.
- **Fleet Registry** (`/admin/users`): Sort by `created_at` DESC, instant search by business_name / email / area_code, scrollable list, right-side cheat-sheet drawer with Business Name, Email, Tier, Minutes/Texts remaining, Billing Cycle End, Days Remaining, Agent Phone, Cal.com URL, Status. Quick-copy for Business Name, Agent Phone, Cal.com URL, Transfer Number, Retell Agent ID, User ID.
- **Admin menu security:** Admin nav and admin routes require `role === 'admin'` or email in `VITE_ADMIN_EMAIL` / `VITE_ADMIN_EMAILS`. `RequireAdmin.jsx` and `TopMenu.jsx` enforce this.

## State + Persistence
- Wizard state is persisted via `localStorage` keys with `kryonex:` prefix.
- Admin mode toggles by writing `kryonex_admin_mode=admin` (only meaningful if user is already admin or admin-email).

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
- In the user Wizard, “Select Plan” on Step 2 triggers Stripe checkout; after payment, the dashboard shows the agent number and Cal.com CTA.
- The agent selects HVAC vs Plumbing LLM based on the Wizard industry choice (user flow) or defaults for admin quick onboard.
- Inbound SMS is synced into the Messages tab.

## Key Pages
- `src/pages/LandingPage.jsx`
- `src/pages/LoginPage.jsx`
- `src/pages/WizardPage.jsx` — Identity + Plan Selection → Stripe → Dashboard
- `src/pages/DashboardPage.jsx`
- `src/pages/BillingPage.jsx`
- `src/pages/AdminDashboardPage.jsx`
- `src/pages/AdminClientWizardPage.jsx` — full client wizard + **Admin Quick Onboarding** box
- `src/pages/AdminUsersPage.jsx` — Fleet Registry (sort, search, drawer, copy)

## API Layer
`src/lib/api.js` injects Supabase auth tokens into requests. Admin quick onboard uses `adminQuickOnboard()` → `POST /admin/quick-onboard`.
