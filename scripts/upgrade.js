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
 *     - .github/skills/             ← New skills architecture; always current
 *     - .github/copilot-instructions.md ← Pipeline sequencer; framework-owned
 *     - qa/QA-STRUCTURE-GUIDE.md    ← Folder reference; framework-owned
 *
 *   NEVER touches (project-owned):
 *     - qa/01-specifications/       ← Your specs
 *     - qa/02-test-plans/           ← Your test plans
 *     - qa/03-test-cases/           ← Your TCs
 *     - qa/07-automation/           ← Your Playwright code
 *     - qa/memory/                  ← Your learnings
 *     - qa/README.md                ← Your living index
 *     - qa/AGENT-NEXT-STEPS.md       ← Your sprint queue
 *
 *   REPORTS but does not delete:
 *     - qa/00-guides/               ← Old location (can be deleted manually)
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
