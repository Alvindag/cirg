# Disabling a leaver's on-premise Active Directory account

## How it works
1. A leaver case is opened (HR or line manager). Step 6 is **"Disable the on-premise Active Directory account"**.
2. IT opens the case, clicks **Look up account in AD**. The Hub searches by **employee ID**, then **AD username**, then **exact display name**, and lists the candidates.
3. IT **confirms the one exact account**. Protected accounts cannot be confirmed. The Hub never guesses and never acts on a name match alone.
4. On or after the last working day, an **IT manager (or admin)** clicks **Disable account now**, or the Hub does it automatically if `AD_AUTO_DISABLE=true`.
5. The Hub re-reads the account, re-checks it is the confirmed one and not protected, sets the *ACCOUNTDISABLE* flag, appends a note to the description, resets the password to a random value, optionally moves it to a Disabled OU, then **reads it back** and only marks the step done if it really is disabled.
6. Everything is sealed in the audit ledger. An admin can **re-enable** an account disabled by mistake. Accounts are never deleted.

## Safeguards built in
- **Dry run by default** (`AD_DRY_RUN=true`): the Hub shows what it would do and changes nothing.
- Must be **LDAPS** with a verified certificate; plain LDAP is refused.
- Refuses members of Domain/Enterprise/Schema Admins, Administrators, Account/Server/Backup/Print Operators, accounts with `adminCount=1`, `krbtgt`, built-ins, anything in `AD_PROTECTED_USERS`, and the Hub's own service account.
- The disable runs only against the **confirmed DN**, and refuses if the account there no longer matches what was confirmed.
- Lookup/confirm: IT roles. Disable: IT manager or admin. Re-enable: admin only. HR and line managers can start the case but cannot touch AD.
- If AD is not configured the step stays a normal manual step, so nothing is blocked.

## One-time setup
1. **Service account** (e.g. `svc-trusthub`), a normal user, *not* a domain admin, password in a vault.
2. **Delegate rights** (Active Directory Users and Computers → right-click the OU holding staff → *Delegate Control* → *Create a custom task* → *User objects*):
   - *Read* all properties (for lookup)
   - *Write* `userAccountControl` and `description`
   - *Reset password* (control access right)
   - Only if you use `AD_DISABLED_OU`: also create/delete child rights on the source and target OUs so accounts can be moved.
   Apply to the staff OUs only. Do **not** delegate on admin OUs.
3. **Employee ID**: make sure staff accounts have `employeeID` populated (it is the most reliable match). Without it the Hub falls back to the AD username, then exact display name.
4. **LDAPS**: the domain controller needs a certificate trusted by the machine running the Hub. Put the CA certificate path in `AD_CA_CERT` if it is not already in the system store.
5. Fill in the `AD_*` settings in `.env` (see `.env.example`) and run the read-only test:

   ```
   python -m hub.cli ad-check            # bind + connectivity
   python -m hub.cli ad-check E12345     # look up one account (employee ID or username); changes nothing
   ```
6. Keep `AD_DRY_RUN=true` for the pilot (see `PILOT.md`), then set it to `false`.

## What was and was not tested
The logic (search, protection, dry run, disable, verify, move, re-enable, role gates) is tested against ldap3's in-memory directory. It has **not** been tested against a real Active Directory, which is why dry run is the default and why you should follow the pilot steps. Domain controller policies (e.g. delegated rights, LDAPS settings) vary; the `ad-check` command and a dry-run on a test account will show any gap before anything changes.
