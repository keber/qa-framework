<#
.SYNOPSIS
    Syncs Playwright spec file test titles back to Azure DevOps Work Item titles.

.DESCRIPTION
    After test titles are updated in spec files (e.g., after a spec refactor),
    this script reads ado-ids.json and updates ADO WI titles to match the
    current spec file titles.

.PARAMETER OrgUrl
    Azure DevOps organization URL.

.PARAMETER ProjectName
    ADO project name.

.PARAMETER MappingFile
    Path to ado-ids.json (output of create-testplan-from-mapping.ps1).

.PARAMETER SpecDir
    Root directory of Playwright spec files (.spec.ts). Searched recursively.

.PARAMETER Token
    ADO Personal Access Token. Prefer $env:AZURE_TOKEN.

.EXAMPLE
    .\sync-ado-titles.ps1 `
        -OrgUrl      "https://dev.azure.com/your-org" `
        -ProjectName "YourProject" `
        -MappingFile "qa/08-azure-integration/ado-ids.json" `
        -SpecDir     "qa/07-automation/e2e" `
        -Token       $env:AZURE_TOKEN
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)] [string] $OrgUrl,
    [Parameter(Mandatory)] [string] $ProjectName,
    [Parameter(Mandatory)] [string] $MappingFile,
    [Parameter(Mandatory)] [string] $SpecDir,
    [Parameter(Mandatory)] [string] $Token
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$b64     = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes(":$Token"))
$headers = @{
    'Authorization' = "Basic $b64"
    'Content-Type'  = 'application/json-patch+json'
}

$mapping = Get-Content $MappingFile -Raw | ConvertFrom-Json
$apiBase = "$OrgUrl/$ProjectName/_apis"

$synced  = 0
$skipped = 0

foreach ($entry in $mapping) {
    $adoId   = $entry.adoWiId
    $specFile = Get-ChildItem -Path $SpecDir -Recurse -Filter "*.spec.ts" |
                Where-Object { $_.FullName -like "*$($entry.specFile)*" } |
                Select-Object -First 1

    if (-not $specFile) {
        Write-Warning "  [NOT FOUND] $($entry.specFile) — skipping WI $adoId"
        $skipped++
        continue
    }

    # Extract title from test() line that contains the adoId prefix
    $content = Get-Content $specFile.FullName -Raw
    $match   = [regex]::Match($content, "test(?:\.skip)?\s*\(\s*['""](\[$adoId\][^'""]+)['""]")

    if (-not $match.Success) {
        Write-Verbose "  [NO MATCH] WI $adoId title not found in $($specFile.Name)"
        $skipped++
        continue
    }

    $newTitle = $match.Groups[1].Value.Trim()
    $patchUrl = "$apiBase/wit/workitems/$($adoId)?api-version=7.1"
    $body     = @(
        @{ op = 'replace'; path = '/fields/System.Title'; value = $newTitle }
    ) | ConvertTo-Json -AsArray

    if ($PSCmdlet.ShouldProcess("WI #$adoId", "Update title to: $newTitle")) {
        Invoke-RestMethod -Method Patch -Uri $patchUrl -Headers $headers -Body $body | Out-Null
        Write-Host "  [SYNCED] WI #$adoId → $newTitle"
        $synced++
    }
}

Write-Host ""
Write-Host "[sync-ado-titles] Done. Synced: $synced | Skipped: $skipped"
