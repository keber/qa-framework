# Agent Instructions: Automation Generation

> ⚠️ **DEPRECATED**: This file is superseded by `.github/skills/qa-automation/SKILL.md`.
> Kept as reference during the transition period. Do not update this file.

**File**: `agent-instructions/04-automation-generation.md`  
**Purpose**: Instructions for writing Playwright E2E automation tests that trace back to approved test cases in `01-specifications/`.

---

> **Prerequisite**: Specifications must be reviewed and approved before writing automation. Do not automate TCs that are `PENDING-CODE` or `BLOCKED-PERMISSIONS`.

---

## Structure: How to Organize Spec Files

Each module gets a directory under `qa/07-automation/e2e/tests/`:

```
qa/07-automation/e2e/tests/
└── {module-kebab}/
    ├── COVERAGE-MAPPING.md          ← TC-ID → spec location map
    ├── {suite-name}.spec.ts         ← P0 suite
    ├── {suite-name}-p1.spec.ts      ← P1 suite
    └── integration/
        └── cross-module.spec.ts    ← Cross-module dependencies
```

Spec file naming: `{description}.spec.ts` in kebab-case.

---

## Spec File Template

```typescript
/**
 * @module {MODULE_CODE}
 * @submodule {SUBMODULE_CODE}
 * @spec qa/01-specifications/module-{name}/submodule-{name}/05-test-scenarios.md
 * @priority P0
 */

import { test, expect } from '@playwright/test';

// EXEC_IDX: changes every 60 seconds, provides collision-resistant unique values
const EXEC_IDX = Math.floor(Date.now() / 60_000) % 100_000;

test.describe('{Feature Suite Name}', () => {

  test.beforeAll(async ({ browser }) => {
    // Provision data needed by tests in this suite
    // Rule: provision AT LEAST as many records as tests that consume them
  });

  test('[TC-{MODULE}-{SUB}-001] {TC title} @P0', async ({ page }) => {
    // Arrange
    // ...

    // Act
    // ...

    // Assert
    // ...
  });

  test('[TC-{MODULE}-{SUB}-002] {TC title} @P1', async ({ page }) => {
    // ...
  });

  test.skip('[TC-{MODULE}-{SUB}-003] {TC title} @P1 — DEF-{NNN}: {description}. Reactivate when {ADO WI or DEF ID} is resolved.', async ({ page }) => {
    // Skip body: write the test as if the bug were fixed
    // This documents the expected behavior, not the buggy state
  });

});
```

---

## Required Patterns

### Pattern 1: EXEC_IDX — Unique Test Data

Use EXEC_IDX everywhere you create records to avoid collisions between consecutive test runs:

```typescript
const EXEC_IDX = Math.floor(Date.now() / 60_000) % 100_000;

// For titles/names
const entityName = `Test-Record-${EXEC_IDX}`;

// For dates (future-dated to avoid prod data collisions)
const year = 2120 + (EXEC_IDX % 10);
const month = String((EXEC_IDX % 12) + 1).padStart(2, '0');
const day = String((EXEC_IDX % 28) + 1).padStart(2, '0');
const testDate = `${year}-${month}-${day}`;
```

Why year 2120+: avoids any overlap with real production data.  
Why modular arithmetic: the date always represents a valid date, never day 32 or month 13.

### Pattern 2: Multi-Role Auth with storageState

Use `global-setup.ts` to log in once per role and save storageState:

```typescript
// playwright.config.ts
use: {
  storageState: '.auth/session.json', // single role
  // or: storageState: (workerInfo) => `.auth/role-${workerInfo.workerIndex}.json`
}

// global-setup.ts — runs once before all tests
async function globalSetup(config) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Log in and save session
  await page.goto(process.env.QA_BASE_URL + process.env.QA_LOGIN_PATH);
  await page.fill(process.env.QA_LOGIN_EMAIL_SELECTOR, process.env.QA_USER_EMAIL);
  // Use evaluate() for password — excluded from traces
  await page.evaluate(
    ([sel, pwd]) => { (document.querySelector(sel) as HTMLInputElement).value = pwd; },
    [process.env.QA_LOGIN_PASSWORD_SELECTOR, process.env.QA_USER_PASSWORD]
  );
  await page.click(process.env.QA_LOGIN_SUBMIT_SELECTOR);
  await page.waitForURL(url => !url.includes(process.env.QA_LOGIN_PATH));
  
  await page.context().storageState({ path: '.auth/session.json' });
  await browser.close();
}
```

