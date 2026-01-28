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

## Mini Admin Onboarding Wizard

**Where:** Admin Client Wizard — `/admin/wizard/create`

A small **“Admin Quick Onboarding”** box at the top of the page lets you onboard a client without Stripe or tier selection.

### Fields

| Field         | Required | Notes                                |
|---------------|----------|--------------------------------------|
| Business Name | Yes      | 2–80 chars                           |
| Area Code     | Yes      | Exactly 3 digits                     |
| Email         | Yes      | Real email (used to find or create user) |

### Button

**Deploy Agent** — submits the form.

### On Submit

- **User:** Created via Supabase Auth if the email does not exist; otherwise the existing user is used.
- **Profile:** `business_name`, `area_code`, and identity are saved. `admin_onboarded` (and `admin_onboarded_at`) are set.
- **Tier:** Core is applied (no Stripe). Subscription and usage limits are initialized.
- **Retell:** Same backend logic as the normal wizard — Retell agent is created, phone number provisioned, agent linked to the user.
- **Redirect:** None. You stay on the Admin Client Wizard; success message shows user id and agent phone when available.

### API

`POST /admin/quick-onboard` (admin-only, rate-limited).

Body:

```json
{
  "businessName": "Acme HVAC",
  "areaCode": "419",
  "email": "client@example.com"
}
```

Response (success):

```json
{
  "ok": true,
  "user_id": "uuid",
  "agent_id": "retell_agent_id",
  "phone_number": "+1..."
}
```

No Stripe, no calendar connection, no multi-step UI. For full control (tier, features, schedule, etc.) use the full Admin Client Wizard form below the quick box.

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
