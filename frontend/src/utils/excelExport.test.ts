import ExcelJS from "exceljs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { exportParentProgressToExcel, exportPerformanceToExcel, exportToExcel } from "./excelExport";
import { buildParentProgress, buildStatusSeries } from "./parentProgress";
import { PerformanceRow } from "./performance";
import { Issue } from "../types/issue";

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 1, parentId: null, project: "P", tracker: "Bug", status: "New", statusIsClosed: false, priority: "Normal",
    author: "A", subject: "S", description: null, doneRatio: 0, createdOn: "2026-01-01T00:00:00Z", updatedOn: "2026-01-01T00:00:00Z",
    assignedTo: null, targetVersion: null, targetVersionId: null, startDate: null, dueDate: null, closedOn: null,
    estimatedHours: null, spentHours: null, totalSpentHours: null, totalEstimatedHours: null, assignedQA: null, platform: null,
    additionalAssignee: null, additionalAssignees: [], assignedQAs: [], estimatedTimeForQA: null, customFields: [],
    ...overrides,
  };
}

// The exporters download via a Blob + <a download> click; capture the Blob and read the
// workbook back so the test asserts on what's actually in the file.
async function runExport(...args: Parameters<typeof exportToExcel>): Promise<ExcelJS.Workbook> {
  return capture(() => exportToExcel(...args));
}

