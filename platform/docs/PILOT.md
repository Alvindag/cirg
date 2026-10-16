# Trying it on real data safely

Do this on a **copy**. Nothing here touches your live ITAM or CyberShield.

## 1. Copy the data
Stop nothing. On the server, copy the two database files to a new folder, for example `pilot-data\`:
`itam.db` (from the ITAM `instance` folder) and `cybershield.db` (from the CyberShield `instance` folder).

## 2. Read-only preflight (changes nothing)
```
set ITAM_DB_PATH=pilot-data\itam.db
set CYBERSHIELD_DB_PATH=pilot-data\cybershield.db
set HUB_DB_PATH=pilot-data\hub.db
python -m hub.cli preflight
```
It reports how many people match by employee ID, by AD username or only by name, any names shared by different employees, joiners not yet enrolled, and, if automation is on, exactly what it **would** do. Fix what it flags first:
- Open the Hub **Identity** page and confirm employee IDs for people who rely on a bare name.
- Names shared by several employees are never auto-matched; confirm each with its employee ID.

## 3. Run the pilot instance
`python run_all.py --data pilot-data --lan <ip>` (this uses the copy, on its own ports if you also run the live apps: stop those first or change ports).
Keep `AD_DRY_RUN=true`.

## 4. Pilot with a few real people
1. **Joiners (3 to 5):** in the pilot ITAM, create onboarding records with employee IDs. In the Hub *Onboarding & offboarding* page click **Preview (no changes)** to see the plan, then **Run now**. Check each one appears in the CyberShield admin with a 5-day deadline, and (after a test certificate) that the ITAM checklist item "Phishing and email security awareness briefing" ticks with the certificate number.
2. **Leavers (2 to 3):** open leaver cases for people who are genuinely leaving (or test accounts). Check asset return detection against ITAM, and that unfinished training is cancelled on the last day.
3. **AD (dry run):** look up the account, confirm it, click **Preview**. Check the Hub proposes the right account and actions. Only when you are happy, and on a **test account first**, set `AD_DRY_RUN=false` and disable one disposable account. Verify it in AD, then re-enable it from the Hub.
4. Run `python -m hub.cli verify` and look at the *Audit ledger* page to confirm every action was recorded.

## 5. Go live
Apply the same settings to the live install (back up the databases first, then restart ITAM and CyberShield once so they add the new employee ID and cancellation columns). Start with `AD_AUTO_DISABLE=false` so a person approves each AD disable; consider automatic only after several clean weeks.

## Rollback
Everything the Hub writes into ITAM/CyberShield is small and traceable in the ledger: a CyberShield enrolment, a cancelled flag, one ITAM checklist tick. Restore the pre-pilot database copies to undo all of it. AD changes are reversible with **Re-enable** (admin).
