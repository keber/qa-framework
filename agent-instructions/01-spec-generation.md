# Agent Instructions: Specification Generation

**File**: `agent-instructions/01-spec-generation.md`  
**Purpose**: Detailed instructions for generating the 6-file submodule specification set from a completed module analysis or from existing source material (UI observation, requirements docs, developer input).

---

## When to use

- After Phase 2 (Exploration) of module analysis is complete
- When updating specs after a code change
- When a spec file is missing or incomplete

---

## Inputs Required

Before generating specs, gather:

1. **Module exploration notes** — from the analysis session
2. **Module code** — from `qa/00-standards/naming-conventions.md` or allocate a new one
3. **Submodule name** and its kebab-case directory name
4. **QA environment observations** — what you actually saw in the UI

---

## File-by-File Generation Rules

### `00-inventory.md` — UI and API Inventory

**Header block** (always required):

```markdown
# MODULE: {Module Display Name} — Submodule: {Submodule Display Name}

| Field | Value |
|-------|-------|
| Module code | {MODULE_CODE} |
| Submodule code | {SUBMODULE_CODE} |
| Primary URL | {{QA_BASE_URL}}/path/to/submodule |
| Status | Active / Deprecated / In Development |
| Last updated | YYYY-MM-DD |
```

**UI element table**:

```markdown
## UI Elements

| Element | Type | Required | Notes |
|---------|------|----------|-------|
| {field-name} | text / select / checkbox / date | Yes/No | {validation rule} |
```

**API endpoints table**:

```markdown
## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/{endpoint} | {description} |
| POST | /api/{endpoint} | {description} |
```

**Do NOT include**: credentials, personal data, real user IDs.

---

### `01-business-rules.md` — Business Rules

**Format for each rule**:

```markdown
### RN-{MODULE}-{NNN}: {Rule Title}

- **Type**: Validation / Access Control / State Machine / Calculation / Integration
- **Trigger**: {What user action triggers this rule}
- **Behavior**: {What the system does when the rule is evaluated}
- **Error message** (if validation): "{exact text as shown in UI}"
- **Notes**: {any special circumstances}
```

**Rule identification tips**:
- Every required field → at least 1 RN (field is required)
- Every unique constraint → 1 RN (duplicate not allowed)
- Every state transition → 1 RN (can only approve if status=pending)
- Every role restriction → 1 RN (only role X can see this)
- Every auto-calculated field → 1 RN (total = quantity × price)

**Minimum**: 5 rules per submodule. **Typical**: 8–15.

---

### `02-workflows.md` — User Workflows

**Format for each workflow**:

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

Cover at minimum:
- Primary happy path (end-to-end main scenario)
- Rejection / cancellation path (if applicable)
- Error path (validation failure, system error)

---

### `03-roles-permissions.md` — Role Matrix

**Format**:

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

**Notes**: {any conditional access rules, e.g., "Admin can only edit own records"}
```

**Do NOT include**: actual email addresses, passwords, or personal identifiers.

---

### `04-test-data.md` — Test Data Requirements

**Format**:

```markdown
# Test Data — {Submodule}

## Prerequisites

The following data must exist in the QA environment before tests run:

| Item | Description | Source |
|------|-------------|--------|
| {entity} | {description} | QA seed / pre-existing |

## Data shapes for key scenarios

### Scenario: {happy path}
- Field A: {value type, e.g., "any valid text, max 100 chars"}
- Field B: {value type}
- User: role `{ROLE_NAME}`, credentials from `QA_USER_{ROLE}_EMAIL` env var

### Scenario: {negative — duplicate}
- Precondition: {entity} with the same key already exists
- Field A: {same value as existing record}
- Expected: {system rejection behavior}

## Dynamic data generation

For tests that create new records, use the EXEC_IDX pattern to avoid collisions:

```typescript
const EXEC_IDX = Math.floor(Date.now() / 60_000) % 100_000;
const uniqueTitle = `Test-${EXEC_IDX}`;
```

## Data isolation rules

1. Each test must operate on its own data (no shared mutable state between tests)
2. Tests that require pre-existing data must provision it in `beforeAll`
3. Provisioned data does not need to be cleaned up if EXEC_IDX-based names are used
```

---

### `05-test-scenarios.md` — Test Cases

**Header block** (always required):

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
```

**Format for each test case**:

```markdown
### TC-{MODULE}-{SUBMODULE}-{NNN}: {TC Title}

| Field | Value |
|-------|-------|
| Priority | P0 / P1 / P2 / P3 |
| Type | Functional / Negative / Regression / Security / Integration |
| Origin | UI-OBSERVED / PENDING-CODE / BLOCKED-PERMISSIONS |
| Automation | Yes / Partial / No |
| Playwright | (leave blank until automation is written; then: `tests/{module}/file.spec.ts`) |

**Preconditions**:
- {precondition 1}

**Steps**:
1. {step 1}
2. {step 2}
3. {step 3}

**Expected result**: {what should happen}

**Notes**: {any special considerations, DEF references, skip conditions}
```

**Mandatory coverage categories** (must have at least 1 TC per category where applicable):

- [ ] Access: unauthenticated user redirected to login
- [ ] Access: role without permission receives error / empty page
- [ ] Happy path: primary workflow with valid data succeeds
- [ ] Negative: required field missing → validation error shown
- [ ] Negative: duplicate record → system rejects with error message
- [ ] Negative: invalid format → system rejects with format error
- [ ] State transition: state changes correctly on action
- [ ] Export / download: if feature exists, file is generated
- [ ] Pagination / search: if feature exists, filtering works correctly

---

## Common Anti-Patterns to Avoid

| Anti-pattern | Why it's wrong | Correct approach |
|---|---|---|
| TC for a feature not in QA env | Creates invalid test expectations | Mark as `PENDING-CODE`, don't write test steps |
| TC with a real user's DNI in steps | Security issue | Use env var reference |
| TC with "click the X button" without knowing the element exists | Assumes UI without observation | Verify element exists first |
| 100+ TCs per submodule by copy-pasting variations | Bloats the spec without value | Merge near-identical cases, use parameterization |
| TC with "verify system works correctly" as expected result | Untestable | Write observable, measurable expected result |
