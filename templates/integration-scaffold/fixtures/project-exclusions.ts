/**
 * project-exclusions.ts - this project's ADDITIONS to the hard exclusions.
 *
 * The framework list (scripts/hard-exclusions.js) blocks writes to email and
 * notifications, dispatches and legal or customs documents, transmission to
 * external or production systems, file download or generation, and bulk
 * operations (qa/00-standards/write-safety-policy.md, section 4).
 *
 * Add here the concrete names of THIS project: internal system names, route
 * fragments of integrations, anything that must never be written from a test.
 * Each entry only adds a block. There is no way to remove or narrow a framework
 * pattern from this file: the guard always evaluates the full framework list first
 * and refuses entries with any key other than category, pattern and reason.
 *
 * pattern: a RegExp, or a string matched as a literal, case-insensitive substring.
 * Patterns are tested against the raw path and against its words form, where
 * camelCase, `_`, `-` and `.` boundaries become `/`; use `\b` to anchor a short
 * word to a word start. When in doubt, block: a false positive costs one blocked
 * test, a false negative can cost a real email or a real document.
 *
 * Example:
 *   { category: 'internal-systems', pattern: /legacyErp/, reason: 'replicates to the production ERP' },
 */

export type ProjectExclusion = {
  /** One of the framework categories, or a new one of this project. */
  category: string;
  pattern: RegExp | string;
  /** Why it is excluded and who decided it. */
  reason?: string;
};

export const PROJECT_EXCLUSIONS: ProjectExclusion[] = [];
