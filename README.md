# qa-framework

> Reusable, installable, agent-oriented QA framework for spec-driven automated testing.
> Current version: **v1.14.0-rc.7**

---

## What is this?

`@keber/qa-framework` is a methodology package that provides:

- **A standardized `qa/` directory structure** for any project
- **Reusable templates** for specifications, test plans, test cases, defect reports, and execution reports
- **Agent skills** (for GitHub Copilot and equivalent IDE agents) that enable AI-assisted QA work via a 3-layer skills architecture
- **Optional integrations** for Playwright and Azure DevOps
- **Bootstrap commands** to scaffold the structure into any project in seconds

This framework was designed to be:

| Property | Description |
|---|---|
| **Reusable** | Not tied to any specific project, domain, or tech stack |
| **Decoupled** | Core is independent from Azure DevOps, Playwright, or any other tool |
| **Agent-oriented** | Skills are written for IDE agents (Copilot, etc.) to consume with minimal token overhead |
| **Spec-driven** | Every automation artifact traces back to a specification |
| **Extensible** | Adapters/plugins for optional integrations are well-separated |

---

## Quick Start

### Install from npm

```bash
npm install @keber/qa-framework
```

The `postinstall` script runs `init --skip-if-exists` automatically, scaffolding the `qa/`
structure on first install without overwriting existing files.

### Using with an AI agent (GitHub Copilot, Claude, etc.)

Use this prompt in your IDE agent chat:

```
Install @keber/qa-framework, check its readme file and set up the project for integration with azure devops
```

The install creates `qa/AGENT-NEXT-STEPS.md` with the exact steps the agent needs to complete
the setup (optional integrations, module configuration, credentials, etc.).

### Using manually (without an agent)

```bash
npm install @keber/qa-framework
# then read qa/AGENT-NEXT-STEPS.md for next steps
```

`init` will:

1. Create the `qa/` directory tree in your project root
2. Copy all base templates into place
3. Create `qa/qa-framework.config.json` for project-specific settings
4. Generate `.github/instructions/qa-framework.instructions.md` with QA agent behavior rules (15 rules, numbered 0-14, + ADO detection)
5. Copy the `skills/` set to `.github/skills/` so the agent can load them on demand
6. Create `qa/AGENT-NEXT-STEPS.md` with follow-up steps
7. Install `qa/00-standards/agents-md-template.md`, a review-rulebook template to copy to
   `AGENTS.md` at the repository root. `init` never writes a root `AGENTS.md` and `upgrade`
   never touches one: it is project-owned

### Upgrading

After `npm update @keber/qa-framework`, run:

```bash
npx qa-framework upgrade
```

This overwrites **only** framework-owned files (skills, `qa-framework.instructions.md`,
`QA-STRUCTURE-GUIDE.md`) and never touches your specs, test plans, automation code, or memory.

A framework-owned file that your project edited is never lost. When it matches no version
the framework shipped (a hand-written `.claude/commands/qa-*.md` included), `upgrade` first
copies it to `.claude/qa-framework-backup/upgrade-to-<version>/`, under its own relative path
without the leading dot (`.claude/rules/qa-framework.md` becomes `claude/rules/qa-framework.md`),
then overwrites it and warns. `TRIAGE.md` in that folder lists, for each file, the lines your
project added to the version it came from: move what is project-specific to a file you own,
such as `.claude/rules/<project>.md`. A later run uses a new `-runN` folder, so no backup is
ever overwritten; a run with nothing to back up creates no folder.

If upgrading from a version that wrote to `.github/copilot-instructions.md`, `upgrade`
automatically removes the QA section from that file (or deletes it if it contained only
framework content), and creates `.github/instructions/qa-framework.instructions.md` instead.
The original file is backed up first, like every file `upgrade` removes or moves.

---

## Repository Structure (this package)

