<#
.SYNOPSIS
    Publishes manual test results to Azure DevOps as a test run bound to test points.

.DESCRIPTION
    Reads a results file (outcome and comment per test case) and publishes it the way
    the ADO Test Runner does, so the outcomes show in the test plan:
      1. Reads the test points of the suite (following the continuation token).
      2. Creates a manual test run for the plan, bound to the selected points.
      3. Records the outcome and comment of each result.
      4. Closes the run (state Completed).

    Everything is validated before the first write: outcomes, the plan and suite IDs,
    and that every test case has exactly one point in the suite. Points that already
    have an outcome stop the script before it creates a run (re-run with -Force to
    publish a new run anyway).

    Results file (UTF-8 JSON):
        {
          "planId": 101,
          "suiteId": 202,
          "runName": "Manual run - module - build 1.2.3",
          "comment": "Optional run comment",
          "results": [
            { "testCaseId": 4242, "outcome": "Passed", "comment": "Optional" },
            { "adoWiId": 4243, "outcome": "Failed" },
            { "pointId": 9003, "outcome": "Blocked" }
          ]
        }
    "adoWiId" is accepted as a synonym of "testCaseId" (the key of ado-ids.json).
    Give "pointId" when a test case has more than one point in the suite (one per
    configuration). Outcomes: Passed, Failed, Blocked, NotApplicable, Paused, NotExecuted.

.PARAMETER ResultsFile
    Path to the results file.

.PARAMETER PlanId
    ADO Test Plan ID. Overrides planId of the results file.

.PARAMETER SuiteId
    ADO Test Suite ID. Overrides suiteId of the results file.

.PARAMETER RunName
    Name of the test run. Overrides runName of the results file. Default:
    "Manual results - plan <PlanId> / suite <SuiteId> - <date time>".

.PARAMETER OrgUrl
    Azure DevOps organization URL. Default: $env:ADO_ORG (an organization name
    becomes https://dev.azure.com/<name>; a full URL is used as is).

.PARAMETER ProjectName
    ADO project name. Default: $env:ADO_PROJECT_WRITE, else $env:ADO_PROJECT.

.PARAMETER Token
    ADO Personal Access Token. Default: $env:ADO_PAT_WRITE, else $env:ADO_PAT.

.PARAMETER Force
    Publish even when some selected points already have an outcome.

.PARAMETER DryRun
    Prints and returns every request (method, URL, JSON body) without sending any.
    Needs no PAT. IDs that only ADO can return appear as {placeholders}.

.NOTES
    Every request goes through Invoke-AdoRest: the body is sent as UTF-8 bytes and the
    response is decoded as UTF-8, so accented comments survive Windows PowerShell 5.1.
    The Authorization header is never printed. This script writes to ADO, so it
    prefers ADO_PROJECT_WRITE / ADO_PAT_WRITE (see
    skills/qa-ado-integration/references/credential-policy.md).
    Evidence attachments are not uploaded; attach them in ADO if needed.

.EXAMPLE
    .\publish-results.ps1 -ResultsFile "qa/08-azure-integration/results-sprint-3.json" -DryRun

.EXAMPLE
    .\publish-results.ps1 -ResultsFile "qa/08-azure-integration/results-sprint-3.json"
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string] $ResultsFile,
    [int]                           $PlanId = 0,
    [int]                           $SuiteId = 0,
    [string]                        $RunName = '',
    [string]                        $OrgUrl = '',
    [string]                        $ProjectName = '',
    [string]                        $Token = '',
    [switch]                        $Force,
    [switch]                        $DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ValidOutcomes = @('Passed', 'Failed', 'Blocked', 'NotApplicable', 'Paused', 'NotExecuted')
$MaxCommentLength = 1000
$ResultsPageSize = 1000

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

# --- Input -------------------------------------------------------------------------

$resultsPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ResultsFile)
if (-not (Test-Path -LiteralPath $resultsPath)) { throw "Results file not found: $ResultsFile" }
$resultsData = [System.IO.File]::ReadAllText($resultsPath, (New-Object System.Text.UTF8Encoding($false))) | ConvertFrom-Json

if ($PlanId -le 0)  { $PlanId  = [int](Get-QaProp $resultsData 'planId') }
if ($SuiteId -le 0) { $SuiteId = [int](Get-QaProp $resultsData 'suiteId') }
if ($PlanId -le 0 -or $SuiteId -le 0) {
    throw 'Plan and suite IDs are required: pass -PlanId and -SuiteId or set planId and suiteId in the results file.'
}
if (-not $RunName) { $RunName = [string](Get-QaProp $resultsData 'runName') }
if (-not $RunName) { $RunName = "Manual results - plan $PlanId / suite $SuiteId - $(Get-Date -Format 'yyyy-MM-dd HH:mm')" }
$runComment = [string](Get-QaProp $resultsData 'comment')

$rows = @(@(Get-QaProp $resultsData 'results') | Where-Object { $null -ne $_ })
if ($rows.Count -eq 0) { throw "No results in $ResultsFile (expected a non-empty 'results' array)." }

$entries = @()
$problems = @()
for ($i = 0; $i -lt $rows.Count; $i++) {
    $row        = $rows[$i]
    $testCaseId = Get-QaProp $row 'testCaseId'
    if ($null -eq $testCaseId) { $testCaseId = Get-QaProp $row 'adoWiId' }
    $pointId    = Get-QaProp $row 'pointId'
    $label      = if ($null -ne $pointId) { "point $pointId" } else { "test case $testCaseId" }

    if ($null -eq $testCaseId -and $null -eq $pointId) {
        $problems += "results[$i]: needs testCaseId (or adoWiId) or pointId"
        continue
    }
    $rawOutcome = [string](Get-QaProp $row 'outcome')
    $outcome    = $ValidOutcomes | Where-Object { $_ -ieq $rawOutcome } | Select-Object -First 1
    if (-not $outcome) {
        $problems += "results[$i] ($label): invalid outcome '$rawOutcome' (valid: $($ValidOutcomes -join ', '))"
        continue
    }
    $comment = [string](Get-QaProp $row 'comment')
    if ($comment.Length -gt $MaxCommentLength) {
        Write-Warning "results[$i] ($label): comment truncated to $MaxCommentLength characters."
        $comment = $comment.Substring(0, $MaxCommentLength - 3) + '...'
    }
    $entries += [pscustomobject]@{
        Label      = $label
        TestCaseId = if ($null -ne $testCaseId) { [string]$testCaseId } else { $null }
        PointId    = if ($null -ne $pointId) { [string]$pointId } else { $null }
        Outcome    = $outcome
        Comment    = $comment
    }
}
if ($problems.Count -gt 0) {
    throw "Invalid results file, nothing was sent:`n  $($problems -join "`n  ")"
}

$connection = Resolve-QaAdoConnection -OrgUrl $OrgUrl -Project $ProjectName -Token $Token -Access WRITE -AllowMissingToken:$DryRun
$headers    = $connection.Headers
$api        = "$($connection.OrgUrl)/$([Uri]::EscapeDataString($connection.Project))/_apis"
$pointsUri  = "$api/testplan/Plans/$PlanId/Suites/$SuiteId/TestPoint?api-version=7.1"

# Builds the result updates for the run; $ResultIdFor maps an entry to its result id.
function New-QaResultUpdates {
    param([object[]] $Items, [scriptblock] $ResultIdFor)
    $updates = @()
    foreach ($item in $Items) {
        $update = [ordered]@{ id = (& $ResultIdFor $item); outcome = $item.Outcome; state = 'Completed' }
        if ($item.Comment) { $update.comment = $item.Comment }
        $updates += $update
    }
    return ,$updates
}

function New-QaRunBody {
    param([object[]] $PointIds)
    $body = [ordered]@{ name = $RunName; plan = @{ id = [string]$PlanId }; pointIds = $PointIds; isAutomated = $false }
    if ($runComment) { $body.comment = $runComment }
    return ConvertTo-Json -Depth 6 -InputObject $body
}

# --- Dry run: print and return the requests, send nothing ---------------------------

if ($DryRun) {
    $pointIds = @($entries | ForEach-Object {
        if ($_.PointId) { [int]$_.PointId } else { "{pointId of test case $($_.TestCaseId)}" }
    })
    $updates = New-QaResultUpdates $entries {
        param($item)
        if ($item.PointId) { "{resultId of point $($item.PointId)}" } else { "{resultId of test case $($item.TestCaseId)}" }
    }
    $requests = @(
        [ordered]@{ method = 'GET';   uri = $pointsUri; json = $null }
        [ordered]@{ method = 'POST';  uri = "$api/test/runs?api-version=7.1"; json = (New-QaRunBody $pointIds) }
        [ordered]@{ method = 'GET';   uri = "$api/test/Runs/{runId}/results?`$top=$ResultsPageSize&`$skip=0&api-version=7.1"; json = $null }
        [ordered]@{ method = 'PATCH'; uri = "$api/test/Runs/{runId}/results?api-version=7.1"; json = (ConvertTo-Json -Depth 6 -InputObject $updates) }
        [ordered]@{ method = 'PATCH'; uri = "$api/test/runs/{runId}?api-version=7.1"; json = (ConvertTo-Json -InputObject @{ state = 'Completed' }) }
    )
    foreach ($req in $requests) {
        Write-Host "[publish-results] DRY RUN $($req.method) $($req.uri)"
        if ($req.json) { Write-Host $req.json }
    }
    return [pscustomobject]@{ dryRun = $true; planId = $PlanId; suiteId = $SuiteId; requests = $requests }
}

# --- Test points of the suite (all pages) ---------------------------------------------

$points = @()
$continuation = $null
$seenTokens = @{}
do {
    $uri = $pointsUri
    if ($continuation) { $uri += "&continuationToken=$([Uri]::EscapeDataString($continuation))" }
    $page = Invoke-AdoRest -Method GET -Uri $uri -Headers $headers
    $points += @(@(Get-QaProp $page.Data 'value') | Where-Object { $null -ne $_ })
    $continuation = $page.ContinuationToken
    if ($continuation) {
        if ($seenTokens.ContainsKey($continuation)) { throw "ADO repeated continuation token '$continuation' while listing test points." }
        $seenTokens[$continuation] = $true
    }
} while ($continuation)

$pointsById = @{}
$pointsByTestCase = @{}
foreach ($p in $points) {
    $id = [string](Get-QaProp $p 'id')
    $tc = [string](Get-QaProp (Get-QaProp $p 'testCaseReference') 'id')
    $pointsById[$id] = $p
    if (-not $pointsByTestCase.ContainsKey($tc)) { $pointsByTestCase[$tc] = @() }
    $pointsByTestCase[$tc] += $p
}

$problems = @()
$usedPoints = @{}
foreach ($entry in $entries) {
    if ($entry.PointId) {
        if (-not $pointsById.ContainsKey($entry.PointId)) {
            $problems += "$($entry.Label): no such point in plan $PlanId / suite $SuiteId"
            continue
        }
    } else {
        $candidates = @(if ($pointsByTestCase.ContainsKey($entry.TestCaseId)) { $pointsByTestCase[$entry.TestCaseId] })
        if ($candidates.Count -eq 0) {
            $problems += "$($entry.Label): no test point in plan $PlanId / suite $SuiteId"
            continue
        }
        if ($candidates.Count -gt 1) {
            $ids = ($candidates | ForEach-Object { [string](Get-QaProp $_ 'id') }) -join ', '
            $problems += "$($entry.Label): $($candidates.Count) points ($ids); give pointId"
            continue
        }
        $entry.PointId = [string](Get-QaProp $candidates[0] 'id')
    }
    if ($usedPoints.ContainsKey($entry.PointId)) {
        $problems += "$($entry.Label): point $($entry.PointId) appears more than once"
        continue
    }
    $usedPoints[$entry.PointId] = $true
}
if ($problems.Count -gt 0) {
    throw "Results do not match the suite, nothing was written:`n  $($problems -join "`n  ")"
}

