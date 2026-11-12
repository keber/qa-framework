# Release report: 1.14.0 autonomous release plan (waves 0-4)

**For**: Keber (release owner); sections 3 and 5 also concern marcela.berriosc
**Prepared by**: the release coordinator, 2026-11-12
**Covers**: `@keber/qa-framework` 1.13.2 (npm `latest`) to 1.14.0-rc.5 (npm `next`)
**Sources**: `docs/autonomous-release-plan.md` (tracking table, decision log), `CHANGELOG.md` `[Unreleased]`, git history `v1.13.2..v1.14.0-rc.5`, the npm registry, and the coordinator's verification runs. Figures were re-checked on 2026-11-12; where two sources disagreed, the registry or the test runner wins.

---

## The answer

**1.14.0-rc.5 delivers the whole autonomous plan: 20 of the 34 survey items and all three of marcela.berriosc's candidates. Every package was independently verified before merge, and no defect found during the plan reached npm. It can become `latest` once two human checks are done: marcela.berriosc's review and a real Azure DevOps check of wave 4.**

Four findings support this:

1. **The scope is delivered.** 21 work packages across five waves: release plumbing, bug fixes, API testing with write governance, performance and automation patterns, and ADO scripts.
2. **The quality evidence is strong.** Tests went from 202 to 562. Each package passed the coordinator's own checks before merge. Nine defects were caught, all before the affected rc was tagged.
3. **Existing projects are protected on `upgrade`.** It refreshes only untouched framework files, warns instead of overwriting, and never edits `package.json`. Any behavior change for existing suites is held back and listed.
4. **Promotion needs two human actions and one choice.** marcela.berriosc reviews 28 decisions, Keber checks wave 4 against real ADO, and Keber picks which tag to promote.

Below, each finding is argued with its evidence. Details and reference tables are in the appendix.

---

## Context

- **Situation.** A survey of nine projects (`docs/upstream-candidates.md`) listed 34 candidate improvements (A1-A6, B1-B10, C1-C15, D1-D3), plus three candidates from marcela.berriosc's project: write governance, API integration tests and k6 performance.
- **Complication.** Seven consumer projects depend on the package, and a publish to npm cannot be undone. The work also had to run without Keber supervising each step.
- **Question.** Can the backlog be delivered autonomously without putting consumers at risk?
- **The model chosen.** Autonomous prereleases go to `next`, and only a human promotes to `latest`. All seven consumers use `^` ranges, which never resolve to a prerelease, so no consumer could receive an rc by accident.

---

## 1. The scope is delivered

| Wave | Theme | Packages | Shipped in |
|---|---|---|---|
| 0 | Release plumbing: guarded publishing, prerelease versioning, a test race | WP0.1-WP0.3 | rc.1, rc.2 |
| 1 | Bugs and converged fixes: version stamp, scaffold config, rule 11, BOM policy, ADO full read, upgrade report | WP1.1-WP1.7 (WP1.5 closed without change) | rc.2 |
| 2 | API testing and write governance | WP2.1-WP2.4 | rc.3 |
| 3 | Performance and automation patterns | WP3.1-WP3.6 (WP3.2 is research only) | rc.4 |
| 4 | Azure DevOps scripts and credential policy | WP4.1-WP4.3 | rc.5 |

**What a consumer gets that 1.13.2 did not have:**

- **API testing with write safety.** It has four parts:
  - a write-safety policy;
  - a read-only API scaffold with four write gates and add-only hard exclusions;
  - the `qa-api-integration` skill;
  - an API conventions template.
- **Performance testing.** The `qa-performance-k6` skill and a k6 load scaffold, whose runner enforces the write-safety policy before k6 starts.
- **Automation patterns:**
  - a defect-polarity helper (`defects.ts`);
  - login only in global setup, so no credentials end up in traces;
  - opt-in Playwright projects for `writes`, `slow` and `login-flow`;
  - a fourth defect category, `recommendations/`;
  - the `qa-framework clock` command, which works offline.
- **Templates in `qa/00-standards/`:** an `AGENTS.md` rulebook template and a PR review rubric.
- **ADO tooling:**
  - `publish-results.ps1`;
  - an idempotent `create-issue.ps1`;
  - fixes to the existing scripts' sessions and encoding;
  - a three-tier credential policy that splits read and write variables.

