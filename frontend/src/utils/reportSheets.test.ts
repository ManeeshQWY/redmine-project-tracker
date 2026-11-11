import { describe, expect, it } from "vitest";
import { makeEntry, makeIssue } from "../test-utils/factories";
import { dateOnly, STALE_BUCKETS, stalenessMatrix } from "./activity";
import { buildChaseTiles, DEFAULT_CHASE_SETTINGS } from "./chase";
import { buildFlow, wipByAssignee } from "./flow";
import { buildHygiene } from "./hygiene";
import { awaitingQa, bugHealth, estimateAccuracy } from "./insights";
import { buildReadiness } from "./readiness";
import { buildReportWorkbook, ReportSheet, safeSheetName } from "./reportExport";
import {
  accuracySheets,
  awaitingQaSheets,
  bugHealthSheets,
  chaseSheets,
  flowSheets,
  hygieneSheets,
  readinessSheets,
  stalenessSheets,
  ticketCell,
  timesheetSheets,
  userTicketsSheets,
  workloadSheets,
} from "./reportSheets";
import { STAGE_LABELS } from "./stages";
import { buildTimesheet } from "./timesheet";
import { buildRoleLookup, EMPTY_PERFORMANCE_FILTERS } from "./performance";
import { buildWorkload } from "./workload";

const BASE = "https://r.test";
const NOW = new Date("2026-03-20T12:00:00Z");

const ISSUES = [
  makeIssue({ id: 1, tracker: "Epic", subject: "Checkout", targetVersion: "v1" }),
  makeIssue({ id: 2, parentId: 1, subject: 'Cart page, "fast"', status: "Closed", statusIsClosed: true, assignedTo: "Dan", estimatedHours: 4, spentHours: 5.123456, closedOn: "2026-03-10T00:00:00Z", createdOn: "2026-03-01T00:00:00Z", updatedOn: "2026-03-10T00:00:00Z" }),
  makeIssue({ id: 3, parentId: 1, subject: "Payment form", status: "In Progress", assignedTo: "Dan", estimatedHours: 6, spentHours: 1, updatedOn: "2026-03-02T00:00:00Z" }),
  makeIssue({ id: 4, parentId: 1, subject: "Receipt email", status: "Dev Completed", assignedTo: "Dee", estimatedHours: 2, spentHours: 2, updatedOn: "2026-03-05T00:00:00Z" }),
  makeIssue({ id: 5, parentId: 1, subject: "Coupon crash", tracker: "Bug", status: "New", createdOn: "2026-02-01T00:00:00Z", updatedOn: "2026-03-19T00:00:00Z" }),
];

/** The sheet as an array of arrays: header row first, links reduced to their text. */
function grid(sheet: ReportSheet): unknown[][] {
  const text = (v: unknown) => (v !== null && typeof v === "object" ? (v as { text: string }).text : v ?? "");
  return [sheet.columns.map((c) => c.header), ...sheet.rows.map((r) => sheet.columns.map((c) => text(r[c.key])))];
}
const byName = (sheets: ReportSheet[], name: string) => sheets.find((s) => s.name === name)!;

describe("ticketCell", () => {
  it("is a link to the ticket, or plain text when the Redmine address is unknown", () => {
    expect(ticketCell(7, BASE)).toEqual({ text: "#7", hyperlink: "https://r.test/issues/7" });
    expect(ticketCell(7, "")).toBe("#7");
  });
});

describe("buildReportWorkbook", () => {
  const sheets: ReportSheet[] = [
    {
      name: "Data",
      columns: [{ header: "Ticket", key: "t" }, { header: "Hours", key: "h" }, { header: "Note", key: "n" }],
      rows: [{ t: ticketCell(5, BASE), h: 1.5, n: null }, { t: "#6", h: 0, n: "line one\nline two, with \"quotes\" and é" }],
    },
  ];

  it("writes a header on row 1 that is frozen and filterable, numbers as numbers, links as links, blanks as blanks", () => {
    const sheet = buildReportWorkbook(sheets).getWorksheet("Data")!;
    expect((sheet.getRow(1).values as unknown[]).slice(1)).toEqual(["Ticket", "Hours", "Note"]);
    expect(sheet.getRow(2).getCell(1).value).toEqual({ text: "#5", hyperlink: "https://r.test/issues/5" });
    expect(sheet.getRow(2).getCell(2).value).toBe(1.5);
    expect(sheet.getRow(2).getCell(3).value ?? "").toBe("");
    expect(sheet.getRow(3).getCell(2).value).toBe(0); // a real zero stays a zero
    expect(sheet.getRow(3).getCell(3).value).toBe("line one\nline two, with \"quotes\" and é");
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(sheet.autoFilter).toBeTruthy();
  });

  it("keeps sheet names legal and unique", () => {
    expect(safeSheetName("Who/What? [1]: *")).toBe("Who-What- -1-- -");
    expect(safeSheetName("x".repeat(40))).toHaveLength(31);
    const wb = buildReportWorkbook([
      { name: "Same", columns: [{ header: "A", key: "a" }], rows: [] },
      { name: "same", columns: [{ header: "A", key: "a" }], rows: [] },
    ]);
    expect(wb.worksheets).toHaveLength(2);
    expect(new Set(wb.worksheets.map((w) => w.name.toLowerCase())).size).toBe(2);
  });
});

