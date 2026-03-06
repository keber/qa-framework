# docs/spec-driven-philosophy.md

## Spec-Driven Automated Testing — Core Philosophy

This document explains the methodology that underpins the entire `qa-framework`.

---

## The Core Principle: UI is the Source of Truth

> A test case is only valid if it describes behavior that is **visible**, **accessible**, and **observable** in the running QA environment.

Never write test cases from:
- Source code (a route may be implemented but hidden in the UI)
- Requirements documents (a requirement may not yet be deployed)
- Database schemas (business logic in the DB does not equal a user-facing feature)

**Always** write test cases after observing the actual QA environment behavior.

### TC Origin Classification

Every test case must declare its origin:

| Origin tag | Meaning |
|---|---|
| `UI-OBSERVED` | The behavior was observed directly in the running QA environment |
| `PENDING-CODE` | The feature is planned but not yet deployed |
| `BLOCKED-PERMISSIONS` | The feature exists but the QA user cannot access it |

A test case with origin `PENDING-CODE` or `BLOCKED-PERMISSIONS` must be in `test.skip()` until its status changes.

---

## The Spec-Before-Automation Rule

```
Specification exists FIRST → Automation comes second
```

Automation artifacts (spec files, page objects) always reference a spec TC-ID. It is never acceptable to write a Playwright test without a corresponding TC in `05-test-scenarios.md`.

This provides:
- **Traceability**: every test can be traced back to a business requirement
- **Coverage visibility**: the spec is the source of truth for what is and isn't covered
- **Prioritization**: P0/P1/P2/P3 priorities are set in the spec, not in the test file

---

## The 6-File Submodule Pattern

The basic unit of QA work is a **submodule**. Every submodule produces exactly 6 files:

```
submodule-{name}/
├── 00-inventory.md         What exists (UI elements, APIs, routes)
├── 01-business-rules.md    Rules the system enforces (RN-* IDs)
├── 02-workflows.md         User flows (FL-* flowcharts)
├── 03-roles-permissions.md Who can do what
├── 04-test-data.md         What data is needed to test
└── 05-test-scenarios.md    Test cases (TC-* IDs, priority, steps)
```

This pattern ensures every submodule is analyzed with the same depth, regardless of complexity.

---

## Test Pyramid Targets

| Layer | Target |
|---|---|
| Unit tests (back-end) | ~70% of all tests |
| Integration tests | ~20% of all tests |
| E2E browser tests | ~10% of all tests |

The framework focuses on the **E2E layer** (10%), because this is where spec-driven automation adds the most value and where agents can contribute most directly.

E2E tests should cover:
- Critical happy paths (P0)
- Key negative scenarios (P1)
- Cross-module integration flows (P1)

E2E tests should NOT try to cover:
- Every edge case (that's the unit test layer)
- Every data validation (that's the integration test layer)
- Pure UI cosmetics

---

## Priority Levels

| Priority | Meaning | Target in automation |
|---|---|---|
| **P0** | Critical — system unusable without this | Must be automated |
| **P1** | High — significant impact if broken | Should be automated |
| **P2** | Medium — moderate impact | Automate if feasible |
| **P3** | Low — minor impact | Manual testing acceptable |

In the automation suite, P0 tests form the **smoke suite** that runs on every CI build.
P1 tests run on scheduled runs or before each release.
P2/P3 are candidates for manual exploratory testing.

---

## Defect Handling in Automation

When a test fails because of a **known bug** (not a test error):

1. File a defect record (`06-defects/DEF-NNN.md` or ADO Work Item)
2. Add `test.skip(true, 'DEF-NNN: description. Reactivate when ADO #{WI_ID} is resolved.')` to the test
3. Make the test assertion document the buggy behavior: do not make it pass incorrectly
4. When the bug is fixed: remove the skip, verify it passes ≥2 times with different `EXEC_IDX`, then close the defect

**Never** make a test "green" by removing the assertion that catches the bug. The test should accurately describe expected behavior.

---

## Correctness Criteria for Automation

A test is considered **stable** only when:

1. It passes ≥ 2 consecutive runs with **different `EXEC_IDX` values** (i.e., different time slots)
2. It does not rely on pre-existing data that could disappear
3. It can be run independently (not dependent on another test's side effects)

The `EXEC_IDX` pattern:

```typescript
// Changes every 60 seconds, wraps at 100,000
const EXEC_IDX = Math.floor(Date.now() / 60_000) % 100_000;

// Use in test data to generate unique values
const testDate = `${2120 + (EXEC_IDX % 10)}-01-${String((EXEC_IDX % 28) + 1).padStart(2, '0')}`;
```

This avoids:
- Database unique constraint violations (same data in back-to-back runs)
- Need for test teardown (different dates don't collide)
- Test data that expires or becomes invalid

---

## Credential Security Rules

1. **Never** put real credentials in any Markdown file
2. **Never** put real credentials in test code directly; always read from `process.env`
3. **Always** use `page.evaluate()` (not `page.fill()`) to input passwords, so they are excluded from Playwright traces
4. When writing execution reports or session summaries, replace any accidentally captured credentials with `<PLACEHOLDER>`
5. `.env` files are always gitignored; use `.env.example` as the committed template

---

## Agent-Assisted vs Human QA Work

This framework supports both:

| Task | Primary actor |
|---|---|
| Module analysis (discover UI, map routes) | Agent (using Playwright CLI) |
| Writing 6-file submodule specs | Agent (using module-analysis instructions) |
| Test case generation | Agent (guided by TC templates) |
| Automation code | Agent (guided by automation instructions) |
| Exploratory testing | Human |
| Bug filing and root cause | Human (agent can assist) |
| ADO sync | Agent (guided by ADO integration instructions) |
| Maintenance after code change | Agent + Human review |

The handoff between agent and human should always happen at a known checkpoint:
- After the spec set is produced → human reviews before automation is written
- After automation is written → human reviews coverage mapping
- After a defect is filed → human decides priority and fix approach
