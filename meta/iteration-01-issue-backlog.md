# Framework Iteration 01 — Pre-Release Issue Backlog

**Document type**: Pre-release defect and design gap registry
**Date**: 2026-03-05
**Framework version**: 1.0.0 (unreleased)
**Source**: Code-level review of all agent-instructions/, scripts/, templates/, and docs/ files
**Status**: Open — must be addressed before v1.0.0 release unless explicitly deferred

> Items in this list are independent from the pipeline and entry-mode gaps documented in
> `iteration-01-process-analysis.md`. Both documents together constitute the full known
> issue set for iteration 2.

---

## Severity Legend

| Level | Meaning |
|-------|---------|
| 🔴 Critical | Breaks expected behavior; two parts of the framework contradict each other |
| 🟠 Significant | Causes silent failures or hidden complexity that grows with project size |
| 🟡 Moderate | Design gap that accumulates cost over time but doesn't block initial use |

---

## 🔴 Critical Issues

---

### ISSUE-01 — Spec path is inconsistent across three files

**Severity**: 🔴 Critical
**Affects**: `agent-instructions/04-automation-generation.md`, `scripts/init.js`, `scripts/validate.js`

#### Description

Three parts of the framework disagree on the canonical location of spec files:

| File | Path it expects |
|------|----------------|
| `agent-instructions/04-automation-generation.md` | `qa/01-specifications/module-{name}/submodule-{name}/` |
| `scripts/init.js` | `qa/{moduleKey}/{subKey}/` |
| `scripts/validate.js` | Direct children of any non-reserved top-level dir under `qa/` |

An agent following `04-automation-generation.md` will write `@spec` references pointing to
`qa/01-specifications/...`, but `init.js` never creates that directory. `validate.js` will
not find spec files at that path and will report errors even when files exist at the `init.js`
path.

#### Fix instructions

1. Decide the canonical path. The simpler convention (`qa/{moduleKey}/{subKey}/`) is already
   what `init.js` creates and what `validate.js` scans — prefer this one.
2. In `agent-instructions/04-automation-generation.md`, find every reference to
   `qa/01-specifications/` and replace with `qa/{module-key}/{submodule-key}/`.
3. In the spec file JSDoc template in `04-automation-generation.md`, update:
   ```typescript
   // Before:
   * @spec qa/01-specifications/module-{name}/submodule-{name}/05-test-scenarios.md
   // After:
   * @spec qa/{module-kebab}/{submodule-kebab}/05-test-scenarios.md
   ```
4. Search all other files in `agent-instructions/`, `docs/`, and `README.md` for
   `01-specifications` — update any remaining occurrences.
5. If `01-specifications/` was intentional (to keep specs separate from automation), document
   this decision explicitly and update `init.js` and `validate.js` to match.

---

### ISSUE-02 — `EXEC_IDX` has a silent collision window

**Severity**: 🔴 Critical
**Affects**: `agent-instructions/04-automation-generation.md`, `templates/automation-scaffold/fixtures/test-helpers.ts`, `templates/specification/04-test-data.md`

#### Description

```typescript
const EXEC_IDX = Math.floor(Date.now() / 60_000) % 100_000;
```

Two test runs starting within the same 60-second window produce **identical** `EXEC_IDX`
values. This happens routinely in:
- CI pipelines where tests run quickly and a re-run is triggered on failure
- Local development where a developer re-runs a failing test immediately
- `beforeAll` blocks within a single suite (same timestamp for all records provisioned)

The framework presents EXEC_IDX as a collision-resistance mechanism. It reduces probability;
it does not eliminate collisions. Tests that share a window and create records with the same
name-based key will fail with duplicate key errors, and the failure will look like an
application bug rather than a test data problem.

#### Fix instructions

1. In `agent-instructions/04-automation-generation.md` and `docs/spec-driven-philosophy.md`,
   add an **Limitations** callout for EXEC_IDX:
   ```markdown
   > ⚠️ **EXEC_IDX collision window**: Two runs starting within the same 60-second window
   > produce the same index. For fields requiring guaranteed uniqueness (e.g., unique keys,
   > email addresses, RUTs), append a random suffix:
   > ```typescript
   > const EXEC_IDX = Math.floor(Date.now() / 60_000) % 100_000;
   > const RUN_SALT = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
   > const uniqueKey = `QA-${EXEC_IDX}-${RUN_SALT}`;
   > ```
   > Use plain EXEC_IDX only when deterministic replay within a minute window is acceptable.
   ```
2. Update `templates/automation-scaffold/fixtures/test-helpers.ts` to export a
   `uniqueName(prefix)` function that uses `EXEC_IDX + RUN_SALT` rather than EXEC_IDX alone.
