<#
Inbound rules for general member servers (file/print, application,
database tiers). Keep role-specific ports (SQL, IIS, etc.) in a
per-role overlay rather than adding them here - this file is the
common server baseline only.
#>

@(
    @{ Name='Server-SMB-In';       DisplayName='File and Printer Sharing - SMB (TCP-In)'; Direction='Inbound'; Action='Allow'; Protocol='TCP'; LocalPort=445; RemoteAddress='<CORP_SUBNETS>'; Profile='Domain'; Group='File Services'; Description='SMB file shares. Scope to the subnets that actually need file access - SMB should never be reachable from end-user workstation VLANs unless this server IS a file server for them.' }
    @{ Name='Server-Spooler-In';   DisplayName='File and Printer Sharing - Spooler (TCP-In)'; Direction='Inbound'; Action='Allow'; Protocol='TCP'; LocalPort=135; RemoteAddress='<CORP_SUBNETS>'; Profile='Domain'; Group='File Services'; Description='Print spooler RPC. Remove this rule entirely on servers that are not print servers.' }
    @{ Name='Server-Backup-Agent-In'; DisplayName='Backup Agent (TCP-In)'; Direction='Inbound'; Action='Allow'; Protocol='TCP'; LocalPort='<BACKUP_AGENT_PORT>'; RemoteAddress='<BACKUP_SERVER_IP>'; Profile='Domain'; Group='Backup'; Description='Placeholder for your backup product agent port (e.g. Veeam 10006, Backup Exec 10000/3260). Fill in and scope to the backup server only.' }
)
