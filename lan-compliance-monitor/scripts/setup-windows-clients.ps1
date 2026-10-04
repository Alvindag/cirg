<#
.SYNOPSIS
    Prepares a Windows endpoint for LAN Compliance Monitor: enables WinRM
    for the posture collector and points browser/OS proxy settings at Squid.

.NOTES
    Run as Administrator. In an AD environment, deploy this via a GPO
    startup script or a scheduled task pushed through Group Policy /
    Intune, rather than running it interactively on every machine.
    Review and adjust the WinRM authentication settings for your
    environment's security requirements before wide rollout.
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$SquidHost,

    [int]$SquidPort = 3128,

    [Parameter(Mandatory = $true)]
    [string]$PostureAccountGroup  # e.g. "CORP\LAN-Compliance-Pollers"
)

# --- Enable WinRM for the posture collector ---------------------------
Enable-PSRemoting -Force
winrm quickconfig -quiet
Set-Item WSMan:\localhost\Service\Auth\Basic -Value $false
Set-Item WSMan:\localhost\Service\Auth\Negotiate -Value $true
Set-Item WSMan:\localhost\Service\AllowUnencrypted -Value $false

# Grant the polling service account (a domain security group is recommended)
# remote management rights without making it a local admin.
Add-LocalGroupMember -Group "Remote Management Users" -Member $PostureAccountGroup -ErrorAction SilentlyContinue

New-NetFirewallRule -DisplayName "WinRM (LAN Compliance Monitor)" `
    -Direction Inbound -Protocol TCP -LocalPort 5985,5986 -Action Allow -ErrorAction SilentlyContinue

# --- Point system + browser proxy at Squid -----------------------------
$proxyServer = "${SquidHost}:${SquidPort}"

Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" `
    -Name ProxyServer -Value $proxyServer
Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" `
    -Name ProxyEnable -Value 1

Write-Host "Configured WinRM and proxy ($proxyServer) on $env:COMPUTERNAME"
Write-Host "For fleet-wide rollout, prefer GPO: Computer Configuration > Policies >" `
    "Administrative Templates > Windows Components > Windows Remote Management," `
    "and User Configuration > Policies > Windows Settings > Internet Explorer" `
    "Maintenance > Connection > Proxy Settings (or Chrome/Edge ADMX ProxySettings policy)."