3. Document when EXEC_IDX alone is acceptable (low-contention fields, non-unique fields)
   vs when the salt is required (unique database keys, email addresses, RUTs).

---

### ISSUE-03 — Security posture inconsistency: `.fill()` vs `page.evaluate()` for passwords

**Severity**: 🔴 Critical
**Affects**: `templates/automation-scaffold/global-setup.ts`, `agent-instructions/04-automation-generation.md`

#### Description

`04-automation-generation.md` (Pattern 2) correctly uses `page.evaluate()` to inject
passwords, preventing them from appearing in Playwright traces:

```typescript
// In 04-automation-generation.md — SECURE
await page.evaluate(
  ([sel, pwd]) => { (document.querySelector(sel) as HTMLInputElement).value = pwd; },
  [process.env.QA_LOGIN_PASSWORD_SELECTOR, process.env.QA_USER_PASSWORD]
);
```

`templates/automation-scaffold/global-setup.ts` uses `.fill()`:

```typescript
// In global-setup.ts — INSECURE: password appears in traces
await page.locator(passwordSelector).fill(password);
```

Any agent using `global-setup.ts` as its starting point will produce a less secure
implementation than one reading `04-automation-generation.md`. Playwright traces with
`video: 'retain-on-failure'` and `trace: 'retain-on-failure'` (both set in the scaffold
`playwright.config.ts`) will capture the password value.

#### Fix instructions

1. In `templates/automation-scaffold/global-setup.ts`, replace the `.fill(password)` call
   for the password field with `page.evaluate()` injection, matching the pattern in
   `04-automation-generation.md`.
2. Add a comment explaining why `evaluate()` is used for the password field specifically.
3. Add a `## Security` section to `integrations/playwright/README.md` explicitly stating
   that passwords must never be passed through `.fill()` if traces are enabled.

---

## 🟠 Significant Issues

---

### ISSUE-04 — No test data teardown strategy

**Severity**: 🟠 Significant
**Affects**: `templates/specification/04-test-data.md`, `agent-instructions/04-automation-generation.md`, `agent-instructions/06-maintenance.md`

#### Description

The framework documents how to provision test data (`beforeAll`, EXEC_IDX, 04-test-data.md)
but defines no teardown strategy. Consequences:

- Test data accumulates in the QA environment across sprint cycles
- Tests depending on a clean initial state become flaky as the database grows
- When `beforeAll` provisioning fails mid-suite, partially created data is left orphaned
- No guidance on whether to clean up in `afterAll`, when not to clean up (investigation
  purposes), or how to handle QA environment resets between sprints

This is a shared-state problem that compounds non-linearly with module count and sprint count.

#### Fix instructions

1. Add a `## Data Teardown Policy` section to `agent-instructions/04-automation-generation.md`:
   - Define three teardown strategies: `afterAll` cleanup, EXEC_IDX uniqueness reliance
     (no teardown), and sprint-cycle environment reset
   - State the recommended default: EXEC_IDX reliance for most tests; `afterAll` cleanup
     only when a test creates shared resources that would interfere with other suites
   - State when NOT to teardown: when the test itself failed and the data is needed for
     investigation
2. Add a `## Data Isolation Rules` section to `templates/specification/04-test-data.md`
   template that includes a teardown decision field per data shape.
3. Add a step to `agent-instructions/06-maintenance.md` for sprint-cycle QA environment
   reset: document which tables/entities need periodic cleanup and who is responsible.

---

### ISSUE-05 — `COVERAGE-MAPPING.md` has no schema or template

**Severity**: 🟠 Significant
**Affects**: `agent-instructions/04-automation-generation.md`, `templates/`

#### Description

`04-automation-generation.md` instructs agents to create a `COVERAGE-MAPPING.md` file as a
required output of automation generation, but no template or schema exists for it. Every
agent will invent a different structure, making it:
- Unusable for tooling or cross-module comparison
- Inconsistent across projects and sprints
- Impossible to validate with the `validate.js` script

#### Fix instructions

1. Create `templates/coverage-mapping.md` with the following defined columns:
   ```markdown
   # Coverage Mapping — {MODULE} > {SUBMODULE}

   | TC-ID | Title | Priority | Spec file | Playwright file | Test function name | Status | Notes |
   |-------|-------|----------|-----------|-----------------|-------------------|--------|-------|
   | TC-MOD-SUB-001 | ... | P0 | `qa/.../05-test-scenarios.md` | `qa/07-automation/e2e/.../file.spec.ts` | `describe > test title` | Automated / Skipped / Manual | DEF-NNN if skipped |
   ```
2. Update `agent-instructions/04-automation-generation.md` to reference this template and
   require its completion as a stage exit criterion.
