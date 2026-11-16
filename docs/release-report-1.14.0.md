# Release report: 1.14.0 autonomous release plan (waves 0-7)

**For**: Keber (release owner); sections 3 and 5 also concern marcela.berriosc
**Prepared by**: the release coordinator, 2026-11-12; updated 2026-11-16 to rc.9
**Covers**: `@keber/qa-framework` 1.13.2 (npm `latest`) to 1.14.0-rc.9 (npm `next`)
**Sources**: `docs/autonomous-release-plan.md` (tracking table, wave 5 section, decision log), `CHANGELOG.md` `[Unreleased]`, git history `v1.13.2..v1.14.0-rc.9`, the npm registry, and the coordinator's verification runs. Figures were re-checked on 2026-11-16; where two sources disagreed, the registry or the test runner wins.

---

## The answer

**1.14.0-rc.9 delivers the whole autonomous plan plus three waves driven by upgrading copies of real consumer projects: 20 of the 34 survey items, all three of marcela.berriosc's candidates, and an `upgrade` that keeps every project edit to a framework file recoverable. Every package was independently verified before merge, and no defect caught by those checks reached npm. It can become `latest` once two human checks are done: marcela.berriosc's review and a real Azure DevOps check of wave 4.**

Four findings support this:

1. **The scope is delivered.** 26 work packages across eight waves, plus the rc.6 fix set: release plumbing, bug fixes, API testing with write governance, performance and automation patterns, ADO scripts, then upgrade ownership and content harvested from four real projects.
2. **The quality evidence is strong.** Tests went from 202 to 659. Each package passed the coordinator's own checks before merge. Twelve defects were caught, all before the affected rc was tagged; real-project upgrade tests then found five defects and one ownership gap in rcs under `next`, all fixed by rc.7.
3. **Existing projects are protected on `upgrade`.** An edited framework file is backed up, with a triage report, before it is overwritten; nothing is deleted or moved without a backup; `package.json` is never edited; behavior changes for existing suites are held back and listed. Copies of four real projects upgraded with no deletions and no lost edit.
4. **Promotion needs two human actions and one choice.** marcela.berriosc reviews 28 decisions, Keber checks wave 4 against real ADO, and Keber picks which tag to promote (rc.9 is the latest candidate).

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
| - | Fixes from Keber's upgrade of a real project: `mcpNamespace`, `--version`, `[updated]`, agent ownership, ASCII output | rc.6 fix set | rc.6 |
| 5 | Upgrade ownership and content harvested from four projects: rules 13-14, dependency discovery, backups with triage | WP5.1-WP5.3 | rc.7 |
| 6 | Wave 5 follow-ups: manifest check on CRLF, test-data template, sprint naming | WP6 | rc.8 |
| 7 | CLI command suggestion; `TRIAGE.md` fencing pinned by tests | WP7 | rc.9 |

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
- **Agent rules:** 15 rules numbered 0-14. Rule 13 (BLOCKING) requires reading an ADO work item in full; rule 14 authorizes PowerShell and requires copying that authorization verbatim into sub-agent prompts; rule 8 renders the project's defect prefix from `conventions.defectIdPattern`.
- **Analysis guidance harvested from a real project:**
  - cross-module dependency discovery (section 2.7) and a `Dependency` business rule type;
  - an upstream dependencies table, also in the `04-test-data.md` template;
  - the anti-pattern of declaring a field empty after one value;
  - an ADO Conditional Access (VS403463) note.
- **CLI:** `--version`, ASCII-only output, and a suggestion for a mistyped command (`--upgrade` -> `Did you mean "upgrade"?`, exit code still 1). Sprint folders are `Sprint-{N}`, unpadded, everywhere.

**Survey coverage** (34 items):

