"""Built-in detection rules, mapped to MITRE ATT&CK and NIST CSF, covering
common threats against Windows 10/11/Server 2016 endpoints. Informed by the
vendored skill library under .claude/skills/ (see e.g.
detecting-rdp-brute-force-attacks, detecting-suspicious-powershell-execution,
detecting-t1003-credential-dumping-with-edr, hunting-for-scheduled-task-persistence,
detecting-ransomware-precursors-in-network).

Seeded idempotently on app startup via seed_builtin_rules(); is_builtin=TRUE
rows are protected from deletion via the API but can still be disabled/tuned.
"""

import json

from backend.db import get_cursor

BUILTIN_RULES = [
    {
        "rule_key": "win-rdp-bruteforce",
        "name": "RDP / interactive logon brute-force attempt",
        "description": "5+ failed logons (Event ID 4625) for the same account within 5 minutes.",
        "severity": "high",
        "channel": "Security",
        "logic": {
            "event_id": 4625,
            "channel": "Security",
            "threshold": {"count": 5, "window_seconds": 300, "group_by": "user_name"},
        },
        "mitre_attack_techniques": ["T1110", "T1110.001"],
        "nist_csf_categories": ["DE.CM-01", "DE.AE-02"],
    },
    {
        "rule_key": "win-encoded-powershell",
        "name": "Obfuscated / Base64-encoded PowerShell execution",
        "description": "PowerShell launched with -enc/-EncodedCommand, a common obfuscation and LOLBAS technique.",
        "severity": "high",
        "channel": "Microsoft-Windows-PowerShell/Operational",
        "logic": {
            "field_matches": [
                {"field": "process_name", "op": "icontains", "value": "powershell"},
                {"field": "command_line", "op": "regex", "value": "-e(nc|ncodedcommand)?\\s"},
            ]
        },
        "mitre_attack_techniques": ["T1059.001", "T1027"],
        "nist_csf_categories": ["DE.CM-01"],
    },
    {
        "rule_key": "win-powershell-download-cradle",
        "name": "PowerShell download cradle (fileless payload staging)",
        "description": "PowerShell invoking IEX/DownloadString/Net.WebClient to fetch and execute remote code in memory.",
        "severity": "critical",
        "channel": "Microsoft-Windows-PowerShell/Operational",
        "logic": {
            "field_matches": [
                {"field": "process_name", "op": "icontains", "value": "powershell"},
                {"field": "command_line", "op": "regex", "value": "(downloadstring|downloadfile|iex|invoke-expression|net\\.webclient)"},
            ]
        },
        "mitre_attack_techniques": ["T1059.001", "T1105"],
        "nist_csf_categories": ["DE.CM-01"],
    },
    {
        "rule_key": "win-lsass-access",
        "name": "Suspicious access to LSASS process memory (credential dumping)",
        "description": "A process other than known-good system binaries opened a handle to lsass.exe — classic Mimikatz-style credential theft.",
        "severity": "critical",
        "channel": "Microsoft-Windows-Sysmon/Operational",
        "logic": {
            "event_id": 10,
            "field_matches": [{"field": "process_name", "op": "icontains", "value": "lsass.exe"}],
        },
        "mitre_attack_techniques": ["T1003.001"],
        "nist_csf_categories": ["DE.CM-01", "PR.PT-01"],
    },
    {
        "rule_key": "win-mimikatz-process",
        "name": "Known credential-dumping tool process name",
        "description": "Process name/command line matches mimikatz, procdump against lsass, or sekurlsa modules.",
        "severity": "critical",
        "logic": {
            "field_matches": [
                {"field": "command_line", "op": "regex", "value": "(mimikatz|sekurlsa|procdump.*lsass|lsadump)"}
            ]
        },
        "mitre_attack_techniques": ["T1003.001", "T1003"],
        "nist_csf_categories": ["DE.CM-01"],
    },
    {
        "rule_key": "win-new-scheduled-task",
        "name": "New scheduled task created (persistence)",
        "description": "Event ID 4698 — a new scheduled task was registered, a common persistence mechanism.",
        "severity": "medium",
        "channel": "Security",
        "logic": {"event_id": 4698, "channel": "Security"},
        "mitre_attack_techniques": ["T1053.005"],
        "nist_csf_categories": ["DE.CM-01"],
    },
    {
        "rule_key": "win-new-service-install",
        "name": "New Windows service installed",
        "description": "Event ID 7045 — a new service was installed, frequently used for persistence or lateral-movement tooling (e.g. PsExec).",
        "severity": "medium",
        "channel": "System",
        "logic": {"event_id": 7045, "channel": "System"},
        "mitre_attack_techniques": ["T1543.003"],
        "nist_csf_categories": ["DE.CM-01"],
    },
    {
        "rule_key": "win-lateral-movement-tooling",
        "name": "Remote execution tooling invoked (PsExec / WMIC / PAExec)",
        "description": "Command line indicates remote-execution tooling commonly used for lateral movement.",
        "severity": "high",
        "logic": {
            "field_matches": [
                {"field": "command_line", "op": "regex", "value": "(psexec|paexec|wmic\\s+/node|wmic\\.exe.*process\\s+call\\s+create)"}
            ]
        },
        "mitre_attack_techniques": ["T1021.002", "T1047"],
        "nist_csf_categories": ["DE.CM-01"],
    },
    {
        "rule_key": "win-new-local-admin",
        "name": "Account added to local Administrators group",
        "description": "Event ID 4732 — a user was added to a privileged local group.",
        "severity": "high",
        "channel": "Security",
        "logic": {"event_id": 4732, "channel": "Security"},
        "mitre_attack_techniques": ["T1098", "T1136.001"],
        "nist_csf_categories": ["DE.CM-01", "PR.AC-01"],
    },
    {
        "rule_key": "win-audit-log-cleared",
        "name": "Security audit log cleared",
        "description": "Event ID 1102 — the Security event log was cleared, a common defense-evasion / anti-forensic action.",
        "severity": "critical",
        "channel": "Security",
        "logic": {"event_id": 1102, "channel": "Security"},
        "mitre_attack_techniques": ["T1070.001"],
        "nist_csf_categories": ["DE.CM-01", "PR.PT-01"],
    },
    {
        "rule_key": "win-defender-tampering",
        "name": "Windows Defender protection disabled or tampered with",
        "description": "Command line disables real-time protection, adds exclusions, or stops the Defender service.",
        "severity": "high",
        "logic": {
            "field_matches": [
                {"field": "command_line", "op": "regex", "value": "(set-mppreference.*disable|disableRealtimeMonitoring|defender.*exclusion|sc\\s+(stop|config)\\s+windefend)"}
            ]
        },
        "mitre_attack_techniques": ["T1562.001"],
        "nist_csf_categories": ["DE.CM-01", "PR.PT-01"],
    },
    {
        "rule_key": "win-shadow-copy-deletion",
        "name": "Volume shadow copy deletion (ransomware precursor)",
        "description": "vssadmin/wmic/wbadmin used to delete shadow copies or disable backups, a strong ransomware precursor.",
        "severity": "critical",
        "logic": {
            "field_matches": [
                {"field": "command_line", "op": "regex", "value": "(vssadmin.*delete\\s+shadows|wmic.*shadowcopy\\s+delete|wbadmin.*delete\\s+catalog|bcdedit.*recoveryenabled\\s+no)"}
            ]
        },
        "mitre_attack_techniques": ["T1490"],
        "nist_csf_categories": ["DE.CM-01", "RS.MI-01"],
    },
    {
        "rule_key": "win-kerberoasting",
        "name": "Possible Kerberoasting (RC4 service ticket request)",
        "description": "Event ID 4769 service ticket requests using weak RC4 encryption are a Kerberoasting indicator; 5+ in a short window from one account is highly suspicious.",
        "severity": "high",
        "channel": "Security",
        "logic": {
            "event_id": 4769,
            "channel": "Security",
            "threshold": {"count": 5, "window_seconds": 300, "group_by": "user_name"},
        },
        "mitre_attack_techniques": ["T1558.003"],
        "nist_csf_categories": ["DE.CM-01"],
    },
    {
        "rule_key": "win-account-lockout-spike",
        "name": "Multiple account lockouts in a short window",
        "description": "Event ID 4740 fired 3+ times within 10 minutes — indicates password-spray or brute-force activity across accounts.",
        "severity": "medium",
        "channel": "Security",
        "logic": {"event_id": 4740, "channel": "Security", "threshold": {"count": 3, "window_seconds": 600, "group_by": "computer"}},
        "mitre_attack_techniques": ["T1110.003"],
        "nist_csf_categories": ["DE.CM-01"],
    },
    {
        "rule_key": "win-suspicious-outbound-c2-port",
        "name": "Outbound connection to a common C2/backdoor port",
        "description": "A process opened an outbound connection to a port frequently associated with C2 frameworks (e.g. 4444, 8443, 1337, 6666).",
        "severity": "medium",
        "channel": "Microsoft-Windows-Sysmon/Operational",
        "logic": {
            "event_id": 3,
            "field_matches": [{"field": "dest_port", "op": "in", "value": [4444, 1337, 6666, 4433, 8443]}],
        },
        "mitre_attack_techniques": ["T1071", "T1571"],
        "nist_csf_categories": ["DE.CM-01"],
    },
    {
        "rule_key": "win-applocker-whitelist-bypass",
        "name": "Living-off-the-land binary invoked with suspicious arguments",
        "description": "Common LOLBAS binaries (certutil, regsvr32, mshta, rundll32) invoked with download/execute style arguments.",
        "severity": "high",
        "logic": {
            "field_matches": [
                {"field": "process_name", "op": "regex", "value": "(certutil|regsvr32|mshta|rundll32)\\.exe"},
                {"field": "command_line", "op": "regex", "value": "(http://|https://|-urlcache|-decode|javascript:)"},
            ]
        },
        "mitre_attack_techniques": ["T1218"],
        "nist_csf_categories": ["DE.CM-01"],
    },
]


def seed_builtin_rules() -> int:
    """Idempotently insert/update the built-in rule set. Safe to call on
    every app startup."""
    count = 0
    with get_cursor() as cur:
        for rule in BUILTIN_RULES:
            cur.execute(
                """
                INSERT INTO detection_rules (rule_key, name, description, severity, channel, logic,
                                              mitre_attack_techniques, nist_csf_categories, is_builtin, enabled)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, TRUE, TRUE)
                ON CONFLICT (rule_key) DO UPDATE SET
                    name = EXCLUDED.name,
                    description = EXCLUDED.description,
                    severity = EXCLUDED.severity,
                    channel = EXCLUDED.channel,
                    logic = EXCLUDED.logic,
                    mitre_attack_techniques = EXCLUDED.mitre_attack_techniques,
                    nist_csf_categories = EXCLUDED.nist_csf_categories,
                    updated_at = now()
                """,
                (
                    rule["rule_key"],
                    rule["name"],
                    rule["description"],
                    rule["severity"],
                    rule.get("channel"),
                    json.dumps(rule["logic"]),
                    rule["mitre_attack_techniques"],
                    rule["nist_csf_categories"],
                ),
            )
            count += 1
    return count
