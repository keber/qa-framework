#!/usr/bin/env node
/**
 * scripts/init.js - Scaffold qa/ folder structure from config
 *
 * Usage:
 *   qa-framework init
 *   qa-framework init --config ./my-project.config.json
 *
 * Reads qa-framework.config.json and creates the full qa/ directory tree
 * including per-module and per-submodule folders with placeholder spec files.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// --- Parse args ---
const args            = process.argv.slice(2);
const configFlag      = args.indexOf('--config');
const skipIfExists    = args.includes('--skip-if-exists');

if (configFlag !== -1 && !args[configFlag + 1]) {
  console.error('[qa-framework/init] Missing value for --config <path>');
  process.exit(1);
}

// When run as postinstall, process.cwd() points to node_modules/@keber/qa-framework.
// INIT_CWD is set by npm to the directory where `npm install` was invoked (the project root).
const cwd = process.env.INIT_CWD || process.cwd();
const explicitConfigPath = configFlag !== -1 ? path.resolve(cwd, args[configFlag + 1]) : null;
const rootConfigPath = path.resolve(cwd, 'qa-framework.config.json');
const qaConfigPath = path.resolve(cwd, 'qa', 'qa-framework.config.json');

// --- Load or bootstrap config ---
let config;
let configSource;

if (explicitConfigPath) {
  if (!fs.existsSync(explicitConfigPath)) {
    console.error(`[qa-framework/init] Config file not found: ${explicitConfigPath}`);
    process.exit(1);
  }
  config = JSON.parse(fs.readFileSync(explicitConfigPath, 'utf8'));
  configSource = explicitConfigPath;
} else if (fs.existsSync(rootConfigPath)) {
  config = JSON.parse(fs.readFileSync(rootConfigPath, 'utf8'));
  configSource = rootConfigPath;
} else if (fs.existsSync(qaConfigPath)) {
  config = JSON.parse(fs.readFileSync(qaConfigPath, 'utf8'));
  configSource = qaConfigPath;
} else {
  config = buildBootstrapConfig();
  configSource = 'generated defaults';
  process.stderr.write('[qa-framework/init] No config file found. Bootstrapping with default config.\n');
}

const qaRoot  = path.resolve(cwd, config.conventions?.qaRoot ?? 'qa');
const localConfigPath = path.join(qaRoot, 'qa-framework.config.json');

// --skip-if-exists: bail out silently when qa/ is already initialised
if (skipIfExists && fs.existsSync(localConfigPath)) {
  process.stderr.write('[qa-framework/init] qa/ already initialised - skipping (postinstall).\n');
  process.exit(0);
}

if (!fs.existsSync(localConfigPath)) {
  fs.mkdirSync(qaRoot, { recursive: true });
  fs.writeFileSync(localConfigPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  console.log(`  [created] ${path.relative(cwd, localConfigPath)}`);
} else {
  console.log(`  [exists]  ${path.relative(cwd, localConfigPath)} - skipped`);
}

process.stderr.write(`[qa-framework/init] Scaffolding qa/ at: ${qaRoot}\n`);
process.stderr.write(`[qa-framework/init] Using config source: ${configSource}\n`);

// --- Top-level folders ---
const topLevelFolders = [
  '00-standards',
  '01-specifications',
  '02-test-plans/sprints',
  '03-test-cases',
  '04-test-data',
  '05-test-execution',
  '06-defects/open',
  '06-defects/disputed',
  '06-defects/resolved',
  '07-automation/e2e/tests',
  '07-automation/e2e/tests/helpers/debug',
  '07-automation/e2e/tests/seeds',
  '08-azure-integration',
  'memory',
];

for (const folder of topLevelFolders) {
  const fullPath = path.join(qaRoot, folder);
  fs.mkdirSync(fullPath, { recursive: true });
  console.log(`  [created] ${path.relative(cwd, fullPath)}/`);
}

// --- 06-defects/disputed/README.md ---
writeIfMissing(path.join(qaRoot, '06-defects', 'disputed', 'README.md'),
`# 06-defects/disputed/

Use this folder for defects where QA has reproducible evidence but the business or
development team disputes whether the observed behavior is actually a defect.

A defect stays here while the functional decision is pending. Once the team reaches
a formal conclusion, move the file to open/ (confirmed defect) or resolved/ (accepted
behavior or won't fix).
`);

// --- qa/README.md ---
const qaReadmeTemplate = path.resolve(__dirname, '..', 'templates', 'qa-readme.md');
if (fs.existsSync(qaReadmeTemplate)) {
  let readmeContent = fs.readFileSync(qaReadmeTemplate, 'utf8');
  readmeContent = readmeContent
    .replace(/\{PROJECT_DISPLAY_NAME\}/g, config.project?.displayName ?? config.project?.name ?? 'Project')
    .replace(/\{VERSION\}/g, config.frameworkVersion ?? '1.0.0')
    .replace(/\{LANGUAGE\}/g, config.conventions?.language ?? 'en')
    .replace(/\{QA_BASE_URL\}/g, config.project?.qaBaseUrl ?? '<QA_BASE_URL>');
  writeIfMissing(path.join(qaRoot, 'README.md'), readmeContent);
}

// --- qa/memory/INDEX.md ---
const memoryDir = path.join(qaRoot, 'memory');
writeIfMissing(path.join(memoryDir, 'INDEX.md'),
`# Memory Index — ${config.project?.displayName ?? config.project?.name ?? 'Project'}

> The agent reads this file first before loading any memory file.
> Add a row here whenever you create or update a file in this directory.

| File | Topic | When to load |
|---|---|---|
| \`ci-pipeline-findings.md\` | CI pipeline issues, root causes, applied fixes, failure triage categories | Diagnosing CI failures; reviewing pipeline changes |
| \`e2e-stabilization-patterns.md\` | Flakiness patterns, crash-recovery techniques, strict-mode conflicts, reference timeouts | Investigating intermittent failures; refactoring fragile specs |
| \`data-volatility-strategies.md\` | Strategies for handling volatile test data (filter values, row counts, search inputs) | Fixing hardcoded-data failures; choosing an assertion resilience approach |
`);

// --- qa/memory template files ---
const memorySrc = path.resolve(__dirname, '..', 'templates', 'memory');
for (const file of ['ci-pipeline-findings.md', 'e2e-stabilization-patterns.md', 'data-volatility-strategies.md']) {
  writeIfMissing(path.join(memoryDir, file), fs.readFileSync(path.join(memorySrc, file), 'utf8'));
}

// --- 03-test-cases README (optional directory marker) ---
writeIfMissing(path.join(qaRoot, '03-test-cases', 'README.md'),
`# 03-test-cases/ — Optional Standalone Test Cases

> **v1.7.0+:** The primary location for test cases (with detailed steps) is now
> \`qa/02-test-plans/sprints/Sprint-{N}/Plan-de-Pruebas-{project}-Sprint-{N}-{module}.md\`.
>
> Use this directory only for test cases that are:
> - Too complex to fit in a table row (multi-scenario, multi-role)
> - Reused across multiple sprints without change
> - Required as standalone documents for audit or external review
>
> Naming: \`TC-{MODULE}-{SUBMODULE}-{NNN}-{slug}.md\`
`);

// --- Standards placeholder ---
const stdDir = path.join(qaRoot, '00-standards');
writeIfMissing(path.join(stdDir, 'naming-conventions.md'), `# Naming Conventions\n\n> Fill in per your project. See keber/qa-framework docs/spec-driven-philosophy.md.\n`);
writeIfMissing(path.join(stdDir, 'bug-report-template.md'), fs.readFileSync(
  path.resolve(__dirname, '..', 'templates', 'defect-report.md'), 'utf8'
));
writeIfMissing(path.join(stdDir, 'test-case-template.md'), fs.readFileSync(
  path.resolve(__dirname, '..', 'templates', 'test-case.md'), 'utf8'
));
writeIfMissing(path.join(stdDir, 'execution-report-template.md'), fs.readFileSync(
  path.resolve(__dirname, '..', 'templates', 'execution-report.md'), 'utf8'
));
writeIfMissing(path.join(stdDir, 'test-data-guidelines.md'), fs.readFileSync(
  path.resolve(__dirname, '..', 'templates', 'test-data-guidelines.md'), 'utf8'
));

// --- Per-module folders ---
const modules = config.modules ?? [];
if (modules.length === 0) {
  console.warn('[qa-framework/init] No modules defined in config. Add "modules" array to qa-framework.config.json.');
}

const SPEC_FILES = [
  '00-inventory.md',
  '01-business-rules.md',
  '02-workflows.md',
  '03-roles-permissions.md',
  '04-test-data.md',
  '05-test-scenarios.md',
];

const templateDir = path.resolve(__dirname, '..', 'templates', 'specification');

for (const mod of modules) {
  const moduleKey = mod.key ?? mod.name.toLowerCase().replace(/\s+/g, '-');
  const submodules = mod.submodules ?? [];

  for (const sub of submodules) {
    const subKey = sub.key ?? sub.name.toLowerCase().replace(/\s+/g, '-');
    const subDir = path.join(qaRoot, moduleKey, subKey);
    fs.mkdirSync(subDir, { recursive: true });

    for (const specFile of SPEC_FILES) {
      const dest = path.join(subDir, specFile);
      if (!fs.existsSync(dest)) {
        const src = path.join(templateDir, specFile);
        if (fs.existsSync(src)) {
          let content = fs.readFileSync(src, 'utf8');
          content = content
            .replace(/\{\{MODULE_NAME\}\}/g, mod.name)
            .replace(/\{\{SUBMODULE_NAME\}\}/g, sub.name)
            .replace(/\{\{MODULE\}\}/g, moduleKey.toUpperCase())
            .replace(/\{\{SUB\}\}/g, subKey.toUpperCase());
          fs.writeFileSync(dest, content, 'utf8');
        } else {
          fs.writeFileSync(dest, `# ${specFile}\n\n> Auto-generated placeholder\n`, 'utf8');
        }
        console.log(`  [created] ${path.relative(cwd, dest)}`);
      } else {
        console.log(`  [exists]  ${path.relative(cwd, dest)} - skipped`);
      }
    }

    // Create automation spec stub in e2e/tests/{module}/
    const e2eDir = path.join(qaRoot, '07-automation', 'e2e', 'tests', moduleKey);
    fs.mkdirSync(e2eDir, { recursive: true });
    const specTs = path.join(e2eDir, `${subKey}.spec.ts`);
    if (!fs.existsSync(specTs)) {
      fs.writeFileSync(specTs, specScaffold(mod.name, sub.name, moduleKey, subKey), 'utf8');
      console.log(`  [created] ${path.relative(cwd, specTs)}`);
    }
  }
}

// --- Automation scaffold (lives in 07-automation/e2e/) ---
const automationDir  = path.join(qaRoot, '07-automation');
const e2eScaffoldDir = path.join(automationDir, 'e2e');
const scaffoldSrc    = path.resolve(__dirname, '..', 'templates', 'automation-scaffold');
fs.mkdirSync(e2eScaffoldDir, { recursive: true });
for (const file of ['playwright.config.ts', 'global-setup.ts', '.env.example', 'package.json']) {
  const dest = path.join(e2eScaffoldDir, file);
  if (!fs.existsSync(dest)) {
    fs.copyFileSync(path.join(scaffoldSrc, file), dest);
    console.log(`  [created] ${path.relative(cwd, dest)}`);
  }
}
const fixturesDir = path.join(e2eScaffoldDir, 'fixtures');
fs.mkdirSync(fixturesDir, { recursive: true });
for (const file of ['auth.ts', 'test-helpers.ts', 'base.ts']) {
  const dest = path.join(fixturesDir, file);
  if (!fs.existsSync(dest)) {
    fs.copyFileSync(path.join(scaffoldSrc, 'fixtures', file), dest);
    console.log(`  [created] ${path.relative(cwd, dest)}`);
  }
}

// --- Integration scaffold (lives in 07-automation/integration/) ---
const integrationDir      = path.join(automationDir, 'integration');
const integrationScaffold = path.resolve(__dirname, '..', 'templates', 'integration-scaffold');
fs.mkdirSync(integrationDir, { recursive: true });
for (const file of ['package.json', 'playwright.config.ts', 'global-setup.ts', 'README.md', '.env.example']) {
  const dest = path.join(integrationDir, file);
  if (!fs.existsSync(dest)) {
    fs.copyFileSync(path.join(integrationScaffold, file), dest);
    console.log(`  [created] ${path.relative(cwd, dest)}`);
  }
}
const integrationTestsDir = path.join(integrationDir, 'tests');
fs.mkdirSync(integrationTestsDir, { recursive: true });
const exampleSpec = path.join(integrationTestsDir, 'example.spec.ts');
if (!fs.existsSync(exampleSpec)) {
  fs.copyFileSync(path.join(integrationScaffold, 'tests', 'example.spec.ts'), exampleSpec);
  console.log(`  [created] ${path.relative(cwd, exampleSpec)}`);
}

// --- Load test placeholder ---
writeIfMissing(path.join(automationDir, 'load', 'README.md'),
`# Load Tests\n\n> Placeholder for load and performance tests.\n> Each tool gets its own subdirectory (e.g. k6/, jmeter/).\n`);

// --- ADO integration placeholder ---
const adoDir = path.join(qaRoot, '08-azure-integration');
writeIfMissing(path.join(adoDir, 'README.md'), `# ADO Integration\n\nSee keber/qa-framework integrations/ado-powershell/ for setup instructions.\n`);
writeIfMissing(path.join(adoDir, 'module-registry.json'), JSON.stringify({ modules: [] }, null, 2));

// --- Skills → .github/skills/ ---
const skillsSrc = path.resolve(__dirname, '..', 'skills');
const skillsDest = path.join(cwd, '.github', 'skills');
fs.mkdirSync(skillsDest, { recursive: true });
if (fs.existsSync(skillsSrc)) {
  for (const skillName of fs.readdirSync(skillsSrc)) {
    const skillSrcDir = path.join(skillsSrc, skillName);
    if (!fs.statSync(skillSrcDir).isDirectory()) continue;
    const skillDestDir = path.join(skillsDest, skillName);
    fs.mkdirSync(skillDestDir, { recursive: true });
    // Copy SKILL.md and references/ recursively
    copyDirIfMissing(skillSrcDir, skillDestDir);
  }
}

// --- QA structure guide → qa/QA-STRUCTURE-GUIDE.md ---
const structureGuideSrc  = path.resolve(__dirname, '..', 'docs', 'folder-structure-guide.md');
const structureGuideDest = path.join(qaRoot, 'QA-STRUCTURE-GUIDE.md');
if (fs.existsSync(structureGuideSrc)) {
  writeIfMissing(structureGuideDest, fs.readFileSync(structureGuideSrc, 'utf8'));
}

// --- .github/instructions/qa-framework.instructions.md ---
const githubDir         = path.join(cwd, '.github');
const copilotInstrPath  = path.join(githubDir, 'instructions', 'qa-framework.instructions.md');

const instrTemplatePath = path.resolve(__dirname, '..', 'templates', 'qa-framework.instructions.md');
const copilotInstrContent = fs.readFileSync(instrTemplatePath, 'utf8')
  .replace('{{VERSION}}', config.frameworkVersion ?? '1.0.0');
writeIfMissing(copilotInstrPath, copilotInstrContent);

// --- AGENT-NEXT-STEPS.md — readable by the agent after install ---
const nextStepsContent = `# ✅ @keber/qa-framework installed successfully

> This file was generated automatically by the postinstall script.
> Read it and follow the steps below, then delete this file.

## What was scaffolded

- \`qa/\` folder structure with spec templates and agent instructions
- \`.github/instructions/qa-framework.instructions.md\` with QA agent behavior rules (framework-owned, safe to upgrade)

## Required next steps

### 1. Configure your project modules
Edit \`qa/qa-framework.config.json\` and add your project modules under the \`"modules"\` array.

### 2. Optional integrations

**Azure DevOps integration:**
\`\`\`bash
npm install @keber/ado-qa
\`\`\`

**Playwright E2E automation:**
\`\`\`bash
npm install @playwright/test
cd qa/07-automation/e2e && npm install && npx playwright install chromium
\`\`\`

**Playwright API/integration automation:**
\`\`\`bash
cd qa/07-automation/integration && npm install
\`\`\`

### 3. Credentials
- Copy \`qa/07-automation/e2e/.env.example\` -> \`qa/07-automation/e2e/.env\` and fill in credentials
- Copy \`qa/07-automation/integration/.env.example\` -> \`qa/07-automation/integration/.env\` and fill in credentials
- Add both \`.env\` files and both \`.auth/\` folders to \`.gitignore\`
`;
const nextStepsPath = path.join(qaRoot, 'AGENT-NEXT-STEPS.md');
writeIfMissing(nextStepsPath, nextStepsContent);

// --- Print post-install summary ---
const playwrightInstalled = fs.existsSync(path.join(cwd, 'node_modules', '@playwright', 'test'));
const adoQaInstalledFinal = fs.existsSync(path.join(cwd, 'node_modules', '@keber', 'ado-qa'));
const azureReporterInstalled = fs.existsSync(path.join(cwd, 'node_modules', '@alex_neo', 'playwright-azure-reporter'));

console.log('');
console.log('  @keber/qa-framework — scaffold complete');
console.log('  ----------------------------------------');
console.log('  Installed:');
console.log('    qa/                    QA directory structure + spec templates');
console.log('    .github/skills/        QA agent skills (8 stages)');
console.log('    .github/instructions/  qa-framework.instructions.md');
console.log('');
console.log('  Optional integrations:');
if (playwrightInstalled) {
  console.log('    [ok] Playwright              @playwright/test');
} else {
  console.log('    [ ] Playwright               npm install @playwright/test');
  console.log('                                 cd qa/07-automation/e2e && npm install && npx playwright install chromium');
}
if (adoQaInstalledFinal) {
  console.log('    [ok] ADO integration         @keber/ado-qa');
} else {
  console.log('    [ ] ADO integration          npm install @keber/ado-qa');
}
if (azureReporterInstalled) {
  console.log('    [ok] ADO Playwright reporter (installed)');
} else {
  console.log('    [ ] ADO Playwright reporter  npm install @alex_neo/playwright-azure-reporter');
}
console.log('');
console.log('  Next: edit qa/qa-framework.config.json, then read qa/AGENT-NEXT-STEPS.md');
console.log('');

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------
function writeIfMissing(filePath, content) {
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`  [created] ${path.relative(cwd, filePath)}`);
  }
}

function copyDirIfMissing(srcDir, destDir) {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath  = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDirIfMissing(srcPath, destPath);
    } else {
      writeIfMissing(destPath, fs.readFileSync(srcPath, 'utf8'));
    }
  }
}

function specScaffold(modName, subName, modKey, subKey) {
  return `import { test, expect } from '@playwright/test';

const EXEC_IDX = Math.floor(Date.now() / 60_000) % 100_000;

test.describe('${modName} > ${subName} @P0', () => {

  test('[TC-${modKey.toUpperCase()}-${subKey.toUpperCase()}-001] TODO: Add test title @P0', async ({ page }) => {
    // TODO: Replace with real test steps from 05-test-scenarios.md
    await page.goto('/');
    expect(true).toBe(true);
  });

});
`;
}

function buildBootstrapConfig() {
  const templatePath = path.resolve(__dirname, '..', 'qa-framework.config.json');
  const projectName = path.basename(cwd);

  let base = {
    frameworkVersion: '1.0.0',
    project: {
      name: projectName,
      displayName: projectName,
      description: '',
      qaBaseUrl: '',
      techStack: '',
      loginPath: ''
    },
    modules: [],
    conventions: {
      qaRoot: 'qa',
      language: 'es',
      locale: 'es-CL'
    },
    integrations: {
      playwright: { enabled: false },
      azureDevOps: { enabled: false }
    }
  };

  if (fs.existsSync(templatePath)) {
    try {
      base = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
    } catch {
      // Keep fallback defaults above.
    }
  }

  base.project = {
    ...(base.project ?? {}),
    name: projectName,
    displayName: projectName
  };
  base.modules = [];
  base.conventions = {
    ...(base.conventions ?? {}),
    qaRoot: 'qa'
  };

  return base;
}