describe("stand-up export", () => {
  const tiles = buildChaseTiles(ISSUES, null, DEFAULT_CHASE_SETTINGS, NOW);
  const sheets = chaseSheets(tiles, BASE);

  it("has one summary line per question and every ticket under its question", () => {
    const summary = grid(byName(sheets, "Summary"));
    expect(summary[0]).toEqual(["Question", "Tickets", "What it means"]);
    expect(summary.length - 1).toBe(tiles.length);
    const quiet = summary.find((r) => r[0] === "Active but gone quiet")!;
    expect(quiet[1]).toBe(1);

    const tickets = byName(sheets, "Tickets");
    expect(tickets.rows.length).toBe(tiles.reduce((n, t) => n + t.items.length, 0)); // nothing dropped, nothing invented
    const row = grid(tickets).find((r) => r[0] === "Active but gone quiet")!;
    expect(row.slice(1, 6)).toEqual(["#3", "Payment form", "Task", "In Progress", "Dan"]);
  });
});

describe("data quality export", () => {
  const sheets = hygieneSheets(buildHygiene(ISSUES, [makeEntry({ id: 1, issueId: null })]), BASE);

  it("exports the checks, the problems, the gaps by person and the tickets behind them", () => {
    const completeness = grid(byName(sheets, "Completeness"));
    const assignee = completeness.find((r) => String(r[0]).includes("assignee"))!;
    expect(assignee.slice(1)).toEqual([2, 3, 66.7, 1]); // #3, #4 of #3, #4, #5
    expect(grid(byName(sheets, "Things that look wrong")).map((r) => r[0])).toContain("Time entries not linked to a ticket (whole project)");
    const missing = grid(byName(sheets, "Tickets with gaps"));
    expect(missing.some((r) => r[0] === "Missing: Has an assignee" && r[1] === "#5")).toBe(true);
  });
});

describe("readiness export", () => {
  it("exports a row per release with the stage counts and the verdict", () => {
    const rows = buildReadiness(ISSUES, "version", new Map([["v1", "2026-03-25"]]), true, NOW);
    const [header, v1] = grid(readinessSheets(rows, "version")[0]);
    expect(header.slice(0, 4)).toEqual(["Release", "Status", "Release date", "Days to release (negative = late)"]);
    expect(v1.slice(0, 5)).toEqual(["v1", "At risk", "2026-03-25", 5, 4]);
    expect(header).toContain("Dev done, awaiting QA");
    expect(header).not.toContain("Dropped");
  });

  it("leaves the date columns out for milestones", () => {
    const rows = buildReadiness(ISSUES, "milestone", new Map(), true, NOW);
    expect(grid(readinessSheets(rows, "milestone")[0])[0]).not.toContain("Release date");
  });
});

describe("flow export", () => {
  it("exports each period and who has work in progress", () => {
    const sheets = flowSheets(buildFlow(ISSUES, NOW, "week"), wipByAssignee(ISSUES, 0));
    const flow = grid(byName(sheets, "Flow"));
    expect(flow[0]).toEqual(["Period", "Starts", "Created", "Closed", "Open at end of period", "Median days to close", "Slowest 10% start at (days)"]);
    expect(flow.length).toBeGreaterThan(2);
    expect(grid(byName(sheets, "Work in progress"))[1]).toEqual(["Dan", 1, "Yes"]);
  });
});

describe("timesheet export", () => {
  it("has a column per working day, then the totals", () => {
    const sheet = timesheetSheets(buildTimesheet([makeEntry({ id: 1, user: "Dan", spentOn: "2026-03-19", hours: 6 })], ISSUES, "2026-03-19", 3))[0];
    const rows = grid(sheet);
    const header = rows[0];
    const dan = rows.find((r) => r[0] === "Dan")!;
    expect(header.slice(0, 4)).toEqual(["Person", "2026-03-17", "2026-03-18", "2026-03-19"]);
    expect(dan.slice(0, 4)).toEqual(["Dan", 0, 0, 6]);
    expect(dan.slice(4)).toEqual([1, 2, 6, 33.3, 0, 1, "2026-03-19"]);
  });
});

