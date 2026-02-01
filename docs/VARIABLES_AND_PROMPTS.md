# Variables, Prompts, and Extraction — Full Reference

This doc lists **every variable** your app needs for the full workflow (multi-state agents, info collection, booking, leads, Black Box). For each one we say **where to put it** (Retell prompt, dynamic variables, extract tool, post-call analysis) and **how the backend uses it**.

---

## 1. Dynamic Variables (Inbound / Per-Call Context)

**Where:** Retell **Inbound Call Webhook** response → `dynamic_variables` (or agent default `retell_llm_dynamic_variables`).  
**Purpose:** Values the agent can use **during** the call via `{{variable_name}}` in prompts.  
**Rule:** All values must be **strings**.

Your backend already sends these on every inbound call ([server.js](server.js) ~6872–6880):

| Variable | Description | Source |
|----------|-------------|--------|
| `business_name` | Business name | profile / agent nickname |
| `cal_com_link` | Cal.com booking URL | profile.cal_com_url or integration.booking_url |
| `transfer_number` | Live transfer number | agent.transfer_number |
| `agent_tone` | Tone (e.g. Calm & Professional) | agent.tone |
| `schedule_summary` | Availability text | agent.schedule_summary |
| `standard_fee` | Standard service fee | agent.standard_fee |
| `emergency_fee` | Emergency fee | agent.emergency_fee |

**Optional (for multi-state / richer prompts):** Add these in Retell **agent default** dynamic variables (or in the inbound webhook if you start passing them from the backend):

| Variable | Description | Where to set |
|----------|-------------|--------------|
| `industry` | "HVAC" or "Plumbing" | Backend already has it; add to inbound response if you want it in prompt |
| `caller_name` | Filled as you collect it | Extract Dynamic Variable tool (see below) |
| `call_reason` | Why they're calling | Extract or post-call |
| `service_address` | Job address | Extract or post-call |
| `callback_number` | Phone to call back | Extract or from `user_number` |
| `urgency_level` | emergency / standard / etc. | Extract (Enum) or post-call |
| `issue_type` | AC repair, leak, etc. | Extract or post-call |
| `current_temp` | If HVAC, thermostat info | Extract (optional) |
| `vulnerable_flag` | Safety / vulnerable household | Extract (Boolean) or post-call |

So: **inbound webhook** = business + calendar + transfer + fees + tone. **Extract tool** = caller name, address, issue, urgency, etc. as you collect them.

---

## 2. Extract Dynamic Variables (Mid-Call)

**Where:** Retell **Extract Dynamic Variable** tool (function calling).  
**Purpose:** Capture structured info **as the user says it** and store it (e.g. in lead metadata or for next state).  
**Types in Retell:** Text, Number, Enum, Boolean.

Your backend already has a tool: `extract_dynamic_variable` ([server.js](server.js) ~3184–3231). It accepts **any** args and merges them into `leads.metadata.lead_notes`. So in Retell you define the **same names** you want in the prompt and in post-call.

**Variables to extract (for your workflow):**

| Variable Name | Type | Description |
|---------------|------|-------------|
| `customer_name` | Text | Caller's full name |
| `customer_phone` | Text | Callback number (or use system `user_number`) |
| `service_address` | Text | Street address / city for the job |
| `issue_type` | Text or Enum | e.g. "AC not cooling", "Leak", "Install" |
| `issue_description` | Text | Short problem description |
| `urgency_level` | Enum | "emergency", "today", "this_week", "flexible" |
| `preferred_date` | Text | e.g. "tomorrow", "next Monday" |
| `preferred_time` | Text | e.g. "morning", "after 2pm" |
| `current_temp` | Text | For HVAC: thermostat reading if mentioned |
| `vulnerable_household` | Boolean | Elderly, infant, medical equipment, etc. |
| `callback_ok` | Boolean | Okay to leave voicemail / call back |

**Where to put them in Retell:**  
Add one **Extract Dynamic Variable** tool. In that tool, add each variable with a short description. In the **prompt**, tell the agent when to call it (e.g. “When the user gives their name, phone, address, or describes the issue, call `extract_user_details` to save it.”).  
Backend does not care about the exact tool name; it just merges `args` into lead metadata.

---

## 3. Post-Call Analysis (After Call Ends)

