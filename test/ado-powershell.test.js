'use strict';

// Guards for the shipped Azure DevOps PowerShell scripts (integrations/ado-powershell).
//
// A3: New-AdoTestCase (from @keber/ado-powershell) defaults Org/Project/ApiV/Headers
// from $script:AdoSession, which it does not see in every call pattern; the shipped
// create-testplan-from-mapping.ps1 now passes the session explicitly and fails fast,
// before any ADO call, when there is none.
// A6: the flat suite list of a test plan paginates at 200 and silently truncates.
//
// NOTHING here may reach Azure DevOps or any network endpoint. The behaviour tests run
// the real scripts inside a PowerShell process where Invoke-RestMethod, Invoke-WebRequest
// and the ado-powershell helpers are replaced by recording mocks, and every URL uses the
// reserved `.invalid` TLD as a second line of defence. They skip cleanly when no
// PowerShell (pwsh, or powershell.exe on Windows) is installed, as on the Linux CI.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const { REPO_ROOT, publishedFiles } = require('./helpers/published-files.js');

const SCRIPTS_DIR = path.join(REPO_ROOT, 'integrations', 'ado-powershell', 'scripts');
const CREATE_SCRIPT = path.join(SCRIPTS_DIR, 'create-testplan-from-mapping.ps1');
const SYNC_SCRIPT = path.join(SCRIPTS_DIR, 'sync-ado-titles.ps1');
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

// ---------------------------------------------------------------------------
// Static rules (no PowerShell needed)
// ---------------------------------------------------------------------------

/** Shipped files of a kind, relative to the repo root, with forward slashes. */
function shipped(filter) {
  return publishedFiles()
    .map((f) => f.replace(/\\/g, '/'))
    .filter(filter);
}

const readText = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8').replace(/^﻿/, '');

/**
 * REST request bodies that are not UTF-8 bytes. Windows PowerShell 5.1 encodes a
 * [string] body with the system codepage, so a body must be `[Text.Encoding]::UTF8.GetBytes(...)`.
 * Checks direct `-Body <expr>` arguments of Invoke-RestMethod/Invoke-WebRequest and
 * `.Body = <expr>` / `Body = <expr>` assignments used for splatting.
 */
