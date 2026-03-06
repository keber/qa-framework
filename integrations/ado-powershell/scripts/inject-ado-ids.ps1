<#
.SYNOPSIS
    Prepends Azure DevOps Work Item IDs to Playwright spec file test titles.

.DESCRIPTION
    Reads ado-ids.json (produced by create-testplan-from-mapping.ps1) and
    updates every matching test() / test.skip() call in the spec files to
    include the ADO WI ID as a prefix.

    This operation is IDEMPOTENT: if the ID is already present, it is not
    duplicated.

.PARAMETER SpecDir
    Root directory containing Playwright spec files (.spec.ts).
    Searched recursively.

.PARAMETER MappingFile
    Path to ado-ids.json — array of { localId, adoWiId, specFile }.

.EXAMPLE
    .\inject-ado-ids.ps1 `
        -SpecDir     "qa/07-automation/e2e" `
        -MappingFile "qa/08-azure-integration/ado-ids.json"

.NOTES
    Does NOT require a network connection or ADO token.
    Commit the modified spec files after running.
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory)]
    [string] $SpecDir,

    [Parameter(Mandatory)]
    [string] $MappingFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Load mapping
if (-not (Test-Path $MappingFile)) {
    Write-Error "Mapping file not found: $MappingFile"
    exit 1
}
$mapping = Get-Content $MappingFile -Raw | ConvertFrom-Json

Write-Host "[inject-ado-ids] Loaded $($mapping.Count) mapping entries from $MappingFile"

$updated = 0
$skipped = 0

foreach ($entry in $mapping) {
    $adoId   = $entry.adoWiId
    $localId = $entry.localId

    # Find spec files matching this entry
    $pattern = if ($entry.specFile) { $entry.specFile } else { "**/*.spec.ts" }
    $files   = Get-ChildItem -Path $SpecDir -Recurse -Filter "*.spec.ts" |
               Where-Object { $_.FullName -like "*$($entry.specFile)*" }

    foreach ($file in $files) {
        $content = Get-Content $file.FullName -Raw

        # Match test titles containing the localId but NOT already prefixed with adoId
        # Pattern: test('...[TC-x-x-NNN]...') where [NNN_ADOID] not yet present
        $adoPrefix   = "[$adoId]"
        $escapedId   = [regex]::Escape($localId)

        # Check if already injected (idempotent guard)
        if ($content -match [regex]::Escape($adoPrefix)) {
            Write-Verbose "[$localId] ADO WI $adoId already present in $($file.Name) — skipping"
            $skipped++
            continue
        }

        # Replace: test('ORIGINAL_TITLE') → test('[ADOID] ORIGINAL_TITLE')
        # Matches both single and double quotes, test() and test.skip()
        $newContent = $content -replace `
            "(?<=(test(?:\.skip)?\s*\()(['""]))\s*(?=.*\Q$localId\E)", `
            "$adoPrefix "

        if ($newContent -ne $content) {
            if ($PSCmdlet.ShouldProcess($file.FullName, "Inject ADO WI $adoId for $localId")) {
                Set-Content -Path $file.FullName -Value $newContent -NoNewline
                Write-Host "  [UPDATED] $($file.Name) — injected [$adoId] for $localId"
                $updated++
            }
        } else {
            Write-Verbose "  [NO MATCH] $localId not found by pattern in $($file.Name)"
        }
    }
}

Write-Host ""
Write-Host "[inject-ado-ids] Done. Updated: $updated | Skipped (already present): $skipped"
