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
Record each step (clickable element -> navigation result -> system state change)
Identify branch points (e.g., approve vs reject)
Record state transitions (pending -> approved -> rejected)
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

## 2.7 Cross-Module and Cascading-Field Dependency Discovery

A dynamic field (any dropdown, autocomplete, lookup or list whose options are loaded at
runtime, see 2.2) is often scoped by something other than its own form: another field
of the same form (a cascade), the state of another record, or data owned by a different
module. When that dependency is not documented, an empty list is easily misread as
"the catalog is empty" or "the field is broken", and someone pays to rediscover the
mechanism live later. Do this step for every dynamic field before writing any spec
content about it.

```
1. Identify what feeds the field's options:
   - Always the same list, whatever else is on screen? -> a static or module-local catalog.
   - Changes with another field's value, another record's state, or data from another
     module? -> a cascading or cross-module dependency. Do not document it as empty,
     unused or broken until steps 2 and 3 are done.

2. Exercise the suspected driver with the network capture open:
   - Change the driving field or record to 2-3 different values (not one). One empty
     result only says that this value has no associated data.
   - Record the real endpoint that fires when the driver changes, with its method and
     the parameter that carries the driving value (e.g. GET /api/{entity}/{drivingValue}).
     Compare it with the endpoint you assumed: a field is often populated by a dedicated,
     scoped endpoint, not by its own generic list or select endpoint.
   - Record which values returned options and which returned none.

3. When the data comes from another module, find the upstream validity condition:
   - Open that module and inspect a few real records: what state makes a record count
     as a source for this field? Typical patterns: the parent record needs child or
     detail lines, not only a saved header; a specific field of the upstream record
     must be filled; a configuration or mapping record must exist for the combination
     of values used downstream.
   - Confirm the condition with at least one record that meets it and one that does not.

4. Record the finding as a dependency, not as a defect, unless it is independently
   confirmed broken:
   - In `01-business-rules.md`: an `RN-{MODULE}-{NNN}` of Type "Dependency"
     (shape in `spec-file-formats.md`), naming the upstream entity and the exact
     validity condition.
   - In `04-test-data.md`: a row in the "Upstream dependencies" table with the same
     entity and condition, so test data setup creates the upstream record, not only
     this module's own seed data.
```

**Component libraries vary.** How a dynamic field loads its options (on open, on typing,
on focus, through a virtualized list) depends on the UI component library. Identify the
field by its label and the network call it triggers, not by library-specific markup.

**Anti-pattern**: declaring a field empty, unused or broken after trying one value.
If a field's options come from anywhere other than its own static list, assume a
dependency exists until 2-3 values and the network capture say otherwise.

---

## Phase 4 Completeness Checklist

After completing all submodule files:

- [ ] All menu items in the module have a corresponding submodule folder
- [ ] All TCs marked `UI-OBSERVED` were actually observed in this session
- [ ] `01-business-rules.md` covers all visible validation behaviors
- [ ] Every dynamic field was exercised with 2-3 driving values and the network capture before being documented as static, cascading or broken (section 2.7)
- [ ] Every cascading or cross-module dependency found is an RN of Type "Dependency" in `01-business-rules.md` and a row of the "Upstream dependencies" table in `04-test-data.md`
- [ ] `03-roles-permissions.md` reflects the access observed for each role
- [ ] No credentials appear in any file
- [ ] All TC IDs are unique across the module
- [ ] Module README lists all submodules with their codes and TC counts
- [ ] Session summary created at `qa/SESSION-SUMMARY-{date}.md`

---

## Session Summary Template

```markdown
# Session Summary - {YYYY-MM-DD}

## Module analyzed
{module-name} ({module-code})

## Submodules documented
| Submodule | Code | TC count | Notes |
|-----------|------|----------|-------|
| {name}    | {code} | {N}    | {any notable blocking issues} |

## Files created
- {path/to/file.md}

## Blockers
- {any features marked PENDING-CODE, PENDING-BROWSER, or BLOCKED-PERMISSIONS}

## Next steps
- {what remains before automation can begin}
```