**Survey coverage** (34 items):

| Status | Count | Items |
|---|---|---|
| Shipped | 20 | A1-A6, B3, B4, B5, B6, B9, B10, C1, C2, C5, C8, C11, C12, C13, D1 (Claude Code half) |
| Closed, no change | 1 | B8: its premise was false, since the content was already merged in v1.11.3 |
| Parked (needs a human decision) | 8 | B1, B2, C4, C6, C7, C9, C10, C14 |
| Not addressed | 5 | B7, C3, C15, D2, D3: not in the plan's scope |

The package grew from 97 to 137 files (+40, none removed) and from 634 kB to 1,094 kB unpacked (+72.5%). All of the growth is planned content: the scaffolds, ADO scripts and skills. There are no binaries.

---

## 2. The quality evidence is strong

**Gates applied to every package before merge:**
- the test suite passed three times in a row;
- the forbidden-character and Spanish-accent checks were clean;
- the BOM policy was checked byte by byte;
- no internal names or URLs appeared in the published files;
- conventional commits, with no AI attribution.

**The coordinator re-ran every check independently and added checks of its own:**

- **Upgrade simulations from a real v1.13.2 install,** in each relevant scenario: untouched project, user-edited files, and a project that already had suffixed specs or its own `improvements/` folder. A second `upgrade` run changed zero bytes every time.
- **Real-tool runs where a worker had used stand-ins.** WP3.4 was checked on Playwright 1.65: project selection, workers inheriting the environment, and `loginAs` refusing in a project that records traces.
- **Adversarial probes of the API write gates.** 10 cases, each landing on the right gate.
- **Smoke installs of every rc from the registry** into an empty folder, with `validate --strict`.

**Nine defects were caught.** None of them reached npm:

| Defect | Caught by | Outcome |
|---|---|---|
| `sync-version.js` failed on every version after the first prerelease | Coordinator simulating three bumps | Fixed (WP0.2); rc.1 held |
| Flaky test race on tracked files (1 failure in 6 runs) | Coordinator re-runs | Fixed (WP0.3); rc.2 held |
| `upgrade` listed user-edited files as "already up to date" | Coordinator simulation | Fixed (WP1.7) |
| A path assertion that passed vacuously on Windows | CI on Linux | Test fixed |
| A refreshed config silently moved existing `*.slow/.writes/.login.spec.ts` out of `npm test` | Coordinator upgrade simulation | WP3.4 sent back; `upgrade` now holds the config and lists the specs |
| A network option in a shipped script (hard stop 6), requested by the coordinator's own brief | Coordinator review | Removed; a test forbids network modules in `clock.js` |
| PowerShell 7 read a BOM back as `U+FEFF` | CI on Linux (pwsh 7) | Fixed; static test added |
| `inject-ado-ids.ps1` matched no spec on Linux or macOS (backslash paths) | CI on Linux (pwsh 7) | Fixed; static test added |
| A release tag pushed with its commit, so publishing ran alongside CI instead of after it (process) | Coordinator | Process fixed; CI had passed 6 s earlier, so nothing unverified shipped |

**Three defects already in `latest` 1.13.2 are fixed in 1.14.0:**
- token authentication in the API scaffold never worked;
- `sync-ado-titles.ps1` failed outright on Windows PowerShell 5.1;
- `upgrade` misreported edited files.

**Tests by release** (runner output, `npm test`):

| Version | Tests |
|---|---|
| 1.13.2 | 202 |
| 1.14.0-rc.5 | 562, all passing on Windows; CI green on Node 20, 22 and 24 |

CI on Linux runs the PowerShell tests under pwsh 7. Windows runs them under 5.1. Node 20 skips 21 tests by design, because they need Node 22's built-in TypeScript stripping.

---

## 3. Existing projects are protected on `upgrade`

The rule from v1.13.x still holds: **never touch user code; when in doubt, don't move it and warn.** In 1.14.0 that means:

