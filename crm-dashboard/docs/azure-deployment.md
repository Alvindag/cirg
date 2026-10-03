# Deploying DAS Engage 360 to Azure

This sets up hosting only. **Nothing has been created or deployed.** The files are ready; going live is a separate step that you confirm.

## What you get

| Piece | Azure service | Notes |
|---|---|---|
| Web app and API | App Service (Linux, Node 20) | One Next.js server. `infra/main.bicep` |
| Data | Azure Database for PostgreSQL Flexible Server 16 | Daily backups, 14 days kept |
| Secrets | Key Vault | The web app reads them through its managed identity; no secret is in the code or the app's visible settings |
| Sign-in | Microsoft Entra ID | You register the app (step 3) |
| Deploys | GitHub Actions, manual only | `.github/workflows/crm-dashboard-deploy-azure.yml` |

Rough cost for a pilot (B1 App Service plus Burstable B1ms PostgreSQL): about USD 30 to 40 a month. Check the Azure pricing calculator for your region.

### How data is stored

The built-in backend keeps all records as one JSON document in a Postgres table (`crm_state`), with a version number. Each request reads the latest version and writes back only if nobody else wrote first (otherwise it re-runs on the newer data). This is safe and simple for a pilot: tens of users and thousands of records. It is not a relational schema, so you cannot yet report on it with SQL tables. If the pilot grows, the next step is moving each record type to its own table. A new production database starts empty (the first administrator comes from sign-in); set `SEED_SAMPLE_DATA=true` to load demo data instead, never with real data.

## What you must do

1. **Pick where it lives.** Subscription, resource group name and region (for Ghana users, South Africa North or West Europe are the closest). You need Owner or Contributor plus User Access Administrator on the resource group.
2. **Create the resource group, then run the template** (from `crm-dashboard/`):
   ```
   az group create -n <rg> -l <region>
   az deployment group what-if -g <rg> -f infra/main.bicep -p infra/main.parameters.example.json   # review first
   az deployment group create  -g <rg> -f infra/main.bicep -p infra/main.parameters.example.json
   ```
   Copy `main.parameters.example.json`, fill in the Entra IDs and the first administrator's work email, and pass the three secrets on the command line, not in a file: `entraClientSecret`, `authSessionSecret` (generate with `openssl rand -base64 48`) and `postgresAdminPassword` (16+ characters). The template was written without being run against Azure, so expect to fix small things the first time; `what-if` finds most of them.
3. **Register the app in Entra** (Entra admin center, App registrations, New):
   - Single tenant, platform "Web", redirect URI `https://<your-host>/auth/callback` (the template prints it as `redirectUri`).
   - Copy the Application (client) ID and Directory (tenant) ID into the parameters.
   - Certificates and secrets: create a client secret and use it as `entraClientSecret`. Note its expiry date and put a reminder in your calendar.
   - No API permissions beyond the default `User.Read` are needed.
4. **Set up GitHub deploys** (once): create an Entra app (or managed identity) with a federated credential for this repository and the `production` environment, give it Contributor on the resource group, then in GitHub add secrets `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` and the variable `AZURE_WEBAPP_NAME` (the `webAppName` output). Add a required reviewer on the `production` environment so a deploy always needs a person to approve.
5. **First sign-in.** Run the deploy workflow, open the site, sign in with the bootstrap administrator's work email, then add everyone else on the Team page by work email. People who are not added are refused.
6. **Before real data goes in:**
   - Confirm the backup works: restore the database to a new server once and check it.
   - Replace the "Allow Azure services" database firewall rule with a private endpoint or VNet integration if your policy requires it.
   - Add a custom domain and certificate (then set `appBaseUrl` and add the new redirect URI in Entra).
   - Turn on Application Insights and an alert on 5xx errors if you want monitoring.
   - Decide on the data-protection position for customer and visit data (location, retention, who can see what).
7. **Say go.** Going live (the first run of the deploy workflow) happens only when you confirm.

## Things to know

- Run one App Service instance, or more: several instances are safe because writes are version-checked. A busy system would want the relational step above first.
- The demo role picker is off in production. `ALLOW_DEMO_AUTH` must stay unset.
- Secrets rotate by adding a new version in Key Vault and restarting the app. The Entra client secret expires; renewing it is the most likely reason sign-in stops working one day.
- Connecting the real DAS API later means setting `DAS_API_BASE_URL` at build time. It replaces the built-in backend, so Postgres would then be unused.
