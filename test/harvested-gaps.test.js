'use strict';

// WP5.2 - framework gaps harvested from a consumer project's hand-edited skills.
// Only the general method is ported: cross-module and cascading-field dependency
// discovery, the "Dependency" business rule type, the upstream dependencies table
// in 04-test-data, the one-value anti-pattern, the ADO Conditional Access warning
// (VS403463), the "local to ADO only" direction note, and the folder guide's sprint
// tree, standards table and project additions pointer. These tests pin each section
// and make sure no consumer specifics leaked in with it.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const { scanText } = require('../scripts/check-forbidden-chars.js');
const { STANDARDS_DOCS } = require('../scripts/lib/standards-docs.js');

const ROOT = path.join(__dirname, '..');
const FILES = {
  analysisSkill: 'skills/qa-module-analysis/SKILL.md',
  checklist: 'skills/qa-module-analysis/references/exploration-checklist.md',
  formats: 'skills/qa-module-analysis/references/spec-file-formats.md',
  specSkill: 'skills/qa-spec-generation/SKILL.md',
  adoSkill: 'skills/qa-ado-integration/SKILL.md',
  guide: 'docs/folder-structure-guide.md',
};

function read(key) {
  return fs.readFileSync(path.join(ROOT, FILES[key]), 'utf8');
}

// A section ends at the next heading of the same or higher level outside a code
// fence. Fenced blocks are blanked (same length) only to find the boundary.
function section(content, heading) {
  const start = content.indexOf(heading);
  assert.ok(start >= 0, `missing heading: ${heading}`);
  const level = heading.match(/^#+/)[0];
  const unfenced = content.replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, ' '));
  const re = new RegExp(`\\n#{1,${level.length}} `, 'g');
  re.lastIndex = start + heading.length;
  const next = re.exec(unfenced);
  return content.slice(start, next ? next.index : undefined);
}

const CHECKLIST_27 = '## 2.7 Cross-Module and Cascading-Field Dependency Discovery';
const ADO_CA = '## Conditional Access blocks (VS403463)';
const GUIDE_ADDITIONS = '## Project additions';

// --- 1. Dependency discovery in the exploration checklist ---

test('exploration checklist: section 2.7 gives the dependency discovery method', () => {
  const s = section(read('checklist'), CHECKLIST_27);
  assert.match(s, /what (feeds|drives)/i, 'identify what feeds each dynamic field');
  assert.match(s, /2-3 (different )?values/i, 'try 2-3 values');
  assert.match(s, /network capture/i);
  assert.match(s, /real endpoint|actual endpoint/i);
  assert.match(s, /validity condition/i, 'the upstream record validity condition');
  assert.match(s, /another module|different module|cross-module/i);
  assert.match(s, /cascad/i);
  assert.match(s, /Type `?"?Dependency/i, 'records the finding as a Dependency rule');
  assert.match(s, /04-test-data/);
  assert.match(s, /component librar(y|ies)/i, 'general note that component libraries vary');
});

test('exploration checklist: the completeness checklist enforces section 2.7', () => {
  const s = section(read('checklist'), '## Phase 4 Completeness Checklist');
  assert.match(s, /- \[ \] .*2-3 .*values[\s\S]*2\.7/i);
  assert.match(s, /- \[ \] .*Dependency/);
});

test('module-analysis SKILL.md: Phase 2 and Phase 4 point to section 2.7', () => {
  const skill = read('analysisSkill');
  const phase2 = section(skill, '## Phase 2 - Exploration');
  assert.match(phase2, /Dependencies/i);
  assert.match(phase2, /`references\/exploration-checklist\.md` section 2\.7/);
  const phase4 = section(skill, '## Phase 4 - Review');
  assert.match(phase4, /- \[ \] .*2-3 .*values/i);
});

// --- 2. Business rule type Dependency ---

test('spec-file-formats: Dependency is a rule type with its own fields', () => {
  const s = section(read('formats'), '## `01-business-rules.md`');
  assert.match(s, /\*\*Type\*\*: Validation \/ Access Control \/ State Machine \/ Calculation \/ Integration \/ Dependency/);
  for (const field of ['Depends on', 'Scoping field', 'Upstream validity condition', 'Real endpoint observed', 'Values tried']) {
    assert.ok(s.includes(`**${field}**`), `Dependency shape lacks field: ${field}`);
  }
  assert.match(s, /cascading or cross-module field -> 1 RN of Type "Dependency"/);
});

test('qa-spec-generation SKILL.md: rule sources include Dependency and link the method', () => {
  const s = section(read('specSkill'), '### `01-business-rules.md`');
  assert.match(s, /Type "Dependency"/);
  assert.match(s, /`\.\.\/qa-module-analysis\/references\/exploration-checklist\.md` section 2\.7/);
});

// --- 3. Upstream dependencies table in 04-test-data ---

test('spec-file-formats: 04-test-data carries an upstream dependencies table', () => {
  const s = section(read('formats'), '## `04-test-data.md`');
  assert.match(s, /## Upstream dependencies/);
  assert.match(s, /\| Upstream entity \(module\) \| Validity condition \| Consumed by \| Rule \|/);
});

test('qa-spec-generation SKILL.md: 04-test-data guidance requires the upstream table', () => {
  const s = section(read('specSkill'), '### `04-test-data.md`');
  assert.match(s, /Upstream dependencies/);
  assert.match(s, /Dependency/);
});

// --- 4. Anti-pattern: field declared empty after one value ---

test('anti-pattern: declaring a field empty or unused after one value', () => {
  const anti = section(read('specSkill'), '## Anti-Patterns to Avoid');
  assert.match(anti, /\| .*(empty|unused).*(one|single) (driving )?value/i);
  assert.match(anti, /2-3/);
  const checklist = section(read('checklist'), CHECKLIST_27);
  assert.match(checklist, /Anti-pattern/);
  assert.match(checklist, /(empty|unused)[^\n]*(one|single) value/i);
});

// --- 5. ADO Conditional Access (VS403463) ---

test('qa-ado-integration: Conditional Access section explains VS403463 and what to do', () => {
  const skill = read('adoSkill');
  const s = section(skill, ADO_CA);
  assert.match(s, /Conditional Access/);
  assert.match(s, /X-TFS-ServiceError/);
  assert.match(s, /403/);
  assert.match(s, /not (a|an) (expired|wrong|invalid)|not the PAT|is not a PAT problem/i);
  assert.match(s, /regenerat/i, 'says regenerating the PAT does not help');
  assert.match(s, /System\.AccessToken|pipeline/i, 'CI tokens');
  assert.match(s, /network|device|location/i);
  assert.match(s, /administrator|admin/i);
  assert.match(s, /never (work ?around|bypass)|do not (work ?around|bypass)/i);
  const trouble = section(skill, '## Troubleshooting Quick Reference');
  assert.match(trouble, /\| .*VS403463/);
});

// --- 6. Cheap partials ---

test('qa-ado-integration: direction note says local to ADO only', () => {
  const head = read('adoSkill').split('\n## ')[0];
  assert.match(head, /Direction: local to ADO only/);
  assert.match(head, /does not pull/i);
});

test('folder guide: sprint tree shows historical sprints and closeout documents', () => {
  const s = section(read('guide'), '## 02-test-plans/');
  assert.match(s, /historical\//);
  assert.match(s, /ado-export-<YYYY-MM-DD>\//);
  assert.match(s, /Reporte-de-Ejecucion-de-Pruebas-/);
  assert.match(s, /Informe-de-Resultados-de-Pruebas-/);
  assert.match(s, /05-test-execution/, 'distinguishes the run-level execution report');
});

test('folder guide: the 00-standards table lists every installed standards document', () => {
  const s = section(read('guide'), '## 00-standards/');
  for (const doc of STANDARDS_DOCS) {
    assert.ok(s.includes(`| \`${doc.file}\` |`), `standards table lacks ${doc.file}`);
  }
});

