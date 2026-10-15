<#
Inbound rules for end-user workstations (Windows 10/11). Deliberately
small: workstations should accept almost nothing inbound. Network
Discovery and file sharing are OFF by default here - most orgs don't
need peer-to-peer file sharing between user machines, and it's a
lateral-movement vector when it's on.
#>

@(
    @{ Name='WS-RemoteAssistance-In'; DisplayName='Remote Assistance (TCP-In)'; Direction='Inbound'; Action='Allow'; Protocol='TCP'; LocalPort=3389; RemoteAddress='<HELPDESK_SUBNET>'; Profile='Domain'; Group='Support'; Description='Allows helpdesk/support staff to shadow or remote-assist a user session. Scope tightly to the helpdesk subnet - this is in addition to, not a replacement for, the admin-only RDP rule in management.rules.ps1.' }
    @{ Name='WS-NetworkDiscovery-In'; DisplayName='Network Discovery (Disabled by default)'; Direction='Inbound'; Action='Block'; Protocol='UDP'; LocalPort=3702; Profile='Domain,Private'; Group='Network Discovery'; Description='Explicit block placeholder documenting that Network Discovery / WS-Discovery is intentionally off for workstations. Delete this rule (rely on default-block) or flip Action to Allow only if your org genuinely needs peer discovery, e.g. for Miracast or local printer discovery on the Private profile.' }
)
