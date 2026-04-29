# qa-framework

> Reusable, installable, agent-oriented QA framework for spec-driven automated testing.
> Current version: **v1.6.0**

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
4. Generate `.github/copilot-instructions.md` with QA agent behavior rules (11 rules + ADO detection)
5. Copy the `skills/` set to `.github/skills/` so the agent can load them on demand
6. Create `qa/AGENT-NEXT-STEPS.md` with follow-up steps

### Upgrading

After `npm update @keber/qa-framework`, run:

```bash
npx qa-framework upgrade
```

This overwrites **only** framework-owned files (skills, `copilot-instructions.md`,
`QA-STRUCTURE-GUIDE.md`) and never touches your specs, test plans, automation code, or memory.

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
│   ├── qa-test-plan/                 <- Stage 3: generate a test plan
│   ├── qa-test-cases/                <- Stage 4: generate individual TC-{ID}.md files
│   ├── qa-automation/                <- Stage 5: implement Playwright automation
│   ├── qa-test-stabilization/        <- Stage 5b: stabilize failing tests
│   ├── qa-maintenance/               <- Stage 6: update artifacts after app changes
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
│   ├── test-plan.md
│   ├── test-case.md
│   ├── execution-report.md
│   ├── defect-report.md
│   ├── session-summary.md
│   ├── qa-readme.md                  <- Template for qa/README.md
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
    ├── init.js                       <- Scaffold qa/ tree + skills + copilot-instructions
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
├── 03-test-cases/               <- Explicit test case documents
├── 04-test-data/                <- Test data, fixtures, factories
├── 05-test-execution/           <- Execution reports and results
├── 06-defects/open|resolved/    <- Defect tracking
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
│   └── load/                    <- Load / performance tests (future)
├── 08-azure-integration/        <- Azure DevOps integration (optional)
└── memory/                      <- Agent learnings and session notes
    └── INDEX.md
```

Additionally, `init` writes to the project root:

```
.github/
├── copilot-instructions.md      <- Generated agent rules (11 rules + ADO detection)
└── skills/                      <- Copied from package skills/ (one folder per pipeline stage)
```

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

Skills map to the pipeline stages enforced by `.github/copilot-instructions.md`:

| Stage | Skill | Task | Prerequisite |
|---|---|---|---|
| 1 | `qa-module-analysis` | Analyze module, produce 6-file spec set | None |
| 2 | `qa-spec-generation` | Generate/update 6-file spec set | `00-inventory.md` exists |
| 3 | `qa-test-plan` | Generate test plan | `05-test-scenarios.md` exists |
| 4 | `qa-test-cases` | Generate TC-{ID}.md files | Test plan exists |
| 5 | `qa-automation` | Implement Playwright tests | Specs approved, no PENDING-CODE |
| 5b | `qa-test-stabilization` | Stabilize failing tests | Failing tests exist |
| 6 | `qa-maintenance` | Update artifacts after app changes | Delivered change |
| - | `qa-ado-integration` | Sync with Azure DevOps Test Plans | ADO enabled in config |

See [docs/skills-architecture.md](docs/skills-architecture.md) for the full design rationale.

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

**upgrade** overwrites only framework-owned files (skills, `copilot-instructions.md`,
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
