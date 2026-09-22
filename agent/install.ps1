#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Installs the CIRG Enterprise Security Operations agent on a Windows 10,
    Windows 11, or Windows Server 2016+ endpoint: enrolls with the SOC
    collector, installs Python dependencies, drops the agent as a Windows
    Service, and (optionally) deploys the recommended Sysmon configuration.

    Safe to run repeatedly, including as a GPO computer startup script that
    fires on every boot: if the endpoint is already enrolled and the
    CIRGAgent service is installed, the script logs that and exits
    immediately without re-enrolling or minting a new API key. Use -Force
    to re-enroll anyway (e.g. after a machine was re-imaged and its old
    agent_config.json/API key are no longer valid).

.EXAMPLE
    .\install.ps1 -ServerUrl "https://cirg.example.org:5001" -EnrollToken "abc123..."

.EXAMPLE
    .\install.ps1 -ServerUrl "https://cirg.example.org:5001" -EnrollToken "abc123..." -InstallSysmon

.EXAMPLE
    # GPO computer startup script, with a multi-use token generated via
    # POST /api/soc/enroll/token {"max_uses": 200, "ttl_hours": 72}
    .\install.ps1 -ServerUrl "https://cirg.example.org:5001" -EnrollToken "<shared token>" -InstallSysmon

.NOTES
    Exit codes (useful for GPO/SCCM failure detection):
      0 = success, or already enrolled and skipped
      1 = enrollment/installation failed — see the log for details
    Log: %ProgramData%\CIRG\install.log (appended on every run)
#>

param(
    [Parameter(Mandatory = $true)][string]$ServerUrl,
    [Parameter(Mandatory = $true)][string]$EnrollToken,
    [string]$InstallDir = "$Env:ProgramFiles\CIRG-Agent",
    [string]$CollectorIp,
    [switch]$InstallSysmon,
    [switch]$Force,
    [int]$PollIntervalSeconds = 30
)

$ErrorActionPreference = "Stop"
$DataDir = "$Env:ProgramData\CIRG"
$ConfigPath = "$DataDir\agent_config.json"
$LogPath = "$DataDir\install.log"

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
Start-Transcript -Path $LogPath -Append | Out-Null

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }

