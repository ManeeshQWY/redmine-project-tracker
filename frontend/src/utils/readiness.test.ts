import { describe, expect, it } from "vitest";
import { makeIssue } from "../test-utils/factories";
import { buildReadiness, NO_PARENT, NO_VERSION, ragOf } from "./readiness";

const now = new Date("2026-03-20T12:00:00Z");

describe("ragOf", () => {
  it("is late once the date has passed with work still open", () => {
    expect(ragOf(-3, 90, 0, 2)).toBe("late");
  });
  it("is done when nothing is open, whatever the date or whether there is one", () => {
    expect(ragOf(-30, 100, 0, 0)).toBe("done");
    expect(ragOf(null, 100, 0, 0)).toBe("done");
  });
  it("is at risk when close to the date and less than 70% delivered, or with open bugs in the last week", () => {
    expect(ragOf(10, 50, 0, 5)).toBe("atRisk");
    expect(ragOf(5, 90, 1, 2)).toBe("atRisk");
    expect(ragOf(20, 10, 3, 9)).toBe("onTrack"); // plenty of time yet
    expect(ragOf(10, 80, 2, 4)).toBe("onTrack");
  });
  it("has no verdict without a date, and for a group that has no date concept is simply in progress", () => {
    expect(ragOf(null, 10, 5, 9)).toBe("noDate");
    expect(ragOf(null, 10, 5, 9, false)).toBe("inProgress");
  });
});

describe("buildReadiness by version", () => {
  const issues = [
    makeIssue({ id: 1, tracker: "Epic", targetVersion: "v1" }), // tags its children with v1
    makeIssue({ id: 2, parentId: 1, status: "Closed", statusIsClosed: true, estimatedHours: 4 }),
    makeIssue({ id: 3, parentId: 1, status: "Dev Completed", estimatedHours: 2 }),
    makeIssue({ id: 4, parentId: 1, status: "In Progress", assignedTo: "Dan", estimatedHours: 6, spentHours: 2 }),
    makeIssue({ id: 5, parentId: 1, tracker: "Bug", status: "New" }), // unassigned, no estimate
    makeIssue({ id: 6, status: "New", estimatedHours: 1 }), // no version anywhere
  ];
  const dates = new Map([["v1", "2026-03-25"]]);

  it("groups leaf tickets by their own or inherited version, with stage counts and delivery", () => {
    const rows = buildReadiness(issues, "version", dates, true, now);
    const v1 = rows.find((r) => r.key === "v1")!;
    expect(v1.tickets).toBe(4); // not the Epic itself
    expect(v1.byStage).toMatchObject({ done: 1, devDone: 1, active: 1, notStarted: 1 });
    expect(v1.delivered).toBe(2);
    expect(v1.deliveredPercent).toBe(50);
    expect(v1.hoursPercent).toBe(50); // 6 of 12 estimated hours
    expect(rows.find((r) => r.key === NO_VERSION)!.tickets).toBe(1);
  });

  it("works out days to the release, open bugs, gaps and hours left", () => {
    const v1 = buildReadiness(issues, "version", dates, true, now).find((r) => r.key === "v1")!;
    expect(v1.daysToRelease).toBe(5);
    expect(v1.releaseDate).toBe("2026-03-25");
    expect(v1.openBugs).toBe(1);
    expect(v1.unassigned).toBe(1); // #5; #3 has no assignee either but is delivered, so it is not chased
    expect(v1.noEstimate).toBe(1);
    expect(v1.hoursLeft).toBe(4); // #4: 6 - 2
    expect(v1.rag).toBe("atRisk"); // 5 days out, 50% delivered, a bug open
  });

  it("is late when the date has passed", () => {
    const rows = buildReadiness(issues, "version", new Map([["v1", "2026-03-10"]]), true, now);
    expect(rows[0]).toMatchObject({ key: "v1", daysToRelease: -10, rag: "late" });
  });

  it("moves the finish line back to Closed when asked", () => {
    const v1 = buildReadiness(issues, "version", dates, false, now).find((r) => r.key === "v1")!;
    expect(v1.delivered).toBe(1);
    expect(v1.deliveredPercent).toBe(25);
  });

  it("puts a version with no date in the 'no date' group, last", () => {
    const rows = buildReadiness(issues, "version", dates, true, now);
    expect(rows[rows.length - 1]).toMatchObject({ key: NO_VERSION, rag: "noDate", daysToRelease: null });
    expect(rows[rows.length - 1].openWork).toBe(1);
  });
});

describe("buildReadiness by milestone", () => {
  it("groups leaf tickets under their topmost ancestor and leaves rootless ones together", () => {
    const issues = [
      makeIssue({ id: 1, tracker: "Epic", subject: "Checkout" }),
      makeIssue({ id: 2, parentId: 1, tracker: "Feature" }),
      makeIssue({ id: 3, parentId: 2, status: "Closed", statusIsClosed: true }),
      makeIssue({ id: 4, parentId: 2 }),
      makeIssue({ id: 5 }),
    ];
    const rows = buildReadiness(issues, "milestone", new Map(), true, now);
    expect(rows.map((r) => [r.label, r.tickets])).toEqual([["#1 Checkout", 2], [NO_PARENT, 1]]);
    expect(rows[0].deliveredPercent).toBe(50);
    expect(rows[0].daysToRelease).toBeNull();
  });
});
