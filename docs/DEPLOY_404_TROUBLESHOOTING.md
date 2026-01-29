# Deploy "Request failed with status code 404" troubleshooting

When **Deploy Agent & Get Number** fails with **Request failed with status code 404**, the server is calling Retell’s API and Retell is returning 404. That usually means one of the following.

## 1. Retell template (master) agent not found (most common)

The server copies a **template agent** (master agent) to create each user’s agent. It uses:

- **RETELL_MASTER_AGENT_ID_HVAC** (default industry)
- **RETELL_MASTER_AGENT_ID_PLUMBING** (if industry is plumbing)

**Fix:**

1. Open [Retell Dashboard](https://dashboard.retellai.com) → **Voice Agents**.
2. Find the agent you use as the template and copy its **Agent ID**.
3. In your **server** `.env` (or hosting env vars), set:
   - `RETELL_MASTER_AGENT_ID_HVAC=<that-agent-id>`  
   (and `RETELL_MASTER_AGENT_ID_PLUMBING` if you use a separate plumbing template).
4. Restart the server and try Deploy again.

If the ID is wrong, missing, or the agent was deleted in Retell, Retell returns 404 and you’ll see this error.

## 2. Retell API base URL or path

The server uses `https://api.retellai.com` and the `/copy-agent/:id` endpoint. If Retell has deprecated or changed that path, you’d also get 404. Check [Retell API docs](https://docs.retellai.com/api-references/create-agent) and any deprecation notices. If they removed copy-agent, the server would need to be updated to use create-agent (and build the agent config from your template).

## 3. Server logs

After the change in `server.js`, a 404 from **copy-agent** is logged like:

```text
[createAdminAgent] Retell copy-agent 404 – master agent not found. Check RETELL_MASTER_AGENT_ID_HVAC...
```

So if you see that, focus on fixing the master agent ID as in section 1.