```
qa-framework/
├── README.md                         <- This file
├── CHANGELOG.md                      <- Version history
├── package.json                      <- npm descriptor
├── qa-framework.config.json          <- Example config (copy to project)
│
├── docs/                             <- Framework documentation
│   ├── architecture.md               <- Design decisions and component map
│   ├── skills-architecture.md        <- 3-layer skills model explanation
│   ├── installation.md               <- Detailed installation guide
│   ├── usage-with-agent.md           <- How to use the framework with an IDE agent
│   ├── spec-driven-philosophy.md     <- Core QA methodology
│   └── folder-structure-guide.md     <- Explanation of every qa/ folder
│
├── skills/                           <- Agent skills (3-layer model; copied to .github/skills/ on init)
│   ├── qa-module-analysis/           <- Stage 1: analyze a module, produce 6-file spec set
│   ├── qa-spec-generation/           <- Stage 2: generate/update the 6-file spec set
│   ├── qa-test-plan/                 <- Stage 3: Plan de Pruebas (plan + TC table with steps)
│   ├── qa-test-cases/                <- Stage 4: expand steps in Plan de Pruebas table
│   ├── qa-automation/                <- Stage 5: implement Playwright automation
│   ├── qa-api-integration/           <- Stage 5 (API track): API tests, catalog, contract, writes
│   ├── qa-test-stabilization/        <- Stage 5b: stabilize failing tests
│   ├── qa-maintenance/               <- Stage 6: update artifacts after app changes
│   ├── qa-performance-k6/            <- Optional: targeted k6 performance runs and report
│   └── qa-ado-integration/           <- Optional: sync with Azure DevOps
│       (each skill contains SKILL.md + references/*.md)
│
├── templates/                        <- Reusable file templates
│   ├── specification/                <- 6-file submodule set
│   │   ├── 00-inventory.md
│   │   ├── 01-business-rules.md
│   │   ├── 02-workflows.md
│   │   ├── 03-roles-permissions.md
│   │   ├── 04-test-data.md
│   │   └── 05-test-scenarios.md
│   ├── test-plan-sprint.md           <- Plan de Pruebas template (v1.7.0+, primary)
│   ├── test-plan.md                  <- Legacy test plan template (deprecated)
│   ├── test-case.md
│   ├── execution-report.md
│   ├── defect-report.md
│   ├── session-summary.md
│   ├── qa-readme.md                  <- Template for qa/README.md
│   ├── load-scaffold/k6/             <- k6 runner, safety guard, report builder, plan schema (qa/07-automation/load/k6/)
│   └── automation-scaffold/          <- Files to bootstrap a Playwright E2E project
│       ├── package.json
│       ├── playwright.config.ts
│       ├── global-setup.ts
│       ├── .env.example
│       └── fixtures/
│           ├── auth.ts
│           └── test-helpers.ts
│
├── integrations/                     <- Optional integration adapters
│   ├── playwright/
│   │   └── README.md
│   ├── playwright-azure-reporter/
│   │   └── README.md
│   └── ado-powershell/
│       ├── README.md
│       └── scripts/
│           ├── inject-ado-ids.ps1
│           ├── create-testplan-from-mapping.ps1
│           └── sync-ado-titles.ps1
│
├── examples/                         <- Reference examples (non-project-specific)
│   └── module-example/
│       ├── README.md
│       └── submodule-example/        <- Full 6-file spec example
│
└── scripts/                          <- CLI commands
    ├── cli.js                        <- Entry point (qa-framework <command>)
    ├── init.js                       <- Scaffold qa/ tree + skills + qa-framework.instructions.md
    ├── upgrade.js                    <- Refresh framework-owned files after npm update
    ├── generate.js                   <- Generate individual artifact from template
    └── validate.js                   <- Check structure compliance
```

---

## The `qa/` Directory Structure

When you run `qa-framework init`, this structure is created inside your project:

```
qa/
├── README.md                    <- Living index of all QA artifacts
├── QA-STRUCTURE-GUIDE.md        <- Local copy of the structure guide (framework-owned)
├── AGENT-NEXT-STEPS.md          <- Active sprint checklist for the agent
│
├── 00-standards/                <- Naming conventions, templates, data policies
├── 01-specifications/           <- Functional specs (used by generate command)
├── {module}/{submodule}/        <- 6-file spec sets created per module/submodule in config
├── 02-test-plans/               <- Test plans (automated + manual)
├── 03-test-cases/               <- TC-*.md step-by-step docs (manual track; optional if fully automated)
├── 04-test-data/                <- Shared test data factories/seeders (optional - per-module data lives in 01-specs)
├── 05-test-execution/           <- Execution reports and results
├── 06-defects/                  <- Defect tracking: open|disputed|resolved|recommendations
├── 07-automation/               <- Playwright automation code and config
│   ├── e2e/                     <- Playwright E2E project (self-contained)
│   │   ├── playwright.config.ts
│   │   ├── package.json
│   │   ├── global-setup.ts
│   │   ├── .env.example
│   │   ├── fixtures/auth.ts
│   │   ├── fixtures/test-helpers.ts
│   │   └── tests/{module}/      <- Generated .spec.ts stubs per submodule
│   ├── integration/             <- API / integration tests (k6, JMeter...)
│   └── load/                    <- Load / performance tests
│       └── k6/                  <- k6 runner, safety guard, report builder, plans/
├── 08-azure-integration/        <- Azure DevOps integration (optional)
└── memory/                      <- Agent learnings and session notes
    └── INDEX.md
```

Additionally, `init` writes to the project root:

```
.github/
├── instructions/
│   └── qa-framework.instructions.md  <- QA agent rules (framework-owned, applyTo: '**')
└── skills/                           <- Copied from package skills/ (one folder per pipeline stage)
```

