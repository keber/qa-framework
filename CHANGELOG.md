# Changelog

All notable changes to `qa-framework` will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added

- **ADO work item full-content read protocol (`qa-ado-integration`).** New reference
  `skills/qa-ado-integration/references/ado-workitem-full-read-protocol.md`, linked from
  the skill as a BLOCKING read rule: before classifying, scoping or concluding anything
  about a Task, Bug, Issue or User Story, read Type, Title, State and Reason, the full
  content fields, every embedded image, all comments and the parent/child hierarchy.
  Three consumer projects had written this protocol separately after verdicts reached
  from titles alone proved wrong. The contract is tool-agnostic; a PowerShell example
  (depending on the separate `@keber/ado-powershell` package) and the equivalent REST
  calls are given as one way to apply it.
- **Rule 11 now ships both halves (`qa-framework.instructions.md` and `qa-framework.rules.md`).**
  The rule only listed forbidden characters, so agents read it as "produce ASCII" and wrote
  accent-free Spanish - a 98-99% incidence measured in four consumer projects, which each
  patched it locally. Rule 11 (same number and title) now also requires content in the
  project language (`conventions.language`) to be written correctly with its accents and
  signs, says both halves travel together when the rule is restated for a sub-agent, skill,
  agent definition or rubric, and defines verification as running
  `check-forbidden-chars.js` and `check-spanish-accents.js` from
  `node_modules/@keber/qa-framework/scripts/` and reporting their output. Guarded by
  `test/rule-11.test.js`.

- **Lane lock rule for Claude Code projects (`.claude/rules/qa-framework.md`).** Claude
  Code does not read `.github/instructions/`, and the rules file it does read did not
  mention lanes, so Claude Code projects got the stale-lane sweep with no rule saying who
  keeps a lane alive - the setup of the 2026-08-22 incident. `templates/qa-framework.rules.md`
  now carries rule 12 (same number and title as in `qa-framework.instructions.md`) and a
  "Lane lock - Claude Code dispatcher protocol" section implementing
  `docs/decisions/lane-heartbeat-caller.md`: the dispatcher runs a background heartbeat
  pump (holder check, `heartbeat` every `min(5 min, QA_LANE_STALE_MINUTES / 4)`, ~20 min
  lease), renews it only while the worker's output grows, stops a worker that went
  silent for two leases before releasing, and always releases on completion. It also
  defines how to verify a held lane, how to clear an orphaned one, and what travels in a
  worker prompt (the worker is never made responsible for liveness). It does not use
  `TaskOutput`, which consumer projects' local rules still name and Claude Code removed in
  v2.1.277. `upgrade` overwrites the file, so existing projects receive it. Guarded by
  `test/claude-rules.test.js`.

### Changed

- **Encoding policy is per file type.** The formatting rules of
  `qa-framework.instructions.md` and `qa-framework.rules.md` said UTF-8 without BOM for
  everything. `.ps1` files now require UTF-8 WITH BOM, because Windows PowerShell 5.1
  reads a BOM-less script with the ANSI codepage and corrupts every accented literal;
  every other file stays without BOM. PowerShell request bodies must be sent as
  `[Text.Encoding]::UTF8.GetBytes($json)`, never a raw string. The published `.ps1`
  files gained the BOM (no other byte changed) and `test/bom-policy.test.js` guards
  the policy over everything `npm pack` ships.
- **Scaffold `playwright.config.ts` no longer needs credentials at load time.**
  `QA_BASE_URL` from the environment wins; when it is missing the base URL comes from
  `project.qaBaseUrl` in `qa/qa-framework.config.json`, and with neither the config
  fails with a clear message. Requiring `QA_USER_EMAIL` and `QA_USER_PASSWORD` while
  loading the config broke the parallel-lane model: a lane that is not logging in
  should not need credentials. A missing credential now fails in `global-setup.ts`
  when that lane logs in, naming the variable, never its value.

### Fixed

- **Published files violated rule 11.** `test/rule-11.test.js` now runs the forbidden-character
  check over every file in the real `npm pack` list, so a template, skill or doc can no
  longer ship with an em-dash again (1.10.0 shipped `qa-framework.instructions.md` with
  em-dashes). The only published file still in violation was `CHANGELOG.md` (90
  occurrences in pre-1.12 entries: em-dashes, one en-dash, arrows), now ASCII.
- **Installed rules always show the installed package version.** `init` and `upgrade`
  stamped `v{{VERSION}}` in `.github/instructions/qa-framework.instructions.md` and
  `.claude/rules/qa-framework.md` (and `v{VERSION}` in `qa/README.md`) from the
  consumer's `frameworkVersion`, a copy written once at scaffold time that nothing
  updates. After `npm update` plus `upgrade`, both files kept the original version. They
  now take the version from the package's own `package.json`. The consumer config is
  still never rewritten.
- **`lane-lock.js` `heartbeat` and `release` can check the holder.** After a sweep and a
  re-acquisition by someone else, a late `heartbeat` from the previous owner kept the new
  holder's lane alive and a late `release` freed it under them. Both now accept an
  optional `request_id` (`heartbeat <lane> [request_id]`, `release <lane> [request_id]`):
  on a mismatch they exit 1 and leave the state untouched. Without it they work as
  before and print a warning on stderr (exit code unchanged), so existing callers do not
  break. `force-release` is unchanged. The Claude Code dispatcher protocol now passes the
  `request_id` to both verbs.
- **`upgrade` refreshes the framework's own lane scripts again.** Two defects made every
  lane script installed by v1.12.0 to v1.13.2 undeliverable as soon as a template
  changed:
  - `SHIPPED_SCAFFOLD_HASHES` stopped at v1.11.3. All twelve entries lacked their
    v1.12.0 hash (the three lane scripts had an empty list), and
    `automation-scaffold/playwright.config.ts` also lacked v1.0.1 to v1.6.1. Pristine
    copies were classified as user code. The table now holds every released hash, and
    a test fails until the current template's hash is appended, so it cannot go stale
    again.
  - The lane scripts were refreshed only together with `playwright.config.ts` and
    `global-setup.ts`, which almost every project edits. That all-or-nothing rule now
    applies to the installation only (v1.11 -> v1.12). Once the three scripts exist,
    they are refreshed together whenever all three are pristine, and a user-owned
    config or global-setup is kept. A second test pins that no released script export
    is ever removed, since those host files `require()` the scripts.
  Hand-written or edited lane scripts are still never touched and are now reported as
  "Lane scripts NOT refreshed - user-owned".

