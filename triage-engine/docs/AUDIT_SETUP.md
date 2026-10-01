# Audit setup for Windows event collection

What to enable so the triage engine (and any reviewer) has the events it needs. Run in an **elevated** PowerShell. Local `auditpol` changes can be overwritten by Group Policy; see "Make it stick".

> Tested in this repository: the **rules and parsers** (against real DC and workstation exports). **Not tested here:** the commands below against a live Active Directory (there was none in the build environment). Try them in a lab or change window first. The directory audit-entry script in section 3 is the one most worth testing before production.

## 1. Baseline (both workstation and server)

```powershell
auditpol /set /subcategory:"Process Creation"                 /success:enable
auditpol /set /subcategory:"Logon"                            /success:enable /failure:enable
auditpol /set /subcategory:"Special Logon"                    /success:enable
auditpol /set /subcategory:"User Account Management"          /success:enable /failure:enable   # also logs account lockouts (4740)
auditpol /set /subcategory:"Security Group Management"        /success:enable
auditpol /set /subcategory:"Audit Policy Change"              /success:enable
auditpol /set /subcategory:"Security System Extension"        /success:enable   # service installs (4697)
auditpol /set /subcategory:"Other Object Access Events"       /success:enable   # scheduled tasks (4698)
reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System\Audit" /v ProcessCreationIncludeCmdLine_Enabled /t REG_DWORD /d 1 /f
```

## 2. Domain controllers: authentication and directory events

```powershell
auditpol /set /subcategory:"Kerberos Authentication Service"    /success:enable /failure:enable   # 4768
auditpol /set /subcategory:"Kerberos Service Ticket Operations" /success:enable /failure:enable   # 4769 (Kerberoasting rules)
auditpol /set /subcategory:"Credential Validation"              /success:enable /failure:enable   # 4776 (NTLM)
auditpol /set /subcategory:"Directory Service Access"           /success:enable                   # 4662 (DCSync rule, needs section 3)
auditpol /set /subcategory:"Directory Service Changes"          /success:enable                   # 5136 (AD object/attribute changes)
```
`Directory Service Access` produces nothing until the audit entry in section 3 exists. `Directory Service Changes` records changes to AD objects; it is useful evidence for PCI DSS 10.2.1.5 and ISO A.8.15, but no starter rule evaluates 5136 yet.

## 3. DCSync visibility (audit entry on the domain object)

Event 4662 for the replication rights is only written if the domain root has an audit entry for them. **Check first** whether your domain already has one (Active Directory Users and Computers > View > Advanced Features > domain > Properties > Security > Advanced > Auditing). If not, add: Principal **Everyone**, Type **Success**, Applies to **This object only**, permissions **Replicating Directory Changes**, **Replicating Directory Changes All** and **Replicating Directory Changes In Filtered Set**.

PowerShell equivalent (run as a Domain Admin on a DC; **test in a lab first**):
```powershell
Import-Module ActiveDirectory
$dn       = (Get-ADDomain).DistinguishedName
$acl      = Get-Acl "AD:$dn" -Audit
$everyone = New-Object System.Security.Principal.SecurityIdentifier 'S-1-1-0'
$rights   = '1131f6aa-9c07-11d1-f79f-00c04fc2dcd2',   # DS-Replication-Get-Changes
            '1131f6ad-9c07-11d1-f79f-00c04fc2dcd2',   # DS-Replication-Get-Changes-All
            '89e95b76-444d-4c62-991a-0facbeda640c'    # DS-Replication-Get-Changes-In-Filtered-Set
foreach ($g in $rights) {
  $rule = New-Object System.DirectoryServices.ActiveDirectoryAuditRule($everyone, 'ExtendedRight', 'Success', [Guid]$g, 'None', [Guid]::Empty)
  $acl.AddAuditRule($rule)
}
Set-Acl "AD:$dn" $acl
```
**Verify safely** (no attack tooling needed): after a few minutes, normal replication between your domain controllers should produce 4662 events whose subject is a DC computer account (`DC02$`). Seeing those proves the audit entry works. The engine deliberately ignores them (CRED-004 only fires for non-computer accounts). Expect Azure AD Connect's `MSOL_*`/`AAD_*` account to appear if you use password hash sync: add it to `approvedReplicationAccounts` in the rule pack assets.

## 4. Make it stick (Group Policy)
A domain GPO that defines Advanced Audit Policy overrides local `auditpol` settings at the next refresh (about every 90 minutes on a DC). Put the same settings in a GPO linked to the Domain Controllers OU (and a workstation/server GPO for the baseline): Computer Configuration > Policies > Windows Settings > Security Settings > Advanced Audit Policy Configuration. For process command lines: Computer Configuration > Administrative Templates > System > Audit Process Creation > "Include command line in process creation events". Check afterwards with `auditpol /get /category:*` and `gpresult /h gp.html`.

## 5. Capacity and retention
The default Security log is small (128 MB on recent servers) and a busy DC can overwrite days of events. Set it to at least 1 GB, and forward or archive logs if you need to retain them for an audit (for example PCI DSS 10.5.1 or CIS 8.10):
```powershell
wevtutil sl Security /ms:1073741824
```

## 6. After enabling: wait, then export
Newly enabled categories only log from the moment they are on. Wait **24 to 48 hours** before exporting, or the report will correctly say "re-export after a day". Record the change in a change ticket: the 4719 events your own change generates will then match a record.

## 7. Safe ways to exercise the detections (lab only)
- **Lockout / spray (AUTH-007, AUTH-008):** in a lab domain, use a throwaway test account and repeat a wrong password past the lockout threshold from one machine; repeat with 3 throwaway accounts within 30 minutes.
- **Encoded PowerShell (EXEC-001):** `powershell -nop -enc` with a harmless encoded string of 40+ characters.
- **Failed-logon burst (AUTH-001):** 12 wrong-password attempts against a throwaway account.
- **Do not** run real DCSync or Kerberoasting tooling on a production domain to test rules. Use the lab, or rely on the unit tests, which feed the exact event shapes.

## 8. What each setting gives you
| Setting | Events | Rules and report areas that use them |
|---|---|---|
| Process Creation + command line | 4688 | EXEC-001/002/003, CRED-001, DISC-001, EVAS-001, IMP-001, LAT-001 |
| Logon / Special Logon | 4624, 4625, 4648, 4672 | AUTH-001..006, PRIV-001, LAT-001/002, EVAS-002 |
| User Account Management | 4720..4738, 4740 | ACC-001/003, AUTH-007/008 |
| Security Group Management | 4728/4732/4756 | ACC-002/003 |
| Audit Policy Change | 4719 | AUD-002/003/004 |
| Kerberos AS / Service Ticket | 4768, 4769 | CRED-002, CRED-003 |
| Credential Validation | 4776 | audit coverage (NTLM use) |
| Directory Service Access + audit entry | 4662 | CRED-004 (DCSync) |
| Other Object Access / Security System Extension | 4698, 4697 | PERS-001/002, LAT-002 |
