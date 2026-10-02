# Route-to-Market review: collecting data from internal stakeholders

Five ready-made Excel workbooks are in `docs/templates/`. Send each one to its owner, ask for it back by a date, then load the returned files with `scripts/import-workbook.py`.

| Workbook | Owner | What it asks for | Loaded into the platform? |
|---|---|---|---|
| `1-Territory-Managers` | Territory Managers | **1A Outlets** (every pharmacy, OTC shop, clinic, doctor they know, including ones not visited), 1B territory profile, 1C local distributors | 1A: yes (customers, with channel and outlet class) |
| `2-Institutions-and-Export` | Institutions & Export Manager | **2A Institutions**, 2B tenders and contracts, 2C export markets | 2A: yes |
| `3-National-Sales-Manager` | National Sales Manager | **3A Market size** (how many outlets exist, by region and kind), 3B channel roles, 3C field teams, 3D competitors, 3E targets and budget, 3F key distributors | 3A: yes (the outlet universe that coverage is measured against) |
| `4-Inventory-Planning` | Inventory Planning Lead | **4A Products**, 4B stock by warehouse, 4C stock policy, 4D 12-24 months of demand | 4A: yes (products). Live stock comes from Business Central |
| `5-Logistics-and-Transport` | Logistics & Transport Lead | 5A warehouses, 5B fleet, 5C delivery lanes, 5D cost and service, 5E van routes | No: for the review's analysis |

Sheets that are not loaded are for the review team to analyse (they feed the channel, warehouse and cost recommendations). Every sheet has the purpose in row 2 and a hint for each column in row 5; drop-down lists keep answers consistent. Red headings are required.

The workbooks contain personal data (customer names, phone numbers): share them only with the review team (Data Protection Act, 2012, Act 843).

## Loading returned files

```
pip install openpyxl
python scripts/import-workbook.py --token <ADMIN TOKEN> returned\*.xlsx           # check only, nothing saved
python scripts/import-workbook.py --token <ADMIN TOKEN> --apply returned\*.xlsx   # load
```

* `--api` defaults to `http://localhost:5111`; use the deployed address for live.
* Outlets: new ones are added, existing ones (same name and type) are updated. The dry run lists every row problem (unknown territory, unknown channel and so on) so you can send it back to the person to fix.
* Territory names must match the platform exactly; create territories first under Admin.
* Market size and products need an Admin token; the universe is replaced by what is in 3A.
* Regenerate the workbooks after changing columns: `python scripts/make-data-request.py`.
* The outlet sheets use the same columns as the customer CSV import, so a plain CSV with those headings also works at `POST /api/v1/customers/import`.
