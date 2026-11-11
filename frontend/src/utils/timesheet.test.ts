import { describe, expect, it } from "vitest";
import { makeEntry, makeIssue } from "../test-utils/factories";
import { buildTimesheet, lastWorkingDays } from "./timesheet";

describe("lastWorkingDays", () => {
  it("is the last Monday–Friday dates up to the end date, oldest first", () => {
    expect(lastWorkingDays("2026-03-11", 5)).toEqual(["2026-03-05", "2026-03-06", "2026-03-09", "2026-03-10", "2026-03-11"]);
  });

  it("starts from the Friday when the end date is a weekend", () => {
    expect(lastWorkingDays("2026-03-08", 2)).toEqual(["2026-03-05", "2026-03-06"]); // 8 March 2026 is a Sunday
  });
});

describe("buildTimesheet", () => {
  const issues = [
    makeIssue({ id: 1, assignedTo: "Dan" }),
    makeIssue({ id: 2, assignedTo: "Quiet Quinn" }), // has work, logged nothing
    makeIssue({ id: 3, assignedTo: "Closed Carl", status: "Closed", statusIsClosed: true }),
  ];
  const entries = [
    makeEntry({ id: 1, user: "Dan", spentOn: "2026-03-09", hours: 6 }),
    makeEntry({ id: 2, user: "Dan", spentOn: "2026-03-09", hours: 6 }), // 12 h in a day
    makeEntry({ id: 3, user: "Dan", spentOn: "2026-03-10", hours: 3 }),
    makeEntry({ id: 4, user: "Dee", spentOn: "2026-02-01", hours: 2 }), // before the days shown
  ];
  const sheet = buildTimesheet(entries, issues, "2026-03-11", 3);
  const row = (name: string) => sheet.people.find((p) => p.name === name)!;

  it("shows hours per person per day over the last working days", () => {
    expect(sheet.days).toEqual(["2026-03-09", "2026-03-10", "2026-03-11"]);
    expect(row("Dan").hoursByDay).toEqual({ "2026-03-09": 12, "2026-03-10": 3 });
    expect(row("Dan")).toMatchObject({ total: 15, daysLogged: 2, missingDays: 1, overDays: 1 });
  });

  it("works out the share of capacity", () => {
    expect(row("Dan").capacityPercent).toBeCloseTo((15 / 18) * 100); // 3 days x 6 h
  });

  it("includes someone with open tickets who logged nothing, as all missing", () => {
    expect(row("Quiet Quinn")).toMatchObject({ total: 0, daysLogged: 0, missingDays: 3, openTickets: 1, lastLogged: null });
  });

  it("includes someone who logged earlier but nothing recently, with the date they last did", () => {
    expect(row("Dee")).toMatchObject({ missingDays: 3, lastLogged: "2026-02-01" });
  });

  it("leaves out someone with nothing open and nothing logged", () => {
    expect(sheet.people.map((p) => p.name)).not.toContain("Closed Carl");
  });

  it("lists the people missing the most days first", () => {
    expect(sheet.people.map((p) => p.name)).toEqual(["Quiet Quinn", "Dee", "Dan"]);
  });

  it("honours the hours-per-day and daily-maximum settings", () => {
    const strict = buildTimesheet(entries, issues, "2026-03-11", 3, 5, 4);
    expect(strict.people.find((p) => p.name === "Dan")!.overDays).toBe(1); // only the 12 h day
    expect(strict.people.find((p) => p.name === "Dan")!.capacityPercent).toBeCloseTo((15 / 15) * 100);
  });
});
