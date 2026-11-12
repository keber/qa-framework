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

**Stage**: 5 - Automation  
**Prerequisite**: All specs for the target submodule are complete and contain no `PENDING-CODE` sections  
**Output**: `qa/07-automation/e2e/tests/{module}/{submodule}.spec.ts` + supporting files  
**Next stage**: Stage 6 - Maintenance (`qa-maintenance`) or Stage 5b - Stabilization (`qa-test-stabilization`) if tests fail

> **Pipeline rule**: Never automate a TC whose spec contains `PENDING-CODE`. Resolve spec gaps first.

> **API tests** (Playwright `APIRequestContext`, no browser, in `qa/07-automation/integration/`)
> are the API track of this stage: use the `qa-api-integration` skill
> (`../qa-api-integration/SKILL.md`), not this one.

---

## Inputs Required

1. `qa/01-specifications/{module}/` - full spec set for target submodule
2. `qa/07-automation/e2e/playwright.config.ts` - confirm project name maps to submodule tag
3. `qa/qa-framework.config.json` -> `parallelLanes` - the lanes (one account and role each) whose `storageState` the tests start from
4. TC list (from test plan or Stage 4) - defines which TCs to automate in this session
5. `qa/qa-framework.config.json` -> screenshotPath, automationRoot

---

## Process

### Step 0 - Pre-inspection (MANDATORY before writing any test code)

For every new submodule, run a dedicated inspection script before writing tests.
**Template**: `references/dom-inspection-template.js` - copy, set the 4 constants at the top, run.

1. Copy `references/dom-inspection-template.js` -> `qa/07-automation/e2e/_inspect-{submodule}.js`
2. Set the 4 constants at the top of the script:
   - `MODULE_ROUTE` - the submodule's URL path (e.g. `'/Users'`, `'/Products/list'`)
   - `APP_SHELL_SEL` - a selector that confirms the SPA has loaded (nav, sidebar, app shell)
   - `CREATE_BTN` - regex matching the create/new button label in this app
   - `BASE_URL` - already read from `process.env.QA_BASE_URL`
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

### Step 1 - Scan for blockers

Before writing a line of code:
- Search all spec files for `PENDING-CODE` - stop and flag if found
- Confirm `playwright.config.ts` exists; scaffold it if missing using `references/config-checklist.md`
- Verify a lane exists for every role this submodule needs; a missing role is a new lane, never a login inside the test
- Decide whether each test belongs to the default suite or to an opt-in project (`*.writes.spec.ts`, `*.slow.spec.ts`, `*.login.spec.ts`): `references/session-and-opt-in-projects.md`

### Step 1b - Decide POM vs inline locators

Create a Page Object in `qa/07-automation/e2e/page-objects/{SubmoduleName}Page.ts` when ANY of these is true:
- The submodule has a form with 5+ fields (locators will be reused across P0 + P1 suites)
- The submodule is referenced as a precondition by another submodule (BP, tabs, modals)
- The submodule requires navigation to 2+ distinct URLs (list + create + edit)

Otherwise, inline locators are acceptable for simple catalog submodules (single URL, < 5 fields).

POM template: `references/pom-template.md`

### Step 2 - Scaffold spec file

Full spec file template and 7 implementation patterns: `references/patterns.md`

Required scaffold elements:
- `import { test, expect } from '@playwright/test'`
- `const EXEC_IDX = Math.floor(Date.now() / 60_000) % 100_000` (prevents DB conflicts in parallel runs)
- `test.describe('{Submodule Name}', () => { ... })`
- Start from the lane `storageState`: **tests never log in**. Login happens only in `global-setup.ts`, so no credential reaches a trace, video or screenshot. Only a test of the login flow itself calls `loginAs()`, in a `*.login.spec.ts` file run by the opt-in `login-flow` project (`references/session-and-opt-in-projects.md`)

### Step 3 - Implement tests in priority order

Implement P0 TCs first, then P1. Within each priority, follow scenario order from `05-test-scenarios.md`.

For each TC:
1. Map TC preconditions to `beforeAll`/`beforeEach` setup
2. Write navigation to the starting URL (use relative paths, not hardcoded base URL)
3. Use `test.step()` to group logical sub-actions - improves traceability
4. Assert observable outcomes - avoid asserting internal implementation details

### Step 4 - Apply stability rules

