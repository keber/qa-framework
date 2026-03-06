# Integration — Playwright

This directory documents how `@playwright/test` is configured within the
`keber/qa-framework` opinionated setup.

## Installation

```bash
npm install --save-dev @playwright/test
npx playwright install chromium
```

## Recommended version

Peer dependency: `@playwright/test >= 1.40.0`

## Configuration

Copy `templates/automation-scaffold/playwright.config.ts` into your project's
`qa/07-automation/` directory and replace all `{{PLACEHOLDER}}` values.

## Key conventions

| Convention | Value |
|------------|-------|
| `fullyParallel` | `false` (tests share auth storageState) |
| `workers` | `1` (sequential by default; increase only when tests are fully isolated) |
| `retries` | `0` locally, `1` in CI |
| Auth persistence | `.auth/user-{role}.json` (via `global-setup.ts`) |
| Selectors | CSS preferred; use `data-testid` when available |
| Timeouts | `actionTimeout: 15_000`, `navigationTimeout: 30_000` |

## Auth state management

The `global-setup.ts` template saves `storageState` to `.auth/` once before
all tests. Tests reuse this state, so the login flow runs exactly once per
suite execution.

`.auth/` must be in `.gitignore`.

## Debugging checklist

1. `PWDEBUG=1 npx playwright test` — step through in inspector
2. `--headed` — watch the browser
3. `--trace on` — record full trace; open with `npx playwright show-trace`
4. Increase `actionTimeout` if the app has slow server-side rendering
5. Add `await page.waitForLoadState('networkidle')` before assertions on
   dynamically loaded content

## Spec file minimal template

```typescript
import { test, expect } from '@playwright/test';

const EXEC_IDX = Math.floor(Date.now() / 60_000) % 100_000;

test.describe('[TC-M-S-NNN] Module > Submodule @P0', () => {
  test('[TC-M-S-001] Should ...', async ({ page }) => {
    // Arrange
    await page.goto('/your-module-path');
    // Act
    await page.locator('#some-input').fill(`QA-Test-${EXEC_IDX}`);
    await page.locator('#submit').click();
    // Assert
    await expect(page.locator('.success-notification')).toBeVisible();
  });
});
```
