<#
.SYNOPSIS  Tracker row 6 - APPLICATION user list for Dynamics 365 Customer Engagement / CRM on-premises.
.DESCRIPTION
  Reads the <org>_MSCRM database: users, status, business unit, security roles, created and last login.
  Read-only. If CE is online (Dataverse), use the Power Platform admin centre export instead and screenshot it.
.EXAMPLE
  .\Task6B_App_UserList_CE.ps1 -SqlServer DASVM001-DB -Database "DAS_MSCRM"
#>
param(
  [Parameter(Mandatory)][string]$SqlServer,
  [Parameter(Mandatory)][string]$Database,
  [string]$OutDir = "C:\Audit\Task6"
)
if (-not (Get-Command Invoke-Sqlcmd -ErrorAction SilentlyContinue)) { Import-Module SqlServer -ErrorAction Stop }
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd_HHmm'
Start-Transcript -Path "$OutDir\Task6B_Transcript_$stamp.txt" | Out-Null
$sql = @"
SELECT su.DomainName AS Username, su.FullName, su.InternalEMailAddress AS Email,
       CASE su.IsDisabled WHEN 0 THEN 'Active' ELSE 'Inactive' END AS Status,
       bu.Name AS BusinessUnit, su.Title AS RoleTitle, su.CreatedOn,
       CASE su.AccessMode WHEN 0 THEN 'Read-Write' WHEN 1 THEN 'Administrative' WHEN 2 THEN 'Read' WHEN 3 THEN 'Support' WHEN 4 THEN 'Non-interactive' ELSE 'Delegated Admin' END AS AccessMode,
       STUFF((SELECT '; ' + r.Name FROM SystemUserRoles sur JOIN Role r ON r.RoleId = sur.RoleId
              WHERE sur.SystemUserId = su.SystemUserId FOR XML PATH('')),1,2,'') AS SecurityRoles
FROM SystemUser su LEFT JOIN BusinessUnit bu ON bu.BusinessUnitId = su.BusinessUnitId
ORDER BY su.FullName
"@
Write-Host "Query used:`n$sql" -ForegroundColor DarkGray
$rows = Invoke-Sqlcmd -ServerInstance $SqlServer -Database $Database -TrustServerCertificate -Query $sql
$rows | Export-Csv "$OutDir\Task6B_CE_Users_$stamp.csv" -NoTypeInformation -Encoding UTF8
Write-Host "`n===== SYSTEM COUNTS (CE) =====" -ForegroundColor Yellow
Write-Host "Total: $($rows.Count) | Active: $(($rows|? Status -eq 'Active').Count) | Inactive: $(($rows|? Status -eq 'Inactive').Count)"
Write-Warning "CE does not store last-logon in SystemUser; export from Settings > Auditing (User Access) or state N/A."
Stop-Transcript | Out-Null
