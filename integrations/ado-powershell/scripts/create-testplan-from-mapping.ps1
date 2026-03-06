<#
.SYNOPSIS
    Creates Azure DevOps Test Cases from a local tc-mapping.json file.

.DESCRIPTION
    Reads a tc-mapping.json file containing local TC definitions and creates
    corresponding Test Case Work Items in a specified ADO Test Plan/Suite.
    Outputs ado-ids.json with the resulting WI IDs for use by inject-ado-ids.ps1.

.PARAMETER OrgUrl
    Azure DevOps organization URL (e.g. https://dev.azure.com/your-org).

.PARAMETER ProjectName
    ADO project name.

.PARAMETER PlanId
    ADO Test Plan ID.

.PARAMETER SuiteId
    ADO Test Suite ID. If omitted, uses the plan's root suite.

.PARAMETER MappingFile
    Path to tc-mapping.json input file.

.PARAMETER OutputFile
    Path to write ado-ids.json output. Default: ado-ids.json in same dir as MappingFile.

.PARAMETER Token
    ADO Personal Access Token. Prefer passing via $env:AZURE_TOKEN.

.EXAMPLE
    .\create-testplan-from-mapping.ps1 `
        -OrgUrl      "https://dev.azure.com/your-org" `
        -ProjectName "YourProject" `
        -PlanId      22304 `
        -MappingFile "qa/08-azure-integration/tc-mapping.json" `
        -Token       $env:AZURE_TOKEN
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)] [string] $OrgUrl,
    [Parameter(Mandatory)] [string] $ProjectName,
    [Parameter(Mandatory)] [int]    $PlanId,
    [int]                           $SuiteId = 0,
    [Parameter(Mandatory)] [string] $MappingFile,
    [string]                        $OutputFile = '',
    [Parameter(Mandatory)] [string] $Token
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Build auth header
$b64   = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes(":$Token"))
$headers = @{
    'Authorization' = "Basic $b64"
    'Content-Type'  = 'application/json'
}

# Load mapping
if (-not (Test-Path $MappingFile)) { Write-Error "Not found: $MappingFile"; exit 1 }
$mapping = Get-Content $MappingFile -Raw | ConvertFrom-Json

$apiBase = "$OrgUrl/$ProjectName/_apis"
$suiteId = if ($SuiteId -gt 0) { $SuiteId } else { $mapping.suiteId }

Write-Host "[create-testplan] Creating $($mapping.testCases.Count) test cases in Plan $PlanId / Suite $suiteId"

$results = @()

foreach ($tc in $mapping.testCases) {
    $body = @{
        op    = 'add'
        path  = '/fields/System.Title'
        value = "[$($tc.localId)] $($tc.title)"
    } | ConvertTo-Json -AsArray

    $createUrl = "$apiBase/wit/workitems/`$Test Case?api-version=7.1"

    if ($PSCmdlet.ShouldProcess($tc.localId, "Create ADO Test Case")) {
        try {
            $wi = Invoke-RestMethod `
                -Method  Patch `
                -Uri     $createUrl `
                -Headers ($headers + @{ 'Content-Type' = 'application/json-patch+json' }) `
                -Body    $body

            $wiId = $wi.id
            Write-Host "  [CREATED] $($tc.localId) → WI #$wiId"

            # Add to suite
            $suiteUrl = "$apiBase/testplan/Plans/$PlanId/Suites/$suiteId/TestCase?api-version=7.1"
            $suiteBody = @(@{ workItem = @{ id = $wiId } }) | ConvertTo-Json
            Invoke-RestMethod -Method Post -Uri $suiteUrl -Headers $headers -Body $suiteBody | Out-Null

            $results += [PSCustomObject]@{
                localId  = $tc.localId
                adoWiId  = $wiId
                specFile = $tc.specFile
                title    = $tc.title
            }
        } catch {
            Write-Warning "  [FAILED] $($tc.localId) — $($_.Exception.Message)"
        }
    }
}

# Write output
$outFile = if ($OutputFile) { $OutputFile } else {
    Join-Path (Split-Path $MappingFile) 'ado-ids.json'
}
$results | ConvertTo-Json -Depth 5 | Set-Content $outFile
Write-Host ""
Write-Host "[create-testplan] Done. $($results.Count) WIs created. Output: $outFile"
