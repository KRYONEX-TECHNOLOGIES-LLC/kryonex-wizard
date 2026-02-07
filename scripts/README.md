# Scripts

Utility scripts for development, testing, and maintenance. All scripts are run from the repo root.

---

## Table of Contents

1. [API Check](#api-check)
2. [Create Test User](#create-test-user)
3. [Simulate Retell Webhook](#simulate-retell-webhook)
4. [Fix Agent Webhook](#fix-agent-webhook)
5. [Commit Cal.com](#commit-calcom)

---

## API Check

`scripts/api-check.js` - Health check for core API routes.

### Usage

```bash
npm run test:api
```

### What It Checks

- Server is running
- Core endpoints respond
- Auth-protected routes (if token provided)
- Response time

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CHECK_BASE_URL` | No | API URL (default: `http://localhost:3000`) |
| `TEST_API_TOKEN` | No | Supabase JWT for auth routes |

### Example

```powershell
$env:CHECK_BASE_URL="https://your-backend.railway.app"
$env:TEST_API_TOKEN="eyJ..."
npm run test:api
```

---

## Create Test User

`scripts/create-test-user.js` - Creates or updates a test user in Supabase.

### Usage

```bash
npm run seed:test-user
```

### What It Does

1. Creates user in Supabase Auth (or finds existing)
2. Creates/updates profile record
3. Sets up for E2E testing

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key |
| `TEST_USER_EMAIL` | No | Test user email (default provided) |
| `TEST_USER_PASSWORD` | No | Test user password (default provided) |

### Example

```powershell
$env:TEST_USER_EMAIL="test@example.com"
$env:TEST_USER_PASSWORD="TestPass123"
npm run seed:test-user
```

---

## Simulate Retell Webhook

`scripts/simulate_retell.js` - Sends a mock inbound call webhook to test the server.

### Usage

```bash
node scripts/simulate_retell.js
```

### What It Does

1. Sends POST to `/webhooks/retell-inbound`
2. Simulates an incoming call
3. Verifies response structure

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `WEBHOOK_URL` | No | Webhook endpoint (default: `http://localhost:3000/webhooks/retell-inbound`) |
| `TO_NUMBER` | Yes | Phone number to simulate (must exist in `agents` table, E.164 format) |
| `MOCK_AGENT_ID` | No | Agent ID to include |

### Verification

The script checks:
- HTTP 200 response
- `call_inbound` structure in response
- `dynamic_variables.business_name` is set
- `begin_message` override is present

### Example (Production)

```powershell
$env:WEBHOOK_URL="https://kryonex-wizard-production.up.railway.app/webhooks/retell-inbound"
$env:TO_NUMBER="+14155551234"
node scripts/simulate_retell.js
```

### Expected Output

```
✅ HTTP 200
✅ Response has call_inbound structure
✅ business_name: "Acme Plumbing"
✅ begin_message present
```

---

## Fix Agent Webhook

`scripts/fix-agent-webhook.js` - Updates webhook URLs for existing agents.

### Usage

```bash
node scripts/fix-agent-webhook.js
```

### When to Use

- After changing `SERVER_URL`
- When migrating to new backend host
- If agent webhooks are misconfigured

### What It Does

1. Fetches all agents from database
2. Updates Retell webhook URL for each
3. Reports success/failure

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key |
| `RETELL_API_KEY` | Yes | Retell API key |
| `SERVER_URL` | Yes | New webhook base URL |

---

## Commit Cal.com

`scripts/commit-calcom.sh` - Helper for Cal.com integration commits.

### Usage

```bash
./scripts/commit-calcom.sh
```

### What It Does

- Stages Cal.com related changes
- Creates formatted commit
- For development workflow

---

## npm Scripts Reference

Available in `package.json`:

```json
{
  "scripts": {
    "start": "node server.js",
    "test:api": "node scripts/api-check.js",
    "test:e2e": "npx cypress run",
    "seed:test-user": "node scripts/create-test-user.js"
  }
}
```

---

## Troubleshooting

### "Agent not found for number"

The `TO_NUMBER` must:
1. Be in E.164 format: `+14155551234`
2. Exist in the `agents` table
3. Match exactly (no extra spaces)

Check with:
```sql
SELECT * FROM agents WHERE phone_number = '+14155551234';
```

### "Invalid token" on API check

The `TEST_API_TOKEN` must be a valid Supabase access token.
Get one by logging in and copying from browser dev tools.

### Scripts won't run

Make sure you have:
1. Node.js 20+
2. Dependencies installed: `npm install`
3. Environment variables set