For multi-role: call login sequence sequentially for each role (apps often reject concurrent sessions).

### Pattern 3: Fast-Fail for Status Checks

When checking the text content of status indicators, use a short timeout to prevent hanging:

```typescript
// BAD: inherits the full test timeout (30s or more)
const status = await page.locator('.status-badge').textContent();

// GOOD: fails fast if not available in 3 seconds
const status = await page.locator('.status-badge').textContent({ timeout: 3_000 });
```

### Pattern 4: Email Validation — 3-Layer Strategy

When testing email notification behavior without a real inbox:

```typescript
// Layer 1: HTTP route interception (most reliable)
const emailRequests: string[] = [];
await page.route('**/*mail*', (route) => {
  emailRequests.push(route.request().url());
  route.continue();
});
await page.route('**/*correo*', (route) => {
  emailRequests.push(route.request().url());
  route.continue();
});
// ... perform the action ...
expect(emailRequests.length).toBeGreaterThan(0);

// Layer 2: UI confirmation (toast, banner, badge)
await expect(page.locator('.email-sent-indicator')).toBeVisible();

// Layer 3: test.fixme() — if inbox access is needed and not available
test.fixme(process.env.QA_MAILBOX_ACCESS !== 'true', 'Requires mailbox access');
```

### Pattern 5: Skip Pattern for Known Bugs

```typescript
test.skip(true, 
  'DEF-001: {Description of bug}. ' +
  'Expected: {expected behavior}. ' +
  'Actual: {buggy behavior}. ' +
  'Reactivate when ADO #{WI_ID} / DEF-001 is resolved.'
);
```

**Never** make a test artificially "pass" around a bug. Document with exact expected behavior.

### Pattern 6: beforeAll Provisioning Ratio

In `beforeAll`, create **at least as many records as the number of tests that consume them**:

```typescript
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  // If 3 tests each need 1 different pending record:
  const records: string[] = [];
  for (let i = 0; i < 3; i++) {
    const id = await createRecord(page, `Record-${EXEC_IDX}-${i}`);
    records.push(id);
  }
  // Store in closure or page object for use in tests
});
```

### Pattern 7: Password Injection (Trace Safety)

```typescript
// Passwords must be set via evaluate() to exclude from Playwright traces
await page.evaluate(
  ([selector, pwd]) => {
    (document.querySelector(selector) as HTMLInputElement).value = pwd;
  },
  [process.env.QA_LOGIN_PASSWORD_SELECTOR, process.env.QA_USER_PASSWORD]
);
```

---

## `playwright.config.ts` Checklist

Every project Playwright config should configure:

```typescript
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,           // Per-test timeout
  actionTimeout: 10_000,     // Per-action timeout (REQUIRED — prevents silent hangs)
  navigationTimeout: 60_000, // Per-navigation timeout
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  
  // Exclude seeds and debug scripts from normal runs
  testIgnore: ['**/seeds/**', '**/debug-*.spec.ts', '**/seed.spec.ts'],
  
  use: {
    baseURL: process.env.QA_BASE_URL,
    storageState: '.auth/session.json',
    locale: 'en-US', // or 'es-CL' for Chilean apps
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
  },
  
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    // ADO reporter: only when integration enabled
    // ['@alex_neo/playwright-azure-reporter', { ... }],
  ],
  
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Add firefox, webkit when cross-browser coverage is needed
  ],
  
  globalSetup: './global-setup.ts',
  outputDir: '../../05-test-execution/automated/test-results',
});
```