- **Ownership by content hash.** A file is refreshed only if it is byte-equivalent to a version the framework shipped. If the user edited it, it is kept and a warning names the template to merge from.
- **Behavior changes are held, never forced:**
  - While a test still calls `loginAs` outside a `*.login.spec.ts`, `fixtures/auth.ts` is not refreshed, and each call is listed with its file and line.
  - While a spec already ends in `.slow`, `.writes` or `.login`, `playwright.config.ts` is not refreshed, and those specs are listed.
- **New files only when missing:**
  - the standards documents;
  - `defects.ts`;
  - `06-defects/recommendations/`, unless the project keeps that category in `improvements/`.
- **`package.json` is never edited.** Missing scripts are printed as lines to add.
- **Never written anywhere:**
  - a root `AGENTS.md`, because coding agents load it automatically and an unfilled template there would act as live instructions;
  - the k6 scaffold in existing projects.
- **Opt-in by design:**
  - API writes need `QA_API_WRITE=1` plus an approved catalog entry;
  - k6 writes need `--allow-writes`, and concurrent writes need a dated authorization from the write approver.

The full list of 14 upgrade-visible changes is in appendix A.4.

---

## 4. Promotion needs two human actions and one choice

| # | Action | Owner | What it unblocks |
|---|---|---|---|
| 1 | Review `docs/review-wave2.md` (18 decisions) and `docs/review-wave3.md` (10 decisions). Reply "OK" or list the numbers to change | marcela.berriosc | Waves 2 and 3 become safe defaults for every project |
| 2 | Verify wave 4 against real Azure DevOps (checklist in appendix A.5) | Keber | The ADO scripts, which were built and tested with mocks only |
| 3 | Choose the promotion and name the version explicitly | Keber | `latest` |

**The choice in action 3:**

- **Promote rc.5** (recommended once actions 1 and 2 are done). Consumers get everything above.
- **Promote rc.2 now.** It contains only waves 0 and 1, so it needs neither review, and it ships the bug fixes sooner. Waves 2 to 4 follow in a later minor release.
- **Wait.** Nothing is lost: `latest` stays at 1.13.2 and consumers are unaffected.

A promotion branches from the promoted rc tag, not from the tip of `dev`, renames `[Unreleased]` in the CHANGELOG, and publishes from `main` (`docs/autonomous-release-plan.md`, decision log).

---

## Appendix

### A.1 Work packages

| WP | Outcome | Survey | rc | Commit |
|---|---|---|---|---|
| WP0.1 | Prereleases publish only to `next`; `latest` only from `main`; the version must match the tag | - | rc.1 | `3c2dc8d` |
| WP0.2 | `sync-version.js` handles prerelease versions | - | rc.1 | `58e2b60` |
| WP0.3 | Test race on tracked files removed | - | rc.2 | `0f77188` |
| (pre-plan) | `upgrade` moves only proven legacy paths; complete hash table; lane holder check; Claude Code lane protocol | A1, D1 | rc.1 | `a2fe18e`, `0d9f2bf`, `e1c25aa`, `cd4dc8a` |
| WP1.1 | Installed rules show the installed package version | A2 | rc.2 | `e09b3d3` |
| WP1.2 | Scaffold config without credentials at load time; base URL from the manifest | A4 | rc.2 | `df4172d` |
| WP1.3 | Rule 11 also requires correct Spanish; published files scanned | A5, B4 | rc.2 | `98b87fa` |
| WP1.4 | BOM policy by file type | B5 | rc.2 | `aeeb28b` |
| WP1.5 | Closed without change (false premise) | B8 | - | - |
| WP1.6 | ADO work item full-read protocol | B9 | rc.2 | `2e59409` |
| WP1.7 | `upgrade` reports user-owned files correctly | - | rc.2 | `378cccd` |
| WP2.1 | Write-safety policy | cand. 1 | rc.3 | `e023cc2` |
| WP2.2 | API integration scaffold with four write gates | cand. 2 | rc.3 | `235c0a5` |
| WP2.3 | `qa-api-integration` skill and conventions | cand. 2 | rc.3 | `b23cad2` |
| WP2.4 | `upgrade` delivers standards and the API guard | - | rc.3 | `eecbcef` |
| WP3.1 | `qa-performance-k6` skill and k6 scaffold | cand. 3 | rc.4 | `f5e63c4` |
| WP3.2 | Azure Load Testing proposal (not shipped) | cand. 3 | - | `777467e` |
| WP3.3 | Defect-polarity helper | C1 | rc.4 | `b41154e` |
| WP3.4 | Login only in global setup; opt-in projects | C5, C8 | rc.4 | `d0e1948` |
| WP3.5 | `AGENTS.md` template | B6, C12 | rc.4 | `3110f85` |
| WP3.6 | `recommendations/` category; `qa-framework clock` | B3, C2 | rc.4 | `83606f3` |
| WP4.1 | Explicit ADO session; UTF-8 bodies; suite pagination guidance | A3, A6 | rc.5 | `67e9ed5` |
| WP4.2 | `publish-results.ps1`, idempotent `create-issue.ps1`, encoding fixes | C11 | rc.5 | `dd2e4a2`, `4616899`, `bc90677` |
| WP4.3 | Credential policy with read/write split; PR review rubric | B10, C13 | rc.5 | `c89781e`, `7449c83` |

