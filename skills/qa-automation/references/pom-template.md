# Reference: Page Object Template

> Loaded by `skills/qa-automation/` at Step 1b, when the POM decision criteria are met.

A Page Object owns **locators and interactions** for one submodule. It never owns assertions about
business rules - those belong in the spec file, where they can be traced to a TC ID.

---

## Two-layer structure

Most modules end up with the same shape: one abstract base per module holding the CRUD interaction
vocabulary shared by every submodule, and one thin concrete class per submodule holding only its
route, its identity, and whatever it genuinely does differently.

```
page-objects/
  {module}/
    Base{MODULE}CRUDPage.ts     <- shared interactions, abstract
    {MODULE}{Sub}Page.ts         <- route + submodule-specific overrides only
```

Write the concrete class first with inline locators. Promote a method to the base class on the
**second** submodule that needs it, not in anticipation of the first.

---

## Base class template

```typescript
import { Page, Locator } from '@playwright/test';
import { expect } from '../../fixtures/base';

/**
 * Shared CRUD interactions for {MODULE} submodules.
 *
 * Locators here must match the UI framework the app actually renders. Confirm them
 * against a real DOM inspection (Step 0) before writing tests - never from assumption.
 */
export abstract class Base{MODULE}CRUDPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async navigateTo(route: string): Promise<void> {
    await this.page.goto(route);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async waitForGrid(): Promise<void> {
    await this.page.locator('{GRID_ROW_SELECTOR}').first().waitFor({ timeout: 20_000 });
  }

  // Label-driven field access. See "Accent-insensitive label matching" below before
  // writing this for a Spanish-language UI.
  fieldInput(label: string): Locator {
    return this.page.getByLabel(label);
  }

  async fillField(label: string, value: string): Promise<void> {
    await this.fieldInput(label).fill(value);
  }

  async clickNuevoRegistro(): Promise<void> {
    await this.page.getByRole('button', { name: /{CREATE_BUTTON_PATTERN}/i }).click();
  }

  async clickGuardar(): Promise<void> {
    await this.page.getByRole('button', { name: /{SAVE_BUTTON_PATTERN}/i }).click();
  }

  async verifyValidationError(fieldLabel: string): Promise<void> {
    await expect(
      this.fieldInput(fieldLabel).locator('{VALIDATION_MESSAGE_SELECTOR}')
    ).toBeVisible({ timeout: 5_000 });
  }

  async verifyRowInGrid(text: string | RegExp): Promise<void> {
    await expect(this.page.locator('{GRID_ROW_SELECTOR}').filter({ hasText: text }))
      .toBeVisible();
  }
}
```

---

## Concrete submodule template

```typescript
import { Page } from '@playwright/test';
import { Base{MODULE}CRUDPage } from './Base{MODULE}CRUDPage';

// {SUBMODULE_CODE}: {display name} ({route})
// Fields: {field} (required), {field} (auto/read-only), ...
// Known defects affecting this submodule: {DEF-ID}: {one-line description}
export class {MODULE}{Sub}Page extends Base{MODULE}CRUDPage {
  static readonly route = '{route}';
  static readonly submoduleCode = '{SUBMODULE_CODE}';
  static readonly displayName = '{display name}';

  constructor(page: Page) {
    super(page);
  }

  // Only what this submodule does differently. If a second submodule needs this
  // method, move it to the base class then - not before.
}
```

The three `static readonly` fields let a spec file reference the submodule without duplicating
string literals, and make the POM self-describing when read on its own.

---

## Accent-insensitive label matching (Spanish-language UIs)

**This is a measured failure mode, not a precaution.** In one project, 24 of 39 CAT smoke tests
failed because the specs were written with unaccented Spanish labels (`Codigo`, `Compania naviera`,
`Tipo de emision`) while the DOM renders the correct accents (`Código`, `Compañía naviera`,
`Tipo de emisión`). An exact-text selector never matches. Two unrelated mitigations were attempted
first - raising the grid timeout and forcing HTTP/1.1 - because the failure presents as a timeout,
not as a text mismatch.

The durable fix is to write specs with correct accents in the first place (they describe a Spanish
UI, so they must carry Spanish orthography). Where a base class must tolerate both, match the
whole label accent-insensitively:

```typescript
// Anchored with ^...$ on purpose: unanchored, :text-matches() matches as a SUBSTRING of the
// element's full text, so a short label can match several elements and trip strict mode.
accentInsensitiveRegex(text: string): RegExp {
  const accentClass: Record<string, string> = {
    a: 'aá', e: 'eé', i: 'ií', o: 'oó', u: 'uúü', n: 'nñ',
  };
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = escaped.replace(/[aeioun]/gi, (ch) => {
    const cls = accentClass[ch.toLowerCase()];
    return cls ? `[${cls}]` : ch;
  });
  return new RegExp(`^${pattern}$`, 'i');
}
```

Apply it in **every** label-driven method - field inputs, validation messages, and foreign-key
selectors alike. In the project above, only two of the three families were overridden on the first
pass, and the FK selectors kept failing for another two days until the same fix reached them.

---

## Rules

| Rule | Correct | Wrong |
|---|---|---|
| Assertions | Business assertions live in the spec, traced to a TC ID | POM asserts business rules |
| Locators | Confirmed against a real DOM inspection (Step 0) | Guessed from the spec's prose |
| Waiting | `waitFor` on a state or a response | `waitForTimeout` |
| Promotion to base | On the second submodule that needs it | Anticipated on the first |
| Credentials | Fixture-provided | Referenced inside the POM |
| Header comment | Records inspection date, fields, known defects | Undocumented selectors |
