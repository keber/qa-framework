'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const agents = require('../scripts/lib/claude-agents');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

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

const BASE_TOOLS = 'Read, Write, Edit, Grep, Glob, Bash';
const NOT_CONFIGURED = '(no configurado: ver qa/qa-framework.config.json)';

function makeConfig(overrides = {}) {
  const config = {
    project: {
      name: 'demo',
      displayName: 'Demo',
      qaBaseUrl: 'https://qa.example.test',
      loginPath: '/login',
      techStack: 'React + Node',
    },
    conventions: { locale: 'es-CL' },
    integrations: { azureDevOps: { sprintCycle: { enabled: true } } },
  };
  return { ...config, ...overrides };
}

function lane(id, mcpNamespace) {
  const out = { id, account: `QA_USER${id}`, storageState: `.auth/user-${id}.json` };
  if (mcpNamespace !== undefined) out.mcpNamespace = mcpNamespace;
  return out;
}

function withLanes(lanes, extra = {}) {
  return makeConfig({ parallelLanes: { enabled: true, lanes, ...extra } });
}

function build(name, config) {
  return agents.buildAgentContent(name, TEMPLATES_DIR, config);
}

function toolsLine(content) {
  const match = content.match(/^tools: (.*)$/m);
  assert.ok(match, 'frontmatter must declare a tools line');
  return match[1];
}

function expectedTools(namespaces) {
  const parts = [BASE_TOOLS];
  for (const ns of namespaces) {
    for (const tool of BROWSER_TOOLS) parts.push(`${ns}${tool}`);
  }
  return parts.join(', ');
}

// ---------------------------------------------------------------------------
// Agent set
// ---------------------------------------------------------------------------

test('claude-agents: AGENT_NAMES lists the six sprint-cycle agents', () => {
  assert.deepEqual([...agents.AGENT_NAMES].sort(), [
    'qa-analisis',
    'qa-asesoria',
    'qa-informe-resultados',
    'qa-investigador',
    'qa-plan',
    'qa-reporte-ejecucion',
  ]);
  for (const name of agents.AGENT_NAMES) {
    assert.ok(fs.existsSync(path.join(TEMPLATES_DIR, 'agents', `${name}.md`)), `template for ${name} must exist`);
  }
});

// ---------------------------------------------------------------------------
// qa-investigador: lanes
// ---------------------------------------------------------------------------

const ZERO_LANE_CONFIGS = {
  'no parallelLanes block': makeConfig(),
  'parallelLanes.enabled false (even with MCP lanes declared)': makeConfig({
    parallelLanes: { enabled: false, lanes: [lane('1', 'mcp__playwright-qauser__')] },
  }),
  'lanes without mcpNamespace (CLI-only)': withLanes([lane('1'), lane('2', null)]),
};

