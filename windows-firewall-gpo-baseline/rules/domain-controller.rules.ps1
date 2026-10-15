<#
Inbound rules for the Domain Controller tier. Layered on top of
common.rules.ps1 and management.rules.ps1. Source: Microsoft's documented
AD DS port requirements (support.microsoft.com "Service overview and
network port requirements for Windows").
#>

@(
    @{ Name='DC-DNS-TCP-In';        DisplayName='AD DS - DNS (TCP-In)';            Direction='Inbound'; Action='Allow'; Protocol='TCP'; LocalPort=53;        Profile='Domain'; Group='Domain Controller'; Description='DNS server.' }
    @{ Name='DC-DNS-UDP-In';        DisplayName='AD DS - DNS (UDP-In)';            Direction='Inbound'; Action='Allow'; Protocol='UDP'; LocalPort=53;        Profile='Domain'; Group='Domain Controller'; Description='DNS server.' }
    @{ Name='DC-Kerberos-TCP-In';   DisplayName='AD DS - Kerberos (TCP-In)';       Direction='Inbound'; Action='Allow'; Protocol='TCP'; LocalPort=88;        Profile='Domain'; Group='Domain Controller'; Description='Kerberos authentication.' }
    @{ Name='DC-Kerberos-UDP-In';   DisplayName='AD DS - Kerberos (UDP-In)';       Direction='Inbound'; Action='Allow'; Protocol='UDP'; LocalPort=88;        Profile='Domain'; Group='Domain Controller'; Description='Kerberos authentication.' }
    @{ Name='DC-RPC-EPMAP-In';      DisplayName='AD DS - RPC Endpoint Mapper (In)';Direction='Inbound'; Action='Allow'; Protocol='TCP'; LocalPort=135;       Profile='Domain'; Group='Domain Controller'; Description='RPC endpoint mapper; pairs with the narrowed dynamic RPC range below.' }
    @{ Name='DC-RPC-Dynamic-In';    DisplayName='AD DS - RPC Dynamic Ports (In)';  Direction='Inbound'; Action='Allow'; Protocol='TCP'; LocalPort='<RPC_PORT_RANGE>'; Profile='Domain'; Group='Domain Controller'; Description='Narrowed RPC dynamic port range - set via "netsh int ipv4 set dynamicport tcp startport=49152 numberofports=16384" (or narrower) and match that range here. Do NOT leave this open to the full ephemeral range without narrowing it first.' }
    @{ Name='DC-LDAP-TCP-In';       DisplayName='AD DS - LDAP (TCP-In)';           Direction='Inbound'; Action='Allow'; Protocol='TCP'; LocalPort=389;       Profile='Domain'; Group='Domain Controller'; Description='LDAP.' }
    @{ Name='DC-LDAP-UDP-In';       DisplayName='AD DS - LDAP (UDP-In)';           Direction='Inbound'; Action='Allow'; Protocol='UDP'; LocalPort=389;       Profile='Domain'; Group='Domain Controller'; Description='LDAP ping/CLDAP.' }
    @{ Name='DC-LDAPS-In';          DisplayName='AD DS - LDAPS (TCP-In)';          Direction='Inbound'; Action='Allow'; Protocol='TCP'; LocalPort=636;       Profile='Domain'; Group='Domain Controller'; Description='LDAP over SSL.' }
    @{ Name='DC-GC-In';             DisplayName='AD DS - Global Catalog (TCP-In)'; Direction='Inbound'; Action='Allow'; Protocol='TCP'; LocalPort=3268;      Profile='Domain'; Group='Domain Controller'; Description='Global Catalog LDAP. Only needed on GC-role DCs.' }
    @{ Name='DC-GCS-In';            DisplayName='AD DS - Global Catalog SSL (TCP-In)'; Direction='Inbound'; Action='Allow'; Protocol='TCP'; LocalPort=3269;  Profile='Domain'; Group='Domain Controller'; Description='Global Catalog LDAPS. Only needed on GC-role DCs.' }
    @{ Name='DC-SMB-In';            DisplayName='AD DS - SMB/NetLogon (TCP-In)';   Direction='Inbound'; Action='Allow'; Protocol='TCP'; LocalPort=445;       RemoteAddress='<MANAGEMENT_SUBNET>,<CORP_SUBNETS>'; Profile='Domain'; Group='Domain Controller'; Description='SYSVOL/NETLOGON share access and NetLogon RPC over SMB. Scope RemoteAddress to actual client subnets - do not leave unscoped on a DC.' }
    @{ Name='DC-Kpasswd-TCP-In';    DisplayName='AD DS - Kerberos Password (TCP-In)'; Direction='Inbound'; Action='Allow'; Protocol='TCP'; LocalPort=464;    Profile='Domain'; Group='Domain Controller'; Description='Kerberos password change.' }
    @{ Name='DC-Kpasswd-UDP-In';    DisplayName='AD DS - Kerberos Password (UDP-In)'; Direction='Inbound'; Action='Allow'; Protocol='UDP'; LocalPort=464;    Profile='Domain'; Group='Domain Controller'; Description='Kerberos password change.' }
    @{ Name='DC-W32Time-In';        DisplayName='AD DS - W32Time (UDP-In)';        Direction='Inbound'; Action='Allow'; Protocol='UDP'; LocalPort=123;       RemoteAddress='<CORP_SUBNETS>'; Profile='Domain'; Group='Domain Controller'; Description='Time sync for domain members (PDC emulator especially).' }
    @{ Name='DC-FRS-RPC-In';        DisplayName='AD DS - DFSR RPC (TCP-In)';       Direction='Inbound'; Action='Allow'; Protocol='TCP'; LocalPort=5722;      Profile='Domain'; Group='Domain Controller'; Description='DFS Replication (SYSVOL replication) RPC.' }
)
