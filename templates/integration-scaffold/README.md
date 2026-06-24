# API Integration Tests

Playwright-based API test project for `qa/07-automation/integration/`.

Tests run without a browser. All tests use Playwright's `APIRequestContext`
to call HTTP endpoints directly. Auth state is established once by
`global-setup.ts` and reused across the test run.

## Requirements

- Node.js 18+
- `@playwright/test` (installed via `npm install` in this directory)

## Setup

```bash
cd qa/07-automation/integration
npm install
cp .env.example .env
# Edit .env and fill in QA_BASE_URL and auth credentials
```

Add the following to your root `.gitignore`:

```
qa/07-automation/integration/.env
qa/07-automation/integration/.auth/
qa/07-automation/integration/test-results/
qa/07-automation/integration/playwright-report/
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `QA_BASE_URL` | Yes | Base URL of the API under test |
| `QA_API_TOKEN` | One of | Static bearer token for token-based APIs |
| `QA_USER_EMAIL` | One of | Email/username for browser-login APIs |
| `QA_USER_PASSWORD` | One of | Password for browser-login APIs |

See `.env.example` for all supported variables.

## Running tests

```bash
# All tests
npm test

# CI mode (retries enabled)
npm run test:ci

# Open HTML report
npm run report
```

## Writing tests

Import from `@playwright/test` and use the `request` fixture:

```typescript
import { test, expect } from '@playwright/test';

test('GET /users returns 200', async ({ request }) => {
  const response = await request.get('/users');
  expect(response.status()).toBe(200);
});
```

For token-based APIs that require an `Authorization` header, pass it per request:

```typescript
const response = await request.get('/api/protected', {
  headers: { Authorization: `Bearer ${process.env.QA_API_TOKEN}` },
});
```

See `tests/example.spec.ts` for a starter test to replace.