- **`upgrade` moves a path only with positive evidence that it is a framework leftover.**
  The field report against v1.12.0 (`lib/` and `node_modules/` moved into `e2e/tests/`,
  flat plans moved to `sprints/legacy/`) no longer reproduces since 1.13.2, and is now
  pinned by regression tests built from real consumer layouts. The same guessing pattern
  survived in three other places and is closed here:
  - `e2e/{folder}/` holding `*.spec.*` files was moved into `tests/` even in projects
    already on `testDir: './tests'` (e.g. `temp/`, `archive/` kept outside the suite on
    purpose). It is now moved only while `playwright.config.ts` still has the v1.5.x
    `testDir: '.'`; otherwise it stays and is reported.
  - `07-automation/{playwright.config.ts,global-setup.ts,package.json,.env.example,package-lock.json}`
    and `07-automation/fixtures/` were moved into `e2e/` whenever the target was missing,
    which also caught a user's workspace `package.json` or shared `fixtures/`. They now
    move only when `07-automation/playwright.config.ts` (the v1.5.x location) exists.
  - `02-test-plans/automated/` and `02-test-plans/manual/` were moved to
    `sprints/legacy-*/` by name alone. They now move only when they hold at least one
    pre-v1.7.0 plan (`*-test-plan.md` or the `**Plan ID**: TP-` header).
  Anything left in place is listed under Warnings so the user can decide.

---

## [1.13.2] - 2026-11-06

### Fixed

- **`upgrade` no longer moves user-owned content during the legacy layout migrations.**
  Section 5c used to move every unknown folder under `07-automation/e2e/` into `tests/`
  (including `lib/`, `node_modules/`, `.auth/` and `test-results/`). It now moves a folder
  only when it contains `*.spec.*` files and is not a tooling folder (`node_modules`, `lib`,
  `test-results`, `playwright-report`, `blob-report`) or a dot-folder. Section 6 used to move
  every flat `.md` in `02-test-plans/` to `sprints/legacy/`; it now moves only pre-v1.7.0
  plans: files named `*-test-plan.md` or carrying the old `**Plan ID**: TP-` header.
  A path that cannot be read is reported as a warning and left alone: unproven means
  untouched.

---

## [1.13.1] - 2026-11-06

### Fixed

- **`package.json`** - `docs/visuals/` no longer ships to npm. The `files` allow list
  carried a blanket `docs/` entry, so the 25 presentation images added in `f1064e1`
  started being published without anyone deciding to: the tarball went from 410 KB
  unpacked in 1.11.3 to 51.8 MB in 1.12.0, and every `npm install` has paid for it
  since. The entry is now `docs/**/*.md`, which keeps all eight documents - including
  `docs/folder-structure-guide.md` and `docs/spec-driven-philosophy.md`, both named in
  text that `scripts/` writes into consuming projects - and drops the images. The
  images stay in the repository; they are reference material, not runtime content.
  Unpacked size: 51.8 MB -> 630 KB. Exactly the 25 images leave the package and
  nothing else moves.
- **`package.json`** - removed `agent-instructions/` from `files`. The directory does
  not exist, so the entry had been matching nothing.

---

## [1.13.0] - 2026-11-04

Dated by its release, not by its bump. `package.json` was moved to `1.13.0` on 2026-10-16,
but the version was never tagged or published, so everything below ships together under
this number. The infrastructure fixes listed in Added and Fixed were written later, on the
branch that unblocked this release.

### Added

- `templates/agents/qa-reporte-ejecucion.md` - new Claude Code agent that exports the ADO
  test plan results, versions the raw export under `ado-export-<YYYY-MM-DD>/` and writes the
  sprint `Reporte-de-Ejecucion-de-Pruebas-<project>-Sprint-<N>.md` (summary with executed,
  success and coverage metrics, plus promoted findings).
- `templates/agents/qa-investigador.md` - new Claude Code agent that investigates one root
  cause against the real environment. Its tools are generated from `parallelLanes`: each lane
  with an `mcpNamespace` adds 15 Playwright MCP browser tools, a lane table and the mandatory
  heartbeat protocol; with no MCP lane it gets a no-browser section instead.
- Agent template engine: `{{#if FLAG}}` / `{{#unless FLAG}}` blocks, single-pass placeholder
  replacement and a guard that fails on any unresolved `{{...}}` token.
- New placeholders: `INVESTIGATOR_TOOLS`, `LANE_MCP_TABLE`, `APPROVAL_THRESHOLD_PERCENT`,
  `APPROVAL_THRESHOLD_RATIO`, `DECIMAL_SEPARATOR`, `TC_ID_PATTERN`, `QA_BASE_URL`,
  `LOGIN_PATH`, `TECH_STACK`.
- Config keys: `integrations.azureDevOps.sprintCycle.approvalThresholdPercent` (default 85),
  optional `conventions.decimalSeparator` and `conventions.defectIdPrefix`. Documented in
  `qa-framework.config.schema.json`, together with the `mcpNamespace` pattern.
- `qa-framework validate` checks present-but-invalid values of those keys and of
  `parallelLanes`, and now finds the config under `qa/` as well as at the project root.
- **`scripts/lib/module-keys.js`** - single source of truth for how a module key maps
  to a spec folder (prefixed) and to an automation folder (bare). Shared by `init.js`
  and `validate.js` so the two cannot drift apart again.
- **`scripts/sync-version.js`** - now also rewrites `frameworkVersion` in
  `qa-framework.config.json`, by field rather than by the loose `vX.Y.Z` prose pattern.
- **`test/module-keys.test.js`, `test/sync-version.test.js`** - unit coverage for the
  key helpers plus a drift guard that fails CI whenever a published version surface
  disagrees with `package.json`.
- **`.github/workflows/publish.yml`** - the suite now runs before `npm publish`.
  `ci.yml` triggers on pushes to `main` and on pull requests, so it never sees a tag,
  and publishing is triggered by a tag push: nothing was verified on the path that
  actually reaches npm. The drift guard above only protects a release once it runs
  there.

### Changed

