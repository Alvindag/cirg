#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Installs the CIRG Enterprise Security Operations agent on a Windows 10,
    Windows 11, or Windows Server 2016+ endpoint: enrolls with the SOC
    collector, installs Python dependencies, drops the agent as a Windows
    Service, and (optionally) deploys the recommended Sysmon configuration.

.EXAMPLE
    .\install.ps1 -ServerUrl "https://cirg.example.org:5001" -EnrollToken "abc123..."

.EXAMPLE
    .\install.ps1 -ServerUrl "https://cirg.example.org:5001" -EnrollToken "abc123..." -InstallSysmon
#>

param(
    [Parameter(Mandatory = $true)][string]$ServerUrl,
    [Parameter(Mandatory = $true)][string]$EnrollToken,
    [string]$InstallDir = "$Env:ProgramFiles\CIRG-Agent",
    [string]$CollectorIp,
    [switch]$InstallSysmon,
    [int]$PollIntervalSeconds = 30
)

$ErrorActionPreference = "Stop"
$DataDir = "$Env:ProgramData\CIRG"

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }

Write-Step "Checking prerequisites"
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    throw "Python 3.10+ was not found on PATH. Install it (e.g. from python.org, 'Include pywin32' not required) and re-run this script."
}
$osInfo = Get-CimInstance Win32_OperatingSystem
$supported = @("Windows 10", "Windows 11", "Windows Server 2016", "Windows Server 2019", "Windows Server 2022")
if (-not ($supported | Where-Object { $osInfo.Caption -like "*$_*" })) {
    Write-Warning "OS '$($osInfo.Caption)' is not in the officially supported list ($($supported -join ', ')) — continuing anyway."
}

Write-Step "Copying agent files to $InstallDir"
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
Copy-Item -Path "$PSScriptRoot\windows_agent.py" -Destination $InstallDir -Force
Copy-Item -Path "$PSScriptRoot\service_wrapper.py" -Destination $InstallDir -Force
Copy-Item -Path "$PSScriptRoot\requirements.txt" -Destination $InstallDir -Force

Write-Step "Installing Python dependencies (requests, pywin32)"
& python -m pip install --quiet --upgrade pip
& python -m pip install --quiet -r "$InstallDir\requirements.txt"
# pywin32 needs its post-install step to register the pythonservice.exe COM/service hooks.
$pywin32Postinstall = & python -c "import os, win32api; print(os.path.join(os.path.dirname(win32api.__file__), '..', 'Scripts', 'pywin32_postinstall.py'))" 2>$null
if ($pywin32Postinstall -and (Test-Path $pywin32Postinstall)) {
    & python $pywin32Postinstall -install | Out-Null
}

Write-Step "Gathering host inventory"
$cs = Get-CimInstance Win32_ComputerSystem
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch "Loopback" } | Select-Object -First 1 -ExpandProperty IPAddress)

$enrollBody = @{
    enrollment_token = $EnrollToken
    hostname         = $env:COMPUTERNAME
    domain           = $cs.Domain
    os_name          = $osInfo.Caption
    os_version       = $osInfo.Version
    os_edition       = [string]$osInfo.OperatingSystemSKU
    architecture     = $osInfo.OSArchitecture
    ip_address       = $ip
    agent_version    = "1.0.0"
} | ConvertTo-Json

Write-Step "Enrolling with SOC collector at $ServerUrl"
$enrollResponse = Invoke-RestMethod -Uri "$ServerUrl/api/soc/enroll" -Method Post -Body $enrollBody -ContentType "application/json"

$config = @{
    server_url             = $ServerUrl
    api_key                = $enrollResponse.api_key
    asset_id               = $enrollResponse.asset_id
    poll_interval_seconds  = $PollIntervalSeconds
    collector_ip            = $CollectorIp
    channels                = @(
        "Security", "System",
        "Microsoft-Windows-Sysmon/Operational",
        "Microsoft-Windows-PowerShell/Operational"
    )
} | ConvertTo-Json

Set-Content -Path "$DataDir\agent_config.json" -Value $config -Encoding UTF8
Write-Host "Enrolled as asset_id=$($enrollResponse.asset_id), agent_id=$($enrollResponse.agent_id)" -ForegroundColor Green

if ($InstallSysmon) {
    Write-Step "Configuring Sysmon"
    $sysmonExe = Get-Command sysmon64.exe -ErrorAction SilentlyContinue
    if (-not $sysmonExe) {
        $sysmonMsg = "Sysmon is not installed. Download it from https://learn.microsoft.com/sysinternals/downloads/sysmon, " +
            "then run: sysmon64.exe -accepteula -i `"$PSScriptRoot\sysmon_config.xml`""
        Write-Warning $sysmonMsg
    } else {
        & sysmon64.exe -accepteula -c "$PSScriptRoot\sysmon_config.xml"
    }
}

Write-Step "Installing CIRGAgent Windows Service"
& python "$InstallDir\service_wrapper.py" install
& sc.exe failure CIRGAgent reset= 86400 actions= restart/60000/restart/60000/restart/60000 | Out-Null
& sc.exe config CIRGAgent start= auto | Out-Null
& python "$InstallDir\service_wrapper.py" start

Write-Host ""
Write-Host "CIRG agent installed and running as service 'CIRGAgent'." -ForegroundColor Green
Write-Host "Logs: $DataDir\agent.log"
Write-Host "Config: $DataDir\agent_config.json"
