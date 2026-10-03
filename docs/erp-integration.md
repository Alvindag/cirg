# ERP integration

DAS Engage 360 does not assume a particular ERP. It defines one **data contract** (below) and three ways to move that data, so a thin adapter or a CSV export is all an ERP needs.
DAS PLC runs Dynamics 365 Business Central, which has its own adapter (`business-central.md`); any other ERP can use the REST gateway below. The adapter is the only ERP-specific part.

| Direction | What | Transport |
|---|---|---|
| ERP → DAS Engage | products (item master, standard cost, reorder level), customer accounts, invoice lines, goods receipts, warehouse stock levels | **push** (`/integration/v1/*`, integration key), **pull** (DAS Engage calls the ERP gateway on a schedule), or **CSV upload** (web app) |
| DAS Engage → ERP | sample issues to reps, samples handed to customers, write-offs and adjustments, returns, approved purchase requisitions | **outbox** delivered to the ERP gateway with retries |

## What it is used for
- **Inventory:** goods receipts create batch stock in the warehouse ledger; stock levels from the ERP are reconciled against it (web → ERP → Reconciliation); sample movements go back to the ERP.
- **Distribution:** invoice lines by customer and product give revenue, growth, top customers and territories (web Overview → Revenue), and make customer scores and opportunity ranking use who actually buys.
- **Finance:** the ERP's standard cost values the samples given out (`GET /samples/reports/spend`); distributions and write-offs are sent to the ERP as consumption.
- **Procurement:** products below their reorder level are suggested for purchase; a requisition needs a second person to approve it and is then sent to the ERP; goods receipts quoting its reference close it.

## Contract (JSON, camelCase; dates `yyyy-MM-dd`)
**Product** `{ "itemCode": "AMX500", "name": "Amoxil 500mg", "therapeuticArea": "Anti-infectives", "standardCost": 1.25, "reorderLevel": 300 }`  
Matched on `itemCode` (case-insensitive); a hand-made product with the same name is linked rather than duplicated.

**Customer** `{ "accountCode": "C001", "name": "Ernest Chemists Osu", "type": "Pharmacy", "city": "Accra", "phone": null, "email": null }`  
Matched on account code, then exact tidied name + city. Ambiguous or unmatched accounts are reported, not guessed. `?createMissing=true` creates the rest (unassigned, unclassified).

**Sale (invoice or credit-note line)** `{ "externalId": "INV-1001/1", "documentNumber": "INV-1001", "date": "2026-09-30", "accountCode": "C001", "itemCode": "AMX500", "quantity": 10, "netAmount": 250.00, "currency": "GHS" }`  
`externalId` must be unique and stable per line; re-sending updates a corrected line. Credit notes are negative. Lines whose account or item is not known yet are kept and attach automatically once linked. Revenue uses the tenant currency (default GHS); other currencies are stored but not mixed in.

**Goods receipt** `{ "externalId": "GR-5521/1", "itemCode": "AMX500", "batchNumber": "B-2611", "expiryDate": "2027-08-01", "quantity": 500, "requisitionRef": "PR-4471", "receivedAt": "2026-10-01T09:00:00Z" }`  
Idempotent on `externalId`. Creates the batch if new; an existing batch must carry the same expiry. Expired, recalled or unknown-item receipts are refused.

**Stock level** `{ "itemCode": "AMX500", "batchNumber": "B-2611", "quantity": 500, "asOf": "2026-10-01T06:00:00Z" }` (omit `batchNumber` for an item total). Newer snapshots replace older ones.

### Pushing into DAS Engage
`POST /integration/v1/{products|customers|sales|goods-receipts|stock-levels}` with a JSON array (max 5,000 records) and the header `X-Integration-Key: dek_…`.
The response lists a result per record (`created`, `updated`, `unchanged`, `duplicate`, `unmatched`, `error` + reason). Records are independent: one bad record never blocks the rest; fix and resend.
Create keys under web → ERP → Keys (shown once, stored hashed, revocable). A key belongs to one organisation and can reach only these endpoints.

