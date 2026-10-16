import ExcelJS from "exceljs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { exportPerformanceToExcel, exportToExcel } from "./excelExport";
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
    complexity: null, estimation: 8, actuals: 6.5, aiUsage: null, bugsReported: 3, ctBugs: 1,
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
