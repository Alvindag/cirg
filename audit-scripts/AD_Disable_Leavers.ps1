#Requires -Modules ActiveDirectory
<#
.SYNOPSIS  Disable AD accounts for leavers listed in a CSV/TXT file. DRY RUN by default - nothing changes without -Apply.
.DESCRIPTION
  For each name: finds the AD user, skips if not found / ambiguous / already disabled / privileged, otherwise disables it.
  Match types:  EXACT-ID (EmployeeID), EXACT (display name/CN), PROBABLE (given+surname or first.last username),
                AMBIGUOUS (more than one hit), NOT FOUND.  Only EXACT* are disabled unless -IncludeProbable is used.
  Never deletes, never moves, never removes group membership. Writes a CSV report (with DN for rollback).
  Description is appended with date + reference.
.EXAMPLE
  .\AD_Disable_Leavers.ps1 -ListPath C:\Audit\Leavers\leavers.csv                       # dry run, review the report
  .\AD_Disable_Leavers.ps1 -ListPath C:\Audit\Leavers\leavers.csv -Apply -Reference "HR-2026-11"
#>
param(
  [Parameter(Mandatory)][string]$ListPath,
  [switch]$Apply,
  [switch]$IncludeProbable,
  [string]$Reference = 'Leaver',
  [string]$OutDir = 'C:\Audit\Leavers'
)
Import-Module ActiveDirectory
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd_HHmm'
function Norm($s) { if (-not $s) { return '' }; (($s -replace '\s+',' ').Trim()).ToUpper() }

# --- read the list (CSV with a 'name' column and optional 'no/id' column, or plain text one name per line) ---
if ([IO.Path]::GetExtension($ListPath) -eq '.csv') {
  $csv = Import-Csv $ListPath
  $cols = $csv[0].PSObject.Properties.Name
  $nameCol = $cols | Where-Object { $_ -match 'name' } | Select-Object -First 1
  $idCol   = $cols | Where-Object { $_ -match '\b(no|number|id)\b' -and $_ -ne $nameCol } | Select-Object -First 1
  $list = $csv | ForEach-Object { [pscustomobject]@{ Name = Norm $_.$nameCol; EmpNo = $(if ($idCol) { "$($_.$idCol)".Trim() } else { '' }) } }
} else {
  $list = Get-Content $ListPath | ForEach-Object { [pscustomobject]@{ Name = Norm $_; EmpNo = '' } }
}
$list = $list | Where-Object Name | Group-Object Name | ForEach-Object { $_.Group[0] }   # remove duplicate names
Write-Host "Names to process: $($list.Count)   Mode: $(if($Apply){'APPLY (will disable)'}else{'DRY RUN (no changes)'})" -ForegroundColor Cyan

$users = Get-ADUser -Filter * -Properties DisplayName,GivenName,Surname,Enabled,Description,LastLogonDate,MemberOf,EmployeeID
$protectedGroups = 'Domain Admins','Enterprise Admins','Schema Admins','Administrators','Account Operators','Backup Operators','Server Operators'
$protectedSam = 'Administrator','krbtgt','Guest',$env:USERNAME

$rows = foreach ($item in $list) {
  $name = $item.Name; $parts = $name -split ' '; $hits = @(); $type = 'NOT FOUND'
  if ($item.EmpNo) { $hits = @($users | Where-Object { $_.EmployeeID -and $_.EmployeeID -eq $item.EmpNo }); if ($hits) { $type = 'EXACT-ID' } }
  if (-not $hits) { $hits = @($users | Where-Object { (Norm $_.DisplayName) -eq $name -or (Norm $_.Name) -eq $name }); if ($hits) { $type = 'EXACT' } }
  if (-not $hits -and $parts.Count -ge 2) {
    $f = $parts[0]; $l = $parts[-1]
    $hits = @($users | Where-Object { ($_.GivenName -eq $f -and $_.Surname -eq $l) -or $_.SamAccountName -eq "$f.$l" })
    if ($hits) { $type = 'PROBABLE' }
  }
  $hits = @($hits | Sort-Object DistinguishedName -Unique)
  if ($hits.Count -gt 1) { $type = 'AMBIGUOUS' }
  $u = if ($hits.Count -eq 1) { $hits[0] } else { $null }

  $action = 'NOT FOUND - nothing to do'; $note = ''
  if ($type -eq 'AMBIGUOUS') { $action = 'REVIEW - several matches'; $note = ($hits.SamAccountName -join '; ') }
  elseif ($u) {
    $groups = $u.MemberOf | ForEach-Object { ($_ -split ',')[0] -replace '^CN=' }
    if ($u.SamAccountName -in $protectedSam -or ($groups | Where-Object { $_ -in $protectedGroups })) { $action = 'SKIPPED - privileged/protected account' }
    elseif (-not $u.Enabled) { $action = 'ALREADY DISABLED' }
    elseif ($type -in 'EXACT','EXACT-ID' -or ($IncludeProbable -and $type -eq 'PROBABLE')) { $action = 'WOULD DISABLE' }
    else { $action = 'REVIEW - probable match, not disabled'; $note = 'Confirm identity, then re-run with -IncludeProbable or disable manually' }
  }
  [pscustomobject]@{
    InputName=$name; EmployeeNo=$item.EmpNo; MatchType=$type
    ADUsername=$u.SamAccountName; ADDisplayName=$u.DisplayName; WasEnabled=$u.Enabled; LastLogon=$u.LastLogonDate
    OU=($u.DistinguishedName -replace '^CN=.*?(?<!\\),',''); Action=$action; Note=$note; DN=$u.DistinguishedName; User=$u
  }
}

# --- apply (asks for confirmation) ---
$todo = @($rows | Where-Object Action -eq 'WOULD DISABLE')
if ($Apply -and $todo.Count -gt 0) {
  $todo | Format-Table InputName,ADUsername,MatchType,LastLogon -AutoSize
  if ((Read-Host "Type YES to disable these $($todo.Count) accounts") -ceq 'YES') {
    foreach ($r in $todo) {
      try {
        Disable-ADAccount -Identity $r.DN -ErrorAction Stop
        $d = "Disabled $(Get-Date -Format yyyy-MM-dd) - $Reference"
        if ($r.User.Description) { $d += " | was: $($r.User.Description)" }
        Set-ADUser -Identity $r.DN -Description $d.Substring(0,[Math]::Min(1024,$d.Length)) -ErrorAction Stop
        $r.Action = 'DISABLED'
      } catch { $r.Action = "FAILED: $($_.Exception.Message)" }
    }
  } else { Write-Host 'Cancelled - nothing changed.' -ForegroundColor Yellow }
}

$mode = if ($Apply) { 'APPLIED' } else { 'DRYRUN' }
$report = "$OutDir\Leavers_${mode}_$stamp.csv"
$rows | Select-Object * -ExcludeProperty User | Export-Csv $report -NoTypeInformation -Encoding UTF8
Write-Host "`n===== SUMMARY =====" -ForegroundColor Yellow
$rows | Group-Object Action | Sort-Object Count -Descending | ForEach-Object { '{0,5}  {1}' -f $_.Count, $_.Name }
Write-Host "Report: $report"
Write-Host "Rollback if needed:  Import-Csv '$report' | Where Action -eq DISABLED | ForEach-Object { Enable-ADAccount -Identity `$_.DN }" -ForegroundColor DarkGray