> `qa-framework.instructions.md` is a VS Code `*.instructions.md` file, separate from any
> custom `.github/copilot-instructions.md` the project may already have. The two files
> coexist without conflict and are independently upgradeable.

See [docs/folder-structure-guide.md](docs/folder-structure-guide.md) for a full explanation of every folder.

---

## Skills Architecture

The `skills/` folder contains agent skills organized in a **3-layer model** that minimizes
token overhead compared to the legacy monolithic per-task instruction file approach.

| Layer | Location | Purpose |
|---|---|---|
| 1 - Descriptor | YAML frontmatter in `SKILL.md` | Name + description; used for relevance detection (~50 tokens) |
| 2 - Process outline | `SKILL.md` body | Step-by-step process; always loaded when the skill applies (~400-600 tokens) |
| 3 - Reference material | `references/*.md` | Detailed templates, code patterns, decision trees; loaded on demand (~500-1500 tokens each) |

On `init`, the full `skills/` tree is copied to `.github/skills/` so the agent can load
them via `read_file` without touching `node_modules`.

### QA Pipeline

Skills map to the pipeline stages enforced by `.github/instructions/qa-framework.instructions.md`:

| Stage | Skill | Task | Track | Prerequisite |
|---|---|---|---|---|
| 1 | `qa-module-analysis` | Analyze module, produce 6-file spec set | Both | None |
| 2 | `qa-spec-generation` | Generate/update 6-file spec set | Both | `00-inventory.md` exists |
| 3 | `qa-test-plan` | Generate Plan de Pruebas (plan + TC table with steps) | Both | `05-test-scenarios.md` exists |
| 4 | `qa-test-cases` | Expand steps in Plan de Pruebas table | Both (optional) | Plan de Pruebas exists |
| 5 | `qa-automation` | Implement Playwright tests | Automation | Specs approved, no PENDING-CODE |
| 5 | `qa-api-integration` | Implement API tests (no browser) | Automation | Integration scaffold in `qa/07-automation/integration/` |
| 5b | `qa-test-stabilization` | Stabilize failing tests | Automation | Failing tests exist |
| 6 | `qa-maintenance` | Update artifacts after app changes | Both | Delivered change |
| - | `qa-performance-k6` | Targeted k6 performance test and report (optional, no order dependency) | Automation | Endpoints known; load scaffold in `qa/07-automation/load/k6/` |
| - | `qa-ado-integration` | Sync with Azure DevOps Test Plans | Both | Plan de Pruebas with steps exists |

See [docs/skills-architecture.md](docs/skills-architecture.md) for the full design rationale.

---

## Claude Code Sprint Agents (optional)

When `integrations.azureDevOps.sprintCycle.enabled` is `true`, `init` (only if missing) and
`upgrade` generate six Claude Code subagents under `.claude/agents/`. Each generated file ends
with an ownership marker, `<!-- qa-framework:generated sha256=<hex> -->`, holding the hash of the
content above it. On `upgrade`, a file whose marker still matches is overwritten; a file edited
after generation is kept and reported with the template to merge from; a file without marker
(generated before 1.14.0, or hand-written) is first copied to the run's backup folder,
`.claude/qa-framework-backup/upgrade-to-<version>/claude/agents/<name>.md`, and then regenerated.
The backup folder is outside `.claude/agents/` because Claude Code loads agents from that folder
recursively. Backups made by 1.14.0-rc.6 in `.claude/qa-framework-backup/agents/` stay where they are.

| Agent | What it does |
|---|---|
| `qa-analisis` | Sprint analysis document: test universe, automation feasibility, P0-P3 prioritization, traceability matrix |
| `qa-plan` | Sprint test plan: executive summary plus a trace-linked test case table that fits the manual-testing timebox |
| `qa-asesoria` | Chat-only QA advisory (no `Write`/`Bash`) |
| `qa-reporte-ejecucion` | Exports the ADO test plan results (via the `ado-qa` `getADO.ps1` script), versions the raw export by date and writes `Reporte-de-Ejecucion-de-Pruebas-<project>-Sprint-<N>.md` |
| `qa-informe-resultados` | Narrative sprint closing report (metrics, failures, risks, QA verdict) built from the Reporte above |
| `qa-investigador` | Investigates one concrete root cause against the real environment and returns a verdict with evidence; drives a browser over Playwright MCP when lanes provide one |

Config keys read by the agents (all optional; defaults shown):