**Where:** Retell **Post-Call Analysis** tab on the agent (Dashboard → Agent → Post-Call Analysis).  
**Purpose:** Retell runs an LLM over the transcript and fills a schema. Your backend reads this in `call_ended` and maps it to leads + call_recordings.

Your backend already maps these **exact** names ([server.js](server.js) ~3601–3611). Define them in Retell with these names (or the alternates in parentheses):

| Retell Post-Call Field | Backend Mapping | Type in Retell |
|------------------------|-----------------|----------------|
| `customer_name` (or `caller_name`) | analysisData.customer_name → lead name | Text |
| `customer_phone` (or `phone_number`) | analysisData.customer_phone → lead phone | Text |
| `service_address` (or `address`) | analysisData.service_address → lead service_address | Text |
| `issue_type` (or `service_type`) | analysisData.issue_type | Text or Selector |
| `issue_description` (or `problem_description`) | analysisData.issue_description → summary | Text |
| `appointment_booked` (or `booked`) | analysisData.appointment_booked → lead status "Booked" | Boolean |
| `call_outcome` (or `outcome`) | analysisData.call_outcome → lead status | Selector (see below) |
| `call_successful` | analysisData.call_successful | Boolean |
| `user_summary` or `summary` or `call_summary` | analysisData.call_summary | Text |
| `user_sentiment` | bestSentiment in backend | Selector e.g. positive/negative/neutral |

**Call outcome selector (recommended):**  
Choices: `booked`, `callback`, `transferred`, `not_interested`, `declined`, `no_answer`, `other`.  
Backend maps: `booked` → "Booked", `transferred` → "Transferred", `callback` → "Callback Requested", `declined`/`not_interested` → "Not Interested".

**Where to put them in Retell:**  
Agent → Post-Call Analysis → Add each field with the **Name** and **Description** that matches the table above. Use the types that fit (Boolean, Text, Selector).

---

## 4. Booking Tools: `check_calendar_availability` and `book_appointment`

**Where:** Retell **function/tool** definitions (custom function pointing at your webhook, or Retell’s Cal.com integration). Your backend implements these in [server.js](server.js) ~3084–3181.

### check_calendar_availability

Backend expects (from `resolveToolAppointmentWindow` + optional duration):

| Argument | Required | Description |
|----------|----------|-------------|
| `start_time_iso` | Or (start_date + start_time) | ISO datetime string |
| `start_date` | If no start_time_iso | YYYY-MM-DD |
| `start_time` | If no start_time_iso | HH:MM (24h) |
| `duration_minutes` | No | Default 60 |

So in Retell, the tool that checks calendar should pass at least **start_time_iso** or **start_date** + **start_time**. Backend returns `available`, `slots`, or `conflicts`.

### book_appointment

Backend expects:

| Argument | Required | Description |
|----------|----------|-------------|
| `start_time_iso` | Or (start_date + start_time) | When to book |
| `start_date` + `start_time` | If no start_time_iso | Date and time |
| `duration_minutes` | No | Default 60 |
| `customer_name` or `name` | No | Attendee name (default "Customer") |
| `customer_phone` or `phone` | No | Attendee phone |
| `customer_email` or `email` | No | For Cal.com |
| `service_address` or `location` | No | Stored in appointment location |
| `service_issue` or `notes` | No | Stored in appointment notes |
| `time_zone` | No | Default from Cal.com config |
| `lead_id` | No | Stored in Cal.com metadata |

**Where to put them in Retell:**  
In the **Book Calendar** (or custom) tool, add **parameters** with these names and descriptions so the LLM passes them when it calls the function. Prompt: “When the user confirms a time, call `book_appointment` with customer_name, customer_phone, start_time_iso (or start_date and start_time), and optionally service_address and notes.”

---

## 5. Prompt Variables (What the Agent Sees)

**Where:** Retell **prompt** (and begin message). Use `{{variable_name}}` for anything that’s in dynamic variables or system variables.

**System variables (Retell provides these automatically):**

