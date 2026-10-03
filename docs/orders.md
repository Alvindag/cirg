# Orders

Reps take orders on the phone (offline if needed); managers confirm, deliver or cancel them on the web.

## How it works
1. **Prices.** Orders are priced from the product list price. An Admin, National Sales Manager or Executive sets prices on the web (**Orders → Price list**), or the ERP link sends them (`list_price` in the products CSV, `unitPrice` from Business Central). A product with no price cannot be ordered.
2. **On the phone.** *Orders* tab → *New order*, or *New order* on a customer. Pick products, set quantities. Quantities are whole numbers from 1 to 1,000 (digits only). Above 50, the phone asks "100 × Amoxil 500. Is this right?" and the rep must confirm. The order is saved on the phone and sent with the normal sync, whenever there is a signal. The phone shows an estimate; the server sets the real price.
3. **On the server.** Every order is checked again: the customer must be in the rep's territory, repeated products are added together (and may not exceed 1,000), the price comes from the price list. Each order has an id made on the phone, so a retry never saves it twice. An order the server refuses stays on the phone with the reason until the rep removes it.
4. **In the office.** *Orders* on the web: **Confirm** → **Mark delivered**; **Cancel** needs a reason. A rep may cancel their own order only before it is confirmed (ask the office afterwards). Every change is in the audit log.
5. **Measures.** The summary shows orders and value for the last 30 days, orders waiting, confirmed, delivered, and the average hours from taking an order to delivering it.

## Credit
- **Balances.** Business Central (or any ERP) sends what each customer owes with `POST /api/v1/erp/import/balances` (CSV `account_code,credit_limit,outstanding,overdue`, or the same as JSON; also at `/integration/v1/balances` with an API key). A column left out keeps the stored value; an account code that matches no customer is refused (link it first). A limit can also be set by hand: web **Orders → Credit**, or `PUT /credit/{customerId}` (National Sales Manager, Executive, Admin; 0 or empty removes the limit).
- **The rule.** When an order is taken, the customer is checked. If they have **overdue invoices**, or what they owe **plus orders not yet delivered plus this order** is **over their limit**, the order is still taken (the rep may be offline, in front of the customer) but put **on credit hold**, with the reason. Customers with no balance record, or no limit and nothing overdue, are never held.
- **Releasing.** Only a National Sales Manager or Admin can confirm a held order, and must give a reason (kept on the order and in the audit log). Area and regional managers see "Needs a credit release". The rep sees "Held for credit review".
- **Overview.** `GET /credit/overview`: overdue and owed totals, customers over their limit, orders on hold, and the customers to watch.

## Not built yet
Discounts and promotions, stock checks at order time, customer-facing ordering, sending confirmed orders to Business Central.

## API
`POST /orders`, `GET /orders`, `GET /orders/summary`, `POST /orders/{id}/confirm|deliver|cancel`, `PUT /orders/prices`; orders also travel in `/sync/push` (`orders`) and `/sync/pull` (`orders`, last 90 days).

## Delivery service (on time, in full)
- **Promise.** Confirming an order sets a promised delivery time: two days later by default, or the date the office chooses (`POST /orders/{id}/confirm` with `promisedDate`).
- **In full.** *Mark delivered* asks whether the whole order was delivered. If not, what was short must be written (kept with the order).
- **Measures.** `GET /orders/summary` reports, for delivered orders that carry a promise: **on time** (delivered by the promised time), **in full**, and **OTIF** (both), overall and by region, plus the number of confirmed orders already past their promised date. Orders delivered before this was in place carry no promise and are left out of the percentages.

## Distributor sales (sell-out)
Most outlets are reached through distributors, who invoice them, not DAS. To see them:
1. Ask each distributor for what they sold to which outlet (template: `docs/templates/distributor-sell-out-template.csv`; columns `distributor, outlet, date, quantity, net_amount`, optionally `outlet_code, item_code, reference`). The distributor must exist as a customer of type *Distributor* (matched by ERP account code or name).
2. Route to market page → **Distributors** → choose the file → **Check file**, review, then **Load**. Roles that may import customers can load it. Loading the same file again changes nothing; a `reference` (for example the invoice number) lets a later file correct a line.
3. Outlets are matched to DAS customers by `outlet_code` (ERP account code) or by name (capitals, punctuation and titles ignored; two customers with the same name are never guessed between). Unmatched outlets are listed so they can be added as customers.
4. The page then shows what each distributor sold, the outlets matched, and the outlets **reached only through a distributor** (sold to in the period, but not visited or invoiced by DAS). The Route to market summary shows that number beside "reached"; it is **not** added to "reached", so the two stay comparable with earlier periods.

Credit balances can be loaded the same way with the template `docs/templates/erp-balances-template.csv` (`POST /api/v1/erp/import/balances`).
