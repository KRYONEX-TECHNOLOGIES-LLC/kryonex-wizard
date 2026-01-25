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
