# Endpoint discovery - the method

> A documented method, not shipped code. The framework does not include discovery
> scripts: they depend on how each application builds its menu, its routes and its
> session. A project that automates the method writes its own scripts and keeps them in
> its own repository.

Purpose: go from a few hand-written catalog entries to the read endpoints the screens
actually call, without hand-writing one test per endpoint.

Prerequisites:
- A valid session for a QA account (see SKILL.md Step 5).
- A go-ahead for the run that states the account or lane it uses: steps 1 and 3 call the
  shared QA environment many times, which is a load run for policy section 6 even when
  every call is a read.
- `.gitignore` covers the working folder of the method (for example `.discovery/`).

---

## The four steps

### 1. Capture the calls of the screens, read-only

Drive the application's screens with a browser (Playwright is enough) and record every
request to the API: method, path and request body.

- Open each screen of the menu and wait for its initial load. **Click nothing**: no
  buttons, no saves, no row actions. Navigation must be read-only.
- Store method, path and request body only. Never response bodies, cookies or headers.
- Allow a limit (first N screens) for a quick trial run before the full menu.
- Normalize paths to how the test client calls them (relative to `QA_BASE_URL`). A capture
  tool that drops a gateway prefix must add it back, or every candidate fails in step 3.

### 2. Classify: keep only queries

From the captured calls, keep a candidate only when all of these hold:

- Method is `GET`, or `POST` with filters or paging in the body.
- The name has no write verb (create, register, save, edit, update, delete, send, process,
  generate, export, import, download, approve, and the project's own equivalents).
- No user id, page id or download flag in the path or the body.
- No hard exclusion matches it: `matchExclusion([path], PROJECT_EXCLUSIONS)` from
  `scripts/api-guard.js` returns `null`. Exclusions guard writes, but a read whose route
  matches one is not worth the doubt.

Deduplicate by method and path. When in doubt, drop it: a missed query costs coverage, a
write classified as a query costs data. Dropping by name also removes some real queries;
that is accepted. A person reviews the classified list before step 3.

### 3. Verify each candidate against QA

Call each candidate once, sequentially, against the QA environment:

- Page 1 with a small page size (for example 10 rows).
- Keep only: status, content type, the shape of the response (top-level key names, type of
  `data`) and totals. **Never row values**: QA may hold a copy of production data.
- Classify the result: ok (JSON, success, expected shape), different shape, empty result
  for the captured filter, error, not JSON (the route probably does not exist).

The verifier sends only the candidates that step 2 kept, with their captured method. It is
the only part of the method that runs outside the test client, so it must not take any
other input.

### 4. Generate the catalog

Write the verified candidates (status ok only) to a generated catalog file:

- Mark it as generated and never edit it by hand; adjustments go in the hand-written
  catalog or in the generator.
- Give each entry a **stable id derived from the route** (a slug of method and path), not
  a counter, so regenerating after adding or removing endpoints renumbers nothing.
- Merge it into `READ_CATALOG` in `fixtures/read-catalog.ts`; `API-SEC-004` rejects
  duplicate ids.
- Tests iterate the generated catalog and use ids `API-{GROUP}-{stable-id}`: one structure
  test per endpoint, and a page-2 test only for listings with more than one page.

Report the counts of each step (screens, distinct endpoints, candidates, verified, dropped
and why) in `qa/00-standards/api-testing-conventions.md`, section 7.

---

## Known limits

- **Captured filters are frozen.** Dates, text filters and selected ids in a captured body
  stay as they were on the capture day. A filter that expires or a lookup table that
  empties makes its test fail without an API defect. Classify such a failure before
  opening a defect (`qa-test-stabilization`).
- **Only initial loads are captured.** Calls fired by tabs, dialogs, lazy dropdowns or
  searches do not appear unless the capture interacts with them, and interacting risks
  pressing something that writes.
- **Writes are never discovered.** Read-only navigation shows queries only; write routes
  need `enabling-writes.md`.
- **Name-based classification is a heuristic.** It drops some real queries and cannot see
  a query that has a side effect. The human review in step 2 is not optional.
- **Truncated captures.** A capture tool may cut long request bodies; such candidates fail
  step 3 and are dropped.
- **Shallow verification.** Page 1 with few rows checks structure and paging, not row
  content or business rules. Endpoints with their own rules still need hand-written tests.
