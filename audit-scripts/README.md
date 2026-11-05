# DAS PLC - External Audit IT Information Scripts
| Script | Tracker row | Output |
|---|---|---|
| Task3_App_Server_Inventory.ps1 | 3 - Applications (Navision, BC, CE) | Servers/apps/DB CSVs |
| Task4_Policy_Inventory.ps1 | 4 - IT policies & procedures | Policy inventory CSV (+ evidence copy) |
| Task5_AD_UserList.ps1 | 5 - AD user list | Users CSV, group membership CSV, counts |
| Task6A_App_UserList_NAV_BC.ps1 | 6 - Navision/BC app users+roles | CSVs + counts |
| Task6B_App_UserList_CE.ps1 | 6 - CE/CRM app users+roles | CSV + counts |
| Task6C_OS_UserList.ps1 | 6 - OS local users/groups | CSVs + counts |
| Task6D_DB_UserList_SQL.ps1 | 6 - SQL logins/roles/db users | CSVs + counts |
Run in an elevated PowerShell on a domain-joined machine (RSAT AD module; SqlServer module for Task 3 DB list).
Screenshot the console (code + count) as auditors request. Fill columns marked MANUAL.