3. Add a `validate.js` check: for every submodule that has a `.spec.ts` file, verify a
   `COVERAGE-MAPPING.md` exists in the same module directory.

---

### ISSUE-06 — Automation feasibility has no update trigger

**Severity**: 🟠 Significant
**Affects**: `templates/test-plan.md`, `agent-instructions/06-maintenance.md`

#### Description

Test plan documents mark each TC as "Automated: Yes / No / Partial" at planning time. There
is no mechanism or prompt anywhere in the framework to revisit this judgment when:
- The application gains an API endpoint that makes a previously non-automatable TC automatable
- A third-party integration is mocked, enabling previously blocked tests
- A new Playwright capability changes what's feasible

Over time, TCs marked `No` accumulate without reassessment, creating a growing list of phantom
non-automatable TCs that may actually be automatable.

#### Fix instructions

1. Add a `Feasibility review date` field to the TC rows in `05-test-scenarios.md` template.
2. In `agent-instructions/06-maintenance.md`, add a `## Periodic Feasibility Review` step:
   - Trigger: every 2 sprints, or after any significant application change
   - Action: scan all TCs marked `Automated: No` and re-evaluate against current app state
   - Output: update `05-test-scenarios.md` feasibility column; generate automation for
     newly-feasible TCs following `04-automation-generation.md`
3. Add a `--check-feasibility` flag concept to `validate.js` that reports all TCs marked
   `No` with a feasibility review date older than a configurable threshold.

---

### ISSUE-07 — ADO inject/sync has no rollback and breaks on title restructuring

**Severity**: 🟠 Significant
**Affects**: `integrations/ado-powershell/scripts/inject-ado-ids.ps1`, `integrations/ado-powershell/scripts/sync-ado-titles.ps1`

#### Description

