# docs/usage-with-agent.md

## Using `qa-framework` with an IDE Agent (GitHub Copilot or Claude Code)

---

## Overview

`init` and `upgrade` always generate artifacts for both GitHub Copilot and Claude Code
in parallel - there is no agent detection. This framework is designed so that either
IDE agent can:

1. Understand the QA structure by reading the agent instruction files
2. Navigate the `qa/` directory predictably
3. Generate spec, plan, test case, and automation artifacts
4. Maintain existing artifacts after code changes
5. Optionally synchronize results with Azure DevOps

---

## Quick Reference: What to Tell the Agent

```
# Install the framework
"Run npm install @keber/qa-framework for this project"

# Let the agent self-configure
"Read qa/AGENT-NEXT-STEPS.md and complete the setup steps"

# Analyze a module
"Analyze the module at [URL/route] using the qa-module-analysis skill"

# Generate spec, plan, cases, and automation
"For submodule {name}, generate all 6 spec files following the templates in qa/00-standards/"
"Generate a test plan for module {name}"
"Write Playwright E2E tests for TC-{ID} through TC-{ID}"

# Integrate results with Azure DevOps
"Load the qa-ado-integration skill and sync results with ADO"

# Maintenance
"Module {name} was updated. Load the qa-maintenance skill and update the affected artifacts"
```

---

## Setting Up Agent Instructions in VS Code (GitHub Copilot)

### Option A - Workspace instructions file (recommended)

`init` generates `.github/instructions/qa-framework.instructions.md` automatically. It contains the full
pipeline sequencer with 11 agent behavior rules, the QA pipeline table, and ADO detection.
No manual setup needed.

To regenerate after an upgrade:

```bash
npx qa-framework upgrade
```

### Option B - Reference skills directly in the agent conversation

Paste a skill path into the Copilot chat:

```
Read .github/skills/qa-module-analysis/SKILL.md and analyze the module at {URL}
```

### Option C - Individual task prompts

For each major QA task, ask the agent to load the relevant skill:

```
Load the qa-automation skill (.github/skills/qa-automation/SKILL.md) and implement
tests for the submodule {name}
```

---

## Setting Up Agent Instructions in Claude Code

`init` and `upgrade` generate two Claude-Code-native artifacts automatically, no manual
setup needed:

- `.claude/rules/qa-framework.md` - the Claude Code equivalent of the Copilot
  `.instructions.md` file. It has no frontmatter, which means it loads unconditionally in
  every session (the same effect as `applyTo: '**'`). It contains the same 11 agent
  behavior rules and pipeline table as the Copilot instructions, with every skill
  reference expressed as a `/qa-{name}` slash command instead of "load this file".
- `.claude/commands/qa-{name}.md` - one thin wrapper per skill, generated dynamically
  from whatever folders exist under `.github/skills/` at install/upgrade time. Each
  wrapper is a single instruction: `Read the full skill at .github/skills/qa-{name}/SKILL.md
  FIRST, then follow its instructions exactly`, plus the stage prerequisite. There is zero
  duplication of skill content and therefore zero drift - if a skill is updated, every
  command that points to it picks up the change with no regeneration needed.

### Using a command

In a Claude Code session, invoke the pipeline stage directly:

```
/qa-module-analysis
```

Claude reads `.github/skills/qa-module-analysis/SKILL.md` and follows it exactly, the
same way the Copilot pipeline table routes to that file.

### Regenerating after an upgrade

```bash
npx qa-framework upgrade
```

This refreshes both `.claude/commands/qa-*.md` and `.claude/rules/qa-framework.md` the
same safe way it refreshes the Copilot artifacts (framework-owned, always overwritten
with the current version; nothing else under `.claude/` is touched).

---

## Optional: ANALISIS/PLAN Mode (Claude Code only, ADO-gated)

Some teams run a sprint-centric manual testing workflow in parallel with the 6-stage
pipeline: an analysis document, a test plan trace-linked to Azure DevOps work items,
ad-hoc QA advisory chat, and a sprint closing results report. This mode is:

- **Optional** - off by default.
- **Gated** by `integrations.azureDevOps.sprintCycle.enabled` in
  `qa/qa-framework.config.json` (it requires Azure DevOps enabled, since three of the
  four agents depend on ADO work items or an ADO-generated execution report).
- **Claude Code only, by design, not by omission.** Each agent is a Claude Code subagent
  with its own `tools`/`model` frontmatter (e.g. `qa-asesoria` intentionally has no
  `Write`/`Bash`). GitHub Copilot has no equivalent primitive, so no `.github/` artifact
  is generated for this mode.

When enabled, `init`/`upgrade` generate four subagents under `.claude/agents/`:

| Agent | Purpose |
|---|---|
| `qa-analisis.md` | Analysis document: test universe, automation feasibility, P0-P3 prioritization, excluded universe, traceability matrix |
| `qa-plan.md` | Default mode: executive summary + a trace-linked test case table, executable within the configured manual-testing timebox |
| `qa-asesoria.md` | Chat-only QA advisory (no `Write`/`Bash`) - answers point questions, redirects to `qa-plan`/`qa-analisis` when a full document is actually needed |
| `qa-informe-resultados.md` | Narrative sprint closing report built from an execution report already produced by the `qa-ado-integration` skill; updates incrementally, never overwrites prior sections |

