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
 *     - .claude/commands/qa-*.md, .claude/rules/qa-framework.md <- Claude Code equivalents
 *     A file that matches no version the framework shipped (ownership-manifest.json) and
 *     carries no intact generated marker is the project's edit: it is copied first to
 *     .claude/qa-framework-backup/upgrade-to-<version>[-runN]/<path without leading dot>,
 *     then overwritten, and TRIAGE.md in that folder lists the lines the project added.
 *
 *   Every move below needs positive evidence that the source is a framework leftover.
 *   Without it the path is left where it is and reported as a warning: an upgrade that
 *   migrates too little and says so beats one that relocates user work.
 *
 *   MIGRATES (v1.5.x -> v1.6.0, non-destructive):
 *     Only when qa/07-automation/playwright.config.ts exists (the v1.5.x location):
 *     - qa/07-automation/playwright.config.ts  -> qa/07-automation/e2e/
 *     - qa/07-automation/global-setup.ts       -> qa/07-automation/e2e/
 *     - qa/07-automation/package.json          -> qa/07-automation/e2e/
 *     - qa/07-automation/.env.example          -> qa/07-automation/e2e/
 *     - qa/07-automation/fixtures/             -> qa/07-automation/e2e/fixtures/
 *     Only while playwright.config.ts still has the v1.5.x testDir '.':
 *     - qa/07-automation/e2e/{module}/         -> qa/07-automation/e2e/tests/{module}/
 *       (only folders holding *.spec.* files; lib/, node_modules/, dot-folders stay)
 *     - Creates integration/ and load/ placeholders
 *     - Patches playwright.config.ts: testDir '.' -> './tests', adds testIgnore
 *     - Creates tests/helpers/debug/ and tests/seeds/ if absent
 *
 *   MIGRATES (v1.6.x -> v1.7.0, non-destructive):
 *     Only folders holding at least one pre-v1.7.0 plan (see below):
 *     - qa/02-test-plans/automated/  -> qa/02-test-plans/sprints/legacy-automated/
 *     - qa/02-test-plans/manual/     -> qa/02-test-plans/sprints/legacy-manual/
 *     - qa/02-test-plans/*-test-plan.md (or "**Plan ID**: TP-" header) -> sprints/legacy/
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
 *   DELIVERS (v1.14.0, install-if-missing, never overwrites the project's files):
 *     - qa/00-standards/*.md - the list shared with init (scripts/lib/standards-docs.js).
 *       Created when missing; an existing document is never touched, even if it differs.
 *     - qa/07-automation/integration/ API guard set (scripts/lib/integration-guard-files.js):
 *       scripts/, fixtures/ and tests/ of the read-only client and write gates. A file
 *       is delivered only with every scaffold file it imports; see deliverApiGuard().
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
const { isSprintCycleEnabled, renderAllAgents, stampGenerated, classifyAgentFile } = require('./lib/claude-agents');
const { STANDARDS_DOCS, standardsDocContent } = require('./lib/standards-docs');
const ownership = require('./lib/ownership');
const { INTEGRATION_GUARD_FILES } = require('./lib/integration-guard-files');
const {
  DISPUTED_README,
  RECOMMENDATIONS_README,
  LEGACY_RECOMMENDATION_FOLDERS,
} = require('./lib/defect-categories');

// Version stamped into the rule files. Always the package running the upgrade, never
// the consumer's frameworkVersion: that is a copy init wrote once and nothing updates
// (upgrade does not rewrite user config), so reading it froze both files at the
// scaffold-time version across every later upgrade.
const PACKAGE_VERSION = require(path.resolve(__dirname, '..', 'package.json')).version;

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
// shipped, v1.0.1 through the current release. A project file matching one of these
// was written by the framework and never edited, so upgrade may safely replace it.
// Anything else is user-owned. Regenerate by hashing `git show <tag>:templates/<key>`
// with scaffoldHash() for each tag.
//
// APPEND-ONLY, and the current template's hash must always be here:
// test/upgrade.test.js ("invariant: the current hash of every scaffold file...") fails
// until it is. That rule exists because the table used to stop at v1.11.3: once a file
// changed after v1.13.2, every copy the framework itself had installed in v1.12.0 to
// v1.13.2 no longer matched anything and was treated as user code forever.
//
// Deliberately hash-based rather than version-based: the frameworkVersion recorded in
// real installations is unreliable (observed values include 1.1.3 and 1.0.0, neither
// of which corresponds to a released scaffold).
const SHIPPED_SCAFFOLD_HASHES = {
  'automation-scaffold/playwright.config.ts': [
    '0b6bc44b9fa3f78ff156fa91b19cfc15c37af6f7705dbc2a2589d812f1b0b3db', // v1.0.1 - v1.5.1
    '4f522542c494d5b550a447b3cc7688448d498e7c749d37c043f811c8afff49e4', // v1.5.2
    '9dbb21c6b5e84c58be8fd86d8da31b00aeedd3d7adbbd40e06f97b386d461ad0', // v1.6.1
    '948635c118553e293447930ba3dcff9155446718554dd3bbcffac2720baebba1', // v1.6.2 - v1.10.0
    'f145fda0a7215942b5431a779188609f8958e51a048b161ede605576efba3ef8', // v1.11.0 - v1.11.3
    '59acff16e745ccd802254e65a1a5f8ddec549328c9c1fa94f715fb9daf449a1a', // v1.12.0 - v1.14.0-rc.1
    'c4b43b3075bcb283e4d1a32ad91b53395ea1930a24fd44afef554422f002903b', // unreleased: WP1.2 qaBaseUrl fallback, credentials checked at login
    'd9f06d5066438dc34241c7a6960b0aaedf157510c4ef407f71a4d0e6bf4bf9e3', // unreleased: WP3.4 login only in global setup, opt-in projects
  ],
  'automation-scaffold/global-setup.ts': [
    '077580914881ee71ac082d47579dc4cffa01e8348b0744fced6b8de2863e0bd1', // v1.0.1 - v1.10.0
    '7b3e7ca54929e525055d19ba8cd9643de722c7092c67b1a2e273072dd712ec7a', // v1.11.0 - v1.11.3
    '849b265ac82ffd082c96b68f9542331f3083d81e61709abf009450c35da39948', // v1.12.0 - v1.14.0-rc.1
    '2f44cb447c5e5e8248c50cbda91ee66192cb14eb8f73761651f94fa8e5116a10', // unreleased: WP1.2 qaBaseUrl fallback, credentials checked at login
    '090e38911281de0fa13705555c49d15f7db4f17e090484086149442beb24ec1b', // unreleased: WP3.4 login only in global setup, opt-in projects
  ],
  'automation-scaffold/.env.example': [
    '18fab7c165085a4a585a6911b42c49b97177265d46261c8362c3508a7436c65c', // v1.0.1 - v1.10.0
    '29dc3a97e42350fbe7a16681837ba8db2a539574f8aa86fe269204bc3081bff9', // v1.11.0 - v1.11.3
    '3a0625520f583e42b1a1fc70190ba780dfe09da3c76b073cbe463b33da31c6a0', // v1.12.0 - v1.13.2
  ],
  'automation-scaffold/fixtures/auth.ts': [
    'a856df26d80d521a0ad349879096698191ed6a2f919fac96d85980ab1d435c3e', // v1.0.1 - v1.11.3
    '7b84947aa078d96a99fed4d4f662c1b34305595b9f5ee7fe73c993f5a30d74a5', // v1.12.0 - v1.13.2
    'd53e1ee1d3fb1f889d3ed6c1bf0c1b1fbbe34f9f4f42fab5f0b266bc709ba216', // unreleased: WP3.4 login only in global setup, opt-in projects
  ],
  'automation-scaffold/fixtures/base.ts': [
    '7c52ea17fad732825e327af59a7f0f3bf53db166f7191932ae51c97fd2825a39', // v1.11.0 - v1.11.3
    '64d5eb20b623efedf6aabe556235fc4b28680eb8728c310eaeac411f21f7578a', // v1.12.0 - v1.13.2
  ],
  'automation-scaffold/fixtures/test-helpers.ts': [
    'e2298972dea50e7df54265a7a94a232c0ff35c969f1b8778929079cfa2a1a541', // v1.0.1 - v1.11.3
    '44d2e940f89de221cf5ace42e437d010a4bf1215f8024127e9f6bb24eff600b0', // v1.12.0 - v1.13.2
  ],
  // Introduced by WP3.3. A copy matching none of these is user-authored.
  'automation-scaffold/fixtures/defects.ts': [
    'f1c5d28d34a2526f74a3e965de758a09d6d2c40403dea7a65dd5d55c03855f4f', // unreleased: WP3.3 defect-suite polarity
  ],
  // Introduced in v1.12.0. A copy matching none of these is user-authored (two live
  // installations hand-wrote their own lane-lock.js before v1.12.0).
  'automation-scaffold/scripts/lane-config.js': [
    '962e47f06854f2542069abd5c68f84f2f307dec88412e10954034c4299c0be14', // v1.12.0 - v1.14.0-rc.1
    '902e6ff19c334f3af5ef31e78171c52c8b8135cb42dff2e82d6e81ea66a06b26', // unreleased: WP1.2 qaBaseUrl fallback, credentials checked at login
  ],
  'automation-scaffold/scripts/lane-lock.js': [
    '84d2706e953968c3d2af51c67af24473db3c31e4e604c99a677ddd1b6adb07e0', // v1.12.0 - v1.13.2
    '82f90f20a871bc080ff58c359bc480010ca6534a05d46c65bf6f6413303f6f90', // unreleased: request_id holder check
  ],
  'automation-scaffold/scripts/global-setup-guards.js': [
    'f8584209a241222552c9f34a6e5535265e8903782131e216e6b68c717e360da8', // v1.12.0 - v1.14.0-rc.1
    '8c360139a27e9117aef444e0e1855f8f98167309f273c2648a0c07fa2823b7b9', // unreleased: WP1.2 qaBaseUrl fallback, credentials checked at login
    'f786718b6a6abdc184cba59f7b19a41fbb41a2128515ca695c26e2a7903b4678', // unreleased: WP3.4 login only in global setup, opt-in projects
  ],
  // Introduced by WP3.4. A copy matching none of these is user-authored.
  'automation-scaffold/scripts/run-opt-in.js': [

    '9bb5962e6d47371a936df1c0b1b4a0592f6599a2af3a7334e685f128b021034a', // unreleased: WP3.4 login only in global setup, opt-in projects
  ],
  'integration-scaffold/playwright.config.ts': [
    '7276ed4fda85f80e37381257bc559f4bb48055d359858f69f6b838f3671a9e2d', // v1.11.0 - v1.11.3
    '6eacaa9fe5bf660182cc4357b3a5fedd77958c7bf81897454443fd27378cc6c4', // v1.12.0 - v1.13.2
    'f774a51f911e46f4ae6c7613c540b329d39f744b5a0af38b142b436ca1549085', // unreleased: WP2.2 write gates, no load-time URL/credential checks
  ],
  'integration-scaffold/global-setup.ts': [
    'f63f9588c4746a16e46345d1d4b781f2905b652481d563cfc075d9d8c8481bde', // v1.11.0 - v1.11.3
    'c212471c9a7eb9b6110c25d2823eb50114c4783cca9e1ab149134d96d7212403', // v1.12.0 - v1.13.2
    'b8b0549cf0f0a368ad96a9b182d7a189b25e9a77db8f038a33ec7381654dd5c8', // unreleased: WP2.2 empty state without URL/credentials, least-privilege .env
  ],
  'integration-scaffold/.env.example': [
    '671461d7dc9883505cec314aefa1129a336b6a03b31a0eb2eb2ede2adda7c4ac', // v1.11.0 - v1.13.2
  ],
  // The API guard set (scripts/lib/integration-guard-files.js). Only owner 'framework'
  // files and tests/example.spec.ts are ever refreshed from these; the 'user' entries
  // are recorded so a later release can still tell an untouched copy from an edited one.
  'integration-scaffold/tests/example.spec.ts': [
    'f578077fecdba7ddace9eff6f08bcfe98af0a5d7e41df5bbf00909d60bd78240', // v1.11.0 - v1.14.0-rc.2
    '7c9d20b58bc5d8cd973f65e50940fc389931c838e33566a263faa26a9a6a8e47', // unreleased: WP2.2 read catalog and response contract
  ],
  'integration-scaffold/scripts/hard-exclusions.js': [
    '7e6f2dd9ce6ddf494663c5717f6cb96142a70f4b3954210a5a0839483ef5d3e7', // unreleased: WP2.2
  ],
  'integration-scaffold/scripts/api-guard.js': [
    '32b362a7dcb28e8b4957f795966e88149ae759bb3b8022f45032290bd9d5269e', // unreleased: WP2.2
  ],
  'integration-scaffold/scripts/run-write-tests.js': [
    '3d60721b3bb94a292e171caab0967185b0ad66ff75dfbfbba30a3b8e4c378324', // unreleased: WP2.2
  ],
  'integration-scaffold/fixtures/base.ts': [
    '61ad21f8a21f3fce8cc70bdccbd1fff39ed53e750bd39044dc60872d0db87c0c', // unreleased: WP2.2
  ],
  'integration-scaffold/fixtures/read-catalog.ts': [
    '443fdefe3856b5e181fc4ce13e213f57c294cc6558b7083063829cf9d49cbbed', // unreleased: WP2.2
  ],
  'integration-scaffold/fixtures/write-catalog.ts': [
    'a35b255db64491bb2491062f1e85bf324da1e11fef90a793e042646cad2028cf', // unreleased: WP2.2
  ],
  'integration-scaffold/fixtures/project-exclusions.ts': [
    '1827c9be4210dde8f430ef5407e396a3f93b13f2a55f2658e5791190df081411', // unreleased: WP2.2
  ],
  'integration-scaffold/fixtures/contract.ts': [
    '38c071e518eeebd085bef4cd3e8f6d523557db29bbb6548973f1d4f4cfacc916', // unreleased: WP2.2
  ],
  'integration-scaffold/tests/security/read-only-guard.spec.ts': [
    '5d1dbafafcd8f4f5a05f238fc1b638ed23140e0cb5336a1bc142e7c92d2914ec', // unreleased: WP2.2
  ],
  'integration-scaffold/tests/security/catalogs.spec.ts': [
    'b47787be5d106fa322a39a0c7fdec0e1f09c59d6c67ab992e9e02afea35b478b', // unreleased: WP2.2
  ],
  'integration-scaffold/tests/security/no-session.spec.ts': [
    '6501c733de07a64bfff3c9b55216a6b40743ea9e8dc27d3129aa7727b233edf3', // unreleased: WP2.2
  ],
  'integration-scaffold/tests/write/example-write-cycle.spec.ts': [
    '2770c603d4dea514baed8082a3bde76646fcb161c766ad1a74702491d05917ee', // unreleased: WP2.2
  ],
};

const updated  = [];
// "Skipped (already up to date)" means exactly one thing: the file is identical to what
// this release would write. Anything left untouched for another reason goes to `kept`
// (the user's own content, nothing to merge) or to `warnings` (it differs from the
// template and misses this release's change). Never push a differing file here.
const skipped  = [];
const kept     = [];
const warnings = [];
const errors   = [];

// Ownership of the force-written framework files (skills, commands, rules, instructions,
// QA structure guide). A file that differs from every version the framework shipped is
// the project's edit: it is backed up to one per-run folder before it is overwritten,
// and listed in that folder's TRIAGE.md. See scripts/lib/ownership.js.
const ownershipManifest = ownership.loadManifest();
if (!ownershipManifest) {
  warnings.push(
    `scripts/lib/ownership-manifest.json is missing or unreadable in this package, so no\n` +
      `    earlier framework version can be recognised: every framework file that differs from\n` +
      `    this release is backed up before it is overwritten.`
  );
}
const backups = [];        // { key, backup, reason, result, note }
let backupRunDir = null;   // absolute; claimed on the first backup of this run

console.log(`\n[qa-framework/upgrade] ${dryRun ? '(dry-run) ' : ''}Upgrading framework-owned files`);
console.log(`[qa-framework/upgrade] Project root: ${cwd}\n`);

// ---------------------------------------------------------------------------
// 1. .github/skills/ - overwrite (framework-owned); an edited file is backed up first
// ---------------------------------------------------------------------------
if (!fs.existsSync(skillsSrc)) {
  warnings.push('skills/ source directory not found in package - skipping skill install');
} else {
  fs.mkdirSync(skillsDest, { recursive: true });
  copyDirOwned(skillsSrc, skillsDest);
}

// ---------------------------------------------------------------------------
// 2. .github/instructions/qa-framework.instructions.md - overwrite (framework-owned;
//    an edited file is backed up first)
// ---------------------------------------------------------------------------
const copilotInstrPath = path.join(githubDir, 'instructions', 'qa-framework.instructions.md');
const instrTemplatePath = path.resolve(__dirname, '..', 'templates', 'qa-framework.instructions.md');
const copilotContent = fs.readFileSync(instrTemplatePath, 'utf8')
  .replace('{{VERSION}}', PACKAGE_VERSION);
writeOwned(copilotInstrPath, copilotContent);

// ---------------------------------------------------------------------------
// 2a. .claude/commands/qa-*.md and .claude/rules/qa-framework.md - overwrite (framework-owned;
//     an edited file is backed up first). Generated commands carry the ownership marker;
//     a command without one that matches no shipped wrapper is hand-written.
// ---------------------------------------------------------------------------
const claudeCommandsDest = path.join(cwd, '.claude', 'commands');
for (const skillName of discoverSkillNames(skillsSrc)) {
  writeOwned(path.join(claudeCommandsDest, commandFileName(skillName)), buildCommandContent(skillName));
}

const claudeRulesPath   = path.join(cwd, '.claude', 'rules', 'qa-framework.md');
const rulesTemplatePath = path.resolve(__dirname, '..', 'templates', 'qa-framework.rules.md');
const claudeRulesContent = fs.readFileSync(rulesTemplatePath, 'utf8')
  .replace('{{VERSION}}', PACKAGE_VERSION);
writeOwned(claudeRulesPath, claudeRulesContent);

// ---------------------------------------------------------------------------
// 2c. .claude/agents/qa-*.md - optional ANALISIS/PLAN sprint-cycle mode (Claude Code only)
//     Gated by integrations.azureDevOps.sprintCycle.enabled. Never generated (and never
//     deleted if it was hand-authored) when the flag is off.
//
//     Ownership comes from the marker each generated file carries (see
//     classifyAgentFile in scripts/lib/claude-agents.js), never from a static hash table:
//       pristine -> overwritten
//       edited   -> kept, with a warning naming the template to merge from
//       legacy   -> no marker (pre-marker release or hand-written): copied to this
//                   run's backup folder (.claude/qa-framework-backup/<run>/claude/agents/)
//                   first, then overwritten. Backups rc.6 made in
//                   .claude/qa-framework-backup/agents/ stay where they are.
//     The backup lives OUTSIDE .claude/agents/ on purpose: Claude Code scans that folder
//     recursively and identifies agents by their frontmatter name, so a backup copy
//     inside it would load as a second agent with the same name.
// ---------------------------------------------------------------------------
if (isSprintCycleEnabled(config)) {
  const templatesDir = path.resolve(__dirname, '..', 'templates');
  const claudeAgentsDest = path.join(cwd, '.claude', 'agents');
  // Rendered per agent: one invalid agent (e.g. qa-investigador with a bad lane config)
  // is reported and left untouched on disk, the others are still upgraded.
  for (const agent of renderAllAgents(templatesDir, config)) {
    if (agent.error) {
      errors.push(`.claude/agents/${agent.fileName} was not generated. ${agent.error.message}`);
      continue;
    }
    upgradeAgent(path.join(claudeAgentsDest, agent.fileName), agent);
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
// 3. qa/QA-STRUCTURE-GUIDE.md - overwrite (framework doc; an edited file is backed up first)
// ---------------------------------------------------------------------------
const structureGuideSrc  = path.resolve(__dirname, '..', 'docs', 'folder-structure-guide.md');
const structureGuideDest = path.join(qaRoot, 'QA-STRUCTURE-GUIDE.md');
if (fs.existsSync(structureGuideSrc) && fs.existsSync(qaRoot)) {
  writeOwned(structureGuideDest, fs.readFileSync(structureGuideSrc, 'utf8'));
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

// Evidence of the pre-v1.6.0 layout: v1.5.x kept playwright.config.ts directly in
// 07-automation/. Without it, files and folders found there (a workspace package.json,
// a shared fixtures/ folder) are user-owned and are reported, never moved.
const legacyRootConfig = path.join(automationDir, 'playwright.config.ts');
const isV15Layout      = fs.existsSync(legacyRootConfig);
// The testDir value v1.5.x shipped. Section 5e rewrites it to './tests'.
const LEGACY_TESTDIR_RE = /testDir\s*:\s*['"]\.['"]/;

function warnNotMigrated(rel, reason) {
  warnings.push(`${rel} left in place - ${reason}. Move it by hand if it is a v1.5.x leftover.`);
}

// 5a. Scaffold files: 07-automation/*.* -> 07-automation/e2e/*.*
const scaffoldFiles = ['playwright.config.ts', 'global-setup.ts', 'package.json', '.env.example', 'package-lock.json'];
for (const file of scaffoldFiles) {
  const oldPath = path.join(automationDir, file);
  const newPath = path.join(e2eDir, file);
  if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
    if (!isV15Layout) {
      warnNotMigrated(`qa/07-automation/${file}`, 'no v1.5.x qa/07-automation/playwright.config.ts proves it is legacy');
      continue;
    }
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
  if (isV15Layout && fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
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
if (fs.existsSync(oldFixturesDir) && !isV15Layout) {
  warnNotMigrated('qa/07-automation/fixtures/', 'no v1.5.x qa/07-automation/playwright.config.ts proves it is legacy');
} else if (fs.existsSync(oldFixturesDir) && !fs.existsSync(newFixturesDir)) {
  if (!dryRun) {
    fs.mkdirSync(e2eDir, { recursive: true });
    fs.renameSync(oldFixturesDir, newFixturesDir);
  }
  updated.push(newFixturesDir);
  console.log(`  [migrated] ${path.relative(cwd, oldFixturesDir)}/ -> e2e/fixtures/`);
}

// 5c. Spec stubs: e2e/{module}/*.spec.ts -> e2e/tests/{module}/
//     Moves a directory directly under e2e/ only when it is provably a legacy module
//     folder: not a known scaffold/tooling dir, not a dot-folder, and it contains at
//     least one spec file. Anything else (lib/, node_modules/, docs/...) is user-owned.
const testsDir = path.join(e2eDir, 'tests');
const knownE2eDirs = new Set([
  'tests', 'page-objects', 'fixtures', 'diagnosis', 'scripts', 'seeds', 'helpers',
  'node_modules', 'lib', 'test-results', 'playwright-report', 'blob-report',
]);
const SPEC_FILE_RE = /\.spec\.[cm]?[jt]s$/;

function containsSpecFile(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    // Unreadable means unproven: leave the folder where it is.
    warnings.push(`Cannot inspect ${path.relative(cwd, dir)} (${err.code}) - not migrated.`);
    return false;
  }
  for (const entry of entries) {
    if (entry.isFile() && SPEC_FILE_RE.test(entry.name)) return true;
    if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.') &&
        containsSpecFile(path.join(dir, entry.name))) return true;
  }
  return false;
}

// Holding specs is not enough: since v1.6.0 testDir is './tests', so a spec folder
// beside tests/ (temp/, archive/...) was put there on purpose and must stay. Folders
// are moved only while the project still runs on the v1.5.x testDir '.', where every
// e2e/{module}/ was part of the suite. In dry-run, 5a has not moved the root config yet.
function hasLegacyTestDir() {
  const e2eConfig = path.join(e2eDir, 'playwright.config.ts');
  const cfgPath = fs.existsSync(e2eConfig) ? e2eConfig : isV15Layout ? legacyRootConfig : null;
  if (!cfgPath) return false;
  try {
    return LEGACY_TESTDIR_RE.test(fs.readFileSync(cfgPath, 'utf8'));
  } catch (err) {
    warnings.push(`Cannot read ${path.relative(cwd, cfgPath)} (${err.code}) - e2e/ folders not migrated.`);
    return false;
  }
}

if (fs.existsSync(e2eDir)) {
  const specFolders = fs.readdirSync(e2eDir, { withFileTypes: true }).filter((entry) =>
    entry.isDirectory() && !knownE2eDirs.has(entry.name) && !entry.name.startsWith('.') &&
    containsSpecFile(path.join(e2eDir, entry.name)));
  const legacyLayout = specFolders.length > 0 && hasLegacyTestDir();

  for (const entry of specFolders) {
    if (!legacyLayout) {
      warnings.push(
        `e2e/${entry.name}/ holds spec files outside e2e/tests/ - left in place (the project is ` +
        `not on the v1.5.x testDir '.' layout). Move it into tests/ by hand if it should run.`
      );
      continue;
    }
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
// The tests and fixtures (tests/example.spec.ts included) are delivered by section 9's
// API guard step, which installs them only together with the files they import.
const integrationCreatedNow = !fs.existsSync(integrationReadme);
if (integrationCreatedNow) {
  if (!dryRun) fs.mkdirSync(integrationDir, { recursive: true });
  for (const file of ['package.json', 'playwright.config.ts', 'global-setup.ts', 'README.md', '.env.example']) {
    const dest = path.join(integrationDir, file);
    if (!fs.existsSync(dest)) {
      if (!dryRun) fs.copyFileSync(path.join(integrationScaffold, file), dest);
      updated.push(dest);
      console.log(`  [created] ${path.relative(cwd, dest)}`);
    }
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
  if (LEGACY_TESTDIR_RE.test(cfg)) {
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
  // A file is a provable pre-v1.7.0 plan when it is
  // named {module}-test-plan.md / {module}-{track}-test-plan.md (qa-test-plan <= v1.6.x),
  // or generated from the old templates/test-plan.md (header "**Plan ID**: TP-...").
  const LEGACY_PLAN_NAME_RE   = /-test-plan\.md$/i;
  const LEGACY_PLAN_HEADER_RE = /^\*\*Plan ID\*\*:\s*TP-/m;
  const isLegacyPlan = (file) => {
    if (LEGACY_PLAN_NAME_RE.test(path.basename(file))) return true;
    try {
      return LEGACY_PLAN_HEADER_RE.test(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      warnings.push(`Cannot read ${path.relative(cwd, file)} (${err.code}) - not migrated.`);
      return false;
    }
  };
  // qa-test-plan <= v1.6.x wrote into automated/ and manual/; init never created them.
  // A folder with that name but no legacy plan inside was made by the user after v1.7.0.
  const holdsLegacyPlan = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      warnings.push(`Cannot inspect ${path.relative(cwd, dir)} (${err.code}) - not migrated.`);
      return false;
    }
    return entries.some((e) => e.isFile() && e.name.endsWith('.md') && isLegacyPlan(path.join(dir, e.name)));
  };

  const legacySubdirs = ['automated', 'manual'];
  for (const sub of legacySubdirs) {
    const oldDir = path.join(testPlansDir, sub);
    const newDir = path.join(sprintsDir, `legacy-${sub}`);
    if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
      if (!holdsLegacyPlan(oldDir)) {
        warnNotMigrated(`qa/02-test-plans/${sub}/`, 'it holds no pre-v1.7.0 test plan');
        continue;
      }
      if (!dryRun) {
        fs.mkdirSync(sprintsDir, { recursive: true });
        fs.renameSync(oldDir, newDir);
      }
      updated.push(newDir);
      console.log(`  [migrated] 02-test-plans/${sub}/ -> 02-test-plans/sprints/legacy-${sub}/`);
    }
  }

  // Move flat .md files in 02-test-plans/ only when they are provably pre-v1.7.0 plans.
  // Any other flat .md (README.md, plan-sprint-1.md, notes) is user-owned and stays.
  if (fs.existsSync(testPlansDir)) {
    const legacyDir = path.join(sprintsDir, 'legacy');
    for (const entry of fs.readdirSync(testPlansDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const oldFile = path.join(testPlansDir, entry.name);
      if (!isLegacyPlan(oldFile)) continue;
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
// 7. Ensure the 06-defects/ category folders exist
//    disputed/ (added in v1.11.0), recommendations/ (added in v1.14.0).
//    Safe: only creates a missing folder or a missing README. Never touches
//    existing files. recommendations/ is not added when the project already
//    keeps the same category under a legacy name (e.g. improvements/).
// ---------------------------------------------------------------------------
const defectsDir = path.join(qaRoot, '06-defects');

function ensureDefectFolder(name, readmeContent) {
  const dir = path.join(defectsDir, name);
  const readme = path.join(dir, 'README.md');
  if (!fs.existsSync(dir)) {
    if (!dryRun) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(readme, readmeContent, 'utf8');
    }
    updated.push(dir);
    console.log(`  [created] 06-defects/${name}/`);
    console.log(`  [created] 06-defects/${name}/README.md`);
  } else if (!fs.existsSync(readme)) {
    if (!dryRun) fs.writeFileSync(readme, readmeContent, 'utf8');
    updated.push(readme);
    console.log(`  [created] 06-defects/${name}/README.md`);
  }
}

if (fs.existsSync(defectsDir)) {
  ensureDefectFolder('disputed', DISPUTED_README);

  const legacyRecommendations = LEGACY_RECOMMENDATION_FOLDERS.find((name) =>
    fs.existsSync(path.join(defectsDir, name))
  );
  if (legacyRecommendations && !fs.existsSync(path.join(defectsDir, 'recommendations'))) {
    console.log(
      `  [skip]    06-defects/recommendations/ - the project keeps this category in ` +
      `06-defects/${legacyRecommendations}/ (left as is)`
    );
  } else {
    ensureDefectFolder('recommendations', RECOMMENDATIONS_README);
  }
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
    } else if (sameAsTemplate(dest, path.join(memorySrc, file))) {
      skipped.push(dest);
    } else {
      // Seeded once, then the team's own notes: never overwritten, nothing to merge.
      kept.push(dest);
    }
  }
}

// ---------------------------------------------------------------------------
// 8b. qa/00-standards/ documents (write-safety-policy.md added in v1.14.0)
//     Same list as init (scripts/lib/standards-docs.js). Installed when missing;
//     an existing document is never touched, even when it differs from the template:
//     the project edits these (write-safety-policy.md names its write approver).
// ---------------------------------------------------------------------------
if (fs.existsSync(qaRoot)) {
  const standardsDir = path.join(qaRoot, '00-standards');
  for (const doc of STANDARDS_DOCS) {
    const dest = path.join(standardsDir, doc.file);
    const content = standardsDocContent(doc);
    if (!fs.existsSync(dest)) {
      if (!dryRun) {
        fs.mkdirSync(standardsDir, { recursive: true });
        fs.writeFileSync(dest, content, 'utf8');
      }
      updated.push(dest);
      console.log(`  [created] 00-standards/${doc.file}`);
    } else if (sameContent(dest, content)) {
      skipped.push(dest);
    } else {
      // The project's own version: never overwritten, never merged.
      kept.push(dest);
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
//      b) fixtures/{auth,base,test-helpers,defects}.ts are per-file. They are leaf modules -
//         nothing in the scaffold require()s them by path - so a mixed state is
//         still coherent.
//
//      c) .env.example is a reference template, never live config (the real file is
//         .env, which this migration never touches). Overwritten when pristine.
//
//      d) scripts/run-opt-in.js (opt-in project launcher) is per-file like a fixture:
//         it requires nothing from the scaffold. auth.ts is held back while tests
//         still call loginAs() outside *.login.spec.ts (see section (b)).
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
const AUTOMATION_FIXTURES     = ['auth.ts', 'base.ts', 'test-helpers.ts', 'defects.ts'];

// A bare e2e/ directory is not evidence of an automation setup: section 5 above
// creates e2e/tests/{helpers/debug,seeds}/ unconditionally. Only migrate a project
// that actually has a scaffold, i.e. one of the files this migration would replace.
const hasAutomationScaffold = ['playwright.config.ts', 'global-setup.ts', 'package.json']
  .some((f) => fs.existsSync(path.join(e2eDir, f)));

if (hasAutomationScaffold) {
  const scaffoldSrc = path.resolve(__dirname, '..', 'templates', 'automation-scaffold');

  // Scaffold files (relative to e2e/) written by this run, dry runs included.
  const automationRefreshed = new Set();

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

  const scriptMembers = groupMembers.filter((m) => m.rel.startsWith('scripts/'));
  const hostMembers   = groupMembers.filter((m) => !m.rel.startsWith('scripts/'));
  const laneScaffoldInstalled = scriptMembers.every((m) => fs.existsSync(m.dest));

  // Atomicity protects the INSTALLATION: a v1.11 project receiving a subset ends up
  // with a config that require()s a script that is not there. Once all three scripts
  // exist, refreshing them changes no require() path. What remains coupled is:
  //   - the scripts with each other (lane-lock requires lane-config, the guards
  //     require lane-lock), so they refresh together or not at all;
  //   - the scripts' module API with the host files, which the export invariant in
  //     test/upgrade.test.js pins (a released export is never removed).
  // So a user-owned playwright.config.ts / global-setup.ts - which almost every
  // project has - no longer freezes the framework's own scripts forever.
  const blockers = laneScaffoldInstalled
    ? scriptMembers.filter((m) => !isPristine(m.dest, m.key))
    : groupMembers.filter((m) => fs.existsSync(m.dest) && !isPristine(m.dest, m.key));

  // Specs that already carry an opt-in suffix (C8). The current config moves
  // *.login/.writes/.slow.spec.ts out of the default suite into opt-in projects, so
  // refreshing a pristine older config would silently stop running them in `npm test`
  // (and silently put a *.writes.spec.ts under the write rules). Such a config is held
  // back with a warning until the files are renamed or the move is accepted by hand.
  const configMember = hostMembers.find((m) => m.rel === 'playwright.config.ts');
  const optInSpecs = findOptInSuffixSpecs(path.join(e2eDir, 'tests'));
  const holdConfig = optInSpecs.length > 0 && fs.existsSync(configMember.dest) &&
    isPristine(configMember.dest, configMember.key) && !sameAsTemplate(configMember.dest, configMember.src);

  if (laneScaffoldInstalled) {
    if (blockers.length === 0) {
      for (const m of scriptMembers) {
        reportWrite(forceWrite(m.dest, fs.readFileSync(m.src, 'utf8')), `e2e/${m.rel}`);
        automationRefreshed.add(m.rel);
      }
      // Host files follow only when pristine; a user-owned one keeps working because
      // every export it was written against is still there.
      for (const m of hostMembers) {
        if (m === configMember && holdConfig) {
          warnings.push(optInSuffixWarning(optInSpecs, ''));
          continue;
        }
        if (!fs.existsSync(m.dest) || isPristine(m.dest, m.key)) {
          reportWrite(forceWrite(m.dest, fs.readFileSync(m.src, 'utf8')), `e2e/${m.rel}`);
          automationRefreshed.add(m.rel);
        } else {
          warnUserOwned(m.dest, m.src, `e2e/${m.rel}`, m.key);
        }
      }
    } else {
      const heldBack = reportHeldBackGroup(groupMembers, blockers);
      warnings.push(
        `Lane scripts NOT refreshed - user-owned:\n` +
          blockers.map((m) => `      e2e/${m.rel}`).join('\n') +
          `\n    The three scripts require() each other, so they are refreshed together or not at\n` +
          `    all. Yours are left untouched. Fixes in the framework's version (for example the\n` +
          `    request_id holder check in lane-lock.js) must be merged by hand from:\n` +
          `      node_modules/@keber/qa-framework/templates/automation-scaffold/scripts/` +
          heldBack
      );
    }
  } else if (blockers.length === 0 && holdConfig) {
    // First delivery is all-or-nothing (the config require()s the scripts), so holding
    // the config back holds the whole group back. The current setup keeps working.
    warnings.push(optInSuffixWarning(
      optInSpecs,
      `\n    The lane scripts and global-setup.ts are installed only together with the config,\n` +
        `    so the lane-aware scaffold is NOT installed either; your current setup is untouched.`
    ));
  } else if (blockers.length === 0) {
    for (const m of groupMembers) {
      reportWrite(forceWrite(m.dest, fs.readFileSync(m.src, 'utf8')), `e2e/${m.rel}`);
      automationRefreshed.add(m.rel);
    }
  } else {
    const heldBack = reportHeldBackGroup(groupMembers, blockers);
    warnings.push(
      `Lane-aware automation scaffold (v1.12.0) NOT installed - these files are user-owned:\n` +
        blockers.map((m) => `      e2e/${m.rel}`).join('\n') +
        `\n    playwright.config.ts and global-setup.ts require() e2e/scripts/*.js, so the\n` +
        `    group is installed all-or-nothing. Your current setup is left working and\n` +
        `    untouched. To adopt lanes, merge these by hand from:\n` +
        `      node_modules/@keber/qa-framework/templates/automation-scaffold/` +
        heldBack
    );
  }

  // --- (b) fixtures, per file ----------------------------------------------
  // Tests that log in themselves (C5). From this release fixtures/auth.ts loginAs()
  // refuses to run in a project that records trace, video or screenshot - every lane
  // project does - so refreshing a pristine auth.ts under such a test would turn a
  // working suite red on upgrade. The old auth.ts is kept until those tests move to
  // storageState or to *.login.spec.ts, and the call sites are reported either way.
  const inTestLogins = findInTestLogins(path.join(e2eDir, 'tests'));
  for (const file of AUTOMATION_FIXTURES) {
    const dest = path.join(e2eDir, 'fixtures', file);
    const key  = `automation-scaffold/fixtures/${file}`;
    if (file === 'auth.ts' && inTestLogins.length && fs.existsSync(dest) &&
        isPristine(dest, key) && !sameAsTemplate(dest, path.join(scaffoldSrc, 'fixtures', file))) {
      warnings.push(
        `e2e/fixtures/auth.ts NOT refreshed: tests still log in inside the test (listed under\n` +
          `    "Login safety"), and this release's loginAs() refuses to run in a project that\n` +
          `    records artifacts. Move those tests to storageState, then run upgrade again.`
      );
      continue;
    }
    if (!fs.existsSync(dest) || isPristine(dest, key)) {
      reportWrite(forceWrite(dest, fs.readFileSync(path.join(scaffoldSrc, 'fixtures', file), 'utf8')), `e2e/fixtures/${file}`);
    } else {
      warnUserOwned(dest, path.join(scaffoldSrc, 'fixtures', file), `e2e/fixtures/${file}`, key);
    }
  }

  // --- (d) opt-in launcher, per file -----------------------------------------
  // run-opt-in.js requires nothing from the scaffold (it only starts the Playwright
  // CLI), so like a fixture it is delivered on its own, outside the lane group.
  {
    const rel  = 'scripts/run-opt-in.js';
    const dest = path.join(e2eDir, 'scripts', 'run-opt-in.js');
    const src  = path.join(scaffoldSrc, 'scripts', 'run-opt-in.js');
    const key  = `automation-scaffold/${rel}`;
    if (!fs.existsSync(dest) || isPristine(dest, key)) {
      reportWrite(forceWrite(dest, fs.readFileSync(src, 'utf8')), `e2e/${rel}`);
      automationRefreshed.add(rel);
    } else {
      warnUserOwned(dest, src, `e2e/${rel}`, key);
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
  reportInTestLogins(inTestLogins);
  reportOptInScripts(
    path.join(e2eDir, 'package.json'),
    automationRefreshed.has('playwright.config.ts') ||
      sameAsTemplate(path.join(e2eDir, 'playwright.config.ts'), path.join(scaffoldSrc, 'playwright.config.ts'))
  );
}

// --- integration scaffold: no lane coupling, so purely per-file -------------
// Same reasoning as above: require a real scaffold file, not just the folder. A project
// whose integration/ holds only the pre-v1.11 placeholder README gets nothing here. In
// a dry run, section 5d only reported the scaffold it would create, so count it.
const hasIntegrationScaffold = (dryRun && integrationCreatedNow) ||
  ['playwright.config.ts', 'global-setup.ts', 'package.json']
    .some((f) => fs.existsSync(path.join(integrationDir, f)));

if (hasIntegrationScaffold) {
  const integrationSrc = path.resolve(__dirname, '..', 'templates', 'integration-scaffold');
  // Scaffold files (relative to integration/) that equal the template once this run ends.
  const integrationCurrent = new Set();
  for (const file of ['playwright.config.ts', 'global-setup.ts']) {
    const dest = path.join(integrationDir, file);
    const key  = `integration-scaffold/${file}`;
    if (!fs.existsSync(dest) || isPristine(dest, key)) {
      reportWrite(forceWrite(dest, fs.readFileSync(path.join(integrationSrc, file), 'utf8')), `integration/${file}`);
      integrationCurrent.add(file);
    } else {
      warnUserOwned(dest, path.join(integrationSrc, file), `integration/${file}`, key);
    }
  }
  upgradeReferenceEnvExample(
    path.join(integrationDir, '.env.example'),
    path.join(integrationSrc, '.env.example'),
    'integration-scaffold/.env.example',
    'integration/.env.example'
  );
  deliverApiGuard(integrationSrc, integrationCurrent);
  reportTraceSafety(integrationDir);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
reportBackups();

console.log('\n--- Results ---');
if (updated.length) {
  console.log('\n  Updated (framework-owned):');
  for (const f of new Set(updated)) console.log(`    [ok] ${path.relative(cwd, f)}`);
}
if (skipped.length) {
  console.log('\n  Skipped (already up to date):');
  for (const f of skipped) console.log(`    - ${path.relative(cwd, f)}`);
}
if (kept.length) {
  console.log('\n  Kept (your content, never overwritten):');
  for (const f of kept) console.log(`    - ${path.relative(cwd, f)}`);
}
if (warnings.length) {
  console.log('\n  Warnings:');
  for (const w of warnings) console.log(`    [!] ${w}`);
}

if (errors.length) {
  for (const e of errors) console.error(`[qa-framework/upgrade] ERROR: ${e}`);
  console.error('[qa-framework/upgrade] Fix qa-framework.config.json (run "qa-framework validate") and run upgrade again.');
  process.exitCode = 1;
}

console.log('\n[qa-framework/upgrade] Done.\n');

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

// Writes `content` unless the file already holds exactly that, and returns what
// happened: 'created', 'updated' or 'unchanged' (a dry run reports what it would do).
function forceWrite(filePath, content) {
  const exists  = fs.existsSync(filePath);
  const changed = !exists || fs.readFileSync(filePath, 'utf8') !== content;
  if (!changed) {
    skipped.push(filePath);
    return 'unchanged';
  }
  if (!dryRun) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
  }
  updated.push(filePath);
  return exists ? 'updated' : 'created';
}

// Writes one rendered agent according to the ownership of the file already on disk.
function upgradeAgent(dest, agent) {
  const label = `.claude/agents/${agent.fileName}`;
  const content = stampGenerated(agent.content);
  if (!fs.existsSync(dest)) {
    reportWrite(forceWrite(dest, content), label);
    return;
  }
  const state = classifyAgentFile(fs.readFileSync(dest, 'utf8'), agent.content);
  if (state === 'pristine') {
    reportWrite(forceWrite(dest, content), label);
    return;
  }
  if (state === 'edited') {
    warnings.push(
      `${label} was edited after it was generated - left untouched, so this release's\n` +
        `    changes to it were NOT applied. Merge them by hand from the template (rendered\n` +
        `    with qa-framework.config.json), or delete the file and run upgrade again:\n` +
        `      node_modules/@keber/qa-framework/templates/agents/${agent.fileName}`
    );
    return;
  }
  // legacy: keep a copy of exactly what is on disk, then regenerate. Agents are rendered
  // from the config, so the triage compares with this release's render (approximate).
  const existing = fs.readFileSync(dest, 'utf8');
  const key = projectKey(dest);
  const backup = backupFile(dest, key);
  if (!backup) return;
  backups.push({
    key,
    backup,
    reason: 'no ownership marker: written before 1.14.0 or by hand',
    result: ownership.triage(null, key, existing, agent.content),
    note: 'agents are rendered from qa-framework.config.json, so the version this file came from cannot be rebuilt',
  });
  reportWrite(forceWrite(dest, content), label);
}

// Project-relative path of `file`, '/' separated: the key of the ownership manifest.
function projectKey(file) {
  return path.relative(cwd, file).split(path.sep).join('/');
}

// Writes a force-written framework file. A file the framework shipped (or one carrying an
// intact generated marker) is overwritten as before; anything else is the project's
// edit, so it is backed up first and listed in the triage report.
function writeOwned(dest, content) {
  if (!fs.existsSync(dest)) return forceWrite(dest, content);
  const key = projectKey(dest);
  const existing = fs.readFileSync(dest, 'utf8');
  const { state, reason } = ownership.classify(ownershipManifest, key, existing, content);
  if (state !== 'edited') return forceWrite(dest, content);
  const backup = backupFile(dest, key);
  if (!backup) return 'unchanged';
  backups.push({
    key,
    backup,
    reason: {
      'marker-mismatch': 'edited after it was generated',
      'hand-written': 'hand-written: no ownership marker and no shipped version matches',
    }[reason] || 'edited: it matches no version the framework shipped',
    result: ownership.triage(ownershipManifest, key, existing, content),
  });
  return forceWrite(dest, content);
}

// The run folder every backup of this upgrade goes to, claimed on first use:
// .claude/qa-framework-backup/upgrade-to-<version>[-runN]/. An existing folder is never
// reused, so no earlier backup can be overwritten.
function claimBackupRunDir() {
  if (backupRunDir) return backupRunDir;
  const root = path.join(cwd, ...ownership.BACKUP_ROOT.split('/'));
  const base = `upgrade-to-${PACKAGE_VERSION}`;
  for (let n = 1; ; n++) {
    const candidate = path.join(root, n === 1 ? base : `${base}-run${n}`);
    if (dryRun) {
      if (!fs.existsSync(candidate)) return (backupRunDir = candidate);
      continue;
    }
    fs.mkdirSync(root, { recursive: true });
    try {
      fs.mkdirSync(candidate);
      return (backupRunDir = candidate);
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }
}

// Copies `dest` into this run's backup folder and returns the backup's project-relative
// path. Returns null, after recording an error, when the copy fails: the caller must then
// leave the file untouched, because overwriting it would lose the project's edit.
function backupFile(dest, key) {
  try {
    const target = path.join(claimBackupRunDir(), ...ownership.backupRelPath(key).split('/'));
    if (!dryRun) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(dest, target, fs.constants.COPYFILE_EXCL);
    }
    return projectKey(target);
  } catch (err) {
    errors.push(`${key} could not be backed up (${err.message}), so it was left untouched.`);
    return null;
  }
}

// Writes the triage report next to the backups and adds one warning listing them.
function reportBackups() {
  if (!backups.length) return;
  const runRel = projectKey(backupRunDir);
  const reportRel = `${runRel}/${ownership.REPORT_NAME}`;
  if (!dryRun) {
    const report = ownership.renderTriageReport({ toVersion: PACKAGE_VERSION, runDir: runRel, entries: backups });
    fs.writeFileSync(path.join(backupRunDir, ownership.REPORT_NAME), report, { encoding: 'utf8', flag: 'wx' });
  }
  const native = (rel) => rel.split('/').join(path.sep);
  warnings.push(
    `${backups.length} framework file(s) had been edited in this project. ` +
      `${dryRun ? 'Each would be saved to' : 'Each was saved to'}\n` +
      `    the path shown, then overwritten with this release's version:\n` +
      backups.map((b) => `      ${native(b.key)} (${b.reason})\n        -> ${native(b.backup)}`).join('\n') +
      `\n    ${dryRun ? 'A triage report would list' : 'Review the lines each one added, and where they belong, in'}:\n` +
      `      ${native(reportRel)}`
  );
}

// Progress line for a forceWrite() result. An unchanged file prints nothing here: the
// Results section lists it under "Skipped (already up to date)".
function reportWrite(status, label) {
  if (status === 'unchanged') return;
  console.log(`  [${status}] ${label}`);
}

function copyDirOwned(srcDir, destDir) {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath  = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      if (!dryRun) fs.mkdirSync(destPath, { recursive: true });
      copyDirOwned(srcPath, destPath);
    } else {
      writeOwned(destPath, fs.readFileSync(srcPath, 'utf8'));
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
    reportWrite(forceWrite(dest, fs.readFileSync(src, 'utf8')), `${label}`);
  } else {
    warnUserOwned(dest, src, label, key);
  }
}

// True when `dest` exists and equals `src` after the same normalisation the pristine
// check uses (BOM and CRLF). This is the only condition under which a file left as it
// is may be reported as "already up to date".
function sameAsTemplate(dest, src) {
  try {
    return scaffoldHash(fs.readFileSync(dest, 'utf8')) === scaffoldHash(fs.readFileSync(src, 'utf8'));
  } catch {
    return false;
  }
}

// sameAsTemplate() for content that is not a template file (an inline standards doc).
function sameContent(dest, content) {
  try {
    return scaffoldHash(fs.readFileSync(dest, 'utf8')) === scaffoldHash(content);
  } catch {
    return false;
  }
}

// Reports a user-owned file (its hash is not one the framework shipped) that upgrade
// leaves untouched. Such a file is NOT up to date: it misses whatever this release
// changed in the template, so say so and point at the template to merge from.
function warnUserOwned(dest, src, label, key) {
  if (sameAsTemplate(dest, src)) {
    skipped.push(dest);
    return;
  }
  warnings.push(
    `${label} is user-owned - left untouched, so this release's changes to it were NOT applied.\n` +
      `    Your version differs from the framework template. Merge the changes by hand from:\n` +
      `      node_modules/@keber/qa-framework/templates/${key}`
  );
}

// Classifies the members of a lane group that was NOT refreshed because `blockers` are
// user-owned. Identical members are up to date; other user-owned ones get their own
// warning; framework copies that are simply outdated are returned as text for the
// group warning, because they are held back by the blockers, not by the user. A member
// that does not exist is covered by the group warning ("NOT installed").
function reportHeldBackGroup(members, blockers) {
  const heldBack = [];
  for (const m of members) {
    if (blockers.includes(m)) continue;
    if (sameAsTemplate(m.dest, m.src)) {
      skipped.push(m.dest);
    } else if (!fs.existsSync(m.dest)) {
      continue;
    } else if (!isPristine(m.dest, m.key)) {
      warnUserOwned(m.dest, m.src, `e2e/${m.rel}`, m.key);
    } else {
      heldBack.push(m);
    }
  }
  if (heldBack.length === 0) return '';
  return (
    `\n    Held back with them (framework copies, not edited by you; they are refreshed by the\n` +
    `    next upgrade once the files above are merged by hand or restored):\n` +
    heldBack.map((m) => `      e2e/${m.rel}`).join('\n')
  );
}

// ---------------------------------------------------------------------------
// API guard set of the integration scaffold (read-only client and write gates, v1.14.0)
//
// The files, their owner and their imports are listed once, in
// scripts/lib/integration-guard-files.js. The rules:
//
//   - Coherence first: a file is delivered only when every scaffold file it imports
//     will be the framework's version after this run. No installed file may import
//     something missing or foreign (fixtures/base.ts without scripts/api-guard.js
//     cannot even load).
//   - fixtures/base.ts decides whose guard this is:
//       absent    first delivery. Installed as ONE group - the three scripts, base.ts
//                 and the three files base.ts imports (catalogs, exclusions) - only
//                 when none of them exists as someone else's file. One foreign member
//                 and nothing of the set is installed: a catalog of unknown shape would
//                 break base.ts, and a foreign script would run under our client.
//       pristine  installed by the framework earlier. Scripts refresh together (they
//                 require() each other) and only when all are pristine; base.ts follows
//                 them. Missing catalogs are reinstalled (base.ts imports them); edited
//                 catalogs and contract are the project's and count as satisfied.
//       user's    the project runs its own client. Nothing that imports base.ts is
//                 installed. The scripts are refreshed in place only when all three
//                 exist and are pristine, as with the lane scripts (base.ts keeps
//                 working: scripts never drop a released export).
//   - 'user' files are installed when missing and never touched once they exist, except
//     a pristine older tests/example.spec.ts (refreshWhenPristine).
// ---------------------------------------------------------------------------
function deliverApiGuard(srcDir, current) {
  const entries = INTEGRATION_GUARD_FILES.map((spec) => {
    const dest = path.join(integrationDir, ...spec.rel.split('/'));
    const src  = path.join(srcDir, ...spec.rel.split('/'));
    const key  = `integration-scaffold/${spec.rel}`;
    let state = 'absent';
    if (fs.existsSync(dest)) {
      state = sameAsTemplate(dest, src) ? 'current' : isPristine(dest, key) ? 'old' : 'user';
    }
    if (state === 'current') current.add(spec.rel);
    return { ...spec, dest, src, key, state, label: `integration/${spec.rel}` };
  });
  const byRel   = new Map(entries.map((e) => [e.rel, e]));
  const base    = byRel.get('fixtures/base.ts');
  const scripts = entries.filter((e) => e.owner === 'framework' && e !== base);
  // The 'user' files base.ts imports: part of the first-delivery group.
  const baseData = base.deps.map((rel) => byRel.get(rel)).filter((e) => e.owner === 'user');
  const dependents = entries.filter((e) => e.owner === 'user' && !baseData.includes(e));

  const install = (e) => {
    reportWrite(forceWrite(e.dest, fs.readFileSync(e.src, 'utf8')), e.label);
    current.add(e.rel);
  };
  // A file this run leaves as it is: identical ones are up to date, the project's own
  // ones are kept. Framework copies held back are named by the caller's warning.
  // A pristine older copy waiting for a refresh is not the project's content: the
  // warnings name it instead.
  const leave = (e) => {
    if (e.state === 'current') skipped.push(e.dest);
    else if (e.owner === 'user' && e.state !== 'absent' && !(e.refreshWhenPristine && e.state === 'old')) {
      kept.push(e.dest);
    }
  };
  const reportStaleExample = () => {
    const example = byRel.get('tests/example.spec.ts');
    if (example.state === 'old' && !current.has(example.rel) && current.has('playwright.config.ts')) {
      warnings.push(
        `integration/tests/example.spec.ts is the pre-1.14 example and was not refreshed. With the\n` +
          `    1.14 playwright.config.ts it fails with "Invalid URL" when QA_BASE_URL is not set,\n` +
          `    instead of stopping with a clear message. Set QA_BASE_URL or delete the example.`
      );
    }
  };
  const template = 'node_modules/@keber/qa-framework/templates/integration-scaffold/';
  const list = (items) => items
    .map((e) => `      ${e.label}${e.owner === 'user' && e.state === 'old' ? ' (its previous version stays)' : ''}`)
    .join('\n');

  // --- the project's own fixtures/base.ts -------------------------------------
  if (base.state === 'user') {
    warnUserOwned(base.dest, base.src, base.label, base.key);
    const scriptsPristine = scripts.every((e) => e.state === 'current' || e.state === 'old');
    for (const e of scripts) {
      if (scriptsPristine && e.state === 'old') install(e);
      else if (e.state === 'user') warnUserOwned(e.dest, e.src, e.label, e.key);
      else leave(e);
    }
    const notInstalled = entries.filter((e) => e !== base && !current.has(e.rel) &&
      (e.state === 'absent' || (e.refreshWhenPristine && e.state === 'old')));
    for (const e of entries) if (e.owner === 'user') leave(e);
    if (notInstalled.length) {
      warnings.push(
        `API guard (read-only client, write gates) NOT installed - integration/fixtures/base.ts is yours.\n` +
          `    These files import base.ts or exist only for it, so they were not added next to\n` +
          `    a client they were not written for:\n` +
          list(notInstalled) +
          `\n    To adopt the guard, merge by hand from:\n      ${template}`
      );
    }
    reportStaleExample();
    return;
  }

  const established = base.state !== 'absent';
  const scriptsUser = scripts.filter((e) => e.state === 'user');

  // --- first delivery: one group, all or nothing --------------------------------
  if (!established) {
    const group = [...scripts, base, ...baseData];
    const blockers = [...scriptsUser, ...baseData.filter((e) => e.state === 'user')];
    if (blockers.length) {
      for (const e of entries) leave(e);
      const notInstalled = entries.filter((e) => !blockers.includes(e) && !current.has(e.rel) &&
        (e.state === 'absent' || (e.refreshWhenPristine && e.state === 'old')));
      warnings.push(
        `API guard (read-only client, write gates) NOT installed - these files are yours:\n` +
          list(blockers) +
          `\n    fixtures/base.ts require()s scripts/api-guard.js and imports the catalogs, and the\n` +
          `    tests import base.ts, so the set is installed all-or-nothing. Your files are left\n` +
          `    untouched. Not installed:\n` +
          list(notInstalled) +
          `\n    To adopt the guard, merge by hand from:\n      ${template}`
      );
      reportStaleExample();
      return;
    }
    for (const e of group) {
      if (e.state === 'absent' || (e.owner === 'framework' && e.state === 'old')) install(e);
      else leave(e);
    }
  } else {
    // --- installed earlier by the framework: refresh -----------------------------
    if (scriptsUser.length === 0) {
      for (const e of [...scripts, base]) {
        if (e.state === 'absent' || e.state === 'old') install(e);
        else leave(e);
      }
    } else {
      const heldBack = [...scripts, base].filter((e) => e.state === 'old' || e.state === 'absent');
      for (const e of [...scripts, base]) leave(e);
      warnings.push(
        `API guard scripts NOT refreshed - user-owned:\n` +
          list(scriptsUser) +
          `\n    The scripts require() each other and fixtures/base.ts requires them, so they are\n` +
          `    refreshed together or not at all. Yours are left untouched.` +
          (heldBack.length
            ? `\n    Held back with them (framework copies or missing files, refreshed by the next\n` +
              `    upgrade once the files above are merged by hand or restored):\n` + list(heldBack)
            : '') +
          `\n    Merge the framework's changes by hand from:\n      ${template}scripts/`
      );
    }
    // base.ts exists and imports these: a missing one is restored, an edited one is the
    // project's catalog and stays.
    for (const e of baseData) {
      if (e.state === 'absent') install(e);
      else leave(e);
    }
  }

  // --- contract and tests: the project's from day one -------------------------
  // A dep is satisfied when it will equal the template, or when it is a 'user' file the
  // framework installed (pristine, or anything once the guard is established: the
  // catalogs and contract are meant to be edited, and base.ts relies on the same names).
  const satisfied = (rel) => {
    if (current.has(rel)) return true;
    const dep = byRel.get(rel);
    if (!dep || dep.owner !== 'user' || dep.state === 'absent') return false;
    return established || dep.state === 'old';
  };
  const notDelivered = [];
  for (const e of dependents) {
    const missing = e.deps.filter((rel) => !satisfied(rel));
    const wanted = e.state === 'absent' || (e.refreshWhenPristine && e.state === 'old');
    if (!wanted) {
      leave(e);
    } else if (missing.length === 0) {
      install(e);
    } else {
      const stays = e.state === 'old' ? '; its previous version stays' : '';
      notDelivered.push(`      ${e.label} (needs ${missing.join(', ')}${stays})`);
    }
  }
  if (notDelivered.length) {
    warnings.push(
      `API guard files NOT installed in integration/ - what they import is missing or yours:\n` +
        notDelivered.join('\n') +
        `\n    None of them was written. Merge by hand from:\n      ${template}`
    );
  }

  reportStaleExample();

  // npm run test:write lives in package.json, which upgrade never edits.
  const runner = byRel.get('scripts/run-write-tests.js');
  const pkgPath = path.join(integrationDir, 'package.json');
  if ((current.has(runner.rel) || runner.state !== 'absent') && fs.existsSync(pkgPath)) {
    let hasScript = false;
    try {
      hasScript = Boolean(JSON.parse(fs.readFileSync(pkgPath, 'utf8')).scripts?.['test:write']);
    } catch {
      hasScript = /"test:write"\s*:/.test(fs.readFileSync(pkgPath, 'utf8'));
    }
    if (!hasScript) {
      warnings.push(
        `integration/package.json has no "test:write" script, so write runs cannot start\n` +
          `    (\`npm test\` never writes). Add it to "scripts" by hand:\n` +
          `      "test:write": "node scripts/run-write-tests.js"`
      );
    }
  }
}

// C5 - login only in global setup. Returns "file:line" of every loginAs( call in a
// spec under tests/, except *.login.spec.ts, which the opt-in 'login-flow' project runs
// with trace, video and screenshot off. Report only, never patched.
function findInTestLogins(testsDir) {
  const found = [];
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
      } else if (/\.ts$/.test(entry.name) && !/\.login\.spec\.ts$/.test(entry.name)) {
        fs.readFileSync(full, 'utf8').split(/\r?\n/).forEach((line, i) => {
          if (/\bloginAs\s*\(/.test(line)) found.push(`${path.relative(cwd, full)}:${i + 1}`);
        });
      }
    }
  })(testsDir);
  return found;
}

function reportInTestLogins(found) {
  if (!found.length) return;
  warnings.push(
    `Login safety: these tests log in inside the test, so with trace/video/screenshot\n` +
      `    'retain-on-failure' a failed run stores the typed credentials and the login\n` +
      `    request in its artifacts. Start them from the storageState that global-setup.ts\n` +
      `    saves (one lane per role); a test of the login flow itself goes in a\n` +
      `    *.login.spec.ts file, run by the opt-in 'login-flow' project\n` +
      `    (.github/skills/qa-automation/references/session-and-opt-in-projects.md):\n` +
      found.map((f) => `      ${f}`).join('\n')
  );
}

// C8 - specs under tests/ whose name already ends in an opt-in suffix. The current
// config runs them only in an opt-in project, never in the default suite.
function findOptInSuffixSpecs(testsDir) {
  const found = [];
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
      if (entry.isDirectory()) walk(full);
      else if (/\.(login|writes|slow)\.spec\.ts$/.test(entry.name)) found.push(path.relative(cwd, full));
    }
  })(testsDir);
  return found.sort();
}

function optInSuffixWarning(files, extra) {
  return (
    `e2e/playwright.config.ts NOT refreshed: these existing specs already use an opt-in suffix:\n` +
    files.map((f) => `      ${f}`).join('\n') +
    `\n    The new config moves *.login.spec.ts, *.writes.spec.ts and *.slow.spec.ts out of the\n` +
    `    default suite (\`npm test\`) into the opt-in projects login-flow, writes and slow, so\n` +
    `    these files would silently stop running by default. A *.writes.spec.ts would run in\n` +
    `    the writes project, which requires qa/00-standards/write-safety-policy.md.\n` +
    `    Either rename them (any other suffix keeps them in the default suite) and run\n` +
    `    upgrade again, or accept the move by copying the config by hand from:\n` +
    `      node_modules/@keber/qa-framework/templates/automation-scaffold/playwright.config.ts` +
    extra
  );
}

// C8 - opt-in projects. npm run test:<name> lives in package.json, which upgrade never
// edits. Only meaningful when the project's config is the framework's current one: a
// user-owned config declares no opt-in projects, so the scripts would select nothing.
function reportOptInScripts(pkgPath, configCurrent) {
  // The names of OPT_IN_PROJECTS in templates/automation-scaffold/playwright.config.ts.
  const OPT_IN_SCRIPTS = ['login-flow', 'writes', 'slow'];
  if (!configCurrent || !fs.existsSync(pkgPath)) return;
  let scripts = {};
  try {
    scripts = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).scripts || {};
  } catch {
    return; // an unreadable package.json is reported elsewhere, not guessed at here
  }
  const missing = OPT_IN_SCRIPTS.filter((name) => !scripts[`test:${name}`]);
  if (!missing.length) return;
  warnings.push(
    `e2e/package.json has no script for these opt-in Playwright projects, which\n` +
      `    \`npm test\` never runs. Add them to "scripts" by hand (shell-free, the same on\n` +
      `    Windows and Linux):\n` +
      missing.map((name) => `      "test:${name}": "node scripts/run-opt-in.js ${name}"`).join(',\n')
  );
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
