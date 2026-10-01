/** Offline MITRE ATT&CK (Enterprise) subset used by the starter pack. Extend alongside rule packs. */
export const ATTACK_VERSION = 'v15 (subset)'

export const TACTICS: Record<string, string> = {
  TA0043: 'Reconnaissance', TA0042: 'Resource Development', TA0001: 'Initial Access', TA0002: 'Execution',
  TA0003: 'Persistence', TA0004: 'Privilege Escalation', TA0005: 'Defense Evasion', TA0006: 'Credential Access',
  TA0007: 'Discovery', TA0008: 'Lateral Movement', TA0009: 'Collection', TA0011: 'Command and Control',
  TA0010: 'Exfiltration', TA0040: 'Impact',
}

export const TECHNIQUES: Record<string, string> = {
  T1003: 'OS Credential Dumping', 'T1003.001': 'LSASS Memory', 'T1003.006': 'DCSync',
  T1021: 'Remote Services', 'T1021.001': 'Remote Desktop Protocol', 'T1021.002': 'SMB/Windows Admin Shares',
  T1047: 'Windows Management Instrumentation',
  T1053: 'Scheduled Task/Job', 'T1053.005': 'Scheduled Task',
  T1059: 'Command and Scripting Interpreter', 'T1059.001': 'PowerShell', 'T1059.003': 'Windows Command Shell',
  T1069: 'Permission Groups Discovery', 'T1069.001': 'Local Groups', 'T1069.002': 'Domain Groups',
  T1070: 'Indicator Removal', 'T1070.001': 'Clear Windows Event Logs',
  T1078: 'Valid Accounts', 'T1078.002': 'Domain Accounts', 'T1078.003': 'Local Accounts',
  T1087: 'Account Discovery',
  T1098: 'Account Manipulation',
  T1105: 'Ingress Tool Transfer',
  T1110: 'Brute Force', 'T1110.001': 'Password Guessing', 'T1110.003': 'Password Spraying',
  T1136: 'Create Account', 'T1136.001': 'Local Account', 'T1136.002': 'Domain Account',
  T1218: 'System Binary Proxy Execution',
  T1490: 'Inhibit System Recovery',
  T1543: 'Create or Modify System Process', 'T1543.003': 'Windows Service',
  T1550: 'Use Alternate Authentication Material', 'T1550.002': 'Pass the Hash',
  T1558: 'Steal or Forge Kerberos Tickets', 'T1558.003': 'Kerberoasting',
  T1562: 'Impair Defenses', 'T1562.001': 'Disable or Modify Tools', 'T1562.002': 'Disable Windows Event Logging',
  T1566: 'Phishing', 'T1566.001': 'Spearphishing Attachment',
  T1569: 'System Services', 'T1569.002': 'Service Execution',
}

export const tacticName = (id: string) => TACTICS[id]
export const techniqueName = (id: string) => TECHNIQUES[id]
