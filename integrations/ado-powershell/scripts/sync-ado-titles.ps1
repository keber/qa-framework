<#
.SYNOPSIS
    Syncs Playwright spec file test titles back to Azure DevOps Work Item titles.

.DESCRIPTION
    After test titles are updated in spec files (e.g., after a spec refactor),
    this script reads ado-ids.json and updates ADO WI titles to match the
    current spec file titles.

.PARAMETER OrgUrl
    Azure DevOps organization URL. Default: $env:ADO_ORG (an organization name
    becomes https://dev.azure.com/<name>; a full URL is used as is).

.PARAMETER ProjectName
    ADO project name. Default: $env:ADO_PROJECT_WRITE, else $env:ADO_PROJECT.

.PARAMETER MappingFile
    Path to ado-ids.json (output of create-testplan-from-mapping.ps1).

.PARAMETER SpecDir
    Root directory of Playwright spec files (.spec.ts). Searched recursively.

.PARAMETER Token
    ADO Personal Access Token. Default: $env:ADO_PAT_WRITE, else $env:ADO_PAT.
    Prefer the environment variables over typing a token on the command line.

.NOTES
    This script writes to ADO, so it follows the read/write split of
    skills/qa-ado-integration/references/credential-policy.md: it prefers
    ADO_PROJECT_WRITE and ADO_PAT_WRITE and falls back to ADO_PROJECT and ADO_PAT.
    Explicit parameters always win. Missing values are reported by variable
    name, never by value.
    Every HTTP call goes through Invoke-AdoRest, which sends request bodies as
    UTF-8 bytes (Windows PowerShell 5.1 would otherwise encode a string body
    with the system codepage and corrupt accented titles). Spec files and the
    mapping are read as UTF-8. Use -WhatIf to preview without calling ADO.
    The only ADO call is a single-item PATCH per work item: no list endpoint,
    so there is no pagination to follow.

.EXAMPLE
    # ADO_ORG, ADO_PROJECT_WRITE and ADO_PAT_WRITE set in this process
    .\sync-ado-titles.ps1 `
        -MappingFile "qa/08-azure-integration/ado-ids.json" `
        -SpecDir     "qa/07-automation/e2e" `
        -WhatIf

.EXAMPLE
    .\sync-ado-titles.ps1 `
        -OrgUrl      "https://dev.azure.com/your-org" `
        -ProjectName "YourProject" `
        -MappingFile "qa/08-azure-integration/ado-ids.json" `
        -SpecDir     "qa/07-automation/e2e" `
        -Token       $env:ADO_PAT_WRITE
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [string]                        $OrgUrl = '',
    [string]                        $ProjectName = '',
    [Parameter(Mandatory)] [string] $MappingFile,
    [Parameter(Mandatory)] [string] $SpecDir,
    [string]                        $Token = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Resolves organization URL, project and PAT for one access direction (READ or WRITE).
# An explicit value wins; then ADO_PROJECT_<Access> / ADO_PAT_<Access>; then the generic
# ADO_PROJECT / ADO_PAT. Missing values are named by variable, never printed by value.
function Resolve-QaAdoConnection {
    param(
        [string] $OrgUrl,
        [string] $Project,
        [string] $Token,
        [Parameter(Mandatory)] [ValidateSet('READ', 'WRITE')] [string] $Access,
        [switch] $AllowMissingToken
    )
    $first = {
        param([string] $Explicit, [string[]] $Names)
        if ($Explicit) { return $Explicit }
        foreach ($name in $Names) {
            $value = [Environment]::GetEnvironmentVariable($name)
            if ($value) { return $value }
        }
        return ''
    }
    $org     = & $first $OrgUrl  @('ADO_ORG')
    $project = & $first $Project @("ADO_PROJECT_$Access", 'ADO_PROJECT')
    $pat     = & $first $Token   @("ADO_PAT_$Access", 'ADO_PAT')

    $missing = @()
    if (-not $org)     { $missing += 'organization (-OrgUrl or ADO_ORG)' }
    if (-not $project) { $missing += "project (-ProjectName, ADO_PROJECT_$Access or ADO_PROJECT)" }
    if (-not $pat -and -not $AllowMissingToken) { $missing += "PAT (-Token, ADO_PAT_$Access or ADO_PAT)" }
    if ($missing.Count -gt 0) {
        throw "Azure DevOps connection incomplete. Missing: $($missing -join '; ')."
    }

    $orgUrl = if ($org -match '^https?://') { $org.TrimEnd('/') } else { "https://dev.azure.com/$org" }
    $headers = @{}
    if ($pat) {
        $headers['Authorization'] = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes(":$pat"))
    }
    return @{ OrgUrl = $orgUrl; Project = $project; Headers = $headers }
}

