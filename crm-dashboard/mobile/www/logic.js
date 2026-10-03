// Order-taking rules for the DAS Orders app. Plain functions, no screen code,
// so they can be tested on their own and run on the phone as they are.

export const DEFAULT_RULES = { confirmAboveQty: 50, maxLineQty: 1000 };

/** Whole number from what was typed, or null if it is not one. */
export function parseQty(text) {
  const t = String(text ?? "").trim();
  if (!/^\d{1,6}$/.test(t)) return null;
  return Number(t);
}

/** The cart is { [productId]: qty }. Setting 0 removes the line. */
export function setQty(cart, productId, qty) {
  const next = { ...cart };
  if (!qty || qty < 1) delete next[productId];
  else next[productId] = qty;
  return next;
}

export const unitPrice = (listPrice, discountPct) => Math.round(listPrice * (1 - (discountPct || 0)) * 100) / 100;

export function cartLines(cart, products, customer) {
  return Object.entries(cart)
    .map(([productId, qty]) => {
      const p = products.find((x) => x.id === productId);
      return p ? { productId, name: p.name, qty, unitPrice: unitPrice(p.listPrice, customer?.discountPct) } : null;
    })
    .filter(Boolean);
}

export const total = (lines) => Math.round(lines.reduce((n, l) => n + l.qty * l.unitPrice, 0) * 100) / 100;
export const units = (lines) => lines.reduce((n, l) => n + l.qty, 0);

/** Lines that need a second look before the order can be saved: large quantities. */
export function linesToConfirm(lines, rules = DEFAULT_RULES) {
  return lines.filter((l) => l.qty > rules.confirmAboveQty);
}

/** Problems that stop the order from being saved at all. */
export function blockers(lines, rules = DEFAULT_RULES) {
  if (!lines.length) return "Add at least one product.";
  const big = lines.find((l) => l.qty > rules.maxLineQty);
  if (big) return `${big.qty} of ${big.name} is above the limit of ${rules.maxLineQty}.`;
  return null;
}

export const newId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

/** An order waiting on the phone to be uploaded. */
export function makeOrder(customer, lines, notes, now = new Date()) {
  return { clientId: newId(), customerId: customer.id, customerName: customer.name, at: now.toISOString(), notes: notes || null, lines: lines.map(({ productId, qty }) => ({ productId, qty })), value: total(lines), units: units(lines) };
}

/**
 * Applies the server's answer for each queued order. Accepted ones leave the queue;
 * refused ones stay, marked with the reason, so the rep can see them and fix or delete them.
 * Orders the server did not mention are left untouched (they will be sent next time).
 */
export function applySync(queue, results) {
  const byId = new Map(results.map((r) => [r.clientId, r]));
  return queue.flatMap((o) => {
    const r = byId.get(o.clientId);
    if (!r) return [o];
    if (r.ok) return [];
    return [{ ...o, error: r.error || "The server refused this order." }];
  });
}

/** True for "no connection" failures, as opposed to the server saying no. */
export const isOffline = (e) => !(e && typeof e === "object" && "status" in e);

export function money(n) {
  return new Intl.NumberFormat("en-GH", { style: "currency", currency: "GHS" }).format(n);
}

/** Normalises what the rep typed for the server address. */
export function cleanServerUrl(text) {
  let t = String(text ?? "").trim().replace(/\/+$/, "");
  if (!t) return null;
  if (!/^https?:\/\//i.test(t)) t = `http://${t}`;
  try {
    const u = new URL(t);
    return u.origin;
  } catch {
    return null;
  }
}
