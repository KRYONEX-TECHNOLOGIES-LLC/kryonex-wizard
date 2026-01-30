# Retell Inbound Dynamic Variables – Full Context for AI Debugging

Copy everything below this line and give it to your other AI to help debug why dynamic variables (e.g. business name) are not being spoken on inbound calls.

---

## 1. Project and goal

- **Project:** KRYONEX_WIZARD. A web app (React frontend, Node/Express server, Supabase) that lets users set up an AI phone agent (Grace, HVAC dispatch) and provision a Retell AI phone number. When someone calls that number, Retell should use our inbound webhook to get per-call data (business name, schedule, fees, transfer number, etc.) and the agent should say them (e.g. “Thanks for calling **Maven HVAC**, this is Grace”).
- **Goal:** Inbound calls to the Retell number should hear the **business name** and other **dynamic variables** we send in the webhook response. Right now the agent either does not say the business name or says the literal placeholder; the variables are not being substituted on the call.

---

## 2. How it’s supposed to work (Retell docs)

- Retell sends a **POST** to our **inbound webhook URL** when a call comes in (before the call is connected).
- **Request** (Retell → us) is JSON, e.g.:
  - `event: "call_inbound"`
  - `call_inbound: { agent_id?, agent_version?, from_number, to_number }`
  - `to_number` = the number that was called (our number). We use it to look up which user/agent in our DB.
- **Response** (us → Retell) must be **2xx** and JSON with everything under **`call_inbound`**:
  - **`override_agent_id`** (optional): which Retell agent to use for this call. If we omit it, Retell can reject or use default.
  - **`override_agent_version`** (optional): e.g. `1`.
  - **`dynamic_variables`** (optional): object of key → string. These are substituted into the agent’s prompt and begin message wherever `{{variable_name}}` appears. **All values must be strings.**
  - **`agent_override`** (optional): per-call overrides. Under `retell_llm` we can set **`begin_message`** (e.g. `"Thanks for calling {{business_name}}, this is Grace. How can I help you?"`). Retell should substitute `{{business_name}}` from `dynamic_variables.business_name`.
- **Pattern:** Keys in `dynamic_variables` (e.g. `business_name`, `customer_name`) match placeholders in prompts/begin_message (e.g. `{{business_name}}`, `{{customer_name}}`). Retell substitutes them when the call runs.

---

## 3. What we built (our side)

- **Endpoint:** `POST /webhooks/retell-inbound` in `server.js`.
- **Flow:**
  1. Read `req.body`: `payload.call_inbound` (or `payload`), get `to_number`, `agent_id`, etc.
  2. Normalize `to_number` to E.164 (e.g. +15045551234) and look up row in **`agents`** table by `phone_number`.
  3. If no row: return **404** (agent not found for number).
  4. Check usage limits (subscription, etc.); if over limit return **402**.
  5. Load **`profiles`** (business_name, cal_com_url) and **`integrations`** (booking_url) for that user.
  6. Build **`dynamic_variables`**: `business_name`, `cal_com_link`, `transfer_number`, `agent_tone`, `schedule_summary`, `standard_fee`, `emergency_fee`. All values are strings. We ensure `business_name` is never empty (fallback `"your business"`).
  7. Compute **`override_agent_id`**: if DB has a real Retell agent id (not `pending-*`) we use it; if DB has `pending-*` we echo the `agent_id` from the request so Retell uses the agent bound to the number.
  8. Build **response**: `{ call_inbound: { override_agent_id, override_agent_version: 1, agent_override: { retell_llm: { begin_message: "Thanks for calling {{business_name}}, this is Grace. How can I help you?" } }, dynamic_variables } }`. Key order matches Retell sample (override_agent_id, override_agent_version, agent_override, dynamic_variables).
  9. Return **200** and `res.json({ call_inbound })`.
- **DB:** `agents` has `user_id`, `agent_id`, `phone_number`, `transfer_number`, `tone`, `schedule_summary`, `standard_fee`, `emergency_fee`. `profiles` has `business_name`, `cal_com_url`. User sets these in the app (Wizard) and we persist them.
- **Retell dashboard:** User has a Retell agent (single-prompt, not multi-state) with the Grace prompt that uses `{{business_name}}` and other variables. The **phone number** in Retell must have **Inbound Webhook URL** set to `https://<our-server>/webhooks/retell-inbound`. The number should also have an **Inbound Call Agent** (or our webhook returns `override_agent_id` so Retell knows which agent to use).

---

## 4. The problem

- When someone calls the Retell number, the call connects and the agent talks, but it **does not say the business name** (or other dynamic variables). Either the agent says something generic or the placeholder `{{business_name}}` is left unsaid/raw. So **Retell is not substituting our webhook’s `dynamic_variables`** into the call (or our response is not being used at all).