`actionTimeout` is **not optional**. Without it, `textContent()`, `getAttribute()`, and similar calls inherit the full test timeout and can silently hang if the element is slow.

---

## Stability Criteria

A test is only considered stable when:

1. It passes ≥ 2 consecutive runs with **different** `EXEC_IDX` values (i.e., at least 60 seconds apart)
2. It does not rely on another test's side effects
3. It produces the same result across 3+ independent runs
4. No `waitForTimeout(N)` longer than 2000ms is used (use `waitForSelector` or `waitForLoadState` instead)

---

## Debugging Failed Tests

Use this 5-layer methodology:

1. **Environment layer**: Is QA_BASE_URL reachable? Are credentials valid? Run login test first.
2. **Timeout layer**: Did the test fail with "timeout" or "Timeout exceeded"? Check `actionTimeout`, increase if justified.
3. **Data layer**: Did `beforeAll` create the expected records? Add `console.log` per step in `beforeAll`.
4. **Code layer**: Is the selector correct? Use page.pause() or Playwright UI mode to inspect.
5. **System defect layer**: Is the failure due to a real bug? File a defect and add `test.skip()`.

**Diagnostic script pattern**: For complex data discovery, create a diagnostic spec in `helpers/debug/`:

```typescript
// helpers/debug/inspect-{feature}.spec.ts
test('diagnostic: dump form options', async ({ page }) => {
  await page.goto(`${process.env.QA_BASE_URL}/my-form`);
  const options = await page.$$eval('select option', els => 
    els.map(el => ({ value: el.value, text: el.textContent }))
  );
  console.log(JSON.stringify(options, null, 2));
});
```

This is not part of the test suite (excluded via `testIgnore`). Use it to discover valid option values.

---

## Coverage Mapping Document

After writing automation for a module, create `COVERAGE-MAPPING.md` in the test directory:

```markdown
# Coverage Mapping — {Module}

| TC ID | Title | Spec file | Playwright spec | Status |
|-------|-------|-----------|----------------|--------|
| TC-OPER-CAT-001 | Access catalog list | 01-specifications/.../05-test-scenarios.md | tests/operacion/catalogos/critical.spec.ts | ✅ Automated |
| TC-OPER-CAT-002 | Create labor type | ... | tests/operacion/... | ✅ Automated |
| TC-OPER-CAT-003 | Duplicate rejection | ... | tests/operacion/... | ⚠️ Partially (UI only) |
| TC-OPER-ASI-001 | Access assistance list | ... | — | ⛔ Blocked (BLOCKED-PERMISSIONS) |
```

---

## Module Completion Checklist

Run this checklist when all P0 tests for a module are passing.

### Stability gate
- [ ] All P0 tests pass on **2 consecutive runs** with different `EXEC_IDX` values (≥ 60 seconds apart)
- [ ] No `waitForTimeout(N)` longer than 2000ms left in the suite
- [ ] All skipped tests have a `DEF-` or ADO WI reference in their skip message

### Artifacts
- [ ] `COVERAGE-MAPPING.md` created or updated in the test directory
- [ ] Execution report written to `qa/05-test-execution/automated/`

### Living Index update — `qa/README.md`
- [ ] Update the module's row in the status table (TCs automated, date, status → ✅)
- [ ] Add a row to the `## Sprint History` section with: sprint name, date, submódulos covered, TC count, link to execution report

### AGENT-NEXT-STEPS.md — trim
- [ ] Move the completed sprint checklist block to `qa/README.md` under `## Sprint History`
- [ ] Delete the completed sprint section from `AGENT-NEXT-STEPS.md`
- [ ] Verify `AGENT-NEXT-STEPS.md` now contains **only one active sprint** (the next one)

### Memory
- [ ] If new patterns or environment quirks were discovered: add them to `qa/memory/` with a descriptive filename
- [ ] Update `qa/memory/INDEX.md` to reflect any new or updated files

> **Rule**: `AGENT-NEXT-STEPS.md` is a task queue, not a log. Completed sprints live in `qa/README.md`. The file must never accumulate more than one active sprint.
