#!/usr/bin/env node
/**
 * scripts/upgrade.js - Upgrade framework-owned files in an existing project
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
 *     - Creates qa/03-test-cases/README.md optional marker if absent
 *
 *   MIGRATES (v1.11.x -> v1.12.0, lane-aware automation scaffold):
 *     Installs the lane scaffold only where it cannot break working user code.
 *     A file counts as framework-owned ("pristine") when its normalised sha256
 *     matches one this framework actually shipped; otherwise it is user-owned.
 *
 *     ATOMIC GROUP (all installed, or none - config/global-setup require() the scripts):
 *       - qa/07-automation/e2e/scripts/lane-config.js         (new in v1.12.0)
 *       - qa/07-automation/e2e/scripts/lane-lock.js           (new in v1.12.0)
 *       - qa/07-automation/e2e/scripts/global-setup-guards.js (new in v1.12.0)
 *       - qa/07-automation/e2e/playwright.config.ts
 *       - qa/07-automation/e2e/global-setup.ts
 *       If any member is user-owned the whole group is skipped with a warning and
 *       the upgrade continues; the project keeps its working setup rather than
 *       being left half-migrated.
 *
 *     PER FILE (leaf modules - a mixed state is still coherent):
 *       - qa/07-automation/e2e/fixtures/{auth,base,test-helpers}.ts
 *       - qa/07-automation/integration/{playwright.config.ts,global-setup.ts}
 *       - .env.example in both scaffolds (reference template only; your .env
 *         is never touched)
 *       Pristine -> overwritten. User-owned -> kept, with a warning.
 *
 *     REPORTS only (never patched):
 *       - .fill(password) in any .ts under e2e/ or integration/ - leaks the
 *         password into Playwright traces. See "Pattern 7" in
 *         .github/skills/qa-automation/references/patterns.md. Not auto-fixed:
 *         the surrounding code differs per project and a bad rewrite of a
 *         working login is worse than the finding.
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

const { buildCommandContent, discoverSkillNames, commandFileName } = require('./lib/claude-commands');
const { AGENT_NAMES, isSprintCycleEnabled, buildAgentContent, agentFileName } = require('./lib/claude-agents');

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

// Normalised sha256 of every version of these scaffold files that this framework has
// shipped (v1.8.0 through v1.11.3). A project file matching one of these was written
// by the framework and never edited, so v1.12.0 may safely replace it. Anything else
// is user-owned. Regenerate by hashing `git show <tag>:templates/<key>` for each tag.
//
// Deliberately hash-based rather than version-based: the frameworkVersion recorded in
// real installations is unreliable (observed values include 1.1.3 and 1.0.0, neither
// of which corresponds to a released scaffold).
const SHIPPED_SCAFFOLD_HASHES = {
  'automation-scaffold/playwright.config.ts': [
    '948635c118553e293447930ba3dcff9155446718554dd3bbcffac2720baebba1',
    'f145fda0a7215942b5431a779188609f8958e51a048b161ede605576efba3ef8',
  ],
  'automation-scaffold/global-setup.ts': [
    '077580914881ee71ac082d47579dc4cffa01e8348b0744fced6b8de2863e0bd1',
    '7b3e7ca54929e525055d19ba8cd9643de722c7092c67b1a2e273072dd712ec7a',
  ],
  'automation-scaffold/.env.example': [
    '18fab7c165085a4a585a6911b42c49b97177265d46261c8362c3508a7436c65c',
    '29dc3a97e42350fbe7a16681837ba8db2a539574f8aa86fe269204bc3081bff9',
  ],
  'automation-scaffold/fixtures/auth.ts': [
    'a856df26d80d521a0ad349879096698191ed6a2f919fac96d85980ab1d435c3e',
  ],
  'automation-scaffold/fixtures/base.ts': [
    '7c52ea17fad732825e327af59a7f0f3bf53db166f7191932ae51c97fd2825a39',
  ],
  'automation-scaffold/fixtures/test-helpers.ts': [
    'e2298972dea50e7df54265a7a94a232c0ff35c969f1b8778929079cfa2a1a541',
  ],
  // Introduced in v1.12.0 - never shipped before, so an existing copy in a project is
  // always user-authored (two live installations hand-wrote their own lane-lock.js).
  'automation-scaffold/scripts/lane-config.js': [],
  'automation-scaffold/scripts/lane-lock.js': [],
  'automation-scaffold/scripts/global-setup-guards.js': [],
  'integration-scaffold/playwright.config.ts': [
    '7276ed4fda85f80e37381257bc559f4bb48055d359858f69f6b838f3671a9e2d',
  ],
  'integration-scaffold/global-setup.ts': [
    'f63f9588c4746a16e46345d1d4b781f2905b652481d563cfc075d9d8c8481bde',
  ],
  'integration-scaffold/.env.example': [
    '671461d7dc9883505cec314aefa1129a336b6a03b31a0eb2eb2ede2adda7c4ac',
  ],
};

const updated  = [];
const skipped  = [];
const warnings = [];

console.log(`\n[qa-framework/upgrade] ${dryRun ? '(dry-run) ' : ''}Upgrading framework-owned files`);
console.log(`[qa-framework/upgrade] Project root: ${cwd}\n`);

// ---------------------------------------------------------------------------
// 1. .github/skills/ - always overwrite (framework-owned)
// ---------------------------------------------------------------------------
if (!fs.existsSync(skillsSrc)) {
  warnings.push('skills/ source directory not found in package - skipping skill install');
} else {
  fs.mkdirSync(skillsDest, { recursive: true });
  copyDirForce(skillsSrc, skillsDest);
}

// ---------------------------------------------------------------------------
// 2. .github/instructions/qa-framework.instructions.md - overwrite (framework-owned)
// ---------------------------------------------------------------------------
const copilotInstrPath = path.join(githubDir, 'instructions', 'qa-framework.instructions.md');
const instrTemplatePath = path.resolve(__dirname, '..', 'templates', 'qa-framework.instructions.md');
const copilotContent = fs.readFileSync(instrTemplatePath, 'utf8')
  .replace('{{VERSION}}', config.frameworkVersion ?? '1.0.0');
forceWrite(copilotInstrPath, copilotContent);

// ---------------------------------------------------------------------------
// 2a. .claude/commands/qa-*.md and .claude/rules/qa-framework.md - overwrite (framework-owned)
// ---------------------------------------------------------------------------
const claudeCommandsDest = path.join(cwd, '.claude', 'commands');
for (const skillName of discoverSkillNames(skillsSrc)) {
  forceWrite(path.join(claudeCommandsDest, commandFileName(skillName)), buildCommandContent(skillName));
}

const claudeRulesPath   = path.join(cwd, '.claude', 'rules', 'qa-framework.md');
const rulesTemplatePath = path.resolve(__dirname, '..', 'templates', 'qa-framework.rules.md');
const claudeRulesContent = fs.readFileSync(rulesTemplatePath, 'utf8')
  .replace('{{VERSION}}', config.frameworkVersion ?? '1.0.0');
forceWrite(claudeRulesPath, claudeRulesContent);

// ---------------------------------------------------------------------------
// 2c. .claude/agents/qa-*.md - optional ANALISIS/PLAN sprint-cycle mode (Claude Code only)
//     Gated by integrations.azureDevOps.sprintCycle.enabled. Framework-owned when the
//     flag is on; never generated (and never deleted if it was hand-authored) otherwise.
// ---------------------------------------------------------------------------
if (isSprintCycleEnabled(config)) {
  const templatesDir = path.resolve(__dirname, '..', 'templates');
  const claudeAgentsDest = path.join(cwd, '.claude', 'agents');
  for (const agentName of AGENT_NAMES) {
    forceWrite(path.join(claudeAgentsDest, agentFileName(agentName)), buildAgentContent(agentName, templatesDir, config));
  }
}

// ---------------------------------------------------------------------------
// 2b. Migration: strip QA Framework section from old copilot-instructions.md
//
// Handles all cases:
//   A. File has custom instructions + QA section  -> keep custom, strip QA section
//   B. File has ONLY QA section (any version)     -> delete the file
//   C. File does not mention QA Framework         -> leave untouched
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
      // Case B: file contained only QA Framework content -> delete it
      if (!dryRun) fs.unlinkSync(oldCopilotPath);
      updated.push(oldCopilotPath);
      console.log(`  [deleted]  .github/copilot-instructions.md (contained only QA Framework rules - now in .github/instructions/qa-framework.instructions.md)`);
    } else {
      // Case A: file had custom content too -> write back only the custom part
      if (!dryRun) fs.writeFileSync(oldCopilotPath, before + '\n', 'utf8');
      updated.push(oldCopilotPath);
      console.log(`  [cleaned]  .github/copilot-instructions.md - removed QA Framework section, kept custom instructions`);
    }
  }
  // Case C: no QA marker found -> leave untouched (no log noise)
}

// ---------------------------------------------------------------------------
// 3. qa/QA-STRUCTURE-GUIDE.md - overwrite (framework doc)
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
        `Cannot migrate e2e/${entry.name}/ - target e2e/tests/${entry.name}/ already exists. Merge manually.`
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
    console.log(`  [patched] e2e/playwright.config.ts - testDir: '.' -> './tests'`);
  }

  // Inject testIgnore after testDir line if not present
  if (!cfg.includes('testIgnore')) {
    cfg = cfg.replace(
      /(testDir\s*:.*\n)/,
      "$1  testIgnore: ['**/helpers/debug/**', '**/seeds/**'],\n"
    );
    cfgChanged = true;
    console.log(`  [patched] e2e/playwright.config.ts - added testIgnore`);
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
        warnings.push(`Cannot migrate 02-test-plans/${entry.name} - target already exists. Move manually.`);
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
      '# 03-test-cases/ - Optional Standalone Test Cases\n\n' +
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
// 9. Migration v1.11.x -> v1.12.0: lane-aware automation scaffold
//
//    v1.12.0 rewrote the automation scaffold around a lane table: playwright.config.ts
//    and global-setup.ts now require() three CommonJS helpers under e2e/scripts/.
//    init.js installs those for NEW projects only, so existing installations never
//    receive them. This section carries them across.
//
//    Classification per file (the governing rule is: never break working user code):
//
//      a) Lane scripts (scripts/lane-config.js, lane-lock.js, global-setup-guards.js)
//         plus playwright.config.ts and global-setup.ts form ONE ATOMIC GROUP,
//         because config/global-setup require() the scripts by path. Installing a
//         subset yields a project where Playwright cannot start at all. The group is
//         installed only when EVERY member is either absent or provably pristine;
//         otherwise the whole group is skipped with a warning and the rest of the
//         upgrade continues. This is a coherent skip, not an abort: the project keeps
//         the working setup it already had, so it is never left half-migrated.
//
//      b) fixtures/{auth,base,test-helpers}.ts are per-file. They are leaf modules -
//         nothing in the scaffold require()s them by path - so a mixed state is
//         still coherent.
//
//      c) .env.example is a reference template, never live config (the real file is
//         .env, which this migration never touches). Overwritten when pristine.
//
//    "Pristine" means the file's normalised sha256 matches a hash this framework
//    actually shipped in some earlier release (SHIPPED_SCAFFOLD_HASHES). Anything
//    else is user-owned and is only ever warned about. The project's recorded
//    frameworkVersion is deliberately NOT used: live installations report values
//    like 1.1.3 and 1.0.0 that do not correspond to any real scaffold release.
//
//    Files that stay user-owned are additionally scanned for the trace-safety
//    defect (.fill(password) leaks the password into Playwright traces). That is
//    reported with file and line only - never patched, because the surrounding
//    shapes differ per project (passwordSelector vs PASSWORD_SEL) and a bad regex
//    edit to a working login is exactly the breakage this section must avoid.
// ---------------------------------------------------------------------------
const AUTOMATION_LANE_SCRIPTS = ['lane-config.js', 'lane-lock.js', 'global-setup-guards.js'];
const AUTOMATION_FIXTURES     = ['auth.ts', 'base.ts', 'test-helpers.ts'];

// A bare e2e/ directory is not evidence of an automation setup: section 5 above
// creates e2e/tests/{helpers/debug,seeds}/ unconditionally. Only migrate a project
// that actually has a scaffold, i.e. one of the files this migration would replace.
const hasAutomationScaffold = ['playwright.config.ts', 'global-setup.ts', 'package.json']
  .some((f) => fs.existsSync(path.join(e2eDir, f)));

if (hasAutomationScaffold) {
  const scaffoldSrc = path.resolve(__dirname, '..', 'templates', 'automation-scaffold');

  // --- (a) the atomic lane group -------------------------------------------
  const groupMembers = [
    ...AUTOMATION_LANE_SCRIPTS.map((f) => ({
      rel: `scripts/${f}`,
      src: path.join(scaffoldSrc, 'scripts', f),
      dest: path.join(e2eDir, 'scripts', f),
      key: `automation-scaffold/scripts/${f}`,
    })),
    ...['playwright.config.ts', 'global-setup.ts'].map((f) => ({
      rel: f,
      src: path.join(scaffoldSrc, f),
      dest: path.join(e2eDir, f),
      key: `automation-scaffold/${f}`,
    })),
  ];

  const blockers = groupMembers.filter((m) => fs.existsSync(m.dest) && !isPristine(m.dest, m.key));

  if (blockers.length === 0) {
    for (const m of groupMembers) {
      forceWrite(m.dest, fs.readFileSync(m.src, 'utf8'));
      console.log(`  [updated]  e2e/${m.rel}`);
    }
  } else {
    warnings.push(
      `Lane-aware automation scaffold (v1.12.0) NOT installed - these files are user-owned:\n` +
        blockers.map((m) => `      e2e/${m.rel}`).join('\n') +
        `\n    playwright.config.ts and global-setup.ts require() e2e/scripts/*.js, so the\n` +
        `    group is installed all-or-nothing. Your current setup is left working and\n` +
        `    untouched. To adopt lanes, merge these by hand from:\n` +
        `      node_modules/@keber/qa-framework/templates/automation-scaffold/`
    );
    for (const m of groupMembers) skipped.push(m.dest);
  }

  // --- (b) fixtures, per file ----------------------------------------------
  for (const file of AUTOMATION_FIXTURES) {
    const dest = path.join(e2eDir, 'fixtures', file);
    const key  = `automation-scaffold/fixtures/${file}`;
    if (!fs.existsSync(dest) || isPristine(dest, key)) {
      forceWrite(dest, fs.readFileSync(path.join(scaffoldSrc, 'fixtures', file), 'utf8'));
      console.log(`  [updated]  e2e/fixtures/${file}`);
    } else {
      skipped.push(dest);
      warnings.push(
        `e2e/fixtures/${file} is user-owned - kept as is (v1.12.0 version not applied).`
      );
    }
  }

  // --- (c) .env.example ------------------------------------------------------
  upgradeReferenceEnvExample(
    path.join(e2eDir, '.env.example'),
    path.join(scaffoldSrc, '.env.example'),
    'automation-scaffold/.env.example',
    'e2e/.env.example'
  );

  // --- trace safety on everything left user-owned ---------------------------
  reportTraceSafety(e2eDir);
}

// --- integration scaffold: no lane coupling, so purely per-file -------------
// Same reasoning as above: require a real scaffold file, not just the folder.
const hasIntegrationScaffold = ['playwright.config.ts', 'global-setup.ts', 'package.json']
  .some((f) => fs.existsSync(path.join(integrationDir, f)));

if (hasIntegrationScaffold) {
  const integrationSrc = path.resolve(__dirname, '..', 'templates', 'integration-scaffold');
  for (const file of ['playwright.config.ts', 'global-setup.ts']) {
    const dest = path.join(integrationDir, file);
    const key  = `integration-scaffold/${file}`;
    if (!fs.existsSync(dest) || isPristine(dest, key)) {
      forceWrite(dest, fs.readFileSync(path.join(integrationSrc, file), 'utf8'));
      console.log(`  [updated]  integration/${file}`);
    } else {
      skipped.push(dest);
      warnings.push(`integration/${file} is user-owned - kept as is (v1.12.0 version not applied).`);
    }
  }
  upgradeReferenceEnvExample(
    path.join(integrationDir, '.env.example'),
    path.join(integrationSrc, '.env.example'),
    'integration-scaffold/.env.example',
    'integration/.env.example'
  );
  reportTraceSafety(integrationDir);
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
  for (const f of skipped) console.log(`    - ${path.relative(cwd, f)}`);
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


// Normalised content hash: strips a UTF-8 BOM and CRLF so that a file which only
// differs by line endings or a BOM (both of which tooling rewrites silently) is
// still recognised as the framework's own output.
function scaffoldHash(content) {
  const normalised = content.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  return require('crypto').createHash('sha256').update(normalised, 'utf8').digest('hex');
}

// A file is "pristine" when its content is byte-identical (after normalisation) to
// something this framework actually shipped. A key with no recorded hashes - a file
// introduced in the current release - can never be pristine, so an existing copy is
// always treated as user-owned.
function isPristine(filePath, key) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return false;
  }
  const hash = scaffoldHash(content);

  // Already identical to what this release ships: nothing to do, and certainly not a
  // user edit. Computed rather than tabulated so the table never goes stale on release.
  try {
    const current = path.resolve(__dirname, '..', 'templates', ...key.split('/'));
    if (fs.existsSync(current) && scaffoldHash(fs.readFileSync(current, 'utf8')) === hash) return true;
  } catch {
    /* fall through to the historical table */
  }

  const known = SHIPPED_SCAFFOLD_HASHES[key];
  return Boolean(known) && known.includes(hash);
}

