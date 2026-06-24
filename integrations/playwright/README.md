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
`qa/07-automation/e2e/` directory and replace all `{{PLACEHOLDER}}` values.

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

## Visual AI helper (optional advanced pattern)

> **Advanced / optional.** This pattern is not part of the default scaffold and requires
> an AI vision API key. Use it when a selector-based assertion is too brittle or the
> element structure changes frequently (e.g. PDF previews, dashboard charts, export outputs).

Instead of asserting specific selectors, take a screenshot and ask an AI vision model to
verify that the expected content is visually present. This decouples the assertion from DOM
structure and is useful for generated documents or complex layouts.

```typescript
// fixtures/vision-helper.ts
import * as https from 'https';

export interface VisionResult {
  passes: boolean;
  reason: string;
  raw?: string;
}

/**
 * Sends a screenshot to an AI vision model and asks whether the described
 * content is visually present. Degrades gracefully when the API key is absent.
 *
 * Requires an API key in the environment (e.g. OPENAI_API_KEY for GPT-4o,
 * or adapt the request body for any other vision-capable model).
 */
export async function assertScreenshotShowsContent(
  screenshotBuffer: Buffer,
  contentDescription: string,
  options: { model?: string; degradeOnMissingKey?: boolean } = {}
): Promise<VisionResult> {
  const apiKey = process.env.AI_VISION_API_KEY;
  const degrade = options.degradeOnMissingKey ?? true;

  if (!apiKey) {
    if (degrade) {
      console.warn('[vision-helper] AI_VISION_API_KEY not set. Skipping visual assertion.');
      return { passes: true, reason: 'SKIPPED: AI_VISION_API_KEY not configured' };
    }
    return { passes: false, reason: 'AI_VISION_API_KEY not set in environment' };
  }

  const base64Image = screenshotBuffer.toString('base64');
  const model = options.model ?? 'gpt-4o';

  const prompt = `You are a QA assistant verifying screenshots of a web application.
Answer YES or NO: Does the screenshot clearly show ${contentDescription}?
Reply in exactly this format:
VERDICT: YES
REASON: <one short sentence>`;

  const body = JSON.stringify({
    model,
    max_tokens: 150,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}`, detail: 'low' } },
      ],
    }],
  });

  const raw = await new Promise<string>((resolve, reject) => {
    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  const parsed = JSON.parse(raw);
  const text: string = parsed.choices?.[0]?.message?.content ?? '';
  const verdict = text.match(/VERDICT:\s*(YES|NO)/i);
  const reason  = text.match(/REASON:\s*(.+)/i);

  if (!verdict) return { passes: false, reason: `Unexpected response: ${text}`, raw: text };
  return {
    passes: verdict[1].toUpperCase() === 'YES',
    reason: reason?.[1]?.trim() ?? text,
    raw: text,
  };
}
```

**Usage in a test:**

```typescript
import { assertScreenshotShowsContent } from '../fixtures/vision-helper';

test('[TC-MOD-001] Export PDF contains expected content', async ({ page }) => {
  // ... trigger export ...
  const screenshot = await page.screenshot();
  const result = await assertScreenshotShowsContent(
    screenshot,
    'a completed export confirmation message with a download link'
  );
  expect(result.passes, result.reason).toBe(true);
});
```

**Setup notes:**

- Copy `vision-helper.ts` into your `fixtures/` directory.
- Set `AI_VISION_API_KEY` in your `.env` file (not committed). The example uses the OpenAI
  API; adapt the request body for any other vision model.
- By default, the helper degrades to a skip (passes: true) when the key is absent, so CI
  runs without the key do not fail on this assertion.
- `pdf-parse` (v2+) exports a `PDFParse` class rather than a function. Use
  `new PDFParse({ data: buffer })` and call `.getText()` on the instance.
