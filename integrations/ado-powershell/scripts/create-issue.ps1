<#
.SYNOPSIS
    Creates an Azure DevOps Bug (or Issue) for a QA defect, idempotently.

.DESCRIPTION
    Before creating anything, the script searches the project with WIQL for an item
    that already represents the same defect and, when one exists, returns it instead
    of creating a duplicate:
      - Default key: the exact title, within the same work item type.
      - -DedupKey <key>: a stable key (for example the local defect ID DEF-MOD-001)
        stored as a tag. The search matches that tag whatever the title or type, so
        the title can be reworded later without creating a second item. The key is
        added to the tags of a new item.
    Candidates returned by WIQL are read back and checked exactly (a tag such as
    DEF-MOD-0011 does not match the key DEF-MOD-001). When several items match, the
    lowest ID is returned and the others are reported as a warning.

.PARAMETER Title
    Work item title.

.PARAMETER Description
    HTML description (repro steps for a Bug). Use this or -DescriptionFile.

.PARAMETER DescriptionFile
    Path to a UTF-8 file with the HTML description. Use this or -Description.

.PARAMETER Type
    Work item type. Default: Bug. Use Issue when the process template has no Bug.

.PARAMETER DescriptionField
    Field that receives the description. Default: Microsoft.VSTS.TCM.ReproSteps for a
    Bug, System.Description for any other type.

.PARAMETER DedupKey
    Stable key used instead of the title to find an existing item (see DESCRIPTION).

.PARAMETER Priority
    Microsoft.VSTS.Common.Priority (1-4). Omitted when 0.

.PARAMETER Tags
    Tags of a new item.

.PARAMETER AreaPath
    System.AreaPath of a new item. Omitted when empty (ADO uses the project default).

.PARAMETER IterationPath
    System.IterationPath of a new item. Omitted when empty.

.PARAMETER TestedBy
    Test case IDs linked with Tested By.

.PARAMETER Related
    Work item IDs linked as Related.

