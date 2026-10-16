'use strict';

/**
 * scripts/lib/claude-agents.js - Generate .claude/agents/qa-*.md sprint-cycle subagents
 *
 * Optional ANALISIS/PLAN mode, gated by integrations.azureDevOps.sprintCycle.enabled in
 * qa-framework.config.json. Claude Code only - subagents with per-agent tools/model
 * frontmatter have no GitHub Copilot equivalent, so no .github/ counterpart is generated.
 *
 * Placeholders are resolved from the project config, falling back to neutral defaults
 * when a field (or the whole config section) is absent.
 *
 * Template syntax:
 *   {{NAME}}                         placeholder, replaced in a single pass (values are
 *                                    inserted verbatim and never re-expanded)
 *   {{#if FLAG}}...{{/if}}           kept only when FLAG is true (not nestable)
 *   {{#unless FLAG}}...{{/unless}}   kept only when FLAG is false (not nestable)
 *
 * Any {{...}} token left after rendering is a template bug and throws.
 *
 * buildAgentContent() throws per agent, so callers can generate the agents that are
 * valid, report the one that is not, and exit non-zero.
 */

const fs = require('fs');
const path = require('path');

const { laneTableFromConfig, DEFAULT_LANE_TABLE } = require('../../templates/automation-scaffold/scripts/lane-config');

const AGENT_NAMES = [
  'qa-analisis',
  'qa-plan',
  'qa-asesoria',
  'qa-informe-resultados',
  'qa-reporte-ejecucion',
  'qa-investigador',
];

const DEFAULT_SPRINT_CYCLE = {
  sprintDurationDays: 8,
  manualTestingTimeboxDays: 2,
  dateFormat: 'dd-mm-aaaa',
  timezone: 'America/Santiago',
  approvalThresholdPercent: 85,
};

const DEFAULT_TC_ID_PATTERN = 'TC-{MODULE}-{SUBMODULE}-{NUM}';
const NOT_CONFIGURED = '(no configurado: ver qa/qa-framework.config.json)';

const MCP_NAMESPACE_PATTERN = /^mcp__[A-Za-z0-9_-]+__$/;
const DEFECT_ID_PREFIX_PATTERN = /^[A-Z0-9-]+$/;
const DECIMAL_SEPARATORS = [',', '.'];

// Playwright MCP tools granted to qa-investigador per lane namespace, in this order.
const BROWSER_TOOLS = [
  'browser_navigate',
  'browser_snapshot',
  'browser_click',
  'browser_type',
  'browser_fill_form',
  'browser_select_option',
  'browser_hover',
  'browser_press_key',
  'browser_wait_for',
  'browser_evaluate',
  'browser_network_requests',
  'browser_console_messages',
  'browser_take_screenshot',
  'browser_find',
  'browser_close',
];

const INVESTIGATOR_BASE_TOOLS = ['Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash'];

const LOCALE_LANGUAGE_LABELS = {
  es: 'espanol',
  'es-cl': 'espanol de Chile',
  'es-mx': 'espanol de Mexico',
  'es-ar': 'espanol de Argentina',
  en: 'English',
};

// Tokens whose value depends on the lane table. They are resolved only for templates
// that use them, so an invalid lane config fails qa-investigador and nothing else.
const LANE_TOKENS = ['{{INVESTIGATOR_TOOLS}}', '{{LANE_MCP_TABLE}}', 'HAS_MCP_LANES'];

function isSprintCycleEnabled(config) {
  return Boolean(config?.integrations?.azureDevOps?.sprintCycle?.enabled);
}

function resolveLocaleLanguageLabel(locale) {
  if (!locale) return 'espanol';
  return LOCALE_LANGUAGE_LABELS[locale.toLowerCase()] ?? locale;
}

function isValidApprovalThreshold(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 100;
}

function resolveApprovalThresholdPercent(sprintCycle) {
  const value = sprintCycle.approvalThresholdPercent;
  // Invalid values are reported by `qa-framework validate`; generation keeps the default.
  return isValidApprovalThreshold(value) ? value : DEFAULT_SPRINT_CYCLE.approvalThresholdPercent;
}

function formatRatio(percent) {
  // Rounded to strip binary float noise (e.g. 57 / 100), always with a dot.
  return String(Number((percent / 100).toFixed(6)));
}

function resolveDecimalSeparator(config) {
  const explicit = config?.conventions?.decimalSeparator;
  if (DECIMAL_SEPARATORS.includes(explicit)) return explicit;
  const locale = config?.conventions?.locale ?? config?.conventions?.language;
  if (!locale) return ',';
  return String(locale).toLowerCase().startsWith('es') ? ',' : '.';
}

function resolveDefectIdPrefix(config) {
  const explicit = config?.conventions?.defectIdPrefix;
  if (typeof explicit === 'string' && DEFECT_ID_PREFIX_PATTERN.test(explicit)) return explicit;
  return config?.project?.name ? config.project.name.toUpperCase().replace(/[^A-Z0-9]/g, '-') : 'PROJ';
}

