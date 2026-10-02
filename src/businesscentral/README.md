# DAS Engage 360 Integration (Business Central extension, AL)

Adds the custom API page the DAS Engage adapter delivers sample movements to, plus the code that turns them into item journal lines.
**Written without an AL compiler or a Business Central environment: compile it and test it in a sandbox before anything else** (see "First run").

## What it contains
| Object | Purpose |
|---|---|
| API page 50100 `DAS Sample Movements` | `POST /api/das/engage/v1.0/companies({id})/sampleMovements` with `{ messageId, messageType, createdAt, payload }`. Validates, stores the message, answers with `number` (the document number). Idempotent on `messageId`. |
| Table 50100 `DAS Sample Message` | The message log (payload, status, error, document no.). |
| Codeunit 50100 `DAS Sample Processor` | Turns waiting messages into item journal lines; schedule it in **Job Queue Entries** (object type Codeunit, ID 50100), or use *Process now*. |
| Codeunit 50101 `DAS Sample Journal Builder` | The mapping, one message at a time, in its own transaction (a failure only marks that message *Needs review*). |
| Pages 50101-50103, tables 50101-50102 | Message list (Process now / Retry / Show payload), setup card, rep-to-location list. |
| Permission set 50100 `DAS ENGAGE` | Assign it to the Entra application registered in *Microsoft Entra Applications* (together with what the sales-data reads need). |

## Mapping (lines are created, never posted: warehouse staff review and post the journals)
| Message | Journal | Lines |
|---|---|---|
| `sample.issue` | Reclassification (transfer) | main location to the rep's location, one line per batch |
| `sample.return` | Reclassification (transfer) | rep's location to the main location |
| `sample.distribution` | Item journal | negative adjustment at the rep's location, description names the customer |
| `sample.adjustment` (write-off, or a decrease) | Item journal | negative adjustment at the warehouse or the rep's location |
| `sample.adjustment` with an increase | – | marked *Needs review*: a person enters it (it needs an expiry date the message does not carry) |

The batch number becomes the lot number when the item has an item tracking code. The document number on every line is the message's `number` (`DAS-` + 16 characters of the message id), which is also the reference stored in DAS Engage.

## Set-up
1. Publish the extension to the sandbox (VS Code AL Language, `app.json` here; change the publisher and id range if needed).
2. Open **DAS Engage Setup**: main location, the consumption journal template/batch (type Item) and the transfer template/batch (type Transfer), optional reason code.
3. Open **DAS Rep Locations**: one row per sales rep (the rep id is in the message payload, shown with *Show payload*) and the location that holds their samples. Create the locations first.
4. Add a job queue entry for codeunit 50100 (for example every 5 minutes), category of your choice.

## First run (what to check)
1. It compiles against your Business Central version (`app.json` says 24.0; adjust `platform`/`application`).
2. `POST` a message by hand with a token for the integration application; repeat the same `messageId` and check the second answer returns the same `number` (a 201 or a 409 are both accepted by DAS Engage).
3. Run *Process now* for each message type and check the journal lines, **including the lot / item tracking lines** (the lot assignment writes reservation entries directly, the least certain part) and that the journals post.
4. Check an item without lot tracking, a missing rep location and an unknown item all end as *Needs review* with a clear message.
