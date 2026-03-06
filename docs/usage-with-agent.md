# docs/usage-with-agent.md

## Using `qa-framework` with an IDE Agent (GitHub Copilot)

---

## Overview

This framework is designed so that an IDE agent (such as GitHub Copilot in VS Code) can:

1. Understand the QA structure by reading the agent instruction files
2. Navigate the `qa/` directory predictably
3. Generate spec, plan, test case, and automation artifacts
4. Maintain existing artifacts after code changes
5. Optionally synchronize results with Azure DevOps

---

## Quick Reference: What to Tell the Agent

```
# Install the framework
"Run the qa-framework init command for this project"

# Read the framework instructions
"Read the file qa/00-guides/AGENT-INSTRUCTIONS-MODULE-ANALYSIS.md"

# Generate the QA structure
"Generate the full qa/ directory structure using the framework config"

# Analyze a module
"Analyze the module at [URL/route] following qa/00-guides/AGENT-INSTRUCTIONS-MODULE-ANALYSIS.md"

# Generate spec, plan, cases, and automation
"For submodule {name}, generate all 6 spec files following the templates in qa/00-standards/"
"Generate a test plan for module {name}"
"Write Playwright E2E tests for TC-{ID} through TC-{ID}"

# Integrate results with Azure DevOps
"Follow qa/08-azure-integration/AGENT-ADO-INTEGRATION.md to sync results with ADO"

# Maintenance
"Module {name} was updated. Review and update the spec files following qa/00-guides/AGENT-INSTRUCTIONS-MAINTENANCE.md"
```

---

## Setting Up Agent Instructions in VS Code

### Option A — Reference files in the agent conversation

Simply paste the relevant instruction file path into the Copilot chat:

```
Read qa/00-guides/AGENT-INSTRUCTIONS-MODULE-ANALYSIS.md and then analyze the module at {URL}
```

### Option B — Workspace instructions file (recommended)

Create `.github/copilot-instructions.md` in your project root:

```markdown
# QA Framework Instructions

This project uses qa-framework v1.0.0 for spec-driven automated testing.

## Agent behavior rules

1. Before performing any QA task, read the relevant instruction file from `qa/00-guides/`
2. Always save artifacts in the correct `qa/` subfolder per `qa/QA-STRUCTURE-GUIDE.md`
3. Never hardcode credentials — always use env vars and `<PLACEHOLDER>` in documentation
4. follow the naming conventions in `qa/00-standards/naming-conventions.md`

## Available instructions

- Module analysis: `qa/00-guides/AGENT-INSTRUCTIONS-MODULE-ANALYSIS.md`
- Spec generation: `qa/00-guides/AGENT-INSTRUCTIONS-SPEC-GENERATION.md`
- Test cases: `qa/00-guides/AGENT-INSTRUCTIONS-TEST-CASES.md`
- Automation: `qa/00-guides/AGENT-INSTRUCTIONS-AUTOMATION.md`
- ADO integration: `qa/00-guides/AGENT-INSTRUCTIONS-ADO-INTEGRATION.md`
```

### Option C — Individual task prompts

For each major QA task, use the prompt from the relevant `agent-instructions/*.md` file
as the starting prompt. These are designed to be copied and pasted directly.

---

## Typical Agent Session Workflow

### Session 1: Initial Module Analysis

```
1. Agent reads qa/00-guides/AGENT-INSTRUCTIONS-MODULE-ANALYSIS.md
2. Agent navigates to QA_BASE_URL using Playwright CLI
3. Agent explores the module: screenshots, routes, form fields, APIs
4. Agent produces qa/01-specifications/module-{name}/submodule-{x}/ (6 files each)
5. Agent writes SESSION-SUMMARY-{date}.md at qa/ root
6. Human reviews specs and approves before proceeding
```

### Session 2: Test Plan + Test Cases

```
1. Agent reads approved specs from 01-specifications/
2. Agent reads qa/00-guides/AGENT-INSTRUCTIONS-TEST-CASES.md
3. Agent selects TCs for automation (P0/P1) and manual (P2/P3)
4. Agent writes qa/02-test-plans/{module}-automated-test-plan.md
5. Human reviews priorities
```

### Session 3: Automation

```
1. Agent reads approved test plan
2. Agent reads qa/00-guides/AGENT-INSTRUCTIONS-AUTOMATION.md
3. Agent writes Playwright spec files in qa/07-automation/e2e/tests/{module}/
4. Agent runs tests, iterates until stable
5. Agent writes qa/05-test-execution/automated/{date}.md
6. Human reviews automation coverage
```

### Session 4: ADO Sync (if enabled)

```
1. Agent reads qa/08-azure-integration/AGENT-ADO-INTEGRATION.md
2. Agent runs inject-ado-ids.ps1 to prefix test titles
3. Agent verifies runner output appears in ADO Test Plan
4. Agent updates qa/08-azure-integration/ado-ids-mapping-{project}.json
```

---

## Agent Do's and Don'ts

### DO

- ✅ Read the instruction file before starting any QA task
- ✅ Save all artifacts in the exact path specified by the structure guide
- ✅ Use TC-ID, RN-ID, FL-ID naming consistently
- ✅ Replace credentials with `<PLACEHOLDER>` in any markdown output
- ✅ Write a brief session summary after each working session
- ✅ Reference the DEF-ID or ADO WI ID in every `test.skip()` call
- ✅ Validate test stability with ≥2 passes using different `EXEC_IDX` values

### DON'T

- ❌ Invent test cases without first observing the QA environment
- ❌ Hardcode credentials, DNIs, or personal data in any file
- ❌ Save screenshots or debug output to the project root
- ❌ Run Playwright directly from inside `qa/07-automation/e2e/` (always from project root)
- ❌ Modify files in `00-guides/` or `00-standards/` (those are framework-owned)
- ❌ Create test cases for features marked `BLOCKED-PERMISSIONS` without noting the blocker
- ❌ Remove a `test.skip()` without verifying the underlying defect is resolved

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
- Structure check (all 9 folders exist)
- Config check (required fields populated)
- Credential scan (no hardcoded passwords in markdown)
- Naming check (IC IDs follow `TC-{MODULE}-{NNN}` pattern)
- Coverage check (all spec TCs have matching test file references)

---

## Continuing from a Previous Session

Ask the agent:

```
"Read qa/SESSION-SUMMARY-{last-date}.md and qa/README.md, then tell me where we left off 
and what the next steps are."
```

The session summary + README combination gives the agent sufficient context to resume
without re-reading the entire qa/ directory.
