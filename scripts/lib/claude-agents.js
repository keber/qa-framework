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

const crypto = require('crypto');
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
// A bare MCP server name, as written in .mcp.json (the shape configs used up to 1.12).
const MCP_SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]+$/;
const MCP_NAMESPACE_RULE =
  'must be an MCP server name from .mcp.json (letters, digits, "-", "_"; e.g. "playwright-qauser") ' +
  'or its tool prefix (e.g. "mcp__playwright-qauser__")';
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
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 100;
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
 * Normalizes a lane mcpNamespace to the Claude Code tool prefix `mcp__<server>__`.
 *
 * Accepts the prefix itself (kept as is) or the bare server name from .mcp.json
 * (wrapped). A value that starts with "mcp__" is taken as an attempted prefix and must
 * be complete: wrapping "mcp__bad" again would hide the typo behind "mcp__mcp__bad__".
 * Returns null for anything else.
 */
function normalizeMcpNamespace(value) {
  if (typeof value !== 'string') return null;
  if (value.startsWith('mcp__')) return MCP_NAMESPACE_PATTERN.test(value) ? value : null;
  return MCP_SERVER_NAME_PATTERN.test(value) ? `mcp__${value}__` : null;
}

/**
 * MCP-capable lanes in config order: [{ id, mcpNamespace }].
 *
 * Validation is delegated to laneTableFromConfig (the same reader the automation
 * scaffold uses). Order comes from the config array, not from the table object,
 * because numeric-like lane ids would otherwise be reordered by the JS engine.
 * Throws on an invalid lane block or an mcpNamespace that is neither a server name
 * nor a tool prefix. Every returned mcpNamespace is the normalized tool prefix.
 */
function resolveMcpLanes(config) {
  const table = laneTableFromConfig(config);
  if (table === DEFAULT_LANE_TABLE) return [];

  const lanes = [];
  for (const [index, entry] of config.parallelLanes.lanes.entries()) {
    const lane = table[entry.id];
    if (!lane || lane.mcpNamespace === null) continue;
    const mcpNamespace = normalizeMcpNamespace(lane.mcpNamespace);
    if (mcpNamespace === null) {
      throw new Error(
        `parallelLanes.lanes[${index}].mcpNamespace ${MCP_NAMESPACE_RULE}. Got: ${JSON.stringify(lane.mcpNamespace)}`
      );
    }
    lanes.push({ id: entry.id, mcpNamespace });
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
    '{{APPROVAL_THRESHOLD_PERCENT}}': String(approvalPercent).replace('.', resolveDecimalSeparator(config)),
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
      'integrations.azureDevOps.sprintCycle.approvalThresholdPercent must be a number greater than 0 and less than 100. ' +
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

  // Lanes are only checked when the generator actually consumes them: sprint agents on
  // and a lane block that laneTableFromConfig does not short-circuit (enabled !== false).
  // A disabled block, or a project without sprint agents, never fails validate here.
  const block = config?.parallelLanes;
  const lanesInUse =
    isSprintCycleEnabled(config) && block !== undefined && block !== null && block.enabled !== false;
  if (!lanesInUse) return errors;

  const lanes = block.lanes;
  if (Array.isArray(lanes)) {
    lanes.forEach((lane, index) => {
      const ns = lane && typeof lane === 'object' ? lane.mcpNamespace : undefined;
      if (ns !== undefined && ns !== null && normalizeMcpNamespace(ns) === null) {
        errors.push(`parallelLanes.lanes[${index}].mcpNamespace ${MCP_NAMESPACE_RULE}, or null. Got: ${JSON.stringify(ns)}`);
      }
    });
  }
  try {
    laneTableFromConfig(config);
  } catch (err) {
    errors.push(`parallelLanes: ${err.message.replace(/^\[lane-config\] /, '')}`);
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Ownership marker
//
// Agents are rendered from a template plus the project config, so no static table of
// shipped hashes can tell a generated file from an edited one. Each generated file
// instead carries the hash of its own body in a trailing HTML comment:
//
//   <!-- qa-framework:generated sha256=<hex> -->
//
// It sits after the body, separated by a blank line, so the YAML frontmatter Claude
// Code reads stays at the top of the file and the comment renders as nothing. The hash
// covers everything before that blank line after the same normalization upgrade uses
// for scaffold files (UTF-8 BOM dropped, CRLF as LF), so line-ending churn is not
// mistaken for an edit.
// ---------------------------------------------------------------------------

const GENERATED_MARKER_RE = /\r?\n<!-- qa-framework:generated sha256=([0-9a-f]{64}) -->\r?\n?$/;

function normalizedHash(text) {
  const normalized = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

function withFinalNewline(text) {
  if (text.endsWith('\n')) return text;
  return text + (text.includes('\r\n') ? '\r\n' : '\n');
}

/** Rendered agent content plus the trailing ownership marker. */
function stampGenerated(content) {
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const body = withFinalNewline(content);
  return `${body}${eol}<!-- qa-framework:generated sha256=${normalizedHash(body)} -->${eol}`;
}

/**
 * Classifies an agent file already on disk against this release's rendered content.
 *   'pristine' - framework output: its marker matches its body, or its body already
 *                equals the new render. Safe to overwrite.
 *   'edited'   - has a marker but the body changed after generation: the user's file.
 *   'legacy'   - no marker (written before markers existed, or by hand) and different
 *                from the new render: overwrite only after a backup.
 */
function classifyAgentFile(existing, rendered) {
  const match = existing.match(GENERATED_MARKER_RE);
  const bodyHash = normalizedHash(match ? existing.slice(0, match.index) : existing);
  if (bodyHash === normalizedHash(withFinalNewline(rendered))) return 'pristine';
  if (!match) return 'legacy';
  return bodyHash === match[1] ? 'pristine' : 'edited';
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
  normalizeMcpNamespace,
  resolveMcpLanes,
  renderTemplate,
  buildAgentContent,
  renderAllAgents,
  validateAgentConfig,
  agentFileName,
  stampGenerated,
  classifyAgentFile,
};
