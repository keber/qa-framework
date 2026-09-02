'use strict';

/**
 * scripts/lib/claude-agents.js - Generate .claude/agents/qa-*.md sprint-cycle subagents
 *
 * Optional ANALISIS/PLAN mode, gated by integrations.azureDevOps.sprintCycle.enabled in
 * qa-framework.config.json. Claude Code only - subagents with per-agent tools/model
 * frontmatter have no GitHub Copilot equivalent, so no .github/ counterpart is generated.
 *
 * Placeholders are resolved from config.integrations.azureDevOps.sprintCycle, falling back
 * to neutral defaults when a field (or the whole config section) is absent.
 */

const fs = require('fs');
const path = require('path');

const AGENT_NAMES = ['qa-analisis', 'qa-plan', 'qa-asesoria', 'qa-informe-resultados'];

const DEFAULT_SPRINT_CYCLE = {
  sprintDurationDays: 8,
  manualTestingTimeboxDays: 2,
  dateFormat: 'dd-mm-aaaa',
  timezone: 'America/Santiago',
};

const LOCALE_LANGUAGE_LABELS = {
  es: 'espanol',
  'es-cl': 'espanol de Chile',
  'es-mx': 'espanol de Mexico',
  'es-ar': 'espanol de Argentina',
  en: 'English',
};

function isSprintCycleEnabled(config) {
  return Boolean(config?.integrations?.azureDevOps?.sprintCycle?.enabled);
}

function resolveLocaleLanguageLabel(locale) {
  if (!locale) return 'espanol';
  return LOCALE_LANGUAGE_LABELS[locale.toLowerCase()] ?? locale;
}

function buildPlaceholders(config) {
  const sprintCycle = { ...DEFAULT_SPRINT_CYCLE, ...(config?.integrations?.azureDevOps?.sprintCycle ?? {}) };
  const project = config?.project ?? {};

  return {
    '{{PROJECT_NAME}}': project.name ?? '{{PROJECT_NAME}}',
    '{{PROJECT_DISPLAY_NAME}}': project.displayName ?? project.name ?? '{{PROJECT_DISPLAY_NAME}}',
    '{{SPRINT_DURATION_DAYS}}': String(sprintCycle.sprintDurationDays),
    '{{MANUAL_TESTING_TIMEBOX_DAYS}}': String(sprintCycle.manualTestingTimeboxDays),
    '{{DATE_FORMAT}}': sprintCycle.dateFormat,
    '{{TIMEZONE}}': sprintCycle.timezone,
    '{{LOCALE_LANGUAGE_LABEL}}': resolveLocaleLanguageLabel(config?.conventions?.locale ?? config?.conventions?.language),
    '{{DEFECT_ID_PREFIX}}': config?.project?.name ? config.project.name.toUpperCase().replace(/[^A-Z0-9]/g, '-') : 'PROJ',
  };
}

function buildAgentContent(agentName, templatesDir, config) {
  const templatePath = path.join(templatesDir, 'agents', `${agentName}.md`);
  let content = fs.readFileSync(templatePath, 'utf8');
  const placeholders = buildPlaceholders(config);
  for (const [placeholder, value] of Object.entries(placeholders)) {
    content = content.split(placeholder).join(value);
  }
  return content;
}

function agentFileName(agentName) {
  return `${agentName}.md`;
}

module.exports = {
  AGENT_NAMES,
  isSprintCycleEnabled,
  buildAgentContent,
  agentFileName,
};
