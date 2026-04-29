# docs/installation.md

## Installing `qa-framework`

---

## Prerequisites

- Node.js >= 18
- npm >= 8
- Git (the `qa/` directory should live inside a Git repository)
- PowerShell >= 5.1 (only required for Azure DevOps integration scripts)

---

## Option A — npm install (recommended)

```bash
npm install --save-dev @keber/qa-framework
```

The `postinstall` script runs `init --skip-if-exists` automatically. On first install it
creates the full `qa/` structure without prompts, reading `qa-framework.config.json` if
present or bootstrapping defaults.

After install, read `qa/AGENT-NEXT-STEPS.md` for the exact follow-up steps.

`init` creates:

```
qa/
├── README.md                       <- Prefilled with your project name
├── AGENT-NEXT-STEPS.md             <- Follow-up checklist for the agent
├── QA-STRUCTURE-GUIDE.md           <- Full structure guide (framework-owned)
├── qa-framework.config.json        <- Your project config
├── 00-standards/                   <- Templates and naming conventions
├── 01-specifications/
├── 02-test-plans/
├── 03-test-cases/
├── 04-test-data/
├── 05-test-execution/
├── 06-defects/open|resolved/
├── 07-automation/
│   ├── e2e/                        <- Playwright project (self-contained)
│   │   ├── playwright.config.ts
│   │   ├── global-setup.ts
│   │   ├── .env.example
│   │   └── fixtures/auth.ts + test-helpers.ts
│   ├── integration/README.md       <- Placeholder for k6, JMeter, etc.
│   └── load/README.md              <- Placeholder for load tests
└── 08-azure-integration/README.md
└── memory/INDEX.md

.github/copilot-instructions.md     <- Generated agent rules
.github/skills/                     <- 8 agent skill sets (SKILL.md + references/)
```

---

## Option B — Clone or copy (no npm registry)

```bash
# From your project root
git clone https://github.com/your-org/qa-framework.git tools/qa-framework

# Run init
node tools/qa-framework/scripts/cli.js init
```

---

## Option C — Manual scaffold (advanced)

If you prefer to control exactly what gets created:

```bash
git clone https://github.com/your-org/qa-framework.git tools/qa-framework

# Copy templates
cp -r tools/qa-framework/templates/specification qa/01-specifications/shared/
cp -r tools/qa-framework/templates/automation-scaffold qa/07-automation/e2e/

# Then fill in qa-framework.config.json manually
```

---

## Upgrading

After `npm update @keber/qa-framework`:

```bash
npx qa-framework upgrade
```

This overwrites only framework-owned files (`.github/skills/`, `copilot-instructions.md`,
`QA-STRUCTURE-GUIDE.md`) and migrates the `07-automation/` structure if upgrading from
v1.5.x. Your specs, tests, and memory are never touched.

Use `--dry-run` to preview without writing:

```bash
npx qa-framework upgrade --dry-run
```

---

## Post-Install Configuration

Edit `qa/qa-framework.config.json` (or `qa-framework.config.json` at project root):

### Required fields

```json
{
  "project": {
    "name": "my-project",
    "displayName": "My Project QA",
    "qaBaseUrl": "https://my-qa-env.example.com",
    "loginPath": "/login"
  }
}
```

### Optional: Playwright

```json
{
  "integrations": {
    "playwright": {
      "enabled": true,
      "automationRoot": "qa/07-automation/e2e",
      "workers": { "local": 2, "ci": 1 },
      "timeout": 30000,
      "actionTimeout": 10000
    }
  }
}
```

### Optional: Azure DevOps

```json
{
  "integrations": {
    "azureDevOps": {
      "enabled": true,
      "organization": "my-ado-org",
      "project": "my-ado-project",
      "variableGroup": "qa-secrets"
    }
  }
}
```

**Never** put `testPlanId`, `suiteId`, or `ADO_PAT` in the config file directly.  
Use environment variables:

- `ADO_PAT` — Personal Access Token
- `ADO_PLAN_ID` — Test Plan ID (can also go in `module-registry.json`)
- `ADO_SUITE_ID` — Suite ID

---

## Environment Variables

Create `qa/07-automation/e2e/.env` (local, **never commit**):

```bash
# Required
QA_BASE_URL=https://my-qa-env.example.com
QA_USER_EMAIL=qa-user@example.com
QA_USER_PASSWORD=

# Multi-role (if using multi-role auth)
QA_USER_ADMIN_EMAIL=qa-admin@example.com
QA_USER_ADMIN_PASSWORD=

# ADO (only if integration enabled)
ADO_PAT=<your-personal-access-token>
ADO_ORG=my-ado-org
ADO_PROJECT=my-ado-project
```

Add `.env` to `.gitignore`:

```bash
echo "qa/07-automation/e2e/.env" >> .gitignore
echo ".auth/" >> .gitignore
```

---

## Running the First Test

After installing and configuring:

```bash
# Enter the automation directory
cd qa/07-automation/e2e

# Install Playwright
npm install
npx playwright install chromium

# Run all tests
npx playwright test

# Run a specific module
npx playwright test tests/my-module/

# Open the HTML report
npx playwright show-report
```

---

## Verifying Installation

```bash
npx qa-framework validate
```

This checks:

- Required folders exist
- `qa-framework.config.json` is present and valid
- `.env.example` exists
- `.env` is gitignored
- Agent instruction files are in place
- No credentials are hardcoded in any Markdown file

---

## Upgrading

```bash
npm update keber/qa-framework
npx qa-framework upgrade
```

The `upgrade` command:

1. Checks the current framework version in your project
2. Shows a diff of changed template and instruction files
3. Prompts before overwriting any file that has local modifications
4. Never touches `01-specifications/`, `02-test-plans/`, `03-test-cases/`, `04-test-data/`, `05-test-execution/`, `06-defects/` — only framework-owned files are updated

See `MIGRATION-NOTES.md` for version-specific migration instructions.
