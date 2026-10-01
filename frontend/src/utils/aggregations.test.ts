import { describe, expect, it } from "vitest";
import { aggregateTimeByUserAndMonth } from "./aggregations";
import { TimeEntry } from "../types/issue";

function makeTimeEntry(overrides: Partial<TimeEntry> = {}): TimeEntry {
  return { id: 1, project: "P", issueId: 1, user: "Alice", activity: "Development", hours: 1, comments: null, spentOn: "2026-01-01", ...overrides };
}

describe("aggregateTimeByUserAndMonth", () => {
  it("groups hours by month then by user, sorted months ascending", () => {
    const { rows, users } = aggregateTimeByUserAndMonth([
      makeTimeEntry({ id: 1, user: "Alice", hours: 5, spentOn: "2026-02-10" }),
      makeTimeEntry({ id: 2, user: "Bob", hours: 3, spentOn: "2026-01-15" }),
      makeTimeEntry({ id: 3, user: "Alice", hours: 2, spentOn: "2026-01-20" }),
    ]);

    expect(rows.map((r) => r.monthKey)).toEqual(["2026-01", "2026-02"]);
    expect(rows[0].byUser).toEqual({ Bob: 3, Alice: 2 });
    expect(rows[0].total).toBe(5);
    expect(rows[1].byUser).toEqual({ Alice: 5 });
    expect(rows[1].total).toBe(5);
    expect(new Set(users)).toEqual(new Set(["Alice", "Bob"]));
  });

  it("sums multiple entries from the same user in the same month", () => {
    const { rows } = aggregateTimeByUserAndMonth([
      makeTimeEntry({ id: 1, user: "Alice", hours: 2, spentOn: "2026-01-01" }),
      makeTimeEntry({ id: 2, user: "Alice", hours: 3, spentOn: "2026-01-20" }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].byUser.Alice).toBe(5);
    expect(rows[0].total).toBe(5);
  });

  it("ranks users by total hours across all months, descending", () => {
    const { users } = aggregateTimeByUserAndMonth([
      makeTimeEntry({ id: 1, user: "Alice", hours: 1, spentOn: "2026-01-01" }),
      makeTimeEntry({ id: 2, user: "Bob", hours: 10, spentOn: "2026-02-01" }),
    ]);

    expect(users).toEqual(["Bob", "Alice"]);
  });

  it("skips entries with a missing or invalid spentOn instead of throwing", () => {
    const { rows } = aggregateTimeByUserAndMonth([
      makeTimeEntry({ id: 1, user: "Alice", hours: 1, spentOn: "" }),
      makeTimeEntry({ id: 2, user: "Alice", hours: 1, spentOn: "not-a-date" }),
      makeTimeEntry({ id: 3, user: "Alice", hours: 2, spentOn: "2026-03-01" }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].total).toBe(2);
  });

  it("returns empty rows/users for no entries", () => {
    expect(aggregateTimeByUserAndMonth([])).toEqual({ rows: [], users: [] });
  });
});
