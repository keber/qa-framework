# Defect-suite polarity

Helper: `qa/07-automation/e2e/fixtures/defects.ts` (installed by `init`, delivered by
`upgrade` when the project does not have its own copy).

## The rule

A test asserts what the **specification** requires, never what the application does
today. When the application departs from the spec and the defect is already reported,
the test documents the defect instead of being bent to match it:

```
defect reproduces  -> assertion fails  -> expected failure -> run stays GREEN
behaviour changes  -> assertion passes -> run goes RED     -> verify and close the defect
```

The red run on the day the behaviour changes is the point: it is the signal that
someone fixed the defect (or changed the behaviour again) and the defect record must be
closed. A test rewritten to assert the wrong behaviour hides the defect forever.

## When to use it

| Situation | Use |
|---|---|
| The app departs from the spec and the defect is reported (`qa/06-defects/open/` or the tracker) | `expectOpenDefect(id, reason, assertions)` |
| The app departs from the spec and nobody has reported it yet | Report the defect first, then mark the test |
| The environment, the session, the data or the test itself is broken | `throw new InfraError(kind, message)` - never a defect marker |
| A test whose data was patched but whose root cause is still live | Keep it as a read-only health guard and say in its title that green does NOT mean the cause is fixed |
| The spec itself is unclear | Do not mark anything: resolve the spec first (`PENDING-CODE`) |
| The app could be better, but no business rule requires anything else | Not a defect: file it in `qa/06-defects/recommendations/`. No marker, no failing assertion |

## The three parts

- **`expectOpenDefect(id, reason, assertions)`** - recommended form. Runs the pure
  assertions and marks the test as an expected failure (`test.fail`) only when one of
  them fails (a thrown `expect` or a new `expect.soft` failure). An `InfraError` is
  rethrown unmarked, so the run goes red. If every assertion passes it fails with
  `<id> no longer reproduces`, which tells the reader exactly what to do.
- **`openDefect(id, reason)`** - the bare marker. Everything that fails after the call
  is reported as the expected failure, so it goes **immediately before** the pure
  assertions and nowhere else. When the behaviour changes the run goes red with
  Playwright's generic "expected to fail, but passed".
- **`InfraError(kind, message, { cause })`** - for every failure that is not the
  product behaviour under test. Kinds: `session-expired`, `app-unavailable`,
  `unexpected-response` (non-JSON body, status outside the expected set),
  `timeout`, `selector-drift`, `test-data`, `other`. Use `isInfraError(error)` to
  recognise one.

Both markers refuse to run when the test already has a failure (for example an earlier
`expect.soft`): marking it then would report that broken precondition as the expected
failure. Both also record an `open-defect` annotation (`<id>: <reason>`) that shows in
the HTML report.

## Prescribed order

1. Do every action and observation first: navigation, requests, reads of the values
   the assertions will check.
2. Turn anything unknown into an `InfraError`: a response that is not JSON, a status
   the spec does not allow, a timeout, a locator that no longer matches. Throw it; do
   not assert on it.
3. Only then run the pure assertions on the values already collected, inside
   `expectOpenDefect()` (or right after `openDefect()`).

Why the order matters: if the marker runs first, an expired session or a renamed
selector fails the test, the failure counts as "the defect reproduces", and the run is
green while nothing was checked.

```typescript
import { test, expect } from '../../fixtures/base';
import { expectOpenDefect, InfraError } from '../../fixtures/defects';

test('[TC-SALES-ORD-014] order total applies the volume discount @P1', async ({ page }) => {
  // 1. actions and observations
  await page.goto('/orders/new');
  const response = await page.waitForResponse((r) => r.url().includes('/api/orders/quote'));
  if (response.status() === 401) {
    throw new InfraError('session-expired', 'quote endpoint answered 401');
  }
  if (response.status() !== 200) {
    throw new InfraError('unexpected-response', `quote endpoint answered ${response.status()}`);
  }
  const body = await response.json().catch((cause) => {
    throw new InfraError('unexpected-response', 'quote body is not JSON', { cause });
  });

  // 2. pure assertions, marked as the open defect
  await expectOpenDefect('DEF-031', 'the volume discount is not applied to the total', () => {
    expect(body.total).toBe(body.subtotal * 0.9);
  });
});
```

## Diagnostic mode: `DEFECTS_DIAG=1`

With `DEFECTS_DIAG=1` no marker is applied and the test reports its raw result:

```
DEFECTS_DIAG=1 npx playwright test tests/sales/orders.spec.ts
```

(PowerShell: `$env:DEFECTS_DIAG = '1'; npx playwright test ...`)

Use it when a marked test is added or touched: the test must fail, and the failure
message must be the spec assertion, not a `TypeError`, a timeout or an `InfraError`.
Any other result is a bug in the test, which the marker would otherwise report as
green. Never set it in CI.

## Closing the defect

When a run goes red with `no longer reproduces` (or "expected to fail, but passed"):

1. Verify the new behaviour against the spec.
2. Close the defect in the tracker and move its record out of `qa/06-defects/open/`.
3. Remove the marker so the test becomes a regular regression test.

## API tests

Tests in `qa/07-automation/integration/` follow the same polarity with `test.fail()`
as described in the `qa-api-integration` skill (`../../qa-api-integration/SKILL.md`).
The integration project is self-contained and does not import from `e2e/`: if it needs
the helper, copy `defects.ts` into `integration/fixtures/` as a project-owned file.
