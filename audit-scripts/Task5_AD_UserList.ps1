<#
.SYNOPSIS  Tracker row 5 - Active Directory user list.
.DESCRIPTION
  Exports ALL AD users: username, SamAccountName/ID, status, groups, role (title/department), privileged-group
  flag, created date, last logon (replicated), password last set / never expires, locked, expiry.
  Also exports group membership (rights) and prints the user count. Transcript records the code run
  and count - screenshot the console for the auditors (code + parameters + count).
.EXAMPLE
  .\Task5_AD_UserList.ps1 -OutDir C:\Audit\Task5
#>
param([string]$OutDir = "C:\Audit\Task5")
Import-Module ActiveDirectory
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd_HHmm'
Start-Transcript -Path "$OutDir\Task5_Transcript_$stamp.txt" | Out-Null
Write-Host "Domain: $((Get-ADDomain).DNSRoot)   Run by: $env:USERDOMAIN\$env:USERNAME   Run at: $(Get-Date)"

$props = 'DisplayName','Enabled','Title','Department','Description','MemberOf','whenCreated','LastLogonDate',
         'lastLogonTimestamp','PasswordLastSet','PasswordNeverExpires','PasswordExpired','LockedOut',
         'AccountExpirationDate','EmailAddress','Manager','DistinguishedName'
$privGroups = 'Domain Admins','Enterprise Admins','Schema Admins','Administrators','Account Operators',
              'Backup Operators','Server Operators','Print Operators'

$users = Get-ADUser -Filter * -Properties $props
$rows = foreach ($u in $users) {
  $groups = $u.MemberOf | ForEach-Object { ($_ -split ',')[0] -replace '^CN=' }
  [pscustomobject]@{
    DisplayName=$u.DisplayName; Username=$u.SamAccountName; UserPrincipalName=$u.UserPrincipalName
    Status=$(if($u.Enabled){'Active'}else{'Inactive'})
    RoleTitle=$u.Title; Department=$u.Department; Description=$u.Description
    Groups=($groups -join '; ')
    PrivilegedGroups=(($groups | Where-Object { $_ -in $privGroups }) -join '; ')
    CreatedDate=$u.whenCreated; LastLogonDate=$u.LastLogonDate; PasswordLastSet=$u.PasswordLastSet
    PasswordNeverExpires=$u.PasswordNeverExpires; PasswordExpired=$u.PasswordExpired
    LockedOut=$u.LockedOut; AccountExpires=$u.AccountExpirationDate; Email=$u.EmailAddress
    Manager=$(if($u.Manager){($u.Manager -split ',')[0] -replace '^CN='}); OU=($u.DistinguishedName -replace '^CN=.*?(?<!\\),','')
  }
}
$rows | Export-Csv "$OutDir\Task5_AD_Users_$stamp.csv" -NoTypeInformation -Encoding UTF8

# Group membership (rights) - one row per user/group, incl. nested for privileged groups
$gm = foreach ($g in Get-ADGroup -Filter * ) {
  Get-ADGroupMember $g -Recursive -ErrorAction SilentlyContinue | Where-Object objectClass -eq 'user' |
    ForEach-Object { [pscustomobject]@{Group=$g.Name;GroupScope=$g.GroupScope;Username=$_.SamAccountName} }
}
$gm | Export-Csv "$OutDir\Task5_AD_GroupMembership_$stamp.csv" -NoTypeInformation

# Counts for screenshot
Write-Host "`n===== SYSTEM COUNTS =====" -ForegroundColor Yellow
Write-Host "Total users    : $($users.Count)"
Write-Host "Enabled users  : $(($users | Where-Object Enabled).Count)"
Write-Host "Disabled users : $(($users | Where-Object {-not $_.Enabled}).Count)"
Write-Host "Privileged     : $(($rows | Where-Object PrivilegedGroups).Count)"
Write-Host "No logon 90d+  : $(($users | Where-Object {$_.Enabled -and ($_.LastLogonDate -lt (Get-Date).AddDays(-90) -or -not $_.LastLogonDate)}).Count)"
Stop-Transcript | Out-Null
Write-Host "Files in $OutDir" -ForegroundColor Green
