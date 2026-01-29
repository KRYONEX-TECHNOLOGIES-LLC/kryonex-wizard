# Deploy 400/404/500 – Debug checklist and commands

Use this when **Deploy** fails (e.g. "Request failed with status code 400") to capture exact provider calls, context, and DB state.

---

## 1. What the server logs now (after verbose logging)

For each deploy request the server logs:

- **Exact outbound provider call**
  - Full provider URL (e.g. `https://api.retellai.com/copy-agent/...` or `/create-phone-number`)
  - HTTP method and headers (Authorization: `Bearer ***`, Content-Type)
  - Exact request body sent to Retell
  - Provider response status and body (including 4xx/5xx body)

- **Variables and env used**
  - `providerBaseUrl` (Retell base URL)
  - `providerApiKeyEnvVar`: `RETELL_API_KEY`
  - `agentTemplateId`, `llmId`, `modelId` (llmVersion)
  - `userId`, `profile.industry` (HVAC/Plumbing), `areaCode`, `plan`
  - `deployRequestId` (correlation id) on every log line for that request

- **createAdminAgent output**
  - `[createAdminAgent] output` logs: `templateId`, `templateName`, `llmId`, `llmVersion`, `agent_id`, `phone_number`

- **On failure**
  - `[deploy-agent-self] thrown` or `[deployAgentForUser] failed` / `[createAdminAgent] provider call failed` with:
    - `responseStatus`, `responseBody`, `stack` (first 20 lines)
    - `providerUrl` and `requestBody` for the failing call

Search logs for `deployRequestId` (e.g. `deploy-1738...`) to get all lines for one request.

**Exact agent + LLM we're calling:** Search for `[RETELL_IDS]` in Railway logs. That line shows:
- `industry` (hvac/plumbing)
- `masterAgentIdUsed` – Retell template agent ID we call (copy-agent / get-agent)
- `llmIdUsed` – Retell LLM ID
- `llmVersionUsed` – Retell LLM version
- All env vars: `env_RETELL_MASTER_AGENT_ID_HVAC`, `env_RETELL_MASTER_AGENT_ID_PLUMBING`, `env_RETELL_LLM_ID_HVAC`, etc.

Compare those IDs to your Retell dashboard; wrong or missing env = 404/400.

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

## 6. Common causes of 400 on deploy

- **Retell returns 400** (e.g. on `create-phone-number` or `update-agent`): Check server logs for `[createAdminAgent] provider call failed` and the **responseBody**. Often:
  - Invalid or unsupported `area_code` / region
  - Missing or invalid fields in the request body (e.g. required Retell fields)
- **Missing industry:** If `profiles.industry` is NULL, the server defaults to `hvac`. If your Retell template or config expects something else, set industry in Identity step or DB.
- **Wrong env:** Ensure `RETELL_MASTER_AGENT_ID_HVAC` and `RETELL_MASTER_AGENT_ID_PLUMBING` (if used) match existing agents in the Retell dashboard; wrong ID can lead to 404 or downstream 400.

Once you have one failing request, use the **deployRequestId** from the first log line to tie together route → deployAgentForUser → createAdminAgent → provider call → error and response body.
