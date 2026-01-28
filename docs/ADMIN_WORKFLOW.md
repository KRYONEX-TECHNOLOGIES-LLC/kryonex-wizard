# Admin Workflow

Admin-only features for fast manual onboarding, Fleet Registry, and secure admin access.

## Admin Menu Security

The “Access Admin” / Admin Command menu option is **visible and usable only** when:

- `user.role === 'admin'` (profile in Supabase), **or**
- The logged-in user’s email matches one of the configured admin emails.

### Configuration

**Backend** (`.env` at repo root):

```
ADMIN_EMAIL=you@domain.com
# or multiple (comma-separated):
ADMIN_EMAIL=admin1@domain.com,admin2@domain.com
```

`requireAdmin` allows a request if the user’s profile has `role === 'admin'` or their email is in `ADMIN_EMAIL`.

**Frontend** (`frontend/.env`):

```
VITE_ADMIN_EMAIL=you@domain.com
# or:
VITE_ADMIN_EMAILS=admin1@domain.com,admin2@domain.com
```

The menu and `RequireAdmin` use this to show/hide the Admin link and to gate admin routes. Non-admins never see the option and cannot reach `/admin/*` even by URL.

---

## Admin Client Wizard — 3 Tools

**Where:** `/admin/wizard/create`

The Admin Client Wizard is now a compact control panel with **three mini tools** in separate boxes. No multi-step flow, no preview panels.

### Tool 1 — Mini Onboarding Wizard

Fast manual onboarding for real clients (no Stripe, no tier picker).

**Fields**

| Field         | Required | Notes                                |
|---------------|----------|--------------------------------------|
| Business Name | Yes      | 2–80 chars                           |
| Area Code     | Yes      | Exactly 3 digits                     |
| Email         | Yes      | Real email (used to find or create user) |

**Button**

**Deploy Agent**

**Behavior**

- **User:** Created via Supabase Auth if the email does not exist; otherwise the existing user is used.
- **Profile:** `business_name`, `area_code`, and identity are saved. `admin_onboarded` (and `admin_onboarded_at`) are set.
- **Tier:** Core is applied (no Stripe). Subscription + usage limits are initialized.
- **Retell:** Same backend logic as the normal wizard — Retell agent is created, phone number provisioned, agent linked to the user.
- **Redirect:** None. Stays on page; success shows user id and agent phone.

**API**

`POST /admin/quick-onboard` (admin-only, rate-limited).

Body:

```json
{
  "businessName": "Acme HVAC",
  "areaCode": "419",
  "email": "client@example.com"
}
```

Response:

```json
{
  "ok": true,
  "user_id": "uuid",
  "agent_id": "retell_agent_id",
  "phone_number": "+1..."
}
```

### Tool 2 — Mini Sign‑Up Box (real users)

Create a real user with a temporary password.

**Fields**

| Field          | Required | Notes                      |
|----------------|----------|---------------------------|
| Email          | Yes      | Real user email           |
| Temp Password  | Yes      | 8+ characters             |

**Button**

**Create Account**

**Behavior**

- Creates a real user account (no trial or temp flags)
- Saves to `profiles` with `role = owner`
- User can reset password via normal flow later

**API**

`POST /admin/create-account`

Body:

```json
{
  "email": "client@example.com",
  "password": "TempPassword123"
}
```

### Tool 3 — Tier Picker + Stripe Link

Generate a Stripe checkout link for a specific client and tier.

**Fields**

| Field         | Required | Notes                    |
|---------------|----------|--------------------------|
| Client Email  | Yes      | Must exist in auth.users |
| Tier          | Yes      | Pro / Elite / Scale      |

**Button**

**Generate Stripe Link**

**Behavior**

- Validates email and tier; looks up user by email (case-insensitive)
- If no user found: 404 `USER_NOT_FOUND`
- Creates a Stripe Checkout Session with rich metadata (user_id, email, planTier, minutesCap, smsCap)
- Returns `{ url }`; show in read-only input with Copy button

**API**

`POST /admin/stripe-link`

Body:

```json
{
  "email": "client@example.com",
  "planTier": "pro"
}
```

Response: `{ "url": "https://checkout.stripe.com/..." }`. Errors: 400 validation, 404 USER_NOT_FOUND, 500 config/ internal.

---

## Fleet Registry

**Where:** `/admin/users` (Fleet Registry / System Users)

### Sorting

- **Newest first:** List is ordered by `created_at` descending.

### Search

- **Instant:** Filters as you type, from the first character.
- **Fields:** `business_name`, `email`, `area_code` (case-insensitive, substring).

### List

- **Scrollable:** Left-side list has a max height and smooth scrolling so you can move through many users without leaving the page.

### Cheat-Sheet Drawer

Clicking a user in the list opens a **right-side drawer** with:

| Field                 | Description                    |
|-----------------------|--------------------------------|
| Business Name         | From profile                   |
| Email                 | Auth email                     |
| Tier                  | Plan type (e.g. Core, Pro)     |
| Minutes Remaining     | Call minutes left             |
| Texts Remaining       | SMS left                       |
| Billing Cycle End     | End of current period         |
| Days Remaining        | Days left in cycle            |
| Agent Phone Number    | Retell-provisioned number     |
| Cal.com URL           | If set                         |
| Status                | Pending Setup / Live / Payment Failed / Low Minutes |

### Quick Copy Buttons

In the drawer, copy buttons are provided for:

- Business Name  
- Agent Phone Number  
- Cal.com URL  
- Transfer Number (if present)  
- Retell Agent ID  
- User ID  

Same style as the rest of the Fleet Registry UI; no new design system.

---

## What Stays Unchanged

These flows and systems are **not** modified by the admin workflow:

- User-facing Deployment Wizard (Identity → Plan Selection → Stripe → Dashboard).
- Stripe checkout, webhooks, and tier pricing for normal users.
- Usage guardrails, rollover logic, Retell webhooks, calendar OAuth.
- Tier pricing logic (PRO / ELITE / SCALE amounts and product configuration).

Admin quick onboard and Fleet Registry are additive and admin-only.