.PARAMETER OrgUrl
    Azure DevOps organization URL. Default: $env:ADO_ORG (an organization name
    becomes https://dev.azure.com/<name>; a full URL is used as is).

.PARAMETER ProjectName
    ADO project name. Default: $env:ADO_PROJECT_WRITE, else $env:ADO_PROJECT.

.PARAMETER Token
    ADO Personal Access Token. Default: $env:ADO_PAT_WRITE, else $env:ADO_PAT.

.PARAMETER DryRun
    Prints and returns the search request and the create request without sending
    either. Needs no PAT. A dry run cannot tell whether the item already exists.

.NOTES
    Every request goes through Invoke-AdoRest: the body is sent as UTF-8 bytes and the
    response is decoded as UTF-8, so accented titles survive Windows PowerShell 5.1.
    The Authorization header is never printed. This script writes to ADO, so it
    prefers ADO_PROJECT_WRITE / ADO_PAT_WRITE (see
    skills/qa-ado-integration/references/credential-policy.md); the duplicate search
    runs in the same project the item would be created in.
    Two runs started at the same moment for the same defect can both create an item:
    the search and the create are separate requests.

.EXAMPLE
    .\create-issue.ps1 -Title "[DEF-MOD-001] Search by year returns no rows" `
        -DescriptionFile "qa/06-defects/drafts/DEF-MOD-001.html" `
        -DedupKey "DEF-MOD-001" -TestedBy 4242 -Priority 2 -DryRun
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $Title,
    [string]                        $Description = '',
    [string]                        $DescriptionFile = '',
    [string]                        $Type = 'Bug',
    [string]                        $DescriptionField = '',
    [string]                        $DedupKey = '',
    [int]                           $Priority = 0,
    [string[]]                      $Tags = @(),
    [string]                        $AreaPath = '',
    [string]                        $IterationPath = '',
    [int[]]                         $TestedBy = @(),
    [int[]]                         $Related = @(),
    [string]                        $OrgUrl = '',
    [string]                        $ProjectName = '',
    [string]                        $Token = '',
    [switch]                        $DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Reads a text file as UTF-8 and drops a leading BOM. On PowerShell 7 (.NET), ReadAllText
# with an explicit encoding can return the BOM as U+FEFF.
function Read-Utf8Text([string]$Path) {
    $text = [System.IO.File]::ReadAllText($Path, (New-Object System.Text.UTF8Encoding($false)))
    if ($text.Length -gt 0 -and $text[0] -eq [char]0xFEFF) { $text = $text.Substring(1) }
    return $text
}

# Single entry point for every ADO HTTP call (tests replace the cmdlet it uses).
# The body is always sent as UTF-8 bytes, never as a raw [string]; the response is
# decoded from its bytes as UTF-8. Returns the parsed JSON and the continuation token.
function Invoke-AdoRest {
    param(
        [Parameter(Mandatory)] [string]    $Method,
        [Parameter(Mandatory)] [string]    $Uri,
        [Parameter(Mandatory)] [hashtable] $Headers,
        [string]                           $Body,
        [string]                           $ContentType = 'application/json'
    )
    $request = @{ Method = $Method; Uri = $Uri; Headers = $Headers; UseBasicParsing = $true }
    if ($PSBoundParameters.ContainsKey('Body')) {
        $request.Body        = [Text.Encoding]::UTF8.GetBytes($Body)
        $request.ContentType = $ContentType
    }
    try {
        $response = Invoke-WebRequest @request
    } catch {
        $detail = if ($_.ErrorDetails -and $_.ErrorDetails.Message) { " $($_.ErrorDetails.Message)" } else { '' }
        throw "ADO request failed: $Method $Uri - $($_.Exception.Message)$detail"
    }
    $text  = [Text.Encoding]::UTF8.GetString($response.RawContentStream.ToArray())
    $token = $null
    foreach ($key in @($response.Headers.Keys)) {
        if ($key -ieq 'x-ms-continuationtoken') { $token = @($response.Headers[$key])[0] }
    }
    $data = if ($text.Trim()) { $text | ConvertFrom-Json } else { $null }
    return [pscustomobject]@{ Data = $data; ContinuationToken = $token }
}

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

# Reads a property of a parsed JSON object or hashtable; $null when absent (StrictMode-safe).
function Get-QaProp {
    param([object] $Object, [string] $Name)
    if ($null -eq $Object) { return $null }
    if ($Object -is [System.Collections.IDictionary]) {
        if ($Object.Contains($Name)) { return $Object[$Name] }
        return $null
    }
    $prop = $Object.PSObject.Properties[$Name]
    if ($prop) { return $prop.Value }
    return $null
}

# WIQL string literal: single quotes are doubled.
function ConvertTo-QaWiqlLiteral {
    param([string] $Value)
    return "'" + ($Value -replace "'", "''") + "'"
}

# --- Input (validated before any request) ----------------------------------------------

if (-not $Title.Trim()) { throw 'Title is empty.' }
if ($Description -and $DescriptionFile) { throw 'Pass -Description or -DescriptionFile, not both.' }
if ($DescriptionFile) {
    $descPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($DescriptionFile)
    if (-not (Test-Path -LiteralPath $descPath)) { throw "Description file not found: $DescriptionFile" }
    $Description = Read-Utf8Text $descPath
}
if (-not $Description.Trim()) { throw 'A description is required: pass -Description or -DescriptionFile.' }
if ($DedupKey -match '[;,]') { throw "DedupKey '$DedupKey' must not contain ';' or ',' (it is stored as a tag)." }
if (-not $DescriptionField) {
    $DescriptionField = if ($Type -ieq 'Bug') { 'Microsoft.VSTS.TCM.ReproSteps' } else { 'System.Description' }
}

$tagList = @($Tags | ForEach-Object { $_ -split ';' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if ($DedupKey -and -not ($tagList | Where-Object { $_ -ieq $DedupKey })) { $tagList += $DedupKey }

$connection = Resolve-QaAdoConnection -OrgUrl $OrgUrl -Project $ProjectName -Token $Token -Access WRITE -AllowMissingToken:$DryRun
$headers    = $connection.Headers
$project    = $connection.Project
$api        = "$($connection.OrgUrl)/$([Uri]::EscapeDataString($project))/_apis"
$editUrl    = "$($connection.OrgUrl)/$([Uri]::EscapeDataString($project))/_workitems/edit"

# --- Requests ------------------------------------------------------------------------

$conditions = @("[System.TeamProject] = $(ConvertTo-QaWiqlLiteral $project)")
if ($DedupKey) {
    # The key identifies the defect whatever its type or current title.
    $conditions += "[System.Tags] CONTAINS $(ConvertTo-QaWiqlLiteral $DedupKey)"
} else {
    $conditions += "[System.WorkItemType] = $(ConvertTo-QaWiqlLiteral $Type)"
    $conditions += "[System.Title] = $(ConvertTo-QaWiqlLiteral $Title)"
}
$wiql     = "SELECT [System.Id] FROM WorkItems WHERE $($conditions -join ' AND ') ORDER BY [System.Id]"
$wiqlUri  = "$api/wit/wiql?`$top=50&api-version=7.1"
$wiqlBody = ConvertTo-Json -InputObject @{ query = $wiql }

$ops = @(
    [ordered]@{ op = 'add'; path = '/fields/System.Title'; value = $Title }
    [ordered]@{ op = 'add'; path = "/fields/$DescriptionField"; value = $Description }
)
if ($Priority -gt 0)    { $ops += [ordered]@{ op = 'add'; path = '/fields/Microsoft.VSTS.Common.Priority'; value = $Priority } }
if ($AreaPath)          { $ops += [ordered]@{ op = 'add'; path = '/fields/System.AreaPath'; value = $AreaPath } }
if ($IterationPath)     { $ops += [ordered]@{ op = 'add'; path = '/fields/System.IterationPath'; value = $IterationPath } }
if ($tagList.Count -gt 0) { $ops += [ordered]@{ op = 'add'; path = '/fields/System.Tags'; value = ($tagList -join '; ') } }
foreach ($id in $TestedBy) {
    $ops += [ordered]@{ op = 'add'; path = '/relations/-'
                        value = [ordered]@{ rel = 'Microsoft.VSTS.Common.TestedBy-Forward'; url = "$($connection.OrgUrl)/_apis/wit/workItems/$id" } }
}
foreach ($id in $Related) {
    $ops += [ordered]@{ op = 'add'; path = '/relations/-'
                        value = [ordered]@{ rel = 'System.LinkTypes.Related'; url = "$($connection.OrgUrl)/_apis/wit/workItems/$id" } }
}
$createUri  = "$api/wit/workitems/`$$([Uri]::EscapeDataString($Type))?api-version=7.1"
$createBody = ConvertTo-Json -Depth 6 -InputObject $ops

if ($DryRun) {
    $requests = @(
        [ordered]@{ method = 'POST'; uri = $wiqlUri;   json = $wiqlBody }
        [ordered]@{ method = 'POST'; uri = $createUri; json = $createBody }
    )
    foreach ($req in $requests) {
        Write-Host "[create-issue] DRY RUN $($req.method) $($req.uri)"
        Write-Host $req.json
    }
    Write-Host '[create-issue] DRY RUN: the create request is sent only when the search finds no matching item.'
    return [pscustomobject]@{ dryRun = $true; requests = $requests }
}

# --- Search for the same defect --------------------------------------------------------

$found = @(@(Get-QaProp (Invoke-AdoRest -Method POST -Uri $wiqlUri -Headers $headers -Body $wiqlBody).Data 'workItems') |
           Where-Object { $null -ne $_ } | ForEach-Object { Get-QaProp $_ 'id' })
if ($found.Count -gt 0) {
    $fields  = 'System.Id,System.Title,System.State,System.Tags,System.WorkItemType'
    $itemsUri = "$api/wit/workitems?ids=$($found -join ',')&fields=$fields&api-version=7.1"
    $items   = @(@(Get-QaProp (Invoke-AdoRest -Method GET -Uri $itemsUri -Headers $headers).Data 'value') | Where-Object { $null -ne $_ })
    $sameDefect = @($items | Where-Object {
        $f = Get-QaProp $_ 'fields'
        if ($DedupKey) {
            @(([string](Get-QaProp $f 'System.Tags')) -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ieq $DedupKey }).Count -gt 0
        } else {
            [string](Get-QaProp $f 'System.Title') -ieq $Title
        }
    } | Sort-Object { [int](Get-QaProp $_ 'id') })
    if ($sameDefect.Count -gt 0) {
        $existing = $sameDefect[0]
        $f        = Get-QaProp $existing 'fields'
        $id       = Get-QaProp $existing 'id'
        if ($sameDefect.Count -gt 1) {
            $others = ($sameDefect | Select-Object -Skip 1 | ForEach-Object { "#$(Get-QaProp $_ 'id')" }) -join ', '
            Write-Warning "Other items match the same defect too: $others"
        }
        Write-Host "[create-issue] EXISTS #$id ($(Get-QaProp $f 'System.State')) - nothing created"
        return [pscustomobject]@{
            id      = $id
            created = $false
            title   = Get-QaProp $f 'System.Title'
            state   = Get-QaProp $f 'System.State'
            type    = Get-QaProp $f 'System.WorkItemType'
            url     = "$editUrl/$id"
        }
    }
}

# --- Create -----------------------------------------------------------------------------

$wi = (Invoke-AdoRest -Method POST -Uri $createUri -Headers $headers -Body $createBody -ContentType 'application/json-patch+json').Data
$id = Get-QaProp $wi 'id'
Write-Host "[create-issue] CREATED #$id ($Type)"
[pscustomobject]@{
    id      = $id
    created = $true
    title   = $Title
    state   = Get-QaProp (Get-QaProp $wi 'fields') 'System.State'
    type    = $Type
    url     = "$editUrl/$id"
}
