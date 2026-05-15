<#
.SYNOPSIS
  Generates a tc-mapping.json from a Plan-de-Pruebas markdown file.

.DESCRIPTION
  Reads the "Tabla de Pruebas" table in a Plan-de-Pruebas markdown file,
  skips rows with Tipo = "Bloqueado" (PENDING-CODE), splits Steps by <br>,
  and outputs a tc-mapping.json compatible with create-testplan-from-mapping.ps1.

  Paths are resolved relative to the current working directory (project root).
  Always run this script from the project root.

.PARAMETER PlanFile
  Path to the Plan-de-Pruebas-*.md file to parse (relative to project root or absolute).

.PARAMETER SpecFile
  Relative path to the Playwright spec file (e.g. "reg/apl.spec.ts").
  Stored as metadata in the output; not validated by this script.

.PARAMETER OutputFile
  Path to write the tc-mapping.json output (relative to project root or absolute).

.PARAMETER PlanId
  ADO Test Plan ID to embed in the JSON. Fill in after creating the plan (default: 0).

.PARAMETER SuiteId
  ADO Test Suite ID to embed in the JSON. Fill in after creating the suite (default: 0).

.PARAMETER TableSection
  Heading text of the table section to parse. Defaults to "Tabla de Pruebas".
  Use the exact heading text if your plan uses a different section name
  (e.g. "6. Casos de prueba").

.EXAMPLE
  .\integrations\ado-powershell\scripts\md-to-tc-mapping.ps1 `
    -PlanFile   "qa/02-test-plans/sprints/Sprint-2/Plan-de-Pruebas-MyProject-Sprint-2-REG-APL.md" `
    -SpecFile   "reg/apl.spec.ts" `
    -OutputFile "qa/08-azure-integration/tc-mapping-e2e-reg-apl.json"

.EXAMPLE
  # For plans where the table is under a different heading:
  .\integrations\ado-powershell\scripts\md-to-tc-mapping.ps1 `
    -PlanFile      "qa/02-test-plans/sprints/Sprint-10/Plan-de-Pruebas-MyProject-Sprint-10-MOD-API-Neg.md" `
    -SpecFile      "mod.api.negative.spec.ts" `
    -OutputFile    "qa/08-azure-integration/tc-mapping-api-mod-neg.json" `
    -TableSection  "6. Casos de prueba"
#>
param(
    [Parameter(Mandatory)][string]$PlanFile,
    [Parameter(Mandatory)][string]$SpecFile,
    [Parameter(Mandatory)][string]$OutputFile,
    [int]$PlanId        = 0,
    [int]$SuiteId       = 0,
    [string]$TableSection = 'Tabla de Pruebas'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Trim-Cell([string]$cell) { return $cell.Trim() }

# Resolve paths relative to current working directory (project root)
$WorkspaceRoot = (Get-Location).Path
if (-not [System.IO.Path]::IsPathRooted($PlanFile)) {
    $PlanFile = Join-Path $WorkspaceRoot $PlanFile
}
if (-not [System.IO.Path]::IsPathRooted($OutputFile)) {
    $OutputFile = Join-Path $WorkspaceRoot $OutputFile
}

if (-not (Test-Path $PlanFile)) {
    throw "Plan file not found: $PlanFile"
}

$lines = Get-Content $PlanFile -Encoding UTF8

# Find the table section (configurable heading)
$tableStart = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "##\s+$([regex]::Escape($TableSection))") {
        $tableStart = $i + 1
        break
    }
}
if ($tableStart -lt 0) {
    throw "Section '## $TableSection' not found in: $PlanFile"
}

# Find the header row (first line starting with |)
$headerIdx = -1
for ($i = $tableStart; $i -lt $lines.Count; $i++) {
    if ($lines[$i].TrimStart().StartsWith('|')) {
        $headerIdx = $i
        break
    }
}
if ($headerIdx -lt 0) {
    throw "Table header row not found after '## $TableSection'"
}

# Parse header to find column indices dynamically
$headerCells = $lines[$headerIdx] -split '\|' | Where-Object { $_ -ne '' }
$colMap = @{}
for ($c = 0; $c -lt $headerCells.Count; $c++) {
    $name = (Trim-Cell $headerCells[$c]).ToLower()
    $colMap[$name] = $c
}

# Determine column indices (handle both E2E and API table formats)
$idxTcId   = if ($colMap.ContainsKey('tc-id'))              { $colMap['tc-id'] }              else { 1 }
$idxTitulo = if ($colMap.ContainsKey('titulo'))              { $colMap['titulo'] }             else { 3 }
$idxSteps  = if ($colMap.ContainsKey('steps'))               { $colMap['steps'] }              `
             elseif ($colMap.ContainsKey('pasos'))            { $colMap['pasos'] }              else { 5 }
