<#
.SYNOPSIS
    Validates that the GPO-delivered firewall policy actually landed on
    a target machine, and optionally probes key management ports from
    the machine running this script.

.DESCRIPTION
    Run this AFTER linking a firewall GPO to a pilot OU and letting at
    least one `gpupdate /force` + policy refresh cycle complete on the
    target. It checks the effective (not local) policy store, so it
    reflects what the GPO actually delivered, not what might be sitting
    unapplied in the local firewall console.

.PARAMETER ComputerName
    One or more target machines to check remotely via WinRM. Omit to
    check the local machine.

.PARAMETER ProbePorts
    If set, also runs Test-NetConnection against each target for the
    management ports (WinRM 5985/5986, RDP 3389) from wherever this
    script is run - useful for confirming the RemoteAddress scoping
    actually allows your admin subnet through.

.EXAMPLE
    .\Test-FirewallBaseline.ps1 -ComputerName PILOT-WS01, PILOT-WS02 -ProbePorts
#>
[CmdletBinding()]
param(
    [string[]]$ComputerName = @('localhost'),
    [switch]$ProbePorts
)

$ErrorActionPreference = 'Stop'
$managementPorts = @(5985, 5986, 3389)

function Get-RemoteFirewallReport {
    param([string]$Computer)

    $scriptBlock = {
        $profiles = Get-NetFirewallProfile -PolicyStore ActiveStore
        $rules = Get-NetFirewallRule -PolicyStore ActiveStore -ErrorAction SilentlyContinue |
            Where-Object { $_.Group -ne '' }

        [pscustomobject]@{
            ComputerName       = $env:COMPUTERNAME
            DomainEnabled      = ($profiles | Where-Object Name -eq 'Domain').Enabled
            DomainDefaultIn    = ($profiles | Where-Object Name -eq 'Domain').DefaultInboundAction
            DomainAllowsLocal  = ($profiles | Where-Object Name -eq 'Domain').AllowLocalFirewallRules
            BaselineRuleCount  = ($rules | Measure-Object).Count
            LoggingEnabled     = ($profiles | Where-Object Name -eq 'Domain').LogBlocked
        }
    }

    if ($Computer -eq 'localhost') {
        & $scriptBlock
    }
    else {
        Invoke-Command -ComputerName $Computer -ScriptBlock $scriptBlock
    }
}

$results = foreach ($computer in $ComputerName) {
    Write-Host "Checking effective firewall policy on $computer ..." -ForegroundColor Cyan
    try {
        $report = Get-RemoteFirewallReport -Computer $computer

        $status = if ($report.DomainEnabled -eq $true -and
                      $report.DomainDefaultIn -eq 'Block' -and
                      $report.DomainAllowsLocal -eq $false -and
                      $report.BaselineRuleCount -gt 0) {
            'PASS'
        } else {
            'REVIEW'
        }

        [pscustomobject]@{
            ComputerName      = $report.ComputerName
            Status            = $status
            DomainEnabled     = $report.DomainEnabled
            DefaultInbound    = $report.DomainDefaultIn
            LocalRulesBlocked = -not $report.DomainAllowsLocal
            BaselineRuleCount = $report.BaselineRuleCount
            LoggingEnabled    = $report.LoggingEnabled
        }
    }
    catch {
        [pscustomobject]@{
            ComputerName      = $computer
            Status            = 'ERROR'
            DomainEnabled     = $null
            DefaultInbound    = $null
            LocalRulesBlocked = $null
            BaselineRuleCount = $null
            LoggingEnabled    = $null
            Error             = $_.Exception.Message
        }
    }
}

$results | Format-Table -AutoSize

$notPassed = $results | Where-Object { $_.Status -ne 'PASS' }
if ($notPassed) {
    Write-Warning "$($notPassed.Count) machine(s) did not show a clean baseline. Common causes: GPO not yet refreshed (run gpupdate /force on the target and wait for the next background apply), WMI filter excluding the machine, or a conflicting higher-precedence GPO."
}

if ($ProbePorts) {
    Write-Host ""
    Write-Host "Probing management ports from this machine..." -ForegroundColor Cyan
    foreach ($computer in $ComputerName) {
        if ($computer -eq 'localhost') { continue }
        foreach ($port in $managementPorts) {
            $test = Test-NetConnection -ComputerName $computer -Port $port -WarningAction SilentlyContinue
            $state = if ($test.TcpTestSucceeded) { 'OPEN' } else { 'closed/filtered' }
            Write-Host ("  {0}:{1,-5} {2}" -f $computer, $port, $state)
        }
    }
    Write-Host "Run this from inside the management subnet to confirm access, and from a non-management host to confirm it's blocked there." -ForegroundColor DarkGray
}
