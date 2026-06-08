---
applyTo: '**'
---
# QA Framework Instructions

This project uses `@keber/qa-framework` v{{VERSION}} for spec-driven automated testing.

## Agent behavior rules

0. **On every conversation start:** check if `qa/AGENT-NEXT-STEPS.md` exists. If it does, read it and complete its steps before anything else.
1. Before performing any QA task, load the relevant skill from `.github/skills/`. For project context, read `qa/memory/INDEX.md` if it exists, then load only the memory files relevant to the current task — do not load all memory files unconditionally. Never execute a pipeline stage unless its prerequisite is satisfied.
2. Always save artifacts in the correct `qa/` subfolder - refer to `qa/QA-STRUCTURE-GUIDE.md`
3. Never hardcode credentials - always use env vars and `<PLACEHOLDER>` in documentation
4. Follow the naming conventions in `qa/00-standards/naming-conventions.md`
5. Read previous test suites code in `qa/07-automation/e2e/tests/` if available before writing new automation to maintain consistency in style and approach
6. Project QA config is at `qa/qa-framework.config.json`
7. Save learnings in `qa/memory/` with proper naming and metadata. Always update `qa/memory/INDEX.md` after adding or updating any memory file.
8. **Sprint/module completion criteria:** A sprint or module is complete when every TC in scope has one of these three valid states - and no other: (a) `test()` passing: the app meets the spec; (b) `test.fail()`: the app violates the spec **and** a file `qa/06-defects/open/DEF-SIS-NNN_*.md` exists documenting which business rule is violated and what the app actually does; (c) `test.skip()`: the TC is not yet executable, annotated with `PENDING-CODE` and a linked issue. A sprint is **not** complete if any TC is failing without `test.fail()`, or has `test.fail()` without a defect file, or has `test.skip()` without a `PENDING-CODE` reason.
9. **On sprint/module completion:** (1) update the module status row in `qa/README.md`; (2) move the completed sprint checklist from `AGENT-NEXT-STEPS.md` to the `## Sprint History` section of `qa/README.md`; (3) trim `AGENT-NEXT-STEPS.md` so it contains only the next sprint — never let it accumulate more than one active sprint.
10. **Assertion polarity rule (BLOCKING):** A test must assert what the **spec** requires, not what the app currently does. If the app fails to meet the spec, use `test.fail()` + correct assertion to document the defect — **never invert or weaken an assertion to make a test go green.** A failing test that exposes a real defect is always more valuable than a passing test that hides one.
11. **Character encoding safety (BLOCKING):** In ALL generated content (markdown, scripts, test titles, ADO fields, config files), never use characters at these Unicode code points: em-dash (U+2014), en-dash (U+2013), horizontal ellipsis (U+2026), smart/curly quotes (U+201C, U+201D, U+2018, U+2019), or directional arrows (U+2190-U+21FF). Use ASCII equivalents instead: ` - ` (hyphen with surrounding spaces) for dashes, `...` for ellipsis, `"` and `'` for quotes, `->` and `<-` for arrows. Exception: Latin Extended characters (U+00C0-U+024F) are always permitted - this covers Spanish vowels with accents (U+00E0-U+00FA), n with tilde (U+00F1/U+00D1), and u/o with umlaut (U+00FC/U+00DC, U+00F6/U+00D6).

## Formatting rules for generated content
1. Generate the output in `UTF-8` encoding without BOM (`UTF-8`, no signature).
2. Ensure the raw output is `UTF-8` encoded with no `EF BB BF` bytes at the beginning.

## Azure DevOps integration

Before any ADO operation, check if `.github/skills/ado-qa/` exists or if
`integrations.ado.enabled` is `true` in `qa/qa-framework.config.json`. If either
condition is met, load `.github/skills/qa-ado-integration/SKILL.md` and use it for
all ADO interactions (work items, test plans, test cases, bugs, etc.).

> To enable Azure DevOps integration run: `npm install github:keber/ado-qa`

## QA Pipeline

Stages must run in order. Never start a stage unless its prerequisite is met.

| Stage | Task | Skill | Prerequisite |
|---|---|---|---|
| 1 | Analyze module | `.github/skills/qa-module-analysis/SKILL.md` | None |
| 2 | Generate specifications | `.github/skills/qa-spec-generation/SKILL.md` | 00-inventory.md exists |
| 3 | Generate test plan | `.github/skills/qa-test-plan/SKILL.md` | 05-test-scenarios.md exists |
| 4 | Generate test cases | `.github/skills/qa-test-cases/SKILL.md` | Test plan exists |
| 5 | Generate automation | `.github/skills/qa-automation/SKILL.md` | Specs approved, no PENDING-CODE |
| 5b | Stabilize failing tests | `.github/skills/qa-test-stabilization/SKILL.md` | Failing tests exist |
| 6 | Maintenance | `.github/skills/qa-maintenance/SKILL.md` | Application change delivered |
| — | ADO integration | `.github/skills/qa-ado-integration/SKILL.md` | ADO enabled in config |

## Project KB
1. `qa/README.md`          — The Living Index: module status, sprint history, blockers, quick-start commands.
2. `qa/memory/INDEX.md`    — Index of all memory files; load this before selecting which files to read.