function resolveProjectField(value) {
  if (typeof value !== 'string' || value.trim() === '' || value.includes('{{')) return NOT_CONFIGURED;
  return value;
}

/**
 * MCP-capable lanes in config order: [{ id, mcpNamespace }].
 *
 * Validation is delegated to laneTableFromConfig (the same reader the automation
 * scaffold uses). Order comes from the config array, not from the table object,
 * because numeric-like lane ids would otherwise be reordered by the JS engine.
 * Throws on an invalid lane block or an mcpNamespace that is not a tool prefix.
 */
function resolveMcpLanes(config) {
  const table = laneTableFromConfig(config);
  if (table === DEFAULT_LANE_TABLE) return [];

  const lanes = [];
  for (const [index, entry] of config.parallelLanes.lanes.entries()) {
    const lane = table[entry.id];
    if (!lane || lane.mcpNamespace === null) continue;
    if (!MCP_NAMESPACE_PATTERN.test(lane.mcpNamespace)) {
      throw new Error(
        `parallelLanes.lanes[${index}].mcpNamespace must match ${MCP_NAMESPACE_PATTERN} ` +
          `(e.g. "mcp__playwright-qauser__"). Got: ${JSON.stringify(lane.mcpNamespace)}`
      );
    }
    lanes.push({ id: entry.id, mcpNamespace: lane.mcpNamespace });
  }
  return lanes;
}

function buildLanePlaceholders(config) {
  const mcpLanes = resolveMcpLanes(config);

  const tools = [...INVESTIGATOR_BASE_TOOLS];
  for (const { mcpNamespace } of mcpLanes) {
    for (const tool of BROWSER_TOOLS) tools.push(`${mcpNamespace}${tool}`);
  }

  const tableLines = mcpLanes.length
    ? [
        '| Lane | Servidor MCP | Prefijo de herramientas |',
        '| --- | --- | --- |',
        ...mcpLanes.map(({ id, mcpNamespace }) =>
          `| ${id} | ${mcpNamespace.replace(/^mcp__/, '').replace(/__$/, '')} | \`${mcpNamespace}\` |`
        ),
      ]
    : [];

  return {
    placeholders: {
      '{{INVESTIGATOR_TOOLS}}': tools.join(', '),
      '{{LANE_MCP_TABLE}}': tableLines.join('\n'),
    },
    flags: { HAS_MCP_LANES: mcpLanes.length > 0 },
  };
}

function buildPlaceholders(config) {
  const sprintCycle = { ...DEFAULT_SPRINT_CYCLE, ...(config?.integrations?.azureDevOps?.sprintCycle ?? {}) };
  const project = config?.project ?? {};
  const approvalPercent = resolveApprovalThresholdPercent(sprintCycle);

  return {
    '{{PROJECT_NAME}}': project.name ?? '{{PROJECT_NAME}}',
    '{{PROJECT_DISPLAY_NAME}}': project.displayName ?? project.name ?? '{{PROJECT_DISPLAY_NAME}}',
    '{{SPRINT_DURATION_DAYS}}': String(sprintCycle.sprintDurationDays),
    '{{MANUAL_TESTING_TIMEBOX_DAYS}}': String(sprintCycle.manualTestingTimeboxDays),
    '{{DATE_FORMAT}}': sprintCycle.dateFormat,
    '{{TIMEZONE}}': sprintCycle.timezone,
    '{{LOCALE_LANGUAGE_LABEL}}': resolveLocaleLanguageLabel(config?.conventions?.locale ?? config?.conventions?.language),
    '{{DEFECT_ID_PREFIX}}': resolveDefectIdPrefix(config),
    '{{APPROVAL_THRESHOLD_PERCENT}}': String(approvalPercent),
    '{{APPROVAL_THRESHOLD_RATIO}}': formatRatio(approvalPercent),
    '{{DECIMAL_SEPARATOR}}': resolveDecimalSeparator(config),
    '{{TC_ID_PATTERN}}': config?.conventions?.testCaseIdPattern || DEFAULT_TC_ID_PATTERN,
    '{{QA_BASE_URL}}': resolveProjectField(project.qaBaseUrl),
    '{{LOGIN_PATH}}': resolveProjectField(project.loginPath),
    '{{TECH_STACK}}': resolveProjectField(project.techStack),
  };
}

/**
 * Renders conditional blocks, then placeholders, then guards against leftovers.
 *
 * A block whose opening and closing tags sit on their own lines is removed together
 * with those lines, so dropping a block never leaves an extra blank line behind.
 */
