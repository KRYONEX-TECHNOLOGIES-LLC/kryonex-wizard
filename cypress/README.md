# Cypress E2E

This folder contains the Cypress regression suite for Kryonex.

## Specs
- `e2e/smoke.spec.js`: high-level smoke for core pages.
- `e2e/wizard-matrix.spec.js`: wizard permutations and persistence checks (Identity → Plan Selection → Stripe flow).
- `e2e/critical.spec.js`: critical-path checks.

## Run
From repo root:
```
npm run test:e2e
```

Override base URL if needed:
```
FRONTEND_BASE_URL=http://localhost:5173 npm run test:e2e
```

## Required Env
Set via terminal or CI secrets:
- `CYPRESS_TEST_EMAIL`
- `CYPRESS_TEST_PASSWORD`
- `CYPRESS_SUPABASE_URL`
- `CYPRESS_SUPABASE_ANON_KEY`

Optional:
- `MATRIX_LIMIT` (defaults to full matrix; set `100` or `1000` for sweeps)

## Notes
- Tests assume the frontend is running at `http://localhost:5173`
  (or `FRONTEND_BASE_URL`).
- The suite uses Supabase auth injection and localStorage flags to
  access protected routes quickly.
