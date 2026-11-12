<#
.SYNOPSIS
    Creates Azure DevOps Test Cases from a local tc-mapping.json file.

.DESCRIPTION
    Reads a tc-mapping.json file containing local TC definitions and creates
    corresponding Test Case Work Items in a specified ADO Test Plan/Suite.
    Outputs ado-ids.json with the resulting WI IDs for use by inject-ado-ids.ps1.

    Requires the @keber/ado-powershell helpers (New-AdoTestCase,
    Add-AdoTestCaseToSuite) and an ADO session. Load them with:
        . .github/skills/ado-powershell/load.ps1
    load.ps1 creates $AdoSession automatically when ADO_ORG, ADO_PROJECT and
    ADO_PAT env vars are set. When the helpers are not loaded, the script looks
    for node_modules/@keber/ado-powershell walking up from the current directory
    (the project root), then from the script's own folder, and dot-sources its
    load.ps1; if none is found it stops with an error that says how to install it.

    The session (Org, Project, ApiV, Headers) is passed EXPLICITLY to every
    helper call. The helpers' own defaults read $script:AdoSession, which is not
    visible to them in every call pattern (for example when load.ps1 was
    dot-sourced inside another script): without the explicit session every
    Test Case fails. Session resolution order:
      1. -Session parameter, used as given.
      2. A visible $AdoSession variable (set by load.ps1 or Initialize-AdoSession).
         This script writes to ADO, so ADO_PROJECT_WRITE and ADO_PAT_WRITE, when
         set, replace its Project and Authorization (credential-policy.md read/write
         split).
      3. The environment: ADO_ORG, ADO_PROJECT_WRITE (else ADO_PROJECT) and
         ADO_PAT_WRITE (else ADO_PAT).
    If none yields Org, Project and Headers (with Authorization), the script
    stops before any ADO call with an error that says what is missing.
    ado-ids.json is written as a UTF-8 JSON array without BOM.

.PARAMETER PlanId
    ADO Test Plan ID.

.PARAMETER SuiteId
    ADO Test Suite ID. If omitted, uses the suiteId from tc-mapping.json.

.PARAMETER MappingFile
    Path to tc-mapping.json input file.

.PARAMETER OutputFile
    Path to write ado-ids.json output. Default: ado-ids.json in same dir as MappingFile.

.PARAMETER Session
    ADO session object or hashtable with Org, Project, Headers and optionally
    ApiV (default 7.1). Usually the $AdoSession returned by Initialize-AdoSession.
    Optional when $AdoSession is visible from this script.

.EXAMPLE
    . .github/skills/ado-powershell/load.ps1
    .\create-testplan-from-mapping.ps1 `
        -PlanId      <PLAN_ID> `
        -MappingFile "qa/08-azure-integration/tc-mapping.json" `
        -Session     $AdoSession
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)] [int]    $PlanId,
    [int]                           $SuiteId = 0,
    [Parameter(Mandatory)] [string] $MappingFile,
    [string]                        $OutputFile = '',
    [object]                        $Session = $null
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Reads one field from a session given as a hashtable or as an object.
function Get-QaSessionValue {
    param([object] $InputSession, [string] $Name)
    if ($null -eq $InputSession) { return $null }
    if ($InputSession -is [System.Collections.IDictionary]) {
        if ($InputSession.Contains($Name)) { return $InputSession[$Name] }
        return $null
    }
    $prop = $InputSession.PSObject.Properties[$Name]
    if ($prop) { return $prop.Value }
    return $null
}

# Returns a normalized session hashtable (Org, Project, ApiV, Headers) or throws
# a clear error naming what is missing. Never calls ADO.
function Resolve-QaAdoSession {
    param([object] $InputSession)
    if ($null -eq $InputSession) {
        throw ("ADO session not found. Pass -Session `$AdoSession (from Initialize-AdoSession), " +
               "dot-source .github/skills/ado-powershell/load.ps1, or set ADO_ORG, " +
               "ADO_PROJECT_WRITE (or ADO_PROJECT) and ADO_PAT_WRITE (or ADO_PAT) " +
               "before running this script.")
    }
    $org     = Get-QaSessionValue $InputSession 'Org'
    $project = Get-QaSessionValue $InputSession 'Project'
    $apiV    = Get-QaSessionValue $InputSession 'ApiV'
    $headers = Get-QaSessionValue $InputSession 'Headers'

    $missing = @()
    if (-not $org)     { $missing += 'Org' }
    if (-not $project) { $missing += 'Project' }
    if (-not ($headers -is [System.Collections.IDictionary]) -or -not $headers['Authorization']) {
        $missing += 'Headers.Authorization'
    }
    if ($missing.Count -gt 0) {
        throw ("ADO session is incomplete (missing: $($missing -join ', ')). " +
               "Pass -Session with Org, Project and Headers (including Authorization), " +
               "for example the `$AdoSession returned by Initialize-AdoSession.")
    }
    if (-not $apiV) { $apiV = '7.1' }

    # Headers must be a [hashtable] for the helpers' typed parameter.
    $headerTable = @{}
    foreach ($key in $headers.Keys) { $headerTable[$key] = $headers[$key] }

    return @{ Org = [string]$org; Project = [string]$project; ApiV = [string]$apiV; Headers = $headerTable }
}

