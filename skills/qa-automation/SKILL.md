---
name: qa-automation
description: >
  Stage 5 of the QA pipeline. Implements Playwright test automation from
  approved specifications. Generates spec files, page objects, fixtures, and
  configures the test runner.
  Use when asked to automate tests, write Playwright specs, implement automation,
  implement test scripts, code the e2e suite, or generate .spec.ts files.
  Requires completed specifications with no PENDING-CODE sections (Stage 2 complete,
  Stage 4 recommended).
---

# QA Skill: Automation Generation (Stage 5 of 6)

**Stage**: 5 — Automation  
**Prerequisite**: All specs for the target submodule are complete and contain no `PENDING-CODE` sections  
**Output**: `qa/07-automation/e2e/{module}/{submodule}.spec.ts` + supporting files  
**Next stage**: Stage 6 — Maintenance (`qa-maintenance`) or Stage 5b — Stabilization (`qa-test-stabilization`) if tests fail

> **Pipeline rule**: Never automate a TC whose spec contains `PENDING-CODE`. Resolve spec gaps first.

---

## Inputs Required

1. `qa/01-specifications/{module}/` — full spec set for target submodule
2. `qa/07-automation/playwright.config.ts` — confirm project name maps to submodule tag
3. `qa/07-automation/fixtures/auth.ts` — identify available auth fixtures
4. TC list (from test plan or Stage 4) — defines which TCs to automate in this session

---

## Process

### Step 0 — Pre-inspection (MANDATORY before writing any test code)

For every new submodule, run a dedicated inspection script before writing tests.
**Template**: `references/dom-inspection-template.js` — copy, set the 4 constants at the top, run.

1. Copy `references/dom-inspection-template.js` → `qa/07-automation/_inspect-{submodule}.js`
2. Set the 4 constants at the top of the script:
   - `MODULE_ROUTE` — the submodule's URL path (e.g. `'/Users'`, `'/Products/list'`)
   - `APP_SHELL_SEL` — a selector that confirms the SPA has loaded (nav, sidebar, app shell)
   - `CREATE_BTN` — regex matching the create/new button label in this app
   - `BASE_URL` — already read from `process.env.QA_BASE_URL`
3. Run: `QA_BASE_URL=<env> node _inspect-{submodule}.js`
4. Paste key findings as a comment block at the **top of the `.spec.ts` file** before writing any test:
   ```
   // INSPECTION: {date}
   // Grid headers: [...]
   // Create form: inputs[0]=Name(maxLen=100), dd[0]=Category(lazy=true)
   // Validation msg: "El campo Nombre es obligatorio."
   // API: POST /api/{Entity} { pageNumber, pageSize }
   ```

The template covers 5 inspection areas automatically: SPA warmup, list view (grid headers + seed row + buttons), create form (all input types, tabs, validation messages), unauth redirect, and API call interception. Adapt the script for tabs or nested forms by adding steps after the create form section.

**Never skip this step for submodules inside complex forms (tabs, dialogs, nested entities).
The cost of one inspection run is far lower than 10+ debugging iterations.**

### Step 1 — Scan for blockers

Before writing a line of code:
- Search all spec files for `PENDING-CODE` — stop and flag if found
- Confirm `playwright.config.ts` exists; scaffold it if missing using `references/config-checklist.md`
- Verify `fixtures/auth.ts` has the roles required by this submodule

### Step 2 — Scaffold spec file

Full spec file template and 7 implementation patterns: `references/patterns.md`

Required scaffold elements:
- `import { test, expect } from '@playwright/test'`
- `const EXEC_IDX = Math.floor(Date.now() / 60_000) % 100_000` (prevents DB conflicts in parallel runs)
- `test.describe('{Submodule Name}', () => { ... })`
- Use fixture-based auth (never hardcode credentials)

### Step 3 — Implement tests in priority order

Implement P0 TCs first, then P1. Within each priority, follow scenario order from `05-test-scenarios.md`.

For each TC:
1. Map TC preconditions to `beforeAll`/`beforeEach` setup
2. Write navigation to the starting URL (use relative paths, not hardcoded base URL)
3. Use `test.step()` to group logical sub-actions — improves traceability
4. Assert observable outcomes — avoid asserting internal implementation details

### Step 4 — Apply stability rules

- Never use `waitForTimeout` — use `waitForSelector`, `waitForResponse`, or role-based locators
- Prefer `getByRole`, `getByLabel`, `getByTestId` over CSS selectors
- Locators attached to dynamic data must use `EXEC_IDX` suffix
- All test data cleared in `afterAll` — never leave residue

### Step 5 — Module Completion Checklist

Before marking the submodule as ✅ Automation Complete:
- [ ] All P0 TCs passing in CI
- [ ] All P1 TCs passing or explicitly deferred (with reason in spec)
- [ ] No `test.skip` without a linked issue or `PENDING-CODE` tag
- [ ] `playwright.config.ts` project includes submodule tag
- [ ] `qa/README.md` automation status updated
- [ ] AGENT-NEXT-STEPS.md active sprint updated (remove completed items)

---

## Key Patterns (reference names for Layer 3)

| Pattern | When to use |
|---|---|
| `EXEC_IDX` | Any TC that creates persistent data |
| `auth-fixture` | All authenticated TCs |
| `fast-fail` | P0 TCs — skip P1+ if P0 fails |
| `email-intercept` | Email verification flows |
| `skip-conditional` | Scenarios blocked by PENDING-CODE |
| `beforeAll-setup` | Shared precondition across TC group |
| `password-env` | Any credential usage |

See `references/patterns.md` for full TypeScript implementations.

---

## Outputs

- `qa/07-automation/e2e/{module}/{submodule}.spec.ts`
- `qa/07-automation/playwright.config.ts` (updated or confirmed)
- `qa/README.md` automation status updated
