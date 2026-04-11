# Reference: Automation Patterns

> Loaded by `skills/qa-automation/` when implementing Playwright tests.

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

const EXEC_IDX = Math.floor(Date.now() / 60_000) % 100_000;

test.describe('{Feature Suite Name}', () => {

  test.beforeAll(async ({ browser }) => {
    // Provision data needed by all tests in this suite
    // Rule: provision AT LEAST as many records as tests that consume them
  });

  test('[TC-{MODULE}-{SUB}-001] {TC title} @P0', async ({ page }) => {
    // Arrange ... Act ... Assert
  });

  test.skip(
    '[TC-{MODULE}-{SUB}-003] {TC title} @P1 — DEF-{NNN}: {description}. Reactivate when {ADO WI or DEF ID} is resolved.',
    async ({ page }) => {
      // Write test as if bug is fixed — documents expected behavior
    }
  );

});
```

---

## Pattern 1: EXEC_IDX — Unique Test Data

```typescript
const EXEC_IDX = Math.floor(Date.now() / 60_000) % 100_000;

// Titles / names
const entityName = `Test-Record-${EXEC_IDX}`;

// Dates (year 2120+ avoids production data overlap; modular math always valid)
const year = 2120 + (EXEC_IDX % 10);
const month = String((EXEC_IDX % 12) + 1).padStart(2, '0');
const day = String((EXEC_IDX % 28) + 1).padStart(2, '0');
const testDate = `${year}-${month}-${day}`;
```

---

## Pattern 2: Multi-Role Auth with storageState

```typescript
// global-setup.ts
import { chromium } from '@playwright/test';

export default async function globalSetup() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

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

For multiple roles: run login sequence **sequentially** (not in parallel — apps often reject concurrent sessions).

---

## Pattern 3: Fast-Fail for Status Checks

```typescript
// BAD — hangs silently for full test timeout
const status = await page.locator('.status-badge').textContent();

// GOOD — fails fast if element not available
const status = await page.locator('.status-badge').textContent({ timeout: 3_000 });
```

---

## Pattern 4: Email Validation — 3-Layer Strategy

```typescript
// Layer 1: HTTP route interception
const emailRequests: string[] = [];
await page.route('**/*mail*', (route) => {
  emailRequests.push(route.request().url());
  route.continue();
});
// Perform the action...
expect(emailRequests.length).toBeGreaterThan(0);

// Layer 2: UI confirmation (toast / banner / badge)
await expect(page.locator('.email-sent-indicator')).toBeVisible();

// Layer 3: skip if inbox access not available
test.fixme(process.env.QA_MAILBOX_ACCESS !== 'true', 'Requires mailbox access');
```

---

## Pattern 5: Skip for Known Bugs

```typescript
test.skip(true,
  'DEF-001: {Description}. ' +
  'Expected: {expected behavior}. ' +
  'Actual: {buggy behavior}. ' +
  'Reactivate when ADO #{WI_ID} / DEF-001 is resolved.'
);
```

Never make a test pass around a bug. Document the expected behavior in the skip body.

---

## Pattern 6: beforeAll Provisioning Ratio

```typescript
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  // If 3 tests each consume 1 record, create at least 3
  const records: string[] = [];
  for (let i = 0; i < 3; i++) {
    const id = await createRecord(page, `Record-${EXEC_IDX}-${i}`);
    records.push(id);
  }
});
```

---

## Pattern 7: Password Injection (Trace Safety)

```typescript
// Passwords must be set via evaluate() to keep them out of Playwright traces
await page.evaluate(
  ([selector, pwd]) => {
    (document.querySelector(selector) as HTMLInputElement).value = pwd;
  },
  [process.env.QA_LOGIN_PASSWORD_SELECTOR, process.env.QA_USER_PASSWORD]
);
```

---

## Coverage Mapping Template

Create `COVERAGE-MAPPING.md` in the test directory after automation is complete:

```markdown
# Coverage Mapping — {Module}

| TC ID | Title | Spec file | Playwright spec | Status |
|-------|-------|-----------|----------------|--------|
| TC-MOD-SUB-001 | {title} | 05-test-scenarios.md | tests/{module}/{file}.spec.ts | ✅ Automated |
| TC-MOD-SUB-002 | {title} | 05-test-scenarios.md | — | ⛔ BLOCKED-PERMISSIONS |
| TC-MOD-SUB-003 | {title} | 05-test-scenarios.md | — | 🔲 PENDING-CODE |
```
