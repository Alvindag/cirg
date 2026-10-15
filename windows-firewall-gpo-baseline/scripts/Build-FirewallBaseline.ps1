#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Builds an enterprise Windows Firewall baseline on a REFERENCE MACHINE
    and exports it to a .wfw file for import into a Group Policy Object.

.DESCRIPTION
    This script is the authoring step of a GPO-managed Windows Firewall
    rollout: configure once here, export, import into the right GPO via
    GPMC, link to the right OU. It does NOT touch Active Directory or any
    GPO directly - see docs/ARCHITECTURE.md for the full deployment
    workflow and why direct remote GPO editing from PowerShell isn't the
    supported path for firewall rules.

    Run this on a clean, disposable reference VM joined to a test OU -
    never on a production domain controller or a live user's machine,
    since it rewrites the local firewall policy wholesale.

.PARAMETER Tier
    Which rule set to build: Workstation, Server, or DomainController.
    Always includes common.rules.ps1 and management.rules.ps1.

.PARAMETER ManagementSubnet
    CIDR or comma-separated list, e.g. "10.0.5.0/24". Substituted into
    every <MANAGEMENT_SUBNET> placeholder. Required.

.PARAMETER HelpdeskSubnet
    CIDR for the helpdesk/support subnet. Required for the Workstation tier.

.PARAMETER CorpSubnets
    Comma-separated CIDRs representing general corporate client subnets
    that need file/print access to servers. Required for the Server and
    DomainController tiers.

.PARAMETER RpcPortRange
    The narrowed dynamic RPC range you've configured via
    "netsh int ipv4 set dynamicport tcp startport=X numberofports=Y".
    Format: "startport-endport", e.g. "49152-49279". Required for the
    Server and DomainController tiers - do not skip narrowing this.

.PARAMETER BackupServerIP / BackupAgentPort
    Only used by the Server tier's backup-agent placeholder rule.

.PARAMETER OutputPath
    Where to write the exported .wfw policy file. Defaults to
    .\FirewallBaseline-<Tier>.wfw in the current directory.

.EXAMPLE
    .\Build-FirewallBaseline.ps1 -Tier Workstation `
        -ManagementSubnet "10.0.5.0/24" -HelpdeskSubnet "10.0.6.0/24"

.EXAMPLE
    .\Build-FirewallBaseline.ps1 -Tier DomainController `
        -ManagementSubnet "10.0.5.0/24" -CorpSubnets "10.0.10.0/23,10.0.20.0/23" `
        -RpcPortRange "49152-49279"
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet('Workstation', 'Server', 'DomainController')]
    [string]$Tier,

    [Parameter(Mandatory)]
    [string]$ManagementSubnet,

    [string]$HelpdeskSubnet,
    [string]$CorpSubnets,
    [string]$RpcPortRange,
    [string]$BackupServerIP,
    [string]$BackupAgentPort,

    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RulesRoot = Join-Path (Split-Path -Parent $ScriptRoot) 'rules'

if (-not $OutputPath) {
    $OutputPath = Join-Path (Get-Location) "FirewallBaseline-$Tier.wfw"
}

function Resolve-Placeholders {
    param([hashtable]$Rule)
    $resolved = $Rule.Clone()
    foreach ($key in @('RemoteAddress', 'LocalPort')) {
        if ($resolved.ContainsKey($key) -and $resolved[$key] -is [string]) {
            $v = $resolved[$key]
            $v = $v.Replace('<MANAGEMENT_SUBNET>', $ManagementSubnet)
            if ($HelpdeskSubnet)   { $v = $v.Replace('<HELPDESK_SUBNET>', $HelpdeskSubnet) }
            if ($CorpSubnets)      { $v = $v.Replace('<CORP_SUBNETS>', $CorpSubnets) }
            if ($RpcPortRange)     { $v = $v.Replace('<RPC_PORT_RANGE>', $RpcPortRange) }
            if ($BackupServerIP)   { $v = $v.Replace('<BACKUP_SERVER_IP>', $BackupServerIP) }
            if ($BackupAgentPort)  { $v = $v.Replace('<BACKUP_AGENT_PORT>', $BackupAgentPort) }
            $resolved[$key] = $v
        }
    }
    return $resolved
}

function Test-UnresolvedPlaceholder {
    param([hashtable]$Rule)
    foreach ($value in $Rule.Values) {
        if ($value -is [string] -and $value -match '<[A-Z_]+>') {
            Write-Warning "Rule '$($Rule.Name)' still has an unresolved placeholder: $value — pass the matching parameter or edit the rule manifest."
        }
    }
}

# ---- Load rule manifests for this tier -------------------------------
$ruleSets = @('common.rules.ps1', 'management.rules.ps1')
switch ($Tier) {
    'Workstation'      { $ruleSets += 'workstation.rules.ps1' }
    'Server'           { $ruleSets += 'server.rules.ps1' }
    'DomainController' { $ruleSets += 'server.rules.ps1', 'domain-controller.rules.ps1' }
}

$allRules = foreach ($file in $ruleSets) {
    $path = Join-Path $RulesRoot $file
    if (-not (Test-Path $path)) { throw "Rule manifest not found: $path" }
    & $path
}

Write-Host "Loaded $($allRules.Count) rule definitions for tier '$Tier' from: $($ruleSets -join ', ')" -ForegroundColor Cyan

# ---- Profile baseline (the part that actually replaces the defaults) -
Write-Host "Setting firewall profile defaults (Domain/Private/Public)..." -ForegroundColor Cyan
foreach ($profileName in 'Domain', 'Private', 'Public') {
    Set-NetFirewallProfile -Profile $profileName `
        -Enabled True `
        -DefaultInboundAction Block `
        -DefaultOutboundAction Allow `
        -AllowLocalFirewallRules False `
        -AllowLocalIPsecRules False `
        -NotifyOnListen False `
        -LogAllowed True `
        -LogBlocked True `
        -LogIgnored False `
        -LogMaxSizeKilobytes 16384 `
        -LogFileName "%systemroot%\system32\logfiles\firewall\pfirewall-$($profileName.ToLower()).log"
}