### A.2 Release candidates (npm registry, 2026-11-12 UTC)

| Version | Commit | Published | Unpacked bytes | Files | vs 1.13.2 |
|---|---|---|---|---|---|
| 1.13.2 | `e6a7795` | 2026-11-06 | 634,041 | 97 | - |
| 1.14.0-rc.1 | `4199602` | 04:03 | 665,270 | 97 | +4.9% |
| 1.14.0-rc.2 | `07d187d` | 05:25 | 698,904 | 98 | +10.2% |
| 1.14.0-rc.3 | `fa3a859` | 06:17 | 833,116 | 117 | +31.4% |
| 1.14.0-rc.4 | `71f0345` | 11:56 | 1,005,674 | 133 | +58.6% |
| 1.14.0-rc.5 | `3456e7e` | 13:33 | 1,093,714 | 137 | +72.5% |

Source changes from 1.13.2 to rc.5: 131 files, +19,157 / -627 lines, 73 commits (52 without merges).

Every rc was published by the guarded workflow with provenance, under `next`, after CI passed on the release commit. `latest` was never touched.

### A.3 Decisions taken autonomously that Keber should know

1. **Prereleases go to `next`; only a human promotes.** Seven consumers use `^` ranges, and a publish cannot be undone.
2. **A promotion branches from the rc tag being promoted.** That makes rc.2 promotable without waves 2 to 4.
3. **`CHANGELOG.md` keeps `[Unreleased]` through every rc.** It is renamed only in the promotion commit.
4. **The token auth fix (Bearer header) was accepted as a fix and flagged for review.** The previous scaffold never worked.
5. **Write scopes have English names (`isolated/syncs/forbidden`).** The Spanish names are rejected, not aliased.
6. **`AGENTS.md` is never written to the project root.** Coding agents load it automatically.
7. **`upgrade` delivers the k6 skill but not the k6 scaffold.** That kept `upgrade.js` serialized; a later release can deliver it.
8. **The B3 category is named `recommendations/`.** An existing `improvements/` folder is respected.
9. **The ADO read/write split uses four variables with a fallback.** A PAT cannot be scoped to one project.
10. **`--check-http` was removed from `qa-framework clock` instead of stopping the plan.** It can return with Keber's OK.

### A.4 Changes existing projects see on `upgrade`

1. Installed rules are stamped with the package version.
2. `.claude/rules/qa-framework.md` is overwritten. It now has rule 12, the lane dispatcher protocol and the full rule 11.
3. Legacy paths move only on proof of the old layout; anything left in place is listed.
4. Untouched lane scripts are refreshed; edited ones are reported as "NOT refreshed".
5. "Already up to date" now means identical to the template. Edited files are listed as warnings, and `qa/memory/` files under "Kept".
6. Missing `00-standards` documents are created; existing copies are never touched.
7. The API guard files are delivered all-or-nothing with their imports. A project-owned `fixtures/base.ts` blocks them.
8. An untouched `playwright.config.ts` and `global-setup.ts` are refreshed, unless suffixed specs exist; then the config is held and the specs are listed.
9. In-test `loginAs(` calls are listed, and an untouched `auth.ts` is held while any remain.
10. `defects.ts` is delivered when missing.
11. `06-defects/recommendations/` is added, unless the project uses `improvements/`.
12. The `qa-api-integration` and `qa-performance-k6` skills and their commands are delivered. The k6 scaffold is not.
13. `package.json` is never edited. Missing scripts are printed.
14. The ADO scripts (in the package, so they update with `npm install`) prefer `ADO_*_WRITE` and `ADO_*_READ`, with `ADO_PROJECT` and `ADO_PAT` as fallback.

