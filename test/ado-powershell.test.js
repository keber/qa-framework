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

/**
 * File writes that produce a UTF-8 BOM on Windows PowerShell 5.1: `Set-Content`,
 * `Add-Content` or `Out-File` with `-Encoding UTF8`, and `WriteAllText`/`WriteAllLines`
 * with `[Text.Encoding]::UTF8` (its preamble is the BOM). A BOM-less write uses
 * `New-Object Text.UTF8Encoding($false)`.
 */
function bomWriteViolations(text) {
  const out = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const code = line.replace(/#.*$/, '');
    if (/\b(?:Set-Content|Add-Content|Out-File)\b.*-Encoding\s+['"]?UTF8\b/i.test(code)) out.push(`line ${i + 1}: ${code.trim()}`);
    if (/Write(?:AllText|AllLines)\s*\(.*\[(?:System\.)?Text\.Encoding\]::UTF8\s*\)/i.test(code)) out.push(`line ${i + 1}: ${code.trim()}`);
  });
  return out;
}

test('bomWriteViolations: flags BOM-producing writes and accepts UTF8Encoding($false)', () => {
  assert.equal(bomWriteViolations('$json | Set-Content $out -Encoding UTF8').length, 1);
  assert.equal(bomWriteViolations("$x | Out-File -FilePath $f -Encoding 'utf8'").length, 1);
  assert.equal(bomWriteViolations('[System.IO.File]::WriteAllText($f, $json, [System.Text.Encoding]::UTF8)').length, 1);
  assert.deepEqual(bomWriteViolations('[IO.File]::WriteAllText($f, $json, (New-Object Text.UTF8Encoding($false)))'), []);
  assert.deepEqual(bomWriteViolations('$t = [IO.File]::ReadAllText($f, [Text.Encoding]::UTF8)'), []);
  assert.deepEqual(bomWriteViolations('# Set-Content $f -Encoding UTF8 (comment)'), []);
});

// PowerShell 7 (.NET) can return a BOM as U+FEFF from ReadAllText with an explicit
// encoding; written back, it puts the BOM into the user's file. Found by CI on Linux.
test('every ReadAllText in a shipped .ps1 lives in Read-Utf8Text, which drops a leading BOM', () => {
  const scripts = shipped((f) => f.startsWith('integrations/ado-powershell/') && f.endsWith('.ps1'));
  assert.ok(scripts.length > 0);
  for (const rel of scripts) {
    const text = readText(rel);
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      if (!/ReadAllText\(/.test(line)) return;
      const inHelper = lines.slice(Math.max(0, i - 3), i).some((l) => /function Read-Utf8Text/.test(l));
      assert.ok(inHelper, `${rel}:${i + 1} reads with ReadAllText outside Read-Utf8Text`);
    });
    if (/function Read-Utf8Text/.test(text)) {
      assert.match(text, /\[char\]0xFEFF/, `${rel}: Read-Utf8Text must drop a leading U+FEFF`);
    }
  }
});

test('no shipped .ps1 writes a file with a UTF-8 BOM (users\' .ts and .json stay BOM-less)', () => {
  const offenders = shipped((f) => f.endsWith('.ps1')).flatMap((f) =>
    bomWriteViolations(readText(f)).map((v) => `${f} ${v}`)
  );
  assert.deepEqual(offenders, []);
});

test('the results and issue scripts ship next to the other ADO scripts', () => {
  const files = shipped((f) => f.startsWith('integrations/ado-powershell/scripts/'));
  for (const name of ['publish-results.ps1', 'create-issue.ps1']) {
    assert.ok(files.includes(`integrations/ado-powershell/scripts/${name}`), `${name} is not published`);
  }
});

