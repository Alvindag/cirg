#Requires -RunAsAdministrator
<#
.SYNOPSIS  Configure the Wazuh agent on the Active Directory domain controller (DAS-DC) so the modules produce data.
.DESCRIPTION
  1. Enables the advanced audit policies AD events need (local policy - on a DC also set them in the
     'Default Domain Controllers Policy' GPO, otherwise GPO overwrites them).
  2. Adds eventchannel collection (Directory Service, DNS Server, PowerShell) and file-integrity monitoring of SYSVOL
     as a SEPARATE <ossec_config> block (the original ossec.conf is backed up first, and restored if the XML is invalid).
  3. Restarts the agent and shows its status and log tail.
  Run on DAS-DC (repeat on DAS-DC2). Safe to run twice.
.EXAMPLE  .\Wazuh_DAS-DC_Configure.ps1
#>
param(
  [string]$Conf = "C:\Program Files (x86)\ossec-agent\ossec.conf",
  [switch]$EnablePowerShellLogging
)
$ErrorActionPreference = 'Stop'
$stamp = Get-Date -Format 'yyyyMMdd_HHmm'
if (-not (Test-Path $Conf)) { throw "ossec.conf not found at $Conf" }

# --- 1. Audit policy (AD-relevant subcategories) ---
$subs = 'Directory Service Changes','Directory Service Access','User Account Management','Security Group Management',
        'Computer Account Management','Logon','Logoff','Account Lockout','Credential Validation',
        'Kerberos Authentication Service','Kerberos Service Ticket Operations','Audit Policy Change',
        'Process Creation','Special Logon','Other Account Management Events'
foreach ($s in $subs) {
  & auditpol.exe /set /subcategory:"$s" /success:enable /failure:enable | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Warning "Could not set audit subcategory: $s" }
}
# Include command line in process-creation events (event 4688)
$k = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System\Audit'
New-Item -Path $k -Force | Out-Null
Set-ItemProperty -Path $k -Name ProcessCreationIncludeCmdline_Enabled -Value 1 -Type DWord
if ($EnablePowerShellLogging) {
  $p = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\PowerShell\ScriptBlockLogging'
  New-Item -Path $p -Force | Out-Null
  Set-ItemProperty -Path $p -Name EnableScriptBlockLogging -Value 1 -Type DWord
}

# --- 2. Wazuh agent config ---
Copy-Item $Conf "$Conf.bak_$stamp"
$txt = Get-Content $Conf -Raw
$marker = '<!-- DAS PLC audit additions -->'
if ($txt -notmatch [regex]::Escape($marker)) {
  $logs = @()
  foreach ($ch in 'Directory Service','DNS Server','Microsoft-Windows-PowerShell/Operational','Windows PowerShell') {
    if (Get-WinEvent -ListLog $ch -ErrorAction SilentlyContinue) {
      $logs += "  <localfile>`r`n    <location>$ch</location>`r`n    <log_format>eventchannel</log_format>`r`n  </localfile>"
    } else { Write-Host "Event log '$ch' not present on this server - skipped" }
  }
  $add = @"

$marker
<ossec_config>
$($logs -join "`r`n")
  <syscheck>
    <directories check_all="yes" realtime="yes" report_changes="no">C:\Windows\SYSVOL</directories>
    <directories check_all="yes">C:\Windows\System32\GroupPolicy</directories>
  </syscheck>
</ossec_config>
"@
  $new = $txt.TrimEnd() + "`r`n" + $add
  try { [void][xml]("<root>$($new -replace '<\?xml[^>]*\?>','')</root>") }
  catch { Copy-Item "$Conf.bak_$stamp" $Conf -Force; throw "Resulting XML invalid - original restored. $_" }
  Set-Content -Path $Conf -Value $new -Encoding UTF8
  Write-Host "ossec.conf updated (backup: $Conf.bak_$stamp)" -ForegroundColor Green
} else { Write-Host "Already configured (marker found) - no config change." -ForegroundColor Yellow }

# --- 3. Restart and verify ---
Restart-Service WazuhSvc
Start-Sleep 10
Get-Service WazuhSvc | Format-Table Name,Status -AutoSize
$log = Join-Path (Split-Path $Conf) 'ossec.log'
if (Test-Path $log) { Get-Content $log -Tail 25 } else { Write-Warning "ossec.log not found yet" }
Write-Host "`nAuditing now enabled locally. ALSO set the same in the 'Default Domain Controllers Policy' GPO (Advanced Audit Policy)." -ForegroundColor Cyan