$idxResult = if ($colMap.ContainsKey('resultado esperado'))  { $colMap['resultado esperado'] } else { 6 }
$idxTipo   = if ($colMap.ContainsKey('tipo'))                { $colMap['tipo'] }               else { -1 }

# Data rows start after header + separator
$dataStart = $headerIdx + 2

$tcList = [System.Collections.Generic.List[hashtable]]::new()

for ($i = $dataStart; $i -lt $lines.Count; $i++) {
    $line = $lines[$i].TrimStart()

    # Stop at blank line or next section heading
    if ($line -eq '' -or $line.StartsWith('#')) { break }
    if (-not $line.StartsWith('|')) { continue }

    # Split row into cells, strip leading empty element
    $cells = $lines[$i] -split '\|'
    if ($cells[0] -eq '' -or $cells[0] -match '^\s*$') {
        $cells = $cells[1..($cells.Count - 1)]
    }
    if ($cells.Count -lt 3) { continue }

    function Get-Cell([string[]]$arr, [int]$idx) {
        if ($idx -ge 0 -and $idx -lt $arr.Count) { return (Trim-Cell $arr[$idx]) }
        return ''
    }

    $tipo   = Get-Cell $cells $idxTipo
    $tcId   = Get-Cell $cells $idxTcId
    $titulo = Get-Cell $cells $idxTitulo
    $steps  = Get-Cell $cells $idxSteps
    $result = Get-Cell $cells $idxResult

    # Skip sub-header rows or empty rows
    if ($tcId -eq '' -or $tcId -eq 'TC-ID') { continue }

    # Skip blocked TCs (PENDING-CODE)
    if ($tipo -ieq 'Bloqueado') {
        Write-Host "  [skip] $tcId - Bloqueado (PENDING-CODE)" -ForegroundColor DarkYellow
        continue
    }

    # Fallback: use Descripcion column as title if Titulo is absent
    if ($titulo -eq '' -or $titulo -eq 'N/A') {
        $idxDesc = if ($colMap.ContainsKey('descripcion')) { $colMap['descripcion'] } else { 1 }
        $titulo  = Get-Cell $cells $idxDesc
    }

    # Parse steps: split on <br>, strip leading numbering (e.g. "1. ", "2) ")
    $stepList = @()
    if ($steps -ne '' -and $steps -ne 'N/A') {
        $rawSteps = $steps -split '(?i)<br\s*/?>'
        foreach ($s in $rawSteps) {
            $cleaned = $s.Trim() -replace '^\d+[\.\)]\s*', ''
            if ($cleaned -ne '') { $stepList += $cleaned }
        }
    }

    $tcList.Add(@{
        localId        = $tcId
        title          = $titulo
        specFile       = $SpecFile
        steps          = $stepList
        expectedResult = $result
    })
}

$output = @{
    planId    = $PlanId
    suiteId   = $SuiteId
    testCases = @($tcList)
}

# Ensure output directory exists
$outputDir = Split-Path $OutputFile
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

$json = $output | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($OutputFile, $json, [System.Text.Encoding]::UTF8)

Write-Host "(ok) Generated $($tcList.Count) TC mappings -> $OutputFile" -ForegroundColor Green
