# CIRG Windows Agent

Endpoint agent for the CIRG Enterprise Security Operations platform.
Supported on **Windows 10**, **Windows 11**, and **Windows Server 2016+**.

It collects Windows Event Log / Sysmon / PowerShell telemetry, forwards it
to the CIRG collector over HTTPS, sends heartbeats, and executes remediation
actions issued from the SOC dashboard (host isolation, process termination,
IP blocking, file quarantine, local-account disable, triage collection,
Defender scans).

## Prerequisites on the target endpoint

- Python 3.10+ on `PATH` (used only to create the agent's own isolated
  virtual environment — see below; nothing else on the box needs to use it)
- PowerShell 5.1+ (built in to all supported OS versions)
- Administrator/elevated PowerShell session for installation
- Network reachability to the CIRG server's `CIRG_PORT` (default 5001)
- Recommended: [Sysmon](https://learn.microsoft.com/sysinternals/downloads/sysmon)
  installed with `sysmon_config.xml` for process/network/credential-access
  telemetry. Without Sysmon, the agent still collects native Security/System/
  PowerShell event logs, just with less detail on process ancestry and
  network connections.

## Installation (single endpoint)

1. On the CIRG dashboard, an admin or analyst generates an enrollment
   token: `POST /api/soc/enroll/token` (see the dashboard's Assets → Enroll
   Endpoint button, or call the API directly). By default the token is
   single-use; for fleet rollout via GPO, see **Mass deployment** below.

2. Copy this `agent/` directory to the target Windows host (or clone the
   repo there), then run, in an **elevated** PowerShell prompt:

   ```powershell
   .\install.ps1 -ServerUrl "https://cirg.example.org:5001" `
                 -EnrollToken "<token from step 1>" `
                 -InstallSysmon
   ```

   This will:
   - Verify Python and OS compatibility
   - Create an isolated virtual environment at
     `%ProgramFiles%\CIRG-Agent\venv` and install `requests`/`pywin32`
     into it (kept separate from any other Python on the machine)
   - Call `/api/soc/enroll` to register the endpoint and mint its API key
   - Auto-resolve and store the collector's IP address (for reliable
     `isolate_host` behavior — see **Security notes**)
   - Write `%ProgramData%\CIRG\agent_config.json`
   - Install and start the `CIRGAgent` Windows Service (auto-restart on
     failure, starts automatically on boot)
   - Optionally deploy `sysmon_config.xml` if Sysmon is present

3. Verify: the endpoint should appear as `online` under **Assets** on the
   dashboard within one heartbeat interval (default 30s).

`install.ps1` is safe to run repeatedly. If the endpoint is already
enrolled (config + service both present), a re-run just refreshes the agent
files and restarts the service — it does **not** re-enroll, mint a new API
key, or create a duplicate asset. Pass `-Force` to force a full
re-enrollment (e.g. after re-imaging a machine).

## Mass deployment via Group Policy (GPO)

See [`GPO_DEPLOYMENT.md`](GPO_DEPLOYMENT.md) for the full walkthrough:
generating a multi-use enrollment token, staging the agent on a NETLOGON
share, configuring a computer startup script, and Kaspersky policy
exclusions for a KSC-managed fleet.

Short version: generate a token with `max_uses` set to your OU's machine
count (or `null` for unlimited within its expiry), e.g.:

```
POST /api/soc/enroll/token
{"max_uses": 200, "ttl_hours": 72, "label": "GPO rollout - Finance OU"}
```

Then point a GPO computer startup script at `install.ps1` with that shared
token. Because the script is idempotent (see above), it's safe to let it
run on every boot indefinitely — first boot enrolls, every boot after that
just refreshes the agent code and confirms the service is running.

## Uninstall

```powershell
$VenvPython = "$Env:ProgramFiles\CIRG-Agent\venv\Scripts\python.exe"
& $VenvPython "$Env:ProgramFiles\CIRG-Agent\service_wrapper.py" stop
& $VenvPython "$Env:ProgramFiles\CIRG-Agent\service_wrapper.py" remove
Remove-Item -Recurse -Force "$Env:ProgramFiles\CIRG-Agent"
Remove-Item -Recurse -Force "$Env:ProgramData\CIRG"
```

The corresponding asset record on the server is not deleted automatically —
mark it `decommissioned` via `PATCH /api/soc/assets/<id>` or remove it from
the database if it should no longer count toward licensing/inventory.

## Troubleshooting

- Install log (every run, appended): `%ProgramData%\CIRG\install.log`
- Agent runtime log: `%ProgramData%\CIRG\agent.log`
- Config: `%ProgramData%\CIRG\agent_config.json`
- Collection state (per-channel bookmarks): `%ProgramData%\CIRG\agent_state.json`
- Test a single collection cycle without installing the service:
  `& "%ProgramFiles%\CIRG-Agent\venv\Scripts\python.exe" windows_agent.py --once`