| Key | Default | Used for |
|---|---|---|
| `integrations.azureDevOps.sprintCycle.approvalThresholdPercent` | `85` | Success rate over executed cases required for "Aprobado con observaciones" |
| `integrations.azureDevOps.sprintCycle.sprintDurationDays` / `manualTestingTimeboxDays` | `8` / `2` | Sprint planning agents |
| `integrations.azureDevOps.sprintCycle.dateFormat` / `timezone` | `dd-mm-aaaa` / `America/Santiago` | Dates in generated documents |
| `conventions.decimalSeparator` | derived: `,` for `es*` locales or no locale, `.` otherwise | Percentages in reports |
| `conventions.defectIdPrefix` | derived from `project.name` (uppercased) | Local defect candidate ids `DEF-<prefix>-NNN` |
| `conventions.testCaseIdPattern` | `TC-{MODULE}-{SUBMODULE}-{NUM}` | Local ids kept out of ADO-facing documents |
| `project.qaBaseUrl` / `loginPath` / `techStack` | "(no configurado: ...)" | Environment context for `qa-investigador` |

`qa-investigador` and `parallelLanes`:

- **0 MCP lanes** (no `parallelLanes`, `enabled: false`, or no lane with `mcpNamespace`): tools are
  `Read, Write, Edit, Grep, Glob, Bash` and the agent investigates through code, config, logs and the
  CLI runner, reporting browser-only hypotheses as blocked.
- **1 or N MCP lanes**: every lane with an `mcpNamespace` adds its 15 Playwright MCP browser tools,
  in config order, plus a lane table and the mandatory `lane-lock.js heartbeat` protocol. CLI-only
  lanes are skipped.
- `mcpNamespace` accepts either the MCP server name as it appears in `.mcp.json`
  (e.g. `"playwright-qauser"`, letters, digits, `-` and `_`) or its tool prefix
  (`"mcp__playwright-qauser__"`). A server name is normalized to the prefix; both forms produce the
  same agent.
- An invalid lane block or an `mcpNamespace` that is neither form (for example a value with spaces,
  or an incomplete prefix such as `"mcp__playwright"`) fails
  `qa-investigador` only: the other five agents are still written and the command exits 1.
  `qa-framework validate` reports the same problems.

---

## CLI Reference

```
qa-framework <command> [options]

Commands:
  init [--config <path>]      Scaffold qa/ structure from config file
  upgrade [--dry-run]         Refresh framework-owned files after npm update
  generate <artifact>         Generate from template
                                artifact: spec | test-plan | test-case |
                                          execution-report | defect-report |
                                          session-summary
  validate [--strict]         Validate qa/ structure and naming conventions

Options:
  --help, -h                  Show help
  --version, -v               Show version
```

**upgrade** overwrites only framework-owned files (skills, `qa-framework.instructions.md`,
`QA-STRUCTURE-GUIDE.md`) and never touches project-owned files. Run `--dry-run` to preview
without writing.

## Configuration

`qa-framework init` now bootstraps a default config automatically at `qa/qa-framework.config.json` if none exists.

You can then edit that file, or place a config in your project root (`qa-framework.config.json`) and run `init` again. You can also pass a specific file with `--config <path>`.

Example config:

```json
{
  "project": {
    "name": "my-project",
    "qaBaseUrl": "https://your-qa-env.example.com"
  },
  "modules": [],
  "integrations": {
    "playwright": { "enabled": false },
    "azureDevOps": { "enabled": false }
  }
}
```

See [docs/installation.md](docs/installation.md) for full config documentation.

---

## Design Principles

1. **UI is the source of truth.** Test cases are defined from what is observable in the running QA environment, not from source code or requirements docs alone.
2. **Spec before automation.** Every automated test traces back to a written specification (TC-ID -> spec file).
3. **Credentials never in documentation.** All credentials are handled via environment variables and sanitized from markdown with `<PLACEHOLDER>`.
4. **Agent-readable conventions.** File names, folder names, and IDs follow strict, predictable patterns so agents can navigate without guessing.
5. **Optional integrations don't pollute the core.** Azure DevOps and Playwright configuration live in separate, opt-in sections.
6. **Assertion polarity.** A test must assert what the spec requires, not what the app currently does. A failing test that exposes a real defect is more valuable than a passing test that hides one.

---

## Versioning

This framework follows [Semantic Versioning](https://semver.org/):

- **MAJOR**: breaking changes to the `qa/` directory structure or skill APIs
- **MINOR**: new templates, new optional integrations, new skills
- **PATCH**: bug fixes in CLI scripts, documentation corrections

See [CHANGELOG.md](CHANGELOG.md) for detailed history.

---

## Contributing / Adapting

This framework is designed to be forked and adapted. If you need a project-specific adapter:

1. Create a new `integrations/<adapter-name>/` folder
2. Place your adapter config and scripts there
3. Reference it from `qa-framework.config.json` under `integrations`

Do **not** put project-specific configuration inside `skills/` or `templates/`. Those must remain generic.