| Status | Count | Items |
|---|---|---|
| Shipped | 20 | A1-A6, B3, B4, B5, B6, B9, B10, C1, C2, C5, C8, C11, C12, C13, D1 (Claude Code half) |
| Closed, no change | 1 | B8: its premise was false, since the content was already merged in v1.11.3 |
| Parked (needs a human decision) | 8 | B1, B2, C4, C6, C7, C9, C10, C14 |
| Not addressed | 5 | B7, C3, C15, D2, D3: not in the plan's scope |

The package grew from 97 to 141 files (+44, none removed) and from 634 kB to 1,203 kB unpacked (+89.7%). All of the growth is planned content: the scaffolds, ADO scripts, skills and, in rc.7, the ownership manifest (about 30 KB); rc.7 grew 8.3% over rc.6, inside wave 5's +10% budget. There are no binaries.

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
- **Upgrades of copies of real consumer projects.** The rc.7 gate re-ran four untouched copies (Enrolamiento, BioFruit, Exportadora, GMOIndustrial) with a CI-equivalent LF tarball: all exit 0, no deletions, a second run changed 0 bytes, and backups appeared for exactly the edited files (section 3). Keber re-ran rc.8 on three copies himself with the same backup counts.

**Twelve defects were caught.** None of them reached npm:

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
| The `.github/copilot-instructions.md` migration deleted or stripped a possibly edited file with no backup | Worker's report; coordinator review | WP5.3 sent back; all 8 delete, strip or move sites now back up first and abort that step if the backup fails |
| `build-ownership-manifest.js --check` reported stale on a Windows CRLF checkout (repository script, not published) | Coordinator, integrating wave 5 | Fixed in rc.8; compares line-ending agnostic |
| Ownership manifest stale on `dev` after the rc.8 tag (its header lists released versions) | Worker (wave 7) | Regenerated before the rc.9 bump |

**One false finding, by the coordinator, not counted above.** It reported `TRIAGE.md` as quoting project lines unfenced; the evidence was an `rg '^#'` match inside a code fence. The wave 7 worker showed the fencing existed since WP5.3 and only pinned it with tests, which fail without it.

**Found after publication, under `next` only.** Keber's upgrade of a real project copy to rc.5 found five defects, fixed in rc.6: bare `mcpNamespace` names rejected, `--version` missing, `[updated]` printed for unchanged files, agents overwritten without an ownership check, and emoji garbled in PowerShell 5.1 redirects. His four-project test of rc.6 found that `upgrade` force-wrote five kinds of framework files that three projects had edited; wave 5 fixed it in rc.7. No consumer received either, because `^` ranges never resolve to an rc.

**Three defects already in `latest` 1.13.2 are fixed in 1.14.0:**
- token authentication in the API scaffold never worked;
- `sync-ado-titles.ps1` failed outright on Windows PowerShell 5.1;
- `upgrade` misreported edited files.

**Tests by release** (runner output, `npm test`):

| Version | Tests |
|---|---|
| 1.13.2 | 202 |
| 1.14.0-rc.5 | 562, all passing on Windows; CI green on Node 20, 22 and 24 |
| 1.14.0-rc.7 | 646 |
| 1.14.0-rc.8 | 651 |
| 1.14.0-rc.9 | 659, all passing; CI green on the release commit |

CI on Linux runs the PowerShell tests under pwsh 7. Windows runs them under 5.1. Node 20 skips 21 tests by design, because they need Node 22's built-in TypeScript stripping.

---

## 3. Existing projects are protected on `upgrade`

The rule from v1.13.x still holds: **never touch user code; when in doubt, don't move it and warn.** In 1.14.0 that means:

