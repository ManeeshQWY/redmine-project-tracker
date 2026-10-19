import { afterEach, describe, expect, it } from "vitest";
import {
  DAY_OPTIONS,
  DEFAULT_WINDOW,
  isValidDays,
  isValidRange,
  readStoredWindow,
  storeWindow,
  WINDOW_STORAGE_KEY,
  windowKey,
  windowPhrase,
  windowQuery,
} from "./dataWindow";

afterEach(() => localStorage.clear());

describe("default and presets", () => {
  it("defaults to the last 30 days", () => {
    expect(DEFAULT_WINDOW).toEqual({ kind: "days", days: 30 });
    expect(readStoredWindow()).toEqual({ kind: "days", days: 30 });
  });

  it("offers recent periods and an all-time option (0)", () => {
    expect(DAY_OPTIONS.map((o) => o.days)).toEqual([30, 90, 180, 365, 0]);
    expect(DAY_OPTIONS.find((o) => o.days === 0)!.label).toBe("All time");
  });
});

describe("remembering the choice", () => {
  it("remembers a preset, including all-time", () => {
    storeWindow({ kind: "days", days: 90 });
    expect(readStoredWindow()).toEqual({ kind: "days", days: 90 });
    storeWindow({ kind: "days", days: 0 });
    expect(readStoredWindow()).toEqual({ kind: "days", days: 0 });
  });

  it("does not remember an exact date range — the next visit starts from the default", () => {
    storeWindow({ kind: "days", days: 90 });
    storeWindow({ kind: "range", from: "2026-01-01", to: "2026-03-31" });
    expect(readStoredWindow()).toEqual({ kind: "days", days: 90 }); // the earlier preset is untouched
    expect(localStorage.getItem(WINDOW_STORAGE_KEY)).toBe("90");
  });

  it("ignores a saved value that is not one of the options — a blank must not mean all time", () => {
    for (const bad of ["7", "abc", "-1", "30.5", "", "  "]) {
      localStorage.setItem(WINDOW_STORAGE_KEY, bad);
      expect(readStoredWindow()).toEqual(DEFAULT_WINDOW);
    }
    expect(isValidDays(7)).toBe(false);
  });
});

describe("identity and the query string", () => {
  it("gives every window its own key", () => {
    const keys = [
      windowKey({ kind: "days", days: 30 }),
      windowKey({ kind: "days", days: 0 }),
      windowKey({ kind: "range", from: "2026-01-01", to: "2026-03-31" }),
      windowKey({ kind: "range", from: "2026-01-01", to: "2026-04-30" }),
    ];
    expect(new Set(keys).size).toBe(4);
  });

  it("asks the backend for days or for a from/to range", () => {
    expect(windowQuery({ kind: "days", days: 30 })).toBe("days=30");
    expect(windowQuery({ kind: "days", days: 0 })).toBe("days=0");
    expect(windowQuery({ kind: "range", from: "2026-01-01", to: "2026-03-31" })).toBe("from=2026-01-01&to=2026-03-31");
  });
});

describe("validating a range", () => {
  it("accepts a real range, including a single day", () => {
    expect(isValidRange("2026-01-01", "2026-03-31")).toBe(true);
    expect(isValidRange("2026-03-31", "2026-03-31")).toBe(true);
  });

  it("rejects backwards, blank and malformed ranges", () => {
    expect(isValidRange("2026-04-01", "2026-03-01")).toBe(false);
    expect(isValidRange("", "2026-03-31")).toBe(false);
    expect(isValidRange("2026-01-01", "")).toBe(false);
    expect(isValidRange("01/01/2026", "2026-03-31")).toBe(false);
  });
});

describe("wording", () => {
  it("words each kind of window for sentences", () => {
    expect(windowPhrase({ kind: "days", days: 30 })).toBe("the last 30 days");
    expect(windowPhrase({ kind: "days", days: 0 })).toBe("all time");
    expect(windowPhrase({ kind: "range", from: "2026-01-01", to: "2026-03-31" })).toBe("1 Jan 2026 to 31 Mar 2026");
  });
});