describe("current tickets export", () => {
  it("exports each person's counts and the tickets behind them", () => {
    const rows = buildWorkload(ISSUES, buildRoleLookup(["Dan"], []), EMPTY_PERFORMANCE_FILTERS, [], [], NOW);
    const sheets = workloadSheets(rows, BASE);
    const dan = grid(byName(sheets, "Current tickets")).find((r) => r[0] === "Dan")!;
    expect(dan.slice(1, 5)).toEqual(["Developer", 1, 0, 5]); // open #3; 6 h estimated less 1 h logged
    expect(grid(byName(sheets, "Tickets")).filter((r) => r[0] === "Dan").map((r) => r[1])).toEqual(["#3"]);
  });
});

describe("quiet tickets, bug health, accuracy and QA queue exports", () => {
  it("exports the quiet matrix and the tickets in it", () => {
    const rows = stalenessMatrix(ISSUES, NOW, "stage", STAGE_LABELS);
    const sheets = stalenessSheets(rows, "stage", BASE, NOW);
    expect(grid(byName(sheets, "Quiet tickets"))[0]).toEqual(["Stage", ...STALE_BUCKETS.map((b) => b.label), "Open"]);
    const quiet = grid(byName(sheets, "Tickets")).find((r) => r[2] === "#3")!;
    expect(quiet[1]).toBe("15–30 days");
    expect(quiet[quiet.length - 1]).toBe(18);
  });

  it("exports open bugs per person and the bugs themselves", () => {
    const sheets = bugHealthSheets(bugHealth(ISSUES, NOW), BASE);
    expect(grid(byName(sheets, "Open bugs per person"))[1]).toEqual(["(Unassigned)", 1, 1, 47]);
    expect(grid(byName(sheets, "Open bugs"))[1].slice(0, 2)).toEqual(["#5", "Coupon crash"]);
  });

  it("exports estimate accuracy with an Everyone row and the biggest overruns", () => {
    const sheets = accuracySheets(estimateAccuracy(ISSUES, true), BASE);
    const rows = grid(byName(sheets, "Estimate accuracy"));
    expect(rows[rows.length - 1][0]).toBe("Everyone");
    expect(grid(byName(sheets, "Biggest overruns"))[1].slice(0, 2)).toEqual(["#2", 'Cart page, "fast"']);
    expect(grid(byName(sheets, "Biggest overruns"))[1][6]).toBe(5.12); // rounded, not 5.123456
  });

  it("exports the QA queue with days waiting", () => {
    const rows = grid(awaitingQaSheets(awaitingQa(ISSUES, NOW), BASE)[0]);
    expect(rows[1].slice(0, 2)).toEqual(["#4", "Receipt email"]);
    expect(rows[1][rows[1].length - 1]).toBe(15);
  });
});

describe("open tickets per user export", () => {
  it("exports the person's open tickets with how they are on them, rounded hours and links", () => {
    const sheet = userTicketsSheets(
      "Dan",
      [{ issue: makeIssue({ id: 9, subject: "Fix it", estimatedHours: 2.456, spentHours: null, dueDate: "2026-04-01", targetVersion: "v1" }), assignmentType: "Main Assignee", age: 12 }],
      BASE
    )[0];
    const [header, row] = grid(sheet);
    expect(header.slice(0, 3)).toEqual(["Person", "Ticket", "Subject"]);
    expect(row.slice(0, 3)).toEqual(["Dan", "#9", "Fix it"]);
    expect(row).toContain("Main Assignee");
    expect(row).toContain(2.46);
    expect(sheet.rows[0].ticket).toEqual({ text: "#9", hyperlink: "https://r.test/issues/9" });
    expect(row[row.length - 1]).toBe("v1");
  });
});

describe("quiet tickets export columns", () => {
  it("does not have two columns called Assignee", () => {
    const rows = stalenessMatrix(ISSUES, NOW, "assignee", STAGE_LABELS);
    const header = grid(byName(stalenessSheets(rows, "assignee", BASE, NOW), "Tickets"))[0] as string[];
    expect(header.filter((h) => h === "Assignee")).toHaveLength(1);
    expect(header[0]).toBe("Group (assignee)");
  });
});

describe("dateOnly", () => {
  it("keeps a plain date as it is", () => {
    expect(dateOnly("2026-03-20")).toBe("2026-03-20");
  });

  it("dates a UTC timestamp where the user is, like today", () => {
    const stamp = "2026-03-19T20:00:00Z";
    const local = new Date(stamp);
    const expected = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
    expect(dateOnly(stamp)).toBe(expected); // 20 March in India (UTC+5:30), 19 March in UTC
  });

  it("copes with something that is not a date", () => {
    expect(dateOnly("garbage-in-here")).toBe("garbage-in");
  });
});
