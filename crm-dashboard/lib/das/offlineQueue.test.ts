import { describe, expect, it } from "vitest";

import { applySyncResults, isNetworkError, type QueuedVisit } from "./offlineQueue";

const v = (id: string): QueuedVisit => ({ clientId: id, customerId: "c", customerName: "C", at: "", kind: "Visit", outcome: "", notes: null, durationMin: null, productIds: [], latitude: null, longitude: null });

describe("offline queue", () => {
  it("drops accepted and duplicate visits, keeps refused ones with the reason, keeps unknown ones", () => {
    const left = applySyncResults([v("a"), v("b"), v("c"), v("d")], [
      { clientId: "a", ok: true },
      { clientId: "b", ok: true, duplicate: true },
      { clientId: "c", ok: false, error: "The visit time is in the future." },
    ]);
    expect(left.map((x) => x.clientId)).toEqual(["c", "d"]);
    expect(left[0].error).toBe("The visit time is in the future.");
  });
  it("treats a fetch failure as offline but not an HTTP error", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new Error("Unprocessable"))).toBe(false);
  });
});
