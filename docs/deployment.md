# Deployment: CI pipelines and infrastructure as code

## What exists

| Piece | Where | Purpose |
|---|---|---|
| CI | `.github/workflows/ci.yml` | On every PR and push to `main`: backend build (warnings are errors) and tests on in-memory **and** real PostgreSQL, forgotten-migration check, migrations on an empty database + `/health/ready`, vulnerable NuGet/npm packages, container build + Trivy scan + run as non-root, web typecheck/lint/unit/browser tests, mobile generated-code/analyze/tests, Bicep compile of all environments + lint + checkov, gitleaks. `CI passed` is the single check to require in branch protection. |
| CodeQL | `codeql.yml` | C# and TypeScript static analysis (`security-extended`), weekly and on PRs. |
| Deploy | `deploy.yml` | Staging after CI passes on `main`; production by manual dispatch with approval. |
| Mobile release | `mobile-release.yml` | Signed Android bundle on tag `mobile-v*`; unsigned iOS archive. |
| Dependabot | `dependabot.yml` | Weekly updates for NuGet, npm, pub, Docker, Actions. |
| Infrastructure | `infra/` | Bicep: Container Apps (API + migration job), PostgreSQL Flexible Server, Storage, Key Vault, ACR, Static Web App, Log Analytics/App Insights + alerts, optional Azure OpenAI, optional private networking. Parameter files: `main.{dev,staging,prod}.bicepparam`. |

## One-time setup

1. **Azure**: one subscription (or one per environment) and a resource group per environment.
2. **OIDC identity for GitHub** (no stored cloud secrets): create an app registration or user-assigned identity, add a federated credential for each GitHub environment (`repo:alvindag/cirg:environment:staging`, `...:production`), and grant it `Contributor` plus `User Access Administrator` (the template assigns roles) on the resource group.
3. **GitHub environments** `staging`, `production`, `mobile-release`. Add required reviewers on `production`. Set per environment:
   - Variables: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_RESOURCE_GROUP`, `AZURE_LOCATION`, `ENTRA_WEB_CLIENT_ID`, `ENTRA_TENANT`, `ENTRA_API_SCOPE`.
   - Secret: `POSTGRES_ADMIN_PASSWORD`.
   - `mobile-release`: variables `MOBILE_API_BASE_URL`, `ENTRA_MOBILE_CLIENT_ID`; secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
4. Edit the `.bicepparam` files: audiences, alert e-mails, sizes. Entra app registrations are described in `docs/entra-setup.md`.
5. Branch protection on `main`: require the `CI passed` check.

## How a release flows

1. Platform deployed without the app (registry, database, network, vault).
2. Image built in ACR, tagged with the commit.
3. What-if printed, app deployed with the new image.
4. The migration Job runs and must succeed.
5. `/health/ready` must pass; if any step from the app deploy on fails, the API is set back to the previous image. **Migrations are not reverted**, so write them to be compatible with the previous version (add first, remove in a later release).
6. The web app is built for that environment and published to Static Web Apps with the API origin inserted into its CSP.

## Local equivalents

- `docker compose up` for API + PostgreSQL + Azurite; `scripts/dev-token.py` mints a dev token.
- `POSTGRES_ADMIN_PASSWORD=x az bicep build-params --file infra/main.prod.bicepparam --stdout`
- `TEST_POSTGRES="Host=localhost;Username=postgres;Password=postgres" dotnet test` in `src/backend`.

## What has and has not been verified

Verified in the build environment: backend tests pass on in-memory and on real PostgreSQL (167); the container image builds, runs as non-root, and passes its probes; every Bicep parameter file compiles, lints clean and passes checkov; the web dashboard passes the browser test under the production security headers; workflow files pass `actionlint`.

**Not verified:**
- **No real Azure deployment or what-if has been run.** Expect to fix first-run issues (naming collisions, role-assignment timing, quota, region availability of OpenAI models).
- The workflows themselves have never run on GitHub; step-level problems (action versions, runner differences) will only show on the first run. The pinned Flutter version in `ci.yml` should be checked against the one used locally.
- The Android signing and iOS flows are untested. iOS produces an unsigned archive only.
- Static Web Apps publishing via the CLI is untested.
- Front Door / WAF, custom domains and certificates are not included.
- Private networking (`networkIsolation`) is on for staging and production, but making the registry private as well is optional hardening not done here.
- `dotnet format` is not gated.
- Azure OpenAI and ERP connections have not been tested against real services.
