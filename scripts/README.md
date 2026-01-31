# Scripts

Utility scripts are run from the repo root.

## API Check
`scripts/api-check.js` pings core API routes.

Run:
```
npm run test:api
```

Env:
- `CHECK_BASE_URL` (defaults to `http://localhost:3000`)
- `TEST_API_TOKEN` (Supabase JWT, optional for auth-required routes)

## Create Test User
`scripts/create-test-user.js` creates or updates a Supabase user and profile.

Run:
```
npm run seed:test-user
```

Env:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TEST_USER_EMAIL` (optional)
- `TEST_USER_PASSWORD` (optional)

## Simulate Retell Webhook
`scripts/simulate_retell.js` sends a mock inbound call webhook to test the server.

Run:
```
node scripts/simulate_retell.js
```

Env (or edit the file):
- `WEBHOOK_URL` — defaults to `http://localhost:3000/webhooks/retell-inbound`
- `TO_NUMBER` — phone number to simulate (must exist in `agents` table)
- `MOCK_AGENT_ID` — agent ID to include in the request

Example for production:
```powershell
$env:WEBHOOK_URL="https://kryonex-wizard-production.up.railway.app/webhooks/retell-inbound"
$env:TO_NUMBER="+12136982750"
node scripts/simulate_retell.js
```

The script verifies:
- HTTP 200 response
- `call_inbound` structure in response
- `dynamic_variables.business_name` is set
- `begin_message` override is present
