/** The API's date range for "the last N days, including today" (UTC). */
export function rangeLastDays(days: number, now = new Date()) {
  const start = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - (days - 1),
    ),
  );
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  return { from: start.toISOString(), to: end.toISOString() };
}