Sprint duration, manual-testing timebox, date format, and timezone are parameterized
from `integrations.azureDevOps.sprintCycle` (with neutral defaults - 8-day sprint,
2-day timebox, `dd-mm-aaaa`, `America/Santiago` - when a field is omitted). See
[docs/installation.md](installation.md) for the config shape.

---

## Typical Agent Session Workflow

### Session 1: Initial Module Analysis

```
1. Agent reads qa/AGENT-NEXT-STEPS.md (auto, on conversation start)
2. Agent loads .github/skills/qa-module-analysis/SKILL.md
3. Agent navigates to QA_BASE_URL using browser automation
4. Agent explores the module: screenshots, routes, form fields, APIs
5. Agent produces qa/01-specifications/module-{name}/submodule-{x}/ (6 files each)
6. Human reviews specs and approves before proceeding
```

### Session 2: Test Plan + Test Cases

```
1. Agent reads approved specs from 01-specifications/
2. Agent loads .github/skills/qa-test-plan/SKILL.md
3. Agent selects TCs for automation (P0/P1) and manual (P2/P3)
4. Agent writes qa/02-test-plans/{module}-automated-test-plan.md
5. Human reviews priorities
```

### Session 3: Automation

```
1. Agent reads approved test plan
2. Agent loads .github/skills/qa-automation/SKILL.md
3. Agent writes Playwright spec files in qa/07-automation/e2e/tests/{module}/
4. Agent runs tests from qa/07-automation/e2e/ (cd e2e && npx playwright test)
5. Agent writes qa/05-test-execution/automated/{date}.md
6. Human reviews automation coverage
```

### Session 4: ADO Sync (if enabled)

```
1. Agent loads .github/skills/qa-ado-integration/SKILL.md
2. Agent runs inject-ado-ids.ps1 to prefix test titles
3. Agent verifies runner output appears in ADO Test Plan
4. Agent updates qa/08-azure-integration/ado-ids-mapping-{project}.json
```

---

## Agent Do's and Don'ts

### DO

- Read `qa/AGENT-NEXT-STEPS.md` at the start of each conversation (auto-enforced by `.github/instructions/qa-framework.instructions.md` for Copilot, or `.claude/rules/qa-framework.md` for Claude Code)
- Load the relevant skill from `.github/skills/` before starting any QA task
- Save all artifacts in the exact path specified by `qa/QA-STRUCTURE-GUIDE.md`
- Use TC-ID, RN-ID, FL-ID naming consistently
- Replace credentials with `<PLACEHOLDER>` in any markdown output
- Reference the DEF-ID or ADO WI ID in every `test.skip()` call
- Validate test stability with >= 2 passes using different `EXEC_IDX` values
- Run Playwright from `qa/07-automation/e2e/` (`cd qa/07-automation/e2e && npx playwright test`)

### DON'T

- Invent test cases without first observing the QA environment
- Hardcode credentials, DNIs, or personal data in any file
- Save screenshots or debug output to the project root
- Modify files in `00-standards/` (those are project-customized after install)
- Create test cases for features marked `BLOCKED-PERMISSIONS` without noting the blocker
- Remove a `test.skip()` without verifying the underlying defect is resolved

---

## File Naming Quick Reference

```
Module spec folder:   qa/01-specifications/module-{kebab-name}/
Submodule folder:     qa/01-specifications/module-{x}/submodule-{kebab-name}/
TC ID format:         TC-{MODULE}-{SUBMODULE}-{NNN}     e.g. TC-OPER-CAT-001
RN ID format:         RN-{MODULE}-{NNN}                 e.g. RN-OPER-001
FL ID format:         FL-{MODULE}-{NNN}                 e.g. FL-OPER-001
Defect file:          DEF-{NNN}-{slug}.md               e.g. DEF-001-switch-default-off.md
Execution report:     YYYY-MM-DD_HH-MM-SS_desc.md
Test title (no ADO):  [TC-OPER-CAT-001] Title @P0
Test title (ADO):     [22957] Title @P0
Screenshot:           NNN-description.png in qa/07-automation/e2e/diagnosis/
```

---

## Checking Framework Compliance

At any time, the agent can be asked to validate the QA structure:

```
npx qa-framework validate
```

This performs:
- Structure check (all required folders exist)
- Config check (required fields populated)
- Credential scan (no hardcoded passwords in markdown)
- Naming check (TC IDs follow `TC-{MODULE}-{SUBMODULE}-{NNN}` pattern)
- Coverage check (all spec TCs have matching test file references)

---

## Continuing from a Previous Session

The agent reads `qa/AGENT-NEXT-STEPS.md` automatically at the start of every conversation
(enforced by rule 0 in `.github/instructions/qa-framework.instructions.md` for Copilot,
or `.claude/rules/qa-framework.md` for Claude Code). For additional context:

```
"Read qa/README.md and qa/memory/INDEX.md, then tell me where we left off."
```

The session summary + README combination gives the agent sufficient context to resume
without re-reading the entire qa/ directory.
