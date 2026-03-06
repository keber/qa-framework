# Test Data — {{MODULE_NAME}}: {{SUBMODULE_NAME}}

> **Module code**: {{MODULE_CODE}} | **Submodule code**: {{SUBMODULE_CODE}}  
> **Last updated**: YYYY-MM-DD

> ⚠️ **Security reminder**: Never put actual credentials, DNIs, or personal data in this file.  
> All credentials are read from environment variables only.

---

## Prerequisites

The following data must exist in the QA environment before tests run:

| Item | Description | How provided |
|------|-------------|-------------|
| {{entity type}} | At least 1 active record exists | QA seed / pre-existing in env |
| User: {{Role 1}} | Active user with {{Role 1}} role | `QA_USER_{{ROLE1_UPPER}}_EMAIL` env var |
| User: {{Role 2}} | Active user with {{Role 2}} role | `QA_USER_{{ROLE2_UPPER}}_EMAIL` env var |
| {{Prerequisite N}} | {{Description}} | Manual setup required / Seeder script |

---

## Data Shapes for Key Scenarios

### Scenario: Happy path — create record

| Field | Value / Rule |
|-------|-------------|
| {{name-field}} | `Test-{EXEC_IDX}` — unique per run via EXEC_IDX pattern |
| {{select-field}} | Any valid option (first option is acceptable) |
| {{date-field}} | `${2120 + (EXEC_IDX % 10)}-01-01` — future date, collision-resistant |
| User | `{{Role 1}}`, credentials from `QA_USER_{{ROLE1_UPPER}}_EMAIL` |

### Scenario: Required field validation

| Field | Value |
|-------|-------|
| {{name-field}} | Empty (leave blank) |
| All other fields | Valid values |

**Expected**: Validation error prevents submission.

### Scenario: Duplicate rejection

| Field | Value |
|-------|-------|
| {{unique-field}} | Same value as an existing record |

**Expected**: System error message: "{{exact duplicate error text}}"

### Scenario: State transition — {{action}}

| Field | Value |
|-------|-------|
| Source record | Record in status `{{STATUS_A}}` |
| Action | Click '{{action button}}' |

**Expected**: Record transitions to status `{{STATUS_B}}`. {{Notification sent if applicable.}}

---

## Dynamic Data Generation Pattern

For tests that create records and need unique identifiers:

```typescript
// Changes every 60 seconds. Provides collision-resistant keys without cleanup.
const EXEC_IDX = Math.floor(Date.now() / 60_000) % 100_000;

// String key
const entityName = `Test-${EXEC_IDX}`;

// Date (far future avoids prod data overlap)
const year = 2120 + (EXEC_IDX % 10);
const month = String((EXEC_IDX % 12) + 1).padStart(2, '0');
const day = String((EXEC_IDX % 28) + 1).padStart(2, '0');
const testDate = `${year}-${month}-${day}`;
```

---

## Data Isolation Rules

1. Each test creates its own data — no shared mutable state between tests
2. `beforeAll` creates records for the entire suite — provision ≥ N records for N consuming tests
3. No test teardown required when EXEC_IDX-based names are used (future-dated records do not collide across runs)
4. If a test modifies shared data (approve/reject), it must create its own record in `beforeAll`

---

## Retired / Deprecated Test Data

| Item | Reason for retirement | Replaced by |
|------|-----------------------|-------------|
| {{item}} | Real employee data — PII risk | EXEC_IDX-generated test record |

---

## Changelog

| Version | Date | Description |
|---------|------|-------------|
| 1.0 | YYYY-MM-DD | Initial creation |