# ---- Clear any rules this script previously created on this reference
#      machine, so re-runs are idempotent ------------------------------
$existing = Get-NetFirewallRule -PolicyStore PersistentStore -ErrorAction SilentlyContinue |
    Where-Object { $_.Group -in @('Core Networking', 'Remote Management', 'File Services', 'Backup', 'Domain Controller', 'Support', 'Network Discovery') }
if ($existing) {
    Write-Host "Removing $($existing.Count) previously-created baseline rule(s) before rebuilding..." -ForegroundColor Yellow
    $existing | Remove-NetFirewallRule
}

# ---- Create rules ------------------------------------------------------
foreach ($rule in $allRules) {
    $resolved = Resolve-Placeholders -Rule $rule
    Test-UnresolvedPlaceholder -Rule $resolved

    $params = @{
        Name        = $resolved.Name
        DisplayName = $resolved.DisplayName
        Direction   = $resolved.Direction
        Action      = $resolved.Action
        Protocol    = $resolved.Protocol
        Profile     = $resolved.Profile
        Group       = $resolved.Group
        Description = $resolved.Description
        Enabled     = 'True'
    }
    foreach ($optional in 'LocalPort', 'RemotePort', 'RemoteAddress', 'Program', 'IcmpType') {
        if ($resolved.ContainsKey($optional) -and $resolved[$optional]) {
            $params[$optional] = $resolved[$optional]
        }
    }

    Write-Host "  + $($resolved.DisplayName)" -ForegroundColor DarkGray
    New-NetFirewallRule @params | Out-Null
}

# ---- Export for GPMC import -------------------------------------------
Write-Host "Exporting policy to $OutputPath ..." -ForegroundColor Cyan
netsh advfirewall export "$OutputPath" | Out-Null

Write-Host ""
Write-Host "Done. Next steps:" -ForegroundColor Green
Write-Host "  1. Copy $OutputPath to a machine with GPMC installed."
Write-Host "  2. Open the target GPO (e.g. 'Firewall-Baseline-$Tier') in Group Policy Management Editor:"
Write-Host "     Computer Configuration > Policies > Windows Settings > Security Settings >"
Write-Host "     Windows Firewall with Advanced Security > Windows Firewall with Advanced Security"
Write-Host "  3. Right-click the root node > Import Policy... > select $OutputPath"
Write-Host "  4. Confirm the overwrite warning (this replaces the GPO's existing firewall policy, not the live machine's)."
Write-Host "  5. Link/verify the GPO is scoped to the correct OU and WMI filter (see docs/ARCHITECTURE.md)."
Write-Host "  6. Roll out to a pilot OU first; validate with scripts/Test-FirewallBaseline.ps1 before org-wide linking."