# Single entry point for every ADO HTTP call (tests replace Invoke-RestMethod).
# A body is always sent as UTF-8 bytes, never as a raw [string].
function Invoke-AdoRest {
    param(
        [Parameter(Mandatory)] [string]    $Method,
        [Parameter(Mandatory)] [string]    $Uri,
        [Parameter(Mandatory)] [hashtable] $Headers,
        [string]                           $Body,
        [string]                           $ContentType = 'application/json'
    )
    $restArgs = @{ Method = $Method; Uri = $Uri; Headers = $Headers }
    if ($PSBoundParameters.ContainsKey('Body')) {
        $restArgs.Body        = [Text.Encoding]::UTF8.GetBytes($Body)
        $restArgs.ContentType = $ContentType
    }
    Invoke-RestMethod @restArgs
}

$connection = Resolve-QaAdoConnection -OrgUrl $OrgUrl -Project $ProjectName -Token $Token -Access WRITE `
                                      -AllowMissingToken:$WhatIfPreference
$headers    = $connection.Headers

$mapping = Get-Content $MappingFile -Raw -Encoding UTF8 | ConvertFrom-Json
$apiBase = "$($connection.OrgUrl)/$([Uri]::EscapeDataString($connection.Project))/_apis"

$synced  = 0
$skipped = 0

foreach ($entry in $mapping) {
    $adoId   = $entry.adoWiId
    $specFile = Get-ChildItem -Path $SpecDir -Recurse -Filter "*.spec.ts" |
                Where-Object { ($_.FullName -replace '\\', '/') -like "*$($entry.specFile -replace '\\', '/')*" } |
                Select-Object -First 1

    if (-not $specFile) {
        Write-Warning "  [NOT FOUND] $($entry.specFile) - skipping WI $adoId"
        $skipped++
        continue
    }

    # Extract title from test() line that contains the adoId prefix
    $content = Get-Content $specFile.FullName -Raw -Encoding UTF8
    $match   = [regex]::Match($content, "test(?:\.skip)?\s*\(\s*['""](\[$adoId\][^'""]+)['""]")

    if (-not $match.Success) {
        Write-Verbose "  [NO MATCH] WI $adoId title not found in $($specFile.Name)"
        $skipped++
        continue
    }

    $newTitle = $match.Groups[1].Value.Trim()
    $patchUrl = "$apiBase/wit/workitems/$($adoId)?api-version=7.1"
    # -InputObject keeps the one-element array as a JSON array on PowerShell 5.1
    # (-AsArray exists only in PowerShell 7).
    $body     = ConvertTo-Json -Depth 5 -InputObject @(
        @{ op = 'replace'; path = '/fields/System.Title'; value = $newTitle }
    )

    if ($PSCmdlet.ShouldProcess("WI #$adoId", "Update title to: $newTitle")) {
        Invoke-AdoRest -Method Patch -Uri $patchUrl -Headers $headers -Body $body -ContentType 'application/json-patch+json' | Out-Null
        Write-Host "  [SYNCED] WI #$adoId -> $newTitle"
        $synced++
    }
}

Write-Host ""
Write-Host "[sync-ado-titles] Done. Synced: $synced | Skipped: $skipped"
