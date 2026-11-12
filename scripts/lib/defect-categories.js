'use strict';

/**
 * scripts/lib/defect-categories.js - the folders of qa/06-defects/
 *
 * Single source for init and upgrade. Four categories:
 *   open/             confirmed defect, fix pending
 *   disputed/         QA has reproducible evidence, the business or dev team disputes it
 *   resolved/         closed by a verified fix or by a formal decision
 *   recommendations/  a finding that violates NO business rule: technical debt,
 *                     usability, accessibility, testability, latent risk. Not a defect.
 *
 * LEGACY_RECOMMENDATION_FOLDERS: names some projects already use for the fourth
 * category. upgrade does not add recommendations/ next to one of them, so a project
 * never ends up with two folders for the same thing.
 */

const DEFECT_CATEGORIES = ['open', 'disputed', 'resolved', 'recommendations'];

const LEGACY_RECOMMENDATION_FOLDERS = ['improvements'];

const DISPUTED_README = `# 06-defects/disputed/

Use this folder for defects where QA has reproducible evidence but the business or
development team disputes whether the observed behavior is actually a defect.

A defect stays here while the functional decision is pending. Once the team reaches
a formal conclusion, move the file to open/ (confirmed defect) or resolved/ (accepted
behavior or won't fix).
`;

const RECOMMENDATIONS_README = `# 06-defects/recommendations/

Use this folder for findings that violate no business rule: technical debt, usability,
clarity, accessibility, testability, latent risk. They are recommendations, not defects.

- Before filing here, confirm that no source (spec, business rule, functional document,
  code) requires the behavior. If one does, it is a defect: file it in open/.
- Identifier: REC-{PREFIX}-NNN, with its own numbering. Never reuse a DEF number.
- A recommendation never justifies a test.fail() or a defect marker in automation, and
  it is not opened as a Bug in the work tracker.
- If a finding filed as a defect turns out to be a recommendation, move it here with a
  new REC id and leave the old DEF number retired, with a note pointing to the REC.
- If a source later defines the rule, move the file back to open/ as a defect, citing
  that source.
`;

module.exports = {
  DEFECT_CATEGORIES,
  LEGACY_RECOMMENDATION_FOLDERS,
  DISPUTED_README,
  RECOMMENDATIONS_README,
};
