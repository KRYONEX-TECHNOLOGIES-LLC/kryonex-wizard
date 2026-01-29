# Deploy 400/404/500 – Debug checklist and commands

Use this when **Deploy** fails (e.g. "Request failed with status code 400") to capture exact provider calls, context, and DB state.

---

## 1. What the server logs now (after verbose logging)

**Number-only deploy** uses `provisionPhoneNumberOnly` (Retell `create-phone-number` only, no agent). Search logs for `[provisionPhoneNumberOnly]` and `[deploy-agent-self]`.

For each deploy request the server logs:

- **Exact outbound provider call**
  - Full provider URL (number-only: `https://api.retellai.com/create-phone-number`)
  - HTTP method and headers (Authorization: `Bearer ***`, Content-Type)
  - Exact request body sent to Retell
  - Provider response status and body (including 4xx/5xx body)

- **Variables and env used** (number-only)
  - `providerBaseUrl` (Retell base URL), `providerApiKeyEnvVar`: `RETELL_API_KEY`
  - `userId`, `businessName` (→ nickname), `areaCode`, `deployRequestId` on every log line for that request

- **Number-only output**
  - `[provisionPhoneNumberOnly] provider response` (success) or `provider call failed` (error): `phone_number`, `nickname`, full Retell response body.

- **On failure**
  - `[deploy-agent-self] thrown` or `[deployAgentForUser] failed` / `[provisionPhoneNumberOnly] provider call failed` with:
    - `responseStatus`, `responseBody`, `stack` (first 20 lines)
    - `providerUrl` and `requestBody` for the failing call

Search logs for `deployRequestId` (e.g. `deploy-1738...`) to get all lines for one request.

**Number-only deploy** does not use agents or LLMs; we only call `create-phone-number`. `[RETELL_IDS]` / `createAdminAgent` apply only to other flows (e.g. admin quick-onboard).

---

## 2. Reproduce with curl

### A. Call your deploy endpoint (replace `<TEST_TOKEN>` and optional body)

```bash
curl -i -X POST "https://kryonex-wizard-production.up.railway.app/deploy-agent-self" \
  -H "Authorization: Bearer <TEST_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"b1d18d08-2613-4338-a73a-7a7c7680f868","area_code":"313"}'
```

Note: The server resolves the user from the JWT (Supabase), not from the body. Body is optional; area_code and industry come from the **profile** in the DB.

### B. Call the provider URL the server builds (from logs)

After a failed deploy, copy from logs:

- `providerUrl` (e.g. `https://api.retellai.com/create-phone-number`)
- `requestBody` from the failing call

Then (replace with values from your log):

```bash
curl -i -X POST "<PROVIDER_URL_FROM_LOG>" \
  -H "Authorization: Bearer <RETELL_API_KEY_VALUE>" \
  -H "Content-Type: application/json" \
  -d '<REQUEST_BODY_FROM_LOG>'
```

Use this to see the raw Retell response (400 body, etc.) without going through your app.

---

## 3. Server logs (Railway)

### C. Grep logs by timestamp or path

```bash
# If you have Railway CLI and project linked:
railway logs --service kryonex-wizard-production

# Filter by deploy in Railway UI:
# - Filter by exact timestamp (from browser Network tab)
# - Search for "/deploy-agent-self" or "deployRequestId" or "createAdminAgent"
```

For a single failing request:

1. Get the **exact timestamp** from the browser Network tab (when the deploy request was sent).
2. In Railway logs, find that timestamp and grab **~10 lines before and ~20 lines after**.
3. Find the line with `deployRequestId` and search for that id to get the full flow.
4. Copy the **stack trace** from `[deploy-agent-self] thrown` or `[createAdminAgent] provider call failed` (first 20 lines).

---

## 4. DB / profile checks

### E. Confirm profile (industry, area_code, onboarding_step)

Run in **Supabase SQL Editor** (replace with your `user_id` from JWT or logs):

```sql
SELECT user_id, industry, onboarding_step, deploy_error, area_code, business_name
FROM profiles
WHERE user_id = 'b1d18d08-2613-4338-a73a-7a7c7680f868';
```

- **industry** must be `hvac` or `plumbing` so the server can pick the right Retell template (`RETELL_MASTER_AGENT_ID_HVAC` / `RETELL_MASTER_AGENT_ID_PLUMBING`).
- If `industry` is NULL or wrong, fix it (e.g. re-submit Identity step with correct industry, or update in DB) and retry deploy.
- **deploy_error** is set by the server on failed deploy (e.g. `AREA_CODE_UNAVAILABLE`); NULL after success.

Ready-to-run: use `supabase/check_profile_for_deploy.sql` in Supabase SQL Editor (replace the UUID with your user’s).

If you have a `deploy_queue` or `deploy_status` table, query by the same `user_id` to see any queue/status rows.

---

## 5. Frontend request details

