import test from "node:test";
import assert from "node:assert/strict";
import { applySync, blockers, cartLines, cleanServerUrl, linesToConfirm, makeOrder, parseQty, setQty, total, unitPrice } from "../www/logic.js";

const products = [{ id: "p1", name: "Amoxil", listPrice: 10 }, { id: "p2", name: "Zinc", listPrice: 2.5 }];

test("quantities must be whole numbers", () => {
  assert.equal(parseQty("10"), 10);
  assert.equal(parseQty(" 7 "), 7);
  for (const bad of ["", "1.5", "-2", "abc", "1e3", "10 boxes", null]) assert.equal(parseQty(bad), null, String(bad));
});

test("setting a quantity of zero removes the line", () => {
  let cart = setQty({}, "p1", 5);
  cart = setQty(cart, "p2", 2);
  assert.deepEqual(cart, { p1: 5, p2: 2 });
  assert.deepEqual(setQty(cart, "p1", 0), { p2: 2 });
});

test("prices follow the customer's discount", () => {
  assert.equal(unitPrice(10, 0.1), 9);
  const lines = cartLines({ p1: 10, p2: 4 }, products, { discountPct: 0.1 });
  assert.equal(total(lines), 10 * 9 + 4 * 2.25);
});

test("large quantities need a second look, and absurd ones are blocked", () => {
  const lines = cartLines({ p1: 100, p2: 10 }, products, null);
  assert.deepEqual(linesToConfirm(lines).map((l) => l.productId), ["p1"]);
  assert.equal(linesToConfirm(cartLines({ p1: 50 }, products, null)).length, 0);
  assert.match(blockers(cartLines({ p1: 5000 }, products, null)), /above the limit/);
  assert.equal(blockers([]), "Add at least one product.");
  assert.equal(blockers(lines), null);
});

test("a saved order carries ids and quantities but not prices", () => {
  const lines = cartLines({ p1: 3 }, products, null);
  const o = makeOrder({ id: "c1", name: "Korle Clinic" }, lines, "", new Date("2026-10-03T10:00:00Z"));
  assert.deepEqual(o.lines, [{ productId: "p1", qty: 3 }]);
  assert.equal(o.value, 30);
  assert.ok(o.clientId);
});

test("sync keeps refused orders with the reason and drops accepted ones", () => {
  const q = [{ clientId: "a" }, { clientId: "b" }, { clientId: "c" }];
  const out = applySync(q, [{ clientId: "a", ok: true }, { clientId: "b", ok: false, error: "Unknown customer." }]);
  assert.deepEqual(out, [{ clientId: "b", error: "Unknown customer." }, { clientId: "c" }]);
});

test("server addresses are tidied", () => {
  assert.equal(cleanServerUrl("192.168.1.20:3000/"), "http://192.168.1.20:3000");
  assert.equal(cleanServerUrl("https://crm.example.com/x"), "https://crm.example.com");
  assert.equal(cleanServerUrl("  "), null);
});

import { cartFromOrder, lastOrderFor, receiptText } from "../www/logic.js";

test("repeat order uses the latest non-cancelled order and skips withdrawn products", () => {
  const h = [
    { id: "1", customerId: "c1", status: "Delivered", orderedAt: "2026-09-01T00:00:00Z", lines: [{ productId: "p1", name: "Amoxil", qty: 5 }] },
    { id: "2", customerId: "c1", status: "Placed", orderedAt: "2026-09-20T00:00:00Z", lines: [{ productId: "p1", name: "Amoxil", qty: 8 }, { productId: "gone", name: "Old", qty: 2 }] },
    { id: "3", customerId: "c1", status: "Cancelled", orderedAt: "2026-09-25T00:00:00Z", lines: [{ productId: "p1", name: "Amoxil", qty: 99 }] },
  ];
  const last = lastOrderFor(h, "c1");
  assert.equal(last.id, "2");
  const { cart, skipped } = cartFromOrder(last, products);
  assert.deepEqual(cart, { p1: 8 });
  assert.deepEqual(skipped, ["Old"]);
  assert.equal(lastOrderFor(h, "other"), null);
});

test("receipt lists lines, total and a short reference", () => {
  const t = receiptText({ id: "ord-abc12345xyz", customerName: "Korle Clinic", orderedAt: "2026-10-03T10:00:00Z", status: "Placed", units: 12, value: 100, lines: [{ qty: 10, name: "Amoxil", unitPrice: 6.5 }, { qty: 2, name: "Zinc", unitPrice: 17.5 }] }, "Kofi");
  assert.match(t, /Customer: Korle Clinic/);
  assert.match(t, /10 x Amoxil/);
  assert.match(t, /Ref: 45XYZ|Ref: [A-Z0-9]{8}/);
  assert.match(t, /Taken by: Kofi/);
});
