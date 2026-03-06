# MODULE: {{MODULE_NAME}} — Submodule: {{SUBMODULE_NAME}}

> **Template version**: 1.0 | Replace all `{{...}}` with actual values before committing.

| Field | Value |
|-------|-------|
| Module code | {{MODULE_CODE}} |
| Submodule code | {{SUBMODULE_CODE}} |
| Primary URL | `{{QA_BASE_URL}}/{{SUBMODULE_PATH}}` |
| Secondary URLs | `{{URL_2}}`, `{{URL_3}}` |
| Status | Active |
| Deployed | YYYY-MM-DD |
| Last analyzed | YYYY-MM-DD |

---

## Menu Location

| Level | Label | URL |
|-------|-------|-----|
| 1 | {{TOP_MENU}} | — |
| 2 | {{SUBMENU}} | `{{URL}}` |

---

## UI Elements

### Index / List View (`{{INDEX_URL}}`)

| Element | Type | Notes |
|---------|------|-------|
| {{field-name}} | text / select / checkbox / date / button | {{notes}} |
| Search input | text | Filters table by {{field}} |
| Pagination | paginator | N records per page |
| Export button | button | Generates {{format}} file |

### Create / Edit Form (`{{FORM_URL}}`)

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| {{field-name}} | text | Yes/No | {{rule, e.g., max 100 chars}} |
| {{field-name}} | select | Yes/No | Options loaded from API |
| {{field-name}} | date | No | Future dates only |

---

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/{{endpoint}}` | Load list with pagination |
| POST | `/api/{{endpoint}}` | Create new record |
| PUT | `/api/{{endpoint}}` | Update existing record |
| DELETE | `/api/{{endpoint}}` | Delete / deactivate record |
| GET | `/api/{{endpoint}}` | Load options for dropdown |

---

## Key Identifiers

| Element | Selector / Identifier | Notes |
|---------|----------------------|-------|
| {{button}} | {{selector}} | {{usage}} |
| {{table}} | {{selector}} | {{usage}} |
| {{modal}} | {{selector}} | Opens on: {{trigger}} |

---

## Related Submodules

| Submodule | Relationship | Notes |
|-----------|-------------|-------|
| {{submodule}} | Provides data to this module | Dropdown populated from {{API}} |
| {{submodule}} | Depends on data from this module | — |

---

## Notes

- {{any technical notes discovered during analysis}}
- {{gotchas or non-obvious behaviors}}
