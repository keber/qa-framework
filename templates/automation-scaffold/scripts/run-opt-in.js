#!/usr/bin/env node
'use strict';

/**
 * run-opt-in.js - runs ONE opt-in Playwright project.
 *
 *   node scripts/run-opt-in.js <project> [--dry-run] [playwright arguments]
 *   npm run test:writes        ("test:writes": "node scripts/run-opt-in.js writes")
 *
 * Opt-in projects (declared in OPT_IN_PROJECTS in playwright.config.ts) are expensive
 * or risky - suites that write, slow suites, the login flow - so `npm test` never
 * registers them. This launcher selects one explicitly: it passes `--project <name>`
 * and sets QA_RUN_<NAME>=1 for the Playwright process tree.
 *
 * WHY A NODE SCRIPT: setting a variable inline in an npm script is shell syntax
 * (`QA_RUN_WRITES=1 playwright test` in sh, `set QA_RUN_WRITES=1&&` in cmd.exe), and no
 * single form works on both Windows and Linux. Playwright is started with this Node
 * binary and its CLI file, without a shell, so the launcher behaves the same everywhere
 * and no argument is ever interpreted by a shell.
 *
 * Extra arguments go to Playwright unchanged (for example `-g "<title>"`).
 * `--dry-run` prints what would run and exits.
 */

const { spawnSync } = require('child_process');
const path = require('path');

// Lower-case letters, digits and '-', starting with a letter or digit: a name that
// begins with '-' would be read by Playwright as a flag.
const PROJECT_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

/** Same derivation as optInEnvVar() in global-setup-guards.js ('login-flow' -> QA_RUN_LOGIN_FLOW). */
function optInEnvVar(name) {
  return `QA_RUN_${String(name).toUpperCase().replace(/-/g, '_')}`;
}

function main(argv) {
  const [project, ...rest] = argv;
  if (!project || !PROJECT_NAME_RE.test(project)) {
    console.error(
      '[run-opt-in] Usage: node scripts/run-opt-in.js <project> [--dry-run] [playwright arguments]\n' +
        '  <project> is the project name of an entry in OPT_IN_PROJECTS (playwright.config.ts):\n' +
        '  lower-case letters, digits and "-", for example writes, slow or login-flow.'
    );
    return 2;
  }

  const dryRun = rest.includes('--dry-run');
  const passThrough = rest.filter((a) => a !== '--dry-run');
  const envVar = optInEnvVar(project);
  const pwArgs = ['test', '--project', project, ...passThrough];

  console.log(`=== OPT-IN PROJECT: ${project} ===`);
  console.log('This project is excluded from `npm test` and runs only when selected, because it is');
  console.log('expensive or risky. A project that writes must follow');
  console.log('qa/00-standards/write-safety-policy.md.');
  console.log(`Environment: ${envVar}=1`);
  console.log(`Command:     playwright ${pwArgs.join(' ')}`);
  if (dryRun) {
    console.log('(--dry-run: nothing was run)');
    return 0;
  }

  const root = path.resolve(__dirname, '..');
  let cli;
  try {
    cli = require.resolve('@playwright/test/cli', { paths: [root] });
  } catch {
    console.error('[run-opt-in] @playwright/test is not installed here. Run `npm install` in this folder first.');
    return 1;
  }

  const result = spawnSync(process.execPath, [cli, ...pwArgs], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, [envVar]: '1' },
  });
  if (result.error) {
    console.error(`[run-opt-in] Could not start Playwright: ${result.error.message}`);
    return 1;
  }
  return result.status === null ? 1 : result.status;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { optInEnvVar, PROJECT_NAME_RE, main };
