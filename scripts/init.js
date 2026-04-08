#!/usr/bin/env node
/**
 * scripts/init.js — Scaffold qa/ folder structure from config
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

const cwd = process.cwd();
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
  console.log('[qa-framework/init] No config file found. Bootstrapping with default config.');
}

const qaRoot  = path.resolve(cwd, config.conventions?.qaRoot ?? 'qa');
const localConfigPath = path.join(qaRoot, 'qa-framework.config.json');

// --skip-if-exists: bail out silently when qa/ is already initialised
if (skipIfExists && fs.existsSync(localConfigPath)) {
  console.log('[qa-framework/init] qa/ already initialised — skipping (postinstall).');
  process.exit(0);
}

if (!fs.existsSync(localConfigPath)) {
  fs.mkdirSync(qaRoot, { recursive: true });
  fs.writeFileSync(localConfigPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  console.log(`  [created] ${path.relative(cwd, localConfigPath)}`);
} else {
  console.log(`  [exists]  ${path.relative(cwd, localConfigPath)} — skipped`);
}

console.log(`[qa-framework/init] Scaffolding qa/ at: ${qaRoot}`);
console.log(`[qa-framework/init] Using config source: ${configSource}`);

// --- Top-level folders ---
const topLevelFolders = [
  '00-guides',
  '00-standards',
  '05-test-plans',
  '06-defects/open',
  '06-defects/resolved',
  '07-automation/e2e',
  '08-azure-integration',
];

for (const folder of topLevelFolders) {
  const fullPath = path.join(qaRoot, folder);
  fs.mkdirSync(fullPath, { recursive: true });
  console.log(`  [created] ${path.relative(process.cwd(), fullPath)}/`);
}

// --- Standards placeholder ---
const stdDir = path.join(qaRoot, '00-standards');
writeIfMissing(path.join(stdDir, 'naming-conventions.md'), `# Naming Conventions\n\n> Fill in per your project. See keber/qa-framework docs/spec-driven-philosophy.md.\n`);
writeIfMissing(path.join(stdDir, 'bug-report-template.md'), fs.readFileSync(
  path.resolve(__dirname, '..', 'templates', 'defect-report.md'), 'utf8'
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
        console.log(`  [created] ${path.relative(process.cwd(), dest)}`);
      } else {
        console.log(`  [exists]  ${path.relative(process.cwd(), dest)} — skipped`);
      }
    }

    // Create automation e2e subdir placeholder
    const e2eDir = path.join(qaRoot, '07-automation', 'e2e', moduleKey);
    fs.mkdirSync(e2eDir, { recursive: true });
    const specTs = path.join(e2eDir, `${subKey}.spec.ts`);
    if (!fs.existsSync(specTs)) {
      fs.writeFileSync(specTs, specScaffold(mod.name, sub.name, moduleKey, subKey), 'utf8');
      console.log(`  [created] ${path.relative(process.cwd(), specTs)}`);
    }
  }
}

// --- Automation scaffold ---
const automationDir = path.join(qaRoot, '07-automation');
const scaffoldSrc   = path.resolve(__dirname, '..', 'templates', 'automation-scaffold');
for (const file of ['playwright.config.ts', 'global-setup.ts', '.env.example', 'package.json']) {
  const dest = path.join(automationDir, file);
  if (!fs.existsSync(dest)) {
    fs.copyFileSync(path.join(scaffoldSrc, file), dest);
    console.log(`  [created] ${path.relative(process.cwd(), dest)}`);
  }
}
const fixturesDir = path.join(automationDir, 'fixtures');
fs.mkdirSync(fixturesDir, { recursive: true });
for (const file of ['auth.ts', 'test-helpers.ts']) {
  const dest = path.join(fixturesDir, file);
  if (!fs.existsSync(dest)) {
    fs.copyFileSync(path.join(scaffoldSrc, 'fixtures', file), dest);
    console.log(`  [created] ${path.relative(process.cwd(), dest)}`);
  }
}

// --- ADO integration placeholder ---
const adoDir = path.join(qaRoot, '08-azure-integration');
writeIfMissing(path.join(adoDir, 'README.md'), `# ADO Integration\n\nSee keber/qa-framework integrations/ado-powershell/ for setup instructions.\n`);
writeIfMissing(path.join(adoDir, 'module-registry.json'), JSON.stringify({ modules: [] }, null, 2));

// --- Agent instructions → qa/00-guides/ ---
const agentInstrSrc = path.resolve(__dirname, '..', 'agent-instructions');
const guidesDir     = path.join(qaRoot, '00-guides');
const agentFileMap  = {
  '00-module-analysis.md':      'AGENT-INSTRUCTIONS-MODULE-ANALYSIS.md',
  '01-spec-generation.md':      'AGENT-INSTRUCTIONS-SPEC-GENERATION.md',
  '02-test-plan-generation.md': 'AGENT-INSTRUCTIONS-TEST-PLAN.md',
  '03-test-case-generation.md': 'AGENT-INSTRUCTIONS-TEST-CASES.md',
  '04-automation-generation.md':'AGENT-INSTRUCTIONS-AUTOMATION.md',
  '04b-test-stabilization.md':  'AGENT-INSTRUCTIONS-TEST-STABILIZATION.md',
  '05-ado-integration.md':      'AGENT-INSTRUCTIONS-ADO-INTEGRATION.md',
  '06-maintenance.md':          'AGENT-INSTRUCTIONS-MAINTENANCE.md',
};
for (const [src, dest] of Object.entries(agentFileMap)) {
  const srcPath  = path.join(agentInstrSrc, src);
  const destPath = path.join(guidesDir, dest);
  if (fs.existsSync(srcPath)) {
    writeIfMissing(destPath, fs.readFileSync(srcPath, 'utf8'));
  }
}

// --- QA structure guide → qa/QA-STRUCTURE-GUIDE.md ---
const structureGuideSrc  = path.resolve(__dirname, '..', 'docs', 'folder-structure-guide.md');
const structureGuideDest = path.join(qaRoot, 'QA-STRUCTURE-GUIDE.md');
if (fs.existsSync(structureGuideSrc)) {
  writeIfMissing(structureGuideDest, fs.readFileSync(structureGuideSrc, 'utf8'));
}

// --- .github/copilot-instructions.md ---
const githubDir         = path.join(cwd, '.github');
const copilotInstrPath  = path.join(githubDir, 'copilot-instructions.md');
const copilotInstrContent = `# QA Framework Instructions

This project uses \`@keber/qa-framework\` v${config.frameworkVersion ?? '1.0.0'} for spec-driven automated testing.

## Agent behavior rules

1. Before performing any QA task, read the relevant instruction file from \`qa/00-guides/\`
2. Always save artifacts in the correct \`qa/\` subfolder — refer to \`qa/QA-STRUCTURE-GUIDE.md\`
3. Never hardcode credentials — always use env vars and \`<PLACEHOLDER>\` in documentation
4. Follow the naming conventions in \`qa/00-standards/naming-conventions.md\`
5. Project QA config is at \`qa/qa-framework.config.json\`

## Available agent instructions

| Task | Instruction file |
|---|---|
| Analyze a module | \`qa/00-guides/AGENT-INSTRUCTIONS-MODULE-ANALYSIS.md\` |
| Generate specifications | \`qa/00-guides/AGENT-INSTRUCTIONS-SPEC-GENERATION.md\` |
| Generate a test plan | \`qa/00-guides/AGENT-INSTRUCTIONS-TEST-PLAN.md\` |
| Generate test cases | \`qa/00-guides/AGENT-INSTRUCTIONS-TEST-CASES.md\` |
| Generate automation | \`qa/00-guides/AGENT-INSTRUCTIONS-AUTOMATION.md\` |
| Stabilize failing tests | \`qa/00-guides/AGENT-INSTRUCTIONS-TEST-STABILIZATION.md\` |
| Sync with Azure DevOps | \`qa/00-guides/AGENT-INSTRUCTIONS-ADO-INTEGRATION.md\` |
| Maintenance after changes | \`qa/00-guides/AGENT-INSTRUCTIONS-MAINTENANCE.md\` |
`;
writeIfMissing(copilotInstrPath, copilotInstrContent);

console.log('\n[qa-framework/init] Done!\n');
console.log('Next steps:');
console.log('  1. Copy qa/07-automation/.env.example to qa/07-automation/.env and fill in credentials');
console.log('  2. Add qa/07-automation/.env and qa/07-automation/.auth/ to .gitignore');
console.log('  3. Run: cd qa/07-automation && npm install && npx playwright install chromium');
console.log('  4. Start filling in spec files with your module\'s real data');

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------
function writeIfMissing(filePath, content) {
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`  [created] ${path.relative(process.cwd(), filePath)}`);
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
