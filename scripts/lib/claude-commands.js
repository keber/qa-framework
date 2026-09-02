'use strict';

/**
 * scripts/lib/claude-commands.js - Generate .claude/commands/qa-{name}.md thin wrappers
 *
 * Each generated command points back at the corresponding SKILL.md as the single
 * source of truth (no content duplication, no drift). Skills are discovered
 * dynamically from the filesystem, never hardcoded, so a newly added skill
 * under skills/ is picked up automatically by init.js and upgrade.js.
 */

const fs = require('fs');
const path = require('path');

// Stage prerequisites mirrored from templates/qa-framework.instructions.md pipeline table.
// Skills not listed here (e.g. a future addition) still get a valid command with no
// prerequisite line, and this codebase does not need updating for the command to work.
const STAGE_PREREQUISITES = {
  'qa-module-analysis': 'Prerequisite: None - this is the first stage of the QA pipeline.',
  'qa-spec-generation': 'Prerequisite: `00-inventory.md` exists.',
  'qa-test-plan': 'Prerequisite: `05-test-scenarios.md` exists.',
  'qa-test-cases': 'Prerequisite: Test plan exists.',
  'qa-automation': 'Prerequisite: Specs approved, no PENDING-CODE.',
  'qa-test-stabilization': 'Prerequisite: Failing or flaky tests exist in `qa/07-automation/e2e/`.',
  'qa-maintenance': 'Prerequisite: Application change delivered.',
  'qa-ado-integration': 'Prerequisite: ADO enabled in `qa/qa-framework.config.json`.',
};

function buildCommandContent(skillName) {
  const prerequisite = STAGE_PREREQUISITES[skillName];
  const lines = [
    `Read the full skill at \`.github/skills/${skillName}/SKILL.md\` FIRST, then follow its instructions exactly.`,
  ];
  if (prerequisite) {
    lines.push('', prerequisite);
  }
  return `${lines.join('\n')}\n`;
}

function discoverSkillNames(skillsSrcDir) {
  if (!fs.existsSync(skillsSrcDir)) return [];
  return fs.readdirSync(skillsSrcDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function commandFileName(skillName) {
  return `${skillName}.md`;
}

module.exports = {
  buildCommandContent,
  discoverSkillNames,
  commandFileName,
};