function renderTemplate(template, placeholders, flags, agentName) {
  let content = template;

  for (const [keyword, keepWhen] of [['if', true], ['unless', false]]) {
    const ownLine = new RegExp(
      `^[ \\t]*\\{\\{#${keyword} ([A-Z0-9_]+)\\}\\}[ \\t]*\\r?\\n([\\s\\S]*?)^[ \\t]*\\{\\{\\/${keyword}\\}\\}[ \\t]*(?:\\r?\\n|$)`,
      'gm'
    );
    const inline = new RegExp(`\\{\\{#${keyword} ([A-Z0-9_]+)\\}\\}([\\s\\S]*?)\\{\\{\\/${keyword}\\}\\}`, 'g');
    const choose = (match, flag, body) => (Boolean(flags[flag]) === keepWhen ? body : '');
    content = content.replace(ownLine, choose).replace(inline, choose);
  }

  const leftovers = new Set();
  content = content.replace(/\{\{[#/]?[A-Za-z0-9_ ]+\}\}/g, (token) => {
    if (Object.prototype.hasOwnProperty.call(placeholders, token)) return placeholders[token];
    leftovers.add(token);
    return token;
  });

  if (leftovers.size) {
    throw new Error(
      `Template for agent ${agentName} has unresolved tokens: ${[...leftovers].join(', ')}`
    );
  }
  return content;
}

function buildAgentContent(agentName, templatesDir, config) {
  const templatePath = path.join(templatesDir, 'agents', `${agentName}.md`);
  try {
    const template = fs.readFileSync(templatePath, 'utf8');
    const placeholders = buildPlaceholders(config);
    let flags = {};
    if (LANE_TOKENS.some((token) => template.includes(token))) {
      const lane = buildLanePlaceholders(config);
      Object.assign(placeholders, lane.placeholders);
      flags = lane.flags;
    }
    return renderTemplate(template, placeholders, flags, agentName);
  } catch (err) {
    if (err.message.startsWith(`Cannot generate agent ${agentName}`)) throw err;
    throw new Error(`Cannot generate agent ${agentName}: ${err.message.replace(/^\[lane-config\] /, '')}`);
  }
}

/**
 * Renders every agent, never letting one failure stop the others.
 * Returns [{ agentName, fileName, content }] or [{ agentName, fileName, error }].
 */
function renderAllAgents(templatesDir, config) {
  return AGENT_NAMES.map((agentName) => {
    const fileName = agentFileName(agentName);
    try {
      return { agentName, fileName, content: buildAgentContent(agentName, templatesDir, config) };
    } catch (error) {
      return { agentName, fileName, error };
    }
  });
}

/**
 * Present-but-invalid values of the config keys the agents consume.
 * Absent keys are never reported. Returns an array of messages.
 */
function validateAgentConfig(config) {
  const errors = [];
  const conventions = config?.conventions ?? {};
  const sprintCycle = config?.integrations?.azureDevOps?.sprintCycle ?? {};

  if ('approvalThresholdPercent' in sprintCycle && !isValidApprovalThreshold(sprintCycle.approvalThresholdPercent)) {
    errors.push(
      'integrations.azureDevOps.sprintCycle.approvalThresholdPercent must be a number greater than 0 and at most 100. ' +
        `Got: ${JSON.stringify(sprintCycle.approvalThresholdPercent)}`
    );
  }
  if ('decimalSeparator' in conventions && !DECIMAL_SEPARATORS.includes(conventions.decimalSeparator)) {
    errors.push(`conventions.decimalSeparator must be "," or ".". Got: ${JSON.stringify(conventions.decimalSeparator)}`);
  }
  if (
    'defectIdPrefix' in conventions &&
    (typeof conventions.defectIdPrefix !== 'string' || !DEFECT_ID_PREFIX_PATTERN.test(conventions.defectIdPrefix))
  ) {
    errors.push(
      `conventions.defectIdPrefix must match ${DEFECT_ID_PREFIX_PATTERN} (uppercase letters, digits, "-"). ` +
        `Got: ${JSON.stringify(conventions.defectIdPrefix)}`
    );
  }

  const lanes = config?.parallelLanes?.lanes;
  if (Array.isArray(lanes)) {
    lanes.forEach((lane, index) => {
      const ns = lane && typeof lane === 'object' ? lane.mcpNamespace : undefined;
      if (ns !== undefined && ns !== null && (typeof ns !== 'string' || !MCP_NAMESPACE_PATTERN.test(ns))) {
        errors.push(
          `parallelLanes.lanes[${index}].mcpNamespace must match ${MCP_NAMESPACE_PATTERN} or be null. Got: ${JSON.stringify(ns)}`
        );
      }
    });
  }
  try {
    laneTableFromConfig(config ?? {});
  } catch (err) {
    errors.push(`parallelLanes: ${err.message.replace(/^\[lane-config\] /, '')}`);
  }

  return errors;
}

function agentFileName(agentName) {
  return `${agentName}.md`;
}

module.exports = {
  AGENT_NAMES,
  BROWSER_TOOLS,
  DEFAULT_SPRINT_CYCLE,
  isSprintCycleEnabled,
  buildPlaceholders,
  resolveMcpLanes,
  renderTemplate,
  buildAgentContent,
  renderAllAgents,
  validateAgentConfig,
  agentFileName,
};
