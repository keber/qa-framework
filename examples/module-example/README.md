# Example Module: Suppliers

This example shows a **complete, filled-in** application of the `keber/qa-framework`
to a fictional **Suppliers** module. Use it as a reference when creating your own modules.

## What this example demonstrates

| Element | File |
|---------|------|
| Module inventory (UI + API) | `suppliers/00-inventory.md` |
| Business rules | `suppliers/01-business-rules.md` |
| Create supplier workflow | `suppliers/02-workflows.md` |
| Role × feature matrix | `suppliers/03-roles-permissions.md` |
| Test data shapes + EXEC_IDX | `suppliers/04-test-data.md` |
| 10 baseline test scenarios | `suppliers/05-test-scenarios.md` |
| Playwright E2E spec file | `suppliers/suppliers-create.spec.ts` |

## How to use this example

1. Read each file in sequence to understand how the 6-file pattern comes together.
2. Copy the `suppliers/` folder as a starting point for your own submodule.
3. Replace all fictional data with your project's real selectors, URLs, and rules.
4. Run the spec file locally after configuring `.env`:
   ```bash
   npx playwright test examples/module-example/suppliers/suppliers-create.spec.ts
   ```

## Fictional context

- **Application**: GarcesFruit ERP (fictional)
- **Module**: Suppliers (Proveedores)
- **Stack**: Blazor WebAssembly + .NET API + ADO
- **Auth**: Email-based login (`#email-input` / `#password-input`)
- **Roles**: Admin, Purchasing, Viewer
