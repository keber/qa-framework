#!/usr/bin/env node
/**
 * scripts/upgrade.js — Upgrade framework-owned files in an existing project
 *
 * Usage:
 *   qa-framework upgrade
 *   qa-framework upgrade --dry-run
 *
 * What this command does (safe by design):
 *   ALWAYS updates (framework-owned):
 *     - .github/skills/             <- New skills architecture; always current
 *     - .github/copilot-instructions.md <- Pipeline sequencer; framework-owned
 *     - qa/QA-STRUCTURE-GUIDE.md    <- Folder reference; framework-owned
 *
 *   MIGRATES (v1.5.x -> v1.6.0, non-destructive):
 *     - qa/07-automation/playwright.config.ts  -> qa/07-automation/e2e/
 *     - qa/07-automation/global-setup.ts       -> qa/07-automation/e2e/
 *     - qa/07-automation/package.json          -> qa/07-automation/e2e/
 *     - qa/07-automation/.env.example          -> qa/07-automation/e2e/
 *     - qa/07-automation/fixtures/             -> qa/07-automation/e2e/fixtures/
 *     - qa/07-automation/e2e/{module}/         -> qa/07-automation/e2e/tests/{module}/
 *     - Creates integration/ and load/ placeholders *     - Patches playwright.config.ts: testDir '.' -> './tests', adds testIgnore
 *     - Creates tests/helpers/debug/ and tests/seeds/ if absent
 *
 *   MIGRATES (v1.6.x -> v1.7.0, non-destructive):
 *     - qa/02-test-plans/automated/  -> qa/02-test-plans/sprints/legacy-automated/
 *     - qa/02-test-plans/manual/     -> qa/02-test-plans/sprints/legacy-manual/
 *     - qa/02-test-plans/*.md        -> qa/02-test-plans/sprints/legacy/
 *     - Creates qa/02-test-plans/sprints/ if absent
 *     - Creates qa/03-test-cases/README.md optional marker if absent *
 *   NEVER touches (project-owned):
 *     - qa/01-specifications/       <- Your specs
 *     - qa/02-test-plans/           <- Your test plans
 *     - qa/03-test-cases/           <- Your TCs
 *     - qa/07-automation/e2e/tests/ <- Your Playwright tests (only moves, never overwrites)
 *     - qa/memory/                  <- Your learnings
 *     - qa/README.md                <- Your living index
 *     - qa/AGENT-NEXT-STEPS.md      <- Your sprint queue
 *
 *   REPORTS but does not delete:
 *     - qa/00-guides/               <- Old location (can be deleted manually)
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const args   = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

const cwd = process.env.INIT_CWD || process.cwd();

// Resolve config (same logic as init.js)
const rootConfigPath = path.resolve(cwd, 'qa-framework.config.json');
const qaConfigPath   = path.resolve(cwd, 'qa', 'qa-framework.config.json');
let config = {};

const configFlag = args.indexOf('--config');
if (configFlag !== -1 && args[configFlag + 1]) {
  config = JSON.parse(fs.readFileSync(path.resolve(cwd, args[configFlag + 1]), 'utf8'));
} else if (fs.existsSync(rootConfigPath)) {
  config = JSON.parse(fs.readFileSync(rootConfigPath, 'utf8'));
} else if (fs.existsSync(qaConfigPath)) {
  config = JSON.parse(fs.readFileSync(qaConfigPath, 'utf8'));
}

const qaRoot     = path.join(cwd, 'qa');
const githubDir  = path.join(cwd, '.github');
const skillsDest = path.join(githubDir, 'skills');
const skillsSrc  = path.resolve(__dirname, '..', 'skills');

const updated  = [];
const skipped  = [];
const warnings = [];

console.log(`\n[qa-framework/upgrade] ${dryRun ? '(dry-run) ' : ''}Upgrading framework-owned files`);
console.log(`[qa-framework/upgrade] Project root: ${cwd}\n`);

// ---------------------------------------------------------------------------
// 1. .github/skills/ — always overwrite (framework-owned)
// ---------------------------------------------------------------------------
if (!fs.existsSync(skillsSrc)) {
  warnings.push('skills/ source directory not found in package — skipping skill install');
} else {
  fs.mkdirSync(skillsDest, { recursive: true });
  copyDirForce(skillsSrc, skillsDest);
}

// ---------------------------------------------------------------------------
// 2. .github/instructions/qa-framework.instructions.md — overwrite (framework-owned)
// ---------------------------------------------------------------------------
const copilotInstrPath = path.join(githubDir, 'instructions', 'qa-framework.instructions.md');
const instrTemplatePath = path.resolve(__dirname, '..', 'templates', 'qa-framework.instructions.md');
const copilotContent = fs.readFileSync(instrTemplatePath, 'utf8')
  .replace('{{VERSION}}', config.frameworkVersion ?? '1.0.0');
forceWrite(copilotInstrPath, copilotContent);

// ---------------------------------------------------------------------------
// 2b. Migration: strip QA Framework section from old copilot-instructions.md
//
// Handles all cases:
//   A. File has custom instructions + QA section  → keep custom, strip QA section
//   B. File has ONLY QA section (any version)     → delete the file
//   C. File does not mention QA Framework         → leave untouched
//
// The QA section always starts with "# QA Framework Instructions" across all
// previous versions, so that heading is the reliable split point.
// ---------------------------------------------------------------------------
const oldCopilotPath = path.join(githubDir, 'copilot-instructions.md');
if (fs.existsSync(oldCopilotPath)) {
  const oldContent = fs.readFileSync(oldCopilotPath, 'utf8');
  const qaMarker   = '# QA Framework Instructions';
  const qaIdx      = oldContent.indexOf(qaMarker);

  if (qaIdx !== -1) {
    // Extract anything before the QA section, removing any trailing separator
    const before = oldContent.slice(0, qaIdx).replace(/\s*\n---\s*$/, '').trim();

    if (before.length === 0) {
      // Case B: file contained only QA Framework content → delete it
      if (!dryRun) fs.unlinkSync(oldCopilotPath);
      updated.push(oldCopilotPath);
      console.log(`  [deleted]  .github/copilot-instructions.md (contained only QA Framework rules — now in .github/instructions/qa-framework.instructions.md)`);
    } else {
      // Case A: file had custom content too → write back only the custom part
      if (!dryRun) fs.writeFileSync(oldCopilotPath, before + '\n', 'utf8');
      updated.push(oldCopilotPath);
      console.log(`  [cleaned]  .github/copilot-instructions.md — removed QA Framework section, kept custom instructions`);
    }
  }
  // Case C: no QA marker found → leave untouched (no log noise)
}

// ---------------------------------------------------------------------------
// 3. qa/QA-STRUCTURE-GUIDE.md — overwrite (framework doc)
// ---------------------------------------------------------------------------
const structureGuideSrc  = path.resolve(__dirname, '..', 'docs', 'folder-structure-guide.md');
const structureGuideDest = path.join(qaRoot, 'QA-STRUCTURE-GUIDE.md');
if (fs.existsSync(structureGuideSrc) && fs.existsSync(qaRoot)) {
  forceWrite(structureGuideDest, fs.readFileSync(structureGuideSrc, 'utf8'));
}

// ---------------------------------------------------------------------------
// 4. Migration: report qa/00-guides/ if still present
// ---------------------------------------------------------------------------
const oldGuidesDir = path.join(qaRoot, '00-guides');
if (fs.existsSync(oldGuidesDir)) {
  warnings.push(
    `qa/00-guides/ still exists (old location). It can be deleted:\n` +
    `    Remove-Item -Recurse -Force qa/00-guides`
  );
}

// ---------------------------------------------------------------------------
// 5. Migration v1.5.x -> v1.6.0: restructure qa/07-automation/
//    Safe: only moves files when source exists and destination does NOT.
// ---------------------------------------------------------------------------
const automationDir  = path.join(qaRoot, '07-automation');
const e2eDir         = path.join(automationDir, 'e2e');

// 5a. Scaffold files: 07-automation/*.* -> 07-automation/e2e/*.*
const scaffoldFiles = ['playwright.config.ts', 'global-setup.ts', 'package.json', '.env.example', 'package-lock.json'];
for (const file of scaffoldFiles) {
  const oldPath = path.join(automationDir, file);
  const newPath = path.join(e2eDir, file);
  if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
    if (!dryRun) {
      fs.mkdirSync(e2eDir, { recursive: true });
      fs.renameSync(oldPath, newPath);
    }
    updated.push(newPath);
    console.log(`  [migrated] ${path.relative(cwd, oldPath)} -> e2e/${file}`);
  }
}

// 5a.1. Ensure the refreshed fixtures scaffold exists.
const scaffoldFixturesDir = path.join(e2eDir, 'fixtures');
const fixtureFiles = ['auth.ts', 'test-helpers.ts', 'base.ts'];
for (const file of fixtureFiles) {
  const oldPath = path.join(automationDir, 'fixtures', file);
  const newPath = path.join(scaffoldFixturesDir, file);
  if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
    if (!dryRun) {
      fs.mkdirSync(scaffoldFixturesDir, { recursive: true });
      fs.renameSync(oldPath, newPath);
    }
    updated.push(newPath);
    console.log(`  [migrated] fixtures/${file} -> e2e/fixtures/${file}`);
  }
}

// 5b. fixtures/: 07-automation/fixtures/ -> 07-automation/e2e/fixtures/
const oldFixturesDir = path.join(automationDir, 'fixtures');
const newFixturesDir = path.join(e2eDir, 'fixtures');
if (fs.existsSync(oldFixturesDir) && !fs.existsSync(newFixturesDir)) {
  if (!dryRun) {
    fs.mkdirSync(e2eDir, { recursive: true });
    fs.renameSync(oldFixturesDir, newFixturesDir);
  }
  updated.push(newFixturesDir);
  console.log(`  [migrated] ${path.relative(cwd, oldFixturesDir)}/ -> e2e/fixtures/`);
}

// 5c. Spec stubs: e2e/{module}/*.spec.ts -> e2e/tests/{module}/
//     Moves any directory directly under e2e/ that is not a known non-module dir.
const testsDir = path.join(e2eDir, 'tests');
const knownE2eDirs = new Set(['tests', 'page-objects', 'fixtures', 'diagnosis', 'scripts', 'seeds', 'helpers']);
if (fs.existsSync(e2eDir)) {
  for (const entry of fs.readdirSync(e2eDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || knownE2eDirs.has(entry.name)) continue;
    const oldModDir = path.join(e2eDir, entry.name);
    const newModDir = path.join(testsDir, entry.name);
    if (!fs.existsSync(newModDir)) {
      if (!dryRun) {
        fs.mkdirSync(testsDir, { recursive: true });
        fs.renameSync(oldModDir, newModDir);
      }
      updated.push(newModDir);
      console.log(`  [migrated] e2e/${entry.name}/ -> e2e/tests/${entry.name}/`);
    } else {
      warnings.push(
        `Cannot migrate e2e/${entry.name}/ — target e2e/tests/${entry.name}/ already exists. Merge manually.`
      );
    }
  }
}

// 5d. Create integration scaffold if missing (uses template; existing files are never overwritten).
const integrationDir      = path.join(automationDir, 'integration');
const integrationScaffold = path.resolve(__dirname, '..', 'templates', 'integration-scaffold');
const integrationReadme   = path.join(integrationDir, 'README.md');
const loadReadme          = path.join(automationDir, 'load', 'README.md');
if (!fs.existsSync(integrationReadme)) {
  if (!dryRun) {
    fs.mkdirSync(integrationDir, { recursive: true });
    for (const file of ['package.json', 'playwright.config.ts', 'global-setup.ts', 'README.md', '.env.example']) {
      const dest = path.join(integrationDir, file);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(path.join(integrationScaffold, file), dest);
        updated.push(dest);
        console.log(`  [created] ${path.relative(cwd, dest)}`);
      }
    }
    const integrationTestsDir = path.join(integrationDir, 'tests');
    fs.mkdirSync(integrationTestsDir, { recursive: true });
    const exampleSpec = path.join(integrationTestsDir, 'example.spec.ts');
    if (!fs.existsSync(exampleSpec)) {
      fs.copyFileSync(path.join(integrationScaffold, 'tests', 'example.spec.ts'), exampleSpec);
      updated.push(exampleSpec);
      console.log(`  [created] ${path.relative(cwd, exampleSpec)}`);
    }
  } else {
    updated.push(integrationReadme);
    console.log(`  [created] ${path.relative(cwd, integrationReadme)}`);
  }
}
if (!fs.existsSync(loadReadme)) {
  if (!dryRun) {
    fs.mkdirSync(path.dirname(loadReadme), { recursive: true });
    fs.writeFileSync(loadReadme,
      '# Load Tests\n\n> Placeholder for load and performance tests.\n> Each tool gets its own subdirectory (e.g. k6/, jmeter/).\n', 'utf8');
  }
  updated.push(loadReadme);
  console.log(`  [created] ${path.relative(cwd, loadReadme)}`);
}

// 5e. Patch playwright.config.ts in e2e/:
const playwrightConfigPath = path.join(e2eDir, 'playwright.config.ts');
if (fs.existsSync(playwrightConfigPath)) {
  let cfg = fs.readFileSync(playwrightConfigPath, 'utf8');
  let cfgChanged = false;

  // Fix testDir: '.' -> './tests'
  if (/testDir\s*:\s*['"]\.['"]/.test(cfg)) {
    cfg = cfg.replace(/testDir\s*:\s*['"]\.['"]/g, "testDir:  './tests'");
    cfgChanged = true;
    console.log(`  [patched] e2e/playwright.config.ts — testDir: '.' -> './tests'`);
  }

  // Inject testIgnore after testDir line if not present
  if (!cfg.includes('testIgnore')) {
    cfg = cfg.replace(
      /(testDir\s*:.*\n)/,
      "$1  testIgnore: ['**/helpers/debug/**', '**/seeds/**'],\n"
    );
    cfgChanged = true;
    console.log(`  [patched] e2e/playwright.config.ts — added testIgnore`);
  }

  if (cfgChanged) {
    if (!dryRun) fs.writeFileSync(playwrightConfigPath, cfg, 'utf8');
    updated.push(playwrightConfigPath);
  }
}

// Create tests/helpers/debug and tests/seeds if missing
for (const subdir of ['tests/helpers/debug', 'tests/seeds']) {
  const subdirPath = path.join(e2eDir, subdir);
  if (!fs.existsSync(subdirPath)) {
    if (!dryRun) fs.mkdirSync(subdirPath, { recursive: true });
    updated.push(subdirPath);
    console.log(`  [created] ${path.relative(cwd, subdirPath)}/`);
  }
}

// ---------------------------------------------------------------------------
// 6. Migration v1.6.x -> v1.7.0: restructure qa/02-test-plans/
//    Safe: only moves files when source exists and destination does NOT.
//    automated/ -> sprints/legacy-automated/
//    manual/    -> sprints/legacy-manual/
//    *.md flat  -> sprints/legacy/
// ---------------------------------------------------------------------------
const testPlansDir = path.join(qaRoot, '02-test-plans');
const sprintsDir   = path.join(testPlansDir, 'sprints');

if (fs.existsSync(testPlansDir)) {
  const legacySubdirs = ['automated', 'manual'];
  for (const sub of legacySubdirs) {
    const oldDir = path.join(testPlansDir, sub);
    const newDir = path.join(sprintsDir, `legacy-${sub}`);
    if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
      if (!dryRun) {
        fs.mkdirSync(sprintsDir, { recursive: true });
        fs.renameSync(oldDir, newDir);
      }
      updated.push(newDir);
      console.log(`  [migrated] 02-test-plans/${sub}/ -> 02-test-plans/sprints/legacy-${sub}/`);
    }
  }

  // Move any .md files sitting flat in 02-test-plans/ (not in sprints/)
  if (fs.existsSync(testPlansDir)) {
    const legacyDir = path.join(sprintsDir, 'legacy');
    for (const entry of fs.readdirSync(testPlansDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const oldFile = path.join(testPlansDir, entry.name);
      const newFile = path.join(legacyDir, entry.name);
      if (!fs.existsSync(newFile)) {
        if (!dryRun) {
          fs.mkdirSync(legacyDir, { recursive: true });
          fs.renameSync(oldFile, newFile);
        }
        updated.push(newFile);
        console.log(`  [migrated] 02-test-plans/${entry.name} -> 02-test-plans/sprints/legacy/${entry.name}`);
      } else {
        warnings.push(`Cannot migrate 02-test-plans/${entry.name} — target already exists. Move manually.`);
      }
    }
  }

  // Ensure sprints/ exists
  if (!fs.existsSync(sprintsDir)) {
    if (!dryRun) fs.mkdirSync(sprintsDir, { recursive: true });
    updated.push(sprintsDir);
    console.log(`  [created] 02-test-plans/sprints/`);
  }
}

// Ensure 03-test-cases/README.md exists (optional marker)
const testCasesReadme = path.join(qaRoot, '03-test-cases', 'README.md');
if (!fs.existsSync(testCasesReadme)) {
  if (!dryRun) {
    fs.mkdirSync(path.dirname(testCasesReadme), { recursive: true });
    fs.writeFileSync(testCasesReadme,
      '# 03-test-cases/ — Optional Standalone Test Cases\n\n' +
      '> **v1.7.0+:** The primary location for test cases (with detailed steps) is now\n' +
      '> `qa/02-test-plans/sprints/Sprint-{N}/Plan-de-Pruebas-{project}-Sprint-{N}-{module}.md`.\n' +
      '>\n' +
      '> Use this directory only for test cases that are:\n' +
      '> - Too complex to fit in a table row (multi-scenario, multi-role)\n' +
      '> - Reused across multiple sprints without change\n' +
      '> - Required as standalone documents for audit or external review\n' +
      '>\n' +
      '> Naming: `TC-{MODULE}-{SUBMODULE}-{NNN}-{slug}.md`\n', 'utf8');
  }
  updated.push(testCasesReadme);
  console.log(`  [created] 03-test-cases/README.md`);
}

// ---------------------------------------------------------------------------
// 7. Ensure 06-defects/disputed/ exists (added in v1.11.0)
//    Safe: only creates if missing. Never touches existing files.
// ---------------------------------------------------------------------------
const defectsDir   = path.join(qaRoot, '06-defects');
const disputedDir  = path.join(defectsDir, 'disputed');
const disputedReadme = path.join(disputedDir, 'README.md');

if (fs.existsSync(defectsDir) && !fs.existsSync(disputedDir)) {
  if (!dryRun) {
    fs.mkdirSync(disputedDir, { recursive: true });
    fs.writeFileSync(disputedReadme,
`# 06-defects/disputed/

Use this folder for defects where QA has reproducible evidence but the business or
development team disputes whether the observed behavior is actually a defect.

A defect stays here while the functional decision is pending. Once the team reaches
a formal conclusion, move the file to open/ (confirmed defect) or resolved/ (accepted
behavior or won't fix).
`, 'utf8');
  }
  updated.push(disputedDir);
  console.log(`  [created] 06-defects/disputed/`);
  console.log(`  [created] 06-defects/disputed/README.md`);
} else if (!fs.existsSync(disputedReadme) && fs.existsSync(disputedDir)) {
  if (!dryRun) {
    fs.writeFileSync(disputedReadme,
`# 06-defects/disputed/

Use this folder for defects where QA has reproducible evidence but the business or
development team disputes whether the observed behavior is actually a defect.

A defect stays here while the functional decision is pending. Once the team reaches
a formal conclusion, move the file to open/ (confirmed defect) or resolved/ (accepted
behavior or won't fix).
`, 'utf8');
  }
  updated.push(disputedReadme);
  console.log(`  [created] 06-defects/disputed/README.md`);
}

// ---------------------------------------------------------------------------
// 8. Seed qa/memory/ template files if missing (added in v1.11.0)
//    Safe: only creates files that do not exist. Never overwrites user content.
// ---------------------------------------------------------------------------
const memoryDir = path.join(qaRoot, 'memory');
if (fs.existsSync(memoryDir)) {
  const memorySrc = path.resolve(__dirname, '..', 'templates', 'memory');
  for (const file of ['ci-pipeline-findings.md', 'e2e-stabilization-patterns.md', 'data-volatility-strategies.md']) {
    const dest = path.join(memoryDir, file);
    if (!fs.existsSync(dest)) {
      if (!dryRun) {
        fs.copyFileSync(path.join(memorySrc, file), dest);
      }
      updated.push(dest);
      console.log(`  [created] memory/${file}`);
    } else {
      skipped.push(dest);
    }
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n--- Results ---');
if (updated.length) {
  console.log('\n  Updated (framework-owned):');
  for (const f of updated) console.log(`    ✅ ${path.relative(cwd, f)}`);
}
if (skipped.length) {
  console.log('\n  Skipped (already up to date):');
  for (const f of skipped) console.log(`    — ${path.relative(cwd, f)}`);
}
if (warnings.length) {
  console.log('\n  Warnings:');
  for (const w of warnings) console.log(`    ⚠️  ${w}`);
}

console.log('\n[qa-framework/upgrade] Done.\n');

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function forceWrite(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const exists  = fs.existsSync(filePath);
  const changed = !exists || fs.readFileSync(filePath, 'utf8') !== content;
  if (dryRun) {
    if (changed) updated.push(filePath);
    else skipped.push(filePath);
    return;
  }
  fs.writeFileSync(filePath, content, 'utf8');
  if (changed) updated.push(filePath);
  else skipped.push(filePath);
}

function copyDirForce(srcDir, destDir) {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath  = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDirForce(srcPath, destPath);
    } else {
      forceWrite(destPath, fs.readFileSync(srcPath, 'utf8'));
    }
  }
}

