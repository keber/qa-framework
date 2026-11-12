# Review request: wave 2 - API testing and write safety

**For**: marcela.berriosc
**Prepared by**: the release coordinator, 2026-11-12
**Release candidate**: `@keber/qa-framework@1.14.0-rc.3` (npm dist-tag `next`)
**Status**: awaiting your review before 1.14.0 is promoted to `latest`

## Why you are asked

Wave 2 ports into the framework the API testing work you built in your project:
the write governance, the integration test project, and your API testing
conventions. Once promoted, your decisions become the defaults for every project
that uses the framework. Nothing here reaches any project until Keber promotes
it, and he promotes only after your review.

Your own project is not affected: its `qa/07-automation/integration/` is
user-owned code, so `upgrade` never touches it (verified by simulation).

## What was ported

| Your original | In the framework |
|---|---|
| `qa/00-standards/api-testing-conventions.md` section 6c | `templates/write-safety-policy.md`, installed as `qa/00-standards/write-safety-policy.md` |
| `qa/07-automation/integration/` (catalogs, `fixtures/base.ts`, security tests) | `templates/integration-scaffold/`: read-only guard, four write gates, add-only hard exclusions, configurable response contract, example tests |
| `qa/00-standards/api-testing-conventions.md` (the rest) | `skills/qa-api-integration/` and `templates/api-testing-conventions.md` |
| `.github/skills/qa-performance-k6/` safety rules | Section 6 of the write-safety policy ("Writes under load"). The k6 skill itself is wave 3 |

What was deliberately NOT ported: your endpoints, request bodies, the
`{ isSucess, data, message, errors }` envelope as a default (it is a commented
example, with a warning to keep the API's own spelling), internal system names,
the figures of your suite, and the bulk master-entity script and candidate CSV
(only their principle remains: each entity needs its own approval).

## How to try it

In an empty folder, not in your project:

```bash
npm init -y
npm install @keber/qa-framework@next
```

That scaffolds `qa/`. The policy is in `qa/00-standards/`, the scaffold in
`qa/07-automation/integration/`, the skill in `.github/skills/qa-api-integration/`.

## Decisions to review

Grouped by where they live. Each one is a default every project will inherit.

### The policy (`write-safety-policy.md`)

1. **Scope names are English**: `isolated` / `syncs` / `forbidden`. Your
   `aislado` / `sincroniza` / `prohibido` are rejected, not accepted as aliases.
2. **Approver is a blank each project fills** (section 0). The framework does not
   assume a role.
3. **Default exclusion categories**: email and notifications, dispatches and
   legal or customs documents, sends to external or production systems, file
   generation or downloads, bulk operations. A project can add patterns; it can
   never remove these.

### The scaffold (`templates/integration-scaffold/`)

4. **Opt-in variable is `QA_API_WRITE`, exactly `"1"`.** `"true"` or `"yes"` keep
   writes closed. A write run never retries.
5. **Gate 4 is enforced on the client side.** `write()` requires a `testRecord`
   name that carries the prefix and is longer than it. The client cannot verify
   that the request body really targets that record; the test author must.
6. **Writes require `project.qaBaseUrl` in the manifest** even when `QA_BASE_URL`
   is set, and the target host must match it and never contain `prod`.
7. **Exclusion matching**: patterns are checked against the path as written and
   against the path with camelCase split into words, with word boundaries on
   short words so `UserProfile` or `Sprint` are not blocked. `production` is not a
   path pattern because it is a common entity name; production hosts are stopped
   by the environment check instead.
8. **`read()` also refuses an endpoint declared in the write catalog.**
9. **No session means the `api` fixture fails, it does not skip.** In an
   unattended run a skip would turn the suite green while testing nothing.
10. **Token auth fixed.** The previous scaffold stored the token in
    `localStorage`, which `APIRequestContext` never reads, so token auth never
    worked. It is now sent as a Bearer header.
11. **`global-setup` no longer aborts without a URL or credentials**: it writes an
    empty session, and tests that need a session then fail with a clear message.
12. **Spec file pattern**: `*.api.spec.ts` was not adopted as a `testMatch`, so
    existing specs with other names are not silently excluded.

### The skill and conventions

13. **Minimum-body probe moved after registering the approval** (`enabling-writes.md`).
    In the scaffold no write leaves without an approved catalog entry (gate 2), so
    the order of your procedure was inverted.
14. **Endpoint discovery's verification step counts as a load run** under policy
    section 6, so it needs an explicit go-ahead naming the account or lane.
15. **Reserved test groups and file naming**: `API-{GROUP}-{NNN}`, with `SEC` and
    `WR` reserved.
16. **Section 0 of the conventions template**: which project values it asks for.

### Delivery to existing projects (`upgrade`)

17. **`package.json` is never edited.** If the `test:write` script is missing,
    `upgrade` prints the line to add.
18. **`fixtures/base.ts` counts as framework logic** (it enforces the gates): it is
    refreshed when untouched, and a project-owned `base.ts` blocks installing
    anything that depends on the framework's version, with a warning.

## How to answer

A short note to Keber is enough: "OK", or the numbers you disagree with and why.
Disagreements are fixed in a new release candidate before promotion.