# Idempotency guard: a point with an outcome was published before (or run in ADO).
$alreadyRun = @()
foreach ($entry in $entries) {
    $previous = [string](Get-QaProp (Get-QaProp $pointsById[$entry.PointId] 'results') 'outcome')
    if ($previous -and $previous -notin @('unspecified', 'none')) {
        $alreadyRun += "$($entry.Label) (point $($entry.PointId)): $previous"
    }
}
if ($alreadyRun.Count -gt 0 -and -not $Force) {
    throw ("Test points already have an outcome, nothing was written: $($alreadyRun -join '; '). " +
           "Re-run with -Force to publish a new run anyway.")
}

# --- Run: create, record outcomes, close ----------------------------------------------

$pointIds = @($entries | ForEach-Object { [int]$_.PointId })
$run   = (Invoke-AdoRest -Method POST -Uri "$api/test/runs?api-version=7.1" -Headers $headers -Body (New-QaRunBody $pointIds)).Data
$runId = Get-QaProp $run 'id'
if (-not $runId) { throw 'ADO did not return a run id; nothing else was sent.' }

try {
    $runResults = @()
    $skip = 0
    do {
        $uri  = "$api/test/Runs/$runId/results?`$top=$ResultsPageSize&`$skip=$skip&api-version=7.1"
        $page = @(@(Get-QaProp (Invoke-AdoRest -Method GET -Uri $uri -Headers $headers).Data 'value') | Where-Object { $null -ne $_ })
        $runResults += $page
        $skip += $ResultsPageSize
    } while ($page.Count -eq $ResultsPageSize)

    $resultByPoint = @{}
    foreach ($res in $runResults) {
        $resultByPoint[[string](Get-QaProp (Get-QaProp $res 'testPoint') 'id')] = Get-QaProp $res 'id'
    }
    $missingResults = @($entries | Where-Object { -not $resultByPoint.ContainsKey($_.PointId) } | ForEach-Object { $_.Label })
    if ($missingResults.Count -gt 0) { throw "the run has no result for: $($missingResults -join ', ')" }

    $updates = New-QaResultUpdates $entries { param($item) $resultByPoint[$item.PointId] }
    Invoke-AdoRest -Method PATCH -Uri "$api/test/Runs/$runId/results?api-version=7.1" -Headers $headers `
                   -Body (ConvertTo-Json -Depth 6 -InputObject $updates) | Out-Null
    Invoke-AdoRest -Method PATCH -Uri "$api/test/runs/$($runId)?api-version=7.1" -Headers $headers `
                   -Body (ConvertTo-Json -InputObject @{ state = 'Completed' }) | Out-Null
} catch {
    throw "Run $runId was created but publishing failed: $($_.Exception.Message) Review or delete run $runId in ADO before retrying."
}

$summary = ($entries | Group-Object Outcome | ForEach-Object { "$($_.Name)=$($_.Count)" }) -join ' '
Write-Host "[publish-results] Run $runId completed: $($entries.Count) results [$summary] in plan $PlanId / suite $SuiteId"
[pscustomobject]@{
    runId     = $runId
    planId    = $PlanId
    suiteId   = $SuiteId
    published = $entries.Count
    outcomes  = $summary
    runUrl    = "$($connection.OrgUrl)/$([Uri]::EscapeDataString($connection.Project))/_testManagement/runs?_a=runCharts&runId=$runId"
}