- `init` and `upgrade` generate six agents (was four) when `sprintCycle.enabled` is true.
  Agents are rendered independently: an invalid lane config fails `qa-investigador` only,
  the other five are still written and the command exits 1.
- As npm postinstall (`init --skip-if-exists`), an agent that cannot be rendered is reported
  as a WARNING naming the agent and asking to fix the config and run
  `npx qa-framework upgrade`; postinstall exits 0 so `npm install` does not fail. Explicit
  `init` and `upgrade` keep exit code 1.
- `qa-informe-resultados` reads its approval threshold from config instead of a hardcoded
  85% and states the decimal separator rule.

### Fixed

- `qa-informe-resultados` looked for `Reporte-de-Ejecucion-de-Pruebas-...` and pointed to the
  `qa-ado-integration` skill, which does not produce that file. It now names the
  `qa-reporte-ejecucion` agent, the canonical filename (active and historical sprint folders)
  and accepts the older `Reporte-ejecución-de-pruebas-*` files.
- `templates/qa-framework.instructions.md` and `templates/qa-framework.rules.md` carried a
  project-specific `DEF-SIS-NNN` example; it is now `DEF-{PREFIX}-NNN`.
- **`scripts/init.js`** - module spec folders are now scaffolded as
  `qa/01-specifications/module-{name}/submodule-{name}/`, the layout declared by every
  skill, by `docs/folder-structure-guide.md` and by the `specPath` field of
  `qa-framework.config.json`. init.js wrote the bare key, so a freshly scaffolded
  project violated the spec-path convention its own agent instructions impose.
  Prefixing is idempotent: a config whose key already reads `module-suppliers` is not
  turned into `module-module-suppliers`.
- **`scripts/init.js`** - automation stubs and test case ids keep using the **bare**
  key (`e2e/tests/suppliers/create.spec.ts`, `TC-SUPPLIERS-CREATE-001`), matching the
  `automationPath` field and the live consuming projects. Only the spec tree is
  prefixed.
- **`scripts/validate.js`** - `--strict` strips the `module-` / `submodule-` prefix
  before deriving the automation path. It was pointing the warning at
  `e2e/tests/module-{name}/`, a folder no project has ever created.
- **`qa-framework.config.json`** - `frameworkVersion` was stuck at `1.10.0` while the
  package shipped `1.12.0`. The file is published and is the template copied into every
  consuming project, where the value is injected into `{{VERSION}}` of the generated
  agent instructions, so every fresh install since 1.11.0 reported the wrong version.
- **`package.json`** - the npm `version` lifecycle script now also stages
  `qa-framework.config.json`. sync-version.js rewrites it, but the staging list did not
  include it, so the release commit and its tag would have carried the OLD
  frameworkVersion - and the publish workflow builds from a clean checkout of that tag,
  reintroducing the exact drift this change set out to fix.
- **`test/sync-version.test.js`** - two tests compared files against their starting bytes,
  which assumed the tree was already synced. On a drifted tree one of them ran
  `sync-version` and left `qa-framework.config.json` rewritten: the first run failed, the
  retry passed, and the drift vanished from the working tree unnoticed. A suite that edits
  tracked files turns a red run green on the retry and hides what it exists to catch.
- **`test/init.test.js`** - the agent summary assertion matched only the forward-slash form
  of `.claude/agents/` and took the first matching line. `init.js` prints those lines
  through `path.relative`, so on Windows the per-file `[created]` lines never matched and it
  landed on the summary line, while on Linux it landed on the first `[created]` line. The
  test passed locally and failed the first time it ran on CI.

---

## [1.12.0] - 2026-09-08

Reconstructed from `4fe32fb..f52257a` (39 commits). Minor rather than major: a project
with no `parallelLanes` block behaves exactly as before, `PENDING-BROWSER` adds an enum
value without removing any, and the spec-path change affects what `init` generates from
then on, not what already exists. The one user-visible break is `engines` moving from
`>=18` to `>=20`.

### Added

- **`parallelLanes` lane table** - `qa-framework.config.json` gains a lane block and
  `qa-framework.config.schema.json` is published alongside it. A lane is four coupled
  values (account env prefix, `storageState`, MCP namespace, runner project), none of
  which can be inferred from the others, plus per-lane capabilities: a project can have
  six accounts but only three MCP servers. A project with no block, or `enabled: false`,
  resolves a single implicit default lane.
- **`templates/automation-scaffold/scripts/lane-lock.js`** - config-driven lane lock
  ported from the reference implementation. `acquire` (random free lane, queues) and
  `reserve` (exact lane, no queue, throws when busy) stay two separate verbs; staleness
  is a composite predicate (past the threshold AND no recent heartbeat); the lock
  directory resolves by shell > `.env` > per-checkout precedence and the resolved path
  and its source are reported on stderr. Reads `.env` with `dotenv.parse()`, never
  `config()`, so a script whose only job is choosing a directory never gains ambient
  access to the QA account passwords in the same file.
- **`templates/automation-scaffold/scripts/global-setup-guards.js`** - `global-setup`
  performs the only login, so it is the last point at which a run about to drive an
  account it does not hold can be stopped. `assertColdSetupIsIntentional` throws before
  any login when neither `QA_LANE_ONLY` nor `QA_COLD_SETUP=1` is set, since a cold setup
  re-logs in every lane and invalidates other running sessions; `assertLaneIsLocked`
  verifies outside CI that the lane is held; `assertProjectsMatchLane` catches a
  `--project` whose `storageState` points at a different lane than the one reserved.
  Plain CommonJS so it is testable with `node --test` without adding `ts-node`.
- **`templates/automation-scaffold/scripts/lane-config.js`** - lane table resolver shared
  by the config and the guards.
- **`templates/qa-framework.rules.md`** plus **`templates/agents/`** - four agent
  templates (`qa-analisis.md`, `qa-asesoria.md`, `qa-plan.md`,
  `qa-informe-resultados.md`) for analysis, sprint advisory, test planning and ADO result
  reporting, deployed through `scripts/lib/claude-agents.js` and
  `scripts/lib/claude-commands.js`.
- **`scripts/check-forbidden-chars.js`** (`npm run check-chars`) - enforces the BLOCKING
  character-safety rule the package stated but never checked. Flags em-dash, en-dash,
  ellipsis, smart quotes and arrows; leaves Latin Extended and emoji alone. Reports
  `file:line:column` with the code point and its ASCII replacement.
