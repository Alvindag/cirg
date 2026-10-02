# Dynamics 365 Business Central adapter

DAS Engage 360 talks to Business Central (SaaS) directly through its **standard API v2.0**, signing in as an Entra ID application (client credentials). No gateway is needed for the data below.
Select **Dynamics 365 Business Central** under web → ERP → Connection. Code: `src/backend/src/DasEngage.Api/Erp/BusinessCentral.cs`.

## What flows

| Direction | Data | Business Central source | Notes |
|---|---|---|---|
| BC → DAS | Products | `items` (type Inventory) | `number` → item code, `displayName`, `unitCost` → standard cost, `itemCategoryCode` → therapeutic area. **Reorder level is not in the standard API**, so it stays as set in DAS Engage. |
| BC → DAS | Customer accounts | `customers` | `number` → account code, name, city, phone, e-mail. BC's customer `type` (Company/Person) says nothing about pharmacy or hospital, so DAS Engage's classification is kept. |
| BC → DAS | Sales | `salesInvoices` + lines, `salesCreditMemos` + lines | Draft and in-review documents are skipped. Only item lines. Credit memos are negative. Line id = `INV:{number}/{line}` or `CM:{number}/{line}`. Empty currency = the company's local currency. |
| BC → DAS | Stock levels | `items.inventory` | **Item totals only** (no batches), read as a full snapshot each pull because stock movements do not change an item's modified time. |
| DAS → BC | Purchase requisitions | `purchaseOrders` + `purchaseOrderLines` | Created as a **draft purchase order** for the vendor in `Erp:BusinessCentral:DefaultVendorNumber`; purchasing reviews and releases it. The order number comes back as the reference. If the line is refused, the empty header is deleted. |
| DAS → BC | Sample issues, distributions, write-offs, returns | custom API page `sampleMovements` | **Needs the extension in `src/businesscentral/`** (below): the standard API cannot post item journals or transfers. |
| (neither) | Goods receipts with batch and expiry | – | Lot numbers and expiry dates are not in the standard API. Use CSV import or push (`/integration/v1/goods-receipts`), or extend BC. |

Changes are read incrementally by `lastModifiedDateTime` (with a skip count, so records sharing a timestamp across a page are neither lost nor repeated). Pulls run on the schedule set on the connection (5 minutes at the fastest).

## Set-up

1. **Entra app registration** for the integration (separate from the sign-in apps in `entra-setup.md`): note the application (client) id and create a client secret.
2. **In Business Central** (search *Microsoft Entra Applications*): add the application's client id, set state *Enabled*, grant admin consent, and assign a **least-privilege permission set** that can read items, customers and sales documents and create purchase orders. Avoid full-access sets. Do this in a **sandbox** environment first.
3. **Store the secret** in Key Vault, then pass its URI to the deployment: `businessCentralSecretUri`, plus `businessCentralClientId` and `businessCentralVendor` (see `infra/main.bicep`). The secret is then available to the connection under the name **`BC_CLIENT_SECRET`**. Locally use configuration `Secrets:BC_CLIENT_SECRET` and `Erp:BusinessCentral:ClientId`.
4. **Connection** (web → ERP): provider *Dynamics 365 Business Central*; address
   `https://api.businesscentral.dynamics.com/v2.0/{tenant}/{environment}/api/v2.0/companies({company id})`;
   secret name `BC_CLIENT_SECRET`; use **Test connection**. Only `api.businesscentral.dynamics.com` addresses are accepted.
5. Follow the go-live checklist in `erp-integration.md` (products first, then customers, then sales).

Settings (all optional except the client id): `Erp:BusinessCentral:ClientId`, `…:DefaultVendorNumber`, `…:CustomApi` (default `das/engage/v1.0`), `…:LoginHost` (default `login.microsoftonline.com`).

## Custom API page for sample movements

The extension is in `src/businesscentral/` (see its README): API page `sampleMovements`, a message log, and a processor that turns messages into **unposted** item journal lines (transfers for issues and returns, negative adjustments for distributions and write-offs) for warehouse staff to review and post.

`POST https://api.businesscentral.dynamics.com/v2.0/{tenant}/{env}/api/das/engage/v1.0/companies({id})/sampleMovements`

```json
{ "messageId": "guid", "messageType": "sample.issue", "createdAt": "2026-10-01T09:00:00Z", "payload": "<the JSON payload as a string, shapes in erp-integration.md>" }
```

It is idempotent on `messageId` and returns `{ "number": "DAS-..." }`, the document number on the journal lines. A 400 or 404 is treated as permanent and parked for a person to fix; 401/403, 429 and 5xx are retried. Setup (locations, journal batches, rep-to-location mapping, job queue) is in the extension's README.

## What is not verified

- **Never run against a real Business Central.** The Microsoft API documentation could not be reached from the build environment, so entity and field names (`items`, `unitCost`, `salesInvoiceLines` with `$expand`, `lineObjectNumber`, `netAmount`, `status`, `creditMemoDate`, …) come from knowledge of API v2.0 and are covered only by tests against scripted responses. Run it against a sandbox and expect to adjust field names or filters.
- Business Central rows are assumed ordered stably by `lastModifiedDateTime`; if rows with equal timestamps come back in varying order, a few could be skipped.
- Only SaaS (`api.businesscentral.dynamics.com`); on-premises, sovereign clouds and other API versions are not supported. Custom fields, dimensions, price lists and multi-currency conversion are not handled.
- Voided or cancelled invoices are mirrored only through BC's corrective credit memo.
- **The AL extension has never been compiled** (no compiler or symbols were available), so expect compile fixes. Its lot/item-tracking assignment writes reservation entries directly and is the least certain part. It is not built or checked in CI.
