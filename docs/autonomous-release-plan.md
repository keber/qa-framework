# Autonomous release plan for the upstream candidates

**Date**: 2026-11-12, local date (America/Santiago)
**Status**: approved by Keber Flores on 2026-11-12; in execution
**Source**: `docs/upstream-candidates.md` (the 2026-11-11 survey; frozen, not edited by this plan)

## Purpose

Port the actionable items of the survey into the framework through a series of
releases, with as little human supervision as is safe. This document defines
who does what, how releases are published, which work runs autonomously, and the
conditions under which autonomous work stops and waits for a human decision.

## Roles

| Role | Who | Does | Never does |
|---|---|---|---|
| Coordinator | The planning session (Claude) | Splits work into packages, writes briefs, launches one worker session per package, reviews every result independently (re-runs tests, runs upgrade simulations), merges to `dev`, publishes release candidates, keeps the tracking table and decision log | Implements non-trivial changes itself; promotes a release to `latest` without the human's word |
| Worker | One Claude Code session per work package, Opus 5.5, own worktree cut from `dev` | Verifies the survey premise first, implements, tests, commits to its own branch, reports | Pushes, opens PRs, merges, publishes, writes outside this repository |
| Approver | Keber Flores | Approves this plan; promotes a release candidate to `latest`; answers escalations | - |
| Reviewer | Marcela Berrios | Reviews the release candidate that carries her ported work before it is promoted | - |

## Release model

Decided on 2026-11-12: **autonomous prereleases, human promotion.**

All seven consumer projects depend on `^` ranges (`^1.12.0`, `^1.11.3`), so any
version published as `latest` reaches them on their next `npm install`,
postinstall included. A publication cannot be undone, only deprecated.
Prereleases avoid that: `^` ranges never match a prerelease version, so a
`X.Y.Z-rc.N` published under the `next` dist-tag reaches nobody until a human
promotes it.

```
worker branches --(coordinator review)--> dev --(npm version X.Y.Z-rc.N, tag)--> npm @next
                                                                                     |
                                                     human: "promote X.Y.Z" ---------+
                                                                                     v
                                  release/X.Y.Z --> PR to main (CI) --> merge --> tag vX.Y.Z --> npm @latest
                                                                                     |
                                                                       main merged back into dev
```

Versioning rules:

- One pending version at a time. While `X.Y.Z` is not promoted, later waves add
  to it as `X.Y.Z-rc.N+1` instead of opening a new version line.
- The first pending version is **1.14.0**: what is already on `dev` adds a
  Claude Code rule and changes `lane-lock.js` behaviour, which is a minor bump.
- Promotion is triggered only by an explicit instruction from Keber in chat
  naming the version. The coordinator then performs the mechanics.

## Wave 0 - Release plumbing, then ship what is on `dev`

**WP0.1 - Publishing guards** (`.github/workflows/publish.yml`, `ci.yml`). Required:
today a prerelease tag would fail to publish (current npm requires `--tag` for
prerelease versions), and nothing stops a `latest` publication from `dev`.

- A tag with a prerelease suffix (`v*-*`) publishes with `--tag next`.
- A plain tag (`vX.Y.Z`) publishes `latest` only if the tagged commit is on
  `main`; otherwise the job fails before `npm publish`.
- Every publish fails if `package.json` version differs from the tag.
- `ci.yml` also runs on pushes to `dev`, so every merge gets the Node 20/22/24
  matrix and the scaffold-then-validate check, not only the coordinator's local run.

**Release 1.14.0-rc.1** - the content already on `dev`: the `upgrade.js` legacy
layout fix, the scaffold hash table and invariant, the `lane-lock.js` holder
check, rule 12 and the dispatcher protocol for Claude Code, and the survey.

## Wave 1 - Framework bugs and convergent fixes (fully autonomous)

High confidence: each item has field evidence and a testable outcome.

| WP | Items | Content |
|---|---|---|
| 1.1 | A2 | `{{VERSION}}` left stale in `.claude/rules/` and `.github/instructions/`. Worker must first rule out "the project simply never ran `upgrade`" |
| 1.2 | A4 | Scaffold `playwright.config.ts`: `QA_BASE_URL` falls back to `project.qaBaseUrl`; no credential validation at config load time |
| 1.3 | A5, B4 | Rule 11 second half (Spanish must be correct Spanish, plus the propagation clause) in both `qa-framework.instructions.md` and `qa-framework.rules.md`; a test that every shipped template and skill passes the forbidden-character check |
| 1.4 | B5 | Encoding policy by file type: `.ps1` UTF-8 with BOM, everything else without. Formatting rules plus checker plus the shipped `.ps1` files |
| 1.5 | B8 | Ship `priority-and-feasibility.md` in `skills/qa-test-plan/references/` (byte-identical in three consumers; verify, then copy) |
| 1.6 | B9 | ADO work item full-content read protocol as a reference of `qa-ado-integration`, User Story included |

