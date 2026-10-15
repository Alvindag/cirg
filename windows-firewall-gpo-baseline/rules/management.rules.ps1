<#
Remote management rules, applied to EVERY tier (workstation, server,
domain controller). This is the single biggest lateral-movement
surface on a default-open network, so every rule here is scoped to
RemoteAddress = the management/admin subnet, never left open to
"Any". Replace the placeholder tokens at build time via
Build-FirewallBaseline.ps1 -ManagementSubnet.
#>

@(
    @{ Name='Mgmt-WinRM-HTTP-In';  DisplayName='Windows Remote Management - HTTP (TCP-In)';  Direction='Inbound'; Action='Allow'; Protocol='TCP'; LocalPort=5985; RemoteAddress='<MANAGEMENT_SUBNET>'; Profile='Domain'; Group='Remote Management'; Description='WinRM/PowerShell remoting, HTTP listener. Admin subnet only.' }
    @{ Name='Mgmt-WinRM-HTTPS-In'; DisplayName='Windows Remote Management - HTTPS (TCP-In)'; Direction='Inbound'; Action='Allow'; Protocol='TCP'; LocalPort=5986; RemoteAddress='<MANAGEMENT_SUBNET>'; Profile='Domain'; Group='Remote Management'; Description='WinRM/PowerShell remoting, HTTPS listener. Prefer this over 5985 where certificates are deployed.' }
    @{ Name='Mgmt-RDP-In';         DisplayName='Remote Desktop - Admin (TCP-In)';            Direction='Inbound'; Action='Allow'; Protocol='TCP'; LocalPort=3389; RemoteAddress='<MANAGEMENT_SUBNET>'; Profile='Domain'; Group='Remote Management'; Description='RDP for administrators/jump hosts only. This is NOT the helpdesk rule (see workstation.rules.ps1) - this one should resolve to a tighter admin-only subnet or a PAW/jump-host IP set.' }
    @{ Name='Mgmt-RPC-EPMAP-In';   DisplayName='Remote Management - RPC Endpoint Mapper (In)'; Direction='Inbound'; Action='Allow'; Protocol='TCP'; LocalPort=135; RemoteAddress='<MANAGEMENT_SUBNET>'; Profile='Domain'; Group='Remote Management'; Description='Needed for remote MMC/WMI/Services/EventLog management consoles. Pairs with the narrowed dynamic RPC range.' }
    @{ Name='Mgmt-RPC-Dynamic-In'; DisplayName='Remote Management - RPC Dynamic Ports (In)';  Direction='Inbound'; Action='Allow'; Protocol='TCP'; LocalPort='<RPC_PORT_RANGE>'; RemoteAddress='<MANAGEMENT_SUBNET>'; Profile='Domain'; Group='Remote Management'; Description='Narrowed RPC dynamic port range for remote management consoles - same narrowing requirement as the DC rule.' }
)
