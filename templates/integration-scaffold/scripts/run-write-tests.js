#!/usr/bin/env node
'use strict';

/**
 * run-write-tests.js - `npm run test:write`, the only intended way to open gate 1.
 *
 * Runs ONLY tests/write/ with QA_API_WRITE=1 set for this process tree. `npm test`
 * never sets it, so it never loads tests/write/ and the client refuses every write.
 * Prints what is about to happen first; `--dry-run` prints it and exits.
 * Extra arguments are passed to Playwright (for example `-g "<title>"`).
 *
 * Playwright is started with this Node binary and its CLI file, without a shell, so
 * no argument is ever interpreted by one.
 */

const { spawnSync } = require('child_process');
const path = require('path');
const { WRITE_OPT_IN_VAR } = require('./api-guard.js');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const passThrough = args.filter((a) => a !== '--dry-run');

console.log('=== API WRITE TESTS ===');
console.log('These tests WRITE to the QA environment, only through the four gates of');
console.log('qa/00-standards/write-safety-policy.md: approved endpoints of fixtures/write-catalog.ts,');
console.log('outside the hard exclusions, on records named with the test prefix that the tests create.');
console.log('The target host must be project.qaBaseUrl of qa/qa-framework.config.json.');
if (dryRun) {
  console.log('(--dry-run: nothing was run)');
  process.exit(0);
}

let cli;
try {
  cli = require.resolve('@playwright/test/cli', { paths: [root] });
} catch {
  console.error('[test:write] @playwright/test is not installed here. Run `npm install` in this folder first.');
  process.exit(1);
}

const result = spawnSync(process.execPath, [cli, 'test', 'tests/write', ...passThrough], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, [WRITE_OPT_IN_VAR]: '1' },
});
if (result.error) {
  console.error(`[test:write] Could not start Playwright: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status === null ? 1 : result.status);