- `{{current_agent_state}}` — current state name (multi-state)
- `{{previous_agent_state}}` — previous state
- `{{current_time}}` — current time (agent timezone)
- `{{current_time_[timezone]}}` — e.g. `{{current_time_America/Los_Angeles}}`
- `{{current_calendar}}` — 14-day calendar
- `{{session_type}}` — voice / chat
- `{{session_duration}}` — how long the call has been
- `{{direction}}` — inbound / outbound
- `{{user_number}}` — caller phone (inbound)
- `{{agent_number}}` — your number
- `{{call_id}}` — call session id

**Your app variables (set by you):**

- `{{business_name}}`
- `{{cal_com_link}}`
- `{{transfer_number}}`
- `{{agent_tone}}`
- `{{schedule_summary}}`
- `{{standard_fee}}`
- `{{emergency_fee}}`
- `{{industry}}` (if you add it to inbound)
- `{{caller_name}}`, `{{service_address}}`, `{{issue_type}}`, etc. (if you use Extract and reference them in the prompt)

**Prompt guidance for multi-state + booking:**

- “You are the AI for {{business_name}}. Tone: {{agent_tone}}. Collect name, phone, address, issue, and preferred time before offering booking.”
- “Scheduling: {{schedule_summary}}. Standard fee {{standard_fee}}, emergency {{emergency_fee}}. Book via {{cal_com_link}} or use the book_appointment function.”
- “When you have name, phone, address, and issue, call the extract function to save them, then check calendar with check_calendar_availability and book with book_appointment.”
- “If they ask for a human, transfer to {{transfer_number}}.”

---

## 6. One-Page Checklist

| What | Where in Retell | Backend / App Use |
|------|------------------|--------------------|
| Business name, cal link, transfer, fees, tone | Inbound webhook → dynamic_variables | Prompt + booking |
| Caller name, phone, address, issue, urgency | Extract Dynamic Variable tool | leads.metadata, next state, booking args |
| customer_name, customer_phone, service_address, issue_type, issue_description, appointment_booked, call_outcome, call_summary, user_sentiment | Post-Call Analysis schema | leads + call_recordings + dashboard + Black Box |
| start_time_iso (or start_date + start_time), duration_minutes, customer_name, customer_phone, service_address, notes | book_appointment tool args | Cal.com + appointments table |
| start_time_iso or start_date+start_time, duration_minutes | check_calendar_availability tool args | Cal.com slots or local conflicts |
| is_emergency (optional) | after_hours_check tool args | Returns open/closed + emergency availability |

---

## 7. after_hours_check Tool (NEW)

**Purpose:** Check if business is currently open based on structured business hours.

**Input:**
| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `is_emergency` | boolean | No | If true and user has 24/7 emergency enabled, always returns open |

**Output (success):**
```json
{
  "ok": true,
  "is_open": true,
  "reason": "Open now (08:00 - 18:00)",
  "current_time": "14:30",
  "timezone": "America/Chicago",
  "hours_today": { "open": "08:00", "close": "18:00" },
  "emergency_available": true
}
```

**Output (closed):**
```json
{
  "ok": true,
  "is_open": false,
  "reason": "Currently closed. Hours: 08:00 - 18:00",
  "current_time": "20:30",
  "timezone": "America/Chicago",
  "hours_today": { "open": "08:00", "close": "18:00" },
  "emergency_available": true
}
```

**Prompt guidance:**
- "Before booking, call after_hours_check to verify we're open. If closed, inform the caller of our hours."
- "If the caller has an emergency and we offer 24/7 emergency service, call after_hours_check with is_emergency=true."

**Settings (in app):**
- Users configure business hours per day (Settings → Business Hours)
- Toggle "24/7 Emergency Service" to allow emergency calls to bypass hours check
- Set timezone for accurate time checking

---

## 8. Backend-Only Notes

- **Lead insert (call_ended):** name, phone, status, summary, transcript, sentiment, recording_url, call_duration_seconds, service_address, issue_type, call_outcome, appointment_booked, metadata (post_call_analysis, extracted_vars, regex).
- **call_recordings insert:** seller_id, lead_id, duration, recording_url, outcome (same as lead status).
- **Regex fallback:** `extractLead(transcript)` gets name, phone, summary, sentiment if post-call and extract vars are missing.

If you add a new variable in Retell (extract or post-call), add the mapping in [server.js](server.js) in the `call_ended` block (`analysisData` or `extractedVars`) and, if needed, in the lead insert or appointment insert so the app and Black Box stay in sync.
