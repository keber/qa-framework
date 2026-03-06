# qa-framework

> Reusable, installable, agent-oriented QA framework for spec-driven automated testing.

---

## What is this?

`qa-framework` is a methodology package that provides:

- **A standardized `qa/` directory structure** for any project
- **Reusable templates** for specifications, test plans, test cases, defect reports, and execution reports
- **Agent instructions** (for GitHub Copilot and equivalent IDE agents) that enable AI-assisted QA work
- **Optional integrations** for Playwright and Azure DevOps
- **Bootstrap commands** to scaffold the structure into any project in seconds

This framework was designed to be:

| Property | Description |
|---|---|
| **Reusable** | Not tied to any specific project, domain, or tech stack |
| **Decoupled** | Core is independent from Azure DevOps, Playwright, or any other tool |
| **Agent-oriented** | Instructions are written for IDE agents (Copilot, etc.) to consume |
| **Spec-driven** | Every automation artifact traces back to a specification |
| **Extensible** | Adapters/plugins for optional integrations are well-separated |

---

## Quick Start

### Option A: Install from npm (recommended)

```bash
npm install --save-dev keber/qa-framework
npx qa-framework init
```

### Option B: Clone directly (during early adoption)

```bash
# Clone into your project's tools directory or as a submodule
git clone <this-repo> tools/qa-framework
node tools/qa-framework/scripts/cli.js init
```

The `init` command will:

1. Create the `qa/` directory tree in your project root
2. Copy all base templates into place
3. Create `qa/qa-framework.config.json` for project-specific settings
4. Optionally set up Playwright and Azure DevOps integrations

---

## Repository Structure (this package)

```
qa-framework/
├── README.md                         ← This file
├── CHANGELOG.md                      ← Version history
├── MIGRATION-NOTES.md                ← How to migrate from embedded to package
├── package.json                      ← npm descriptor
├── qa-framework.config.json          ← Example config (copy to project)
│
├── docs/                             ← Framework documentation
│   ├── architecture.md               ← Design decisions and component map
│   ├── comparison-matrix.md          ← Source-repo analysis (Phase 1 artifact)
│   ├── generalization-decisions.md   ← What was abstracted and why (Phase 2 artifact)
│   ├── installation.md               ← Detailed installation guide
│   ├── usage-with-agent.md           ← How to use the framework with an IDE agent
│   ├── spec-driven-philosophy.md     ← Core QA methodology
│   └── folder-structure-guide.md     ← Explanation of every qa/ folder
│
├── agent-instructions/               ← Instructions for AI agents, per task
│   ├── 00-module-analysis.md
│   ├── 01-spec-generation.md
│   ├── 02-test-plan-generation.md
│   ├── 03-test-case-generation.md
│   ├── 04-automation-generation.md
│   ├── 04b-test-stabilization.md
│   ├── 05-ado-integration.md
│   └── 06-maintenance.md
│
├── templates/                        ← Reusable file templates
│   ├── specification/                ← 6-file submodule set
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
│   └── automation-scaffold/          ← Files to bootstrap a Playwright E2E project
│       ├── package.json
│       ├── playwright.config.ts
│       ├── global-setup.ts
│       ├── .env.example
│       └── fixtures/
│           └── auth.ts
│
├── integrations/                     ← Optional integration adapters
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
├── examples/                         ← Reference examples (non-project-specific)
│   └── module-example/
│       ├── README.md
│       └── submodule-example/        ← Full 6-file spec example
│
└── scripts/                          ← CLI commands
    ├── cli.js                        ← Entry point (qa-framework <command>)
    ├── init.js                       ← Scaffold qa/ tree
    ├── generate.js                   ← Generate individual artifact
    └── validate.js                   ← Check structure compliance
```

---

## The `qa/` Directory Structure

When you run `qa-framework init`, this structure is created inside your project:

```
qa/
├── README.md                    ← Living index of all QA artifacts
├── QA-STRUCTURE-GUIDE.md        ← Local copy of the structure guide
│
├── 00-guides/                   ← Process guides and agent instructions
├── 00-standards/                ← Naming conventions, templates, data policies
├── 01-specifications/           ← Functional specs by module/submodule
├── 02-test-plans/               ← Test plans (automated + manual)
├── 03-test-cases/               ← Explicit test case documents
├── 04-test-data/                ← Test data, fixtures, factories
├── 05-test-execution/           ← Execution reports and results
├── 06-defects/                  ← Defect tracking (optional)
├── 07-automation/               ← Automation code and config
└── 08-azure-integration/        ← Azure DevOps integration (optional)
```

See [docs/folder-structure-guide.md](docs/folder-structure-guide.md) for a full explanation of every folder.

---

## Agent Instructions

The `agent-instructions/` folder contains Markdown documents designed for IDE agents
(such as GitHub Copilot in VS Code). Each file covers one specific task:

| File | Agent Task |
|---|---|
| `00-module-analysis.md` | Analyze a module and produce the 6-file spec set |
| `01-spec-generation.md` | Generate functional specifications |
| `02-test-plan-generation.md` | Create a test plan for a module |
| `03-test-case-generation.md` | Generate detailed test cases |
| `04-automation-generation.md` | Write Playwright E2E tests |
| `04b-test-stabilization.md` | Exhaustively review and stabilize generated tests (Stage 3.5) |
| `05-ado-integration.md` | Sync with Azure DevOps Test Plans |
| `06-maintenance.md` | Update QA artifacts after code changes |

To use: copy the relevant instruction into a Copilot/agent chat, or reference it from a
`.github/copilot-instructions.md` or equivalent workspace instruction file.

---

## Configuration

Copy `qa-framework.config.json` to your project root (or to `qa/`) and fill in your values:

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
2. **Spec before automation.** Every automated test traces back to a written specification (TC-ID → spec file).
3. **Credentials never in documentation.** All credentials are handled via environment variables and sanitized from markdown with `<PLACEHOLDER>`.
4. **Agent-readable conventions.** File names, folder names, and IDs follow strict, predictable patterns so agents can navigate without guessing.
5. **Optional integrations don't pollute the core.** Azure DevOps and Playwright configuration live in separate, opt-in sections.

---

## Versioning

This framework follows [Semantic Versioning](https://semver.org/):

- **MAJOR**: breaking changes to the `qa/` directory structure or agent instruction APIs
- **MINOR**: new templates, new optional integrations, new agent instruction files
- **PATCH**: bug fixes in CLI scripts, documentation corrections

See [CHANGELOG.md](CHANGELOG.md) for detailed history.

---

## Contributing / Adapting

This framework is designed to be forked and adapted. If you need a project-specific adapter:

1. Create a new `integrations/<adapter-name>/` folder
2. Place your adapter config and scripts there
3. Reference it from `qa-framework.config.json` under `integrations`

Do **not** put project-specific configuration inside `agent-instructions/` or `templates/`. Those must remain generic.
