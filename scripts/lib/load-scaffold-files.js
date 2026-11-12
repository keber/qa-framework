'use strict';

/**
 * scripts/lib/load-scaffold-files.js - the k6 load scaffold installed by init.
 *
 * Source: templates/load-scaffold/k6/. Destination: qa/07-automation/load/k6/.
 * Used by scripts/init.js; kept in one list so a future upgrade step can read the
 * same set instead of repeating it.
 *
 * `.gitignore` is not shipped as a file (npm drops .gitignore files from published
 * packages), so its content lives here and init writes it.
 */

const LOAD_SCAFFOLD_FILES = Object.freeze([
  'README.md',
  'run-perf.js',
  'perf-guard.js',
  'perf-script.js',
  'build-report.js',
  'plans/plan.schema.json',
  'plans/_example.plan.json',
]);

const LOAD_SCAFFOLD_GITIGNORE = [
  '# Session values for k6 runs (live credentials): never commit them.',
  '.session/',
  '',
].join('\n');

module.exports = { LOAD_SCAFFOLD_FILES, LOAD_SCAFFOLD_GITIGNORE };