- **Ownership by content hash for scaffold files.** A file is refreshed only if it is byte-equivalent to a version the framework shipped. If the user edited it, it is kept and a warning names the template to merge from.
- **Edited framework-owned files are backed up, then overwritten.** Skills, commands, agents, rules, instructions and the folder guide are checked against a manifest of every shipped version (rules normalized for version and defect prefix). A pristine file, or one with an intact generated marker, is overwritten. An edited one is first copied to `.claude/qa-framework-backup/upgrade-to-<version>/`, which no agent loads, and `TRIAGE.md` there lists the lines the project added, fenced so they cannot act as instructions. Overwriting is deliberate: most project edits had already reached the framework in stronger form.
- **Nothing is deleted, stripped or moved without a backup.** All 8 such sites back up first and skip the step if the backup fails.
- **Verified on four real projects.** Backups: Enrolamiento 2 files (rules, guide), BioFruit 1 (rules; its only instructions edit, the defect prefix, is now rendered from its config), Exportadora 21 (8 commands, the guide, 12 skill files), GMOIndustrial none.
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

The full list of 17 upgrade-visible changes is in appendix A.4.

---

## 4. Promotion needs two human actions and one choice

| # | Action | Owner | What it unblocks |
|---|---|---|---|
| 1 | Review `docs/review-wave2.md` (18 decisions) and `docs/review-wave3.md` (10 decisions). Reply "OK" or list the numbers to change | marcela.berriosc | Waves 2 and 3 become safe defaults for every project |
| 2 | Verify wave 4 against real Azure DevOps (checklist in appendix A.5) | Keber | The ADO scripts, which were built and tested with mocks only |
| 3 | Choose the promotion and name the version explicitly | Keber | `latest` |

**The choice in action 3:**

- **Promote rc.9** (recommended once actions 1 and 2 are done). Consumers get everything above.
- **Promote rc.2 now.** It contains only waves 0 and 1, so it needs neither review, and it ships the bug fixes sooner. Waves 2 to 7 follow in a later minor release.
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
| (rc.6) | Bare `mcpNamespace` accepted; `--version`; `[updated]` only on change; agent ownership marker and backup; ASCII CLI output | - | rc.6 | `a139065`..`ee238a4` |
| WP5.1 | Rules 13 and 14; rule 8 rendered from `defectIdPattern`; framework-owned header in both rule files | - | rc.7 | `945d7c1` |
| WP5.2 | Dependency discovery (2.7), `Dependency` rule type, upstream dependencies table, single-value anti-pattern, ADO Conditional Access note; sprint tree in the guide | - | rc.7 | `b146861`, `87c8612` |
| WP5.3 | Shipped-version manifest; backups with `TRIAGE.md`; generated marker on commands; backup before every delete, strip or move | - | rc.7 | `17adc8f`, `f4db086`, `7f1cebc` |
| WP6 | Manifest `--check` line-ending agnostic; upstream dependencies table in `04-test-data.md`; unpadded `Sprint-{N}`; one scaffold hash registered | - | rc.8 | `3542539`, `b8d95db`, `19a2a3c`, `8c62f19` |
| WP7 | CLI suggests the intended command; `TRIAGE.md` fencing pinned by tests | - | rc.9 | `a5a9b95`, `a0b9ffb` |

### A.2 Release candidates (npm registry, UTC; checked 2026-11-16)

| Version | Commit | Published | Unpacked bytes | Files | vs 1.13.2 |
|---|---|---|---|---|---|
| 1.13.2 | `e6a7795` | 2026-11-06 | 634,041 | 97 | - |
| 1.14.0-rc.1 | `4199602` | 2026-11-12 04:03 | 665,270 | 97 | +4.9% |
| 1.14.0-rc.2 | `07d187d` | 2026-11-12 05:25 | 698,904 | 98 | +10.2% |
| 1.14.0-rc.3 | `fa3a859` | 2026-11-12 06:17 | 833,116 | 117 | +31.4% |
| 1.14.0-rc.4 | `71f0345` | 2026-11-12 11:56 | 1,005,674 | 133 | +58.6% |
| 1.14.0-rc.5 | `3456e7e` | 2026-11-12 13:33 | 1,093,714 | 137 | +72.5% |
| 1.14.0-rc.6 | `66a0def` | 2026-11-13 14:50 | 1,104,627 | 137 | +74.2% |
| 1.14.0-rc.7 | `810a269` | 2026-11-13 18:24 | 1,196,581 | 141 | +88.7% |
| 1.14.0-rc.8 | `93f50a9` | 2026-11-13 20:47 | 1,199,649 | 141 | +89.2% |
| 1.14.0-rc.9 | `a397aff` | 2026-11-16 17:02 | 1,202,641 | 141 | +89.7% |

