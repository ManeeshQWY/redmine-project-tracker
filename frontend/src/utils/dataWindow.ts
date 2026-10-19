// How far back tickets (by last update) and time entries (by date spent) are loaded.
// Loading a whole large instance is slow and can exhaust the free host's memory, so the
// default is recent activity only; the person can widen it or pick an exact date range.

export type LoadWindow =
  | { kind: "days"; days: number } // the last N days; 0 = everything
  | { kind: "range"; from: string; to: string }; // YYYY-MM-DD, both inclusive

/** Must match the backend's DEFAULT_WINDOW_DAYS. */
export const DEFAULT_WINDOW: LoadWindow = { kind: "days", days: 30 };

export const DAY_OPTIONS: { days: number; label: string }[] = [
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
  { days: 180, label: "Last 6 months" },
  { days: 365, label: "Last 12 months" },
  { days: 0, label: "All time" }, // 0 = no limit
];

export const WINDOW_STORAGE_KEY = "rtt.windowDays";

export function isValidDays(days: number): boolean {
  return DAY_OPTIONS.some((o) => o.days === days);
}

/** Both dates present, real-looking, and not backwards. */
export function isValidRange(from: string, to: string): boolean {
  const date = /^\d{4}-\d{2}-\d{2}$/;
  return date.test(from) && date.test(to) && !Number.isNaN(Date.parse(from)) && !Number.isNaN(Date.parse(to)) && from <= to;
}

/** Only the preset periods are remembered between visits. An exact range is a one-off
 * question, and reopening the app on a stale range would be a confusing default. */
export function readStoredWindow(): LoadWindow {
  try {
    const stored = localStorage.getItem(WINDOW_STORAGE_KEY);
    // A blank value must not become 0 ("all time") — that is the expensive option.
    if (stored !== null && stored.trim() !== "") {
      const days = Number(stored);
      if (Number.isInteger(days) && isValidDays(days)) return { kind: "days", days };
    }
  } catch {
    // storage unavailable (private window etc.) — fall back to the default
  }
  return DEFAULT_WINDOW;
}

export function storeWindow(window: LoadWindow): void {
  if (window.kind !== "days") return;
  try {
    localStorage.setItem(WINDOW_STORAGE_KEY, String(window.days));
  } catch {
    // storage unavailable — the choice just won't persist
  }
}

/** Stable identity for effect dependencies and comparisons. */
export function windowKey(window: LoadWindow): string {
  return window.kind === "days" ? `d${window.days}` : `r${window.from}~${window.to}`;
}

/** The query string the backend expects. */
export function windowQuery(window: LoadWindow): string {
  return window.kind === "days" ? `days=${window.days}` : `from=${window.from}&to=${window.to}`;
}

function formatDay(iso: string): string {
  // Parsed as UTC and printed as UTC so the day never shifts with the viewer's timezone.
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** For sentences: "the last 30 days", "all time", "1 Jan 2026 to 31 Mar 2026". */
export function windowPhrase(window: LoadWindow): string {
  if (window.kind === "range") return `${formatDay(window.from)} to ${formatDay(window.to)}`;
  return window.days > 0 ? `the last ${window.days} days` : "all time";
}