### A.5 Real Azure DevOps checklist for wave 4 (Keber)

Wave 4 was built and tested with mocks only. CI ran the scripts on PowerShell 7 (Linux) and the coordinator on 5.1 (Windows), but nothing has called a real ADO organization. Use a test plan in a QA project, never production.

- [ ] **`publish-results.ps1` run lifecycle.** The run is created and bound to the right test points. Outcomes and comments appear in the test plan. The run ends as Completed.
- [ ] **Point listing.** A suite with more than 200 points pages correctly. The response shape matches `testCaseReference.id`, `results.outcome` and the run's `testPoint.id`.
- [ ] **Already-run guard.** It fires on a point that already has an outcome, and `-Force` overrides it.
- [ ] **`create-issue.ps1` deduplication.**
  - The exact-title search finds an existing item.
  - `-DedupKey` finds a tagged item.
  - A new Bug or Issue is created with its description, priority, tags and links.
- [ ] **Accents.** Text with accents arrives intact on 5.1 and 7, including the error path with an expired PAT (401).
- [ ] **`create-testplan-from-mapping.ps1`.**
  - It works with only the environment variables set (no `load.ps1`).
  - It auto-loads from a real `node_modules/@keber/ado-powershell`.
- [ ] **`ADO_ORG`.** An org given as a URL is accepted.
- [ ] **Read/write split.** A shell with only `ADO_PAT_READ` cannot write. Write scripts pick up `ADO_PAT_WRITE`.

### A.6 Parked items and what unblocks them

| Item | Unblocked by |
|---|---|
| B1/B2 skip-state vocabulary | Choosing between `PENDING-BROWSER` and the retired variant (rule 8b) |
| Candidate 4 / C14 execution report | Choosing Word or LaTeX, and whether skills may carry npm dependencies |
| C4 SQL guard and DB layer | Approving database access to systems under test (security-sensitive) |
| C6, C9, C10 | Deciding whether mechanics validated only on live Blazor/Radzen apps generalize |
| C7 Claude Code bridge | Re-assessment; mostly covered by `.claude/rules` and `.claude/commands` |
| Candidate 5, 6F | Reviewing the vigilante and the companion assets |
| 6G | Actions inside the consumer repositories |
| `ado-workitem-quality` remote | A human creates the repository |
| Azure Load Testing (WP3.2) | The proposal finds ALT does not run k6. It needs a subscription, a cost owner and network access to the QA hosts. marcela.berriosc to confirm the premise |
| `qa-framework clock --check-http` | Keber's OK for network access in a shipped script |
| `Get-AdoTestSuites` truncates at 200 | A fix upstream in `@keber/ado-powershell` (another repository) |

**Known minor debt.** `templates/agents/qa-investigador.md` still says heartbeats are mandatory, which contradicts the accepted heartbeat decision. This was already recorded in `docs/decisions/lane-heartbeat-caller.md`. It is harmless, but should be reworded.

### A.7 Lessons recorded for the next plan

- **Release discipline.** Push branches with `--no-follow-tags`, and push a release tag only after CI is green on its commit.
- **Workers run on Windows; CI runs on Linux.** Path assertions must accept both separators.
- **PowerShell 5.1 and 7 differ.** CI is the only pwsh 7 run, and it caught two bugs.
- **Independent coordinator checks pay off.** Simulations, re-runs and reviews by the coordinator caught six of the nine defects; CI on Linux caught the other three.
- **Briefs must be checked against the stop conditions too.** WP3.6 broke a hard stop because its brief asked for it.
- **Smoke installs use `--prefer-online`.** The registry cache lags for several minutes after a publish.
- **Session tooling.** Cards drop `source_branch`, and sessions cannot be started from event-driven turns. Isolated-worktree subagents were the fallback for WP3.6 and wave 4.
- **Write edit scripts to a file, not inline in the shell.** Inline shell scripts collapsed backslashes twice.
