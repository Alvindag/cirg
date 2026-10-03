const int = new Intl.NumberFormat("en-GB");
const date = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });
const dateTime = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

export const fmtInt = (n: number) => int.format(n);
export const fmtDate = (iso: string) => date.format(new Date(iso));
export const fmtDateTime = (iso: string) => dateTime.format(new Date(iso));
export const shortId = (id: string) => id.slice(0, 8);
export const errorText = (e: unknown) =>
  e instanceof Error ? e.message : String(e);

const ghs = new Intl.NumberFormat("en-GH", {
  style: "currency",
  currency: "GHS",
  maximumFractionDigits: 0,
});
export const fmtMoney = (n: number) => ghs.format(n);
export const fmtPct = (n: number, digits = 1) => `${n.toFixed(digits)}%`;