test('folder guide: project additions say where project rules and docs go', () => {
  const s = section(read('guide'), GUIDE_ADDITIONS);
  assert.match(s, /\.claude\/rules\/<project>\.md/);
  assert.match(s, /\.github\/instructions\/<project>\.instructions\.md/);
  assert.match(s, /qa\/00-standards\//);
  assert.match(s, /framework-owned/i);
  assert.match(s, /overwrit/i);
});

// --- Hygiene: encoding and no consumer specifics ---

test('changed files: UTF-8 without BOM and no forbidden characters', () => {
  for (const rel of Object.values(FILES)) {
    const raw = fs.readFileSync(path.join(ROOT, rel));
    assert.notDeepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf], `${rel} has a BOM`);
    assert.deepEqual(scanText(raw.toString('utf8'), rel), [], `${rel} has forbidden characters`);
  }
});

test('changed files: no consumer project names or domain terms', () => {
  const denylist = [
    /garc[eé]s/i, /biofruit/i, /enrolamiento/i, /sispro/i, /\bgmo/i, /exportadora/i,
    /keber\.flores/i, /DEF-SIS/, /pedidos? de venta/i, /\bbooking\b/i, /\bsemana\b/i,
    /pa[ií]s destino/i, /\bnave\b/i, /etiqueta/i, /\bespecie\b/i, /\bembalaje\b/i,
    /mantenedor/i,
  ];
  for (const rel of Object.values(FILES)) {
    const content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const pattern of denylist) {
      assert.doesNotMatch(content, pattern, `${rel} leaks ${pattern}`);
    }
  }
});

test('new sections: no URLs, real endpoints, IDs or component-library selectors', () => {
  const sections = [
    section(read('checklist'), CHECKLIST_27),
    section(read('formats'), '## `01-business-rules.md`'),
    section(read('formats'), '## `04-test-data.md`'),
    section(read('adoSkill'), ADO_CA),
    section(read('guide'), GUIDE_ADDITIONS),
    section(read('guide'), '## 02-test-plans/'),
  ];
  const denylist = [/https?:\/\//, /dev\.azure\.com/i, /blazor/i, /radzen/i, /\brz-/i, /\/api\/[A-Z]/, /\b\d{4,}\b/];
  for (const s of sections) {
    for (const pattern of denylist) {
      assert.doesNotMatch(s, pattern, `section "${s.split('\n')[0]}" leaks ${pattern}`);
    }
  }
});
