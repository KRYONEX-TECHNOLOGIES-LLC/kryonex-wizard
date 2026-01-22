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
```

## Key Pages
- `src/pages/LandingPage.jsx`
- `src/pages/LoginPage.jsx`
- `src/pages/WizardPage.jsx`
- `src/pages/DashboardPage.jsx`
- `src/pages/BillingPage.jsx`
- `src/pages/AdminDashboardPage.jsx`

## API Layer
`src/lib/api.js` injects Supabase auth tokens into requests.
