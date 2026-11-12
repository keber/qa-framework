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
    ADO_PAT env vars are set.

    The session (Org, Project, ApiV, Headers) is passed EXPLICITLY to every
    helper call. The helpers' own defaults read $script:AdoSession, which is not
    visible to them in every call pattern (for example when load.ps1 was
    dot-sourced inside another script): without the explicit session every
    Test Case fails. Session resolution order:
      1. -Session parameter.
      2. A visible $AdoSession variable (set by load.ps1 or Initialize-AdoSession).
    If neither yields Org, Project and Headers (with Authorization), the script
    stops before any ADO call with an error that says what is missing.

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
               "or dot-source .github/skills/ado-powershell/load.ps1 with ADO_ORG, ADO_PROJECT " +
               "and ADO_PAT set before running this script.")
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

# Auto-load ADO helpers if not already active
if (-not (Get-Command 'New-AdoTestCase' -ErrorAction SilentlyContinue)) {
    $loadScript = Join-Path $PSScriptRoot '..\..\..\node_modules\@keber\ado-powershell\.github\skills\ado-powershell\load.ps1'
    if (Test-Path $loadScript) {
        . $loadScript
    } else {
        Write-Error "ADO session not loaded and load.ps1 not found. Run: . node_modules\@keber\ado-powershell\.github\skills\ado-powershell\load.ps1"
        exit 1
    }
}

if (-not (Get-Command 'New-AdoTestCase' -ErrorAction SilentlyContinue)) {
    Write-Error "New-AdoTestCase not available after loading ado-powershell. Check the skill version (requires >= 1.3.0)."
    exit 1
}

# Resolve the session: explicit parameter first, then a visible $AdoSession.
if ($null -eq $Session) {
    $Session = Get-Variable -Name 'AdoSession' -ValueOnly -ErrorAction SilentlyContinue
}
$adoSessionArgs = Resolve-QaAdoSession $Session
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
$results | ConvertTo-Json -Depth 5 | Set-Content $outFile -Encoding UTF8
Write-Host ""
Write-Host "[create-testplan] Done. $($results.Count) WIs created. Output: $outFile"