Dist-tags on 2026-11-16: `latest` 1.13.2, `next` 1.14.0-rc.9. Source changes from 1.13.2 to rc.9: 162 files, +23,560 / -737 lines, 113 commits (85 without merges).

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
11. **`upgrade` backs up an edited framework file, then overwrites it.** Keeping the old file would freeze a project out of improvements that had already absorbed its edits.
12. **The canonical sprint folder is unpadded `Sprint-{N}`.** Taken from code: `init.js` and `upgrade.js` write it and no code parses the name, so padded folders keep working.
13. **The ownership manifest is regenerated after every release tag.** Its header lists the released versions.

### A.4 Changes existing projects see on `upgrade`

1. Installed rules are stamped with the package version.
2. `.claude/rules/qa-framework.md` is overwritten (after a backup if edited). It now has rules 12-14, the lane dispatcher protocol, the full rule 11 and the project's defect prefix in rule 8.
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
15. Edited skills, commands, agents, rules, instructions and the folder guide are backed up to `.claude/qa-framework-backup/upgrade-to-<version>/` with a `TRIAGE.md`, then overwritten, with a warning naming the backup. A second run creates no new backup.
16. Every delete, strip or move of a project file, including the `.github/copilot-instructions.md` migration, backs it up first and skips the step if the backup fails.
17. Generated commands and agents carry an ownership marker, so later upgrades recognize them as pristine.

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

**Known minor debt.** None of it blocks promotion; the wave 5 follow-ups were closed in rc.8.
- `templates/agents/qa-investigador.md` still says heartbeats are mandatory, which contradicts the accepted heartbeat decision recorded in `docs/decisions/lane-heartbeat-caller.md`. It should be reworded.
- The sprint placeholder token varies (`{N}`, `{{N}}`, `<N>`), although every form is unpadded.
- `templates/specification/04-test-data.md` has a pre-existing warning emoji and a non-ASCII comparison sign.

### A.7 Lessons recorded for the next plan

- **Release discipline.** Push branches with `--no-follow-tags`, and push a release tag only after CI is green on its commit.
- **Workers run on Windows; CI runs on Linux.** Path assertions must accept both separators.
- **PowerShell 5.1 and 7 differ.** CI is the only pwsh 7 run, and it caught two bugs.
- **Independent coordinator checks pay off.** Simulations, re-runs and reviews by the coordinator caught seven of the twelve defects, CI on Linux three, and workers' own reports two.
- **Real-project upgrades find what simulations miss.** Keber's runs on copies of consumer projects found five defects and the ownership gap that drove waves 5 to 7.
- **Read the context before reporting a search match.** `rg '^#'` also matches lines inside code fences; that produced the coordinator's false `TRIAGE.md` finding.
- **Regenerate the ownership manifest after every release tag.** Its header lists released versions; rc.8 left it stale on `dev`.
- **Decide conventions from what code writes and parses, not from prose.** Sprint naming was settled that way.
- **Briefs must be checked against the stop conditions too.** WP3.6 broke a hard stop because its brief asked for it.
- **Smoke installs use `--prefer-online`.** The registry cache lags for several minutes after a publish.
- **Session tooling.** Cards drop `source_branch`, and sessions cannot be started from event-driven turns. Isolated-worktree subagents were the fallback for WP3.6 and wave 4.
- **Write edit scripts to a file, not inline in the shell.** Inline shell scripts collapsed backslashes twice.
