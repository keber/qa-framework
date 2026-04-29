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
 *     - Creates integration/ and load/ placeholders
 *
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
// 2. .github/copilot-instructions.md — overwrite (framework-owned sequencer)
// ---------------------------------------------------------------------------
const copilotInstrPath = path.join(githubDir, 'copilot-instructions.md');
const copilotContent = buildCopilotInstructions(config);
forceWrite(copilotInstrPath, copilotContent);

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

// 5d. Create integration/ and load/ placeholders if missing.
const integrationReadme = path.join(automationDir, 'integration', 'README.md');
const loadReadme        = path.join(automationDir, 'load', 'README.md');
if (!fs.existsSync(integrationReadme)) {
  if (!dryRun) {
    fs.mkdirSync(path.dirname(integrationReadme), { recursive: true });
    fs.writeFileSync(integrationReadme,
      '# Integration Tests\n\n> Placeholder for API/integration tests (k6, JMeter, Azure Load Testing, etc.).\n> Each tool gets its own subdirectory.\n', 'utf8');
  }
  updated.push(integrationReadme);
  console.log(`  [created] ${path.relative(cwd, integrationReadme)}`);
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

function buildCopilotInstructions(cfg) {
  const version = cfg.frameworkVersion ?? '1.0.0';
  return `# QA Framework Instructions

This project uses \`@keber/qa-framework\` v${version} for spec-driven automated testing.

## Agent behavior rules

0. **On every conversation start:** check if \`qa/AGENT-NEXT-STEPS.md\` exists. If it does, read it and complete its steps before anything else.
1. Before performing any QA task, load the relevant skill from \`.github/skills/\`. For project context, read \`qa/memory/INDEX.md\` if it exists, then load only the memory files relevant to the current task — do not load all memory files unconditionally. Never execute a pipeline stage unless its prerequisite is satisfied.
2. Always save artifacts in the correct \`qa/\` subfolder — refer to \`qa/QA-STRUCTURE-GUIDE.md\`
3. Never hardcode credentials — always use env vars and \`<PLACEHOLDER>\` in documentation
4. Follow the naming conventions in \`qa/00-standards/naming-conventions.md\`
5. Project QA config is at \`qa/qa-framework.config.json\`
6. Save learnings in \`qa/memory/\` with proper naming and metadata. Always update \`qa/memory/INDEX.md\` after adding or updating any memory file.
7. **On module/sprint completion** (all TCs passing): (1) update the module status row in \`qa/README.md\`; (2) move the completed sprint checklist from \`AGENT-NEXT-STEPS.md\` to the \`## Sprint History\` section of \`qa/README.md\`; (3) trim \`AGENT-NEXT-STEPS.md\` so it contains only the next sprint — never let it accumulate more than one active sprint.

## QA Pipeline

Stages must run in order. Never start a stage unless its prerequisite is met.

| Stage | Task | Skill | Prerequisite |
|---|---|---|---|
| 1 | Analyze module | \`.github/skills/qa-module-analysis/SKILL.md\` | None |
| 2 | Generate specifications | \`.github/skills/qa-spec-generation/SKILL.md\` | 00-inventory.md exists |
| 3 | Generate test plan | \`.github/skills/qa-test-plan/SKILL.md\` | 05-test-scenarios.md exists |
| 4 | Generate test cases | \`.github/skills/qa-test-cases/SKILL.md\` | Test plan exists |
| 5 | Generate automation | \`.github/skills/qa-automation/SKILL.md\` | Specs approved, no PENDING-CODE |
| 5b | Stabilize failing tests | \`.github/skills/qa-test-stabilization/SKILL.md\` | Failing tests exist |
| 6 | Maintenance | \`.github/skills/qa-maintenance/SKILL.md\` | Application change delivered |
| — | ADO integration | \`.github/skills/qa-ado-integration/SKILL.md\` | ADO enabled in config |

## Project KB
1. \`qa/README.md\`          — The Living Index: module status, sprint history, blockers, quick-start commands.
2. \`qa/memory/INDEX.md\`    — Index of all memory files; load this before selecting which files to read.
`;
}
