#!/usr/bin/env node
/**
 * scripts/generate.js — Generate a qa artifact from a template
 *
 * Usage:
 *   qa-framework generate <artifact> [options]
 *
 * Artifacts:
 *   spec              6-file submodule spec set
 *   test-plan         Test plan document
 *   test-case         Individual test case document
 *   execution-report  Execution report document
 *   defect-report     Defect / bug report
 *   session-summary   Session summary
 *
 * Options:
 *   --module <name>     Module name (used for file naming and headers)
 *   --submodule <name>  Submodule name (for spec artifact)
 *   --output <dir>      Output directory (default: current working directory)
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const args     = process.argv.slice(2);
const artifact = args[0];

const getArg = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
};

const moduleName    = getArg('--module')    ?? 'MyModule';
const submoduleName = getArg('--submodule') ?? 'MySubmodule';
const outputDir     = getArg('--output')    ? path.resolve(process.cwd(), getArg('--output')) : process.cwd();

const templateDir = path.resolve(__dirname, '..', 'templates');

const ARTIFACTS = {
  spec:             null,    // special — copies all 6 files
  'test-plan':      path.join(templateDir, 'test-plan.md'),
  'test-case':      path.join(templateDir, 'test-case.md'),
  'execution-report': path.join(templateDir, 'execution-report.md'),
  'defect-report':  path.join(templateDir, 'defect-report.md'),
  'session-summary': path.join(templateDir, 'session-summary.md'),
};

if (!artifact || !ARTIFACTS.hasOwnProperty(artifact)) {
  console.error(`[qa-framework/generate] Unknown artifact: "${artifact}"`);
  console.error(`Available artifacts: ${Object.keys(ARTIFACTS).join(', ')}`);
  process.exit(1);
}

const moduleKey  = moduleName.toLowerCase().replace(/\s+/g, '-');
const subKey     = submoduleName.toLowerCase().replace(/\s+/g, '-');

if (artifact === 'spec') {
  // Generate all 6 spec files into outputDir/moduleKey/subKey/
  const specDir = path.join(outputDir, moduleKey, subKey);
  fs.mkdirSync(specDir, { recursive: true });

  const specTemplateDir = path.join(templateDir, 'specification');
  const files = fs.readdirSync(specTemplateDir).filter(f => f.endsWith('.md'));

  for (const file of files) {
    const dest = path.join(specDir, file);
    let content = fs.readFileSync(path.join(specTemplateDir, file), 'utf8');
    content = applyReplacements(content, moduleKey, subKey, moduleName, submoduleName);
    fs.writeFileSync(dest, content, 'utf8');
    console.log(`[generate] Created: ${path.relative(process.cwd(), dest)}`);
  }
} else {
  // Single file artifact
  const src  = ARTIFACTS[artifact];
  const slug = artifact === 'defect-report' ? 'DEF-NNN' : `${moduleKey}-${artifact}`;
  const dest = path.join(outputDir, `${slug}.md`);

  let content = fs.readFileSync(src, 'utf8');
  content = applyReplacements(content, moduleKey, subKey, moduleName, submoduleName);
  fs.writeFileSync(dest, content, 'utf8');
  console.log(`[generate] Created: ${path.relative(process.cwd(), dest)}`);
}

function applyReplacements(content, moduleKey, subKey, moduleName, submoduleName) {
  return content
    .replace(/\{\{MODULE_NAME\}\}/g, moduleName)
    .replace(/\{\{SUBMODULE_NAME\}\}/g, submoduleName)
    .replace(/\{\{MODULE\}\}/g, moduleKey.toUpperCase())
    .replace(/\{\{SUB\}\}/g, subKey.toUpperCase());
}
