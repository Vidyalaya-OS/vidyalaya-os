// Small display helpers shared by the academic and fee screens.

export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Today's date as YYYY-MM-DD in the browser's time zone. */
export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function shortTime(t: string) {
  return t.slice(0, 5);
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "-";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function money(value: string | number | null | undefined, currency = "INR") {
  const n = Number(value ?? 0);
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : undefined, { style: "currency", currency }).format(n);
  } catch {
    return n.toFixed(2);
  }
}

export function pct(value: number | null | undefined) {
  return value == null ? "-" : `${value}%`;
}

/** Trim "45.00" to "45" and "45.50" to "45.5". */
export function num(value: string | number | null | undefined) {
  if (value == null || value === "") return "-";
  return String(Number(value));
}
