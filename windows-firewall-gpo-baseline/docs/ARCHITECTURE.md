# Architecture: GPO-Managed Windows Firewall Baseline

## Why not just edit the firewall locally

Local Windows Firewall configuration (Control Panel, `wf.msc`, or ad hoc
`netsh`/PowerShell on each box) has three problems at scale: it drifts the
moment someone "temporarily" opens a port and forgets, it isn't audited or
version-controlled, and it's enforced per-machine instead of per-role, so
a workstation and a domain controller end up with whatever defaults
Windows shipped with. Moving configuration into Group Policy makes the
firewall policy centrally managed, auditable (it's a GPO, so AD's own
change history and the SYSVOL replication log apply), and able to differ
by machine role without touching each machine by hand.

## Why rules aren't managed as plain text in a GPO

Windows Firewall *profile settings* (enabled/disabled, default
inbound/outbound action, logging, local-rule-merge behavior) live as
ordinary registry values inside a GPO's `Registry.pol` and are trivially
scriptable. Firewall *rules*, however, are stored in a GPO as a
multi-valued string blob in a specific internal format, and there is no
supported cmdlet to write that blob into a *remote* GPO directly from
PowerShell — `New-NetFirewallRule -PolicyStore <GPO>` only works for a
domain-joined GPO policy store in narrow scenarios and is not the
Microsoft-recommended path for this.

The supported, repeatable path is:

1. **Author** the full rule set on a disposable reference VM using the
   same `New-NetFirewallRule`/`Set-NetFirewallProfile` cmdlets you'd use
   locally (`scripts/Build-FirewallBaseline.ps1`).