for (const [label, config] of Object.entries(ZERO_LANE_CONFIGS)) {
  test(`qa-investigador with 0 MCP lanes (${label}): no browser tools, Sin navegador section`, () => {
    const content = build('qa-investigador', config);
    assert.equal(toolsLine(content), BASE_TOOLS);
    assert.match(content, /Sin navegador/);
    assert.doesNotMatch(content, /heartbeat/i);
    assert.doesNotMatch(content, /Protocolo de lane/);
    assert.doesNotMatch(content, /\{\{/);
  });
}

test('qa-investigador with 1 MCP lane: exact tool list, lane table and heartbeat section', () => {
  const content = build('qa-investigador', withLanes([lane('1', 'mcp__playwright-qauser__')]));
  assert.equal(toolsLine(content), expectedTools(['mcp__playwright-qauser__']));
  assert.match(content, /\| Lane \| Servidor MCP \| Prefijo de herramientas \|/);
  assert.match(content, /\| 1 \| playwright-qauser \| `mcp__playwright-qauser__` \|/);
  assert.match(content, /Protocolo de lane/);
  assert.match(content, /lane-lock\.js heartbeat <N>/);
  assert.match(content, /QA_LANE_STALE_MINUTES/);
  assert.match(content, /Lane N is free/);
  assert.doesNotMatch(content, /Sin navegador/);
  assert.doesNotMatch(content, /\{\{/);
});

test('qa-investigador with N lanes: tools in config order, CLI-only lanes excluded', () => {
  const config = withLanes([
    lane('1', 'mcp__playwright-qauser__'),
    lane('2'),
    lane('3', 'mcp__playwright-qauser3__'),
    lane('4', 'mcp__playwright-qauser4__'),
  ]);
  const content = build('qa-investigador', config);
  assert.equal(
    toolsLine(content),
    expectedTools(['mcp__playwright-qauser__', 'mcp__playwright-qauser3__', 'mcp__playwright-qauser4__'])
  );
  assert.match(content, /\| 1 \| playwright-qauser \| `mcp__playwright-qauser__` \|/);
  assert.match(content, /\| 3 \| playwright-qauser3 \| `mcp__playwright-qauser3__` \|/);
  assert.match(content, /\| 4 \| playwright-qauser4 \| `mcp__playwright-qauser4__` \|/);
  assert.doesNotMatch(content, /^\| 2 \|/m);
  assert.ok(!toolsLine(content).split(', ').includes('Agent'), 'investigator must not receive the Agent tool');
});

test('qa-investigador: lane order follows the config array, not numeric key order', () => {
  const config = withLanes([lane('2', 'mcp__pw-b__'), lane('1', 'mcp__pw-a__')]);
  const content = build('qa-investigador', config);
  assert.equal(toolsLine(content), expectedTools(['mcp__pw-b__', 'mcp__pw-a__']));
  assert.ok(content.indexOf('| 2 | pw-b |') < content.indexOf('| 1 | pw-a |'));
});

test('qa-investigador: an invalid mcpNamespace throws an error naming the agent', () => {
  const config = withLanes([lane('1', 'playwright qauser')]);
  assert.throws(() => build('qa-investigador', config), (err) => {
    assert.match(err.message, /qa-investigador/);
    assert.match(err.message, /mcpNamespace/);
    return true;
  });
  // The other five agents do not depend on lanes and must still build.
  for (const name of agents.AGENT_NAMES.filter((n) => n !== 'qa-investigador')) {
    assert.doesNotThrow(() => build(name, config), `${name} must not depend on the lane config`);
  }
});

test('qa-investigador: a bare MCP server name (1.12 config shape) is normalized to the tool prefix', () => {
  const content = build('qa-investigador', withLanes([lane('1', 'playwright-gmo-lane1')]));
  assert.equal(toolsLine(content), expectedTools(['mcp__playwright-gmo-lane1__']));
  assert.match(content, /| 1 | playwright-gmo-lane1 | `mcp__playwright-gmo-lane1__` |/);
  assert.doesNotMatch(content, /mcp__mcp__/);
});

test('qa-investigador: bare names and prefixed namespaces can be mixed', () => {
  const config = withLanes([lane('1', 'playwright-a'), lane('2', 'mcp__playwright-b__')]);
  const content = build('qa-investigador', config);
  assert.equal(toolsLine(content), expectedTools(['mcp__playwright-a__', 'mcp__playwright-b__']));
});

for (const bad of ['playwright qauser', 'mcp__bad', 'mcp__x_', 'pw/1', 'mcp__a b__']) {
  test(`qa-investigador: mcpNamespace ${JSON.stringify(bad)} is still an error`, () => {
    assert.throws(() => build('qa-investigador', withLanes([lane('1', bad)])), /mcpNamespace/);
  });
}

test('normalizeMcpNamespace: bare name -> prefix, prefix kept, anything else null', () => {
  assert.equal(agents.normalizeMcpNamespace('playwright-gmo-lane1'), 'mcp__playwright-gmo-lane1__');
  assert.equal(agents.normalizeMcpNamespace('pw_1'), 'mcp__pw_1__');
  assert.equal(agents.normalizeMcpNamespace('mcp__playwright-qauser__'), 'mcp__playwright-qauser__');
  for (const bad of ['', 'a b', 'mcp__bad', 'mcp__', 'pw.1', 42, {}]) {
    assert.equal(agents.normalizeMcpNamespace(bad), null, JSON.stringify(bad));
  }
});

test('qa-investigador: an invalid parallelLanes block throws an error naming the agent', () => {
  const config = makeConfig({ parallelLanes: { enabled: true, lanes: [] } });
  assert.throws(() => build('qa-investigador', config), /qa-investigador/);
  assert.doesNotThrow(() => build('qa-informe-resultados', config));
});

test('qa-investigador: environment context comes from project fields', () => {
  const content = build('qa-investigador', makeConfig());
  assert.match(content, /https:\/\/qa\.example\.test/);
  assert.match(content, /\/login/);
  assert.match(content, /React \+ Node/);
  assert.doesNotMatch(content, /Radzen|Blazor/);
});

test('qa-investigador: unset or placeholder project fields render the not-configured text', () => {
  const placeholderProject = makeConfig({
    project: {
      name: 'demo',
      qaBaseUrl: '{{QA_BASE_URL}}',
      loginPath: '',
      techStack: '{{TECH_STACK}}',
    },
  });
  const content = build('qa-investigador', placeholderProject);
  assert.equal(content.split(NOT_CONFIGURED).length - 1, 3);
  assert.doesNotMatch(content, /\{\{/);

  const missing = build('qa-investigador', makeConfig({ project: { name: 'demo' } }));
  assert.equal(missing.split(NOT_CONFIGURED).length - 1, 3);
});

test('qa-investigador: uses neutral tú, not voseo', () => {
  const content = build('qa-investigador', withLanes([lane('1', 'mcp__playwright-qauser__')]));
  for (const voseo of ['Investigás', 'devolvés', 'sos ', 'tenés', 'Usá ', 'decilo', 'para vos']) {
    assert.ok(!content.includes(voseo), `voseo "${voseo}" must not appear`);
  }
  assert.match(content, /regla 10 \(polaridad de aserciones\)/);
});

// ---------------------------------------------------------------------------
// Approval threshold, decimal separator, ids
// ---------------------------------------------------------------------------

test('approval threshold defaults to 85 / 0.85 in informe and reporte', () => {
  const informe = build('qa-informe-resultados', makeConfig());
  assert.match(informe, /0\.85/);
  assert.match(informe, /85%/);
  const reporte = build('qa-reporte-ejecucion', makeConfig());
  assert.match(reporte, /approval threshold 85% of executed cases/);
});

test('approval threshold follows sprintCycle.approvalThresholdPercent', () => {
  const config = makeConfig({
    integrations: { azureDevOps: { sprintCycle: { enabled: true, approvalThresholdPercent: 90 } } },
  });
  const informe = build('qa-informe-resultados', config);
  assert.match(informe, /0\.9\b/);
  assert.match(informe, /90%/);
  assert.doesNotMatch(informe, /0\.85|85%/);
  assert.match(build('qa-reporte-ejecucion', config), /approval threshold 90%/);
});

test('decimal separator: derived from locale, overridable by conventions.decimalSeparator', () => {
  const rule = (sep) => new RegExp(`Percentages use \`${sep.replace('.', '\\.')}\` as the decimal separator`);
  assert.match(build('qa-reporte-ejecucion', makeConfig({ conventions: { locale: 'es-CL' } })), rule(','));
  assert.match(build('qa-reporte-ejecucion', makeConfig({ conventions: { locale: 'en-US' } })), rule('.'));
  assert.match(build('qa-reporte-ejecucion', makeConfig({ conventions: { language: 'en' } })), rule('.'));
  assert.match(build('qa-reporte-ejecucion', makeConfig({ conventions: {} })), rule(','));
  assert.match(
    build('qa-reporte-ejecucion', makeConfig({ conventions: { locale: 'es-CL', decimalSeparator: '.' } })),
    rule('.')
  );
  assert.match(
    build('qa-informe-resultados', makeConfig({ conventions: { locale: 'en-US' } })),
    /usan `\.` como separador decimal/
  );
});

test('defect id prefix: derived from project.name, overridable by conventions.defectIdPrefix', () => {
  const derived = build('qa-reporte-ejecucion', makeConfig());
  assert.match(derived, /DEF-DEMO-NNN/);
  assert.doesNotMatch(derived, /DEF-SIS/);
  const config = makeConfig({ conventions: { locale: 'es-CL', defectIdPrefix: 'ACME' } });
  assert.match(build('qa-reporte-ejecucion', config), /DEF-ACME-NNN/);
  assert.match(build('qa-informe-resultados', config), /DEF-ACME-NNN/);
});

test('test case id pattern: default and conventions.testCaseIdPattern override', () => {
  assert.match(build('qa-reporte-ejecucion', makeConfig()), /TC-\{MODULE\}-\{SUBMODULE\}-\{NUM\}/);
  const config = makeConfig({ conventions: { locale: 'es-CL', testCaseIdPattern: 'CP-{MODULE}-{NUM}' } });
  assert.match(build('qa-reporte-ejecucion', config), /CP-\{MODULE\}-\{NUM\}/);
});

test('qa-reporte-ejecucion: canonical filename uses the project name and is what informe reads', () => {
  const reporte = build('qa-reporte-ejecucion', makeConfig());
  assert.match(reporte, /Reporte-de-Ejecucion-de-Pruebas-demo-Sprint-\{N\}\.md/);
  assert.doesNotMatch(reporte, /Sispro/);
  assert.match(reporte, /dismissed\//);
  const informe = build('qa-informe-resultados', makeConfig());
  assert.match(informe, /Reporte-de-Ejecucion-de-Pruebas-demo-Sprint-<N>\.md/);
  assert.match(informe, /qa-reporte-ejecucion/);
});

// ---------------------------------------------------------------------------
// Rendering engine
// ---------------------------------------------------------------------------

test('renderTemplate: conditional blocks render without stacking blank lines', () => {
  const template = 'a\n\n{{#if FLAG}}\nyes {{X}}\n\n{{/if}}\n{{#unless FLAG}}\nno\n\n{{/unless}}\nb\n';
  const on = agents.renderTemplate(template, { '{{X}}': '1' }, { FLAG: true }, 'demo-agent');
  const off = agents.renderTemplate(template, { '{{X}}': '1' }, { FLAG: false }, 'demo-agent');
  assert.equal(on, 'a\n\nyes 1\n\nb\n');
  assert.equal(off, 'a\n\nno\n\nb\n');
});

test('renderTemplate: a leftover placeholder throws naming the agent and the token', () => {
  assert.throws(
    () => agents.renderTemplate('x {{UNKNOWN_TOKEN}} y', {}, {}, 'demo-agent'),
    (err) => /demo-agent/.test(err.message) && /\{\{UNKNOWN_TOKEN\}\}/.test(err.message)
  );
  assert.throws(
    () => agents.renderTemplate('{{#if FLAG}}x', {}, { FLAG: true }, 'demo-agent'),
    /demo-agent/
  );
});

test('renderTemplate: placeholder values are inserted verbatim, never re-expanded', () => {
  const out = agents.renderTemplate('{{A}}', { '{{A}}': '{{B}}', '{{B}}': 'no' }, {}, 'demo-agent');
  assert.equal(out, '{{B}}');
});

// ---------------------------------------------------------------------------
// Global invariants
// ---------------------------------------------------------------------------

const SCENARIOS = {
  defaults: makeConfig(),
  'zero lanes': ZERO_LANE_CONFIGS['lanes without mcpNamespace (CLI-only)'],
  'one lane': withLanes([lane('1', 'mcp__playwright-qauser__')]),
  'three lanes': withLanes([
    lane('1', 'mcp__playwright-qauser__'),
    lane('2', 'mcp__playwright-qauser2__'),
    lane('3', 'mcp__playwright-qauser3__'),
  ]),
  'placeholder project fields': makeConfig({
    project: { name: 'demo', qaBaseUrl: '{{QA_BASE_URL}}', loginPath: '{{LOGIN_PATH}}', techStack: '{{TECH_STACK}}' },
  }),
  'sprintCycle only': {
    project: { name: 'demo' },
    integrations: { azureDevOps: { sprintCycle: { enabled: true } } },
  },
};

for (const [label, config] of Object.entries(SCENARIOS)) {
  test(`no generated agent contains "{{" or forbidden characters (${label})`, () => {
    for (const name of agents.AGENT_NAMES) {
      const content = build(name, config);
      assert.doesNotMatch(content, /\{\{/, `${name} leaked a placeholder`);
      assert.doesNotMatch(content, /[\u2013\u2014\u2026\u2018\u2019\u201C\u201D\u2190-\u21FF]/, `${name} has a forbidden char`);
      assert.doesNotMatch(content, /\n\n\n/, `${name} has stacked blank lines`);
    }
  });
}

// The three agents untouched by this release must render exactly as the previous
// split/join implementation did.
function legacyRender(name, config) {
  const project = config.project ?? {};
  const sc = {
    sprintDurationDays: 8,
    manualTestingTimeboxDays: 2,
    dateFormat: 'dd-mm-aaaa',
    timezone: 'America/Santiago',
    ...(config.integrations?.azureDevOps?.sprintCycle ?? {}),
  };
  const labels = { es: 'espanol', 'es-cl': 'espanol de Chile', 'es-mx': 'espanol de Mexico', 'es-ar': 'espanol de Argentina', en: 'English' };
  const locale = config.conventions?.locale ?? config.conventions?.language;
  const map = {
    '{{PROJECT_NAME}}': project.name ?? '{{PROJECT_NAME}}',
    '{{PROJECT_DISPLAY_NAME}}': project.displayName ?? project.name ?? '{{PROJECT_DISPLAY_NAME}}',
    '{{SPRINT_DURATION_DAYS}}': String(sc.sprintDurationDays),
    '{{MANUAL_TESTING_TIMEBOX_DAYS}}': String(sc.manualTestingTimeboxDays),
    '{{DATE_FORMAT}}': sc.dateFormat,
    '{{TIMEZONE}}': sc.timezone,
    '{{LOCALE_LANGUAGE_LABEL}}': locale ? (labels[locale.toLowerCase()] ?? locale) : 'espanol',
    '{{DEFECT_ID_PREFIX}}': project.name ? project.name.toUpperCase().replace(/[^A-Z0-9]/g, '-') : 'PROJ',
  };
  let content = fs.readFileSync(path.join(TEMPLATES_DIR, 'agents', `${name}.md`), 'utf8');
  for (const [k, v] of Object.entries(map)) content = content.split(k).join(v);
  return content;
}

test('qa-analisis, qa-plan and qa-asesoria render exactly as before', () => {
  for (const config of [makeConfig(), SCENARIOS['sprintCycle only']]) {
    for (const name of ['qa-analisis', 'qa-plan', 'qa-asesoria']) {
      assert.equal(build(name, config), legacyRender(name, config), `${name} output changed`);
    }
  }
});

// ---------------------------------------------------------------------------
// Review corrections (READ-001/REL-003, REL-002, REL-005, READ-006, READ-007)
// ---------------------------------------------------------------------------

function metricLines(content) {
  return ['ejecutados', 'na', 'exito_ejecutados', 'cobertura'].map((name) => {
    const line = content.split(/\r?\n/).find((l) => l.startsWith('- `' + name + '` = '));
    assert.ok(line, `metric line for ${name} must exist`);
    return line;
  });
}

test('READ-001/REL-003: informe and reporte state the same metric formulas, Blocked included', () => {
  const informe = build('qa-informe-resultados', makeConfig());
  const reporte = build('qa-reporte-ejecucion', makeConfig());
  assert.deepEqual(metricLines(informe), metricLines(reporte));
  assert.match(metricLines(informe)[1], /Blocked/);
  // Executive summary row and section 2 break Blocked out explicitly.
  assert.match(informe, /\| \*\*Casos sin ejecutar o N\/A\*\* \|[^\n]*Blocked/);
  assert.match(informe, /^\| Casos `Blocked` \|/m);
});

test('REL-002: both agents state the threshold comparison is strict', () => {
  for (const name of ['qa-informe-resultados', 'qa-reporte-ejecucion']) {
    assert.match(build(name, makeConfig()), /estrictamente mayor que 85%/, name);
  }
});

test('REL-005: a fractional threshold percent uses the decimal separator, the ratio keeps the dot', () => {
  const cfg = (locale) => makeConfig({
    conventions: { locale },
    integrations: { azureDevOps: { sprintCycle: { enabled: true, approvalThresholdPercent: 85.5 } } },
  });
  const es = build('qa-informe-resultados', cfg('es-CL'));
  assert.match(es, /85,5%/);
  assert.match(es, /0\.855/);
  assert.doesNotMatch(es, /85\.5%/);
  assert.match(build('qa-reporte-ejecucion', cfg('es-CL')), /estrictamente mayor que 85,5%/);
  const en = build('qa-informe-resultados', cfg('en-US'));
  assert.match(en, /85\.5%/);
  assert.match(en, /0\.855/);
});

test('REL-002: approvalThresholdPercent 100 is out of range and falls back to 85', () => {
  const config = makeConfig({
    integrations: { azureDevOps: { sprintCycle: { enabled: true, approvalThresholdPercent: 100 } } },
  });
  assert.match(build('qa-informe-resultados', config), /0\.85/);
});

test('READ-006: informe lists arrows as prohibited and its example uses the decimal separator', () => {
  const es = build('qa-informe-resultados', makeConfig({ conventions: { locale: 'es-CL' } }));
  assert.match(es, /solo están prohibidos[^\n]*flechas/);
  assert.match(es, /95,35%/);
  assert.match(es, /97,7%/);
  const en = build('qa-informe-resultados', makeConfig({ conventions: { locale: 'en-US' } }));
  assert.match(en, /95\.35%/);
  assert.match(en, /97\.7%/);
});

test('READ-007: informe uses the configured test case id pattern', () => {
  const config = makeConfig({ conventions: { locale: 'es-CL', testCaseIdPattern: 'CP-{MODULE}-{NUM}' } });
  const informe = build('qa-informe-resultados', config);
  assert.equal(informe.split('CP-{MODULE}-{NUM}').length - 1, 2);
  assert.doesNotMatch(informe, /TC-<MODULO>-NNN/);
});
