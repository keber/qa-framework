#!/usr/bin/env node
/**
 * scripts/cli.js — keber/qa-framework CLI entry point
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
 */

'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const [, , command, ...args] = process.argv;

const commands = {
  init:     'init.js',
  upgrade:  'upgrade.js',
  generate: 'generate.js',
  validate: 'validate.js',
};

if (!command || command === '--help' || command === '-h') {
  printHelp();
  process.exit(0);
}

if (!commands[command]) {
  console.error(`[qa-framework] Unknown command: "${command}"`);
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
`);
}