- Never use `waitForTimeout` - use `waitForSelector`, `waitForResponse`, or role-based locators
- Prefer `getByRole`, `getByLabel`, `getByTestId` over CSS selectors
- Locators attached to dynamic data must use `EXEC_IDX` suffix
- All test data cleared in `afterAll` - never leave residue

### Step 4b - Assertion polarity check (MANDATORY before committing any test)

Every assertion must be verified against the spec, not against the app's 
observed output.

**Rule**: if the app does X but the spec requires NOT X, keep the correct assertion
and mark the test with the open defect - do not adapt the assertion to match the app.
Use the scaffold helper `fixtures/defects.ts`:

- `expectOpenDefect(id, reason, assertions)` around the pure assertions (expected
  failure while the defect reproduces, red with `no longer reproduces` when it stops);
- `InfraError` for session, availability, response-shape, timeout and selector
  failures, which must never count as the defect reproducing;
- order: every action and observation first, unknowns raised as `InfraError`, the
  marker only immediately before the pure assertions;
- check a new or changed marked test once with `DEFECTS_DIAG=1` (marker disabled):
  it must fail on the spec assertion itself.

Full guide and example: `references/defect-polarity.md`. API tests apply the same
polarity as described in `../qa-api-integration/SKILL.md`.

Red flags that require review before proceeding:
- `expect(X).toBe(false)` where the spec describes a positive condition
- Assertions with `|| fallback`, `?.`, or `Math.max(a, b)` to avoid zero/falsy
- Assertions inside an `if (condition)` that only execute on the happy path
- A test that starts passing after a refactor without a clear spec justification

### Step 5 - Static Check, Smoke Run & Completion Checklist

Two gates run **before** the checklist below. Both must come back clean.

**Gate 1 - static check.** From the automation root (`qa/07-automation/e2e`):

```
npx tsc --noEmit
```

Must exit 0. Do not proceed with pending TypeScript errors.

**Gate 2 - smoke run.** Run every new or modified spec at least once against the official runner:

```
npx playwright test {spec} --project={module} --reporter=list
```

The goal is to surface reference, import and syntax errors that only appear at execution time - a variable used but never declared passes every review and fails only when the line runs. A full green suite is Stage 5b's job, not this gate's: a test that fails on a real assertion has still cleared Gate 2.

Only when both gates are clean, continue:

Before marking the submodule as ✅ Automation Complete:
- [ ] All P0 TCs passing in CI
- [ ] All P1 TCs passing or explicitly deferred (with reason in spec)
- [ ] No `test.skip` without a linked issue or `PENDING-CODE` tag
- [ ] `playwright.config.ts` project includes submodule tag
- [ ] `qa/README.md` automation status updated
- [ ] AGENT-NEXT-STEPS.md active sprint updated (remove completed items)
- [ ] `npx tsc --noEmit` run, exit 0
- [ ] New/modified specs run at least once via `npx playwright test` (smoke)

---

## Key Patterns (reference names for Layer 3)

| Pattern | When to use |
|---|---|
| `EXEC_IDX` | Any TC that creates persistent data |
| `auth-fixture` | All authenticated TCs: lane `storageState` from global setup, never a login in the test (`references/session-and-opt-in-projects.md`) |
| `opt-in-project` | TCs that write, are slow, or test the login flow: file suffix + `npm run test:<name>` |
| `fast-fail` | Element state checks where the default timeout would cause silent hangs |
| `email-intercept` | Email verification flows |
| `skip-conditional` | TCs that cannot run at all because of a known app defect (DEF-xxx) |
| `open-defect` | TCs that run but whose spec assertion fails because of an open defect (`references/defect-polarity.md`) |
| `beforeAll-setup` | Shared precondition across TC group |
| `password-env` | Any credential usage |
| `afterAll-cleanup` | When a test assigns, creates, or modifies persistent data |
| `debug-screenshots` | beforeAll warmup verification, catch blocks in setup, and inspection scripts |

See `references/patterns.md` for full TypeScript implementations.

---

## Outputs

- `qa/07-automation/e2e/tests/{module}/{submodule}.spec.ts`
- `qa/07-automation/e2e/page-objects/{SubmoduleName}Page.ts`  (when POM criteria met)
- `qa/07-automation/e2e/playwright.config.ts` (updated or confirmed)
- `qa/README.md` automation status updated
