#!/usr/bin/env node
/**
 * scripts/cli.js - keber/qa-framework CLI entry point
 *
 * Usage:
 *   npx keber/qa-framework <command> [options]
 *   qa-framework <command> [options]
 *
 * Commands:
 *   init      Scaffold a qa/ folder structure from qa-framework.config.json
 *   upgrade   Update framework-owned files after npm update (skills, copilot-instructions)
 *   generate  Generate an artifact (spec template, test plan, etc.)
 *   validate  Validate qa/ folder structure and conventions
 *   clock     Print the real current date/time from the OS clock (IANA time zone)
 */

'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const commands = {
  init:     'init.js',
  upgrade:  'upgrade.js',
  generate: 'generate.js',
  validate: 'validate.js',
  clock:    'clock.js',
};

// Largest edit distance at which an unknown token still gets a "Did you mean" hint.
const MAX_SUGGESTION_DISTANCE = 2;

/** Levenshtein edit distance (insertions, deletions, substitutions) between a and b. */
function levenshtein(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * The known command an unknown token most likely meant, or null. Leading dashes are
 * ignored (`--upgrade` -> `upgrade`); otherwise the closest command within
 * MAX_SUGGESTION_DISTANCE edits wins, provided the distance is smaller than the
 * token itself (so a one- or two-letter token does not match everything).
 */
function suggestCommand(token) {
  const stripped = String(token).replace(/^-+/, '').toLowerCase();
  if (!stripped) return null;
  let best = null;
  let bestDistance = Infinity;
  for (const name of Object.keys(commands)) {
    const d = levenshtein(stripped, name);
    if (d < bestDistance) { best = name; bestDistance = d; }
  }
  return bestDistance <= MAX_SUGGESTION_DISTANCE && bestDistance < stripped.length ? best : null;
}

function main() {
  const [, , command, ...args] = process.argv;

  if (!command || command === '--help' || command === '-h') {
    printHelp();
    process.exit(0);
  }

  if (command === '--version' || command === '-v') {
    console.log(require(path.join(__dirname, '..', 'package.json')).version);
    process.exit(0);
  }

  if (!Object.prototype.hasOwnProperty.call(commands, command)) {
    console.error(`[qa-framework] Unknown command: "${command}"`);
    const suggestion = suggestCommand(command);
    if (suggestion) console.error(`Did you mean "${suggestion}"?`);
    printHelp();
    process.exit(1);
  }

  const scriptPath = path.join(__dirname, commands[command]);
  const result = spawnSync(
    process.execPath,
    [scriptPath, ...args],
    { stdio: 'inherit', cwd: process.cwd() }
  );

  process.exit(result.status ?? 0);
}

if (require.main === module) main();

module.exports = { levenshtein, suggestCommand };

function printHelp() {
  console.log(`
keber/qa-framework

Usage:
  qa-framework <command> [options]

Commands:
  init [--config <path>]      Scaffold qa/ structure from config file
  upgrade [--dry-run]         Update framework-owned files after npm update
  generate <artifact>         Generate from template
                                artifact: spec | test-plan | test-case |
                                          execution-report | defect-report |
                                          session-summary
  validate [--strict]         Validate qa/ structure and naming conventions
  clock [--tz <zone>]         Print the real date/time from the OS clock, naming
                              the IANA zone (offline; see clock --help)

Options:
  --help, -h                  Show help
  --version, -v               Show version

Examples:
  qa-framework init
  qa-framework init --config ./my-project.config.json
  qa-framework upgrade
  qa-framework upgrade --dry-run
  qa-framework generate spec --module suppliers --submodule create
  qa-framework validate
  qa-framework validate --strict
  qa-framework clock --tz America/Santiago
`);
}
