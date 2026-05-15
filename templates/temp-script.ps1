function New-AdoTestCase {
    <#
    .SYNOPSIS
      Creates a Test Case work item with optional steps.
      Wraps New-AdoWorkItem -Type 'Test Case' and handles TCM-specific fields.

    .PARAMETER Title        Title of the Test Case (mandatory).
    .PARAMETER Steps        Ordered array of plain-text action strings.
                            Encoded as the XML format required by Microsoft.VSTS.TCM.Steps.
    .PARAMETER Priority     1 (Critical) | 2 (High) | 3 (Medium) | 4 (Low).
    .PARAMETER ExtraFields  Hashtable of additional TCM or custom fields.

    .EXAMPLE
        New-AdoTestCase -Title 'Verify login with valid credentials' `
            -Steps @('Navigate to /login', 'Enter username and password', 'Click Sign In') `
            -Priority '2' -AssignedTo 'qa@contoso.com' -Tags 'login; smoke'
    #>
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact='Low')]
    param(
        [Parameter(Mandatory)][string]$Title,
        [string]$Description,
        [string]$AssignedTo,
        [string]$AreaPath,
        [string]$IterationPath,
        [string]$Tags,
        [ValidateSet('Design','Ready','Closed')]
        [string]$State,
        [string[]]$Steps,
        [ValidateSet('1','2','3','4')]
        [string]$Priority,
        [hashtable]$ExtraFields = @{},
        [string]$Org     = $script:AdoSession.Org,
        [string]$Project = $script:AdoSession.Project,
        [string]$ApiV    = $script:AdoSession.ApiV,
        [hashtable]$Headers = $script:AdoSession.Headers
    )

    $extra = $ExtraFields.Clone()

    if ($Priority) {
        $extra['Microsoft.VSTS.Common.Priority'] = $Priority
    }

    if ($Steps -and $Steps.Count -gt 0) {
        $stepsXml   = '<steps id="0" last="{0}">' -f $Steps.Count
        $stepIndex  = 1
        foreach ($action in $Steps) {
            $escaped  = [System.Security.SecurityElement]::Escape($action)
            $stepsXml += '<step id="{0}" type="ActionStep"><parameterizedString isformatted="true">{1}</parameterizedString><parameterizedString isformatted="true"/></step>' -f $stepIndex, $escaped
            $stepIndex++
        }
        $stepsXml += '</steps>'
        $extra['Microsoft.VSTS.TCM.Steps'] = $stepsXml
    }

    $splatArgs = @{
        Type        = 'Test Case'
        Title       = $Title
        ExtraFields = $extra
        Org         = $Org
        Project     = $Project
        ApiV        = $ApiV
        Headers     = $Headers
    }
    if ($Description)   { $splatArgs.Description   = $Description   }
    if ($AssignedTo)    { $splatArgs.AssignedTo    = $AssignedTo    }
    if ($AreaPath)      { $splatArgs.AreaPath      = $AreaPath      }
    if ($IterationPath) { $splatArgs.IterationPath = $IterationPath }
    if ($Tags)          { $splatArgs.Tags          = $Tags          }
    if ($State)         { $splatArgs.State         = $State         }

    # WhatIf / Confirm propagate automatically via $WhatIfPreference / $ConfirmPreference
    return New-AdoWorkItem @splatArgs
}