`inject-ado-ids.ps1` is idempotent (won't double-inject) but has no rollback. If the script
runs and then Stage 3.5 (stabilization) causes test title restructuring — TC consolidation,
splitting, or significant rename — the injected numeric prefix becomes stale:

- The title and the WI ID are now mismatched in both the spec file and ADO
- `sync-ado-titles.ps1` silently skips entries where the title match pattern fails
- TC consolidation (two tests merged into one) leaves an orphaned ADO WI with no spec file
  reference — it never reports results, but is counted in the plan

There is no detection mechanism for any of these states.

#### Fix instructions

1. Add a `--dry-run` flag reminder and a `--rollback` flag to `inject-ado-ids.ps1` that
   restores spec files to their pre-injection state using a backup created at injection time.
2. Add a `## Stale mapping detection` section to `integrations/ado-powershell/README.md`
   documenting the failure modes above and instructing when to re-run the full inject cycle.
3. Add a new script `integrations/ado-powershell/scripts/verify-mapping-integrity.ps1` that:
   - Reads `ado-ids.json`
   - For each entry, checks that the `specFile` exists and contains a test title with the
     expected `[adoWiId]` prefix
   - Reports orphaned WIs (in mapping but not found in spec files)
   - Reports unmapped tests (in spec files with `[TC-*]` prefix but no entry in `ado-ids.json`)
4. Make this verification a recommended pre-step before every CI pipeline run.

---

## 🟡 Moderate Issues

---

### ISSUE-08 — Agent instructions are pipeline-sequence-unaware

**Severity**: 🟡 Moderate
**Affects**: All files in `agent-instructions/`

#### Description

Each instruction file describes how to execute its stage but none declare:
- What stage precedes it and what artifacts that stage produces
- What stage follows it and what this stage's output enables
- What the exit criteria are (when is this stage "done"?)
- Where to look if the previous stage's artifacts are missing

An agent reading `03-test-case-generation.md` doesn't know whether it runs before or after
`02-test-plan-generation.md`, or whether Stage 3 can start without completing Stage 2.

#### Fix instructions

Add a standardized **Stage header block** to every agent instruction file, immediately after
the file header:

```markdown
## Stage Context

| Field | Value |
|-------|-------|
| Stage number | 3 |
| Stage name | Test Case Generation |
| Preceding stage | Stage 2 — Test Plan Generation (`02-test-plan-generation.md`) |
| Following stage | Stage 3 — Automation Generation (`04-automation-generation.md`) |
| Can be skipped? | Yes — skip if TCs are documented sufficiently in `05-test-scenarios.md` |
| Required inputs | Approved `test-plan.md` or populated `05-test-scenarios.md` |
| Produced outputs | `templates/test-case.md` instance per complex TC |
| Exit criterion | All P0 and P1 TCs have either a spec row or a standalone TC document |
```

Apply this block to all 7 instruction files (00 through 06).

---

### ISSUE-09 — `03-test-case-generation.md` has no clear trigger and undefined audience

**Severity**: 🟡 Moderate
**Affects**: `agent-instructions/03-test-case-generation.md`

#### Description

The instruction file says "use when a TC needs more detail than the table row provides."
This is a judgment call with no objective criterion. In practice:
- Agents generating automation (Stage 4) don't need standalone TC documents — `05-test-scenarios.md`
  rows + `04-automation-generation.md` patterns are sufficient
- Human manual testers do need step-by-step documents
- The planning-to-ADO stream (Mode B) needs TC-level detail to create `Ready` ADO WIs

The file is trying to serve three audiences with one document and a vague trigger condition.

#### Fix instructions

1. Rewrite the `## When to use` section with explicit structural conditions:
   ```markdown
   ## When to use

   Use this instruction when ANY of the following is true:
   - You are in Mode B (planning-first) and preparing ADO Test Cases to be created as `Ready`
   - A TC has more than 4 steps or requires branching decision logic
   - A TC is designated Manual-only (Automated: No) and will be executed by a human tester
   - A TC involves multiple roles or systems (cross-module integration)

   Skip this stage when:
   - All TCs are automatable P0/P1 with ≤4 steps (covered by spec rows + automation directly)
   - The project is in Mode A (discovery-first) and automation is the only delivery channel
   ```
2. Reference this from `agent-instructions/02-test-plan-generation.md` — when the plan
   identifies Manual-only TCs, it should explicitly trigger Stage 3.

---

### ISSUE-10 — No module granularity decision rule

**Severity**: 🟡 Moderate
**Affects**: `agent-instructions/00-module-analysis.md`, `docs/spec-driven-philosophy.md`

#### Description

Two engineers analyzing the same system can produce completely different module/submodule
hierarchies. The framework gives examples but no decision rule. This matters because:
- TC-IDs are permanently tied to the hierarchy (`TC-USR-CR-001` vs `TC-USR-001`)
- ADO suite structure mirrors the hierarchy
- Reorganizing later requires renaming every TC-ID and every injected ADO WI prefix

Example ambiguity: Is "User Management" one module with submodules Create/Edit/Roles? Or is
"Create User" a module on its own?

#### Fix instructions

Add a `## Granularity Rules` section to `agent-instructions/00-module-analysis.md`:

```markdown
## Granularity Rules

**Module** = a top-level navigation section in the application (menu item, major feature area).
A module code is 3–6 uppercase letters.

**Submodule** = a distinct view, CRUD entity, or workflow within a module. It maps to:
- One primary database entity (one Create/Read/Update/Delete surface)
- One distinct workflow (approval, import, export as a standalone process)
- NOT a sub-tab or secondary panel within a view — those are covered by the parent submodule

**Sizing heuristic**: A well-scoped submodule produces between 8 and 40 test cases.
- Fewer than 8: consider merging with a sibling submodule
- More than 40: consider splitting into two submodules with distinct codes

**When in doubt**: prefer coarser granularity now. Splitting later is less disruptive than
merging (merging requires retiring TC-IDs; splitting only requires adding new ones).
```

---

### ISSUE-11 — `validate.js` does not check TypeScript compilation

**Severity**: 🟡 Moderate
**Affects**: `scripts/validate.js`

#### Description

`validate.js` checks file presence, credential patterns, and TC naming conventions. It does
not check whether `.spec.ts` files are valid TypeScript. A file with import errors or type
mismatches will pass validation but fail at `playwright test` runtime, giving a false green
signal.

#### Fix instructions

1. Add a TypeScript compilation check to `validate.js` as an optional step (requires
   `typescript` to be installed in the automation package):
   ```javascript
   // In validate.js, after the existing checks:
   if (strict) {
     const e2eDir = path.join(qaRoot, '07-automation');
     const tsconfig = path.join(e2eDir, 'tsconfig.json');
     if (fs.existsSync(tsconfig)) {
       const result = spawnSync('npx', ['tsc', '--noEmit', '--project', tsconfig], {
         cwd: e2eDir, encoding: 'utf8', stdio: 'pipe'
       });
       if (result.status !== 0) {
         errors.push(`TypeScript compilation errors found:\n${result.stdout}`);
       }
     } else {
       warnings.push('[STRICT] No tsconfig.json found in 07-automation/ — TypeScript check skipped');
     }
   }
   ```
2. Document this check in the `## Checks` header comment of `validate.js`.
3. Add `require('child_process').spawnSync` import at the top of `validate.js`.

---

### ISSUE-12 — Non-browser testing scope is undefined

**Severity**: 🟡 Moderate
**Affects**: `docs/spec-driven-philosophy.md`, `docs/folder-structure-guide.md`, `README.md`

#### Description

The framework covers E2E browser testing only, but never explicitly states what is out of
scope. In practice, QA engineers will eventually need to write API tests (flows without UI,
seeding, or performance checks), accessibility tests, or visual regression tests. There is no
guidance on:
- Whether such tests belong in `07-automation/`
- Whether they should use a separate package
- How their TC-IDs and spec files would be structured

The absence creates ad-hoc divergent decisions across projects.

#### Fix instructions

1. Add a `## Scope Boundaries` section to `docs/spec-driven-philosophy.md`:
   ```markdown
   ## Scope Boundaries

   This framework covers **E2E browser tests** (Playwright) only.

   | Test type | In scope? | Recommendation |
   |-----------|-----------|----------------|
   | E2E browser tests | ✅ Yes | Full framework applies |
   | API tests (REST/GraphQL) | ⚠️ Partial | Can live in `07-automation/api/`; use the same TC-ID convention; no browser fixture needed |
   | Accessibility tests | ❌ No | Use `@axe-core/playwright` as a standalone check; not part of this framework's TC model |
   | Visual regression | ❌ No | Use Playwright visual comparisons independently; not spec-mapped |
   | Unit tests | ❌ No | Back-end responsibility; this framework does not prescribe unit test structure |
   | Performance tests | ❌ No | Out of scope for QA framework; separate tooling (k6, Locust, etc.) |
   ```
2. If API tests are to be supported: add `07-automation/api/` to the folder structure guide
   with its own README and a minimal template.

---

### ISSUE-13 — TC Origin classification missing `SPRINT-AGREED` tag for Mode B

**Severity**: 🟡 Moderate
**Affects**: `docs/spec-driven-philosophy.md`, `agent-instructions/00-module-analysis.md`, `agent-instructions/03-test-case-generation.md`, `templates/specification/05-test-scenarios.md`

#### Description

`spec-driven-philosophy.md` defines three TC origin tags for traceability:
- `UI-OBSERVED` — discovered from clicking through a live application
- `PENDING-CODE` — feature not yet deployed; TC written ahead of code
- `BLOCKED-PERMISSIONS` — TC cannot be run due to a missing role or environment

This taxonomy was designed for **Mode A** (discovery-first, live app as source of truth).
**Mode B** (planning-first, sprint meeting + ADO Work Items as source) has no equivalent tag.
TCs drafted at planning time from WI descriptions — before the feature is built — require a
fundamentally different reliability assumption: the spec may be wrong, the step sequence is
hypothetical, and the acceptance criteria haven't been validated against actual UI yet.

Without a `SPRINT-AGREED` (or equivalent) tag, Mode B TCs appear identical to discovery-based
ones in reports and in automation scaffolding, and there is no signal to the reviewing agent
that these TCs have higher probability of requiring revision after the build lands.

#### Fix instructions

1. In `docs/spec-driven-philosophy.md`, add `SPRINT-AGREED` to the TC Origin taxonomy:
   ```markdown
   | Tag | Meaning |
   |-----|---------|
   | `UI-OBSERVED` | Derived from live application interaction (Mode A) |
   | `SPRINT-AGREED` | Derived from sprint planning meeting / ADO Work Item description (Mode B). Steps are hypothetical until verified against the built feature. |
   | `PENDING-CODE` | Feature not yet deployed; derivation mode irrelevant — code doesn't exist yet |
   | `BLOCKED-PERMISSIONS` | Cannot be executed due to missing access |
   ```
2. In `templates/specification/05-test-scenarios.md`, add `Origin` as a column in the TC table
   (if not already present) and list the four valid values.
3. In `agent-instructions/03-test-case-generation.md`, specify: when running in Mode B, all
   generated TCs must be tagged `SPRINT-AGREED` and must include a
   `> ⚠️ Review after deploy: steps not yet validated against live UI` callout block.
4. In `agent-instructions/00-module-analysis.md`, at the point where COVERAGE-MAPPING is
   seeded, note that Mode B modules will have 100% `SPRINT-AGREED` TCs — this is expected
   and should not be treated as a quality gap.

---

### ISSUE-14 — No connection between `04-test-data.md` and provisioning code

**Severity**: 🟠 Significant
**Affects**: `templates/specification/04-test-data.md`, `agent-instructions/04-automation-generation.md`

#### Description

`04-test-data.md` is a spec document that describes the data shapes a submodule needs
(entities, field ranges, precondition records). `04-automation-generation.md` describes
`beforeAll` provisioning blocks inside `.spec.ts` files. The two documents are related —
one describes *what* data; the other produces *the code that creates it* — but the framework
never draws this connection.

Consequences:
- An agent generating automation must independently re-derive the data requirements from
  `04-test-data.md`, rather than translating directly from a documented schema
- `04-test-data.md` tables have no "provisioning code" column, so agents invent different
  field names and variable names per file
- When data shapes change (sprint cycle update), there is no traceability from the changed
  spec row to the `beforeAll` code that must also change

#### Fix instructions

1. In `templates/specification/04-test-data.md`, add a `Provisioning reference` column to
   every data shape table:
   ```markdown
   | Field | Type | Constraints | Example value | Provisioning reference |
   |-------|------|-------------|---------------|----------------------|
   | name  | string | 3–100 chars, unique | QA-Supplier-{EXEC_IDX} | `helpers.createSupplier({ name })` |
   ```
2. In `agent-instructions/04-automation-generation.md`, add a step before "Write the spec
   file" instructing the agent to:
   - Open the submodule's `04-test-data.md`
   - Map each data shape row to a `beforeAll` provisioning call
   - Name provisioning variables consistently with the `Provisioning reference` column
3. Create `templates/automation-scaffold/fixtures/provisioning-helpers.ts` as a scaffold for
   module-level CRUD helpers, referenced from `04-automation-generation.md` with a usage
   example showing how `createSupplier()` is called in `beforeAll`.

---

### ISSUE-15 — CI pipeline template existence is unverified

**Severity**: 🟡 Moderate
**Affects**: `agent-instructions/05-ado-integration.md`, `integrations/ado-powershell/pipelines/` (expected location)

#### Description

`05-ado-integration.md` references an `azure-pipeline-qa.yml` pipeline template as a
deliverable of the integration stage, and instructs agents to configure it with ADO variables
and test outcome reporting. It is not confirmed whether this file exists inside
`integrations/ado-powershell/pipelines/` or elsewhere in the framework.

If the file does not exist:
- Agents following `05-ado-integration.md` will hit a dead reference and halt or improvise
- The CI integration is effectively undocumented for new projects — each project re-invents
  the pipeline YAML
- `validate.js --strict` has no check for this file, so the gap is invisible

#### Fix instructions

1. Verify whether `integrations/ado-powershell/pipelines/azure-pipeline-qa.yml` exists.
   If it does not:
   - Create it with a minimal Azure Pipelines definition that runs `npx playwright test` and
     publishes results using the ADO `PublishTestResults@2` task
   - Reference the required ADO variable group names (matching those documented in
     `05-ado-integration.md`)
2. In `agent-instructions/05-ado-integration.md`, add a hyperlink to the template file so
   agents can locate it without searching the directory tree.
3. Add to `validate.js --strict`: check that `integrations/ado-powershell/pipelines/` exists
   and contains at least one `.yml` file.

---

### ISSUE-16 — Examples folder is incomplete

**Severity**: 🟠 Significant
**Affects**: `examples/module-example/suppliers/`

#### Description

The `examples/` directory provides the only concrete, non-template artifact showing how the
full spec set looks for a real submodule. Only two files were created for the example
`suppliers` submodule:
- `examples/module-example/suppliers/00-inventory.md`
- `examples/module-example/suppliers/suppliers-create.spec.ts`

A complete submodule requires 6 numbered spec files plus automation:
- `00-inventory.md` ✅ (exists)
- `01-business-rules.md` ❌ missing
- `02-user-stories.md` ❌ missing
- `03-ui-screens.md` ❌ missing
- `04-test-data.md` ❌ missing
- `05-test-scenarios.md` ❌ missing
- `suppliers-create.spec.ts` ✅ (exists, but incomplete without the full spec set)

Agents and engineers onboarding to the framework rely on examples to understand correct
output. An incomplete example is worse than no example — it implies the missing spec files
either don't exist or don't matter.

#### Fix instructions

1. Create `examples/module-example/suppliers/01-business-rules.md` using the corresponding
   template, populated with realistic rules (e.g., "Supplier name must be unique within
   active suppliers", "RUT must pass Chilean checksum validation").
2. Create `examples/module-example/suppliers/02-user-stories.md` with 3–5 user stories
   covering the create-supplier workflow.
3. Create `examples/module-example/suppliers/03-ui-screens.md` with placeholder screenshots
   and annotated field descriptions for the create-supplier form.
4. Create `examples/module-example/suppliers/04-test-data.md` with data shapes for
   supplier entities, including the `Provisioning reference` column introduced in ISSUE-14.
5. Create `examples/module-example/suppliers/05-test-scenarios.md` with the TC table fully
   populated, TC-IDs assigned, and coverage tags applied.
6. Once all 6 spec files exist, verify `suppliers-create.spec.ts` `@spec` path references
   match the actual spec file locations.

---

### ISSUE-17 — `validate.js` checks `06-defects/` but not its required subdirectories

**Severity**: 🟡 Moderate
**Affects**: `scripts/validate.js`, `scripts/init.js`, `agent-instructions/06-maintenance.md`

#### Description

`init.js` creates the following defect folder structure:
```
qa/{moduleKey}/{subKey}/06-defects/
  open/
  resolved/
```

`agent-instructions/06-maintenance.md` references files in `06-defects/open/` by path
(e.g., "Move this file to `06-defects/resolved/`"). However, `validate.js` only checks
that a `06-defects/` folder exists at the top level — it does NOT verify that
`06-defects/open/` and `06-defects/resolved/` exist as subdirectories.

Consequence: an `init.js` run that partially fails (e.g., creates `06-defects/` but not
subdirs) will pass validation, and agents using `06-maintenance.md` will silently fail when
moving defect files.

#### Fix instructions

1. In `scripts/validate.js`, update the submodule structure check to verify both
   subdirectories:
   ```javascript
   // Current check (approximate):
   if (!fs.existsSync(path.join(subDir, '06-defects'))) {
     errors.push(`Missing 06-defects/ in ${subDir}`);
   }
   // Add:
   ['open', 'resolved'].forEach(sub => {
     const subPath = path.join(subDir, '06-defects', sub);
     if (!fs.existsSync(subPath)) {
       errors.push(`Missing 06-defects/${sub}/ in ${subDir}`);
     }
   });
   ```
2. Verify that `init.js` does create both subdirectories. If it does not, add the `mkdirSync`
   calls for `06-defects/open/` and `06-defects/resolved/`.

---

### ISSUE-18 — Defect files placed at `06-defects/` root are not detected by `validate.js`

**Severity**: 🟡 Moderate
**Affects**: `scripts/validate.js`, `agent-instructions/06-maintenance.md`

#### Description

`06-maintenance.md` instructs agents to file new defects in `06-defects/open/` and move
resolved ones to `06-defects/resolved/`. However, `validate.js` doesn't enforce this
convention: a defect file created directly at `06-defects/DEF-001.md` (skipping the
subdirectory) will pass validation without warning.

This is distinct from ISSUE-17 (which concerns the subdirectories themselves not existing).
This issue concerns defect files that exist but are in the wrong location — they will not
be found by agents scanning `06-defects/open/` for actionable defects.

#### Fix instructions

1. In `scripts/validate.js`, add a check for each submodule's `06-defects/` directory:
   ```javascript
   const defectsRoot = path.join(subDir, '06-defects');
   if (fs.existsSync(defectsRoot)) {
     const rootFiles = fs.readdirSync(defectsRoot)
       .filter(f => !fs.statSync(path.join(defectsRoot, f)).isDirectory());
     if (rootFiles.length > 0) {
       warnings.push(
         `Defect files found at 06-defects/ root in ${subDir}: [${rootFiles.join(', ')}]. ` +
         `Move to 06-defects/open/ or 06-defects/resolved/.`
       );
     }
   }
   ```
2. This should produce a warning (not an error) — files at the root are not dangerously
   wrong, just misplaced.
3. Update the `## Conventions` section of `06-maintenance.md` to make this rule explicit:
   > Defect files MUST live in `06-defects/open/` or `06-defects/resolved/`. Files placed
   > directly in `06-defects/` are invisible to defect-scanning agents.

---

### ISSUE-19 — Session summaries have no consolidated pipeline state view

**Severity**: 🟡 Moderate
**Affects**: `templates/session-summary.md`, `agent-instructions/` (all files)

#### Description

Each session produces a `session-summary.md` file at the submodule or module level. Over
time, a module accumulates multiple summaries from different sprint cycles. To understand
where a module currently stands in the framework pipeline, an agent must:
1. Find all session summary files for the module
2. Read each one sequentially (they may be in different directories)
3. Reconstruct the current state by identifying the most recent completed stage

There is no single source of truth for pipeline state. This creates several failure modes:
- An agent beginning a new session may start the wrong stage (e.g., jump to Stage 4 when
  Stage 2 is still incomplete)
- Session summaries for different submodules within the same module conflict without being
  reconciled
- The `## Next Steps` section in each summary is often superseded by the next session,
  leaving stale instructions in the file history

#### Fix instructions

1. Add a **Pipeline State Tracker** table to `templates/session-summary.md` as the first
   block written at every new session:
   ```markdown
   ## Pipeline State — {MODULE} > {SUBMODULE}

   | Stage | Name | Status | Last updated | Notes |
   |-------|------|--------|-------------|-------|
   | 0 | Bootstrap | ✅ Complete | YYYY-MM-DD | |
   | 1 | Module Analysis | ✅ Complete | YYYY-MM-DD | |
   | 2 | Test Plan Generation | ✅ Complete | YYYY-MM-DD | |
   | 3 | Test Case Generation | ⏳ In progress | YYYY-MM-DD | |
   | 3.5 | Test Stabilization | ⬜ Not started | — | |
   | 4 | Automation Generation | ⬜ Not started | — | |
   | 5 | ADO Integration | ⬜ Not started | — | |
   | 6 | Maintenance | ⬜ Not started | — | |
   ```
2. In every agent instruction file, add a **first step** before any analysis: "Open or
   create `session-summary.md` for this submodule. Update the Pipeline State Tracker table
   to reflect current known state. Mark the current stage as ⏳ In progress."
3. At session end (or when switching stages), instruct agents to update the tracker, mark
   the current stage ✅ Complete, and identify the next stage.
4. If a submodule has no `session-summary.md`, this is an error — `validate.js` should
   warn about its absence for any submodule that has been partially initialized (has spec
   files but no summary).

---

> **Consolidation note**: Items 2, 6, and 7 from the original 21-item analysis were merged
> into **ISSUE-01** (they all concern the same three-way spec path inconsistency: the
> `@spec` annotation format, the `init.js` directory creation path, and the `validate.js`
> scan pattern). This accounts for the apparent count discrepancy (21 items → 19 issues).

---

## Summary Table

| ID | Severity | Title | Primary file(s) to fix | Blocking release? |
|----|----------|-------|----------------------|-------------------|
| ISSUE-01 | 🔴 Critical | Spec path inconsistency across 3 files | `04-automation-generation.md`, `init.js`, `validate.js` | Yes |
| ISSUE-02 | 🔴 Critical | EXEC_IDX silent collision window | `04-automation-generation.md`, `test-helpers.ts`, `04-test-data.md` | Yes |
| ISSUE-03 | 🔴 Critical | Security: `.fill()` vs `evaluate()` for passwords | `global-setup.ts`, `04-automation-generation.md` | Yes |
| ISSUE-04 | 🟠 Significant | No test data teardown strategy | `04-automation-generation.md`, `04-test-data.md`, `06-maintenance.md` | Yes |
| ISSUE-05 | 🟠 Significant | `COVERAGE-MAPPING.md` has no schema | `04-automation-generation.md`, `templates/` | Yes |
| ISSUE-06 | 🟠 Significant | Automation feasibility has no update trigger | `test-plan.md`, `06-maintenance.md` | No |
| ISSUE-07 | 🟠 Significant | ADO inject/sync: no rollback, breaks on title restructure | `inject-ado-ids.ps1`, `sync-ado-titles.ps1` | No |
| ISSUE-08 | 🟡 Moderate | Agent instructions are pipeline-sequence-unaware | All `agent-instructions/` files | No |
| ISSUE-09 | 🟡 Moderate | `03-test-case-generation.md` has undefined trigger and audience | `03-test-case-generation.md` | No |
| ISSUE-10 | 🟡 Moderate | No module granularity decision rule | `00-module-analysis.md`, `spec-driven-philosophy.md` | No |
| ISSUE-11 | 🟡 Moderate | `validate.js` does not check TypeScript compilation | `validate.js` | No |
| ISSUE-12 | 🟡 Moderate | Non-browser testing scope is undefined | `spec-driven-philosophy.md`, `README.md` | No |
| ISSUE-13 | 🟡 Moderate | TC Origin missing `SPRINT-AGREED` tag for Mode B | `spec-driven-philosophy.md`, `05-test-scenarios.md`, `03-test-case-generation.md` | No |
| ISSUE-14 | 🟠 Significant | No connection between `04-test-data.md` and provisioning code | `04-test-data.md`, `04-automation-generation.md` | Yes |
| ISSUE-15 | 🟡 Moderate | CI pipeline template existence unverified | `05-ado-integration.md`, `integrations/ado-powershell/pipelines/` | No |
| ISSUE-16 | 🟠 Significant | Examples folder incomplete — 4 of 6 spec files missing | `examples/module-example/suppliers/` | Yes |
| ISSUE-17 | 🟡 Moderate | `validate.js` doesn't check `06-defects/open/` and `/resolved/` | `validate.js`, `init.js` | No |
| ISSUE-18 | 🟡 Moderate | Defect files at `06-defects/` root not detected by `validate.js` | `validate.js`, `06-maintenance.md` | No |
| ISSUE-19 | 🟡 Moderate | Session summaries lack consolidated pipeline state view | `templates/session-summary.md`, all `agent-instructions/` | No |

**Release blockers**: ISSUE-01, ISSUE-02, ISSUE-03, ISSUE-04, ISSUE-05, ISSUE-14, ISSUE-16 (7 of 19)

---

*This document should be updated as issues are resolved. Mark resolved items with
✅ and the resolution date rather than deleting them, to preserve audit trail.*