test('the new ADO scripts send every HTTP request through the single Invoke-AdoRest seam', () => {
  for (const name of ['publish-results.ps1', 'create-issue.ps1']) {
    const text = readText(`integrations/ado-powershell/scripts/${name}`);
    const code = text
      .replace(/<#[\s\S]*?#>/g, '')
      .split(/\r?\n/)
      .filter((l) => !/^\s*#/.test(l))
      .join('\n');
    const direct = code.match(/\bInvoke-(?:RestMethod|WebRequest)\b/gi) || [];
    assert.equal(direct.length, 1, `${name}: expected exactly one direct HTTP cmdlet call (inside Invoke-AdoRest)`);
    assert.match(code, /function Invoke-AdoRest\b/, `${name}: Invoke-AdoRest missing`);
    assert.match(code, /\[switch\]\s*\$DryRun/i, `${name}: -DryRun missing`);
  }
});

test('ADO docs document the read/write variables and the new scripts', () => {
  const config = readText('skills/qa-ado-integration/references/scripts-and-config.md');
  for (const name of ['ADO_PROJECT_READ', 'ADO_PROJECT_WRITE', 'ADO_PAT_READ', 'ADO_PAT_WRITE']) {
    assert.match(config, new RegExp(`\`${name}\``), `scripts-and-config.md does not document ${name}`);
  }
  assert.match(config, /### publish-results\.ps1/);
  assert.match(config, /### create-issue\.ps1/);
  const readme = readText('integrations/ado-powershell/README.md');
  assert.match(readme, /publish-results\.ps1/);
  assert.match(readme, /create-issue\.ps1/);
  const protocol = readText('skills/qa-ado-integration/references/ado-workitem-full-read-protocol.md');
  assert.match(protocol, /\$env:ADO_PROJECT_READ/, 'the full-read recipe must read from ADO_PROJECT_READ');
  assert.match(protocol, /else \{ \$env:ADO_PROJECT \}/, 'the full-read recipe must fall back to ADO_PROJECT');
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
 * { calls, error, warnings, output, stdout, stderr, status }. `body` runs the script
 * under test with `&`; its terminating error is captured, not rethrown; the objects it
 * writes to the pipeline are returned in `output`.
 * Every ADO_* / AZURE_TOKEN variable inherited from the machine is removed first, so a
 * developer's real credentials never reach a script under test; `env` then sets fakes.
 */
function runPs(dir, { mocks = HELPER_MOCKS, body, env = {} }) {
  const resultFile = path.join(dir, 'result.json');
  const envLines = Object.entries(env)
    .map(([name, value]) => `$env:${name} = ${psQuote(value)}`)
    .join('\n');
  const harness = `
$ErrorActionPreference = 'Stop'
Get-ChildItem env: | Where-Object { $_.Name -like 'ADO_*' -or $_.Name -eq 'AZURE_TOKEN' } |
    ForEach-Object { Remove-Item -LiteralPath "env:$($_.Name)" }
${envLines}
${MOCKS}
${mocks}
$qaError = $null
$qaWarnings = @()
$qaOutput = @()
try {
    ${body} 3>&1 | ForEach-Object {
        if ($_ -is [System.Management.Automation.WarningRecord]) { $qaWarnings += $_.Message }
        else { $qaOutput += $_ }
    }
} catch {
    $qaError = $_.Exception.Message
}
$result = [ordered]@{ calls = @($global:QaCalls); error = $qaError; warnings = @($qaWarnings); output = @($qaOutput) }
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
  return {
    ...result,
    calls: result.calls || [],
    warnings: result.warnings || [],
    output: result.output || [],
    stdout: r.stdout,
    stderr: r.stderr,
  };
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

// ---------------------------------------------------------------------------
// WP4.1 follow-ups: write split, encodings, helper auto-load
// ---------------------------------------------------------------------------

const INJECT_SCRIPT = path.join(SCRIPTS_DIR, 'inject-ado-ids.ps1');
const MD_SCRIPT = path.join(SCRIPTS_DIR, 'md-to-tc-mapping.ps1');
const PUBLISH_SCRIPT = path.join(SCRIPTS_DIR, 'publish-results.ps1');
const ISSUE_SCRIPT = path.join(SCRIPTS_DIR, 'create-issue.ps1');

const basic = (pat) => `Basic ${Buffer.from(`:${pat}`).toString('base64')}`;
const hasBom = (file) => fs.readFileSync(file).subarray(0, 3).equals(BOM);

psTest('sync-ado-titles: without -ProjectName/-Token it prefers ADO_PROJECT_WRITE and ADO_PAT_WRITE', () => {
  const dir = tempDir();
  const { specDir, mapping } = writeSyncFixture(dir);
  const r = runPs(dir, {
    mocks: '',
    env: {
      ADO_ORG: 'https://ado.invalid/example-org',
      ADO_PROJECT: 'GenericProject',
      ADO_PROJECT_WRITE: 'WriteProject',
      ADO_PAT: 'generic-fake',
      ADO_PAT_WRITE: 'write-fake',
    },
    body: `& ${psQuote(SYNC_SCRIPT)} -MappingFile ${psQuote(mapping)} -SpecDir ${psQuote(specDir)} -Confirm:$false`,
  });
  assert.equal(r.error, null, r.stderr);
  assert.equal(r.calls.length, 1, JSON.stringify(r.calls));
  assert.equal(r.calls[0].uri, 'https://ado.invalid/example-org/WriteProject/_apis/wit/workitems/4242?api-version=7.1');
  assert.equal(r.calls[0].auth, basic('write-fake'));
});

psTest('sync-ado-titles: falls back to ADO_PROJECT and ADO_PAT, and names the variables when nothing is set', () => {
  const dir = tempDir();
  const { specDir, mapping } = writeSyncFixture(dir);
  const fallback = runPs(dir, {
    mocks: '',
    env: { ADO_ORG: 'https://ado.invalid/example-org', ADO_PROJECT: 'GenericProject', ADO_PAT: 'generic-fake' },
    body: `& ${psQuote(SYNC_SCRIPT)} -MappingFile ${psQuote(mapping)} -SpecDir ${psQuote(specDir)} -Confirm:$false`,
  });
  assert.equal(fallback.error, null, fallback.stderr);
  assert.match(fallback.calls[0].uri, /\/GenericProject\/_apis\//);
  assert.equal(fallback.calls[0].auth, basic('generic-fake'));

  const missing = runPs(tempDir(), {
    mocks: '',
    body: `& ${psQuote(SYNC_SCRIPT)} -MappingFile ${psQuote(mapping)} -SpecDir ${psQuote(specDir)} -Confirm:$false`,
  });
  assert.match(missing.error || '', /ADO_ORG/);
  assert.match(missing.error, /ADO_PROJECT_WRITE/);
  assert.match(missing.error, /ADO_PAT_WRITE/);
  assert.deepEqual(missing.calls, []);
});

psTest('create-testplan: with no session it builds one from ADO_ORG and the write variables', () => {
  const dir = tempDir();
  const mapping = writeMapping(dir);
  const r = runPs(dir, {
    env: { ADO_ORG: 'example-org', ADO_PROJECT_WRITE: 'ExampleProject', ADO_PAT_WRITE: 'write-fake' },
    body: `& ${psQuote(CREATE_SCRIPT)} -PlanId 101 -MappingFile ${psQuote(mapping)}`,
  });
  assert.equal(r.error, null, r.stderr);
  const helperCalls = r.calls.filter((c) => c.fn !== 'Invoke-RestMethod');
  assert.equal(helperCalls.length, 4, JSON.stringify(r.calls));
  for (const c of helperCalls) {
    assert.equal(c.org, 'example-org');
    assert.equal(c.project, 'ExampleProject');
    assert.equal(c.auth, basic('write-fake'));
  }
});

psTest('create-testplan: ADO_PROJECT_WRITE and ADO_PAT_WRITE override a loader $AdoSession, not an explicit -Session', () => {
  const dir = tempDir();
  const mapping = writeMapping(dir);
  const env = { ADO_PROJECT_WRITE: 'WriteProject', ADO_PAT_WRITE: 'write-fake' };
  const loader = runPs(dir, {
    env,
    body: `$global:AdoSession = ${FAKE_SESSION}
    & ${psQuote(CREATE_SCRIPT)} -PlanId 101 -MappingFile ${psQuote(mapping)}`,
  });
  assert.equal(loader.error, null, loader.stderr);
  const loaderCalls = loader.calls.filter((c) => c.fn === 'New-AdoTestCase');
  assert.equal(loaderCalls.length, 2);
  assert.ok(loaderCalls.every((c) => c.project === 'WriteProject' && c.auth === basic('write-fake')), JSON.stringify(loaderCalls));

  const explicit = runPs(tempDir(), {
    env,
    body: `& ${psQuote(CREATE_SCRIPT)} -PlanId 101 -MappingFile ${psQuote(mapping)} -Session (${FAKE_SESSION})`,
  });
  assert.equal(explicit.error, null, explicit.stderr);
  assertSessionPassed(explicit.calls);
});

psTest('create-testplan: ado-ids.json is UTF-8 without BOM, a JSON array, accents intact', () => {
  const dir = tempDir();
  const file = path.join(dir, 'tc-mapping.json');
  fs.writeFileSync(
    file,
    JSON.stringify({
      planId: 101,
      suiteId: 202,
      testCases: [{ localId: 'TC-MOD-009', title: 'Revisión de año fiscal', specFile: 'mod/a.spec.ts' }],
    }),
    'utf8'
  );
  const out = path.join(dir, 'ado-ids.json');
  const r = runPs(dir, {
    body: `& ${psQuote(CREATE_SCRIPT)} -PlanId 101 -MappingFile ${psQuote(file)} -OutputFile ${psQuote(out)} -Session (${FAKE_SESSION})`,
  });
  assert.equal(r.error, null, r.stderr);
  assert.ok(!hasBom(out), 'ado-ids.json must not start with a BOM');
  const ids = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.ok(Array.isArray(ids), 'a single created test case must still be written as an array');
  assert.equal(ids[0].title, 'Revisión de año fiscal');
});

/** A fake project root whose node_modules holds an @keber/ado-powershell load.ps1. */
function writeFakeHelperPackage(root) {
  const skillDir = path.join(root, 'node_modules', '@keber', 'ado-powershell', '.github', 'skills', 'ado-powershell');
  fs.mkdirSync(skillDir, { recursive: true });
  const load = `${HELPER_MOCKS}
$AdoSession = ${FAKE_SESSION}
`;
  fs.writeFileSync(path.join(skillDir, 'load.ps1'), Buffer.concat([BOM, Buffer.from(load, 'utf8')]));
}

psTest('create-testplan: auto-loads @keber/ado-powershell from the project root node_modules (walking up)', () => {
  const dir = tempDir();
  writeFakeHelperPackage(dir);
  const sub = path.join(dir, 'qa', '08-azure-integration');
  fs.mkdirSync(sub, { recursive: true });
  const mapping = writeMapping(sub);
  const r = runPs(dir, {
    mocks: '',
    body: `Set-Location -LiteralPath ${psQuote(sub)}
    & ${psQuote(CREATE_SCRIPT)} -PlanId 101 -MappingFile ${psQuote(mapping)}`,
  });
  assert.equal(r.error, null, r.stderr);
  assertSessionPassed(r.calls);
});

psTest('create-testplan: without @keber/ado-powershell it fails with a clear error and no call', () => {
  const dir = tempDir();
  const mapping = writeMapping(dir);
  const r = runPs(dir, {
    mocks: '',
    body: `& ${psQuote(CREATE_SCRIPT)} -PlanId 101 -MappingFile ${psQuote(mapping)} -Session (${FAKE_SESSION})`,
  });
  assert.match(r.error || '', /node_modules[\\/]@keber[\\/]ado-powershell/);
  assert.match(r.error, /npm install/);
  assert.deepEqual(r.calls, []);
});

psTest('md-to-tc-mapping: writes tc-mapping.json as UTF-8 without BOM with accents intact', () => {
  const dir = tempDir();
  const plan = path.join(dir, 'Plan-de-Pruebas-Ejemplo.md');
  fs.writeFileSync(
    plan,
    [
      '# Plan',
      '',
      '## Tabla de Pruebas',
      '',
      '| TC-ID | Tipo | Titulo | Steps | Resultado esperado |',
      '|---|---|---|---|---|',
      '| TC-MOD-001 | E2E | Búsqueda por año | 1. Abrir la pantalla<br>2. Buscar por año | Se muestran los registros del año |',
      '',
    ].join('\n'),
    'utf8'
  );
  const out = path.join(dir, 'out', 'tc-mapping.json');
  const r = runPs(dir, {
    mocks: '',
    body: `& ${psQuote(MD_SCRIPT)} -PlanFile ${psQuote(plan)} -SpecFile 'mod/a.spec.ts' -OutputFile ${psQuote(out)}`,
  });
  assert.equal(r.error, null, r.stderr);
  assert.ok(!hasBom(out), 'tc-mapping.json must not start with a BOM');
  const mapping = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(mapping.testCases[0].title, 'Búsqueda por año');
  assert.deepEqual(mapping.testCases[0].steps, ['Abrir la pantalla', 'Buscar por año']);
});

psTest('inject-ado-ids: keeps spec files BOM-less, accents intact and line endings unchanged', () => {
  const dir = tempDir();
  const specDir = path.join(dir, 'e2e');
  fs.mkdirSync(path.join(specDir, 'mod'), { recursive: true });
  const crlf = path.join(specDir, 'mod', 'crlf.spec.ts');
  const lf = path.join(specDir, 'mod', 'lf.spec.ts');
  const bom = path.join(specDir, 'mod', 'bom.spec.ts');
  fs.writeFileSync(crlf, "import { test } from '@playwright/test';\r\ntest('[TC-MOD-001] Validación de año', async () => {});\r\n", 'utf8');
  fs.writeFileSync(lf, "test('[TC-MOD-002] Creación con ñandú', async () => {});\n// comentario: acción\n", 'utf8');
  fs.writeFileSync(bom, Buffer.concat([BOM, Buffer.from("test('[TC-MOD-003] Revisión', async () => {});\n", 'utf8')]));
  const mapping = path.join(dir, 'ado-ids.json');
  fs.writeFileSync(
    mapping,
    JSON.stringify([
      { localId: 'TC-MOD-001', adoWiId: 4001, specFile: 'mod/crlf.spec.ts' },
      { localId: 'TC-MOD-002', adoWiId: 4002, specFile: 'mod/lf.spec.ts' },
      { localId: 'TC-MOD-003', adoWiId: 4003, specFile: 'mod/bom.spec.ts' },
    ]),
    'utf8'
  );
  const r = runPs(dir, {
    mocks: '',
    body: `& ${psQuote(INJECT_SCRIPT)} -SpecDir ${psQuote(specDir)} -MappingFile ${psQuote(mapping)}`,
  });
  assert.equal(r.error, null, r.stderr);
  for (const f of [crlf, lf, bom]) assert.ok(!hasBom(f), `${path.basename(f)} must not gain or keep a BOM`);
  assert.equal(
    fs.readFileSync(crlf, 'utf8'),
    "import { test } from '@playwright/test';\r\ntest('[4001] [TC-MOD-001] Validación de año', async () => {});\r\n"
  );
  assert.equal(fs.readFileSync(lf, 'utf8'), "test('[4002] [TC-MOD-002] Creación con ñandú', async () => {});\n// comentario: acción\n");
  assert.equal(fs.readFileSync(bom, 'utf8'), "test('[4003] [TC-MOD-003] Revisión', async () => {});\n");
});

psTest('inject-ado-ids: -DryRun leaves the file byte-identical', () => {
  const dir = tempDir();
  const specDir = path.join(dir, 'e2e');
  fs.mkdirSync(specDir, { recursive: true });
  const spec = path.join(specDir, 'a.spec.ts');
  const original = Buffer.concat([BOM, Buffer.from("test('[TC-MOD-001] Validación', async () => {});\r\n", 'utf8')]);
  fs.writeFileSync(spec, original);
  const mapping = path.join(dir, 'ado-ids.json');
  fs.writeFileSync(mapping, JSON.stringify([{ localId: 'TC-MOD-001', adoWiId: 4001, specFile: 'a.spec.ts' }]), 'utf8');
  const r = runPs(dir, {
    mocks: '',
    body: `& ${psQuote(INJECT_SCRIPT)} -SpecDir ${psQuote(specDir)} -MappingFile ${psQuote(mapping)} -DryRun`,
  });
  assert.equal(r.error, null, r.stderr);
  assert.ok(fs.readFileSync(spec).equals(original), 'dry run must not touch the file');
});

// ---------------------------------------------------------------------------
// publish-results.ps1 and create-issue.ps1 (Invoke-WebRequest is the HTTP seam)
// ---------------------------------------------------------------------------

/**
 * Replaces Invoke-WebRequest with a router: each route is { method, uri (regex), body,
 * token }. The first route whose method and uri match answers with `body` as UTF-8 JSON
 * and, when given, an x-ms-continuationtoken header. An unmatched request throws.
 */
function webMock(routes) {
  const rules = routes
    .map(
      (r) =>
        `    [pscustomobject]@{ method = ${psQuote(r.method)}; uri = ${psQuote(r.uri)}; body = ${psQuote(
          r.body === undefined ? '' : JSON.stringify(r.body)
        )}; token = ${psQuote(r.token || '')} }`
    )
    .join(',\n');
  return `
$global:QaRoutes = @(
${rules}
)
function global:Invoke-WebRequest {
    param($Method, $Uri, $Headers, $Body, $ContentType, [switch]$UseBasicParsing)
    $bodyInfo = if ($null -eq $Body) { $null }
                elseif ($Body -is [byte[]]) { 'bytes:' + [Convert]::ToBase64String($Body) }
                else { 'string:' + [string]$Body }
    [void]$global:QaCalls.Add([ordered]@{
        fn = 'Invoke-WebRequest'; method = [string]$Method; uri = [string]$Uri
        auth = if ($Headers) { [string]$Headers['Authorization'] } else { $null }
        contentType = [string]$ContentType; body = $bodyInfo; basic = [bool]$UseBasicParsing })
    $route = $global:QaRoutes | Where-Object { ([string]$Method -ieq $_.method) -and ([string]$Uri -match $_.uri) } | Select-Object -First 1
    if (-not $route) { throw "unexpected request: $Method $Uri" }
    $bytes = [Text.Encoding]::UTF8.GetBytes($route.body)
    $responseHeaders = @{}
    if ($route.token) { $responseHeaders['x-ms-continuationtoken'] = $route.token }
    return [pscustomobject]@{
        StatusCode = 200; Headers = $responseHeaders; Content = $route.body
        RawContentStream = (New-Object IO.MemoryStream (,$bytes)) }
}
`;
}

/** Decodes the JSON body of a recorded call; fails when it was not sent as UTF-8 bytes. */
function jsonBody(call) {
  assert.ok(call.body && call.body.startsWith('bytes:'), `body of ${call.method} ${call.uri} must be UTF-8 bytes`);
  return JSON.parse(Buffer.from(call.body.slice('bytes:'.length), 'base64').toString('utf8'));
}

const ORG = 'https://ado.invalid/example-org';
const BASE = `${ORG}/ExampleProject/_apis`;
const WRITE_ENV = { ADO_ORG: ORG, ADO_PROJECT_WRITE: 'ExampleProject', ADO_PAT_WRITE: 'write-fake' };

function writeResults(dir, results, extra = {}) {
  const file = path.join(dir, 'results.json');
  fs.writeFileSync(
    file,
    JSON.stringify({ planId: 101, suiteId: 202, runName: 'Ejecución manual - módulo', ...extra, results }, null, 2),
    'utf8'
  );
  return file;
}

const TWO_RESULTS = [
  { testCaseId: 4242, outcome: 'Passed', comment: 'Validación correcta' },
  { adoWiId: 4243, outcome: 'failed', comment: 'Falla en la búsqueda por año' },
];

/** Routes for a suite with two points over two pages and a run 777 with two results. */
function publishRoutes({ outcome1 = 'unspecified' } = {}) {
  return [
    {
      method: 'GET',
      uri: 'TestPoint\\?api-version=7\\.1&continuationToken=page2$',
      body: { value: [{ id: 9002, testCaseReference: { id: 4243 }, results: { outcome: 'unspecified' } }] },
    },
    {
      method: 'GET',
      uri: '/testplan/Plans/101/Suites/202/TestPoint\\?api-version=7\\.1$',
      body: { value: [{ id: 9001, testCaseReference: { id: 4242 }, results: { outcome: outcome1 } }] },
      token: 'page2',
    },
    { method: 'POST', uri: '/test/runs\\?api-version=7\\.1$', body: { id: 777, state: 'InProgress' } },
    {
      method: 'GET',
      uri: '/test/Runs/777/results\\?',
      body: {
        value: [
          { id: 100000, testCase: { id: '4242' }, testPoint: { id: '9001' } },
          { id: 100001, testCase: { id: '4243' }, testPoint: { id: '9002' } },
        ],
      },
    },
    { method: 'PATCH', uri: '/test/Runs/777/results\\?api-version=7\\.1$', body: { value: [] } },
    { method: 'PATCH', uri: '/test/runs/777\\?api-version=7\\.1$', body: { id: 777, state: 'Completed' } },
  ];
}

psTest('publish-results: creates a run bound to the points, records outcomes and closes the run', () => {
  const dir = tempDir();
  const results = writeResults(dir, TWO_RESULTS);
  const r = runPs(dir, {
    mocks: webMock(publishRoutes()),
    env: WRITE_ENV,
    body: `& ${psQuote(PUBLISH_SCRIPT)} -ResultsFile ${psQuote(results)}`,
  });
  assert.equal(r.error, null, `${r.error}\n${r.stderr}`);
  const seq = r.calls.map((c) => `${c.method.toUpperCase()} ${c.uri.replace(BASE, '')}`);
  assert.deepEqual(seq, [
    'GET /testplan/Plans/101/Suites/202/TestPoint?api-version=7.1',
    'GET /testplan/Plans/101/Suites/202/TestPoint?api-version=7.1&continuationToken=page2',
    'POST /test/runs?api-version=7.1',
    'GET /test/Runs/777/results?$top=1000&$skip=0&api-version=7.1',
    'PATCH /test/Runs/777/results?api-version=7.1',
    'PATCH /test/runs/777?api-version=7.1',
  ]);
  for (const c of r.calls) {
    assert.equal(c.auth, basic('write-fake'));
    assert.equal(c.basic, true, 'Invoke-WebRequest must use -UseBasicParsing (Windows PowerShell 5.1)');
  }
  const run = jsonBody(r.calls[2]);
  assert.equal(run.name, 'Ejecución manual - módulo');
  assert.deepEqual(run.plan, { id: '101' });
  assert.deepEqual(run.pointIds, [9001, 9002]);
  assert.equal(run.isAutomated, false);
  assert.deepEqual(jsonBody(r.calls[4]), [
    { id: 100000, outcome: 'Passed', state: 'Completed', comment: 'Validación correcta' },
    { id: 100001, outcome: 'Failed', state: 'Completed', comment: 'Falla en la búsqueda por año' },
  ]);
  assert.deepEqual(jsonBody(r.calls[5]), { state: 'Completed' });
  assert.equal(r.output.length, 1, JSON.stringify(r.output));
  assert.equal(r.output[0].runId, 777);
  assert.equal(r.output[0].published, 2);
});

psTest('publish-results: a single result is still sent as JSON arrays', () => {
  const dir = tempDir();
  const results = writeResults(dir, [TWO_RESULTS[0]]);
  const r = runPs(dir, {
    mocks: webMock(publishRoutes()),
    env: WRITE_ENV,
    body: `& ${psQuote(PUBLISH_SCRIPT)} -ResultsFile ${psQuote(results)}`,
  });
  assert.equal(r.error, null, `${r.error}\n${r.stderr}`);
  const post = r.calls.find((c) => /POST/i.test(c.method));
  assert.deepEqual(jsonBody(post).pointIds, [9001]);
  const patch = r.calls.find((c) => /PATCH/i.test(c.method) && /results/.test(c.uri));
  const body = jsonBody(patch);
  assert.ok(Array.isArray(body), 'the results PATCH body must be an array');
  assert.equal(body.length, 1);
  assert.equal(body[0].id, 100000);
});

psTest('publish-results: -DryRun sends nothing, needs no PAT and returns the planned requests', () => {
  const dir = tempDir();
  const results = writeResults(dir, TWO_RESULTS);
  const r = runPs(dir, {
    mocks: webMock([]),
    env: { ADO_ORG: 'example-org', ADO_PROJECT: 'ExampleProject' },
    body: `& ${psQuote(PUBLISH_SCRIPT)} -ResultsFile ${psQuote(results)} -DryRun`,
  });
  assert.equal(r.error, null, `${r.error}\n${r.stderr}`);
  assert.deepEqual(r.calls, [], 'a dry run must not send any request');
  const [plan] = r.output;
  assert.equal(plan.dryRun, true);
  const base = 'https://dev.azure.com/example-org/ExampleProject/_apis';
  assert.deepEqual(
    plan.requests.map((q) => `${q.method} ${q.uri}`),
    [
      `GET ${base}/testplan/Plans/101/Suites/202/TestPoint?api-version=7.1`,
      `POST ${base}/test/runs?api-version=7.1`,
      `GET ${base}/test/Runs/{runId}/results?$top=1000&$skip=0&api-version=7.1`,
      `PATCH ${base}/test/Runs/{runId}/results?api-version=7.1`,
      `PATCH ${base}/test/runs/{runId}?api-version=7.1`,
    ]
  );
  const update = JSON.parse(plan.requests[3].json);
  assert.deepEqual(update.map((u) => u.outcome), ['Passed', 'Failed']);
  assert.equal(update[1].comment, 'Falla en la búsqueda por año');
  assert.doesNotMatch(JSON.stringify(r.output) + r.stdout, /Authorization|Basic /);
});

psTest('publish-results: points that already have an outcome stop it before any write unless -Force', () => {
  const dir = tempDir();
  const results = writeResults(dir, TWO_RESULTS);
  const guarded = runPs(dir, {
    mocks: webMock(publishRoutes({ outcome1: 'passed' })),
    env: WRITE_ENV,
    body: `& ${psQuote(PUBLISH_SCRIPT)} -ResultsFile ${psQuote(results)}`,
  });
  assert.match(guarded.error || '', /already have an outcome/);
  assert.match(guarded.error, /4242/);
  assert.match(guarded.error, /-Force/);
  assert.ok(guarded.calls.length > 0 && guarded.calls.every((c) => /^get$/i.test(c.method)), 'only reads before the guard');

  const forced = runPs(tempDir(), {
    mocks: webMock(publishRoutes({ outcome1: 'passed' })),
    env: WRITE_ENV,
    body: `& ${psQuote(PUBLISH_SCRIPT)} -ResultsFile ${psQuote(results)} -Force`,
  });
  assert.equal(forced.error, null, `${forced.error}\n${forced.stderr}`);
  assert.equal(forced.output[0].runId, 777);
});

psTest('publish-results: invalid outcomes and unknown test cases fail before any write', () => {
  const dir = tempDir();
  const bad = writeResults(dir, [{ testCaseId: 4242, outcome: 'Aprobado' }]);
  const invalid = runPs(dir, {
    mocks: webMock(publishRoutes()),
    env: WRITE_ENV,
    body: `& ${psQuote(PUBLISH_SCRIPT)} -ResultsFile ${psQuote(bad)}`,
  });
  assert.match(invalid.error || '', /Aprobado/);
  assert.match(invalid.error, /Passed/);
  assert.deepEqual(invalid.calls, []);

  const dir2 = tempDir();
  const unknown = writeResults(dir2, [{ testCaseId: 9999, outcome: 'Passed' }]);
  const unmatched = runPs(dir2, {
    mocks: webMock(publishRoutes()),
    env: WRITE_ENV,
    body: `& ${psQuote(PUBLISH_SCRIPT)} -ResultsFile ${psQuote(unknown)}`,
  });
  assert.match(unmatched.error || '', /9999/);
  assert.ok(unmatched.calls.every((c) => /^get$/i.test(c.method)), 'no write when a test case has no point');
});

psTest('publish-results: missing credentials are named, never guessed', () => {
  const dir = tempDir();
  const results = writeResults(dir, TWO_RESULTS);
  const r = runPs(dir, {
    mocks: webMock(publishRoutes()),
    env: { ADO_ORG: ORG, ADO_PROJECT: 'ExampleProject' },
    body: `& ${psQuote(PUBLISH_SCRIPT)} -ResultsFile ${psQuote(results)}`,
  });
  assert.match(r.error || '', /ADO_PAT_WRITE/);
  assert.match(r.error, /ADO_PAT\b/);
  assert.deepEqual(r.calls, []);
});

function writeDescription(dir) {
  const file = path.join(dir, 'defect.html');
  fs.writeFileSync(file, '<p>La búsqueda por año no devuelve registros.</p>', 'utf8');
  return file;
}

const ISSUE_TITLE = "Búsqueda por año no devuelve registros en 'Detalle'";

psTest('create-issue: no existing item -> exact-title WIQL, then one create with UTF-8 JSON Patch', () => {
  const dir = tempDir();
  const desc = writeDescription(dir);
  const r = runPs(dir, {
    mocks: webMock([
      { method: 'POST', uri: '/_apis/wit/wiql\\?', body: { workItems: [] } },
      { method: 'POST', uri: '/_apis/wit/workitems/\\$Bug\\?api-version=7\\.1$', body: { id: 5555, fields: { 'System.State': 'New' } } },
    ]),
    env: WRITE_ENV,
    body: `& ${psQuote(ISSUE_SCRIPT)} -Title ${psQuote(ISSUE_TITLE)} -DescriptionFile ${psQuote(desc)} -Priority 2 -Tags 'qa','regresión' -AreaPath 'ExampleProject\\QA' -IterationPath 'ExampleProject\\Sprint 1' -TestedBy 4242,4243`,
  });
  assert.equal(r.error, null, `${r.error}\n${r.stderr}`);
  assert.equal(r.calls.length, 2, JSON.stringify(r.calls));
  const [wiql, create] = r.calls;
  assert.equal(wiql.uri, `${BASE}/wit/wiql?$top=50&api-version=7.1`);
  const query = jsonBody(wiql).query;
  assert.match(query, /\[System\.TeamProject\] = 'ExampleProject'/);
  assert.match(query, /\[System\.WorkItemType\] = 'Bug'/);
  assert.ok(query.includes("[System.Title] = 'Búsqueda por año no devuelve registros en ''Detalle'''"), query);
  assert.equal(create.uri, `${BASE}/wit/workitems/$Bug?api-version=7.1`);
  assert.equal(create.contentType, 'application/json-patch+json');
  const ops = jsonBody(create);
  assert.ok(Array.isArray(ops));
  const field = (p) => ops.find((o) => o.path === p);
  assert.equal(field('/fields/System.Title').value, ISSUE_TITLE);
  assert.equal(field('/fields/Microsoft.VSTS.TCM.ReproSteps').value, '<p>La búsqueda por año no devuelve registros.</p>');
  assert.equal(field('/fields/Microsoft.VSTS.Common.Priority').value, 2);
  assert.equal(field('/fields/System.Tags').value, 'qa; regresión');
  assert.equal(field('/fields/System.AreaPath').value, 'ExampleProject\\QA');
  assert.equal(field('/fields/System.IterationPath').value, 'ExampleProject\\Sprint 1');
  assert.deepEqual(
    ops.filter((o) => o.path === '/relations/-').map((o) => o.value),
    [
      { rel: 'Microsoft.VSTS.Common.TestedBy-Forward', url: `${ORG}/_apis/wit/workItems/4242` },
      { rel: 'Microsoft.VSTS.Common.TestedBy-Forward', url: `${ORG}/_apis/wit/workItems/4243` },
    ]
  );
  assert.equal(r.output[0].id, 5555);
  assert.equal(r.output[0].created, true);
});

psTest('create-issue: an existing item with the same title is returned, nothing is created', () => {
  const dir = tempDir();
  const r = runPs(dir, {
    mocks: webMock([
      { method: 'POST', uri: '/_apis/wit/wiql\\?', body: { workItems: [{ id: 321 }, { id: 654 }] } },
      {
        method: 'GET',
        uri: '/_apis/wit/workitems\\?ids=321,654&',
        body: {
          value: [
            { id: 321, fields: { 'System.Title': ISSUE_TITLE, 'System.State': 'Active', 'System.Tags': 'qa' } },
            { id: 654, fields: { 'System.Title': ISSUE_TITLE, 'System.State': 'New' } },
          ],
        },
      },
    ]),
    env: WRITE_ENV,
    body: `& ${psQuote(ISSUE_SCRIPT)} -Title ${psQuote(ISSUE_TITLE)} -Description '<p>x</p>'`,
  });
  assert.equal(r.error, null, `${r.error}\n${r.stderr}`);
  assert.ok(!r.calls.some((c) => /workitems\/\$/i.test(c.uri)), 'must not create a duplicate');
  assert.equal(r.output[0].id, 321);
  assert.equal(r.output[0].created, false);
  assert.equal(r.output[0].state, 'Active');
  assert.ok(r.warnings.some((w) => /654/.test(w)), `the other match is reported: ${JSON.stringify(r.warnings)}`);
});

psTest('create-issue: -DedupKey searches by tag, ignores partial tag matches and adds the key as a tag', () => {
  const routes = (tags) => [
    { method: 'POST', uri: '/_apis/wit/wiql\\?', body: { workItems: [{ id: 321 }] } },
    {
      method: 'GET',
      uri: '/_apis/wit/workitems\\?ids=321&',
      body: { value: [{ id: 321, fields: { 'System.Title': 'Otro título', 'System.State': 'Active', 'System.Tags': tags } }] },
    },
    { method: 'POST', uri: '/_apis/wit/workitems/\\$Issue\\?', body: { id: 5556 } },
  ];
  const partial = runPs(tempDir(), {
    mocks: webMock(routes('qa; DEF-MOD-0011')),
    env: WRITE_ENV,
    body: `& ${psQuote(ISSUE_SCRIPT)} -Type Issue -Title 'Nuevo título' -Description '<p>x</p>' -DedupKey 'DEF-MOD-001' -Tags 'qa'`,
  });
  assert.equal(partial.error, null, `${partial.error}\n${partial.stderr}`);
  const query = jsonBody(partial.calls[0]).query;
  assert.match(query, /\[System\.Tags\] CONTAINS 'DEF-MOD-001'/);
  assert.doesNotMatch(query, /System\.Title/);
  const create = partial.calls.find((c) => /workitems\/\$Issue/.test(c.uri));
  assert.ok(create, 'a partial tag match is not the same defect');
  const ops = jsonBody(create);
  assert.equal(ops.find((o) => o.path === '/fields/System.Tags').value, 'qa; DEF-MOD-001');
  assert.ok(ops.some((o) => o.path === '/fields/System.Description'), 'an Issue gets System.Description');
  assert.equal(partial.output[0].created, true);

  const exact = runPs(tempDir(), {
    mocks: webMock(routes('qa; DEF-MOD-001')),
    env: WRITE_ENV,
    body: `& ${psQuote(ISSUE_SCRIPT)} -Type Issue -Title 'Nuevo título' -Description '<p>x</p>' -DedupKey 'DEF-MOD-001'`,
  });
  assert.equal(exact.error, null, `${exact.error}\n${exact.stderr}`);
  assert.equal(exact.output[0].id, 321);
  assert.equal(exact.output[0].created, false);
});

psTest('create-issue: -DryRun sends nothing and returns the search and create requests', () => {
  const dir = tempDir();
  const r = runPs(dir, {
    mocks: webMock([]),
    env: { ADO_ORG: 'example-org', ADO_PROJECT: 'ExampleProject' },
    body: `& ${psQuote(ISSUE_SCRIPT)} -Title ${psQuote(ISSUE_TITLE)} -Description '<p>x</p>' -DryRun`,
  });
  assert.equal(r.error, null, `${r.error}\n${r.stderr}`);
  assert.deepEqual(r.calls, []);
  const [plan] = r.output;
  assert.equal(plan.dryRun, true);
  assert.deepEqual(
    plan.requests.map((q) => `${q.method} ${q.uri}`),
    [
      'POST https://dev.azure.com/example-org/ExampleProject/_apis/wit/wiql?$top=50&api-version=7.1',
      'POST https://dev.azure.com/example-org/ExampleProject/_apis/wit/workitems/$Bug?api-version=7.1',
    ]
  );
  const ops = JSON.parse(plan.requests[1].json);
  assert.equal(ops.find((o) => o.path === '/fields/System.Title').value, ISSUE_TITLE);
  assert.doesNotMatch(JSON.stringify(r.output) + r.stdout, /Authorization|Basic /);
});

psTest('create-issue: prefers the write variables and validates input before any call', () => {
  const routes = [
    { method: 'POST', uri: '/_apis/wit/wiql\\?', body: { workItems: [] } },
    { method: 'POST', uri: '/_apis/wit/workitems/', body: { id: 1 } },
  ];
  const r = runPs(tempDir(), {
    mocks: webMock(routes),
    env: { ...WRITE_ENV, ADO_PROJECT: 'ReadProject', ADO_PAT: 'generic-fake' },
    body: `& ${psQuote(ISSUE_SCRIPT)} -Title 'Defecto' -Description '<p>x</p>'`,
  });
  assert.equal(r.error, null, `${r.error}\n${r.stderr}`);
  assert.equal(r.calls.length, 2);
  assert.ok(r.calls.every((c) => c.uri.startsWith(`${BASE}/`) && c.auth === basic('write-fake')), JSON.stringify(r.calls));

  const noDesc = runPs(tempDir(), {
    mocks: webMock(routes),
    env: WRITE_ENV,
    body: `& ${psQuote(ISSUE_SCRIPT)} -Title 'Defecto'`,
  });
  assert.match(noDesc.error || '', /-Description/);
  assert.deepEqual(noDesc.calls, []);
});
