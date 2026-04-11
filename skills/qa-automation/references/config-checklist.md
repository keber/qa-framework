# Reference: Playwright Config Checklist

> Loaded by `skills/qa-automation/` when scaffolding or reviewing `playwright.config.ts`.

---

## Required Configuration Template

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,            // Per-test timeout
  actionTimeout: 10_000,      // Per-action timeout — REQUIRED, prevents silent hangs
  navigationTimeout: 60_000,  // Per-navigation timeout (SPAs may need longer)
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,

  // Exclude seeds and debug scripts from normal test runs
  testIgnore: ['**/seeds/**', '**/debug-*.spec.ts', '**/seed.spec.ts'],

  use: {
    baseURL: process.env.QA_BASE_URL,
    storageState: '.auth/session.json',
    locale: 'es-CL',           // Adjust to app locale
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
  },

  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    // ADO reporter — add only when integration is enabled:
    // ['@alex_neo/playwright-azure-reporter', {
    //   orgUrl: process.env.ADO_ORG,
    //   projectName: process.env.ADO_PROJECT,
    //   planId: Number(process.env.ADO_PLAN_ID),
    //   token: process.env.ADO_PAT,
    //   runName: `Automated run ${new Date().toISOString()}`,
    // }],
  ],

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Add when cross-browser coverage required:
    // { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    // { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],

  globalSetup: './global-setup.ts',
  outputDir: '../../05-test-execution/automated/test-results',
});
```

---

## Checklist for Review

Before marking automation as complete, confirm:

- [ ] `actionTimeout` is set — **not optional**; without it, `textContent()` and similar calls silently hang
- [ ] `testIgnore` excludes seed scripts and debug files
- [ ] `baseURL` reads from `process.env.QA_BASE_URL` (never hardcoded)
- [ ] `storageState` path exists (created by `globalSetup`)
- [ ] `outputDir` points to `qa/05-test-execution/automated/test-results`
- [ ] `retries: 2` in CI for flake tolerance
- [ ] `workers: 1` in CI (or EXEC_IDX used to handle parallel conflicts)
- [ ] ADO reporter commented out unless ADO integration is active

---

## global-setup.ts Checklist

- [ ] Reads every credential from `process.env` — no hardcoded values
- [ ] Uses `evaluate()` for password input (trace safety)
- [ ] Saves storageState to `.auth/session.json` (or per-role paths)
- [ ] Handles login failure explicitly (does not silently save an unauthenticated state)
- [ ] Runs sequentially for multiple roles (no parallel logins)
