import { describe, it, expect } from "vitest";
import {
  countClosed,
  countNotClosed,
  aggregateByStatus,
  aggregateByTracker,
  aggregateByPriority,
  bucketAgingOpenTickets,
  resolutionTimeStats,
  estimateVsActual,
  ticketAgeDays,
  resolutionTimeDays,
} from "../src/utils/aggregations";
import { Issue } from "../src/types/issue";

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 1,
    project: "P",
    tracker: "Bug",
    status: "New",
    statusIsClosed: false,
    priority: "Normal",
    author: "A",
    subject: "S",
    description: null,
    doneRatio: 0,
    createdOn: "2026-01-01T00:00:00Z",
    updatedOn: "2026-01-01T00:00:00Z",
    assignedTo: null,
    targetVersion: null,
    startDate: null,
    dueDate: null,
    closedOn: null,
    estimatedHours: null,
    spentHours: null,
    totalSpentHours: null,
    totalEstimatedHours: null,
    assignedQA: null,
    platform: null,
    additionalAssignee: null,
    estimatedTimeForQA: null,
    customFields: [],
    ...overrides,
  };
}

describe("closed / not closed calculation", () => {
  it("counts closed based on statusIsClosed, not a hardcoded status id", () => {
    const issues = [
      makeIssue({ id: 1, status: "Closed", statusIsClosed: true }),
      makeIssue({ id: 2, status: "Not a Defect", statusIsClosed: true }),
      makeIssue({ id: 3, status: "New", statusIsClosed: false }),
      makeIssue({ id: 4, status: "In Progress", statusIsClosed: false }),
    ];
    expect(countClosed(issues)).toBe(2);
    expect(countNotClosed(issues)).toBe(2);
    expect(countClosed(issues) + countNotClosed(issues)).toBe(issues.length);
  });

  it("handles empty issue list", () => {
    expect(countClosed([])).toBe(0);
    expect(countNotClosed([])).toBe(0);
  });
});

describe("status / tracker / priority aggregation", () => {
  const issues = [
    makeIssue({ id: 1, status: "New", tracker: "Bug", priority: "High" }),
    makeIssue({ id: 2, status: "New", tracker: "Feature", priority: "Normal" }),
    makeIssue({ id: 3, status: "Closed", tracker: "Bug", priority: "High" }),
  ];

  it("aggregates by status with counts and percentages", () => {
    const result = aggregateByStatus(issues);
    const newBucket = result.find((r) => r.key === "New")!;
    expect(newBucket.count).toBe(2);
    expect(newBucket.percent).toBeCloseTo(66.67, 1);
  });

  it("aggregates by tracker", () => {
    const result = aggregateByTracker(issues);
    expect(result.find((r) => r.key === "Bug")!.count).toBe(2);
    expect(result.find((r) => r.key === "Feature")!.count).toBe(1);
  });

  it("aggregates by priority", () => {
    const result = aggregateByPriority(issues);
    expect(result.find((r) => r.key === "High")!.count).toBe(2);
  });
});

describe("null handling", () => {
  it("does not throw on null/blank fields and groups blanks under (blank)", () => {
    const issues = [makeIssue({ id: 1, status: "" })];
    const result = aggregateByStatus(issues);
    expect(result.find((r) => r.key === "(blank)")).toBeTruthy();
  });
});

