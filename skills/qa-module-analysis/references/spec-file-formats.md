# Reference: Specification File Formats

> Shared by `skills/qa-module-analysis/` and `skills/qa-spec-generation/`.  
> Contains the exact format templates for all 6 spec files.

---

## `00-inventory.md`

```markdown
# MODULE: {Module Display Name} — Submodule: {Submodule Display Name}

| Field | Value |
|-------|-------|
| Module code | {MODULE_CODE} |
| Submodule code | {SUBMODULE_CODE} |
| Primary URL | {{QA_BASE_URL}}/path/to/submodule |
| Status | Active / Deprecated / In Development |
| Last updated | YYYY-MM-DD |

## UI Elements

| Element | Type | Required | Notes |
|---------|------|----------|-------|
| {field-name} | text / select / checkbox / date | Yes/No | {validation rule} |

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/{endpoint} | {description} |
| POST | /api/{endpoint} | {description} |
```

---

## `01-business-rules.md`

```markdown
### RN-{MODULE}-{NNN}: {Rule Title}

- **Type**: Validation / Access Control / State Machine / Calculation / Integration
- **Trigger**: {What user action triggers this rule}
- **Behavior**: {What the system does when the rule is evaluated}
- **Error message** (if validation): "{exact text as shown in UI}"
- **Notes**: {any special circumstances}
```

**Rule identification tips**:
- Every required field → at least 1 RN
- Every unique constraint → 1 RN (duplicate not allowed)
- Every state transition → 1 RN (can only approve if status=pending)
- Every role restriction → 1 RN
- Every auto-calculated field → 1 RN

---

## `02-workflows.md`

```markdown
### FL-{MODULE}-{NNN}: {Workflow Title}

**Actor**: {Role who performs this workflow}
**Trigger**: {What initiates the workflow}
**Precondition**: {What must be true before this starts}

**Flow**:
```
[Start]
    │
    ▼
[Step 1: action]
    │
    ├─ [Alternative: condition] ──► [Alternative path]
    │
    ▼
[Step 2: action]
    │
    ▼
[End: outcome]
```

**Postcondition**: {State of the system after the workflow completes}
```

---

## `03-roles-permissions.md`

```markdown
# Roles and Permissions — {Submodule}

## Access Matrix

| Feature / Action | {Role 1} | {Role 2} | {Role 3} |
|-----------------|---------|---------|---------|
| View list | ✅ | ✅ | ❌ |
| Create new | ✅ | ❌ | ❌ |
| Edit | ✅ | ❌ | ❌ |
| Delete | ✅ | ❌ | ❌ |
| Approve | ❌ | ✅ | ❌ |
| Export | ✅ | ✅ | ❌ |

## Test User Reference

| Role | Env var (email) | Env var (password) |
|------|----------------|-------------------|
| {Role 1} | `QA_USER_{ROLE}_EMAIL` | `QA_USER_{ROLE}_PASSWORD` |

**Notes**: {conditional access rules}
```

---

## `04-test-data.md`

```markdown
# Test Data — {Submodule}

## Prerequisites

| Item | Description | Source |
|------|-------------|--------|
| {entity} | {description} | QA seed / pre-existing |

## Data shapes for key scenarios

### Scenario: {happy path}
- Field A: {value type}
- User: role `{ROLE_NAME}`, credentials from `QA_USER_{ROLE}_EMAIL` env var

### Scenario: {negative — duplicate}
- Precondition: {entity} with the same key already exists
- Field A: {same value as existing record}
- Expected: {system rejection behavior}

## Dynamic data generation (EXEC_IDX pattern)

```typescript
const EXEC_IDX = process.env.EXEC_IDX ?? String(Math.floor(Date.now() / 60_000) % 100_000);
const uniqueTitle = `Test-${EXEC_IDX}`;
```

## Data isolation rules

1. Each test operates on its own data (no shared mutable state between TCs)
2. Tests requiring pre-existing data provision it in `beforeAll`
3. EXEC_IDX-named data does not require cleanup
```

---

## `05-test-scenarios.md`

```markdown
# Test Scenarios — {Module}: {Submodule}

**Module code**: {MODULE_CODE}  
**Submodule code**: {SUBMODULE_CODE}  
**Last updated**: YYYY-MM-DD

## Summary

| Priority | Count | Automated | Manual |
|----------|-------|-----------|--------|
| P0 | {N} | {N} | {N} |
| P1 | {N} | {N} | {N} |
| P2 | {N} | {N} | {N} |
| P3 | {N} | {N} | {N} |
| **Total** | **{N}** | **{N}** | **{N}** |

---

### TC-{MODULE}-{SUBMODULE}-{NNN}: {TC Title}

| Field | Value |
|-------|-------|
| Priority | P0 / P1 / P2 / P3 |
| Type | Functional / Negative / Regression / Security / Integration |
| Origin | UI-OBSERVED / PENDING-CODE / BLOCKED-PERMISSIONS |
| Automation | Yes / Partial / No |
| Playwright | (fill after automation is written) |

**Preconditions**:
- {precondition 1}

**Steps**:
1. {step 1}
2. {step 2}
3. {step 3}

**Expected result**: {observable, measurable outcome}

**Notes**: {DEF references, skip conditions, edge cases}
```

### Mandatory coverage checklist

- [ ] Access: unauthenticated user redirected to login
- [ ] Access: role without permission receives error or empty page
- [ ] Happy path: primary workflow with valid data succeeds
- [ ] Negative: required field missing → validation error shown
- [ ] Negative: duplicate record → system rejects with error message
- [ ] Negative: invalid format → format error shown
- [ ] State transition: state changes correctly on action
- [ ] Export/download: file is generated (if feature exists)
- [ ] Pagination/search: filtering works correctly (if feature exists)

---

## Common Anti-Patterns

| Anti-pattern | Why it's wrong | Correct approach |
|---|---|---|
| TC for a feature not in QA env | Invalid test expectations | Mark as `PENDING-CODE` |
| Real user data in steps | Security issue | Use env var reference |
| "click the X button" without observed element | Assumes UI | Verify element exists first |
| 100+ TCs by copy-pasting variations | Bloats spec | Merge near-identical cases |
| "verify system works correctly" | Untestable | Write observable expected result |
