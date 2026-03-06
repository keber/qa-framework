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
# Install as a dev dependency
npm install --save-dev keber/qa-framework

# Run the init command
npx qa-framework init
```

The `init` command will prompt you for:

1. **Project name** (used in config and directory labels)
2. **QA base URL** (e.g., `https://myproject-qa.example.com`)
3. **Login path** (e.g., `/login` or `/Seguridad/Login`)
4. **Number of test user roles** (1 = single role, 2+ = multi-role)
5. **Enable Playwright integration?** (y/n)
6. **Enable Azure DevOps integration?** (y/n)

After answering these, `init` creates:

```
qa/
├── README.md                       ← Prefilled with your project name
├── QA-STRUCTURE-GUIDE.md           ← Full structure guide
├── qa-framework.config.json        ← Your project config
├── 00-guides/                      ← Agent instructions (copied)
├── 00-standards/                   ← Templates and naming conventions
├── 01-specifications/README.md
├── 02-test-plans/README.md
├── 03-test-cases/README.md
├── 04-test-data/README.md
├── 05-test-execution/README.md
├── 06-defects/README.md
├── 07-automation/README.md
└── 08-azure-integration/README.md  ← Only if ADO enabled
```

If Playwright is enabled, it also creates:

```
qa/07-automation/e2e/
├── package.json
├── playwright.config.ts
├── global-setup.ts
├── .env.example
└── fixtures/
    └── auth.ts
```

---

## Option B — Clone or copy (early adoption / no npm registry)

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
# Clone the package
git clone https://github.com/your-org/qa-framework.git tools/qa-framework

# Copy only the templates you need
cp -r tools/qa-framework/templates/specification qa/01-specifications/shared/
cp -r tools/qa-framework/agent-instructions qa/00-guides/
cp -r tools/qa-framework/templates/automation-scaffold qa/07-automation/e2e/

# Then manually fill in qa-framework.config.json
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
