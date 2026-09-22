# Deploying the CIRG agent fleet-wide via Group Policy

This walks through rolling `install.ps1` out to an entire OU as a computer
startup script, with a Kaspersky-managed environment in mind. It assumes an
Active Directory domain and a CIRG server already reachable from the target
OU.

## 1. Generate a multi-use enrollment token

Single-use tokens (the default) exist for enrolling one machine at a time.
For a GPO rollout, every machine in the OU will present the *same* token
when its startup script runs, so generate one sized to the rollout:

```powershell
Invoke-RestMethod -Uri "https://cirg.example.org:5001/api/soc/enroll/token" `
  -Method Post -Headers @{Authorization = "Bearer <your dashboard JWT>"} `
  -ContentType "application/json" `
  -Body '{"max_uses": 250, "ttl_hours": 72, "label": "GPO rollout - Finance OU"}'
```

- `max_uses`: set to (at least) the number of machines in the target OU.
  Use `null` for unlimited uses within the expiry window if the OU's size
  is fluid (new machines joining mid-rollout).
- `ttl_hours`: long enough to cover the rollout window — machines that are
  off or unreachable during the initial push will still pick it up on their
  next boot within this window. 72h (3 days) covers most reboot cadences;
  extend it for OUs with machines that stay suspended/hibernated longer.
- `label`: purely for your own bookkeeping — shows up when listing tokens.

Treat the resulting token like a shared credential: anyone with it and
network access to the CIRG server can enroll a rogue endpoint until it
expires or is exhausted. Don't post it anywhere outside the GPO script
itself, and let it expire naturally rather than generating it far in
advance of when you'll actually use it.

## 2. Stage the agent on a distribution share

Copy the `agent/` directory to your domain's NETLOGON share (replicated to
every DC, so it's reachable from any site) or another read-access-controlled
share:

```powershell
Copy-Item -Recurse "C:\cirg\agent" "\\yourdomain.local\NETLOGON\CIRG-Agent"
```

Restrict write access on that share to your deployment admins — anyone who
can modify `install.ps1` or `windows_agent.py` on the share can push
arbitrary code to every machine that runs the startup script.

## 3. Create the GPO

1. **Group Policy Management Console** → right-click the target OU → *Create
   a GPO in this domain, and link it here*. Name it something like
   `CIRG Agent Deployment`.
2. Edit the GPO → **Computer Configuration** → **Policies** → **Windows
   Settings** → **Scripts (Startup/Shutdown)** → **Startup** → **PowerShell
   Scripts** tab → **Add**.
3. **Script Name**:
   `\\yourdomain.local\NETLOGON\CIRG-Agent\install.ps1`
4. **Script Parameters**:
   ```
   -ServerUrl "https://cirg.example.org:5001" -EnrollToken "<token from step 1>" -InstallSysmon
   ```
5. Startup scripts run as `NT AUTHORITY\SYSTEM`, which satisfies
   `install.ps1`'s `#Requires -RunAsAdministrator` — no separate elevation
   setup needed.
6. Leave PowerShell script execution ordered *before* any non-PowerShell
   startup scripts if you have others (Group Policy's script ordering tab),
   though this rarely matters here since `install.ps1` doesn't depend on
   other startup scripts.

## 4. Execution policy

GPO-triggered startup scripts run through the Group Policy Script Execution
engine, not an interactively-invoked `powershell.exe`, so the local/user
`Set-ExecutionPolicy` setting on each machine is normally irrelevant here.
If your domain enforces script execution policy via a separate
**Computer Configuration → Administrative Templates → System → Scripts**
policy (or a `Turn on Script Execution` setting under PowerShell), make sure
it allows at least `RemoteSigned` for local Group Policy scripts, or
`AllSigned` if you've signed `install.ps1` per the code-signing
recommendation in `README.md`.

## 5. Kaspersky Security Center policy exclusions

If your environment uses **Kaspersky Security Center (KSC)** for
centralized policy, push the exclusions from `README.md`'s "Kaspersky /
antivirus compatibility" section as policy, rather than configuring them
machine-by-machine:

1. KSC console → **Policies** → your Kaspersky Endpoint Security policy for
   the target OU (or create a policy scoped to it) → **Threats and
   Exclusions**.
2. **Trusted zone → Applications** → add:
   - Path: `%ProgramFiles%\CIRG-Agent\venv\Scripts\python.exe`
   - Scope: "Do not scan opened files," "Do not monitor application
     activity" — leave everything else (network scanning, etc.) as-is
     unless you also need the TLS-inspection exemption below.
3. **File Threat Protection → Exclusions** → add folder exclusions for
   `%ProgramFiles%\CIRG-Agent\` and `%ProgramData%\CIRG\`.
4. If KES performs TLS inspection: **Network Threat Protection →
   Encrypted connections scan → Exclusions** → add the CIRG server's
   hostname/IP and port `5001` (or your TLS-terminating reverse proxy's
   port, if you front it with one).
5. Apply the policy to the same OU (or a security group covering it) that
   the GPO targets, and force a policy sync (`Kaspersky Security Center` →
   right-click the OU → **Force synchronization**) so it lands before or
   alongside the next reboot that triggers the startup script.

Push this policy *before* or *at the same time as* the GPO — if the agent's
first boot happens before the KSC exclusion has propagated, KES may flag
and quarantine parts of the install before the exclusion takes effect,
requiring a manual restore.

## 6. Verify the rollout

- **Group Policy side**: `gpresult /r` on a test machine confirms the GPO
  applied; `gpupdate /force` + reboot (or `Invoke-GPUpdate -Computer <name>
  -Force` remotely) to trigger it without waiting for the next natural
  reboot cycle.
- **CIRG side**: watch the dashboard's **Assets** tab — enrolled machines
  should appear as `online` within a heartbeat interval (30s default) of
  their first boot after the GPO applies. The `Assets → Enroll Endpoint`
  token page also shows use-count for the token you generated in step 1, so
  you can track rollout progress against the OU's total machine count.
- **Per-machine troubleshooting**: `%ProgramData%\CIRG\install.log` on any
  machine that didn't enroll — it's appended on every run (including every
  boot after the first, for the lightweight refresh path), so it also
  doubles as a health check that the startup script is actually firing.

## 7. Ongoing operation

Once rolled out, leave the GPO in place indefinitely rather than removing
it after the initial push:

- Every subsequent boot re-runs `install.ps1`, which (per its idempotency
  design) does a fast refresh-and-restart on already-enrolled machines —
  this keeps the fleet's agent code current automatically whenever you
  update the files on the NETLOGON share, with no re-enrollment overhead.
- New machines joining the OU enroll automatically on their first boot,
  as long as the enrollment token from step 1 hasn't expired or been
  exhausted — rotate to a fresh token (update the GPO's script parameters)
  before that happens if you expect ongoing machine additions.
- If a machine needs to be force re-enrolled (re-imaged, its asset record
  was deleted server-side, its API key was revoked), add `-Force` to that
  one machine's local run rather than to the GPO — a fleet-wide `-Force`
  would re-enroll every machine and create a duplicate asset for each one
  that's currently healthy.
