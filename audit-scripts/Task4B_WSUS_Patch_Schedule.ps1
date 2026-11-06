<#
.SYNOPSIS  Patch deployment schedule evidence from WSUS + the schedule each server actually applies.
  Run on the WSUS server (elevated PowerShell). Part A = WSUS settings, Part B = per-server Windows Update policy.
#>
param(
  [string[]]$Servers = @('DAS-DC','DAS-DC2','NAV-SERVER','DASVM001-DB','DASVM002-APO1','DASVM003-WEB'),
  [string]$OutDir = 'C:\Audit\Task4'
)
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd_HHmm'
Start-Transcript -Path "$OutDir\Task4B_Transcript_$stamp.txt" | Out-Null

# ---------- Part A: WSUS server settings ----------
$wsus = Get-WsusServer
$sub  = $wsus.GetSubscription()
$last = $sub.GetLastSynchronizationInfo()
$a = [pscustomobject]@{
  WSUSServer=$wsus.Name; AutoSync=$sub.SynchronizeAutomatically; SyncTimeOfDay=$sub.SynchronizeAutomaticallyTimeOfDay
  SyncsPerDay=$sub.NumberOfSynchronizationsPerDay; LastSyncResult=$last.Result; LastSyncStart=$last.StartTime
  LastSyncEnd=$last.EndTime; NextSync=$sub.GetNextSynchronizationTime()
}
$a | Export-Csv "$OutDir\Task4B_WSUS_SyncSchedule_$stamp.csv" -NoTypeInformation
$a | Format-List

$rules = $wsus.GetInstallApprovalRules() | ForEach-Object {
  [pscustomobject]@{ Rule=$_.Name; Enabled=$_.Enabled
    Groups=(($_.GetComputerTargetGroups()).Name -join '; ')
    Classifications=(($_.GetUpdateClassifications()).Title -join '; ')
    Products=(($_.GetCategories()).Title -join '; ') } }
$rules | Export-Csv "$OutDir\Task4B_WSUS_AutoApprovalRules_$stamp.csv" -NoTypeInformation
$rules | Format-Table -AutoSize

$wsus.GetComputerTargetGroups() | Select-Object Name,@{n='Computers';e={$_.GetComputerTargets().Count}} |
  Export-Csv "$OutDir\Task4B_WSUS_ComputerGroups_$stamp.csv" -NoTypeInformation
Get-WsusComputer -All | Select-Object FullDomainName,IPAddress,RequestedTargetGroupName,LastSyncTime,LastReportedStatusTime |
  Export-Csv "$OutDir\Task4B_WSUS_Computers_$stamp.csv" -NoTypeInformation

# ---------- Part B: schedule each server applies (Group Policy / registry) ----------
$days = @{0='Every day';1='Sunday';2='Monday';3='Tuesday';4='Wednesday';5='Thursday';6='Friday';7='Saturday'}
$opts = @{2='Notify before download';3='Auto download, notify to install';4='Auto download and schedule install';5='Local admin chooses'}
$b = foreach ($s in $Servers) {
  try {
    Invoke-Command -ComputerName $s -ErrorAction Stop -ScriptBlock {
      $wu = Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate' -ErrorAction SilentlyContinue
      $au = Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU' -ErrorAction SilentlyContinue
      [pscustomobject]@{ Server=$env:COMPUTERNAME; WSUSServer=$wu.WUServer; TargetGroup=$wu.TargetGroup
        UseWSUS=$au.UseWUServer; AUOptions=$au.AUOptions; InstallDay=$au.ScheduledInstallDay; InstallHour=$au.ScheduledInstallTime
        NoAutoRebootWithLoggedOnUsers=$au.NoAutoRebootWithLoggedOnUsers; Status='OK' } }
  } catch { [pscustomobject]@{ Server=$s; Status="FAILED: $($_.Exception.Message)" } }
}
$b = $b | Select-Object *,@{n='InstallDayName';e={if($null -ne $_.InstallDay){$days[[int]$_.InstallDay]}}},@{n='AUOptionsMeaning';e={if($null -ne $_.AUOptions){$opts[[int]$_.AUOptions]}}}
$b | Export-Csv "$OutDir\Task4B_Server_PatchPolicy_$stamp.csv" -NoTypeInformation
$b | Format-Table Server,WSUSServer,TargetGroup,AUOptionsMeaning,InstallDayName,InstallHour,Status -AutoSize
Stop-Transcript | Out-Null
