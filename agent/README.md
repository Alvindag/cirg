# CIRG Windows Agent

Endpoint agent for the CIRG Enterprise Security Operations platform.
Supported on **Windows 10**, **Windows 11**, and **Windows Server 2016+**.

It collects Windows Event Log / Sysmon / PowerShell telemetry, forwards it
to the CIRG collector over HTTPS, sends heartbeats, and executes remediation
actions issued from the SOC dashboard (host isolation, process termination,
IP blocking, file quarantine, local-account disable, triage collection,
Defender scans).

## Prerequisites on the target endpoint

- Python 3.10+ on `PATH`
- PowerShell 5.1+ (built in to all supported OS versions)
- Administrator/elevated PowerShell session for installation
- Network reachability to the CIRG server's `CIRG_PORT` (default 5001)
- Recommended: [Sysmon](https://learn.microsoft.com/sysinternals/downloads/sysmon)
  installed with `sysmon_config.xml` for process/network/credential-access
  telemetry. Without Sysmon, the agent still collects native Security/System/
  PowerShell event logs, just with less detail on process ancestry and
  network connections.

## Installation

1. On the CIRG dashboard, an admin or analyst generates a one-time
   enrollment token:
   `POST /api/soc/enroll/token` (see the dashboard's Assets → Enroll Endpoint
   button, or call the API directly).

2. Copy this `agent/` directory to the target Windows host (or clone the
   repo there), then run, in an **elevated** PowerShell prompt:

   ```powershell
   .\install.ps1 -ServerUrl "https://cirg.example.org:5001" `
                 -EnrollToken "<token from step 1>" `
                 -InstallSysmon
   ```

   This will:
   - Verify Python and OS compatibility
   - Install `requests`/`pywin32` and copy the agent to
     `%ProgramFiles%\CIRG-Agent`
   - Call `/api/soc/enroll` to register the endpoint and mint its API key
   - Write `%ProgramData%\CIRG\agent_config.json`
   - Install and start the `CIRGAgent` Windows Service (auto-restart on
     failure, starts automatically on boot)
   - Optionally deploy `sysmon_config.xml` if Sysmon is present

3. Verify: the endpoint should appear as `online` under **Assets** on the
   dashboard within one heartbeat interval (default 30s).

## Mass deployment

For fleet rollout, push `install.ps1` plus a per-batch enrollment token via
your existing configuration management (GPO startup script, Intune/MECM
Win32 app, or a PowerShell remoting loop over `Invoke-Command`). Generate a
fresh enrollment token per batch — tokens are single-use and expire after
`ENROLLMENT_TOKEN_TTL_HOURS` (default 24h).

## Uninstall

```powershell
python "%ProgramFiles%\CIRG-Agent\service_wrapper.py" stop
python "%ProgramFiles%\CIRG-Agent\service_wrapper.py" remove
Remove-Item -Recurse -Force "$Env:ProgramFiles\CIRG-Agent"
Remove-Item -Recurse -Force "$Env:ProgramData\CIRG"
```

The corresponding asset record on the server is not deleted automatically —
mark it `decommissioned` via `PATCH /api/soc/assets/<id>` or remove it from
the database if it should no longer count toward licensing/inventory.

## Troubleshooting

- Logs: `%ProgramData%\CIRG\agent.log`
- Config: `%ProgramData%\CIRG\agent_config.json`
- Collection state (per-channel bookmarks): `%ProgramData%\CIRG\agent_state.json`
- Test a single collection cycle without installing the service:
  `python windows_agent.py --once`
- Service status: `Get-Service CIRGAgent`

## Security notes

- The agent's API key (in `agent_config.json`) authenticates it to the
  collector and should be protected with filesystem ACLs
  (`%ProgramData%\CIRG` is created with default inherited permissions —
  restrict to `SYSTEM` and local Administrators in high-security
  environments).
- `isolate_host` and `disable_local_user` are high-impact actions restricted
  to `admin`/`analyst` dashboard roles; review your SOC user list
  accordingly.
- Enrollment tokens are single-use and time-limited specifically so a leaked
  token cannot be replayed to enroll rogue endpoints.
