---
name: qa-api-integration
description: >
  Stage 5 of the QA pipeline, API track. Writes and extends the Playwright API
  test project in qa/07-automation/integration/ (APIRequestContext, no browser):
  read catalog, response contract, session handling, approved writes and
  endpoint discovery. Use when asked to test an API or endpoints, add an
  endpoint to the API catalog, write API or integration tests, check what the
  API returns without a session, enable an API write test, or discover the
  endpoints the screens call. Requires the integration scaffold installed by
  init; write tests also require a write approver named in
  qa/00-standards/write-safety-policy.md.
---

# QA Skill: API Integration Tests (Stage 5, API track)

**Stage**: 5 - Automation (API track). Same stage as `qa-automation`; it is not a new stage  
**Prerequisite**: `qa/07-automation/integration/` exists (scaffold installed by `init`). For tests that trace to a TC, the spec contains no `PENDING-CODE`  
**Output**: `qa/07-automation/integration/tests/{group}/{topic}.spec.ts`, catalog entries in `fixtures/`  
**Next stage**: Stage 5b - Stabilization (`qa-test-stabilization`) if tests fail, Stage 6 - Maintenance (`qa-maintenance`)

> **Blocking rules**
> 1. Every test is read-only unless it is a write test under `tests/write/` that passes the four gates of `qa/00-standards/write-safety-policy.md`. Never weaken a gate, the read catalog check or a hard exclusion to make a test pass.
> 2. Never assert only "responds 200". Assert the contract of `fixtures/contract.ts` first.
> 3. Never print, attach or commit a cookie, token, authorization header, password or field value of a response.

Project conventions (groups, envelope, timing references, known API observations) live in
`qa/00-standards/api-testing-conventions.md`. Read it before writing a test; update it when
you learn something about the API.

---

## When to use this skill, and when `qa-automation`

| The test... | Skill |
|---|---|
| drives the UI in a browser (`qa/07-automation/e2e/`) | `qa-automation` |
| calls HTTP endpoints only, no browser (`qa/07-automation/integration/`) | this skill |
| is an E2E test that calls an API to set up or clean data | `qa-automation`; that call follows the write-safety policy |

Both are stage 5: same prerequisites, same polarity rule, same stabilization stage after.

---

## Inputs Required

1. `qa/00-standards/api-testing-conventions.md` - project values and observations
2. `qa/00-standards/write-safety-policy.md` - only when the task touches a write
3. `qa/07-automation/integration/fixtures/read-catalog.ts` and `fixtures/contract.ts`
4. The spec or TC the test traces to, when there is one (`qa/01-specifications/`, test plan)
5. `qa/qa-framework.config.json` -> `project.qaBaseUrl` (the only host writes may target)

---

## What the scaffold gives you (use it, do not rebuild it)

| File | Role | Who edits it |
|---|---|---|
| `fixtures/base.ts` | Fixtures `api` (session) and `anonymous` (no session); `read()`, `write()`, `pickOwnRecord()`, `authenticatedClient()` | Framework |
| `fixtures/read-catalog.ts` | `READ_CATALOG`: every endpoint a test may read | Project |
| `fixtures/write-catalog.ts` | `WRITE_CATALOG` (empty), approvals, `TEST_RECORD_PREFIX` | Project, with the write approver |
| `fixtures/project-exclusions.ts` | `PROJECT_EXCLUSIONS`: additions to the hard exclusions | Project, add-only |
| `fixtures/contract.ts` | `expectJson`, `expectApiResponse`, `expectUnauthenticated`, `UNAUTHENTICATED_STATUSES`, `assertEnvelope` | Project, once |
| `scripts/api-guard.js`, `scripts/hard-exclusions.js` | Read check, the four write gates, environment check | Framework |
| `tests/security/` | `API-SEC-001..005` offline guard and catalog checks, `API-SEC-010` no session | Framework |
| `tests/write/example-write-cycle.spec.ts` | Model of the idempotent write cycle | Project adapts it |

Import `test` and `expect` from `../fixtures/base`, never from `@playwright/test` directly, and
never use Playwright's raw `request` fixture: it bypasses the read catalog check.

---

## Process

### Step 1 - Add the endpoint to the read catalog

1. Capture the real call (browser network tools on the screen that uses it, or the API
   documentation) and confirm it is a **query**: no side effect. An endpoint named like a
   query that reserves a number, marks something as seen, sends something or generates a
   file is a write (policy section 1) and never goes in the read catalog.
