'use strict';

// Shared by the tests that assert properties of everything the package publishes.
// Lives outside test/*.test.js so `node --test test/*.test.js` does not run it.

const path = require('node:path');
const { execFileSync, execSync } = require('node:child_process');

const REPO_ROOT = path.join(__dirname, '..', '..');

/** Files `npm pack` would publish, as paths relative to the repo root. */
function publishedFiles() {
  const args = ['pack', '--dry-run', '--json', '--ignore-scripts'];
  // Under `npm test` npm_execpath is npm's own CLI script: running it with the current
  // node avoids depending on a shell to resolve npm.cmd on Windows.
  const execPath = process.env.npm_execpath;
  const out = execPath && execPath.endsWith('.js')
    ? execFileSync(process.execPath, [execPath, ...args], { cwd: REPO_ROOT, encoding: 'utf8' })
    : execSync(`npm ${args.join(' ')}`, { cwd: REPO_ROOT, encoding: 'utf8' });
  const [pack] = JSON.parse(out);
  return pack.files.map((f) => f.path);
}

module.exports = { REPO_ROOT, publishedFiles };