try {
    Write-Step "Run started $(Get-Date -Format o) on $env:COMPUTERNAME"

    # -----------------------------------------------------------------
    # Idempotency: a GPO computer startup script runs on every reboot, so
    # this script must never blindly re-enroll — that would mint a new API
    # key and create a duplicate asset record on the server for the same
    # physical machine, every single restart.
    #
    # When already enrolled, the default behavior is a lightweight REFRESH:
    # re-copy the agent files (so GPO keeps the fleet's code current) and
    # restart the service, but skip re-enrollment entirely (no new token
    # use, no duplicate asset). -Force instead does a full re-enrollment —
    # use it only when this machine's identity is actually broken (e.g.
    # re-imaged, or its asset/API key was deleted server-side).
    # -----------------------------------------------------------------
    $existingService = Get-Service -Name CIRGAgent -ErrorAction SilentlyContinue
    $alreadyEnrolled = (Test-Path $ConfigPath) -and $existingService
    $VenvPython = "$InstallDir\venv\Scripts\python.exe"

    if ($alreadyEnrolled -and -not $Force) {
        Write-Step "Already enrolled — refreshing agent files and service only (no re-enrollment). Use -Force to re-enroll."
        New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
        Copy-Item -Path "$PSScriptRoot\windows_agent.py" -Destination $InstallDir -Force
        Copy-Item -Path "$PSScriptRoot\service_wrapper.py" -Destination $InstallDir -Force
        Copy-Item -Path "$PSScriptRoot\requirements.txt" -Destination $InstallDir -Force
        & $VenvPython -m pip install --quiet -r "$InstallDir\requirements.txt"

        if ($existingService.Status -eq "Running") {
            & $VenvPython "$InstallDir\service_wrapper.py" restart
        } else {
            Start-Service -Name CIRGAgent
        }
        Write-Host "Refresh complete." -ForegroundColor Green
        Stop-Transcript | Out-Null
        exit 0
    }
    if ($Force) {
        Write-Step "-Force specified: re-enrolling and reinstalling regardless of current state"
    }

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
    Copy-Item -Path "$PSScriptRoot\windows_agent.py" -Destination $InstallDir -Force
    Copy-Item -Path "$PSScriptRoot\service_wrapper.py" -Destination $InstallDir -Force
    Copy-Item -Path "$PSScriptRoot\requirements.txt" -Destination $InstallDir -Force

    # A dedicated venv (rather than the shared system Python on PATH) keeps
    # the agent's dependencies isolated from anything else installed on the
    # domain-joined machine, and gives antivirus/EDR products one precise,
    # predictable python.exe path to scope a trust exclusion to — see
    # README.md's "Kaspersky / antivirus compatibility" section.
    if (-not (Test-Path $VenvPython)) {
        Write-Step "Creating isolated virtual environment at $InstallDir\venv"
        & python -m venv "$InstallDir\venv"
        if ($LASTEXITCODE -ne 0) { throw "python -m venv failed with exit code $LASTEXITCODE" }
    }

    Write-Step "Installing Python dependencies (requests, pywin32) into the venv"
    & $VenvPython -m pip install --quiet --upgrade pip
    & $VenvPython -m pip install --quiet -r "$InstallDir\requirements.txt"
    if ($LASTEXITCODE -ne 0) { throw "pip install failed with exit code $LASTEXITCODE" }
    # pywin32 needs its post-install step to register the pythonservice.exe COM/service hooks.
    $pywin32Postinstall = & $VenvPython -c "import os, win32api; print(os.path.join(os.path.dirname(win32api.__file__), '..', 'Scripts', 'pywin32_postinstall.py'))" 2>$null
    if ($pywin32Postinstall -and (Test-Path $pywin32Postinstall)) {
        & $VenvPython $pywin32Postinstall -install | Out-Null
    }

    Write-Step "Gathering host inventory"
    $cs = Get-CimInstance Win32_ComputerSystem
    $ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch "Loopback" } | Select-Object -First 1 -ExpandProperty IPAddress)

    if (-not $CollectorIp) {
        try {
            $serverHost = ([Uri]$ServerUrl).Host
            $resolved = [System.Net.Dns]::GetHostAddresses($serverHost) | Select-Object -First 1
            if ($resolved) {
                $CollectorIp = $resolved.IPAddressToString
                Write-Step "Auto-resolved collector IP for isolate_host: $CollectorIp"
            }
        } catch {
            $dnsWarnMsg = "Could not auto-resolve the collector's IP from $ServerUrl. isolate_host will fall back to " +
                "resolving it at isolation time; if that also fails, host isolation will refuse to run rather than " +
                "isolate unsafely. Pass -CollectorIp explicitly to avoid relying on DNS during an incident."
            Write-Warning $dnsWarnMsg
        }
    }

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

    Set-Content -Path $ConfigPath -Value $config -Encoding UTF8
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
    if ($existingService) {
        & $VenvPython "$InstallDir\service_wrapper.py" update
    } else {
        & $VenvPython "$InstallDir\service_wrapper.py" install
    }
    if ($LASTEXITCODE -ne 0) { throw "service_wrapper.py install/update failed with exit code $LASTEXITCODE" }
    & sc.exe failure CIRGAgent reset= 86400 actions= restart/60000/restart/60000/restart/60000 | Out-Null
    & sc.exe config CIRGAgent start= auto | Out-Null
    & $VenvPython "$InstallDir\service_wrapper.py" restart

    Write-Host ""
    Write-Host "CIRG agent installed and running as service 'CIRGAgent'." -ForegroundColor Green
    Write-Host "Logs: $DataDir\agent.log"
    Write-Host "Config: $ConfigPath"
    Stop-Transcript | Out-Null
    exit 0

} catch {
    Write-Host "INSTALL FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace
    Stop-Transcript | Out-Null
    exit 1
}
