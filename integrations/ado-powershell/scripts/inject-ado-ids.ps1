<#
.SYNOPSIS
    Prepends Azure DevOps Work Item IDs to Playwright spec file test titles.

.DESCRIPTION
    Reads one or more ado-ids-*.json files and updates every matching test()
    call in the spec files to include the ADO WI ID as a [NNNNN] prefix.
    This operation is IDEMPOTENT: if the ID is already present, it is skipped.

    Two modes:
      -MappingFile  Process a single ado-ids.json file (backward-compatible).
      -AdonIdsDir   Process all ado-ids-*.json files found in a directory.

.PARAMETER SpecDir
    Root directory containing Playwright spec files (.spec.ts). Searched recursively.

.PARAMETER MappingFile
    Path to a single ado-ids.json file. Mutually exclusive with -AdonIdsDir.

.PARAMETER AdonIdsDir
    Directory containing ado-ids-*.json files. All matching files are processed.
    Mutually exclusive with -MappingFile.

.PARAMETER DryRun
    Shows what would be changed without modifying any files.

.EXAMPLE
    # Single file
    .\inject-ado-ids.ps1 -SpecDir "qa/07-automation/e2e/tests" -MappingFile "qa/08-azure-integration/ado-ids.json"

.EXAMPLE
    # All ado-ids-*.json files in a directory
    .\inject-ado-ids.ps1 -SpecDir "qa/07-automation/e2e/tests" -AdonIdsDir "qa/08-azure-integration"

.NOTES
    Does NOT require a network connection or ADO token.
    Commit the modified spec files after running.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string] $SpecDir,

    [Parameter(ParameterSetName='SingleFile', Mandatory)]
    [string] $MappingFile,

    [Parameter(ParameterSetName='MultiFile', Mandatory)]
    [string] $AdonIdsDir,

    [switch] $DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Collect input files based on mode
$adoIdFiles = if ($PSCmdlet.ParameterSetName -eq 'SingleFile') {
    if (-not (Test-Path $MappingFile)) { Write-Error "Not found: $MappingFile"; exit 1 }
    @(Get-Item $MappingFile)
} else {
    @(Get-ChildItem -Path $AdonIdsDir -Filter 'ado-ids-*.json')
}

Write-Host "[inject-ado-ids] Processing $($adoIdFiles.Count) mapping file(s)"

$totalUpdated = 0
$totalSkipped = 0

foreach ($f in $adoIdFiles) {
    $entries = Get-Content $f.FullName -Raw | ConvertFrom-Json
    if ($entries -isnot [array]) { $entries = @($entries) }
    Write-Host "  $($f.Name) ($($entries.Count) entries)"

    foreach ($entry in $entries) {
        $localId  = $entry.localId
        $wiId     = $entry.adoWiId
        $specHint = $entry.specFile

        $specHintNorm = $specHint -replace '/', '\'
        $specFiles = Get-ChildItem -Path $SpecDir -Recurse -Filter '*.spec.ts' |
                     Where-Object { $_.FullName -like "*$specHintNorm*" }

        foreach ($sf in $specFiles) {
            $content  = Get-Content $sf.FullName -Raw
            $wiPrefix = "[$wiId]"

            # Idempotent: skip if this wiId is already associated with this localId
            if ($content -match "$([regex]::Escape($wiPrefix)).*$([regex]::Escape($localId))") {
                $totalSkipped++
                continue
            }

            # Inject [wiId] before the title of any test containing this localId
            $escaped     = [regex]::Escape($localId)
            $pattern     = "(test(?:\.(?:skip|fail|fixme))?\s*\(\s*['""])(?!\[$wiId\])([^'""]*$escaped)"
            $replacement = "`${1}$wiPrefix `${2}"
            $newContent  = [regex]::Replace($content, $pattern, $replacement)

            if ($newContent -ne $content) {
                if (-not $DryRun) {
                    [System.IO.File]::WriteAllText($sf.FullName, $newContent, [System.Text.Encoding]::UTF8)
                }
                Write-Host "    [UPDATED] $($sf.Name) -- injected $wiPrefix for $localId$(if($DryRun){' (dry run)'})"
                $totalUpdated++
            }
        }
    }
}

Write-Host ""
Write-Host "[inject-ado-ids] Done. Updated=$totalUpdated Skipped=$totalSkipped$(if($DryRun){' (DRY RUN)'})"