---

## 5. What we’ve already verified and fixed

- **Webhook code:** Matches Retell’s inbound webhook doc. Response has `call_inbound` with `dynamic_variables`, `agent_override.retell_llm.begin_message`, and when we have an agent we send `override_agent_id` and `override_agent_version: 1`. All dynamic_variables values are strings; `business_name` has a non-empty fallback.
- **Placeholder match:** We send `dynamic_variables.business_name` and `begin_message` contains `{{business_name}}` — same pattern as Retell’s sample (`customer_name` / `{{customer_name}}`).
- **Agent type:** User confirmed the Retell agent is **single-prompt**, not multi-state, so multi-state vs single-prompt is not the cause.
- **Override agent id:** We no longer send an invalid `override_agent_id` (e.g. `pending-xxx`). We either send the real Retell agent id from DB or echo the request’s `agent_id` when DB has `pending-*`, so Retell gets a valid agent id and should still apply our `dynamic_variables` and `agent_override`.

---

## 6. What we have NOT been able to confirm

- **Whether Retell actually calls our webhook** when the number is dialed. We don’t have proof from the user that the server receives the POST and returns 200 (e.g. server/Railway logs showing the request and our response).
- **Exact Retell dashboard config:** Is the **Inbound Webhook URL** on the phone number set to our URL? Is the agent’s **begin message** (or prompt) in Retell using `{{business_name}}`? Is the number’s “Inbound Call Agent” set so Retell sends `agent_id` in the request?
- **Retell product behavior:** Whether there is a bug or limitation (e.g. dynamic_variables from inbound webhook not applied in certain configs, or only applied when override_agent_id is omitted, etc.). We don’t have Retell’s internal behavior docs.

---

## 7. Relevant files and locations

- **server.js:** Inbound webhook handler around `app.post("/webhooks/retell-inbound", ...)`. Search for `retell-inbound` or `call_inbound`.
- **docs/AGENT_PROMPT_GRACE.md:** The Grace agent prompt (with CONTEXT explaining variables). User pastes this into Retell agent.
- **docs/RETELL_RAILWAY_REFERENCE.md:** Short reference of Retell inbound webhook request/response and a test checklist.
- **DB tables:** `agents` (phone_number, user_id, agent_id, transfer_number, tone, schedule_summary, standard_fee, emergency_fee), `profiles` (business_name, cal_com_url).

---

## 8. What we need help with

- **Concrete next steps** to prove whether the webhook is hit and what response Retell gets (e.g. what to log, how to test, how to inspect Retell’s request/response).
- **Any mismatch** between our response and Retell’s expected format (field names, nesting, types, encoding) that could cause Retell to ignore `dynamic_variables` or `agent_override`.
- **Retell-specific gotchas** (e.g. docs, community, support) about inbound webhook and dynamic variables not applying.
- **Alternative approaches** if the inbound webhook path is broken (e.g. set default dynamic variables on the agent in Retell and only use webhook for override_agent_id; or use a different Retell API flow).
- **Code or config changes** (server, Retell dashboard, or DB) that would make dynamic variables reliably spoken on inbound calls.

---

## 9. Retell doc quotes (for reference)

- **Request:** “These fields might be provided in the payload depending on your configuration: agent_id, agent_version, from_number, to_number. Here’s a sample payload for inbound call: { \"event\": \"call_inbound\", \"call_inbound\": { \"agent_id\": \"agent_12345\", \"agent_version\": 1, \"from_number\": \"+12137771234\", \"to_number\": \"+12137771235\" } }”
- **Response:** “We expect a JSON response with a successful status code (2xx) with fields grouped under call_inbound. Here’re the allowed fields (all of them are optional): override_agent_id, override_agent_version, dynamic_variables, metadata, agent_override.”
- **Agent Override:** “Supported groups: … retell_llm: Partial Retell LLM settings. Supported keys include … begin_message.”
- **Sample response:** “Here’s a sample response for inbound call: { \"call_inbound\": { \"override_agent_id\": \"agent_12345\", \"override_agent_version\": 1, \"agent_override\": { \"retell_llm\": { \"begin_message\": \"Hi {{customer_name}}, thanks for calling.\" } }, \"dynamic_variables\": { \"customer_name\": \"John Doe\" } } }”
- **Dynamic variables (other doc):** “All values in retell_llm_dynamic_variables must be strings. Numbers, booleans, or other data types are not supported.”

---

End of context. Please use this to suggest debugging steps, verify our implementation against Retell’s spec, and help get dynamic variables (especially business_name) working on inbound calls.
