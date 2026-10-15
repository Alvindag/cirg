# Windows Firewall — Enterprise GPO Baseline

Replaces per-machine default Windows Firewall configuration with a
centrally managed, tiered Group Policy baseline: locked local-rule
editing, default-deny inbound, logging on, and a scoped rule set per
machine role (workstation / member server / domain controller).

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first — it explains
why rules are authored-then-imported rather than scripted directly into
a remote GPO, the OU/GPO tiering, and the rollback plan. This is
infrastructure-as-code for policy *content*; the actual GPO link/import
step is a short, repeatable action in GPMC, not something scripted
end-to-end (Windows Firewall GPO rule storage has no supported remote-write
cmdlet — see the architecture doc).

## What this changes vs. the Windows default

- **Local rule merge is disabled.** This is the actual "stop using the
  default" change — without it, a local admin or malware with local
  admin rights can add firewall exceptions that survive policy refresh.
- Default inbound stays Block (same as Windows' own default), but it's
  now GPO-enforced instead of locally overridable.
- Logging (allowed + blocked) turned on for every profile.
- A scoped rule set per tier, with every management/file-sharing rule
  restricted by `RemoteAddress` to the subnet that actually needs it —
  nothing is left open to "Any."

## Quick start

1. **Narrow the RPC dynamic port range** on affected servers/DCs first
   (see architecture doc) — note the range for step 2.
2. On a disposable reference VM for the tier you're building:
   ```powershell
   .\scripts\Build-FirewallBaseline.ps1 -Tier Workstation `
       -ManagementSubnet "10.0.5.0/24" -HelpdeskSubnet "10.0.6.0/24"
   ```
   (See the script's comment-based help for the Server/DomainController
   parameter sets — they need `-CorpSubnets` and `-RpcPortRange` too.)
3. Copy the resulting `.wfw` to a GPMC machine, import into the
   matching `Firewall-Baseline-<Tier>` GPO (Computer Configuration >
   Policies > Windows Settings > Security Settings > Windows Firewall
   with Advanced Security > right-click root > Import Policy).
4. Run `.\scripts\New-WmiFilters.ps1` once per domain, attach the
   matching filter to each tier GPO (GPO > Scope tab > WMI Filtering).
5. Link GPOs to a **pilot** sub-OU first. After `gpupdate /force` on the
   pilot machines:
   ```powershell
   .\scripts\Test-FirewallBaseline.ps1 -ComputerName PILOT-WS01 -ProbePorts
   ```
6. Expand OU scope gradually, re-validating at each stage.

## Repo layout

```
rules/
  common.rules.ps1            # every tier: DHCP, DNS, ICMP, time
  management.rules.ps1        # every tier: WinRM, RDP, RPC - scoped to mgmt subnet
  workstation.rules.ps1       # Workstation tier only
  server.rules.ps1            # Server + DomainController tiers
  domain-controller.rules.ps1 # DomainController tier only
scripts/
  Build-FirewallBaseline.ps1  # author + export a .wfw for one tier
  New-WmiFilters.ps1          # create OS-role WMI filters in AD
  Test-FirewallBaseline.ps1   # validate effective policy post-rollout
docs/ARCHITECTURE.md
```

## Known limitations

- Rule manifests use string placeholder tokens (`<MANAGEMENT_SUBNET>`
  etc.) resolved at build time, not a real templating engine — keep
  manifests simple rather than adding conditional logic to them.
- `New-WmiFilters.ps1` writes `msWMI-Som` objects directly via ADSI
  since RSAT has no dedicated cmdlet for WMI filters; verify the
  created filters in GPMC after running it on a domain you haven't used
  this on before.
- Server-role-specific ports (SQL, IIS, LOB apps) are deliberately not
  included — add them as separate overlay GPOs per server role rather
  than growing `server.rules.ps1` into an unmaintainable list.
