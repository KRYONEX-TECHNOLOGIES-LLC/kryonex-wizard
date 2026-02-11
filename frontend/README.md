# Kryonex Frontend

React + Vite frontend for the Kryonex Wizard platform. This is a modern, responsive SPA with a dark futuristic theme, supporting both user and admin portals.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Environment Variables](#environment-variables)
3. [Architecture](#architecture)
4. [Pages Overview](#pages-overview)
5. [Key Components](#key-components)
6. [State Management](#state-management)
7. [API Layer](#api-layer)
8. [Styling](#styling)
9. [Build & Deploy](#build--deploy)

---

## Quick Start

```bash
# Install dependencies
npm install

# Start development server (port 5173)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

---

## Environment Variables

Create `frontend/.env`:

```bash
# Required
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...                 # Public anon key (safe to expose)
VITE_API_URL=http://localhost:3000             # Backend API URL

# Optional: Admin access by email
VITE_ADMIN_EMAIL=admin@domain.com
VITE_ADMIN_EMAILS=admin1@domain.com,admin2@domain.com

# Optional: AI Helper UI toggle
# - default: enabled (unless explicitly set to false)
VITE_ASSISTANT_ENABLED=true
```

---

## Architecture

```
frontend/
├── src/
│   ├── main.jsx              # React entry point
│   ├── App.jsx               # React Router configuration
│   ├── styles.css            # Global styles (dark theme)
│   ├── pages/                # All page components
│   │   ├── WizardPage.jsx    # 5-step onboarding wizard
│   │   ├── DashboardPage.jsx # User dashboard with ROI
│   │   ├── LeadsPage.jsx     # Lead management
│   │   ├── AdminOpsPage.jsx  # Operations dashboard
│   │   └── ...               # 30+ page components
│   ├── components/           # Reusable UI components
│   │   ├── SideNav.jsx       # Main navigation sidebar
│   │   ├── TopMenu.jsx       # Top navigation bar
│   │   ├── UpsellModal.jsx   # Usage-based upgrade prompts
│   │   ├── ROIDashboard.jsx  # ROI metrics component
│   │   └── ...
│   └── lib/                  # Utilities and API client
│       ├── api.js            # Axios client with auth
│       ├── phone.js          # E.164 phone normalization
│       ├── persistence.js    # localStorage helpers
│       ├── supabase.js       # Supabase client
│       └── wizardConstants.js # Wizard configuration
├── index.html
├── vite.config.js
├── vercel.json               # Vercel SPA routing config
└── package.json
```

---

## Pages Overview

### User Portal

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | LandingGate | Marketing landing or redirect to dashboard |
| `/login` | LoginPage | Auth with referral code capture |
| `/wizard` | WizardPage | 5-step onboarding flow |
| `/dashboard` | DashboardPage | KPIs, activity feed, ROI dashboard |
| `/leads` | LeadsPage | Lead management with filters, export |
| `/customers` | CustomersPage | CRM with full customer history by phone |
| `/calendar` | CalendarPage | Appointments with color-coded status |
| `/messages` | MessagesPage | SMS inbox with threading |
| `/black-box` | BlackBoxPage | Call recordings with waveform visualization |
| `/analytics` | AnalyticsPage | Performance charts and trends |
| `/referrals` | ReferralPage | Referral program dashboard |
| `/integrations` | IntegrationsPage | Webhook/Zapier configuration |
| `/settings` | SettingsPage | Business settings, SMS automation |
| `/billing` | BillingPage | Subscription management |
| `/billing/tiers` | BillingTiersPage | Plans and top-ups |
| `/tracking/:jobId` | TrackingSharePage | Public technician tracking |

### Admin Portal

| Route | Component | Description |
|-------|-----------|-------------|
| `/admin/dashboard` | AdminDashboardPage | Platform-wide metrics |
| `/admin/users` | AdminUsersPage | Fleet Registry (all users) |
| `/admin/wizard/create` | AdminClientWizardPage | Deploy new clients manually |
| `/admin/referrals` | AdminReferralsPage | Approve/reject payouts |
| `/admin/leads` | AdminLeadsPage | All leads across platform |
| `/admin/messages` | AdminMessagesPage | All SMS conversations |
| `/admin/call-center` | AdminCallCenterPage | Real-time call monitoring |
| `/admin/black-box` | AdminBlackBoxPage | All call recordings |
| `/admin/financials` | AdminFinancialsPage | Revenue telemetry (MRR, churn) |
| `/admin/ops` | AdminOpsPage | Errors, alerts, webhooks, reconciliation |
| `/admin/logs` | AdminLogsPage | Activity logs |
| `/admin/sellers` | AdminSellersPage | Personnel management |

---

## Key Components

### WizardPage
The 5-step onboarding wizard:
1. **Identity** - Business name, area code, consent
2. **Plan Selection** - PRO/ELITE/SCALE tiers
3. **Stripe Checkout** - Payment processing
4. **Communications** - SMS templates, business hours (skippable)
5. **Deploy** - Agent deployment confirmation

### DashboardPage
User's main dashboard with:
- Real-time stats (calls, leads, bookings)
- Activity feed with recent events
- ROI Dashboard component
- Smart upgrade prompts at 80% usage
- Live clock and status indicators

### AdminOpsPage
Operations dashboard with tabs:
- **Errors** - Unresolved errors with resolution
- **Alerts** - Operational alerts (usage, failures)
- **Churn Risk** - Users at risk of churning
- **Health Overview** - Customer health score distribution
- **Webhook Queue** - Pending/failed webhooks with replay
- **Reconciliation** - Usage reconciliation history

### UpsellModal
Triggered when user hits 80%+ usage:
- Usage bar with color coding
- Upgrade tier options
- Quick top-up buttons
- 24-hour dismiss functionality

### SideNav
Main navigation sidebar with links to all user pages.
Shows different menu for admin vs user role.

### ROIDashboard
Revenue tracking component showing:
- Total revenue attributed to AI
- Booking rate percentage
- Call-to-appointment conversion

---

## State Management

### localStorage Keys (prefixed with `kryonex:`)

| Key | Purpose |
|-----|---------|
| `kryonex:wizard.step` | Current wizard step |
| `kryonex:wizard.form` | Generic form data |
| `kryonex:wizard.form.{userId}` | User-specific form data |
| `kryonex_admin_mode` | Admin view toggle |
| `kryonex_referral_code` | Captured referral code |
| `kryonex_upsell_modal_dismissed_time` | Upsell modal dismiss timestamp |
| `kryonex_sms_banner_dismissed` | SMS feature banner dismiss |

### Why Two Form Keys?
The wizard saves form data to both generic and user-specific keys because:
1. Before auth, we don't know userId
2. After Stripe redirect, we need to restore user's data
3. User-specific key ensures data persists across sessions

---

## API Layer

The API client (`src/lib/api.js`) provides:
- Axios instance with automatic Supabase auth token injection
- Global response interceptor for error handling
- User-friendly error messages based on status code
- Auto-redirect to login on 401

### Error Handling

All API errors are transformed with:
```javascript
{
  userMessage: "User-friendly error message",
  statusCode: 500,
  isNetworkError: false,
  isAuthError: false,
  isServerError: true
}
```

### Key API Functions

```javascript
// Dashboard
getStats()
getEnhancedStats()
getUsageStatus()

// Leads
getLeads()
createLead(data)
updateLead(id, data)

// Appointments
getAppointments()
createAppointment(data)
updateAppointment(id, data)

// Messages
getMessages()
sendSms({ to, message })

// Referrals
getReferralCode()
getReferralStats()
getReferralHistory()
requestReferralPayout()

// Webhooks
getWebhooks()
createWebhook(data)
testWebhook(id)
getWebhookDeliveries(id)

// Admin Ops
getAdminErrorLogs(params)
resolveErrorLog(id)
getAdminOpsAlerts(params)
getWebhookQueue(params)
replayWebhook(queueId)
getReconciliationRuns(params)
triggerReconciliation()
```

---

## Styling

### Theme

- **Dark futuristic theme** with neon cyan accent (`#00ffff`)
- **Glass morphism** effects on cards and modals
- **Responsive design** - works on desktop, tablet, mobile
- **CSS custom properties** for consistent theming

### Key CSS Variables

```css
:root {
  --neon-cyan: #00ffff;
  --bg-dark: #0a0a0a;
  --bg-card: rgba(20, 20, 30, 0.8);
  --text-primary: #e0e0e0;
  --text-secondary: #888;
  --border-color: rgba(0, 255, 255, 0.2);
}
```

### Responsive Breakpoints

- Mobile: < 768px (stacked layouts, hamburger menu)
- Tablet: 768px - 1024px
- Desktop: > 1024px

---

## Build & Deploy

### Development

```bash
npm run dev
# Starts Vite dev server on http://localhost:5173
```

### Production Build

```bash
npm run build
# Outputs to dist/ folder
```

### Deploy to Vercel

1. Connect GitHub repository
2. Set build command: `cd frontend && npm run build`
3. Set output directory: `frontend/dist`
4. Add environment variables
5. Deploy

### vercel.json

The `vercel.json` file configures SPA routing so all routes serve `index.html`:

```json
{
  "routes": [
    { "handle": "filesystem" },
    { "src": "/(.*)", "dest": "/index.html" }
  ]
}
```

---

## Phone Number Normalization

The `lib/phone.js` module provides E.164 phone normalization:

```javascript
import { normalizePhoneE164 } from './lib/phone';

// Normalizes to +1XXXXXXXXXX format
normalizePhoneE164("5551234567")   // → "+15551234567"
normalizePhoneE164("(555) 123-4567") // → "+15551234567"
```

All phone inputs use `onBlur={e => e.target.value = normalizePhoneE164(e.target.value)}` for automatic formatting.

---

## Testing

See `cypress/README.md` for E2E testing documentation.

```bash
# From root directory
npm run test:e2e
```

---

## Troubleshooting

### Common Issues

1. **"Session expired" redirect loop**
   - Clear localStorage: `localStorage.clear()`
   - Log in again

2. **API calls failing with 401**
   - Check `VITE_API_URL` is correct
   - Verify Supabase session is valid

3. **Admin pages not showing**
   - Verify email matches `VITE_ADMIN_EMAIL`
   - Check `profiles.role = 'admin'` in database

4. **Wizard form data lost after Stripe**
   - Form should restore from `kryonex:wizard.form.{userId}`
   - Check browser console for localStorage errors
