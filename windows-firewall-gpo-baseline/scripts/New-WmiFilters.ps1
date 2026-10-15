#Requires -Modules ActiveDirectory
<#
.SYNOPSIS
    Creates AD WMI filter objects used to target the firewall GPOs by
    machine role (workstation vs server vs domain controller), so a
    single OU structure doesn't have to be gerrymandered around it.

.DESCRIPTION
    WMI filters have no dedicated PowerShell cmdlet in RSAT - they're
    msWMI-Som objects under "CN=SOM,CN=WMIPolicy,CN=System,<domain DN>".
    This script creates them directly via ADSI, matching the format
    GPMC itself writes. After creation, attach each filter to its GPO
    from Group Policy Management: select the GPO > Scope tab > WMI
    Filtering > choose the filter from the dropdown.

    Run once per domain. Re-running is safe - it skips filters that
    already exist (matched by name).

.PARAMETER DomainDN
    Distinguished name of the domain, e.g. "DC=corp,DC=contoso,DC=com".
    Defaults to the current domain if omitted.

.EXAMPLE
    .\New-WmiFilters.ps1
.EXAMPLE
    .\New-WmiFilters.ps1 -DomainDN "DC=corp,DC=contoso,DC=com"
#>
[CmdletBinding()]
param(
    [string]$DomainDN
)

$ErrorActionPreference = 'Stop'

if (-not $DomainDN) {
    $DomainDN = ([adsi]'LDAP://RootDSE').defaultNamingContext
}

$filters = @(
    @{
        Name  = 'OS-Workstation'
        Desc  = 'Windows workstation (ProductType=1): Windows 10/11 client SKUs.'
        Query = 'SELECT * FROM Win32_OperatingSystem WHERE ProductType = 1'
    },
    @{
        Name  = 'OS-MemberServer'
        Desc  = 'Windows Server, not a domain controller (ProductType=3, not DC).'
        Query = 'SELECT * FROM Win32_OperatingSystem WHERE ProductType = 3'
    },
    @{
        Name  = 'OS-DomainController'
        Desc  = 'Domain controller (ProductType=2).'
        Query = 'SELECT * FROM Win32_OperatingSystem WHERE ProductType = 2'
    }
)

$somContainer = "CN=SOM,CN=WMIPolicy,CN=System,$DomainDN"
$container = [adsi]"LDAP://$somContainer"

foreach ($f in $filters) {
    $existing = $container.Children | Where-Object { $_.Properties['msWMI-Name'] -contains $f.Name }
    if ($existing) {
        Write-Host "WMI filter '$($f.Name)' already exists - skipping." -ForegroundColor Yellow
        continue
    }

    $guid = "{$([guid]::NewGuid().ToString().ToUpper())}"
    $newFilter = $container.Create('msWMI-Som', "CN=$guid")
    $newFilter.Put('msWMI-Name', $f.Name)
    $newFilter.Put('msWMI-Parm1', $f.Desc)
    # msWMI-Parm2 format: "<count>;<namespace length>;<namespace>;<query length>;<query>;"
    $namespace = 'root\CIMv2'
    $parm2 = "1;$($namespace.Length);$namespace;$($f.Query.Length);$($f.Query);"
    $newFilter.Put('msWMI-Parm2', $parm2)
    $newFilter.Put('msWMI-ID', $guid)
    $newFilter.Put('instanceType', 4)
    $newFilter.Put('showInAdvancedViewOnly', 'TRUE')
    $newFilter.SetInfo()

    Write-Host "Created WMI filter '$($f.Name)'." -ForegroundColor Green
}

Write-Host ""
Write-Host "Done. Attach each filter in Group Policy Management: GPO > Scope tab > WMI Filtering dropdown." -ForegroundColor Cyan