### Letting DAS Engage pull
Implement `GET {baseUrl}/dasengage/health` and, for each entity above, `GET {baseUrl}/dasengage/{products|customers|sales|goods-receipts|stock-levels}?since={cursor}&limit=1000`
returning `{ "items": [ ... ], "nextCursor": "opaque-or-null" }`. DAS Engage stores the cursor only after a page was applied, so a failure resumes where it stopped.
Authentication is `Authorization: Bearer <secret>`; the secret's **name** is stored in the connection and its value in configuration or Key Vault (`Secrets:<name>`), never in the database.
The address must be https and must not point at local or private addresses (set `Erp:AllowedHosts` to pin it to the gateway's host, and restrict outbound traffic at the network level too).

### Receiving what DAS Engage sends
`POST {baseUrl}/dasengage/outbox/{type}` with `{ "id": "<guid>", "type": "...", "createdAt": "...", "payload": { ... } }` and the header `Idempotency-Key: <id>`; answer 2xx (optionally `{ "reference": "your document number" }`).
A 5xx, timeout or 429 is retried (after 1 min, 5 min, 30 min, 2 h, then 12 h; 8 tries); another 4xx is treated as permanent and parked as *failed* for a person to fix and retry. **Treat the id as an idempotency key:** the same message can arrive more than once.
| `type` | payload |
|---|---|
| `sample.issue` | `{ requestId, repId, repName, issuedAt, lines: [{ itemCode, batchNumber, quantity }] }` (warehouse → rep stock transfer) |
| `sample.distribution` | `{ distributionId, repId, repName, customerAccountCode, customerName, itemCode, batchNumber, quantity, distributedAt, signed }` (consumption) |
| `sample.adjustment` | `{ kind: "writeoff" or "adjustment", location, repId, itemCode, batchNumber, delta, reason, at }` |
| `sample.return` | `{ repId, itemCode, batchNumber, quantity, note, at }` |
| `purchase.requisition` | `{ requisitionId, itemCode, productName, quantity, neededBy, requestedBy, note }` (return your PR number as `reference`) |

Messages are written in the same database transaction as the change that caused them (transactional outbox), so a change is never saved without its message or the reverse.

## CSV (no gateway needed)
Web → ERP → Import. Columns (header names, any order): products `item_code,name,therapeutic_area,standard_cost,reorder_level`; customers `account_code,name,type,city,phone,email`;
sales `external_id,date,account_code,item_code,quantity,net_amount,document_number,currency`; goods receipts `external_id,item_code,batch_number,expiry_date,quantity,requisition_ref`; stock levels `item_code,batch_number,quantity`.
Dates `yyyy-MM-dd` or `dd/MM/yyyy`; thousands separators are accepted. Unreadable rows are reported and the rest imported.

## Go-live checklist
1. Import products first (item codes link everything else), then customer accounts; review *Unmatched* and link the rest by hand.
2. Import goods receipts or opening stock; compare with the ERP stock levels in *Reconciliation* until it balances.
3. Load 12+ months of invoice lines for revenue trends; check *Unlinked* amounts shrink to ~0.
4. Turn on outbound delivery with the gateway in a test ERP company first; watch the Outbox for failed messages.
5. Agree who owns each failure (ERP team: permanent 4xx from the ERP; DAS administrators: unmatched accounts and items).

## Not yet done
- The ERP is Dynamics 365 Business Central: see `business-central.md` for its adapter (products, customers, sales, stock totals, purchase requisitions; sample movements need a custom API page; goods receipts with batches use CSV or push). Other ERPs use the REST gateway contract above.
- Customer master is one-way (ERP → DAS Engage); credit limits, payment status and price lists are not used.
- Sales orders and delivery notes (only invoiced lines), multi-currency conversion, and the ERP posting its own journals for sample cost are out of scope.
- The background worker is one process; run a single instance or add a lease before scaling the API out.
