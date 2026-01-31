# Kryonex Frontend

React + Vite frontend for the Kryonex Wizard platform.

## Setup
```bash
npm install
npm run dev
```

## Environment Variables

Create `frontend/.env`:
```bash
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=...
VITE_API_URL=http://localhost:3000

# Optional: Admin access by email
VITE_ADMIN_EMAIL=admin@domain.com
VITE_ADMIN_EMAILS=admin1@domain.com,admin2@domain.com
```

## Pages Overview

### User Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | LandingGate | Marketing landing or redirect to dashboard |
| `/login` | LoginPage | Auth with referral code capture |
| `/wizard` | WizardPage | Onboarding flow |
| `/dashboard` | DashboardPage | KPIs, activity feed, upsell modal |
| `/leads` | LeadsPage | Lead management with filters |
| `/customers` | CustomersPage | Customer CRM with history |
| `/calendar` | CalendarPage | Appointments with color coding |
| `/messages` | MessagesPage | SMS inbox with quick actions |
| `/black-box` | BlackBoxPage | Call recordings + transcripts |
| `/analytics` | AnalyticsPage | Performance charts |
| `/referrals` | ReferralPage | Referral program dashboard |
| `/integrations` | IntegrationsPage | Webhook/Zapier config |
| `/settings` | SettingsPage | Business + SMS automation settings |
| `/billing` | BillingPage | Subscription management |
| `/billing/tiers` | BillingTiersPage | Plans and top-ups |

### Admin Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/admin/dashboard` | AdminDashboardPage | Platform-wide metrics |
| `/admin/users` | AdminUsersPage | Fleet Registry |
| `/admin/wizard/create` | AdminClientWizardPage | Deploy new clients |
| `/admin/referrals` | AdminReferralsPage | Manage referral payouts |
| `/admin/leads` | AdminLeadsPage | All leads across users |
| `/admin/financials` | AdminFinancialsPage | Revenue telemetry |
| `/admin/logs` | AdminLogsPage | Activity logs |
| `/admin/sellers` | AdminSellersPage | Personnel management |

## Key Components

### UpsellModal
Shows upgrade prompts when user hits 80%+ usage. Features:
- Usage bar with color coding
- Upgrade tier options
- Quick top-up buttons
- 24-hour dismiss functionality

### SideNav
Main navigation sidebar with links to:
- War Room (Dashboard)
- Lead Grid
- Customers (CRM)
- Calendar
- Numbers
- Messages
- Black Box
- Analytics
- Referrals
- Integrations
- Settings

### TopMenu
Top navigation with:
- User status indicators
- Admin/User view toggle
- Logout functionality

## State Management

- Wizard state persisted in `localStorage` with `kryonex:` prefix
- Form data saved to both generic and user-specific keys
- Admin mode toggle: `kryonex_admin_mode`
- Referral code: `kryonex_referral_code`
- Upsell modal dismiss: `kryonex_upsell_modal_dismissed_time`

## API Layer

`src/lib/api.js` provides axios client with Supabase auth injection.

### Key API Functions

```javascript
// Referrals
getReferralCode()
getReferralStats()
getReferralHistory()
requestReferralPayout()
recordReferralSignup(code)

// Customers
getCustomers(params)
getCustomerHistory(phone)

// Webhooks
getWebhooks()
createWebhook(data)
updateWebhook(id, data)
deleteWebhook(id)
testWebhook(id)

// Settings
getSettings()
updateSettings(data)  // Includes SMS automation settings

// Reviews
requestAppointmentReview(appointmentId)
```

## User Wizard Flow

1. **Step 1 — Identity:** Business Name, Area Code, consent
2. **Step 2 — Plan Selection:** PRO/ELITE/SCALE tiers
3. **Stripe Checkout:** Payment processing
4. **Dashboard:** Agent deployed, ready to use

## Admin Features

- **Quick Onboarding:** Deploy clients without Stripe
- **Fleet Registry:** Search, sort, quick-copy client details
- **Referral Control:** Approve/reject payouts, manage settings
- **Revenue Telemetry:** MRR, subscriptions, financial metrics

## Styling

Main styles in `src/styles.css` with:
- Dark futuristic theme
- Neon cyan accent color (`--neon-cyan`)
- Glass morphism effects
- Responsive design

## Build & Deploy

```bash
# Build for production
npm run build

# Preview build
npm run preview
```

Deploy the `dist/` folder to Vercel, Netlify, or any static host.

For `vercel.json`, routes are configured to handle SPA routing.