## Wave 2 - API integration and write governance (candidates 1 and 2)

Ported from `sispro-modular`. **This release candidate is reviewed by Marcela
before promotion**; the coordinator prepares a review summary for her.

| WP | Content |
|---|---|
| 2.1 | One written write-safety policy (the cross-cutting decision of the survey), referenced by both API and performance testing |
| 2.2 | Integration scaffold: read-only client with endpoint catalog, the four write gates, hard exclusions in code that a project can extend but not shrink, configurable envelope contract |
| 2.3 | `skills/qa-api-integration/SKILL.md` and `templates/api-testing-conventions.md` |

Coordinator decisions taken from the survey's own recommendations unless a
worker finds evidence against them: deny list lives in code and is add-only;
API testing is part of stage 5, not a new stage; the endpoint discovery
pipeline ships as a documented method, not as code.

## Wave 3 - Performance and automation patterns

| WP | Items | Content |
|---|---|---|
| 3.1 | Candidate 3 | `qa-performance-k6` skill, optional stage, reusing the WP2.1 policy. Reviewed by Marcela with wave 2 if both are pending together |
| 3.2 | Candidate 3 | Azure Load Testing: research only. Output is a proposal document, nothing shipped |
| 3.3 | C1 | Defect-suite polarity (`openDefect`, `InfraError`, the prescribed order, diagnostic mode) as scaffold helper plus `qa-automation` guidance |
| 3.4 | C5, C8 | Login only in global setup (trace safety); opt-in Playwright projects with shell-free launchers |
| 3.5 | B6, C12 | `AGENTS.md` template: the converged ten-section structure, "what NOT to report", tracked exception IDs |
| 3.6 | B3, C2 | Fourth defect category; real-clock helper as a Node script (the framework is Node, not PowerShell) |

## Wave 4 - Azure DevOps integrations (autonomous build, human-verified)

Nothing here may call Azure DevOps during autonomous work. Workers implement
and test with mocks; the release candidate notes state that real-ADO
verification is pending, and **promotion requires Keber to verify against ADO**.

| WP | Items | Content |
|---|---|---|
| 4.1 | A3, A6 | `New-AdoTestCase` session scope; suite listing via `?expand=children` (flat list paginates at 200) |
| 4.2 | C11 | `publish-results.ps1` (manual results linked to test points); idempotent `create-issue.ps1` |
| 4.3 | B10, C13 | Three-tier credential policy and `ADO_PROJECT_READ`/`WRITE` split as guidance; PR review rubric as a template |

## Parked - needs a human decision, outside autonomous scope

| Item | Why parked |
|---|---|
| B1/B2 skip-state vocabulary | Collision between framework (`PENDING-BROWSER`) and Exportadora rule 8b, which retired it |
| Candidate 4, C14 | Execution report: Word (`sispro-modular`) vs LaTeX (Proyectos); reporting standard depends on the choice |
| C4 | SQL guard and DB layer: database access to systems under test, security-sensitive |
| C6, C9, C10 | Environment classifier, fixture engine, config-driven page object: validated only against live apps; Blazor/Radzen-shaped |
| C7 | The Claude Code bridge is largely covered already (`init` installs `.claude/rules` and `.claude/commands`); to be re-assessed, not ported |
| Candidate 5, 6F | Vigilante; companion projects (severity model, context manifest) |
| 6G | Hygiene inside consumer repositories: other repositories, not this one |
| `ado-workitem-quality` remote | Creating a repository is a human action |

## Stop conditions

### Hard stop - pause everything and wait for Keber

1. Anything that would publish to or move the `latest` dist-tag, or any observed
   change to `latest` that Keber did not order.
2. An upgrade simulation shows a user-owned file modified, moved or deleted.
3. Any write to a system other than: pushes to `dev` and worker branches, tags
   `v*-*`, npm `@next`. Explicitly excluded: Azure DevOps, messages to people,
   consumer repositories, pushes to `main` outside an ordered promotion.
