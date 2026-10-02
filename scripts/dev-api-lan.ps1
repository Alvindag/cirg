<#
Starts the API for local testing so that a phone on the same Wi-Fi can reach it.

Why this exists: `dotnet run` uses the launch profile in Properties/launchSettings.json, which listens on localhost only
and overrides ASPNETCORE_URLS. This script bypasses the profile, listens on every network address, shows the addresses
to type into the phone, and opens the Windows firewall for the port (when run as Administrator).

Usage (PowerShell, from the repository folder):
  .\scripts\dev-api-lan.ps1                      # asks for the PostgreSQL password
  .\scripts\dev-api-lan.ps1 -Password "..."      # or pass it
#>
param(
  [string]$Password = $env:PGPASSWORD,
  [string]$Database = "das_engage",
  [int]$Port = 5111
)
$ErrorActionPreference = "Stop"

if (-not $Password) {
  $secure = Read-Host "PostgreSQL password for user postgres" -AsSecureString
  $Password = [System.Net.NetworkCredential]::new("", $secure).Password
}

# An API left running from earlier locks its files and makes the build fail, so stop it first.
$old = Get-Process -Name "DasEngage.Api" -ErrorAction SilentlyContinue
if ($old) {
  Write-Host ("Stopping the API that is already running (process {0})." -f ($old.Id -join ", ")) -ForegroundColor Yellow
  $old | Stop-Process -Force
  Start-Sleep -Seconds 1
}

# Firewall: one inbound rule for the port. Needs Administrator; if not, say what to run instead.
$rule = "DAS API dev $Port"
if (-not (Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue)) {
  $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if ($admin) {
    New-NetFirewallRule -DisplayName $rule -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Any | Out-Null
    Write-Host "Firewall: opened TCP $Port." -ForegroundColor Green
  } else {
    Write-Host "Firewall: TCP $Port is not open yet. Run this once in a PowerShell opened as Administrator:" -ForegroundColor Yellow
    Write-Host "  New-NetFirewallRule -DisplayName '$rule' -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow -Profile Any"
  }
}

Write-Host ""
Write-Host "Type the Wi-Fi one into the phone as the server address (with the port). Ignore vEthernet / Default Switch / WSL entries, they are virtual:" -ForegroundColor Cyan
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.PrefixOrigin -ne "WellKnown" } |
  ForEach-Object { Write-Host ("  http://{0}:{1}    ({2})" -f $_.IPAddress, $Port, $_.InterfaceAlias) }
Write-Host "The phone must be on the same Wi-Fi. Test first in the phone's browser: http://<address>:$Port/health/ready"
Write-Host ""

$env:ConnectionStrings__Default = "Host=localhost;Database=$Database;Username=postgres;Password=$Password"
$env:ASPNETCORE_ENVIRONMENT = "Development"
Push-Location (Join-Path $PSScriptRoot "..\src\backend\src\DasEngage.Api")
try { dotnet run --no-launch-profile --urls "http://0.0.0.0:$Port" } finally { Pop-Location }