2. **Append it at the END of `READ_CATALOG`.** When test ids or generated titles follow
   catalog order, inserting in the middle renumbers every test after it and breaks the
   traceability of their results. Never reuse or renumber an id.
3. Fill `id` (short, stable, never reused), `name`, `method` (`GET`, or `POST` for queries
   that take filters in the body), `path` (relative to `QA_BASE_URL`, no leading slash,
   `{name}` placeholders filled from `params`), `body` (default POST body) and `auth`
   (`'required'` by default, `'none'` only if the API is public by design).
4. Leave user ids, page ids and download flags out of the path and body.
5. Delete the framework's `placeholder` example once a real entry exists.
6. Run `npm test`: `API-SEC-004` validates the catalogs offline.

**Generated catalogs: stable ids instead of order.** When a script generates entries (see
Step 7), derive each id from the route (for example a slug of method and path), not from a
counter. Adding or removing an endpoint then changes no other id. Keep the generated entries
in their own file marked "generated - do not edit" and merge it in `read-catalog.ts`
(`READ_CATALOG = [...HAND_WRITTEN, ...GENERATED]`); `validateCatalogs` rejects duplicate ids
across both.

### Step 2 - Set the response contract once per project

"Responds 200" proves nothing. Behind a gateway or a single-page app, a route that does not
exist often answers **HTTP 200 with the application's HTML page** instead of 404. A test that
checks only the status then passes against an endpoint that does not exist.

`fixtures/contract.ts` defaults to the generic part: every API response is JSON
(`expectJson`), a success is JSON + 2xx + envelope (`expectApiResponse`), a request without
a session is refused with a status of `UNAUTHENTICATED_STATUSES` (401 by default), as JSON,
without data (`expectUnauthenticated`).

Adapt it to the project, once:
- If the backend wraps responses in an envelope, implement `assertEnvelope` (the commented
  example in the file shows the shape). Use the API's own field names, **misspellings
  included**: "fixing" a misspelled field makes every assertion pass vacuously on
  `undefined`.
- If the API refuses anonymous calls with another status (403, for example), change
  `UNAUTHENTICATED_STATUSES`. Verify it against the API first; do not guess.
- Record the envelope and the verified statuses in section 0 of the conventions document.

The envelope is project data. Never copy another project's envelope as a rule.

### Step 3 - Write the test

```typescript
import { test, expect } from '../fixtures/base';
import { expectApiResponse } from '../fixtures/contract';

test('API-ITM-001 - items listing answers with the standard envelope @P1', async ({ api }) => {
  const response = await api.read('items-list', { body: { page: 1, pageSize: 10 } });
  expectApiResponse(response);
  expect(response.ms, 'reference time, not an SLA').toBeLessThan(20_000);
});
```

- Assert the contract first, then what the spec requires of this endpoint (shape of
  `data`, pagination, filters). Times are references from the conventions document, not SLAs.
- For paginated listings: no more rows than the page size, and page 2 does not repeat
  page 1. When the total fits in one page, skip the page-2 test with a message that says
  so; do not let it pass vacuously.
- Do not assert row content you have not seen documented: QA may hold a copy of production
  data, and a value-based assertion leaks it into the report.

### Step 4 - Assert what the specification requires, not what the API does today

If the API departs from the spec, keep the assertion the spec requires and mark the test:

```typescript
import { expectUnauthenticated } from '../fixtures/contract';

test('API-ITM-004 - listing without a session is refused @P0', async ({ anonymous }) => {
  test.fail(true, 'DEF-012: the listing answers 200 with data without a session. Remove when DEF-012 is resolved.');
  expectUnauthenticated(await anonymous.read('items-list'));
});
```

- Open the defect in `qa/06-defects/open/` first; the `test.fail()` message names it.
- `test.fail()` reports green while the defect exists and turns red the day the API is
  fixed, which tells you to remove the marker. Adapting the assertion to today's behavior
  hides the defect forever.
- Same polarity red flags as `qa-automation` Step 4b: `|| fallback`, `?.` to dodge a missing
  field, assertions that only run inside an `if`.

### Step 5 - The session

- The scaffold's `global-setup.ts` builds the session once per run: `QA_API_TOKEN` (sent
  as `Authorization: Bearer`) or a browser login with `QA_USER_EMAIL` and
  `QA_USER_PASSWORD`, saved to `.auth/api-session.json`.
