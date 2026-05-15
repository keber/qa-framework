<#
.SYNOPSIS
    Creates Azure DevOps Test Cases from a local tc-mapping.json file.

.DESCRIPTION
    Reads a tc-mapping.json file containing local TC definitions and creates
    corresponding Test Case Work Items in a specified ADO Test Plan/Suite.
    Outputs ado-ids.json with the resulting WI IDs for use by inject-ado-ids.ps1.

    Requires an active ADO session. Call:
        . .github/skills/ado-powershell/load.ps1
    before running this script. The session is initialised automatically by
    load.ps1 when ADO_ORG, ADO_PROJECT and ADO_PAT env vars are set.

.PARAMETER PlanId
    ADO Test Plan ID.

.PARAMETER SuiteId
    ADO Test Suite ID. If omitted, uses the suiteId from tc-mapping.json.

.PARAMETER MappingFile
    Path to tc-mapping.json input file.

.PARAMETER OutputFile
    Path to write ado-ids.json output. Default: ado-ids.json in same dir as MappingFile.

.EXAMPLE
    . .github/skills/ado-powershell/load.ps1
    .\create-testplan-from-mapping.ps1 `
        -PlanId      22304 `
        -MappingFile "qa/08-azure-integration/tc-mapping.json"
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)] [int]    $PlanId,
    [int]                           $SuiteId = 0,
    [Parameter(Mandatory)] [string] $MappingFile,
    [string]                        $OutputFile = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Auto-load ADO session if not already active
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

# Load mapping
if (-not (Test-Path $MappingFile)) { Write-Error "Not found: $MappingFile"; exit 1 }
$mapping = Get-Content $MappingFile -Raw | ConvertFrom-Json

$suiteId = if ($SuiteId -gt 0) { $SuiteId } else { $mapping.suiteId }

# Support both 'testCases' (canonical) and 'items' (legacy)
$tcList = if ($mapping.PSObject.Properties['testCases']) { $mapping.testCases } else { $mapping.items }

Write-Host "[create-testplan] Creating $($tcList.Count) test cases in Plan $PlanId / Suite $suiteId"

$results = @()

foreach ($tc in $tcList) {
    $steps          = if ($tc.PSObject.Properties['steps'])          { $tc.steps          } else { @() }
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

        $wi   = New-AdoTestCase @splatArgs
        $wiId = $wi.id
        Write-Host "  [CREATED] $($tc.localId) -> WI #$wiId"

        Add-AdoTestCaseToSuite -PlanId $PlanId -SuiteId $suiteId -TestCaseIds @($wiId) -Confirm:$false

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
