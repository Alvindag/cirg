# Orders

Reps take orders on the phone (offline if needed); managers confirm, deliver or cancel them on the web.

## How it works
1. **Prices.** Orders are priced from the product list price. An Admin, National Sales Manager or Executive sets prices on the web (**Orders → Price list**), or the ERP link sends them (`list_price` in the products CSV, `unitPrice` from Business Central). A product with no price cannot be ordered.
2. **On the phone.** *Orders* tab → *New order*, or *New order* on a customer. Pick products, set quantities. Quantities are whole numbers from 1 to 1,000 (digits only). Above 50, the phone asks "100 × Amoxil 500. Is this right?" and the rep must confirm. The order is saved on the phone and sent with the normal sync, whenever there is a signal. The phone shows an estimate; the server sets the real price.
3. **On the server.** Every order is checked again: the customer must be in the rep's territory, repeated products are added together (and may not exceed 1,000), the price comes from the price list. Each order has an id made on the phone, so a retry never saves it twice. An order the server refuses stays on the phone with the reason until the rep removes it.
4. **In the office.** *Orders* on the web: **Confirm** → **Mark delivered**; **Cancel** needs a reason. A rep may cancel their own order only before it is confirmed (ask the office afterwards). Every change is in the audit log.
5. **Measures.** The summary shows orders and value for the last 30 days, orders waiting, confirmed, delivered, and the average hours from taking an order to delivering it.

## Not built yet
Credit limits and overdue balances, discounts and promotions, stock checks at order time, customer-facing ordering, delivery in-full tracking, sending confirmed orders to Business Central.

## API
`POST /orders`, `GET /orders`, `GET /orders/summary`, `POST /orders/{id}/confirm|deliver|cancel`, `PUT /orders/prices`; orders also travel in `/sync/push` (`orders`) and `/sync/pull` (`orders`, last 90 days).
