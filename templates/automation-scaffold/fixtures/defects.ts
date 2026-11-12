/**
 * fixtures/defects.ts
 *
 * Defect-suite polarity: a test asserts what the SPECIFICATION requires, never what
 * the application does today. When the application departs from the spec and the
 * defect is already reported, the test documents it instead of being bent to match:
 *
 *   defect reproduces  -> the assertion fails -> expected failure -> run stays GREEN
 *   behaviour changes  -> the assertion passes -> run goes RED   -> close the defect
 *
 * Three parts, all load-bearing:
 *
 *   - expectOpenDefect(id, reason, assertions) - recommended. Runs the pure assertions
 *     and marks the test as an expected failure only when one of them fails. An
 *     InfraError is rethrown unmarked, and passing assertions fail with an explicit
 *     "no longer reproduces" message.
 *   - openDefect(id, reason) - the bare marker (test.fail). Call it ONLY immediately
 *     before the pure assertions: anything that fails after it is reported green.
 *   - InfraError - for every failure that is not the product behaviour under test:
 *     expired session, application down, non-JSON or unexpected status responses,
 *     timeouts, selector drift, missing test data.
 *
 * Prescribed order inside a defect test:
 *   1. do every action and observation (navigation, requests, reads);
 *   2. turn anything unknown into an InfraError (throw it, do not assert on it);
 *   3. only then expectOpenDefect(...) (or openDefect() right before) the pure
 *      assertions on the values already collected.
 *
 * Diagnostic mode: DEFECTS_DIAG=1 disables the marker, so the test reports its real
 * result. Use it to confirm that a test fails BECAUSE of the defect and not because
 * of a bug in the test itself.
 *
 * Guide: .github/skills/qa-automation/references/defect-polarity.md
 */

import { test } from '@playwright/test';

export type InfraErrorKind =
  | 'session-expired'
  | 'app-unavailable'
  | 'unexpected-response'
  | 'timeout'
  | 'selector-drift'
  | 'test-data'
  | 'other';

/**
 * A failure of the environment or the test infrastructure, never a product defect.
 * Never marked as an expected failure: it always turns the run red.
 */
export class InfraError extends Error {
  readonly kind: InfraErrorKind;

  constructor(kind: InfraErrorKind, message: string, options?: { cause?: unknown }) {
    super(`[infra:${kind}] ${message}`);
    this.name = 'InfraError';
    this.kind = kind;
    if (options && 'cause' in options) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

/**
 * True for an InfraError. Also matches by name, so an error raised by a second copy
 * of this module (another import path) is still recognised.
 */
export function isInfraError(error: unknown): error is InfraError {
  return (
    error instanceof InfraError ||
    (error instanceof Error && error.name === 'InfraError')
  );
}

/** True when DEFECTS_DIAG=1: open-defect markers are disabled for this run. */
export function defectsDiagEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.DEFECTS_DIAG === '1';
}

interface DefectRef {
  id: string;
  reason: string;
}

function defectRef(id: string | number, reason: string): DefectRef {
  const cleanId = String(id ?? '').trim();
  const cleanReason = String(reason ?? '').trim();
  if (!cleanId) {
    throw new Error('[open-defect] the defect id is required (the tracker id of the open defect)');
  }
  if (!cleanReason) {
    throw new Error(`[open-defect] ${cleanId}: a reason is required (what the spec requires and what happens)`);
  }
  return { id: cleanId, reason: cleanReason };
}

function failDescription(ref: DefectRef): string {
  return (
    `Open defect ${ref.id}: ${ref.reason}. ` +
    'Expected to fail while the defect reproduces. If this test passes, the behaviour ' +
    'changed: verify it against the spec, close the defect and remove the marker.'
  );
}

/** Records the defect on the test and refuses to hide a failure that happened before. */
function register(ref: DefectRef, diag: boolean): void {
  const info = test.info();
  if (info.errors.length > 0) {
    throw new Error(
      `[open-defect] ${ref.id}: the test already failed before openDefect() ` +
        `(${info.errors.length} earlier error(s), e.g. a soft assertion). Marking it now ` +
        'would report that failure as the expected one. Fix the precondition, or turn it ' +
        'into an InfraError.'
    );
  }
  info.annotations.push({ type: 'open-defect', description: `${ref.id}: ${ref.reason}` });
  if (diag) {
    info.annotations.push({
      type: 'defects-diag',
      description: `DEFECTS_DIAG=1: marker disabled for ${ref.id}, the test reports its real result`,
    });
  }
}

/**
 * Bare marker: the rest of the test is expected to fail because of open defect `id`.
 * Call it immediately before the pure assertions, never earlier: every failure after
 * this call, including a broken precondition, is reported as the expected one.
 * Prefer expectOpenDefect(), which applies that rule for you.
 */
export function openDefect(id: string | number, reason: string): void {
  const ref = defectRef(id, reason);
  const diag = defectsDiagEnabled();
  register(ref, diag);
  if (!diag) {
    test.fail(true, failDescription(ref));
  }
}

/**
 * Runs the pure assertions of a test documenting open defect `id`.
 *   - an assertion fails (thrown or expect.soft): expected failure, the run stays green;
 *   - an InfraError is thrown: rethrown unmarked, the run goes red;
 *   - every assertion passes: fails with "no longer reproduces", the run goes red.
 * With DEFECTS_DIAG=1 nothing is marked and the assertions report their raw result.
 */
export async function expectOpenDefect(
  id: string | number,
  reason: string,
  assertions: () => void | Promise<void>
): Promise<void> {
  const ref = defectRef(id, reason);
  const diag = defectsDiagEnabled();
  register(ref, diag);
  const info = test.info();
  const errorsBefore = info.errors.length;

  try {
    await assertions();
  } catch (error) {
    if (!diag && !isInfraError(error)) {
      test.fail(true, failDescription(ref));
    }
    throw error;
  }

  if (info.errors.length > errorsBefore) {
    if (!diag) test.fail(true, failDescription(ref));
    return;
  }
  if (diag) return;

  throw new Error(
    `[open-defect] ${ref.id} no longer reproduces: every assertion passed (${ref.reason}). ` +
      'Verify the behaviour against the spec, close the defect, and turn this into a ' +
      'regular regression test without expectOpenDefect().'
  );
}
