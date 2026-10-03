# DAS Engage 360: gap analysis against the Route-to-Market goals

Based on a review of the code on this branch (98 API endpoints, 28 entities, 8 web pages, a Flutter field app, the Business Central connector). It was not run against real DAS data.

**About "the top three competitors".** I have not been told who they are and have not invented facts about them. This compares the platform with what a strong pharma distributor's route to market normally needs (ordering, coverage, credit, delivery, distributor visibility, forecasting). Name the three and give me what you know about each (how they take orders, whether pharmacies can order online, delivery promise, credit terms) and I will turn this into a side-by-side.

## What is already strong
- **Field execution:** offline-first visits, call reports with photo, signature and voice, GPS check-in, follow-up tasks, planned visits, sample stock and distribution with batch/expiry (FEFO) control.
- **Control and trust:** hash-chained audit log, tenant isolation, role and territory scoping, Entra sign-in design, import dry-runs.
- **Insight:** manager dashboard with customisable widgets, AI call summaries and next-best-action suggestions, RTM coverage view (market size, mapped, reached, channels, regions).
- **ERP link:** Business Central import and outbox for products, customers, sales, receipts, stock.

## What is missing (most important first)

| # | Gap | Why it matters in the open market | Today |
|---|---|---|---|
| 1 | **Order capture** from the field and from customers (offline order, price and stock check, approval) | Whoever makes ordering easiest wins repeat business. Reps who write orders on paper and have them re-typed lose days and make mistakes. | Not in this platform. A separate prototype exists in PR #10 (own server and database), not connected. |
| 2 | **Credit and receivables**: credit limit, overdue balance, block or warn at order time | Pharmacies buy where credit is available; bad debt is the main cost of open-market coverage. | Nothing. |
| 3 | **Pricing, discounts and promotions** per customer class and channel | Competitors compete on terms and bundles. | Nothing. Only `standard_cost` on products. |
| 4 | **Distributor / wholesaler view**: secondary sales (what they sell to outlets), their stock, their payment behaviour | Most of the market is reached through them. Today those outlets are invisible ("reached" counts only DAS visits and invoices). | Distributor is a customer type only. |
| 5 | **Delivery and service level**: order status, dispatch, delivery, on-time-in-full, returns | Reliable delivery is the first thing a pharmacy compares. | Nothing. |
| 6 | **Beat and route planning**: visit frequency by segment, route order, drive time, overdue-visit alerts, "outlets nobody visits" list | Coverage of 3,000 of 27,000 outlets is a planning problem as much as a headcount one. | Planned visits exist; no frequency rules, no route optimisation, no distance/time. |
| 7 | **Targets and performance**: sales and coverage targets by region/channel, achievement, trend | You cannot manage the gap to the goal without a target to measure against. | Visit targets per customer only; no sales or coverage targets. |
| 8 | **Competitor intelligence**: competitor products, prices, shelf share, noted per visit | Shows why outlets are lost and where competitors are strong. | Nothing. |
| 9 | **Demand forecasting and stock health**: forecast by product/warehouse, stock-out and expiry-risk alerts, reorder suggestions | Stock-outs lose sales; expiry loses money. Inventory Planning needs it. | Reorder level for samples only; a basic procurement requisition. |
| 10 | **Customer channels beyond reps**: WhatsApp/SMS reminders and order links, e-ordering page for pharmacies | Low-cost reach for the long tail of outlets that no rep can visit. | Nothing. |
| 11 | **Institutional / tender management**: tender calendar, contract value, renewal dates | Hospitals and public institutions are won on tenders. | Nothing. |
| 12 | **Compliance**: adverse-event capture from visits, promotional material approval, consent for customer data | Regulatory protection for a pharma company. | Audit log and consent notes only. |

## Weaknesses in what exists
- **Not proven on real data or a real phone.** Business Central has not been run against a real tenant; the Android release build, the voice-note quality and the signature fix are unverified on a device; Entra sign-in has not been tried against a real tenant.
- **Dashboard layout is per browser**, not saved on the server.
- **Reports are views only:** no export to Excel/PDF for the review meeting, no scheduled email of the weekly summary.
- **Coverage is only as good as the market-size numbers**, which are estimates until the stakeholder data returns.
- **Offline images and voice** can be large on poor networks; there is no compression or retry reporting beyond the basics.

## Suggested build order
1. **Orders, in this platform** (gap 1), with price list and stock check, reusing PR #10's rules for typing-error guards. This links field work to revenue.
2. **Credit and receivables** (2) and **pricing** (3), because ordering without them cannot go live.
3. **Targets and performance** (7) and **beat planning with overdue-visit alerts** (6): the coverage engine for the RTM goal.
4. **Distributor secondary sales** (4) and **delivery/OTIF** (5).
5. **Competitor notes on visits** (8): small, cheap, and valuable in the review.
6. **Forecast and stock health** (9), **WhatsApp/SMS** (10), **tenders** (11), **compliance** (12).

## Not a software problem
Prices, credit terms, delivery promises, distributor margins and who covers which region are commercial decisions. The platform can measure and enforce them but cannot choose them. The outlet counts (27,000 and 3,000) and the competitor facts must come from people, which is what the data-collection workbooks are for (see `data-collection.md`).

## What I need from you to go further
1. The names of the three competitors and anything you know of how they sell.
2. Which gap to build first (my recommendation: orders, then targets and beat planning).
3. Whether PR #10's order app should be merged into this platform (one server, one database) or kept separate.
