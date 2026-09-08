'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');

const CHECK_PATH = path.join(__dirname, '..', 'scripts', 'check-spanish-accents.js');
const { score } = require('../scripts/check-spanish-accents.js');

function runCheck(args, cwd) {
  return spawnSync(process.execPath, [CHECK_PATH, ...args], { cwd, encoding: 'utf8' });
}

function tmpFile(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-framework-accents-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, content, 'utf8');
  return file;
}

// Real Spanish prose, long enough to clear MIN_PROSE_WORDS.
const SPANISH_BODY = [
  'Este documento describe los criterios que se aplican para priorizar los casos de prueba',
  'del sprint, con foco en los flujos que tienen mayor riesgo para el negocio. Cuando una',
  'historia no tiene criterios de aceptacion completos, el equipo debe registrar los supuestos',
  'que se usaron y dejar constancia de las decisiones tomadas. Todos los casos que quedan',
  'fuera del alcance se documentan con su motivo, para que la trazabilidad sea auditable',
  'desde el plan hasta la ejecucion. Si un caso depende de datos maestros, hay que indicar',
  'cuando se preparan esos datos y donde viven, porque sin ese detalle el caso no se puede',
  'reproducir. Cada paso debe tener un resultado esperado observable, sin ambiguedad sobre',
  'lo que se considera un exito o un fallo durante la ejecucion manual de las pruebas.',
].join(' ');

const SPANISH_WITH_ACCENTS = SPANISH_BODY
  .replace(/aceptacion/g, 'aceptación')
  .replace(/ejecucion/g, 'ejecución')
  .replace(/ambieguedad|ambiguedad/g, 'ambigüedad')
  .replace(/exito/g, 'éxito');

// English prose that cites Spanish identifiers, paths and code - the false-positive case
// an absolute marker count gets wrong.
const ENGLISH_CITING_SPANISH = `
# Findings for the QA framework

This report documents defects found while running the pipeline end to end. The paths below
are relative to the installed package, and the identifiers are quoted verbatim from the
project so the maintainer can grep for them.

The skill writes to \`qa/02-test-plans/sprints/Plan-de-Pruebas-Sprint-12.md\` and reads
\`qa/01-specifications/module-clientes/05-test-scenarios.md\` for its scenarios. The origin
column accepts \`PENDING-CODE\` and \`BLOCKED-PERMISSIONS\`, and the template refers to
"Analisis de Pruebas" and "Informe de Resultados" as the two documents it produces.

\`\`\`
const ruta = 'qa/02-test-plans/sprints';
const titulo = 'Plan de Pruebas para el sprint con los casos que estan en alcance';
\`\`\`

The maintainer should decide whether this belongs upstream in the package or stays as a
project-level override, because the trade-off depends on how many projects hit the same
problem. Nothing here needs translation; the report is written in English on purpose.
`;

test('classifies Spanish prose as Spanish', () => {
  const result = score(SPANISH_WITH_ACCENTS);
  assert.equal(result.isSpanish, true);
  assert.equal(result.hasAccents, true);
});

test('classifies English prose citing Spanish identifiers as English', () => {
  const result = score(ENGLISH_CITING_SPANISH);
  assert.equal(
    result.isSpanish,
    false,
    `English report misclassified as Spanish (density ${result.density.toFixed(3)})`
  );
});

test('density gap between English and Spanish is wide enough to be safe', () => {
  const es = score(SPANISH_WITH_ACCENTS).density;
  const en = score(ENGLISH_CITING_SPANISH).density;
  assert.ok(es > en * 3, `expected a wide gap, got es=${es.toFixed(3)} en=${en.toFixed(3)}`);
});

test('short files are not judged', () => {
  const result = score('Este es un texto corto que no alcanza el minimo de palabras.');
  assert.equal(result.isSpanish, false);
});

test('fails on Spanish markdown with no accents', () => {
  const file = tmpFile('spec.md', SPANISH_BODY);
  const run = runCheck([file]);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Spanish Markdown without accented characters/);
});

test('passes on Spanish markdown that carries its accents', () => {
  const file = tmpFile('spec.md', SPANISH_WITH_ACCENTS);
  const run = runCheck([file]);
  assert.equal(run.status, 0);
});

test('passes on English markdown with no accents', () => {
  const file = tmpFile('report.md', ENGLISH_CITING_SPANISH);
  const run = runCheck([file]);
  assert.equal(run.status, 0);
});

test('--report never fails, even on a violation', () => {
  const file = tmpFile('spec.md', SPANISH_BODY);
  const run = runCheck(['--report', file]);
  assert.equal(run.status, 0);
  assert.match(run.stdout, /ES\s+density=/);
});

test('exits 2 with no arguments', () => {
  const run = runCheck([]);
  assert.equal(run.status, 2);
});

test("the package's own templates and skills pass the check", () => {
  const root = path.join(__dirname, '..');
  const run = runCheck(['templates', 'skills'], root);
  assert.equal(run.status, 0, run.stderr);
});
