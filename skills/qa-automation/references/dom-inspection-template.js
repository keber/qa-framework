/**
 * DOM / API Inspection Script — {SUBMODULE_DISPLAY_NAME}
 *
 * Purpose: Capture real UI structure before writing automation specs.
 *          Run ONCE per submodule. Output drives selector and fixture decisions.
 *
 * Usage:
 *   QA_BASE_URL=https://your-qa-env.example.com node _inspect-{submodule}.js
 *
 * Pre-requisites:
 *   - Valid storageState in .auth/user-default.json  (run global-setup first)
 *   - playwright installed: npm install @playwright/test
 *
 * ─── What to do with the output ─────────────────────────────────────────────
 * Paste key findings as a comment block at the top of the generated .spec.ts:
 *
 *   // INSPECTION: {YYYY-MM-DD}
 *   // Grid headers: ["Col1", "Col2", ...]
 *   // Create form: inputs[0]=Name(maxLen=100), dd[0]=Category(lazy=true)
 *   // Validation msg: "El campo Nombre es obligatorio."
 *   // API: POST /api/{Entity} { pageNumber, pageSize }
 *
 * ── For tabbed/nested forms, add steps after [3] following this pattern: ────
 *   await page.getByRole('tab', { name: /tab name/i }).click();
 *   await page.waitForTimeout(1_000);
 *   // then re-run the inputs/dropdowns/buttons queries inside the panel
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const { chromium } = require('@playwright/test');
const path = require('path');

// ── Configuration — edit these 4 constants, leave the rest ───────────────────
const STATE_FILE    = path.resolve(__dirname, '.auth/user-default.json');
const BASE_URL      = process.env.QA_BASE_URL || '';
const MODULE_ROUTE  = '/{EntityRoute}';                          // e.g. '/Users', '/Orders/list'
const APP_SHELL_SEL = 'nav, [role="navigation"], .sidebar';      // selector that confirms SPA loaded
const CREATE_BTN    = /new|nuevo|agregar|add/i;                  // regex matching your app's create button
// ─────────────────────────────────────────────────────────────────────────────

async function run() {
  if (!BASE_URL) {
    console.error('ERROR: QA_BASE_URL is not set. Run with: QA_BASE_URL=https://... node _inspect-{submodule}.js');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const ctx     = await browser.newContext({ storageState: STATE_FILE, baseURL: BASE_URL });
  ctx.setDefaultNavigationTimeout(120_000);
  const page    = await ctx.newPage();

  console.log('BASE_URL:', BASE_URL);
  console.log('MODULE_ROUTE:', MODULE_ROUTE);

  // ── 0. Intercept API calls — runs passively throughout the entire session ──
  const apiCalls = [];
  page.on('request', req => {
    try {
      if (!req.url().includes(new URL(BASE_URL).hostname)) return;
    } catch { return; }
    const method = req.method();
    if (['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      apiCalls.push({
        method,
        url:  req.url().replace(BASE_URL, ''),
        body: req.postData()?.substring(0, 200) ?? null,
      });
    }
  });

  // ── 1. SPA / WASM warmup ──────────────────────────────────────────────────
  console.log('\n[STEP 1] SPA warmup...');
  await page.goto('/');
  try {
    await page.waitForSelector(APP_SHELL_SEL, { timeout: 120_000 });
    console.log('  App shell visible');
  } catch {
    console.log('  App shell not found with selector:', APP_SHELL_SEL);
    console.log('  Update APP_SHELL_SEL. Body text (200 chars):',
      await page.$eval('body', b => b.innerText.substring(0, 200)).catch(() => 'N/A'));
  }

  // ── 2. List view ──────────────────────────────────────────────────────────
  console.log('\n[STEP 2] List view:', MODULE_ROUTE);
  await page.goto(MODULE_ROUTE);
  await page.waitForSelector('[role="columnheader"], th, table', { timeout: 30_000 }).catch(() => null);
  await page.waitForTimeout(1_500);

  console.log('  URL:', page.url());
  console.log('  Title:', await page.title());

  const headers = await page.$$eval(
    '[role="columnheader"], th',
    ths => ths.map(th => th.innerText.trim()).filter(t => t && t.length < 80)
  ).catch(() => []);
  console.log('  Grid headers:', JSON.stringify(headers));

  const firstRow = await page.$$eval(
    'table tbody tr:first-child td',
    tds => tds.map(td => td.innerText.trim()).filter(t => t).slice(0, 8)
  ).catch(() => []);
  console.log('  First row (seed data):', JSON.stringify(firstRow));

  const allBtns = await page.$$eval(
    'button',
    btns => [...new Set(btns.map(b => b.innerText.trim()).filter(t => t && t.length < 60))]
  ).catch(() => []);
  console.log('  Buttons on list page:', JSON.stringify(allBtns));

  // ── 3. Create form ────────────────────────────────────────────────────────
  console.log('\n[STEP 3] Create form...');
  const newBtn = page.getByRole('button', { name: CREATE_BTN });
  const newBtnVisible = await newBtn.isVisible({ timeout: 5_000 }).catch(() => false);

  if (newBtnVisible) {
    await newBtn.click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2_000);
    console.log('  Form URL:', page.url());

    // Text inputs (all types)
    const textInputs = await page.$$eval(
      'input[type="text"], input[type="email"], input[type="number"], input[type="date"], textarea',
      inps => inps.map((inp, i) => ({
        nth:         i,
        type:        inp.type,
        placeholder: inp.placeholder || null,
        maxLength:   inp.maxLength > 0 ? inp.maxLength : null,
        required:    inp.required,
        disabled:    inp.disabled,
        name:        inp.name || inp.id || null,
      }))
    ).catch(() => []);
    console.log('\n  Text inputs:', JSON.stringify(textInputs, null, 2));

    // Native <select> elements
    const selects = await page.$$eval(
      'select',
      sels => sels.map((sel, i) => ({
        nth:      i,
        name:     sel.name || sel.id || null,
        required: sel.required,
        disabled: sel.disabled,
        options:  Array.from(sel.options).map(o => o.text).slice(0, 15),
      }))
    ).catch(() => []);
    console.log('  <select> elements:', JSON.stringify(selects, null, 2));

    // Custom dropdowns — uses ARIA roles (framework-agnostic)
    const customDDs = await page.$$eval(
      '[role="combobox"], [role="listbox"], [aria-haspopup="listbox"]',
      dds => dds.map((dd, i) => ({
        nth:      i,
        role:     dd.getAttribute('role'),
        text:     dd.innerText.trim().substring(0, 80),
        disabled: dd.getAttribute('aria-disabled') === 'true',
        expanded: dd.getAttribute('aria-expanded') === 'true',
      }))
    ).catch(() => []);
    console.log('  Custom dropdowns (ARIA):', JSON.stringify(customDDs, null, 2));

    // Checkboxes and radio buttons
    const checkboxes = await page.$$eval(
      'input[type="checkbox"], input[type="radio"]',
      els => els.map((el, i) => ({
        nth:     i,
        type:    el.type,
        checked: el.checked,
        name:    el.name || el.id || null,
        label:   el.labels?.[0]?.innerText?.trim() ?? null,
      }))
    ).catch(() => []);
    console.log('  Checkboxes/radios:', JSON.stringify(checkboxes, null, 2));

    // Tabs (if the form is tabbed)
    const tabs = await page.$$eval(
      '[role="tab"]',
      tabs => tabs.map((t, i) => ({ nth: i, text: t.innerText.trim() }))
    ).catch(() => []);
    if (tabs.length > 0) console.log('  Tabs:', JSON.stringify(tabs));

    // Validation — submit empty form to capture required-field messages
    const saveBtn = page.getByRole('button', { name: /guardar|save|submit|crear|create/i }).first();
    if (await saveBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await saveBtn.click();
      await page.waitForTimeout(1_500);
      const msgs = await page.$$eval(
        '[class*="validation"], [class*="error"], [class*="invalid"], [aria-live="polite"], [aria-live="assertive"]',
        els => els.map(el => el.innerText.trim()).filter(t => t && t.length < 200)
      ).catch(() => []);
      console.log('\n  Validation messages (empty submit):', JSON.stringify(msgs));
    }

    // ── ADD EXTRA STEPS HERE for tabbed/nested forms ──────────────────────
    // Example — inspect a specific tab:
    //   await page.getByRole('tab', { name: /identif/i }).click();
    //   await page.waitForTimeout(1_000);
    //   const tabDDs = await page.locator('[role="tab"][aria-selected="true"] + ... .rz-dropdown')...
    // ─────────────────────────────────────────────────────────────────────

  } else {
    console.log('  Create button NOT found. Searched for:', CREATE_BTN.toString());
    console.log('  Buttons visible:', allBtns);
  }

  // ── 4. Unauth redirect check ──────────────────────────────────────────────
  console.log('\n[STEP 4] Unauth redirect check...');
  const page2 = await ctx.newPage();
  await page2.goto('/');
  await page2.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page2.reload({ waitUntil: 'domcontentloaded' });
  await page2.goto(MODULE_ROUTE);
  await page2.waitForTimeout(3_000);
  const loginVisible = await page2.locator(
    'input[type="password"], [id*="login"], form[action*="login"]'
  ).first().isVisible({ timeout: 5_000 }).catch(() => false);
  console.log('  Login form visible without auth:', loginVisible);
  console.log('  URL after clearing session:', page2.url());
  await page2.close();

  // ── 5. API calls summary ──────────────────────────────────────────────────
  console.log('\n[STEP 5] API calls captured during session:');
  const unique = [...new Map(apiCalls.map(c => [`${c.method} ${c.url}`, c])).values()];
  if (unique.length === 0) {
    console.log('  (none captured — app may use WASM-level data, not REST calls)');
  } else {
    unique.forEach(c => {
      console.log(`  ${c.method} ${c.url}`);
      if (c.body) console.log(`    body: ${c.body}`);
    });
  }

  await browser.close();
  console.log('\n[DONE] Paste key findings into a comment block at the top of the .spec.ts file.');
}

run().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
