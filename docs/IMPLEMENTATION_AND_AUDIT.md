# Implementation Summary & Feature Audit

## SECTION 1 — ADMIN VIEW / USER VIEW BUTTONS IN DROPDOWN

**Summary:** Added explicit "Admin view" and "User view" options in the header dropdown (TopMenu). "Admin view" appears only when the user can access admin (`canAccessAdmin`). "User view" appears in the same block so admins can switch to the user dashboard. Clicking "Admin view" sets `kryonex_admin_mode` to `admin` and navigates to `/admin/dashboard`. Clicking "User view" sets it to `user` and navigates to `/dashboard`. "Exit Impersonation" remains when impersonating. AdminModeToggle was removed from the dropdown and replaced with these two buttons. No routing changes; `App.jsx` already defines the routes.

**Files modified:**
- `frontend/src/components/TopMenu.jsx`
- `frontend/src/styles.css` (added `.top-menu-item-button` and `.top-menu-item-button:hover`)

---

## SECTION 2 — ADMIN FREE NAVIGATION

**Summary:** Added a "Billing & Top-Ups" link under the admin section in SideNav pointing to `/billing/tiers`, so admins can reach plans and top-ups from admin view. All other admin links (Fleet Registry, Client Wizard, Live Dialer, Personnel, Sales Floor Activity, Final Logs, Revenue Telemetry) were already present. Routing in `App.jsx` already allows admins to access all admin routes via `RequireAdmin`; no route changes were made. Impersonation entry is from Fleet Registry user drawer ("Impersonate"); exit is via "Exit Impersonation" in the dropdown.

**Files modified:**
- `frontend/src/components/SideNav.jsx`

---

## SECTION 3 — TOP-UP PRICES ON PLANS PAGE + TOP-UPS PAGE

**Summary:** Introduced a single source of truth for top-up pricing in `frontend/src/lib/billingConstants.js` as `TOP_UPS` (id, name, description, priceLabel, call_minutes, sms_count). BillingTiersPage and BillingPage now import and use `TOP_UPS` from that file. On the Tiers page, each tier card shows a "Top-ups:" line listing all top-up options and prices from `TOP_UPS`. The Top-Ups section on the same page and the Prepaid Top-Ups section on BillingPage both render from `TOP_UPS`. No hardcoded duplicate values.

**Files modified:**
- `frontend/src/lib/billingConstants.js` (added `TOP_UPS`)
- `frontend/src/pages/BillingTiersPage.jsx` (import `TOP_UPS`, use for tier top-up line and top-up cards)
- `frontend/src/pages/BillingPage.jsx` (import `TOP_UPS`, map over it for top-up buttons)

---

## SECTION 4 — AUDIT & CRITICAL FEATURES

### A) Impersonation

**Where it lives:**
- **Start:** `frontend/src/pages/AdminUsersPage.jsx` — `startImpersonation()` calls `logImpersonationStart(userId)`, `setImpersonation(userId)` from `frontend/src/lib/impersonation.js`, then `navigate("/dashboard")`.
- **End:** `frontend/src/components/TopMenu.jsx` — "Exit Impersonation" button calls `handleExitImpersonation()` which calls `logImpersonationEnd(userId)`, `clearImpersonation()`, then navigates to `/admin/users` or `/dashboard`.
- **State:** `frontend/src/lib/impersonation.js` — `getImpersonation()`, `setImpersonation(userId)`, `clearImpersonation()`, persisted in `localStorage` (`kryonex_impersonation_mode`, `kryonex_impersonated_user_id`), synced via event `kryonex-impersonation-change`.
- **API:** `frontend/src/lib/api.js` — request interceptor sends `X-Impersonation-Mode: "true"` and `X-Impersonated-User-ID` when impersonation is active. `logImpersonationStart(userId)` → `POST /admin/impersonation/start`, `logImpersonationEnd(userId)` → `POST /admin/impersonation/end`.
- **Backend:** `server.js` — `resolveEffectiveUser` middleware sets `req.effectiveUserId` from headers when requester is admin; `POST /admin/impersonation/start` and `POST /admin/impersonation/end` log to audit and console.

**Key files:** `frontend/src/lib/impersonation.js`, `frontend/src/components/TopMenu.jsx`, `frontend/src/pages/AdminUsersPage.jsx`, `frontend/src/lib/api.js`, `server.js` (resolveEffectiveUser, /admin/impersonation/start, /admin/impersonation/end).

---

### B) Usage metering

**Where it lives:**
- **Model/schema:** Backend uses table `usage_limits` (user_id, call_cap_seconds, sms_cap, call_used_seconds, sms_used, period_start, period_end, limit_state, grace_seconds, call_credit_seconds, sms_credit, rollover_seconds, etc.). No frontend schema file; server reads/writes via Supabase.
- **Ensure limits:** `server.js` — `ensureUsageLimits({ userId, planType, periodEnd })` creates or returns one row per user; `refreshUsagePeriod(usage, planType, periodEnd)` rolls over period and resets usage when period ends.
- **Increment usage:** Call usage: Retell webhook and call-related handlers update `usage_limits.call_used_seconds`. SMS: `sendSmsInternal` calls `ensureUsageLimits` then checks caps; after sending, backend increments SMS usage (e.g. in usage_limits or messages insert). Top-up application in Stripe webhook increases `call_cap_seconds` and `sms_cap`.
- **Check usage:** `server.js` — `GET /usage/status` uses `resolveEffectiveUser`, then `ensureUsageLimits` and `refreshUsagePeriod`, then `getUsageRemaining(usage)`; returns `call_minutes_remaining`, `call_minutes_total`, `sms_remaining`, `sms_total`, `limit_state`. No separate cron; usage is checked on each relevant API call (send-sms, call flow, usage/status).