- **Without a session, tests that need one fail, with a message saying how to get one.**
  They are not skipped: a silently skipped authenticated suite looks green and proves
  nothing. The `api` fixture already does this. Only a missing `QA_BASE_URL` skips (there
  is no environment to test), and `anonymous` tests never need a session.
- **The server decides whether a session is valid, not the age of the file.** If the
  project reuses a stored session (for example the e2e project's storageState) instead of
  logging in every run, check it against the server before the tests run: one protected
  read that must not be refused (a "current user" or "session status" endpoint). If the
  server refuses it, fail with renewal instructions. A file-age threshold either throws
  away sessions that are still valid or trusts expired ones.
- Respect the e2e lane lock when the session belongs to an e2e lane account: one account
  per lane at a time.
- Never write the session, the token or any header to logs or attachments. The client's
  attachments carry endpoint, method, path template, status, time, size and key names only.

### Step 6 - Enabling a write

Writes follow `qa/00-standards/write-safety-policy.md`; the scaffold enforces it. Do not
restate or relax it here. In short: tests live in `tests/write/`, run only with
`npm run test:write`, and each call passes four gates (opt-in, approved catalog entry, hard
exclusions, own records only) and the environment check.

Before enabling a write for a new entity, follow `references/enabling-writes.md`:
confirm it does not sync with external systems, find the real write routes, probe the
minimal body with a new record, record the approval and how to revert it, then write the
cycle. If no write approver is named in section 0 of the policy, stop: the write catalog
stays empty.

### Step 7 - Broad coverage: endpoint discovery (method)

To go from a few hand-written entries to the endpoints the screens actually call, use the
four-step method in `references/endpoint-discovery.md`: capture the calls of the screens in
read-only navigation, classify keeping only queries, verify each candidate against QA with
page 1 and few rows keeping only shape and totals, and generate a catalog with stable ids.
The framework documents the method; it ships no discovery code. Read its known limits before
trusting a generated catalog.

### Step 8 - Static check, smoke run and completion checklist

From `qa/07-automation/integration`:

```
npx playwright test --list
npx playwright test {spec} --reporter=list
```

`--list` loads every test file without calling the API: a syntax error or a broken import
fails here. Playwright strips types without checking them, and the scaffold ships no
TypeScript compiler; run `npx tsc --noEmit` only if the project installed `typescript`.

- [ ] `npx playwright test --list` exits 0
- [ ] `npm test` passes the offline security tests (`API-SEC-001..005`)
- [ ] New endpoints appended at the end of the catalog; no id changed
- [ ] Every test asserts the contract, not only the status
- [ ] Departures from the spec use `test.fail()` with an open defect
- [ ] No test skips for a missing session
- [ ] Write tests only under `tests/write/`, with catalog entries and approvals in the same change
- [ ] New observations about the API recorded in `api-testing-conventions.md`
- [ ] `qa/README.md` automation status updated

---

## Identifiers and file names

| Item | Convention | Example |
|---|---|---|
| Case id | `API-{GROUP}-{NNN}` | `API-ITM-001` |
| Case id, generated catalog | `API-{GROUP}-{stable-id}` | `API-SCR-get-items-list` |
| Test title | `{id} - {what is verified} @P{n}`, priority last | `API-ITM-001 - items listing answers with the standard envelope @P1` |
| Group | Module code from `qa/00-standards/naming-conventions.md` for module tests; a short cross-cutting code for the rest, listed in the conventions document | `ITM`, `LST` |
| Reserved groups | `SEC` (framework security tests), `WR` (write cycle model); `EX` is the example test you replace | - |
| File | `tests/{group-or-module}/{topic}.spec.ts`, kebab-case | `tests/items/items-listing.spec.ts` |
| Write tests | Only under `tests/write/` (the only folder `npm test` does not load) | `tests/write/items-cycle.spec.ts` |

If the case exists in Azure DevOps, add its id as a `TestCase` annotation as in the e2e
project (`qa-ado-integration`). Results are not published to ADO without authorization.

---

## Outputs

- `qa/07-automation/integration/tests/{group}/{topic}.spec.ts`
- Entries appended to `fixtures/read-catalog.ts` (and, with approval, `fixtures/write-catalog.ts`)
- `fixtures/contract.ts` adapted once per project
- `qa/00-standards/api-testing-conventions.md` updated (section 0 values, observations)
- `qa/README.md` automation status updated