- **`scripts/check-spanish-accents.js`** (`npm run check-accents`) - language-aware accent
  gate for Markdown. Classification is the hard part, not detection: it measures the
  density of Spanish function words in prose only, after stripping fenced code, inline
  code, link targets, tags, placeholders and paths. Against this package's corpus English
  lands at 0.000-0.001 and Spanish templates at 0.125-0.165, with the threshold at 0.07;
  a test asserts the gap stays wide.
- **`scripts/sync-version.js`** - wired into the `npm version` lifecycle to keep
  `README.md` and `.github/copilot-instructions.md` aligned with `package.json`.
- **Test suite and CI** - black-box tests for `cli.js`, `init.js`, `validate.js`,
  `upgrade.js`, the lane scripts and both character gates, using Node's built-in runner
  with no new devDependency, plus `.github/workflows/ci.yml`.
- **`scripts/upgrade.js` section 9** - carries the v1.12.0 scaffold into existing
  projects. `upgrade` force-copied only `.github/skills/`, `copilot-instructions.md` and
  `QA-STRUCTURE-GUIDE.md`, so everything this release changed under `templates/` reached
  new projects through `init.js` alone and existing installations kept the old scaffold,
  including the login that types the password with `fill()`. The rule is per file:
  overwrite what is framework-owned, warn and continue where overwriting would destroy
  working user code, and treat a dependency group as all-or-nothing, since
  `playwright.config.ts` and `global-setup.ts` both `require()` the lane scripts and a
  partial install leaves a project that cannot start Playwright. Baseline detection is
  content-hash based, not `frameworkVersion` based: the recorded values in live projects
  were `1.10.0`, `1.1.3`, `1.1.3` and `1.0.0`, two of them malformed. Files left
  user-owned are scanned for `.fill(password)` and reported with file and line, without a
  textual patch.
- **`PENDING-BROWSER`** - fourth value in the TC Origin vocabulary, for an element
  observed and confirmed to exist whose behavior could not be exercised end to end.
  Without it agents either overclaim with `UI-OBSERVED` or misuse `PENDING-CODE`, which
  pollutes gap tracking downstream.
- **Known-issues lookup before defect creation** - nothing required checking whether a
  defect had already been filed. The gate distinguishes the two outcomes that matter: an
  open match is referenced instead of refiled, a closed match is filed as a regression.
  `templates/defect-report.md` gains the section that records the search.
- **Stage 5 gates** - `tsc --noEmit` plus a single smoke run of a newly written spec
  before the submodule is marked complete. Both run before the completion checklist; a
  full green suite remains Stage 5b's job.
- **Closing measurement for doc-generating stages** - the four skills that write Markdown
  now end on evidence (accent count, forbidden characters, BOM) rather than a compliance
  claim, with the language boundary stated so English artifacts are not asked for accents
  they should not have.
- **`skills/qa-automation/references/pom-template.md`** - page-object template taken from
  real project use: an abstract per-module CRUD base plus thin per-submodule classes,
  with the accent-insensitive label matching that pattern needs against Spanish UIs.
- **`MIGRATION-NOTES.md`**, **`docs/decisions/lane-heartbeat-caller.md`** and
  **`docs/visuals/`** - embedded-QA migration guidance, the record that the dispatcher
  (not the executor) calls heartbeat, and the diagrams referenced from the architecture
  docs.

### Changed

- **`engines`** - `>=18` becomes `>=20`, and CI tests Node 20, 22 and 24. The matrix had
  been testing 18 and 20, both out of maintenance, while `publish.yml` released on 24,
  which no job tested. Users on 18 now get an npm warning, which is the point.
- **`templates/*/playwright.config.ts`** - both configs called `dotenv.config()`, which
  injects the entire `.env` into `process.env`. In a real project that file holds every QA
  account password plus ADO tokens (82 lines in one case) while these configs need a
  handful of non-secret values. They now read an explicit key list with `dotenv.parse()`,
  which returns a plain object and never touches `process.env`, and only fill keys the
  environment has not already set, so shell and CI variables still win.
- **`templates/automation-scaffold/playwright.config.ts`** - runner projects and auth are
  generated from the lane table, replacing the commented-out
  `chromium-user1` / `chromium-user2` block that sat outside the `projects` array and
  could not have worked as written. `storageState` is derived through lane-lock rather
  than hardcoded: a parallel hardcoded mapping caused real evidence corruption once, a run
  recorded under the wrong account because the project was pinned to one lane while
  `QA_LANE_ONLY` named another.
- **`global-setup.ts`** - `resolveAuthUsers` resolved lanes by substring
  (`storageState.includes('user-2')`, which also matches `user-20`) and had no branch for
  a third lane. It now matches the lane table exactly and reads credentials from each
  lane's declared account prefix.
- **Agent behavior rules** - a BLOCKING lane-lock rule states the requirement only
  (acquire before dispatching, release when done, dispatcher keeps the lane alive, queue
  or reject at the cap, never force past it), agent-agnostic so each agent's adaptation
  prescribes its own mechanism.
- **`qa-test-plan` / `qa-test-cases`** - skill content consolidated into the templates;
  `priority-and-feasibility.md` merged into `plan-de-pruebas-template.md`.
- **Typographic characters** - em-dashes, en-dashes, arrows, smart quotes and ellipses
  replaced with ASCII across `scripts/`, `skills/`, `templates/`, `docs/`, `examples/`,
  `integrations/` and the PowerShell scripts. Substitution is context-sensitive: padded
  prose dashes become ` - `, numeric and label ranges keep a tight hyphen, standalone
  table cells become a bare `-`, and ASCII rules keep their original column width.
  `CHANGELOG.md` keeps its historical occurrences deliberately - rewriting past entries to
  satisfy a rule adopted later would falsify the log.

### Fixed

- **`scripts/init.js`** - module specs are scaffolded under
  `qa/01-specifications/{module}/{submodule}/`. init wrote them to `qa/{module}/`, leaving
  `01-specifications/` permanently empty while scattering specs as siblings of the
  numbered folders. The existing tests ran with no config, so the module loop iterated
  zero times and no spec path was ever asserted.
