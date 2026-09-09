#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const pkg = require(path.join(rootDir, 'package.json'));
const version = pkg.version;

const targets = [
  path.join(rootDir, 'README.md'),
  path.join(rootDir, '.github', 'copilot-instructions.md'),
];

// templates/qa-framework.instructions.md and templates/qa-framework.rules.md contain a
// literal {{VERSION}} placeholder substituted by init.js/upgrade.js in the consumer
// project at install/upgrade time. That placeholder is NOT a hardcoded version string
// and must never be touched here.

const versionPattern = /v\d+\.\d+\.\d+/;

for (const filePath of targets) {
  const original = fs.readFileSync(filePath, 'utf8');

  if (!versionPattern.test(original)) {
    throw new Error(`sync-version: no version string found in ${filePath}`);
  }

  const updated = original.replace(versionPattern, `v${version}`);

  if (updated !== original) {
    fs.writeFileSync(filePath, updated, 'utf8');
    console.log(`sync-version: updated ${path.relative(rootDir, filePath)} -> v${version}`);
  }
}
