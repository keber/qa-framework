# API Testing Conventions

> Reference: `qa/00-standards/api-testing-conventions.md`
> Applies to the API test project in `qa/07-automation/integration/` (Playwright
> `APIRequestContext`, no browser).

This document holds the **project's** values and observations about its API. The method
lives elsewhere and is not repeated here:

| Topic | Source of truth |
|---|---|
| How to add endpoints, the response contract, the session, discovery, ids | Skill `qa-api-integration` (`.github/skills/qa-api-integration/SKILL.md`) |
| Anything that writes: the four gates, scopes, exclusions, record lifecycle, load | `qa/00-standards/write-safety-policy.md` |
| Setup, environment variables, commands | `qa/07-automation/integration/README.md` |

When this document disagrees with the write-safety policy, the policy wins.

---

## 0. Project values (fill in once, keep current)

| Field | Value |
|---|---|
| API base and path pattern | `<for example: same origin as the app, routes under api/...>` |
| Authentication | `<bearer token / session cookie from a browser login / other>` |
| Session source | `<logs in every run / reuses a stored session from ...>` |
| Session check against the server | `<endpoint that tells whether the session is valid, if the session is reused>` |
| Response envelope | `<none / its exact field names, misspellings included>` |
| Status without a session | `<verified status and body, with the date it was verified>` |
| Reference times (not SLAs) | `<for example: lookups under 10 s, paginated listings under 20 s>` |
| Test record prefix | `<TEST_RECORD_PREFIX of fixtures/write-catalog.ts>` |

Values marked `<...>` are not verified yet. Do not write a test that depends on one.

## 1. Scope

- Read-only by default: `npm test` runs queries only, and the test client rejects any call
  outside `fixtures/read-catalog.ts`.
- Writes: only as the write-safety policy allows, with `npm run test:write`.
- Performance and load testing are not done in this project.
- Out of scope for this project: `<systems, routes or areas the API tests never touch>`

## 2. Test groups

Case ids follow `API-{GROUP}-{NNN}` (generated catalogs: `API-{GROUP}-{stable-id}`).
Module tests use the module code of `naming-conventions.md`. Cross-cutting groups of this
project:

| Group | Covers | Folder |
|---|---|---|
| `SEC` | Framework security tests (reserved) | `tests/security/` |
| `WR` | Framework write cycle model (reserved) | `tests/write/` |
| `<CODE>` | `<for example: lookups and catalogs>` | `tests/<folder>/` |

When test numbering follows catalog order, new endpoints are appended at the end of the
catalog: existing ids never change.

## 3. What every test verifies

| Check | Rule |
|---|---|
| Content type | JSON. "Responds 200" alone proves nothing (an unknown route may answer 200 with the app's HTML) |
| Status | 2xx on a valid query; the status of section 0 without a session |
| Envelope | The shape of section 0, checked by `fixtures/contract.ts` |
| Shape of `data` | `<per kind of endpoint: lookups, paginated listings, ...>` |
| Pagination | No more rows than the page size; page 2 does not repeat page 1 |
| Time | The references of section 0, reported, not enforced as SLAs |

A test asserts what the specification requires, not what the API returns today. A
departure is marked with `test.fail()` and an open defect in `qa/06-defects/open/`.

## 4. Session

- Without a valid session, tests that need one fail with instructions; they are never
  skipped. The server decides whether a session is valid, not the age of a file.
- How to renew it in this project: `<steps or command>`
- `<lane or account rules, if the session belongs to a shared test account>`

## 5. Data and governance

- `<state whether QA holds a copy of production data>`. Report attachments keep endpoint,
  status, time, size and key names only, never field values.
- Do not assume the structure of sensitive data that has not been documented. Document a
  new field here before asserting on it.
- Never print, attach or commit cookies, tokens, authorization headers or passwords.

## 6. Known observations about the API

Facts learned while testing that are not tests themselves: quirks, required filters,
minimal bodies accepted by write endpoints, differences between the API and the screen for
the same field. Date each entry.

| Date | Endpoint or entity | Observation |
|---|---|---|
| `<YYYY-MM-DD>` | `<...>` | `<...>` |

## 7. Generated catalogs

If the project uses endpoint discovery (skill `qa-api-integration`,
`references/endpoint-discovery.md`), record each run here: date, screens visited, distinct
endpoints, candidates, verified, and what was dropped and why. Generated catalog files are
not edited by hand.

| Date | Screens | Endpoints | Candidates | Verified | Dropped (reason) |
|---|---|---|---|---|---|
| `<YYYY-MM-DD>` | | | | | |