# Keeps only the session arguments the given helper accepts, so an older helper
# version without these parameters still runs (it then uses its own lookup).
function Select-QaSupportedArgs {
    param([string] $CommandName, [hashtable] $SessionArgs)
    $accepted = (Get-Command $CommandName).Parameters
    $selected = @{}
    foreach ($key in $SessionArgs.Keys) {
        if ($accepted.ContainsKey($key)) {
            $selected[$key] = $SessionArgs[$key]
        } else {
            Write-Warning "$CommandName does not accept -$key; it will use its own session lookup for it."
        }
    }
    return $selected
}

# Nearest node_modules/@keber/ado-powershell, walking up from each start directory in
# order. The project root comes first: when this script runs from
# node_modules/@keber/qa-framework/..., a path relative to the script does not reach it.
function Find-QaAdoPowerShellPackage {
    param([string[]] $StartDirs)
    foreach ($start in $StartDirs) {
        if (-not $start) { continue }
        $dir = [System.IO.Path]::GetFullPath($start)
        while ($dir) {
            $candidate = Join-Path $dir 'node_modules/@keber/ado-powershell'
            if (Test-Path -LiteralPath $candidate -PathType Container) { return $candidate }
            $dir = Split-Path -Parent $dir
        }
    }
    return $null
}

# Returns a session hashtable from ADO_ORG and the write variables, or $null.
function Get-QaEnvWriteSession {
    $org     = $env:ADO_ORG
    $project = if ($env:ADO_PROJECT_WRITE) { $env:ADO_PROJECT_WRITE } else { $env:ADO_PROJECT }
    $pat     = if ($env:ADO_PAT_WRITE)     { $env:ADO_PAT_WRITE }     else { $env:ADO_PAT }
    if (-not ($org -or $project -or $pat)) { return $null }
    # The helpers take the organization name; accept a dev.azure.com URL too.
    if ($org) { $org = $org.TrimEnd('/') -replace '^https?://dev\.azure\.com/', '' }
    $headers = @{}
    if ($pat) { $headers['Authorization'] = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes(":$pat")) }
    return @{ Org = $org; Project = $project; ApiV = '7.1'; Headers = $headers }
}

# Applies ADO_PROJECT_WRITE / ADO_PAT_WRITE over a loader session (credential policy).
function Set-QaWriteOverrides {
    param([hashtable] $SessionArgs)
    if ($env:ADO_PROJECT_WRITE) {
        $SessionArgs.Project = $env:ADO_PROJECT_WRITE
        Write-Host "[create-testplan] Project from ADO_PROJECT_WRITE"
    }
    if ($env:ADO_PAT_WRITE) {
        $SessionArgs.Headers['Authorization'] = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes(":$($env:ADO_PAT_WRITE)"))
        Write-Host "[create-testplan] Authorization from ADO_PAT_WRITE"
    }
    return $SessionArgs
}

