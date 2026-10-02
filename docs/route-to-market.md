# Route-to-market review: how the platform supports it

The DAS Route-to-Market (RTM) review asks where DAS reaches the market, through which channels, and where the gaps are.
DAS Engage 360 is the data and execution layer for that work: it measures the current model and then runs the model the review chooses.

## What the brief gives us

- Open market: about 3,000 customers served directly out of more than 27,000 (about 11%).
- Institutions: about 600 served directly out of about 3,000 (20%).
- Overall: about 3,600 of 30,000 outlets, or 12%. Roughly 88% of the market is reached only through distributors and wholesalers.
- Channels today: national (van) sales team, medical sales team, distributors and wholesalers, limited direct supply to key accounts, walk-in sales at head office and branches.
- Warehouses: two at head office, plus Takoradi, Tamale and Kumasi.
- Out of scope: evaluating individual sales people. The RTM view therefore reports on channels, kinds of outlet and regions only.

## Where each objective lands

| Brief objective | In the platform | Still needed |
|---|---|---|
| Map and assess channels | `Customer.Channel`; revenue and reach by channel on the **RTM** page | Distributor sell-out data (what wholesalers sell on). The integration API can receive it from middleware. |
| Segment customers | `Customer.OutletClass`: teaching, regional and district hospital, pharmacy chain, independent pharmacy, OTC shop, clinic or other | Tagging the existing outlets (the page lists what is untagged) |
| Competitor benchmarking | Not built | A structured competitor field in call reports would capture it from the field |
| Coverage gaps, secondary cities and rural areas | Market size by kind of outlet and region, against mapped and reached; gap per region | Honest market-size estimates, with their source recorded |
| Supply chain | Stock snapshot and requisitions through Business Central | Stock and fill rate by warehouse |
| Strategy and investment | Baseline KPIs to track the phased plan against | Decisions from the review |
| Technology (analytics, CRM, ERP) | This platform, with the Business Central adapter | Verification against the real Business Central tenant |

## What was added

- Outlets carry a channel and a kind of outlet. Both start as "not tagged yet".
- **Market size**: the estimated number of outlets by kind and (optionally) region. Only national leaders and administrators edit it. Each row can record its source.
- **RTM page** (managers): market size, outlets mapped, outlets reached (visited or invoiced in the period), concentration of revenue in the top 20% of buyers, coverage by kind of outlet, channel mix, regions with their gap, and a to-do list of untagged outlets that can be tagged in place.
- A manager restricted to an area sees that area only, and no national comparison, because the market size is national.

API: `GET /api/v1/dashboards/rtm`, `GET/PUT /api/v1/rtm/universe`, `GET /api/v1/rtm/untagged`, `PUT /api/v1/rtm/customers/{id}`.

## Limits to be honest about

- The coverage percentages are only as good as the market-size estimates. The platform does not know the 27,000 or the 3,000; it is told them.
- "Reached" counts visits and invoices in the period. Sales by a distributor to an outlet DAS does not invoice are invisible.
- Nothing here has run on real DAS data yet, and the Business Central adapter has not been run against a real tenant.
- Customer and location data are personal data under Ghana's Data Protection Act, 2012 (Act 843); the review should say who owns the outlet list and how it is protected.