- **`scripts/validate.js`** - check 2 walked all of `qa/`, treating every top-level
  directory as a module, so it read `01-specifications/` as the module and demanded the 6
  spec files one level above where they exist. The scan is now rooted at
  `01-specifications/`, which also stops sibling folders such as `02-test-plans/` and
  `memory/` from being mistaken for submodules; the `SKIP_DIRS` denylist is removed rather
  than extended.
- **`scripts/validate.js`** - `--strict` looked for automation specs at
  `e2e/{module}/{submodule}.spec.ts`, a path nothing creates. `init.js` writes to
  `e2e/tests/{module}/` and `upgrade.js` documents the v1.6.0 migration that moved them
  there, so `--strict` emitted a permanently false warning for every submodule in all
  three live projects.
- **`scripts/validate.js`** - stopped requiring `05-test-plans`, a stale name from an
  older convention; the current structure uses `05-test-execution` with test plans under
  `02-test-plans`.
- **`templates/*/fixtures` and both scaffolds** - the four remaining `fill(password)` call
  sites are listed under Security below.
- **`templates/agents/`** - the four Spanish-language agent templates shipped entirely
  accent-stripped (144, 190, 88 and 52 Spanish markers, 0 to 2 accented characters between
  them). This is functional, not cosmetic: page objects locate fields by visible label, so
  a spec written as `Codigo` never matches a UI rendering the accented form. In one
  project that cost 24 of 39 failing smoke tests and two wrong mitigations before the
  cause was found.
- **`templates/defect-report.md`** - the defect ID prefix is a placeholder. The template
  hardcoded `DEF-{{NNN}}` while `defectIdPattern` carried `DEF-{NUM}`, and real projects
  use a project prefix such as `DEF-SIS-014`.
- **`templates/qa-framework.instructions.md` and `qa-framework.rules.md`** - referenced
  `integrations.ado.enabled`, a config path that never existed. The real schema is
  `integrations.azureDevOps.enabled`.
- **`skills/qa-spec-generation`** - pointed at `references/spec-file-formats.md`, which
  only exists under `qa-module-analysis/references/`, so Stage 2 could not find the
  template it is told to use. `skills/qa-automation` referenced a `pom-template.md` that
  did not exist.
- **`qa-test-stabilization`** - the official suite is the only source of truth. A polling
  diagnostic script saw a toast 4 of 4 times while the official suite saw none, 6 of 6
  across two independent runs, and the defect had already been closed on that standalone
  evidence. Standalone output is now diagnostic input, never a verdict.
- **`templates/*/.env.example`** - both files carried a UTF-8 BOM and three em-dashes. A
  BOM in a `.env` is not cosmetic: some parsers read the first key as `﻿QA_BASE_URL`
  and silently fail to find it, and these files ship to every consuming project as the
  template developers copy to `.env`. The character gate's extension list gains
  `.example` and `.ps1`, both previous blind spots.
- **CI** - the test script used `test/**/*.test.js`, which needs globstar the runner's
  shell does not enable, and the follow-up fix kept the pattern quoted so node received a
  literal path. The validate step ran against this repository's own gitignored `qa/`
  directory and failed with four missing-folder errors; it now scaffolds a throwaway
  project and validates that, which exercises the contract that actually matters - what
  `init.js` generates must pass `validate.js`.

### Security

- **Password no longer reaches Playwright traces.** Both scaffolds typed the QA password
  with `locator().fill(password)`, and the automation scaffold ships `trace` and `video`
  set to `retain-on-failure`, so any failed CI run persisted an artifact containing the
  plaintext password. All four call sites - `global-setup.ts` in both scaffolds,
  `fixtures/base.ts` (TTL-aware reauth) and `fixtures/auth.ts` (`loginAs`) - now set the
  value through `page.evaluate()`, the mechanism this package already documented as
  "Pattern 7: Password Injection (Trace Safety)". The fixture sites carried more exposure
  than `global-setup`, which runs once per run, since reauth runs for every test past the
  TTL and `loginAs` for every test that logs in as a role. Bubbling `input` and `change`
  events are dispatched after the assignment because a bare `.value` write does not notify
  the Blazor/Radzen-style frameworks these scaffolds target, and an explicit visible
  `waitFor` replaces the auto-wait `fill()` provided. Email `fill()` calls are left in
  place: emails are not secret and aid debugging. There are no remaining
  `fill(password)` call sites in `templates/`.
- **`.env` is no longer loaded wholesale** by the Playwright configs or the lane lock. See
  Changed above.

---

## [1.11.3] - 2026-06-24

Reconstructed from `5507f1a..4fe32fb`. Release plumbing only.

### Changed

- **`.github/workflows/publish.yml`** - `actions/checkout` and `actions/setup-node` move
  from v4 to v6, and the publish job's Node version from 20 to 24.

### Removed

- **`NODE_AUTH_TOKEN` / `secrets.NPM_TOKEN`** from the publish step, completing the move
  to npm trusted publishing begun in 1.11.1: the job now authenticates with the
  short-lived OIDC token the `id-token: write` permission grants, so no long-lived npm
  token is stored in the repository.

No package content changed. Nothing reached consuming projects.

---

## [1.11.2] - 2026-06-24

Version bump only - a republish of 1.11.1 after a failed publish run. No source,
template, skill or script change; the diff is `package.json` and `package-lock.json`.

---

## [1.11.1] - 2026-06-24

Reconstructed from `3a29617..59f6fe0`. Release plumbing only.

### Added

- **`.github/workflows/publish.yml`** - `id-token: write` permission on the publish job,
  the prerequisite for npm trusted publishing. The long-lived token it replaces is dropped in
  1.11.3.

No package content changed. Nothing reached consuming projects.

---

## [1.11.0] - 2026-06-24

### Added

- **`templates/automation-scaffold/fixtures/base.ts`** - new fixture with TTL-aware session
  refresh. Replaces the plain `@playwright/test` import in long-running suites where the
  server-side session may expire before the suite finishes.
- **`templates/automation-scaffold/global-setup.ts`** - hardened login flow:
  - `resolveVar()` with source logging (`param` / `env:KEY` / `default`)
  - Login retry loop (up to 3 attempts) with crash-page detection and recovery
  - `resolveAuthUsers()` - derives which users to authenticate from `QA_AUTH_USER` env var
    or from configured `storageState` paths in `playwright.config.ts`
  - `dismissOnboardingFlow()` - configurable via `QA_DISMISS_ONBOARDING_LABELS`
    (comma-separated button labels); no-op by default
  - Support for a second test user (`.auth/user-2.json`) via `QA_USER2_EMAIL` /
    `QA_USER2_PASSWORD`
