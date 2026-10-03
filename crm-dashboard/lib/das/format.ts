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
