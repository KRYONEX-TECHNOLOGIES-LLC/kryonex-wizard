# Quick Reference Card

One-page reference for common tasks and debugging.

---

## URLs

| Environment | Frontend | Backend |
|-------------|----------|---------|
| Local | http://localhost:5173 | http://localhost:3000 |
| Production | https://your-frontend.vercel.app | https://your-backend.railway.app |

---

## Common Tasks

### Start Development

```bash
# Terminal 1: Backend
npm start

# Terminal 2: Frontend
cd frontend && npm run dev
```

### Deploy a New User (Admin)

1. Go to `/admin/wizard/create`
2. Enter: Business Name, Area Code, Email
3. Click "Quick Onboard"
4. User can log in with temporary password

### Test a Call

1. Get phone from: `/admin/users` → copy number
2. Dial the number
3. Listen for: "Hello, thank you for calling {business_name}..."

### Check User's Usage

```sql
SELECT tier, call_used_seconds, call_cap_seconds, sms_used, sms_cap
FROM usage_limits WHERE user_id = 'USER_ID';
```

### View Errors

1. Go to `/admin/ops`
2. Click "Errors" tab
3. Click "Resolve" when fixed

### Replay Failed Webhook

1. Go to `/admin/ops`
2. Click "Webhook Queue" tab
3. Filter by "failed"
4. Click "Replay"

---

## Key Database Tables

| Table | Purpose |
|-------|---------|
| `profiles` | User settings, business_name |
| `agents` | Phone numbers, agent config |
| `leads` | Customer leads |
| `usage_limits` | Usage tracking |
| `error_logs` | Error tracking |
| `webhook_queue` | Webhook audit |

---

## API Endpoints (Most Used)

```
GET  /api/dashboard/stats-enhanced   Dashboard data
GET  /api/leads                      User's leads
GET  /usage/status                   Usage limits
GET  /admin/users                    All users (admin)
GET  /admin/ops-alerts               Ops alerts (admin)
POST /admin/quick-onboard            Deploy user (admin)
```

---

## Webhook Endpoints

```
POST /webhooks/retell-inbound   ← Retell calls
POST /retell-webhook            ← Retell events
POST /webhooks/sms-inbound      ← Retell SMS
POST /stripe-webhook            ← Stripe payments
```

---

## Troubleshooting

### "Agent not found for number"

- Check phone is E.164: `+14155551234`
- Verify exists: `SELECT * FROM agents WHERE phone_number = '+1...'`

### Business name not showing

- Check `profiles.business_name`
- Check `agents.nickname` (fallback)

### "Duplicate key" on deploy

- Run: `supabase/fix_agents_constraints.sql`

### User can't log in

- Check email is verified in Supabase Auth
- Check profile exists in `profiles` table

### SMS not sending

- Check `usage_limits.sms_used` < `sms_cap + sms_credit`
- Check user has SMS feature enabled

---

## Billing Tiers

| Tier | Price | Minutes | SMS |
|------|-------|---------|-----|
| CORE | $149 | 150 | 50 |
| PRO | $249 | 500 | 200 |
| ELITE | $497 | 1,200 | 500 |
| SCALE | $997 | 3,000 | 1,000 |

---

## Admin Pages

| Page | URL |
|------|-----|
| Dashboard | `/admin/dashboard` |
| Users | `/admin/users` |
| Client Wizard | `/admin/wizard/create` |
| Referrals | `/admin/referrals` |
| Financials | `/admin/financials` |
| Ops | `/admin/ops` |

---

## Environment Variables (Critical)

```bash
# Backend must have:
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
RETELL_API_KEY
STRIPE_SECRET_KEY
SERVER_URL           # Public URL for webhooks!
ADMIN_EMAIL

# Frontend must have:
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_API_URL
```

---

## Daily Operations

| Time | Task |
|------|------|
| 3 AM UTC | Reconciliation runs automatically |
| Continuous | Appointment reminders sent |
| As needed | Check `/admin/ops` for errors |

---

## Contact Points

| Service | Dashboard |
|---------|-----------|
| Supabase | https://supabase.com/dashboard |
| Stripe | https://dashboard.stripe.com |
| Retell | https://www.retellai.com/dashboard |
| Vercel | https://vercel.com/dashboard |
| Railway | https://railway.app/dashboard |