async function capture(run: () => Promise<void>): Promise<ExcelJS.Workbook> {
  let captured: Blob | undefined;
  (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = (b) => {
    captured = b;
    return "blob:test";
  };
  (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

  await run();

  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(captured as Blob);
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

afterEach(() => vi.restoreAllMocks());

describe("exportToExcel release dates", () => {
  const issues = [
    makeIssue({ id: 1, targetVersion: "Sprint 7", targetVersionId: 7 }),
    makeIssue({ id: 2, targetVersion: "Sprint 8", targetVersionId: 8 }),
  ];
  const versions = [
    { id: 7, name: "Sprint 7", dueDate: "2026-03-31", status: "closed" },
    { id: 8, name: "Sprint 8", dueDate: null, status: "open" },
  ];

  it("puts the release date on the Master Tickets rows and the Summary release rows", async () => {
    const wb = await runExport(issues, "https://r.test", "P", versions);

    const master = wb.getWorksheet("Master Tickets")!;
    const dateCol = master.getRow(1).values as unknown[];
    const col = dateCol.indexOf("Release Date");
    expect(col).toBeGreaterThan(0);
    expect(master.getRow(2).getCell(col).value).toBe("2026-03-31");
    expect(master.getRow(3).getCell(col).value ?? "").toBe(""); // version exists, no date set

    const summary = wb.getWorksheet("Summary")!;
    const sprint7 = summary.getRows(1, summary.rowCount)!.find((r) => r.getCell(1).value === "Sprint 7")!;
    expect(sprint7.getCell(4).value).toBe("2026-03-31");
  });

  it("still exports (date columns blank) when no versions are supplied", async () => {
    const wb = await runExport(issues, "https://r.test", "P");
    const master = wb.getWorksheet("Master Tickets")!;
    const col = (master.getRow(1).values as unknown[]).indexOf("Release Date");
    expect(master.getRow(2).getCell(col).value ?? "").toBe("");
  });
});

describe("exportPerformanceToExcel", () => {
  const row: PerformanceRow = {
    key: "42|Dev Dan", name: "Dev Dan", role: "Developer", project: "Alpha", taskId: 42, ancestorIds: [],
    taskSubject: "Login page", tracker: "Story", status: "New", statusIsClosed: false, targetVersion: null,
    complexity: null, estimation: 8, taskEstimate: 8, actuals: 6.5, aiUsage: null, bugsReported: 3, ctBugs: 1,
  };

  it("writes exactly the agreed columns, in order, with the header on row 1", async () => {
    const wb = await capture(() => exportPerformanceToExcel([row], "Alpha"));
    const sheet = wb.getWorksheet("Performance")!;
    const header = (sheet.getRow(1).values as unknown[]).slice(1);
    expect(header).toEqual([
      "Name", "Project", "Task", "Complexity", "Estimation", "Actuals", "AI usage", "Bugs reported", "CT Bugs", "Comments",
    ]);
    expect(wb.worksheets).toHaveLength(1);
  });

  it("fills the data columns and leaves Complexity, AI usage and Comments blank", async () => {
    const wb = await capture(() => exportPerformanceToExcel([row], "Alpha"));
    const r = wb.getWorksheet("Performance")!.getRow(2);
    expect(r.getCell(1).value).toBe("Dev Dan");
    expect(r.getCell(2).value).toBe("Alpha");
    expect(r.getCell(3).value).toBe("#42 Login page");
    expect(r.getCell(4).value ?? "").toBe("");
    expect(r.getCell(5).value).toBe(8);
    expect(r.getCell(6).value).toBe(6.5);
    expect(r.getCell(7).value ?? "").toBe("");
    expect(r.getCell(8).value).toBe(3);
    expect(r.getCell(9).value).toBe(1);
    expect(r.getCell(10).value ?? "").toBe("");
  });
});

describe("exportParentProgressToExcel", () => {
  const issues = [
    makeIssue({ id: 1, tracker: "Epic", subject: "Checkout", assignedTo: "Priya", totalEstimatedHours: 40, totalSpentHours: 12 }),
    makeIssue({ id: 2, parentId: 1, tracker: "Task", subject: "Cart page", status: "Closed", statusIsClosed: true, doneRatio: 100, assignedTo: "Dev Dan" }),
    makeIssue({ id: 3, parentId: 1, tracker: "Task", subject: "Payment form", status: "In Progress", doneRatio: 40 }),
  ];
  const rows = buildParentProgress(issues, "all");
  const series = buildStatusSeries(["New", "In Progress", "Closed"], ["In Progress", "Closed"]);
  const byId = new Map(issues.map((i) => [i.id, i]));

  it("writes one row per parent with a column per status, and the % closed", async () => {
    const wb = await capture(() => exportParentProgressToExcel(rows, series, byId, "https://r.test", "Shop"));
    const sheet = wb.getWorksheet("Parent Progress")!;
    const header = (sheet.getRow(1).values as unknown[]).slice(1);
    expect(header).toEqual([
      "Parent ID", "Subject", "Tracker", "Status", "Assignee", "Project", "Child Tickets",
      "In Progress", "Closed", "Closed", "% Closed", "Avg % Done", "Estimated Hours", "Spent Hours",
    ]);
    const r = sheet.getRow(2);
    expect(r.getCell(2).value).toBe("Checkout");
    expect(r.getCell(7).value).toBe(2); // child tickets
    expect(r.getCell(8).value).toBe(1); // In Progress
    expect(r.getCell(9).value).toBe(1); // Closed
    expect(r.getCell(10).value).toBe(1); // closed count
    expect(r.getCell(11).value).toBe(50); // % closed
    expect(r.getCell(12).value).toBe(70); // average % done
    expect(r.getCell(13).value).toBe(40);
    expect(r.getCell(14).value).toBe(12);
  });

  it("lists every child ticket under its parent on a second sheet", async () => {
    const wb = await capture(() => exportParentProgressToExcel(rows, series, byId, "https://r.test", "Shop"));
    const sheet = wb.getWorksheet("Child Tickets")!;
    expect(sheet.rowCount).toBe(3); // header + two children
    const first = sheet.getRow(2);
    expect(first.getCell(1).value).toBe(1); // parent id
    expect(first.getCell(4).value).toBe("Cart page");
    expect(first.getCell(6).value).toBe("Closed");
    expect(first.getCell(7).value).toBe("Yes");
    expect(first.getCell(8).value).toBe("Dev Dan");
  });

  it("gives each child ticket its estimate and time spent, blank when there is none", async () => {
    const withHours = [
      makeIssue({ id: 1, tracker: "Epic", subject: "Big" }),
      makeIssue({ id: 2, parentId: 1, subject: "Mid", estimatedHours: 1, spentHours: 0.5, totalEstimatedHours: 9, totalSpentHours: 4 }),
      makeIssue({ id: 3, parentId: 2, subject: "Leaf", estimatedHours: 8, spentHours: 3.5, totalEstimatedHours: 8, totalSpentHours: 3.5 }),
      makeIssue({ id: 4, parentId: 1, subject: "Bare" }),
    ];
    const map = new Map(withHours.map((i) => [i.id, i]));
    const parentRows = buildParentProgress(withHours, "all").filter((r) => r.id === 1);
    const all = await capture(() => exportParentProgressToExcel(parentRows, series, map, "https://r.test", "Shop", "all"));
    const sheet = all.getWorksheet("Child Tickets")!;
    const header = (sheet.getRow(1).values as unknown[]).slice(1);
    expect(header.slice(-2)).toEqual(["Estimated Hours", "Spent Hours"]);
    const byName = (name: string) => sheet.getRows(2, sheet.rowCount - 1)!.find((r) => r.getCell(4).value === name)!;
    expect([byName("Leaf").getCell(10).value, byName("Leaf").getCell(11).value]).toEqual([8, 3.5]);
    expect([byName("Mid").getCell(10).value, byName("Mid").getCell(11).value]).toEqual([1, 0.5]); // own hours: rows add up to the parent
    expect([byName("Bare").getCell(10).value ?? "", byName("Bare").getCell(11).value ?? ""]).toEqual(["", ""]);

    const direct = await capture(() =>
      exportParentProgressToExcel(buildParentProgress(withHours, "direct").filter((r) => r.id === 1), series, map, "https://r.test", "Shop", "direct")
    );
    const mid = direct.getWorksheet("Child Tickets")!.getRows(2, 2)!.find((r) => r.getCell(4).value === "Mid")!;
    expect([mid.getCell(10).value, mid.getCell(11).value]).toEqual([9, 4]); // Redmine's total for a child with children
  });
});
