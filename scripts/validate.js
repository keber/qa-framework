#!/usr/bin/env node
/**
 * scripts/validate.js — Validate qa/ folder structure and conventions
 *
 * Usage:
 *   qa-framework validate
 *   qa-framework validate --strict
 *   qa-framework validate --config ./my-config.json
 *
 * Checks:
 *   1. Required top-level folders exist
 *   2. All submodule folders contain the 6 required spec files
 *   3. No plaintext credentials in spec files (basic scan)
 *   4. Test case naming convention (TC-NNN pattern in spec files)
 *   5. [--strict] Automation spec files exist for every submodule
 *   6. [--strict] EXEC_IDX pattern present in all spec files
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// --- Args ---
const args       = process.argv.slice(2);
const strict     = args.includes('--strict');
const configFlag = args.indexOf('--config');
const configPath = configFlag !== -1
  ? path.resolve(process.cwd(), args[configFlag + 1])
  : path.resolve(process.cwd(), 'qa-framework.config.json');

// --- Load config (optional) ---
let qaRoot = path.resolve(process.cwd(), 'qa');
if (fs.existsSync(configPath)) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  qaRoot = path.resolve(process.cwd(), config.conventions?.qaRoot ?? 'qa');
}

console.log(`[qa-framework/validate] Validating: ${qaRoot}`);
if (strict) console.log('[qa-framework/validate] Mode: STRICT');

const errors   = [];
const warnings = [];

// -----------------------------------------------------------------------
// Check 1: Required top-level folders
// -----------------------------------------------------------------------
const requiredFolders = [
  '00-standards',
  '05-test-plans',
  '06-defects',
  '07-automation',
];

for (const folder of requiredFolders) {
  if (!fs.existsSync(path.join(qaRoot, folder))) {
    errors.push(`Missing required folder: qa/${folder}/`);
  }
}

// -----------------------------------------------------------------------
// Check 2: Submodule spec completeness
// -----------------------------------------------------------------------
const SPEC_FILES = [
  '00-inventory.md',
  '01-business-rules.md',
  '02-workflows.md',
  '03-roles-permissions.md',
  '04-test-data.md',
  '05-test-scenarios.md',
];

const SKIP_DIRS = new Set([
  '00-guides', '00-standards', '05-test-plans',
  '06-defects', '07-automation', '08-azure-integration',
]);

if (fs.existsSync(qaRoot)) {
  const topDirs = fs.readdirSync(qaRoot).filter(d => {
    return fs.statSync(path.join(qaRoot, d)).isDirectory() && !SKIP_DIRS.has(d);
  });

  for (const moduleDir of topDirs) {
    const modulePath = path.join(qaRoot, moduleDir);
    const subDirs = fs.readdirSync(modulePath).filter(d =>
      fs.statSync(path.join(modulePath, d)).isDirectory()
    );

    for (const subDir of subDirs) {
      const subPath = path.join(modulePath, subDir);
      for (const specFile of SPEC_FILES) {
        if (!fs.existsSync(path.join(subPath, specFile))) {
          errors.push(`Missing spec file: qa/${moduleDir}/${subDir}/${specFile}`);
        }
      }

      // Strict: automation spec must exist
      if (strict) {
        const specTs = path.join(qaRoot, '07-automation', 'e2e', moduleDir, `${subDir}.spec.ts`);
        if (!fs.existsSync(specTs)) {
          warnings.push(`[STRICT] No automation spec found: qa/07-automation/e2e/${moduleDir}/${subDir}.spec.ts`);
        }
      }
    }
  }
}

// -----------------------------------------------------------------------
// Check 3: Credential scan (basic)
// -----------------------------------------------------------------------
const CREDENTIAL_PATTERNS = [
  /password\s*=\s*['"][^'"]{4,}['"]/i,
  /token\s*=\s*['"][a-zA-Z0-9+/]{20,}['"]/i,
  /secret\s*=\s*['"][^'"]{4,}['"]/i,
];

function scanFileForCredentials(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const pattern of CREDENTIAL_PATTERNS) {
      if (pattern.test(content)) {
        errors.push(`Potential credential in: ${path.relative(process.cwd(), filePath)}`);
        break;
      }
    }
  } catch {}
}

const specFiles = walkFiles(path.join(qaRoot, '07-automation'), '.spec.ts');
for (const f of specFiles) {
  scanFileForCredentials(f);

  // Check 4: TC naming pattern in spec files
  const content = fs.readFileSync(f, 'utf8');
  if (!content.includes('[TC-') && !content.includes('EXEC_IDX')) {
    warnings.push(`No TC-ID naming convention found in: ${path.relative(process.cwd(), f)}`);
  }

  // Check 6 (strict): EXEC_IDX
  if (strict && !content.includes('EXEC_IDX')) {
    warnings.push(`[STRICT] EXEC_IDX pattern missing in: ${path.relative(process.cwd(), f)}`);
  }
}

// -----------------------------------------------------------------------
// Report
// -----------------------------------------------------------------------
console.log('');
if (errors.length === 0 && warnings.length === 0) {
  console.log('✅ Validation passed — no issues found.');
  process.exit(0);
}

if (warnings.length > 0) {
  console.log(`⚠️  ${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`   WARN  ${w}`);
  console.log('');
}

if (errors.length > 0) {
  console.log(`❌ ${errors.length} error(s):`);
  for (const e of errors) console.log(`   ERROR ${e}`);
  console.log('');
  process.exit(1);
} else {
  process.exit(0);
}

// -----------------------------------------------------------------------
// Helper
// -----------------------------------------------------------------------
function walkFiles(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) {
      results.push(...walkFiles(full, ext));
    } else if (full.endsWith(ext)) {
      results.push(full);
    }
  }
  return results;
}