- **`templates/automation-scaffold/playwright.config.ts`** - exports `SESSION_TTL_MS`
  (default 2 h, overridable via `QA_SESSION_TTL_MS`); commented-out parallel 2-user variant
  (`chromium-user1` / `chromium-user2`).
- **`templates/automation-scaffold/.env.example`** - new variables: `QA_SESSION_TTL_MS`,
  `QA_AUTH_USER`, `QA_USER2_EMAIL`, `QA_USER2_PASSWORD`, `QA_DISMISS_ONBOARDING_LABELS`,
  `PLAYWRIGHT_SERVICE_URL`.
- **`templates/integration-scaffold/`** - new scaffold for API testing with Playwright
  `APIRequestContext`. Includes `package.json`, `playwright.config.ts`, `global-setup.ts`
  (token-based or browser-login auth), `tests/example.spec.ts`, `README.md`, `.env.example`.
  Deployed to `qa/07-automation/integration/` on `init` and `upgrade`.
- **`templates/memory/`** - three semi-guided operational memory templates:
  `ci-pipeline-findings.md`, `e2e-stabilization-patterns.md`, `data-volatility-strategies.md`.
  Seeded into `qa/memory/` on `init` and `upgrade`.
- **`qa/06-defects/disputed/`** - third defect state for cases where QA has evidence but the
  business or dev team disputes the expected behavior. Created on `init` and `upgrade`.
- **`integrations/ado-powershell/pipelines/azure-pipeline-qa.yml`** - operational hardening:
  - `suiteFilter` pipeline parameter (default `all`); auto-overridden to `all` on scheduled runs
  - Bash array (`GREP_ARGS`) for safe grep pattern expansion with bracket characters
  - `PublishTestResults@2` scoped to exact XML path instead of `**/*.xml`
  - `publishRunAttachments: false` on both E2E and API stages
  - Artifact names suffixed with `$(System.JobAttempt)` to prevent collision on retries
  - `QA_AUTH_USER` documented as commented example for the 2-job parallel model
- **`integrations/playwright/README.md`** - new section: Visual AI helper optional pattern.
- **`templates/qa-readme.md`** - new fields: `ADO Project`, `Last Run` summary table,
  `Flaky Tests` inline annotation convention.

### Changed

- **`scripts/init.js`** - `fixtures/base.ts` added to e2e scaffold copy list; integration
  scaffold replaces the `integration/README.md` placeholder; memory template files seeded
  from `templates/memory/` via `fs.readFileSync`.
- **`scripts/upgrade.js`** - integration scaffold, `disputed/` defect folder, and memory
  templates are all seeded idempotently on upgrade for existing projects.
- **`docs/folder-structure-guide.md`** - `06-defects/` updated to document `disputed/`.
- **`templates/defect-report.md`** - `Status` field extended with `Disputed` value.
- **`qa/memory/INDEX.md`** template updated to pre-populate rows for the three new memory
  template files.

---

## [1.10.0] - 2026-05-19

### Added

- **`integrations/ado-powershell/pipelines/azure-pipeline-qa.yml`** - pipeline template
  significantly expanded:
  - New **Stage 3: API Integration Tests** - separate stage for `qa/07-automation/integration`,
    with its own `PublishTestResults` and `PublishPipelineArtifact` tasks.
  - **Cross-project repository checkout** via `resources.repositories` block; each stage
    now performs an explicit `checkout: source`.
  - **Smoke test step** in the E2E stage - validates `QA_BASE_URL` is reachable via `curl`
    before running the suite.
  - **Commented placeholder** for `AzureCLI@2` login task (Playwright Workspaces / Entra ID)
    in both E2E and API stages, with `PLAYWRIGHT_SERVICE_URL` env var placeholder.
  - Optional nightly schedule block (commented out).
  - `PublishPipelineArtifact` tasks for HTML report and trace artifacts in both stages.
- **`integrations/playwright-azure-reporter/README.md`** - fully rewritten:
  - Variables split into local (PAT) vs CI/CD (`SYSTEM_ACCESSTOKEN`) sections.
  - Config snippet updated to use `ADO_ORG`, `ADO_PROJECT`, `orgUrl` constructed from
    `ADO_ORG`, and `SYSTEM_ACCESSTOKEN ?? AZURE_TOKEN` token fallback.
  - New **Playwright Workspaces reporter** section (`@azure/playwright` +
    `playwright.service.config.ts` + Entra ID authentication notes).
  - Troubleshooting table expanded with pipeline-specific `401` scenario.

### Changed

- **`azure-pipeline-qa.yml`** - variable names aligned with current conventions:
  `AZURE_TOKEN` / `ADO_ORG_URL` / `ADO_PROJECT_NAME` replaced by `ADO_ORG` / `ADO_PROJECT`;
  `ADO_PLAN_ID` split into `ADO_E2E_PLAN_ID` / `ADO_API_PLAN_ID`; `SYSTEM_ACCESSTOKEN`
  replaces PAT for ADO reporter authentication.
- **`azure-pipeline-qa.yml`** - E2E job `timeoutInMinutes` increased from 60 to 90.
- **`azure-pipeline-qa.yml`** - trigger reduced to `main` only (removed `qa` and
  `release/*` branches); trigger rationale documented in comments.
- **`azure-pipeline-qa.yml`** - E2E test run consolidated from two `@grep`-tag steps
  (P0 + P1/P2) into a single `--grep-invert "_inspect|_diag"` run with `continueOnError: true`.
- **`azure-pipeline-qa.yml`** - cache target changed from `~/.cache/ms-playwright` to
  `node_modules` per workspace; `cacheHitVar` added to both cache tasks.
- **`azure-pipeline-qa.yml`** - `pool` block moved above `variables` for readability;
  `ADO_SYNC_DISABLED` variable removed.

---

## [1.9.1] - 2026-05-15

### Added

