# Data Volatility Strategies

> The QA environment is typically shared between automated tests and manual testers.
> Data (record counts, available filter values, document states) changes constantly,
> which invalidates hardcoded values in specs. Document the chosen strategy here.

## Problem

List the types of data that are volatile in this project's QA environment.

| Data type | Example of fragile assertion | Tests affected |
|---|---|---|
| Filter option values | `hasText: 'specific-value'` | _Add count here_ |
| Exact row counts | `toBe(33)` | _Add count here_ |
| Record names used as search inputs | `fill('specific-record-name')` | _Add count here_ |
| Process or transaction IDs | `TEST_ID = '608'` | _Add count here_ |

## Strategy 1: Shared Constants with Dynamic Discovery

Maintain a `fixtures/test-data-constants.ts` file with well-named constants. Populate them
from a discovery step (global-setup or a `beforeAll` fixture) that reads the actual environment.

```typescript
// fixtures/test-data-constants.ts
export const QA_ITEM_CURRENT = 'current-item-name';  // most recent available
export const QA_ITEM_OLDEST  = 'oldest-item-name';   // oldest available
export const QA_ITEM_INVALID = 'nonexistent-item';   // guaranteed absent
```

**Tradeoff:** eliminates hardcoded filter values centrally, but discovery adds startup time
and blocks the suite if it fails.

## Strategy 2: Resilient Assertions (Patterns and Ranges)

Replace exact-value assertions with pattern or range checks.

```typescript
// Instead of:
expect(count).toBe(33);
await expect(counter).toHaveText('1-5 of 5');

// Use:
expect(count).toBeGreaterThan(0);
await expect(counter).toHaveText(/\d+-\d+ of \d+/);
```

**Tradeoff:** no extra infrastructure, each test is self-contained, but precision is lower.
Useful for count assertions; less useful for filter-value selection.

## Strategy 3: Snapshot Delta Validation

Capture the initial state before applying a filter, then assert that the filtered state
differs from the initial state in the expected direction (fewer rows, etc.).

**Tradeoff:** maximum resilience, but tests become longer and harder to trace. Use only for
critical filter tests where behavior (not data) must be validated.

## Chosen Approach

> Document which strategy (or combination) was chosen for this project, and which test
> categories each strategy applies to.

| Test category | Strategy | Status |
|---|---|---|
| Filter option values | Strategy 1 or 2 | _Pending / Implemented_ |
| Row count assertions | Strategy 2 | _Pending / Implemented_ |
| Search input values | Strategy 2 or 3 | _Pending / Implemented_ |

> Tests that are blocked on a data strategy can be marked `test.skip()` with a
> `PENDING-DATA-STRATEGY` annotation until the strategy is implemented.