describe("aging calculation", () => {
  it("computes ticket age only for open tickets", () => {
    const now = new Date("2026-08-13T00:00:00Z");
    const open = makeIssue({ id: 1, statusIsClosed: false, createdOn: "2026-08-05T00:00:00Z" });
    const closed = makeIssue({ id: 2, statusIsClosed: true, createdOn: "2026-08-01T00:00:00Z" });
    expect(ticketAgeDays(open, now)).toBe(8);
    expect(ticketAgeDays(closed, now)).toBeNull();
  });

  it("buckets open tickets into the correct aging ranges", () => {
    const now = new Date("2026-08-13T00:00:00Z");
    const issues = [
      makeIssue({ id: 1, createdOn: "2026-08-12T00:00:00Z" }), // 1 day -> 0-3
      makeIssue({ id: 2, createdOn: "2026-08-06T00:00:00Z" }), // 7 days -> 4-7
      makeIssue({ id: 3, createdOn: "2026-05-01T00:00:00Z" }), // >60 -> 60+
      makeIssue({ id: 4, statusIsClosed: true, closedOn: "2026-08-10T00:00:00Z" }), // excluded (closed)
    ];
    const buckets = bucketAgingOpenTickets(issues, now);
    expect(buckets.find((b) => b.key === "0-3 Days")!.count).toBe(1);
    expect(buckets.find((b) => b.key === "4-7 Days")!.count).toBe(1);
    expect(buckets.find((b) => b.key === "60+ Days")!.count).toBe(1);
    const total = buckets.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBe(3);
  });
});

describe("resolution time", () => {
  it("only calculates resolution time for closed tickets with a closedOn date", () => {
    const noClosedOn = makeIssue({ id: 1, statusIsClosed: true, closedOn: null });
    const open = makeIssue({ id: 2, statusIsClosed: false, closedOn: null });
    const resolved = makeIssue({
      id: 3,
      statusIsClosed: true,
      createdOn: "2026-08-01T00:00:00Z",
      closedOn: "2026-08-05T00:00:00Z",
    });
    expect(resolutionTimeDays(noClosedOn)).toBeNull();
    expect(resolutionTimeDays(open)).toBeNull();
    expect(resolutionTimeDays(resolved)).toBe(4);
  });

  it("computes average/median/min/max across closed tickets", () => {
    const issues = [
      makeIssue({ id: 1, statusIsClosed: true, createdOn: "2026-08-01T00:00:00Z", closedOn: "2026-08-03T00:00:00Z" }), // 2
      makeIssue({ id: 2, statusIsClosed: true, createdOn: "2026-08-01T00:00:00Z", closedOn: "2026-08-05T00:00:00Z" }), // 4
      makeIssue({ id: 3, statusIsClosed: true, createdOn: "2026-08-01T00:00:00Z", closedOn: "2026-08-11T00:00:00Z" }), // 10
      makeIssue({ id: 4, statusIsClosed: false }), // excluded
    ];
    const stats = resolutionTimeStats(issues);
    expect(stats.sampleSize).toBe(3);
    expect(stats.min).toBe(2);
    expect(stats.max).toBe(10);
    expect(stats.median).toBe(4);
    expect(stats.average).toBeCloseTo(16 / 3, 5);
  });

  it("returns nulls when there are no resolvable tickets", () => {
    const stats = resolutionTimeStats([makeIssue({ id: 1, statusIsClosed: false })]);
    expect(stats.sampleSize).toBe(0);
    expect(stats.average).toBeNull();
  });
});

describe("estimated vs actual", () => {
  it("prefers totalSpentHours as the actual effort metric", () => {
    const issue = makeIssue({ estimatedHours: 10, spentHours: 3, totalSpentHours: 8 });
    const result = estimateVsActual(issue);
    expect(result.actualHours).toBe(8);
    expect(result.variance).toBe(-2);
    expect(result.variancePercent).toBeCloseTo(-20, 5);
  });

  it("handles zero estimate safely without dividing by zero", () => {
    const issue = makeIssue({ estimatedHours: 0, totalSpentHours: 5 });
    const result = estimateVsActual(issue);
    expect(result.variance).toBe(5);
    expect(result.variancePercent).toBeNull();
  });

  it("handles null estimate or actual safely", () => {
    const issue = makeIssue({ estimatedHours: null, totalSpentHours: null, spentHours: null });
    const result = estimateVsActual(issue);
    expect(result.variance).toBeNull();
    expect(result.variancePercent).toBeNull();
  });
});