- **`integrations/ado-powershell/scripts/md-to-tc-mapping.ps1`** - new script that parses a
  Plan-de-Pruebas markdown file and generates `tc-mapping.json`. Reads the Tabla de Pruebas
  table, detects columns dynamically, skips Bloqueado rows (PENDING-CODE), splits steps by
  `<br>`, and strips leading numbering. Supports a `-TableSection` parameter for plans with
  non-standard headings. This was previously missing from the framework, forcing agents to
  implement ad-hoc parsers in each project.

### Fixed

- **`create-testplan-from-mapping.ps1`** - removed Unicode characters that caused
  `MissingArrayIndexExpression` parser errors in PowerShell 5.1.
- **`create-testplan-from-mapping.ps1`** - added auto-load of `ado-powershell` skill when
  `New-AdoTestCase` is not yet in scope; script no longer requires manual dot-sourcing before
  invocation.
- **`create-testplan-from-mapping.ps1`** - added fallback to `$mapping.items` when
  `$mapping.testCases` is absent, for compatibility with mappings generated by older sessions.
- **`inject-ado-ids.ps1`** - fixed broken regex (`\Q...\E` is not valid PowerShell); replaced
  with `[regex]::Escape()`. Added `-AdonIdsDir` parameter to process all `ado-ids-*.json`
  files in a directory in one pass. Added `-DryRun` switch. Fixed UTF-8 encoding on write.

---

## [1.9.0] - 2026-05-15

### Changed

- **`create-testplan-from-mapping.ps1` refactored** - removed all ADO-specific logic (auth headers,
  `Invoke-RestMethod` calls, XML step construction). The script now delegates to `New-AdoTestCase`
  and `Add-AdoTestCaseToSuite` from `@keber/ado-powershell`, keeping `qa-framework` free of
  ADO implementation details. Requires `@keber/ado-powershell` ≥ 1.3.0.
- **Script parameters simplified** - `-OrgUrl`, `-ProjectName`, and `-Token` removed from
  `create-testplan-from-mapping.ps1`. Caller is responsible for loading the ADO session via
  `. .github/skills/ado-powershell/load.ps1` before invoking the script.
- **`tc-mapping.json` schema extended** - added optional `steps` (string array) and
  `expectedResult` (string) fields per test case. When present, steps are sent to ADO as
  `Microsoft.VSTS.TCM.Steps`; all steps except the last are `ActionStep`, the last is
  `ValidateStep` with `expectedResult`.
- **`qa-ado-integration` SKILL.md updated** - Step 3 now specifies exactly how to parse the
  Tabla de Pruebas columns (`Steps` split on `<br>`, strip numbering prefix) to produce
  `tc-mapping.json` with steps.

### Added

- **Guard in `create-testplan-from-mapping.ps1`** - fails fast with a clear message if
  `New-AdoTestCase` is not available (ADO session not loaded).

### Requires

- `@keber/ado-powershell` ≥ **1.3.0** - adds `$ExpectedResult` parameter to `New-AdoTestCase`
  and `ValidateStep` support in the generated TCM steps XML.

---

## [1.8.0] - 2026-05-07

### Changed

- **Pipeline Stage 3 now produces "Plan de Pruebas"** - a single document per sprint+module
  that combines test plan context (scope, strategy, preconditions, test data) with a full TC
  table including numbered steps and expected results. Replaces the previous split between a
  high-level plan and separate TC-{ID}.md files for most workflows.
- **Stage 4 (`qa-test-cases`) role redefined** - from "generate TC-{ID}.md files" to
  "expand steps in Plan de Pruebas table when Stage 3 produced summary-level steps". Standalone
  `TC-{ID}.md` files are now optional and used only for complex/reusable TCs.
- **ADO integration prerequisite updated** - `qa-ado-integration` now reads from
  `Plan-de-Pruebas-{proyecto}-Sprint-{N}-{modulo}.md` (Tabla de Pruebas) instead of
  `qa/03-test-cases/automated/`. Each module file -> one ADO Test Suite; each table row -> one
  ADO Test Case with steps.
- **`02-test-plans/` restructured** - from flat `automated/` and `manual/` subdirectories to
  `sprints/Sprint-{N}/` per-sprint structure. Both tracks share the same Plan de Pruebas document.

### Added

- **`templates/test-plan-sprint.md`** - new primary Plan de Pruebas template. Includes header,
  12 sections, and Tabla de Pruebas with column guide. Uses `{{PLACEHOLDERS}}` throughout.
- **`skills/qa-test-plan/references/plan-de-pruebas-template.md`** - full template with example
  table rows, steps writing conventions, priority decision tree, and automation feasibility rules.
  Replaces `references/priority-and-feasibility.md` (old file kept for reference, now legacy).
- **`upgrade` Section 6** - non-destructive migration of old `02-test-plans/` structure:
  moves `automated/` -> `sprints/legacy-automated/`, `manual/` -> `sprints/legacy-manual/`, and
  flat `.md` plan files -> `sprints/legacy/`. Creates `03-test-cases/README.md` if missing.

### Deprecated

- **`templates/test-plan.md`** - use `templates/test-plan-sprint.md` instead.
  Old file kept for reference; contains deprecation notice at top.
- **`02-test-plans/automated/` and `02-test-plans/manual/` subdirectory convention** -
  replaced by `02-test-plans/sprints/Sprint-{N}/` per-sprint structure.

### Migration

Run `npx qa-framework upgrade`. Section 6 of the upgrade script handles the `02-test-plans/`
migration non-destructively: existing plan files are moved, not deleted.

---

## [1.7.2] - 2026-05-06

### Fixed

- **`init` no longer overwrites `qa/AGENT-NEXT-STEPS.md`** on already-initialized projects.
  The file was written with a bare `fs.writeFileSync` (no existence check), causing active sprint
  checklists to be silently replaced. Changed to `writeIfMissing` - consistent with all other
  project-owned files.

---

## [1.7.1] - 2026-05-06

### Fixed

- **Agent instructions template extracted** - `templates/qa-framework.instructions.md` is now
  the single source of truth for QA agent rules. Both `init` and `upgrade` read and interpolate
  this file instead of maintaining separate hardcoded strings, eliminating the rule divergence
  that caused `upgrade` to deploy only 7 rules instead of 11.
- `upgrade.js` - removed `buildCopilotInstructions()` function (dead code after template extraction).

---

## [1.7.0] - 2026-05-06

### Changed