# Auto-load ADO helpers if not already active
if (-not (Get-Command 'New-AdoTestCase' -ErrorAction SilentlyContinue)) {
    $package = Find-QaAdoPowerShellPackage @((Get-Location).ProviderPath, $PSScriptRoot)
    if (-not $package) {
        throw ("The @keber/ado-powershell helpers are not loaded and node_modules/@keber/ado-powershell " +
               "was not found from $((Get-Location).ProviderPath) upwards. Install it in the project root " +
               "(npm install @keber/ado-powershell) or dot-source its load.ps1 before running this script.")
    }
    $loadScript = Join-Path $package '.github/skills/ado-powershell/load.ps1'
    if (-not (Test-Path -LiteralPath $loadScript)) {
        throw "Found $package but not its load.ps1 ($loadScript). Reinstall @keber/ado-powershell (requires >= 1.3.0)."
    }
    . $loadScript
}

if (-not (Get-Command 'New-AdoTestCase' -ErrorAction SilentlyContinue)) {
    throw "New-AdoTestCase not available after loading ado-powershell. Check the skill version (requires >= 1.3.0)."
}

# Resolve the session: explicit parameter, then a visible $AdoSession (with the write
# overrides), then the environment.
if ($null -ne $Session) {
    $adoSessionArgs = Resolve-QaAdoSession $Session
} else {
    $visible = Get-Variable -Name 'AdoSession' -ValueOnly -ErrorAction SilentlyContinue
    if ($null -ne $visible) {
        $adoSessionArgs = Set-QaWriteOverrides (Resolve-QaAdoSession $visible)
    } else {
        $adoSessionArgs = Resolve-QaAdoSession (Get-QaEnvWriteSession)
    }
}
$createArgs     = Select-QaSupportedArgs 'New-AdoTestCase' $adoSessionArgs
$addArgs        = Select-QaSupportedArgs 'Add-AdoTestCaseToSuite' $adoSessionArgs

# Load mapping
if (-not (Test-Path $MappingFile)) { Write-Error "Not found: $MappingFile"; exit 1 }
$mapping = Get-Content $MappingFile -Raw -Encoding UTF8 | ConvertFrom-Json

$suiteId = if ($SuiteId -gt 0) { $SuiteId } else { $mapping.suiteId }

# Support both 'testCases' (canonical) and 'items' (legacy)
$tcList = @(if ($mapping.PSObject.Properties['testCases']) { $mapping.testCases } else { $mapping.items })

Write-Host "[create-testplan] Creating $($tcList.Count) test cases in Plan $PlanId / Suite $suiteId (Org $($adoSessionArgs.Org) / Project $($adoSessionArgs.Project))"

$results = @()

foreach ($tc in $tcList) {
    $steps          = @(if ($tc.PSObject.Properties['steps']) { $tc.steps } else { @() })
    $expectedResult = if ($tc.PSObject.Properties['expectedResult']) { $tc.expectedResult  } else { ''  }

    try {
        $splatArgs = @{
            Title   = "[$($tc.localId)] $($tc.title)"
            Confirm = $false
        }
        if ($steps.Count -gt 0) {
            $splatArgs.Steps          = $steps
            $splatArgs.ExpectedResult = $expectedResult
        }

        $wi   = New-AdoTestCase @splatArgs @createArgs
        $wiId = $wi.id
        Write-Host "  [CREATED] $($tc.localId) -> WI #$wiId"

        Add-AdoTestCaseToSuite -PlanId $PlanId -SuiteId $suiteId -TestCaseIds @($wiId) -Confirm:$false @addArgs

        $results += [PSCustomObject]@{
            localId  = $tc.localId
            adoWiId  = $wiId
            specFile = $tc.specFile
            title    = $tc.title
        }
    } catch {
        Write-Warning "  [FAILED] $($tc.localId) -- $($_.Exception.Message)"
    }
}

# Write output
$outFile = if ($OutputFile) { $OutputFile } else {
    Join-Path (Split-Path $MappingFile) 'ado-ids.json'
}
# Always a JSON array (one created item would otherwise become a bare object), and
# UTF-8 WITHOUT BOM (Set-Content -Encoding UTF8 writes one on Windows PowerShell 5.1).
# .NET resolves a relative path against the process directory, not the PowerShell location.
$outFile = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($outFile)
$json = ConvertTo-Json -Depth 5 -InputObject @($results)
[System.IO.File]::WriteAllText($outFile, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Host ""
Write-Host "[create-testplan] Done. $($results.Count) WIs created. Output: $outFile"
