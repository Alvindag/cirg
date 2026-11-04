<#
.SYNOPSIS  Tracker row 3 - Details of applications used by the firm (Navision, BC, CE).
.DESCRIPTION
  For each server: OS, hosting type (physical/VMware/Hyper-V/Azure), IP, AD site (data centre proxy),
  installed Dynamics/Navision components, related services, SQL instances and databases.
  Fill purpose / DC location / interfaces manually in the auditor template (marked 'MANUAL' in output).
.EXAMPLE
  .\Task3_App_Server_Inventory.ps1 -Servers NAVSRV01,BCSRV01,SQL01 -OutDir C:\Audit\Task3
  .\Task3_App_Server_Inventory.ps1 -Servers (Get-Content .\servers.txt)
.NOTES  Run as admin with WinRM/remote rights. Take screenshots of the console showing the command + output.
#>
param(
  [Parameter(Mandatory)][string[]]$Servers,
  [string]$OutDir = "C:\Audit\Task3"
)
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd_HHmm'
Start-Transcript -Path "$OutDir\Task3_Transcript_$stamp.txt" | Out-Null

$pattern = 'Navision|Dynamics|Business Central|NAV|BC\d|Customer Engagement|CRM|SQL Server'
$results = foreach ($s in $Servers) {
  Write-Host "Collecting $s ..." -ForegroundColor Cyan
  try {
    $d = Invoke-Command -ComputerName $s -ErrorAction Stop -ScriptBlock {
      $os  = Get-CimInstance Win32_OperatingSystem
      $cs  = Get-CimInstance Win32_ComputerSystem
      $ip  = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notmatch '^127|^169' }).IPAddress -join '; '
      $sw  = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
                              'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue |
             Where-Object { $_.DisplayName -match $using:pattern } |
             ForEach-Object { "$($_.DisplayName) v$($_.DisplayVersion)" }
      $svc = Get-CimInstance Win32_Service |
             Where-Object { $_.Name -match 'NAV|DynamicsNAV|MicrosoftDynamicsNav|BC|MSSQL|CRM|W3SVC' -or $_.DisplayName -match 'Dynamics|Navision' } |
             ForEach-Object { "$($_.DisplayName) [$($_.State)]" }
      $sqlInst = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server' -ErrorAction SilentlyContinue).InstalledInstances -join '; '
      [pscustomobject]@{
        OS=$os.Caption; OSVersion=$os.Version; Model=$cs.Model; Manufacturer=$cs.Manufacturer
        IPs=$ip; Software=($sw -join ' | '); Services=($svc -join ' | '); SQLInstances=$sqlInst
      }
    }
    $hosting = switch -Regex ("$($d.Manufacturer) $($d.Model)") {
      'VMware'{'Virtual - VMware'} 'Virtual Machine'{'Virtual - Hyper-V/Azure'} 'Amazon|Xen'{'Virtual - AWS'} default{'Physical / confirm'} }
    $site = try { (Get-ADDomainController -Identity $s -ErrorAction Stop).Site } catch { 'Not a DC / n/a' }
    [pscustomobject]@{
      ServerName=$s; OperatingSystem=$d.OS; OSVersion=$d.OSVersion; HostedOn=$hosting; IPAddress=$d.IPs
      ADSite=$site; DetectedApplications=$d.Software; RelatedServices=$d.Services; SQLInstances=$d.SQLInstances
      Purpose='MANUAL'; DataCentreLocation='MANUAL'; InterfacedOrStandalone='MANUAL'
    }
  } catch {
    [pscustomobject]@{ ServerName=$s; OperatingSystem="ERROR: $($_.Exception.Message)" }
  }
}
$results | Export-Csv "$OutDir\Task3_Servers_Applications_$stamp.csv" -NoTypeInformation
$results | Format-Table ServerName,OperatingSystem,HostedOn,SQLInstances -AutoSize

# --- SQL databases per instance (needs SqlServer module or sqlcmd) ---
$dbRows = foreach ($s in $Servers) {
  try {
    Invoke-Sqlcmd -ServerInstance $s -TrustServerCertificate -Query "
      SELECT @@SERVERNAME AS ServerName, SERVERPROPERTY('ProductVersion') AS SQLVersion,
             SERVERPROPERTY('Edition') AS Edition, name AS DatabaseName, create_date, state_desc, recovery_model_desc
      FROM sys.databases WHERE database_id > 4" -ErrorAction Stop
  } catch { Write-Warning "SQL query skipped for $s : $($_.Exception.Message)" }
}
if ($dbRows) { $dbRows | Export-Csv "$OutDir\Task3_Databases_$stamp.csv" -NoTypeInformation; $dbRows | Format-Table -AutoSize }
Stop-Transcript | Out-Null
Write-Host "Done. Output in $OutDir. Complete MANUAL columns, then paste into the auditor template." -ForegroundColor Green
