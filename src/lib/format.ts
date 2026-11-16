export const usd = (n: number, cents = false) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: cents ? 2 : 0, minimumFractionDigits: cents ? 2 : 0 });

export const compact = (n: number) =>
  n.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: n < 10000 ? 1 : 1 });

export const usdCompact = (n: number) =>
  n >= 10000 ? "$" + compact(n) : usd(n);

export const pct = (n: number, digits = 2) => (n * 100).toFixed(digits) + "%";

export const int = (n: number) => Math.round(n).toLocaleString("en-US");

export function shortDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
export function longDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}
export function daysBetween(a: string, b: string) {
  return Math.round((new Date(b + "T12:00:00Z").getTime() - new Date(a + "T12:00:00Z").getTime()) / 86400000);
}
export const duration = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