- **Agent instructions moved to `.github/instructions/qa-framework.instructions.md`** - the
  framework no longer writes to `.github/copilot-instructions.md`. The new file is a VS Code
  `*.instructions.md` file with `applyTo: '**'` frontmatter, which Copilot loads automatically.
  This eliminates the conflict between framework-owned rules and project-owned custom instructions:
  both files coexist independently and the framework file is freely upgradeable.

### Added

- **`upgrade` step 2b - automatic migration of old `copilot-instructions.md`**:
  - If the file contains only QA Framework content (any previous version) -> the file is deleted.
  - If the file contains custom instructions and a QA Framework section -> the QA section is stripped and the custom content is preserved.
  - If the file contains no QA Framework content -> the file is left untouched.
  The detection marker is the heading `# QA Framework Instructions`, consistent across all versions.

### Migration

Run `npx qa-framework upgrade`. No manual steps required.
See `MIGRATION-NOTES.md` - section "Upgrading from a version that used `.github/copilot-instructions.md`".

---

## [1.6.2] - 2026-05-05

### Added

- **`tests/helpers/debug/`** - diagnostic scripts directory created by `init` and `upgrade` inside
  `07-automation/e2e/tests/`. Scripts here are excluded from test runs via `testIgnore`.
- **`tests/seeds/`** - data seeding specs directory created by `init` and `upgrade` inside
  `07-automation/e2e/tests/`. Excluded from test runs via `testIgnore`.
- **`testIgnore`** in `playwright.config.ts` template - excludes `**/helpers/debug/**` and
  `**/seeds/**` from Playwright test discovery.
- **`upgrade` step 5e** - patches existing `playwright.config.ts` in `e2e/`: replaces
  `testDir: '.'` with `'./tests'`, injects `testIgnore` if missing, creates `helpers/debug/`
  and `seeds/` if absent.
- **Dual-Track Pipeline** section in `docs/folder-structure-guide.md` and `qa/QA-STRUCTURE-GUIDE.md`
  - documents the automation track and manual track as parallel paths sharing `01-specifications/`
  as source of truth. Includes entry point table (3 scenarios) and track selection guidance.
  Clarifies that `03-test-cases/` is the manual track artifact and `04-test-data/` is optional.

### Fixed

- `qa/QA-STRUCTURE-GUIDE.md` - removed stale reference to deleted `docs/generalization-decisions.md`
  from the `06-defects/` section.
- `README.md` - pipeline table updated with Track column; `03-test-cases/` and `04-test-data/`
  annotated as manual-track / optional in the directory tree.

---

## [1.6.0] - 2026-04-29

### Changed (breaking - automated by `upgrade`)

- **`07-automation/` restructured**: the Playwright project root moves from `07-automation/` to
  `07-automation/e2e/`. Affected files: `playwright.config.ts`, `global-setup.ts`, `package.json`,
  `.env.example`, `fixtures/`. Spec stubs move from `07-automation/e2e/{module}/` to
  `07-automation/e2e/tests/{module}/`. Run `npx qa-framework upgrade` to migrate automatically.
- `testDir` in `playwright.config.ts` template is now `'./tests'` (was `'.'`).
- `QA_DIR` in the Azure Pipeline template now points to `qa/07-automation/e2e` (was `qa/07-automation`).
- CI commands: `cd qa/07-automation/e2e && npm install && npx playwright install chromium`.

### Removed

- `agent-instructions/` directory (legacy monolithic per-task instruction files) - superseded by `skills/`
  architecture since v1.5.0. All behavior is now in `skills/*/SKILL.md` + `references/`.
- `docs/comparison-matrix.md` - superseded by `docs/skills-architecture.md`.
- `docs/generalization-decisions.md` - internal design notes; no longer relevant.

### Documentation

- `docs/architecture.md` - updated for v1.6.0: correct 07-automation/e2e/ tree, removed blazor-radzen
  stub, added `.github/skills/` and `memory/` to target project box.
- `docs/installation.md` - rewritten: correct `npm install` command, no interactive prompts, correct
  directory tree with e2e/integration/load, added `upgrade` command section.
- `docs/usage-with-agent.md` - rewritten: all `00-guides/` references replaced with `.github/skills/`,
  session workflows updated to reflect skills model, DO/DON'T list corrected (e2e/ is now correct run location).
- `README.md` - version bumped, `agent-instructions/` entry removed from package tree.

### Added

- `07-automation/integration/` - placeholder for API/integration tests (k6, JMeter, Azure Load Testing);
  created on `init` and `upgrade`.
- `07-automation/load/` - placeholder for load and performance tests; created on `init` and `upgrade`.
- **`scripts/upgrade.js` migration section 5** - detects old v1.5.x structure and relocates all
  affected files non-destructively (moves only when destination does not exist; warns on conflict).
- **Stage 5b - Test Stabilization** (`skills/qa-test-stabilization/`) - skill for exhaustively
  reviewing and stabilizing generated Playwright tests before ADO integration. Covers baseline
  collection, failure classification (9 categories), false-positive validation, confidence scoring
  (>=90% exit threshold), `STABILIZATION-REPORT.md` schema, and upstream artifact update rules.

### Planned

- `qa-framework generate spec <module-name>` - scaffold a full spec set from CLI
- `qa-framework validate` - check `qa/` structure for compliance with conventions
- Integration: `jest` support alongside Playwright
- Integration: GitHub Actions pipeline template (alongside existing Azure Pipelines template)

---

## [1.0.0] - 2026-03-04

### Added

- **Framework scaffold** - initial `qa/` directory tree with 9 numbered folders (00-08)
- **6-file submodule template set** - `00-inventory` through `05-test-scenarios`
- **Agent instructions** - 7 purpose-specific Markdown instruction files for IDE agents
- **Standards** - naming conventions, bug report template, test case template, test data guidelines
- **Automation scaffold** - generalized Playwright `playwright.config.ts`, `global-setup.ts`, `.env.example`, `fixtures/auth.ts`
- **Optional integrations** - stubs and READMEs for Playwright, `playwright-azure-reporter`, and ADO PowerShell
- **CLI entry point** - `qa-framework init`, `generate`, `validate` commands
- **Documentation** - architecture, comparison matrix, generalization decisions, installation guide, usage-with-agent guide, spec-driven philosophy, folder structure guide
- **Migration notes** - `MIGRATION-NOTES.md` for projects moving from embedded to package-based framework

---