// .env.example is a reference template, never live configuration - the real values
// live in .env, which is never touched here. Overwrite it when pristine; when the
// user has edited it, keep theirs and say so.
function upgradeReferenceEnvExample(dest, src, key, label) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest) || isPristine(dest, key)) {
    forceWrite(dest, fs.readFileSync(src, 'utf8'));
    console.log(`  [updated]  ${label}`);
  } else {
    skipped.push(dest);
    warnings.push(
      `${label} is user-owned - kept as is. New v1.12.0 keys may be missing; compare against\n` +
        `    node_modules/@keber/qa-framework/templates/${key}`
    );
  }
}

// Trace safety (see skills/qa-automation/references/patterns.md, "Pattern 7"):
// page.locator(...).fill(password) records the password in the Playwright trace.
// Report location only. The surrounding code differs per project, so an automated
// rewrite of a working login is more dangerous than the finding itself.
function reportTraceSafety(rootDir) {
  const offenders = [];
  const FILL_PASSWORD = /\.fill\(\s*(?:password|pwd|[A-Za-z_$]*(?:[Pp]ass(?:word)?|PASSWORD)[A-Za-z_$]*)\s*\)/;

  (function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.ts$/.test(entry.name)) {
        const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
        lines.forEach((line, i) => {
          if (FILL_PASSWORD.test(line)) offenders.push(`${path.relative(cwd, full)}:${i + 1}`);
        });
      }
    }
  })(rootDir);

  if (offenders.length) {
    warnings.push(
      `Trace safety: the password is written with .fill(), which stores it in the\n` +
        `    Playwright trace. Replace with the page.evaluate() form ("Pattern 7" in\n` +
        `    .github/skills/qa-automation/references/patterns.md):\n` +
        offenders.map((o) => `      ${o}`).join('\n')
    );
  }
}
