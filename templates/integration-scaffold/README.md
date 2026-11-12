# API Integration Tests

Playwright-based API test project for `qa/07-automation/integration/`. No browser:
tests call HTTP endpoints through Playwright's `APIRequestContext`.

**Read-only by default.** The test client rejects, before sending anything, every
request that is not in `fixtures/read-catalog.ts`. Writes are an explicit,
approved opt-in that `npm test` never enables. The rules are in
`qa/00-standards/write-safety-policy.md`; this project implements them.

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
| `QA_BASE_URL` | To call the API | Base URL of the API under test. Without it, tests that call the API are skipped with a message; the offline guard tests still run |
| `QA_API_TOKEN` | One of | Static bearer token, sent as `Authorization: Bearer` |
| `QA_USER_EMAIL` | One of | Email/username for browser-login APIs |
| `QA_USER_PASSWORD` | One of | Password for browser-login APIs |
| `QA_API_WRITE` | Never set it yourself | Opens write gate 1. Set only by `npm run test:write`, for that run. The config refuses to start if `.env` defines it |

See `.env.example` for all supported variables. Tests using the authenticated
`api` fixture fail (they do not skip) when no session is available, so a missing
session is never reported as green.

## Running tests

```bash
npm test             # read-only suite; never loads tests/write/
npm run test:ci      # CI mode (retries enabled)
npm run test:write   # WRITE tests only (tests/write/), opt-in, see below
npm run report       # open the HTML report
```

## Structure

| Path | Content | Who edits it |
|---|---|---|
| `fixtures/base.ts` | Fixtures `api` (authenticated) and `anonymous` (no session); `read()` and `write()` | Framework |
| `fixtures/read-catalog.ts` | Endpoints the tests may read | Project |
| `fixtures/write-catalog.ts` | Endpoints the tests may write, with approvals; `TEST_RECORD_PREFIX` | Project, with the write approver |
| `fixtures/project-exclusions.ts` | Project additions to the hard exclusions | Project |
| `fixtures/contract.ts` | Response contract: JSON, unauthenticated status, optional envelope | Project, once |
| `scripts/api-guard.js` | Guard logic: read catalog check, the four write gates, environment check | Framework |
| `scripts/hard-exclusions.js` | Framework hard exclusions (add-only) | Framework |
| `scripts/run-write-tests.js` | `npm run test:write` | Framework |
| `tests/security/` | Guard, catalog and no-session tests (`API-SEC-nnn`) | Framework examples |
| `tests/write/` | Write tests, loaded only by `npm run test:write` | Project |

The guard logic is plain JavaScript with no dependencies, so it is unit-tested
with `node --test` in the framework repository and every decision it makes is
reproducible without a network.

## Reading

```typescript
import { test } from '../fixtures/base';
import { expectApiResponse } from '../fixtures/contract';

test('API-ITM-001 - items listing answers with JSON @P1', async ({ api }) => {
  const response = await api.read('items-list', { body: { page: 1, pageSize: 10 } });
  expectApiResponse(response);
});
```

`api.read(id)` or `api.read({ method, path })` reaches only entries of
`fixtures/read-catalog.ts`, with the catalogued method. A known path with another
method is a different endpoint and is rejected. Path placeholders such as
`api/items/{id}` are filled from `params` and URL-encoded.

To add an endpoint, follow the steps at the top of `fixtures/read-catalog.ts`.
Always append at the end, so existing ids never change.

### The response contract

`fixtures/contract.ts` defaults to a generic contract: every API response must be
JSON. Behind a gateway or a single-page app, a route that does not exist often
answers **HTTP 200 with the application's HTML page**, so "responds 200" proves
nothing. `expectApiResponse` asserts JSON first; `expectUnauthenticated` asserts
the configured status (401 by default) and JSON without data.

If your backend wraps responses in an envelope, add its check to `assertEnvelope`
in that file (a commented example is included). Use the API's own field names,
misspellings included.

## Writing (opt-in)

`npm test` **never writes**: `tests/write/` is not loaded and the client refuses
every write at gate 1. A write leaves the client only when all four gates pass, in
this order; each failure throws before sending and names its gate:

1. **Opt-in** - `QA_API_WRITE=1`, set only by `npm run test:write`.
2. **Approved catalog entry** - the endpoint is in `fixtures/write-catalog.ts` with
   who approved it, when, its scope (`isolated`, `syncs` or `forbidden`) and how
   its effect is reverted. `forbidden` never passes; `syncs` also needs the
   downstream statement.
3. **Hard exclusions** - the path matches no exclusion: the framework categories
   (email and notifications, dispatches and legal documents, transmission to
   external or production systems, file generation, bulk operations) plus the
   project's additions. Independent of the catalog.
4. **Own records only** - the test declares the record it targets, named with
   `TEST_RECORD_PREFIX`, and finds it with `pickOwnRecord()`: exactly one match, or
   the test fails.

Then the environment check: the run's host must equal `project.qaBaseUrl` of
`qa/qa-framework.config.json`, and never look like production. Write runs never
retry.

```typescript
await api.write('items-edit', {
  testRecord: 'QA-API-ITEM',
  params: { id: record.id },
  body: { description: 'edited' },
});
```

`tests/write/example-write-cycle.spec.ts` is a model of the idempotent cycle for
systems without delete (create if absent, reactivate, edit, deactivate, always end
inactive). It skips until the write catalog holds the entries it names.

### Adding a write endpoint

1. A write approver must be named in section 0 of the write-safety policy.
2. The approver records the entry in `fixtures/write-catalog.ts`, in the same
   change as the test that uses it.
3. Run `npm test`: `tests/security/catalogs.spec.ts` rejects incomplete approvals,
   entries that a hard exclusion would always block, and overlaps with the read
   catalog.

### Hard exclusions are add-only

Add concrete names of your project (internal systems, integration routes) to
`fixtures/project-exclusions.ts`. That file can only add: the guard always
evaluates the full framework list first and refuses entries with any key other
than `category`, `pattern` and `reason`. Relaxing a framework exclusion is not a
project setting; raise it with the write approver and the framework maintainers.
