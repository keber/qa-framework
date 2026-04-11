# Reference: Module Exploration Checklist

> Loaded by `skills/qa-module-analysis/` when performing Phase 2 exploration.

---

## 2.1 Navigation and Route Mapping

```
Navigate to {{QA_BASE_URL}} and log in with the appropriate role
Navigate to the submodule URL
Record:
  - Full URL of each page/view
  - Page title
  - Navigation breadcrumb
```

---

## 2.2 UI Inventory

For each screen in the submodule:

```
Record all:
  - Input fields (name, type, required/optional, validation rules visible in UI)
  - Dropdowns (static or dynamic/AJAX; enumerate options if static)
  - Buttons (action label + what they trigger)
  - Tables/grids (columns, default sorting, pagination behavior)
  - Modals (trigger condition, fields, confirmation button behavior)
  - Status indicators / badges / alerts
  - File upload / download controls
```

---

## 2.3 API Endpoint Discovery

```
Observe network requests during key interactions (create, read, update, delete)
Record:
  - Endpoint path (e.g., /api/GetUsers, /api/CreateUser)
  - HTTP method (GET, POST, PUT, DELETE)
  - Request payload shape (field names)
  - Response shape (key fields returned)
```

---

## 2.4 Role-Based Access Testing

```
For each configured test user role:
  Log in as that role
  Navigate to the submodule
  Record: can access? (YES / NO / PERMISSION_ERROR)
  Record: which actions are available vs hidden/disabled
```

---

## 2.5 Workflow Discovery

```
Execute the primary happy path with appropriate test data
Record each step (clickable element → navigation result → system state change)
Identify branch points (e.g., approve vs reject)
Record state transitions (pending → approved → rejected)
```

---

## 2.6 Business Rule Discovery

```
For each input field and business action:
  Attempt invalid inputs: empty, too long, wrong format, duplicate, out of range
  Record: validation message exact text
  Record: which field shows the error
  Record: system behavior (block submission / inline error / toast / redirect)
```

---

## Phase 4 Completeness Checklist

After completing all submodule files:

- [ ] All menu items in the module have a corresponding submodule folder
- [ ] All TCs marked `UI-OBSERVED` were actually observed in this session
- [ ] `01-business-rules.md` covers all visible validation behaviors
- [ ] `03-roles-permissions.md` reflects the access observed for each role
- [ ] No credentials appear in any file
- [ ] All TC IDs are unique across the module
- [ ] Module README lists all submodules with their codes and TC counts
- [ ] Session summary created at `qa/SESSION-SUMMARY-{date}.md`

---

## Session Summary Template

```markdown
# Session Summary — {YYYY-MM-DD}

## Module analyzed
{module-name} ({module-code})

## Submodules documented
| Submodule | Code | TC count | Notes |
|-----------|------|----------|-------|
| {name}    | {code} | {N}    | {any notable blocking issues} |

## Files created
- {path/to/file.md}

## Blockers
- {any features marked PENDING-CODE or BLOCKED-PERMISSIONS}

## Next steps
- {what remains before automation can begin}
```