**Key files:** `server.js` (ensureUsageLimits, refreshUsagePeriod, getUsageRemaining, sendSmsInternal, /usage/status, Stripe webhook top-up and subscription handling).

---

### C) Hard-stop guardrails

**Where it lives:**
- **Check cap:** In `sendSmsInternal` (`server.js`): after `ensureUsageLimits` and `refreshUsagePeriod`, if `!bypassUsage && usage.limit_state === "paused"` throws "Usage limit reached". If `newSmsUsed > smsCap` (and not bypass), sets `limit_state: "paused"` on `usage_limits`, then throws error with `err.code = "USAGE_CAP_REACHED"`.
- **Enforce hard stop:** Same path blocks the SMS send and returns 402 with `USAGE_CAP_REACHED` to the client. Call flow similarly checks `usage.call_cap_seconds` and `limit_state` before allowing calls; when over cap, state is set to paused and further use is blocked.

**Key files:** `server.js` (sendSmsInternal, call initiation logic that calls ensureUsageLimits and checks limit_state / cap).

---

### D) Top-ups logic

**Where it lives:**
- **Model/schema:** No separate top-up table. Top-up application updates `usage_limits`: increases `call_cap_seconds` and/or `sms_cap` for the user. Stripe checkout session metadata carries `user_id`, `extra_minutes`, `extra_sms`, `topup_type`.
- **Apply top-up:** `server.js` — Stripe webhook `checkout.session.completed` when `session.metadata?.type === "topup"`: reads `user_id`, `extra_minutes`, `extra_sms` from metadata, loads or creates `usage_limits` row, then updates it with new `call_cap_seconds` and `sms_cap`, sets `limit_state: "ok"`.
- **UI trigger:** `frontend/src/pages/BillingTiersPage.jsx` and `frontend/src/pages/BillingPage.jsx` call `createTopupSession({ topupType, ... })` which hits `POST /create-topup-session`; backend creates Stripe Checkout session with metadata; user pays and webhook applies the top-up.

**Key files:** `server.js` (topupPriceMap, Stripe webhook topup block, POST /create-topup-session), `frontend/src/lib/billingConstants.js` (TOP_UPS), `frontend/src/pages/BillingTiersPage.jsx`, `frontend/src/pages/BillingPage.jsx`.

---

### E) Admin tools / admin dashboard

**Where it lives:**
- **Main admin dashboard:** `frontend/src/pages/AdminDashboardPage.jsx` — command map, widgets, admin overview. Wrapped by `RequireAdmin` in `App.jsx`.
- **APIs for admin data:** `server.js` — e.g. `GET /admin/users`, `GET /admin/users/:id`, `GET /admin/metrics`, `GET /admin/health`, `GET /admin/audit-logs`, `GET /admin/timeseries`, etc., all behind `requireAdmin` middleware. Frontend calls them via `frontend/src/lib/api.js` (getAdminUsers, getAdminUserProfile, getAdminMetrics, getAuditLogs, etc.).

**Key files:** `frontend/src/pages/AdminDashboardPage.jsx`, `frontend/src/App.jsx` (routes with RequireAdmin), `frontend/src/lib/api.js`, `server.js` (admin routes and requireAdmin).

---

### F) Onboarding flow / wizard

**Where it lives:**
- **UI:** `frontend/src/pages/WizardPage.jsx` — multi-step wizard (business name, area code, industry, etc.). `frontend/src/components/RequireOnboarding.jsx` redirects to `/wizard` if profile incomplete (unless admin in admin or user mode).
- **Backend on complete:** `server.js` — `POST /onboarding/identity` saves `business_name`, `area_code` to `profiles`. Subscription and usage are created via Stripe checkout completion (subscription creation) and `ensureUsageLimits` when first needed. Tenant/user is created at sign-up (Supabase Auth); profile and subscription are created/updated by onboarding and Stripe webhooks. Initial usage caps come from `planConfig(planType)` in `ensureUsageLimits` when the first subscription period is set.

**Key files:** `frontend/src/pages/WizardPage.jsx`, `frontend/src/components/RequireOnboarding.jsx`, `server.js` (POST /onboarding/identity, Stripe subscription creation in webhook, ensureUsageLimits).

---

### G) Stripe / billing metadata

**Where it lives:**
- **Checkout (subscription):** `server.js` — `POST /create-checkout-session` (with `resolveEffectiveUser`) creates Stripe session with `client_reference_id: uid`, `metadata: { user_id, email, planTier, plan_type, minutesCap, smsCap }`.
- **Checkout (top-up):** `POST /create-topup-session` creates payment session with `metadata: { type: "topup", user_id, call_seconds, sms_count, topup_type, extra_minutes, extra_sms }`.
- **Webhooks:** `server.js` — Stripe webhook handles `checkout.session.completed`. For subscription: retrieves subscription, gets `user_id` from `metadata.user_id` or `client_reference_id`, upserts `subscriptions` and updates profile. For top-up: reads `user_id`, `extra_minutes`, `extra_sms` from metadata, applies to `usage_limits`.
- **Portal:** `POST /create-portal-session` uses `req.effectiveUserId` to look up subscription by `user_id` and creates Stripe billing portal session. Metadata is set at checkout and read in the webhook; no separate metadata read for portal.

**Key files:** `server.js` (create-checkout-session, create-topup-session, create-portal-session, Stripe webhook handler).
