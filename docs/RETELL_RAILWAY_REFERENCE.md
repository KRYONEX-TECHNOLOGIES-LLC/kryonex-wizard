# Retell + Railway – Reference (from official docs)

Quick reference from **Retell AI** and **Railway** docs so we stay aligned.

---

## Retell: Inbound Call Webhook

**Source:** [Inbound webhook](https://docs.retellai.com/features/inbound-call-webhook) | [Receive calls](https://docs.retellai.com/deploy/inbound-call)

### Request (Retell → our server)

- **Method:** `POST` to the URL you set on the **phone number** (“Add an inbound webhook”).
- **Payload:** JSON. Fields may be under `call_inbound`:
  - `event`: `"call_inbound"`
  - `call_inbound.agent_id`: if the number has an inbound agent set
  - `call_inbound.agent_version`: if set
  - `call_inbound.from_number`: **always** (caller)
  - `call_inbound.to_number`: **always** (our number, the receiver)
- **Sample:** `{"event":"call_inbound","call_inbound":{"agent_id":"agent_12345","agent_version":1,"from_number":"+12137771234","to_number":"+12137771235"}}`
- **Timeout:** 10 seconds. Retries up to 3 times on no 2xx.
- **If webhook fails:** After 3 failures, Retell checks if the number has an inbound agent id; if yes, connects to that agent; if not, disconnects.

### Response (our server → Retell)

- **Status:** 2xx (e.g. 200).
- **Body:** JSON with everything under **`call_inbound`** (or `chat_inbound` for SMS). All optional:
  - `override_agent_id`: agent to use for this call (must be a **valid Retell agent id**).
  - `override_agent_version`: version number.
  - `dynamic_variables`: object; **all values must be strings**. Injected into prompt placeholders `{{name}}`.
  - `metadata`: optional.
  - `agent_override`: per-call overrides (voice, LLM, etc.).
- **Sample:** `{"call_inbound":{"override_agent_id":"agent_12345","dynamic_variables":{"customer_name":"John Doe"},"metadata":{}}}`
- **Rejecting a call:** Return 200 **without** `call_inbound.override_agent_id` (or omit it).

### Security (optional)

- **Verify requests:** [Secure the webhook](https://docs.retellai.com/features/secure-webhook) – use `x-retell-signature` header + Retell API Key (or SDK `Retell.verify(...)`).
- **IP allowlist:** Retell IP `100.20.5.228` (check docs for full list).

---

## Retell: Create Phone Number (API)

**Source:** [Create Phone Number](https://docs.retellai.com/api-references/create-phone-number)

- **Endpoint:** `POST https://api.retellai.com/create-phone-number`
- **Body (relevant):** `inbound_agent_id` (string | null), `outbound_agent_id` (string | null), `area_code` (integer, 3 digits US), `country_code` ("US" | "CA"), `nickname` (string), `inbound_webhook_url` (string | null).
- **Response:** `phone_number` (E.164, e.g. `"+14157774444"`) is the **unique id** for phone number APIs; no separate “provider number id” in response.
- **Dynamic variables:** Supplied at **call time** via the **inbound webhook** (per-call), not at number creation.

---

## Retell: Dynamic Variables

**Source:** [Dynamic Variables](https://docs.retellai.com/build/dynamic-variables)

- **In prompts:** Use `{{variable_name}}` (double curly braces). Values come from inbound webhook `dynamic_variables` (or outbound API `retell_llm_dynamic_variables`).
- **All values must be strings.** No numbers/booleans in `dynamic_variables`.
- **If not set:** Placeholder stays as `{{variable_name}}` in the prompt (or use agent-level defaults).

---

## Railway: Variables & Logs

**Source:** [Variables](https://docs.railway.com/reference/variables) | [Viewing Logs](https://docs.railway.com/guides/logs)

### Variables

- Set in **Railway Dashboard → Project → Service → Variables** (or Shared Variables).
- **Do not commit** `.env` with secrets; use Railway (and local `.env` only on your machine).
- Railway provides `RAILWAY_PUBLIC_DOMAIN`, `RAILWAY_PRIVATE_DOMAIN`, `RAILWAY_PROJECT_NAME`, etc.

### Logs

- **Where:** Build/Deploy panel (per deployment), **Observability → Log Explorer** (all services), or CLI: `railway logs`.
- **What’s captured:** stdout/stderr (e.g. `console.log`, `console.info`).
- **Retention:** Hobby 7 days, Pro 30 days.
- **Filter examples (Log Explorer):**
  - Path: `"POST /webhooks/retell-inbound"` or `@path:/webhooks/retell-inbound`
  - Status: `@httpStatus:404` or `@httpStatus:>=400`
  - Combine: `"retell-inbound" AND @httpStatus:500`
- **Structured logs:** Emit JSON with `message`, `level` (`info`/`warn`/`error`) for better filtering.

---

## Our implementation checklist

| Item | Where | Notes |
|------|--------|--------|
| Inbound webhook URL | Retell → Phone Number → Add an inbound webhook | `https://<railway-domain>/webhooks/retell-inbound` |
| Response format | Server `/webhooks/retell-inbound` | Return `{ call_inbound: { override_agent_id, dynamic_variables } }`; all variable values strings |
| Request payload | Same handler | Read `to_number` from `payload.call_inbound` or top-level; normalize to E.164 for DB lookup |
| Agent-level webhook | Retell → Agent → Webhook URL | For **call events** (start/end): `https://<railway-domain>/retell-webhook` |
| override_agent_id | DB `agents.agent_id` | Must be a **valid Retell agent id** (e.g. `agent_52a...`). If still `pending-<userId>`, Retell may reject → busy/disconnect |
| Railway env vars | Railway → Service → Variables | All secrets and config (RETELL_*, SUPABASE_*, STRIPE_*, etc.); never commit .env |

---

*Last updated from Retell and Railway docs; links above are canonical.*
