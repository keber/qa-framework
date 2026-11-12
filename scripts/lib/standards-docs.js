'use strict';

/**
 * scripts/lib/standards-docs.js - the documents installed in qa/00-standards/.
 *
 * ONE list, read by both commands:
 *   - init    writes each entry when it is missing (new projects).
 *   - upgrade writes each entry when it is missing (existing projects) and never
 *             touches one that exists, even when it differs from the template:
 *             these documents are edited by the project (for example the approver
 *             section of write-safety-policy.md).
 *
 * Adding a standards document = appending one entry here:
 *   { file: '<name in qa/00-standards/>', template: '<file in templates/>' }
 * An entry may carry inline `content` instead of `template` (the placeholder below).
 */

const fs = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.resolve(__dirname, '..', '..', 'templates');

const STANDARDS_DOCS = Object.freeze([
  Object.freeze({
    file: 'naming-conventions.md',
    content: '# Naming Conventions\n\n> Fill in per your project. See keber/qa-framework docs/spec-driven-philosophy.md.\n',
  }),
  Object.freeze({ file: 'bug-report-template.md', template: 'defect-report.md' }),
  Object.freeze({ file: 'test-case-template.md', template: 'test-case.md' }),
  Object.freeze({ file: 'execution-report-template.md', template: 'execution-report.md' }),
  Object.freeze({ file: 'test-data-guidelines.md', template: 'test-data-guidelines.md' }),
  Object.freeze({ file: 'write-safety-policy.md', template: 'write-safety-policy.md' }),
  Object.freeze({ file: 'api-testing-conventions.md', template: 'api-testing-conventions.md' }),
  // The AGENTS.md review-rulebook template is installed HERE, never as a root AGENTS.md:
  // several coding agents load a root AGENTS.md automatically, so writing a placeholder
  // rulebook there from a postinstall would feed unfilled rules to every agent session.
  // The project copies it to the root itself; the framework never writes or edits that file.
  Object.freeze({ file: 'agents-md-template.md', template: 'AGENTS.md' }),
  // Project-owned once installed: the team promotes, demotes and suspends its criteria.
  Object.freeze({ file: 'pr-review-rubric.md', template: 'pr-review-rubric.md' }),
]);

/** The content a standards entry installs. */
function standardsDocContent(doc) {
  if (typeof doc.content === 'string') return doc.content;
  return fs.readFileSync(path.join(TEMPLATES_DIR, doc.template), 'utf8');
}

module.exports = { STANDARDS_DOCS, standardsDocContent };