function rawBodyViolations(text) {
  const out = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const code = line.replace(/#.*$/, '');
    const direct = code.match(/Invoke-(?:RestMethod|WebRequest)\b.*?-Body\s+(\S+)/i);
    if (direct && !/GetBytes\(/.test(direct[1])) out.push(`line ${i + 1}: -Body ${direct[1]}`);
    const assigned = code.match(/(?:^|[.\s;{])Body\s*=\s*(.+)$/i);
    if (assigned && !/UTF8\.GetBytes\(/.test(assigned[1])) out.push(`line ${i + 1}: Body = ${assigned[1].trim()}`);
  });
  return out;
}

/**
 * Flat suite listings (`.../plans/{id}/suites` with no suite id after it) in a file
 * that never follows a continuation token. That endpoint pages at 200 suites, so a
 * single call silently truncates a large plan. Reading one suite with
 * `suites/{id}?expand=children` is a different endpoint and is not matched.
 */
function flatSuiteListings(text) {
  if (/continuation-?token/i.test(text)) return [];
  const out = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (/\/plans\/[^/\s"'`]+\/suites(?![/\w])/i.test(line)) out.push(`line ${i + 1}: ${line.trim()}`);
  });
  return out;
}

test('rawBodyViolations: flags string bodies and accepts UTF-8 bytes', () => {
  assert.equal(rawBodyViolations('Invoke-RestMethod -Method Patch -Uri $u -Body $body').length, 1);
  assert.equal(rawBodyViolations('$restArgs.Body = $Body').length, 1);
  assert.equal(rawBodyViolations('$p = @{ Body = $json }').length, 1);
  assert.deepEqual(rawBodyViolations('Invoke-RestMethod -Uri $u -Body ([Text.Encoding]::UTF8.GetBytes($json))'), []);
  assert.deepEqual(rawBodyViolations('$restArgs.Body = [Text.Encoding]::UTF8.GetBytes($Body)'), []);
  assert.deepEqual(rawBodyViolations('# Invoke-RestMethod -Body $old  (comment)'), []);
});

test('flatSuiteListings: flags the paged flat list, accepts expand=children and continuation tokens', () => {
  assert.equal(flatSuiteListings('GET $base/_apis/testplan/Plans/$PlanId/suites?api-version=7.1').length, 1);
  assert.equal(flatSuiteListings('"$base/_apis/test/plans/$PlanId/suites"').length, 1);
  assert.deepEqual(flatSuiteListings('GET $base/_apis/testplan/Plans/1/suites/2?expand=children&api-version=7.1'), []);
  assert.deepEqual(flatSuiteListings('GET .../plans/1/suites/2/TestCase?api-version=7.1'), []);
  assert.deepEqual(
    flatSuiteListings('GET .../plans/1/suites?api-version=7.1\nrepeat with x-ms-continuationtoken until none'),
    []
  );
});

test('every shipped ADO .ps1 starts with a UTF-8 BOM (Windows PowerShell 5.1)', () => {
  const files = shipped((f) => f.startsWith('integrations/') && f.endsWith('.ps1'));
  assert.ok(files.length >= 4, `expected the ADO scripts in the package, got ${files.length}`);
  const missing = files.filter((f) => !fs.readFileSync(path.join(REPO_ROOT, f)).subarray(0, 3).equals(BOM));
  assert.deepEqual(missing, []);
});

test('no shipped .ps1 sends a REST body as a raw string', () => {
  const offenders = shipped((f) => f.endsWith('.ps1')).flatMap((f) =>
    rawBodyViolations(readText(f)).map((v) => `${f} ${v}`)
  );
  assert.deepEqual(offenders, []);
});

test('no shipped .ps1 uses PowerShell 7-only ConvertTo-Json -AsArray', () => {
  const offenders = shipped((f) => f.endsWith('.ps1')).filter((f) => /ConvertTo-Json\b[^\n]*-AsArray/i.test(readText(f)));
  assert.deepEqual(offenders, []);
});

test('no shipped script or ADO doc lists suites through the paged flat list', () => {
  const offenders = shipped(
    (f) =>
      f.endsWith('.ps1') ||
      f.startsWith('skills/qa-ado-integration/') ||
      f.startsWith('integrations/ado-powershell/')
  )
    .filter((f) => /\.(ps1|md)$/.test(f))
    .flatMap((f) => flatSuiteListings(readText(f)).map((v) => `${f} ${v}`));
  assert.deepEqual(offenders, []);
});

test('the ADO docs prescribe reading child suites with expand=children', () => {
  const docs = ['integrations/ado-powershell/README.md', 'skills/qa-ado-integration/references/scripts-and-config.md'];
  for (const doc of docs) {
    assert.match(readText(doc), /suites\/\{[^}]+\}\?expand=children/, `${doc} must show suites/{id}?expand=children`);
  }
});

// ---------------------------------------------------------------------------
// Behaviour with mocks (needs PowerShell; skipped when none is installed)
// ---------------------------------------------------------------------------

function findPowerShell() {
  const candidates = process.platform === 'win32' ? ['pwsh', 'powershell.exe'] : ['pwsh'];
  for (const exe of candidates) {
    const r = spawnSync(exe, ['-NoProfile', '-NonInteractive', '-Command', 'exit 0'], {
      encoding: 'utf8',
      timeout: 30000,
      windowsHide: true,
    });
    if (!r.error && r.status === 0) return exe;
  }
  return null;
}

const POWERSHELL = findPowerShell();
const psTest = POWERSHELL ? test : test.skip;

const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;

// Mocks shared by every run. Functions in the global scope take precedence over the
// cmdlets of the same name, so the real Invoke-RestMethod is never reached.
const MOCKS = `
$global:QaCalls = New-Object System.Collections.ArrayList
function global:Invoke-RestMethod {
    param($Method, $Uri, $Headers, $Body, $ContentType)
    $bodyInfo = if ($null -eq $Body) { $null }
                elseif ($Body -is [byte[]]) { 'bytes:' + [Convert]::ToBase64String($Body) }
                else { 'string:' + [string]$Body }
    [void]$global:QaCalls.Add([ordered]@{
        fn = 'Invoke-RestMethod'; method = [string]$Method; uri = [string]$Uri
        auth = if ($Headers) { [string]$Headers['Authorization'] } else { $null }
        contentType = [string]$ContentType; body = $bodyInfo })
    return [pscustomobject]@{ id = 1 }
}
function global:Invoke-WebRequest { throw 'network access is disabled in tests' }
`;

// Helper mocks with the session parameters of @keber/ado-powershell 1.5.0 but WITHOUT
// defaults: a call that does not pass the session explicitly records nulls, which is
// what the real helpers resolve to when $script:AdoSession is not visible to them.
const HELPER_MOCKS = `
function global:New-AdoTestCase {
    [CmdletBinding(SupportsShouldProcess)]
    param([Parameter(Mandatory)][string]$Title, [string[]]$Steps, [string]$ExpectedResult,
          [string]$Org, [string]$Project, [string]$ApiV, [hashtable]$Headers)
    [void]$global:QaCalls.Add([ordered]@{
        fn = 'New-AdoTestCase'; title = $Title; steps = @($Steps); expectedResult = $ExpectedResult
        org = $Org; project = $Project; apiV = $ApiV
        auth = if ($Headers) { [string]$Headers['Authorization'] } else { $null } })
    return [pscustomobject]@{ id = 5000 + $global:QaCalls.Count }
}
function global:Add-AdoTestCaseToSuite {
    [CmdletBinding(SupportsShouldProcess)]
    param([int]$PlanId, [int]$SuiteId, [int[]]$TestCaseIds,
          [string]$Org, [string]$Project, [string]$ApiV, [hashtable]$Headers)
    [void]$global:QaCalls.Add([ordered]@{
        fn = 'Add-AdoTestCaseToSuite'; planId = $PlanId; suiteId = $SuiteId; testCaseIds = @($TestCaseIds)
        org = $Org; project = $Project; apiV = $ApiV
        auth = if ($Headers) { [string]$Headers['Authorization'] } else { $null } })
}
`;

const LEGACY_HELPER_MOCKS = `
function global:New-AdoTestCase {
    [CmdletBinding(SupportsShouldProcess)]
    param([Parameter(Mandatory)][string]$Title, [string[]]$Steps, [string]$ExpectedResult)
    [void]$global:QaCalls.Add([ordered]@{ fn = 'New-AdoTestCase'; title = $Title })
    return [pscustomobject]@{ id = 7000 + $global:QaCalls.Count }
}
function global:Add-AdoTestCaseToSuite {
    [CmdletBinding(SupportsShouldProcess)]
    param([int]$PlanId, [int]$SuiteId, [int[]]$TestCaseIds)
    [void]$global:QaCalls.Add([ordered]@{ fn = 'Add-AdoTestCaseToSuite'; testCaseIds = @($TestCaseIds) })
}
`;

const FAKE_SESSION = `[pscustomobject]@{ Org = 'example-org'; Project = 'ExampleProject'; ApiV = '7.1'; BaseUrl = 'https://ado.invalid/example-org'; Headers = @{ Authorization = 'Basic FAKE-NOT-A-TOKEN' } }`;

/**
 * Runs `body` (PowerShell) after the mocks in a fresh process and returns
 * { calls, error, warnings, stdout, stderr, status }. `body` runs the script under
 * test with `&`; its terminating error is captured, not rethrown.
 */
function runPs(dir, { mocks = HELPER_MOCKS, body }) {
  const resultFile = path.join(dir, 'result.json');
  const harness = `
$ErrorActionPreference = 'Stop'
${MOCKS}
${mocks}
$qaError = $null
$qaWarnings = @()
try {
    ${body} 3>&1 | ForEach-Object {
        if ($_ -is [System.Management.Automation.WarningRecord]) { $qaWarnings += $_.Message }
    }
} catch {
    $qaError = $_.Exception.Message
}
$result = [ordered]@{ calls = @($global:QaCalls); error = $qaError; warnings = @($qaWarnings) }
[IO.File]::WriteAllText(${psQuote(resultFile)}, (ConvertTo-Json -InputObject $result -Depth 8), (New-Object Text.UTF8Encoding($false)))
`;
  const harnessFile = path.join(dir, 'harness.ps1');
  fs.writeFileSync(harnessFile, Buffer.concat([BOM, Buffer.from(harness, 'utf8')]));
  const args = ['-NoProfile', '-NonInteractive'];
  if (process.platform === 'win32') args.push('-ExecutionPolicy', 'Bypass');
  args.push('-File', harnessFile);
  const r = spawnSync(POWERSHELL, args, { cwd: dir, encoding: 'utf8', timeout: 120000, windowsHide: true });
  assert.ok(fs.existsSync(resultFile), `harness produced no result.\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
  const result = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
  return { ...result, calls: result.calls || [], warnings: result.warnings || [], stdout: r.stdout, stderr: r.stderr };
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'qa-ado-ps-'));
}

/** A tc-mapping.json with two test cases; returns its path. */
function writeMapping(dir) {
  const file = path.join(dir, 'tc-mapping.json');
  const mapping = {
    planId: 101,
    suiteId: 202,
    testCases: [
      {
        localId: 'TC-MOD-001',
        title: 'Creación de registro válido',
        specFile: 'mod/create.spec.ts',
        steps: ['Abrir la pantalla', 'Guardar el formulario'],
        expectedResult: 'El registro se guarda con éxito',
      },
      { localId: 'TC-MOD-002', title: 'Solo título', specFile: 'mod/create.spec.ts' },
    ],
  };
  fs.writeFileSync(file, JSON.stringify(mapping, null, 2), 'utf8');
  return file;
}

function assertSessionPassed(calls) {
  const helperCalls = calls.filter((c) => c.fn !== 'Invoke-RestMethod');
  assert.equal(helperCalls.length, 4, `expected 2 creates + 2 suite adds, got ${JSON.stringify(calls)}`);
  for (const c of helperCalls) {
    assert.equal(c.org, 'example-org', `${c.fn} got no explicit Org`);
    assert.equal(c.project, 'ExampleProject', `${c.fn} got no explicit Project`);
    assert.equal(c.apiV, '7.1', `${c.fn} got no explicit ApiV`);
    assert.equal(c.auth, 'Basic FAKE-NOT-A-TOKEN', `${c.fn} got no explicit Headers`);
  }
  assert.equal(calls.filter((c) => c.fn === 'Invoke-RestMethod').length, 0, 'no direct REST call expected');
}

psTest('create-testplan: passes a visible $AdoSession explicitly to every helper call (A3)', () => {
  const dir = tempDir();
  const mapping = writeMapping(dir);
  const out = path.join(dir, 'ado-ids.json');
  const r = runPs(dir, {
    body: `$global:AdoSession = ${FAKE_SESSION}
    & ${psQuote(CREATE_SCRIPT)} -PlanId 101 -MappingFile ${psQuote(mapping)} -OutputFile ${psQuote(out)}`,
  });
  assert.equal(r.error, null, r.stderr);
  assertSessionPassed(r.calls);
  const creates = r.calls.filter((c) => c.fn === 'New-AdoTestCase');
  assert.equal(creates[0].title, '[TC-MOD-001] Creación de registro válido');
  assert.deepEqual(creates[0].steps, ['Abrir la pantalla', 'Guardar el formulario']);
  assert.equal(creates[0].expectedResult, 'El registro se guarda con éxito');
  const adds = r.calls.filter((c) => c.fn === 'Add-AdoTestCaseToSuite');
  assert.equal(adds[0].planId, 101);
  assert.equal(adds[0].suiteId, 202, 'suiteId falls back to the mapping');
  const ids = JSON.parse(fs.readFileSync(out, 'utf8').replace(/^﻿/, ''));
  assert.deepEqual(ids.map((i) => i.localId), ['TC-MOD-001', 'TC-MOD-002']);
});

psTest('create-testplan: an explicit -Session hashtable wins and needs no $AdoSession', () => {
  const dir = tempDir();
  const mapping = writeMapping(dir);
  const r = runPs(dir, {
    body: `$s = @{ Org = 'example-org'; Project = 'ExampleProject'; Headers = @{ Authorization = 'Basic FAKE-NOT-A-TOKEN' } }
    & ${psQuote(CREATE_SCRIPT)} -PlanId 101 -SuiteId 303 -MappingFile ${psQuote(mapping)} -Session $s`,
  });
  assert.equal(r.error, null, r.stderr);
  assertSessionPassed(r.calls); // ApiV defaults to 7.1
  assert.ok(r.calls.filter((c) => c.fn === 'Add-AdoTestCaseToSuite').every((c) => c.suiteId === 303));
});

psTest('create-testplan: no session fails before any ADO call with a clear error', () => {
  const dir = tempDir();
  const mapping = writeMapping(dir);
  const r = runPs(dir, { body: `& ${psQuote(CREATE_SCRIPT)} -PlanId 101 -MappingFile ${psQuote(mapping)}` });
  assert.match(r.error || '', /ADO session not found/);
  assert.match(r.error, /-Session/);
  assert.deepEqual(r.calls, []);
  assert.ok(!fs.existsSync(path.join(dir, 'ado-ids.json')), 'no output file on failure');
});

psTest('create-testplan: an incomplete session names what is missing', () => {
  const dir = tempDir();
  const mapping = writeMapping(dir);
  const r = runPs(dir, {
    body: `& ${psQuote(CREATE_SCRIPT)} -PlanId 101 -MappingFile ${psQuote(mapping)} -Session @{ Org = 'example-org' }`,
  });
  assert.match(r.error || '', /incomplete \(missing: Project, Headers\.Authorization\)/);
  assert.deepEqual(r.calls, []);
});

psTest('create-testplan: helpers without session parameters still run (backward compatible)', () => {
  const dir = tempDir();
  const mapping = writeMapping(dir);
  const r = runPs(dir, {
    mocks: LEGACY_HELPER_MOCKS,
    body: `$global:AdoSession = ${FAKE_SESSION}
    & ${psQuote(CREATE_SCRIPT)} -PlanId 101 -MappingFile ${psQuote(mapping)}`,
  });
  assert.equal(r.error, null, r.stderr);
  assert.equal(r.calls.filter((c) => c.fn === 'New-AdoTestCase').length, 2);
  assert.ok(r.warnings.some((w) => /does not accept -Org/.test(w)), `warnings: ${JSON.stringify(r.warnings)}`);
});

function writeSyncFixture(dir) {
  const specDir = path.join(dir, 'e2e');
  fs.mkdirSync(path.join(specDir, 'reg'), { recursive: true });
  fs.writeFileSync(
    path.join(specDir, 'reg', 'apl.spec.ts'),
    "import { test } from '@playwright/test';\ntest('[4242] Validación de búsqueda por año', async () => {});\n",
    'utf8'
  );
  const mapping = path.join(dir, 'ado-ids.json');
  fs.writeFileSync(mapping, JSON.stringify([{ localId: 'TC-REG-001', adoWiId: 4242, specFile: 'reg/apl.spec.ts' }]), 'utf8');
  return { specDir, mapping };
}

psTest('sync-ado-titles: PATCH body is a UTF-8 byte JSON array with accents intact', () => {
  const dir = tempDir();
  const { specDir, mapping } = writeSyncFixture(dir);
  const r = runPs(dir, {
    mocks: '',
    body: `& ${psQuote(SYNC_SCRIPT)} -OrgUrl 'https://ado.invalid/example-org' -ProjectName 'ExampleProject' -MappingFile ${psQuote(mapping)} -SpecDir ${psQuote(specDir)} -Token 'not-a-real-token' -Confirm:$false`,
  });
  assert.equal(r.error, null, r.stderr);
  assert.equal(r.calls.length, 1, JSON.stringify(r.calls));
  const [call] = r.calls;
  assert.match(call.method, /^patch$/i);
  assert.equal(call.uri, 'https://ado.invalid/example-org/ExampleProject/_apis/wit/workitems/4242?api-version=7.1');
  assert.equal(call.contentType, 'application/json-patch+json');
  assert.equal(call.auth, `Basic ${Buffer.from(':not-a-real-token').toString('base64')}`);
  assert.ok(call.body.startsWith('bytes:'), `body must be UTF-8 bytes, got ${call.body.slice(0, 20)}`);
  const json = JSON.parse(Buffer.from(call.body.slice('bytes:'.length), 'base64').toString('utf8'));
  assert.ok(Array.isArray(json), 'JSON Patch body must be an array');
  assert.deepEqual(json, [{ op: 'replace', path: '/fields/System.Title', value: '[4242] Validación de búsqueda por año' }]);
});

psTest('sync-ado-titles: -WhatIf makes no REST call', () => {
  const dir = tempDir();
  const { specDir, mapping } = writeSyncFixture(dir);
  const r = runPs(dir, {
    mocks: '',
    body: `& ${psQuote(SYNC_SCRIPT)} -OrgUrl 'https://ado.invalid/example-org' -ProjectName 'ExampleProject' -MappingFile ${psQuote(mapping)} -SpecDir ${psQuote(specDir)} -Token 'not-a-real-token' -WhatIf`,
  });
  assert.equal(r.error, null, r.stderr);
  assert.deepEqual(r.calls, []);
});