4. Any need for credentials or secrets.
5. A change that would require a major version: removing a skill, renaming a
   config key, changing the shape of what `init` generates incompatibly.
6. A new runtime dependency (the package has none today), new network access in
   a shipped script, or a CI/publish workflow change beyond WP0.1.
7. A work package contradicts an accepted record in `docs/decisions/`, or can
   only proceed by deciding a parked item.

### Package stop - park that package, continue the others, report at the next rc

8. Tests or CI still failing after one correction round by the worker.
9. The survey's premise turns out false and the right action is not obvious.
   (If it is obvious - as with A1, where only the regression test remained - the
   coordinator decides and records it.)
10. The worker and the coordinator's independent check disagree on the outcome.

### Coordinator decides and records - no stop

Naming, file placement, wording, and design choices inside a package that the
survey already recommends or that a test can settle. Each one goes to the
decision log below; significant ones become a record in `docs/decisions/`.

## Quality gates

Per work package, before merging to `dev`:

- Coordinator re-runs `npm test` in the worker's worktree; no reliance on the
  worker's own report.
- No forbidden characters in changed files; UTF-8 without BOM except where B5
  says otherwise.
- Any change under `templates/automation-scaffold/` or `scripts/upgrade.js`:
  the coordinator runs an upgrade simulation on a pristine and an edited v1.12.0
  project, as was done on 2026-11-12.
- The scaffold hash invariant test stays green (it fails until a changed
  template's hash is registered).

Per release candidate:

- CI green on Node 20, 22 and 24 for the tagged commit.
- `npm pack --dry-run`: no internal documents in the tarball; size growth
  above 20% against the previous release is explained in the rc notes.
- After publishing: `npm view @keber/qa-framework dist-tags` shows `next` on the
  new rc and `latest` unchanged. Then install the rc in a scratch project and
  run `init`, `validate` and `validate --strict`.

## Concurrency

- At most two worker sessions at a time, and only on disjoint files (checked
  before launch).
- `scripts/upgrade.js` and the scaffold hash table are a serialisation point:
  only one package touching them at a time.

## Reporting

- At each release candidate: what is in it, the verification evidence, the
  decisions taken, packages parked and why, and anything Marcela should review.
- Hard stops are reported immediately, with the context and curated options.

## Tracking

| Wave | Package | Status | Branch / commit | Release |
|---|---|---|---|---|
| 0 | WP0.1 publish guards | merged to `dev`; CI green on `dev` | `3c2dc8d` | 1.14.0-rc.1 |
| 0 | WP0.2 prerelease-safe versions | merged to `dev`; four-bump simulation passes | `58e2b60` | 1.14.0-rc.1 |
| 1 | WP1.5 priority-and-feasibility | closed - already covered | - | - |
| 1 | WP1.6 ADO full-read protocol | done, held until rc.1 is tagged | `2e59409` | 1.14.0-rc.2 |

## Decision log

| Date | Decision | Reason |
|---|---|---|
| 2026-11-12 | Autonomous prereleases under `next`; human promotion to `latest` | Seven consumers on `^` ranges; publication is irreversible |
| 2026-11-12 | Port Marcela's work (candidates 1-3); she reviews the rc before promotion | Her decisions become defaults for every project |
| 2026-11-12 | Close WP1.5 (B8) without changes | The survey premise was false: `priority-and-feasibility.md` was merged on purpose into `skills/qa-test-plan/references/plan-de-pruebas-template.md` in `86550b5` (v1.11.3), which carries the P0-P3 tree and the feasibility table and is already linked from the skill. Consumers still hold the old file only because they run older versions |
| 2026-11-12 | Add WP0.2 to wave 0 and hold rc.1 for it | Simulating three bumps showed `sync-version.js` throws on any version after the first prerelease: its `frameworkVersion` pattern requires `X.Y.Z"`. Neither rc.2 nor the final promotion bump could be made. Release plumbing, so it belongs to wave 0 |
| 2026-11-12 | WP1.6 ships the ADO full-read protocol as a skill reference only, not as a new agent rule | A new rule would renumber the rules files that WP1.3 also edits; the rule can follow once WP1.3 lands |
| 2026-11-12 | `CHANGELOG.md` keeps `[Unreleased]` through every release candidate; it is renamed to `[X.Y.Z] - date` only in the promotion commit | Keep a Changelog has no convention for candidates, and renaming per rc would split one release's notes across several headings |
