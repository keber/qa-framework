# Enabling a write for a new entity

> Applies `qa/00-standards/write-safety-policy.md` to the scaffold in
> `qa/07-automation/integration/`. The policy wins where this page and it disagree.

Prerequisite: a write approver is named in section 0 of the policy. Without one, stop here:
the write catalog stays empty and every test is read-only.

---

## The procedure

Do these steps in order, for one entity at a time. Each step that finds a reason not to
enable the entity ends the procedure for that entity.

### 1. Confirm it does not sync with external systems

Ask the write approver, naming the entity and the routes you expect to call:

- Does creating, editing or deactivating it replicate to, notify or trigger another system
  (an ERP, a mailer, a tax or customs service, another company system, a file export)?
- If yes: is every system it can reach a non-production instance? Which ones?

Map the answer to a scope (policy section 3):

| Answer | Scope | Next |
|---|---|---|
| Verified: affects only this entity's own data in QA | `isolated` | Continue |
| Reaches other systems, all named and non-production | `syncs` | Continue; the approval needs `downstream` |
| Unknown | `syncs` until proven `isolated` | Get the downstream statement first |
| Reaches any production system | `forbidden` | Record it as `forbidden` and stop |

If the routes match a hard exclusion category (email and notifications, dispatches and
legal documents, transmission to external or production systems, file generation, bulk
operations), stop: gate 3 blocks it whatever the catalog says, and `API-SEC-004` fails on
such an entry unless it is `forbidden`.

### 2. Find the real write routes

Navigating screens only shows queries: the write routes are not in a read-only capture.
Sources, in order of preference:

1. The API documentation (OpenAPI or equivalent), if it exists and matches the deployed API.
2. One real cycle performed **by a person from the screen**, with the browser network panel
   recording, on a record named with the test prefix. That cycle is a manual write in QA:
   it needs the approver's go-ahead like any other.
3. The application's public front-end bundles, read as text only (search for route
   fragments). Routes built from generic templates often appear incomplete there; confirm
   them with a real capture before using them.

Write down method and path of every route the cycle needs: create, edit, activate or
deactivate, and delete only if the system has one.

### 3. Record the approval in the write catalog

The approver records one entry per route in `fixtures/write-catalog.ts`:

```typescript
{
  id: 'items-edit',
  name: 'Items - edit',
  method: 'PUT',
  path: 'api/items/{id}',
  scope: 'isolated',
  approval: {
    by: '<the write approver named in section 0>',
    date: 'YYYY-MM-DD',
    revert: 'Edit again with the previous value; the cycle leaves the record inactive',
  },
},
```

- `by`, `date` and `revert` are required; `syncs` also requires `downstream`. Placeholder
  values such as `<...>` count as missing: gate 2 rejects the entry.
- The approval accepts the cost of policy section 5: one permanent inactive test record per
  entity when the system has no delete.
- A script may help gather candidate routes for many entities at once, but each entity
  still needs its own approval entry. A generated or suggested risk level is a suggestion,
  not an approval.

### 4. Probe the minimal body with a new record

Before writing the full cycle, find the smallest body the API accepts:

1. Write a single test in `tests/write/` that creates the record `TEST_RECORD_PREFIX` +
   entity with the fewest fields, then reads it back with a separate read and deactivates it.
2. Run only that test: `npm run test:write -- -g "<its title>"`.
3. Record the result in section 6 of `qa/00-standards/api-testing-conventions.md`: accepted
   body, required fields, rejection messages. A rejected create must leave nothing: confirm
   it with a read.
4. Note any rule that differs between the API and the screen for the same field (for
   example one normalizes text and the other stores it as typed). That is a question for
   the spec owner, not something to assert either way until it is answered.

### 5. Write the cycle

Adapt `tests/write/example-write-cycle.spec.ts` (policy section 5): create if absent,
reactivate, exercise one write and assert only that field changed, deactivate and assert
the final state with a separate read, and always end inactive in `afterAll`. Add a check
that the write is refused without a session (`anonymous` fixture).

The catalog entries and the cycle go in the same change, reviewed by the approver.

---

## What never to enable

- Anything in a hard exclusion category, or matching a `PROJECT_EXCLUSIONS` pattern.
- Numbering or sequence tables (they consume real numbers).
- Bulk operations, even if each record would be a test record.
- Anything whose downstream effect cannot be stated.