2. **Export** that machine's resulting policy with `netsh advfirewall
   export` to a `.wfw` file — this captures both the profile settings
   and every rule in the one supported interchange format.
3. **Import** the `.wfw` into the target GPO via Group Policy Management
   Editor's native "Windows Firewall with Advanced Security > Import
   Policy" action. This writes the GPO's `Registry.pol` and the firewall
   rule blob correctly, because it's the same code path GPMC itself uses.

This keeps the source of truth (the build script + rule manifests in
`rules/*.rules.ps1`) in git, while the actual GPO import step stays a
short, auditable, repeatable GPMC action instead of hand-editing rules in
the UI every time something changes.

## OU and GPO tiering

```
Domain root
├── GPO: Firewall-Baseline-Common        (linked at domain root)
│     Profile settings only: enabled, default-inbound=Block,
│     default-outbound=Allow, logging on, local rule merge OFF.
│     No rules. This is what actually replaces "the default."
│
├── OU: Workstations
│     GPO: Firewall-Baseline-Workstations  (WMI filter: OS-Workstation)
│
├── OU: Servers
│     GPO: Firewall-Baseline-Servers       (WMI filter: OS-MemberServer)
│     (add role-specific overlay GPOs here per server role as needed -
│      SQL, IIS, etc. - rather than growing server.rules.ps1 indefinitely)
│
└── OU: Domain Controllers
      GPO: Firewall-Baseline-DomainControllers (WMI filter: OS-DomainController)
```

Splitting the common profile settings into their own GPO, linked once at
the domain root, means a change to "turn on logging everywhere" is one
edit instead of three. Tier-specific GPOs only carry the port rules for
that role. `scripts/New-WmiFilters.ps1` creates the three WMI filters;
attach each to its GPO from the GPO's Scope tab.

Security filtering on each GPO should stay at "Authenticated Users" (or
"Domain Computers") — do not scope firewall GPOs by *user* security
group, since the policy applies at computer startup regardless of who
logs in.

## Profile baseline (what replaces "the default")

| Setting | Default Windows behavior | This baseline |
|---|---|---|
| Firewall state | On (all profiles) | On (all profiles) — unchanged, but now enforced via GPO so a user/admin can't disable it locally |
| Default inbound action | Block | Block — same default, but now GPO-enforced instead of locally-overridable |
| Default outbound action | Allow | Allow (see "Outbound filtering" below for the stricter alternative) |
| **Local rule merge** | **Allowed** | **Disabled** (`AllowLocalFirewallRules = False`) — this is the actual behavior change: a local admin or malware with local admin rights can no longer add firewall exceptions that survive policy refresh |
| Local IPsec rule merge | Allowed | Disabled |
| Notifications on blocked listen | On | Off — avoids training users to click through firewall prompts |
| Logging (allowed + blocked) | Off | On, 16 MB per profile, dedicated log file |

Disabling local rule merge is the single highest-value change here: it's
what makes "managed via GPO instead of the default" actually true,
rather than just adding more rules on top of a still-locally-editable
firewall.

## Rule categories

- **`common.rules.ps1`** — DHCP, DNS client responses, ICMP (scoped to
  the management subnet, not world-pingable), time sync. Applied to
  every tier.
- **`management.rules.ps1`** — WinRM, RDP, RPC endpoint mapper + a
  *narrowed* dynamic RPC range. Applied to every tier. Every rule here
  is scoped by `RemoteAddress` to the management subnet — this is the
  biggest lateral-movement surface on a flat, unscoped network, so it
  gets the tightest scoping in the whole baseline.
- **`workstation.rules.ps1`** — minimal: a scoped helpdesk RDP/remote
  assistance rule, and an explicit (documented) block for Network
  Discovery, which is off by default.
- **`server.rules.ps1`** — SMB/print spooler scoped to actual client
  subnets, a backup-agent placeholder. Role-specific ports (SQL 1433,
  IIS 443, etc.) belong in a separate overlay GPO per role, not here.
- **`domain-controller.rules.ps1`** — the documented AD DS port set
  (Kerberos, LDAP/LDAPS, Global Catalog, DFSR, RPC with a narrowed
  range) per Microsoft's published AD DS network port requirements.

Every `RemoteAddress`-scoped rule uses a `<PLACEHOLDER>` token resolved
by `Build-FirewallBaseline.ps1` parameters — nothing in this baseline is
left open to "Any" for inbound management or file-sharing traffic.

## Narrowing the RPC dynamic port range

Both the DC and management rule sets reference a narrowed RPC range
rather than opening the full ephemeral port space (49152-65535 by
default) inbound. Before building the DC/Server baseline, run on each
affected machine (or better, via its own small GPO using a Group Policy
Preference registry item, since this is a per-machine TCP/IP stack
setting, not a firewall setting):

```
netsh int ipv4 set dynamicport tcp startport=49152 numberofports=500
netsh int ipv6 set dynamicport tcp startport=49152 numberofports=500
```

Then pass the matching range to `-RpcPortRange "49152-49651"`. Pick a
range wide enough for your server's actual concurrent RPC usage —
500 ports is a reasonable starting point for most member servers; domain
controllers under heavy load may need more. Test in the pilot OU before
rolling out narrower than Microsoft's default.

## Deployment workflow

1. Stand up a disposable reference VM in a test OU, matching the tier
   you're building (a plain Windows 11 VM for Workstation, etc.).
2. Run `Build-FirewallBaseline.ps1` with the real subnet/range values
   for your environment. Review the console output for any
   "unresolved placeholder" warnings before proceeding.
3. Copy the resulting `.wfw` to a GPMC machine, import into the
   matching `Firewall-Baseline-<Tier>` GPO.
4. Run `New-WmiFilters.ps1` once per domain (idempotent), attach each
   filter to its GPO.
5. Link the tier GPOs to their OUs. Link `Firewall-Baseline-Common` at
   the domain root (or at least high enough to cover all three tiers).
6. **Pilot first.** Move a handful of non-critical machines per tier
   into a pilot sub-OU, `gpupdate /force`, then run
   `Test-FirewallBaseline.ps1 -ComputerName <pilot machines> -ProbePorts`
   from both inside and outside the management subnet to confirm
   scoping is correct before wider rollout.
7. Expand OU scope gradually, re-running the test script at each stage.

## Rollback plan

Each tier's rollback is "unlink the GPO" (Group Policy Management >
right-click the GPO link > uncheck Link Enabled) or "disable the GPO
link" — this reverts affected machines to whatever GPOs apply next,
typically back toward local defaults within one policy refresh cycle.
Keep the previous `.wfw` export alongside each new one in git history so
a specific prior state can be re-imported, not just "no policy."

Never delete a `Firewall-Baseline-*` GPO as your rollback method — unlink
it. Deleting loses the import history and the ability to quickly re-link
if the rollback itself causes problems.

## Complementary controls (not built here, but should exist alongside this)

- **Advanced Audit Policy** → Object Access → Filtering Platform
  Connection, enabled via its own small GPO, generates Security log
  events 5152/5156/5157 for blocked/allowed connections — pair with
  Windows Event Forwarding or a SIEM to actually use the firewall logs
  this baseline turns on, rather than letting them sit in local log
  files no one reads.
- **IPsec connection security rules** (domain/server isolation) are a
  natural next step once this baseline is stable — e.g. requiring
  Kerberos authentication for inbound connections to Tier 0 assets —
  but add them after the basic allow/block baseline is proven, not
  simultaneously; debugging IPsec negotiation failures on top of a
  brand-new firewall rollout makes both much harder to troubleshoot.

## Optional: outbound filtering (advanced, higher maintenance)

This baseline leaves `DefaultOutboundAction = Allow`, which is the
pragmatic default for most organizations — outbound allow-listing is a
real security improvement (it limits C2 callback and data-exfiltration
paths) but has a materially higher ongoing maintenance cost: every new
SaaS integration, Windows Update endpoint change, or third-party agent
needs an explicit outbound rule, and getting it wrong breaks things
silently from the user's perspective.

If your threat model justifies it (e.g. a Tier 0 / Domain Controller
OU, or a high-security enclave), set `DefaultOutboundAction Block` on
that tier's profile and build an explicit outbound allow-list covering
at minimum: DNS to internal resolvers, NTP to the domain hierarchy,
Windows Update / WSUS, your patch-management and AV/EDR management
servers, and any required SaaS/API endpoints. Start this only after the
inbound baseline is stable and proven — outbound allow-listing is a
separate project, not a checkbox on this one.