- **Endpoint:** `POST /deploy-agent-self`
- **Body:** The frontend currently sends an empty body: `api.post("/deploy-agent-self")` (no body). User, area_code, and industry are taken from the **profile** (and JWT for user).
- **Headers:** `Authorization: Bearer <access_token>` (from Supabase session), `Content-Type: application/json`. If admin/impersonation is used, `X-Admin-Mode` and `X-Impersonated-User-ID` may be set.
- **API base URL:** From `frontend/src/lib/api.js`, the client uses `import.meta.env.VITE_API_URL || "http://localhost:3000"`. In production the bundle uses whatever `VITE_API_URL` was at build time (e.g. `https://kryonex-wizard-production.up.railway.app`).

To confirm the exact URL the browser hits: Network tab → select the `deploy-agent-self` request → check Request URL and Request Headers.

---

## 6. Common causes of 400 on deploy (number-only)

- **Retell returns 400** on `create-phone-number`: Check server logs for `[provisionPhoneNumberOnly] provider call failed` and the **responseBody**. Often:
  - Invalid or unsupported `area_code` / region
  - Missing or invalid fields in the request body (e.g. required Retell fields)
- **Missing business_name / area_code:** Deploy uses profile `business_name` (nickname in Retell) and `area_code`. Ensure Identity step saved them.

Once you have one failing request, use the **deployRequestId** from the first log line to tie together route → deployAgentForUser → provisionPhoneNumberOnly → create-phone-number → error and response body.

---

## 7. Checklist vs our setup (number-only deploy)

We use **number-only deploy**: Retell `create-phone-number` with **no agent** (null inbound/outbound). Nickname = business name so you can find it in Retell; you assign the template there later. DB stores `user_id`, `phone_number`, `agent_id` = `pending-<userId>` in `agents`.

| Checklist item | We have / use | Skip / different |
|----------------|---------------|------------------|
| **Deploy logs** `[deploy-agent-self] start` + `deployRequestId` | ✅ Yes | — |
| **Full trace** by `deployRequestId` | ✅ Logged throughout; search Railway for that id | — |
| **create-phone-number response** logged and persisted | ✅ `[provisionPhoneNumberOnly] provider response` + `done`; we persist `phone_number` in `agents` | — |
| **Agents row** `user_id`, `phone_number`, `agent_id` | ✅ Yes | We use `agent_id` = `pending-<userId>`, not NULL |
| **provider_number_id** | ❌ We don’t store it | Retell uses `phone_number` (E.164) as unique id for Get/Update/Delete. Safe to skip. |
| **agents.nickname** | ✅ After migration | We store business name (same as Retell nickname). Run `supabase/agents_deploy_trace.sql`. |
| **agents.status**, **is_managed_remotely** | ❌ We don’t have these | Skip unless you add them. |
| **idx_agents_phone_number** | ✅ After migration | Same migration adds the index. |
| **Frontend POST body** | We don’t use body | User from JWT, profile (area_code, business_name) from DB. Body optional. |
| **Provider URL + payload** for create-phone-number | ✅ In `[provisionPhoneNumberOnly] provider call` | — |
| **Provider status + body** | ✅ In `[provisionPhoneNumberOnly] provider response` (success) or `provider call failed` (error) | — |
| **Webhook lookup by phone_number** | ✅ Inbound webhook / SMS handlers query `agents` by `phone_number` | Retell webhook uses `agent_id`; with number-only we have no Retell agent until you assign in dashboard. |
| **webhook_queue** table | ❌ We don’t have it | Skip. Not used in current flow. |
| **Usage when agent_id pending** | Usage/cap logic often keys off `agent_id` | With `pending-*`, Retell won’t call our webhook until you assign an agent. Usage attribution = follow-up if you need it. |
| **RETELL_API_KEY**, **base URL** | ✅ Used | — |
| **INBOUND_WEBHOOK_URL** | We don’t send it for number-only | Null agents ⇒ no inbound webhook for that number until you attach an agent in Retell. |
| **Curl deploy** | See §2.A | User from JWT; no body required. |
| **deployRequestId** stored with DB row | ✅ After migration | We persist `deploy_request_id` and `nickname` in `agents` (run `supabase/agents_deploy_trace.sql`). |
| **idx_agents_phone_number** | ✅ After migration | Same migration adds the index. |

**Bottom line:** Use the checklist for deploy **logs**, **provider call/response**, and **agents** (`user_id`, `phone_number`, `agent_id`, `deploy_request_id`, `nickname`). Ignore **provider_number_id** (Retell uses `phone_number` as unique id) and **webhook_queue** unless you add them. Run `supabase/agents_deploy_trace.sql` in Supabase SQL Editor before deploying the server so `deploy_request_id` and `nickname` are stored.

**Verify agents row after deploy:**
```sql
SELECT user_id, phone_number, agent_id, deploy_request_id, nickname, created_at
FROM agents
WHERE user_id = '<USER_UUID>';
```
