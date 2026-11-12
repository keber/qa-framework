#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// Semver core plus an optional prerelease suffix: `-` followed by dot-separated
// identifiers of [0-9A-Za-z-]. Every dot must be followed by an identifier character,
// so a sentence-ending period ("... v1.13.2.") is never consumed as part of the suffix.
// The suffix is part of the match so a rewrite replaces the WHOLE version: matching only
// X.Y.Z would turn "1.14.0-rc.1" into "1.14.0-rc.2-rc.1" on the next bump, and a field
// pattern anchored on the closing quote right after the patch would stop matching at all
// once the first prerelease is written.
const SEMVER = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?`;

const PROSE_PATTERN = new RegExp(`v${SEMVER}`);

function fieldPattern(field) {
  return new RegExp(`("${field}"\\s*:\\s*")${SEMVER}(")`);
}

// README.md and .github/copilot-instructions.md carry the version in prose; only the
// first vX.Y.Z occurrence is the "current version" marker, so only that one is rewritten.
const PROSE_TARGETS = ['README.md', path.join('.github', 'copilot-instructions.md')];

// qa-framework.config.json is published and is the template init.js copies into every
// consuming project, where its frameworkVersion is injected into {{VERSION}} of the
// generated agent instructions. Left out of this sync it silently drifted to 1.10.0
// while the package shipped 1.12.0, so every fresh install told its agent the wrong
// version. It is patched by field, not by the loose vX.Y.Z pattern used for prose.
const JSON_TARGETS = [{ file: 'qa-framework.config.json', field: 'frameworkVersion' }];

// templates/qa-framework.instructions.md and templates/qa-framework.rules.md contain a
// literal {{VERSION}} placeholder substituted by init.js/upgrade.js in the consumer
// project at install/upgrade time. That placeholder is NOT a hardcoded version string
// and must never be touched here.

/**
 * Propagate `version` to every published version surface under `rootDir`.
 * Returns the list of files (relative to rootDir) that were rewritten.
 */
function syncVersion({ rootDir, version, log = () => {} }) {
  const changed = [];

  for (const { file, field } of JSON_TARGETS) {
    const filePath = path.join(rootDir, file);
    const original = fs.readFileSync(filePath, 'utf8');
    const pattern = fieldPattern(field);

    if (!pattern.test(original)) {
      throw new Error(`sync-version: no "${field}" version field in ${filePath}`);
    }

    const updated = original.replace(pattern, `$1${version}$2`);
    if (updated !== original) {
      fs.writeFileSync(filePath, updated, 'utf8');
      changed.push(file);
      log(`sync-version: updated ${file} ${field} -> ${version}`);
    }
  }

  for (const file of PROSE_TARGETS) {
    const filePath = path.join(rootDir, file);
    const original = fs.readFileSync(filePath, 'utf8');

    if (!PROSE_PATTERN.test(original)) {
      throw new Error(`sync-version: no version string found in ${filePath}`);
    }

    const updated = original.replace(PROSE_PATTERN, `v${version}`);
    if (updated !== original) {
      fs.writeFileSync(filePath, updated, 'utf8');
      changed.push(file);
      log(`sync-version: updated ${file} -> v${version}`);
    }
  }

  return changed;
}

if (require.main === module) {
  const rootDir = path.resolve(__dirname, '..');
  const { version } = require(path.join(rootDir, 'package.json'));
  syncVersion({ rootDir, version, log: msg => console.log(msg) });
}

module.exports = { syncVersion, PROSE_PATTERN, fieldPattern, PROSE_TARGETS, JSON_TARGETS };