- Service status: `Get-Service CIRGAgent`
- `install.ps1` exit codes: `0` = success or already-enrolled skip/refresh,
  `1` = failure (check `install.log` for the error) — useful for GPO/SCCM
  deployment-failure detection.

## Kaspersky / antivirus compatibility

The agent's normal behavior — a Python process launching short PowerShell
commands, creating/removing Windows Firewall rules during host isolation,
disabling local accounts, terminating processes, and running as a Windows
Service that phones home over HTTPS — overlaps heavily with what
behavioral AV/EDR engines (including Kaspersky Endpoint Security's System
Watcher / Behavior Detection component) are specifically built to flag. Left
unaddressed, this can cause KES to quarantine the agent, block its firewall
changes, or kill its service outright. Rather than disabling protection
components, scope a **tight, minimal trust exclusion**:

1. **Isolate the interpreter.** `install.ps1` already does this: dependencies
   install into a private venv at `%ProgramFiles%\CIRG-Agent\venv`, so there
   is exactly one `python.exe` this agent ever runs as — not the shared
   system Python other line-of-business tools might use. This lets you scope
   an exclusion narrowly instead of trusting all Python on the machine.

2. **Add a Trusted Applications rule in Kaspersky Security Center** (Policy
   → Threats and Exclusions → Trusted zone → Applications), scoped to:
   - Path: `%ProgramFiles%\CIRG-Agent\venv\Scripts\python.exe`
   - Enable: "Do not scan opened files," "Do not monitor application
     activity" (equivalent to disabling Behavior Detection/System Watcher
     for this specific process — not a global exclusion)
   - Leave "Do not scan network traffic" **off** unless you also need to
     exempt the agent from SSL/TLS inspection (see point 4)

3. **Add a folder exclusion** for `%ProgramFiles%\CIRG-Agent\` and
   `%ProgramData%\CIRG\` under File Threat Protection → Exclusions, so
   on-access scanning doesn't repeatedly re-scan the venv's installed
   packages or the agent's log/state files.

4. **Network/TLS inspection**: if KES's Network Threat Protection performs
   TLS inspection with its own root CA, either exempt the CIRG collector's
   hostname/IP:port from inspection, or ensure the collector's certificate
   chain (real or internal-CA) is trusted by the agent's Python `requests`/
   `certifi` trust store — otherwise HTTPS calls to the collector will fail
   with a TLS verification error that looks identical to a network outage.

5. **Do not** exclude `python.exe` by name/hash globally, exclude all of
   `C:\Program Files\`, or disable KES modules system-wide to work around
   this — that defeats the purpose of running an AV/EDR product at all. The
   scoped exclusions above give the agent room to operate while leaving
   Kaspersky's protection intact for everything else on the box.

6. **Code signing** (recommended for production rollout): signing
   `install.ps1` and the packaged agent with your organization's internal
   code-signing certificate meaningfully reduces false-positive risk —
   signed, reputable binaries are weighted very differently by both KES's
   heuristics and its cloud reputation lookups (KSN) than unsigned ones.
   This isn't set up out of the box; if you have an internal PKI/CA, sign
   `install.ps1` with `Set-AuthenticodeSignature` before distributing it via
   GPO, and consider packaging `windows_agent.py`/`service_wrapper.py` as a
   signed executable (e.g. via PyInstaller + `signtool`) rather than
   shipping raw `.py` files.

See `GPO_DEPLOYMENT.md` for how to roll these exclusions out via KSC policy
alongside the GPO computer startup script, so every enrolled endpoint gets
them automatically rather than one at a time.

## Security notes

- The agent's API key (in `agent_config.json`) authenticates it to the
  collector and should be protected with filesystem ACLs
  (`%ProgramData%\CIRG` is created with default inherited permissions —
  restrict to `SYSTEM` and local Administrators in high-security
  environments).
- `isolate_host` and `disable_local_user` are high-impact actions restricted
  to `admin`/`analyst` dashboard roles; review your SOC user list
  accordingly.
- `isolate_host` requires a resolvable collector IP to carve a firewall
  exception (Windows Firewall block rules otherwise win over allow rules
  regardless of specificity). `install.ps1` auto-resolves and stores this at
  install time; the agent re-resolves it at isolation time as a fallback.
  If neither can resolve it, the action **fails closed** — it refuses to
  isolate rather than either stranding the agent from its own collector or,
  worse, silently isolating nothing.
- Enrollment tokens are time-limited and, by default, single-use, so a
  leaked token can't be replayed to enroll rogue endpoints. Multi-use
  tokens (`max_uses` > 1) exist specifically for GPO fleet rollout — treat
  them with the same care as a shared credential and let them expire once
  the rollout is done rather than leaving them open-ended.
