# Suppliers — Inventory

**Module**: Suppliers (SUP)
**Submodule**: Create / Edit / List
**Last updated**: 2025-01-15
**Author**: QA Framework Example

---

## UI Elements

| Element | Type | Selector | Notes |
|---------|------|----------|-------|
| "New Supplier" button | Button | `button:has-text("New Supplier")` | Visible to Admin, Purchasing |
| Supplier name field | Input (text) | `#supplier-name` | Required; max 200 chars |
| RUT/Tax ID field | Input (text) | `#supplier-rut` | Format: XXXXXXXX-X |
| Email field | Input (email) | `#supplier-email` | Validated by regex |
| Supplier type dropdown | Select | `#supplier-type` | Options: Nacional, Internacional |
| Save button | Button | `button:has-text("Save")` | Disabled until all required fields filled |
| Cancel button | Button | `button:has-text("Cancel")` | Returns to list without saving |
| Supplier grid | Table | `.supplier-grid` | Sortable columns: Name, RUT, Type, Status |
| Search input | Input (text) | `#supplier-search` | Filters grid client-side |
| Delete button (row) | Button | `.row-actions button[aria-label="Delete"]` | Admin only; shows confirmation |
| Edit button (row) | Button | `.row-actions button[aria-label="Edit"]` | Admin, Purchasing |
| Export button | Button | `button:has-text("Export")` | Downloads .xlsx |
| Status badge | Badge | `.supplier-status-badge` | Values: Active, Inactive, Pending |
| Toast notification | Alert | `.toast-container .toast` | Appears on Save/Delete success/error |

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/suppliers` | Required | List all suppliers (paginated) |
| GET | `/api/suppliers/{id}` | Required | Get supplier by ID |
| POST | `/api/suppliers` | Admin, Purchasing | Create new supplier |
| PUT | `/api/suppliers/{id}` | Admin, Purchasing | Update supplier |
| DELETE | `/api/suppliers/{id}` | Admin only | Soft-delete supplier |
| GET | `/api/suppliers/export` | Required | Export XLSX |

---

## Key Identifiers

- **Route**: `/suppliers`
- **Modal selector**: `.supplier-modal` (appears on "New Supplier" click)
- **Success notification**: `.toast.toast-success:has-text("Supplier saved")`
- **Error notification**: `.toast.toast-error`

---

## Related Submodules

- Purchase Orders (references supplier by ID)
- Supplier Contacts (child of supplier; CRUD separate)
