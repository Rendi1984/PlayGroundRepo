<#
.SYNOPSIS
    Finds enabled AD users with no e-mail address and adds them to a security
    group used to exclude them from certificate auto-enrollment.

.DESCRIPTION
    1. Queries AD for all enabled user accounts whose 'mail' attribute is empty.
    2. Exports the full list to a CSV file (one file per run, timestamped).
    3. For each user: if already a member of the exclusion group -> skip,
       otherwise -> add to the group.
    4. Writes a log file for every run.

    Run with -Install once to register a Scheduled Task that runs the script at
    the times listed in $ScheduleTimes (default 07:00 and 14:00).

    Compatible with Windows PowerShell 5.1.

.PARAMETER Install
    Registers (or re-registers) the Scheduled Task and exits.

.EXAMPLE
    .\Add-NoMailUsersToCertExclusionGroup.ps1 -WhatIf
    Dry run: shows which users would be added, changes nothing.

.EXAMPLE
    .\Add-NoMailUsersToCertExclusionGroup.ps1 -Install
    Creates the scheduled task.

.NOTES
    Author  : [IT Team]
    Date    : 2026-09-28
    Version : 1.0
    Requires: RSAT ActiveDirectory module; the run account needs rights to
              modify membership of the exclusion group.
#>
[CmdletBinding(SupportsShouldProcess)]
param(
    [switch]$Install
)

#region ===== Configuration (edit here) =====
$ExclusionGroupName = 'X'                          # <-- PLACEHOLDER: sAMAccountName of the security group
$SearchBase         = ''                           # Optional OU DN, e.g. 'OU=Users,DC=contoso,DC=local'. Empty = whole domain
$OutputFolder       = 'C:\Scripts\NoMailUsers'     # CSV + logs are written here
$ScheduleTimes      = @('07:00', '14:00')          # Daily run times (HH:mm) - change as needed
$TaskName           = 'AD - Exclude NoMail Users From AutoEnroll'
$TaskRunAsUser      = 'NT AUTHORITY\SYSTEM'        # SYSTEM works on a DC; on a member server use a gMSA (e.g. 'DOMAIN\gmsaName$')
#endregion

$ErrorActionPreference = 'Stop'

#region ===== Install scheduled task =====
if ($Install) {
    $scriptPath = $MyInvocation.MyCommand.Path
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$scriptPath`""

    $triggers = foreach ($t in $ScheduleTimes) {
        New-ScheduledTaskTrigger -Daily -At ([datetime]::ParseExact($t, 'HH:mm', $null))
    }

    if ($TaskRunAsUser -like '*$') {
        # gMSA - password is retrieved from AD
        $principal = New-ScheduledTaskPrincipal -UserId $TaskRunAsUser -LogonType Password -RunLevel Highest
    } else {
        $principal = New-ScheduledTaskPrincipal -UserId $TaskRunAsUser -LogonType ServiceAccount -RunLevel Highest
    }

    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
        -MultipleInstances IgnoreNew

    if ($PSCmdlet.ShouldProcess($TaskName, 'Register scheduled task')) {
        Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers `
            -Principal $principal -Settings $settings -Force | Out-Null
        Write-Host "Scheduled task '$TaskName' registered. Runs daily at: $($ScheduleTimes -join ', ')" -ForegroundColor Green
    }
    return
}
#endregion

#region ===== Helpers =====
if (-not (Test-Path -LiteralPath $OutputFolder)) {
    New-Item -Path $OutputFolder -ItemType Directory -Force | Out-Null
}
$stamp   = Get-Date -Format 'yyyyMMdd_HHmmss'
$logFile = Join-Path $OutputFolder "Log_$stamp.txt"
$csvFile = Join-Path $OutputFolder "NoMailUsers_$stamp.csv"

function Write-Log {
    param([string]$Message, [string]$Level = 'INFO')
    $line = '{0} [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
    Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8
    switch ($Level) {
        'ERROR' { Write-Host $line -ForegroundColor Red }
        'WARN'  { Write-Host $line -ForegroundColor Yellow }
        'ADD'   { Write-Host $line -ForegroundColor Green }
        default { Write-Host $line }
    }
}
#endregion

#region ===== Main =====
try {
    Import-Module ActiveDirectory

    if ($ExclusionGroupName -eq 'X') {
        Write-Log "Exclusion group is still the placeholder 'X'. Make sure this is intended." 'WARN'
    }

    # Validate group exists and load current direct members once (avoids one AD query per user)
    $group = Get-ADGroup -Identity $ExclusionGroupName -Properties member
    $existingMembers = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    foreach ($dn in $group.member) { [void]$existingMembers.Add($dn) }
    Write-Log "Group '$($group.Name)' found with $($existingMembers.Count) direct members."

    # Enabled users (UAC bit 2 not set) with no 'mail' value
    $ldapFilter = '(&(objectCategory=person)(objectClass=user)(!(userAccountControl:1.2.840.113556.1.4.803:=2))(!(mail=*)))'
    $getParams = @{
        LDAPFilter = $ldapFilter
        Properties = @('mail', 'userPrincipalName', 'displayName', 'lastLogonTimestamp', 'whenCreated')
    }
    if ($SearchBase) { $getParams['SearchBase'] = $SearchBase }

    $users = @(Get-ADUser @getParams)
    Write-Log "Found $($users.Count) enabled users without e-mail."

    # Export full list to CSV
    $users | Select-Object SamAccountName, DisplayName, UserPrincipalName, DistinguishedName, whenCreated,
        @{ Name = 'LastLogon'; Expression = { if ($_.lastLogonTimestamp) { [datetime]::FromFileTime($_.lastLogonTimestamp) } } },
        @{ Name = 'InGroupBeforeRun'; Expression = { $existingMembers.Contains($_.DistinguishedName) } } |
        Export-Csv -LiteralPath $csvFile -NoTypeInformation -Encoding UTF8
    Write-Log "CSV exported: $csvFile"

    $added = 0; $skipped = 0; $failed = 0
    foreach ($u in $users) {
        if ($existingMembers.Contains($u.DistinguishedName)) {
            Write-Verbose "SKIP  $($u.SamAccountName) - already a member"
            $skipped++
            continue
        }

        if ($PSCmdlet.ShouldProcess($u.SamAccountName, "Add to group '$($group.Name)'")) {
            try {
                Add-ADGroupMember -Identity $group -Members $u
                [void]$existingMembers.Add($u.DistinguishedName)
                Write-Log "ADDED $($u.SamAccountName)" 'ADD'
                $added++
            } catch {
                Write-Log "FAILED $($u.SamAccountName): $($_.Exception.Message)" 'ERROR'
                $failed++
            }
        }
    }

    Write-Log "Done. Added: $added | Skipped (already member): $skipped | Failed: $failed"
    if ($failed -gt 0) { exit 1 }
}
catch {
    Write-Log "Fatal error: $($_.Exception.Message)" 'ERROR'
    exit 2
}
#endregion
