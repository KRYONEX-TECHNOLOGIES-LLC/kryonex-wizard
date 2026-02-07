# Cypress E2E Testing

End-to-end test suite for the Kryonex Wizard platform.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Test Specs](#test-specs)
3. [Environment Variables](#environment-variables)
4. [Running Tests](#running-tests)
5. [Test Architecture](#test-architecture)
6. [Writing Tests](#writing-tests)
7. [Troubleshooting](#troubleshooting)

---

## Quick Start

```bash
# Install Cypress (if not already)
npm install

# Set environment variables
$env:CYPRESS_TEST_EMAIL="test@example.com"
$env:CYPRESS_TEST_PASSWORD="password123"

# Run all tests (headless)
npm run test:e2e

# Run specific spec
npx cypress run --spec "cypress/e2e/smoke.spec.js"

# Open Cypress UI (interactive)
npx cypress open
```

---

## Test Specs

| Spec | Description | Coverage |
|------|-------------|----------|
| `smoke.spec.js` | Core functionality smoke tests | Dashboard, Leads, Calendar, Messages, Black Box, Analytics, Settings |
| `critical.spec.js` | Critical path validation | Authentication, core navigation |
| `wizard-matrix.spec.js` | Wizard flow permutations | Form submission, persistence, Stripe flow |

### Smoke Tests (`smoke.spec.js`)

High-level tests for each major page:

- Dashboard loads with KPIs
- Leads table renders with data
- Calendar displays appointments
- Messages inbox loads
- Black Box shows recordings
- Analytics charts render
- Settings form saves

### Critical Tests (`critical.spec.js`)

Essential path validation:

- User can authenticate
- Protected routes redirect to login
- Dashboard loads after auth
- Navigation works

### Wizard Matrix (`wizard-matrix.spec.js`)

Tests wizard field combinations:

- Identity step submission
- Form data persistence
- Step navigation
- localStorage handling

---

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `CYPRESS_TEST_EMAIL` | Test user email |
| `CYPRESS_TEST_PASSWORD` | Test user password |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `CYPRESS_SUPABASE_URL` | From `.env` | Supabase URL |
| `CYPRESS_SUPABASE_ANON_KEY` | From `.env` | Supabase anon key |
| `FRONTEND_BASE_URL` | `http://localhost:5173` | Frontend URL |
| `MATRIX_LIMIT` | Full matrix | Limit wizard combinations |

### Setting Variables

**PowerShell:**
```powershell
$env:CYPRESS_TEST_EMAIL="test@example.com"
$env:CYPRESS_TEST_PASSWORD="password123"
npm run test:e2e
```

**Bash:**
```bash
export CYPRESS_TEST_EMAIL="test@example.com"
export CYPRESS_TEST_PASSWORD="password123"
npm run test:e2e
```

**One-liner:**
```bash
CYPRESS_TEST_EMAIL=test@example.com CYPRESS_TEST_PASSWORD=pass npm run test:e2e
```

---

## Running Tests

### Headless (CI)

```bash
npm run test:e2e
```

### Interactive UI

```bash
npx cypress open
```

### Single Spec

```bash
npx cypress run --spec "cypress/e2e/smoke.spec.js"
```

### With Video Recording

```bash
npx cypress run --config video=true
```

### Different Browser

```bash
npx cypress run --browser chrome
```

---

## Test Architecture

### Authentication

Tests use `cy.session()` for efficient auth:

```javascript
cy.session(['login', email], () => {
  // Supabase auth flow
});
```

### Interceptors

API calls are intercepted for reliability:

```javascript
cy.intercept('GET', '/api/leads').as('getLeads');
cy.wait('@getLeads');
```

### Custom Commands

Common actions are wrapped:

```javascript
// Login command
Cypress.Commands.add('login', (email, password) => {
  // ...
});
```

### localStorage Handling

Wizard tests verify persistence:

```javascript
cy.window().then((win) => {
  const form = JSON.parse(win.localStorage.getItem('kryonex:wizard.form'));
  expect(form.business_name).to.equal('Test Business');
});
```

---

## Writing Tests

### Basic Structure

```javascript
describe('Feature Name', () => {
  beforeEach(() => {
    cy.session(['login', email], () => {
      // Auth setup
    });
    cy.visit('/page');
  });

  it('should do something', () => {
    cy.get('.selector').should('be.visible');
    cy.contains('Expected Text');
  });
});
```

### Best Practices

1. **Use data-testid attributes** for reliable selectors
2. **Wait for API calls** with `cy.intercept()` and `cy.wait()`
3. **Avoid hardcoded waits** like `cy.wait(1000)`
4. **Clean up after tests** that modify data
5. **Use `cy.session()` for auth** to speed up tests

### Selectors

Prefer stable selectors:

```javascript
// Good
cy.get('[data-testid="submit-btn"]')
cy.contains('Submit')

// Avoid (fragile)
cy.get('.btn-primary:nth-child(2)')
```

---

## Troubleshooting

### "Expected undefined to be a string" (credentials)

Environment variables not set:

```powershell
# Check if set
echo $env:CYPRESS_TEST_EMAIL

# Set them
$env:CYPRESS_TEST_EMAIL="test@example.com"
$env:CYPRESS_TEST_PASSWORD="password123"
```

### Tests timing out

1. Increase timeout in `cypress.config.js`:
   ```javascript
   defaultCommandTimeout: 10000
   ```

2. Check if frontend is running:
   ```bash
   cd frontend && npm run dev
   ```

3. Check if backend is running:
   ```bash
   npm start
   ```

### Element not found

1. Check if element is in viewport
2. Add explicit wait:
   ```javascript
   cy.get('.element', { timeout: 10000 })
   ```
3. Verify selector is correct

### Auth failures

1. Verify test user exists (run `npm run seed:test-user`)
2. Check password is correct
3. Ensure email is verified in Supabase

### localStorage issues

Wizard uses user-specific keys:
```
kryonex:wizard.form.{userId}
```

Clear and retry:
```javascript
cy.clearLocalStorage();
```

---

## CI/CD Integration

### GitHub Actions

```yaml
- name: Run E2E Tests
  env:
    CYPRESS_TEST_EMAIL: ${{ secrets.CYPRESS_TEST_EMAIL }}
    CYPRESS_TEST_PASSWORD: ${{ secrets.CYPRESS_TEST_PASSWORD }}
  run: npm run test:e2e
```

### Required Secrets

Set in GitHub repository settings:
- `CYPRESS_TEST_EMAIL`
- `CYPRESS_TEST_PASSWORD`

---

## Configuration

### cypress.config.js

```javascript
module.exports = {
  e2e: {
    baseUrl: 'http://localhost:5173',
    defaultCommandTimeout: 10000,
    video: false,
    screenshotOnRunFailure: true,
    specPattern: 'cypress/e2e/**/*.spec.{js,ts}',
  },
};
```

### Folder Structure

```
cypress/
├── e2e/
│   ├── smoke.spec.js
│   ├── critical.spec.js
│   └── wizard-matrix.spec.js
├── support/
│   ├── commands.js
│   └── e2e.js
├── fixtures/
│   └── (test data)
└── README.md
```

---

## Notes

- Tests assume frontend at `http://localhost:5173` (or `FRONTEND_BASE_URL`)
- Backend must be running for API tests
- Test user should have appropriate permissions
- Wizard tests verify localStorage persistence across steps
- Business name persists in `kryonex:wizard.form.{userId}` after Stripe checkout
