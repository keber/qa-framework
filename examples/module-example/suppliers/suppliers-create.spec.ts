/**
 * examples/module-example/suppliers/suppliers-create.spec.ts
 *
 * Example Playwright E2E spec for the fictional "Suppliers" module.
 * Demonstrates all required keber/qa-framework patterns:
 *   - EXEC_IDX for test data uniqueness
 *   - P0 priority tagging
 *   - Skip pattern with DEF reference
 *   - Fast-fail textContent assertions
 *   - Auth via storageState (set up by global-setup.ts)
 *
 * This file is for REFERENCE ONLY. Copy it, adapt selectors, and remove
 * all fictional data before using in a real project.
 */

import { test, expect } from '@playwright/test';

// EXEC_IDX: unique per minute-window — prevents data collisions between runs
const EXEC_IDX = Math.floor(Date.now() / 60_000) % 100_000;

test.describe('Suppliers > Create @P0', () => {

  /**
   * [TC-SUP-CR-001] Create supplier — happy path @P0
   * Verifies the complete create flow for a valid supplier.
   */
  test('[TC-SUP-CR-001] Create supplier — happy path @P0', async ({ page }) => {
    const supplierName = `QA-Supplier-${EXEC_IDX}`;
    const supplierRut  = `${EXEC_IDX}-K`;
    const supplierEmail = `qa-supplier-${EXEC_IDX}@example.com`;

    // Navigate to suppliers module
    await page.goto('/suppliers');
    await expect(page.locator('.supplier-grid')).toBeVisible();

    // Open create modal
    await page.locator('button:has-text("New Supplier")').click();
    await expect(page.locator('.supplier-modal')).toBeVisible();

    // Fill form
    await page.locator('#supplier-name').fill(supplierName);
    await page.locator('#supplier-rut').fill(supplierRut);
    await page.locator('#supplier-email').fill(supplierEmail);
    await page.locator('#supplier-type').selectOption('Nacional');

    // Save
    await page.locator('button:has-text("Save")').click();

    // Assert success
    const toast = page.locator('.toast.toast-success');
    await expect(toast).toBeVisible({ timeout: 5_000 });
    const toastText = await toast.textContent();
    expect(toastText).toContain('Supplier saved');

    // Assert record appears in grid
    await expect(page.locator(`.supplier-grid:has-text("${supplierName}")`)).toBeVisible();
  });

  /**
   * [TC-SUP-CR-002] Create supplier — required fields validation @P0
   * Verifies that the form prevents submission when required fields are empty.
   */
  test('[TC-SUP-CR-002] Create supplier — required fields validation @P0', async ({ page }) => {
    await page.goto('/suppliers');
    await page.locator('button:has-text("New Supplier")').click();
    await expect(page.locator('.supplier-modal')).toBeVisible();

    // Attempt save with empty form
    await page.locator('button:has-text("Save")').click();

    // Assert validation messages appear
    await expect(page.locator('.field-error:has-text("Name is required")')).toBeVisible();
    await expect(page.locator('.field-error:has-text("RUT is required")')).toBeVisible();

    // Assert form was NOT submitted (modal still open)
    await expect(page.locator('.supplier-modal')).toBeVisible();
    const toast = page.locator('.toast.toast-success');
    await expect(toast).not.toBeVisible();
  });

  /**
   * [TC-SUP-CR-003] Create supplier — duplicate RUT rejected @P0
   *
   * NOTE: test.skip active — DEF-001: Duplicate RUT check not enforced server-side.
   *       Reactivate when ADO #99001 is resolved.
   */
  test('[TC-SUP-CR-003] Create supplier — duplicate RUT rejected @P0', async ({ page }) => {
    test.skip(true,
      'DEF-001: Duplicate RUT validation not enforced. Reactivate when ADO #99001 is resolved.'
    );

    // --- SKIPPED: steps below will not run until DEF-001 is fixed ---
    await page.goto('/suppliers');

    // Create first supplier
    await page.locator('button:has-text("New Supplier")').click();
    await page.locator('#supplier-name').fill(`QA-Dup-${EXEC_IDX}`);
    await page.locator('#supplier-rut').fill('12345678-9');
    await page.locator('#supplier-email').fill(`qa-dup-${EXEC_IDX}@example.com`);
    await page.locator('button:has-text("Save")').click();
    await expect(page.locator('.toast.toast-success')).toBeVisible();

    // Attempt to create duplicate
    await page.locator('button:has-text("New Supplier")').click();
    await page.locator('#supplier-name').fill(`QA-Dup2-${EXEC_IDX}`);
    await page.locator('#supplier-rut').fill('12345678-9'); // same RUT
    await page.locator('#supplier-email').fill(`qa-dup2-${EXEC_IDX}@example.com`);
    await page.locator('button:has-text("Save")').click();

    await expect(page.locator('.toast.toast-error:has-text("RUT already exists")')).toBeVisible();
  });

});

test.describe('Suppliers > List @P1', () => {

  /**
   * [TC-SUP-LS-001] List loads and displays supplier grid @P1
   */
  test('[TC-SUP-LS-001] List loads and displays supplier grid @P1', async ({ page }) => {
    await page.goto('/suppliers');

    // Grid must render without console errors
    await expect(page.locator('.supplier-grid')).toBeVisible();

    // Search input present
    await expect(page.locator('#supplier-search')).toBeVisible();

    // Export button present
    await expect(page.locator('button:has-text("Export")')).toBeVisible();
  });

  /**
   * [TC-SUP-LS-002] Unauthenticated user redirected to login @P0
   */
  test('[TC-SUP-LS-002] Unauthenticated user redirected to login @P0', async ({ browser }) => {
    // Create a fresh context with NO stored auth state
    const ctx  = await browser.newContext({ storageState: undefined });
    const page = await ctx.newPage();

    await page.goto(`${process.env.QA_BASE_URL}/suppliers`);

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
    await ctx.close();
  });

});
