import type { OrderLine } from "./metrics";

/**
 * Rules for taking an order, shared by the server (which enforces them) and
 * described to the app (which uses them to warn early).
 *
 * The aim is to stop typing mistakes such as 100 instead of 10: quantities are
 * whole numbers chosen from a catalog, a large one needs a second look on the
 * phone, and the server refuses anything beyond a hard ceiling.
 */
export const CONFIRM_ABOVE_QTY = 50;
export const MAX_LINE_QTY = 1000;
export const MAX_LINES = 40;

export interface RawLine {
  productId?: unknown;
  qty?: unknown;
}

export type LineCheck = { ok: true; lines: { productId: string; qty: number }[] } | { ok: false; error: string };

/** Checks quantities and merges repeated products into one line. */
export function checkLines(raw: unknown, known: (id: string) => boolean): LineCheck {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: "An order needs at least one product." };
  if (raw.length > MAX_LINES) return { ok: false, error: `An order can have at most ${MAX_LINES} products.` };
  const merged = new Map<string, number>();
  for (const l of raw as RawLine[]) {
    const id = typeof l?.productId === "string" ? l.productId : "";
    if (!known(id)) return { ok: false, error: "The order has a product that is not in the catalog." };
    const qty = l.qty;
    if (typeof qty !== "number" || !Number.isInteger(qty) || qty < 1) return { ok: false, error: "Quantities must be whole numbers of at least 1." };
    const total = (merged.get(id) ?? 0) + qty;
    if (total > MAX_LINE_QTY) return { ok: false, error: `${total} units of one product is above the limit of ${MAX_LINE_QTY}. Check the quantity.` };
    merged.set(id, total);
  }
  return { ok: true, lines: [...merged].map(([productId, qty]) => ({ productId, qty })) };
}

/** The price per unit the customer pays: list price less the distributor discount, to 2 places. */
export const unitPrice = (listPrice: number, discountPct: number) => Math.round(listPrice * (1 - discountPct) * 100) / 100;

export const orderValue = (lines: Pick<OrderLine, "qty" | "unitPrice">[]) => Math.round(lines.reduce((n, l) => n + l.qty * l.unitPrice, 0) * 100) / 100;
