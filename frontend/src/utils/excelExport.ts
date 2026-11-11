import ExcelJS from "exceljs";
import { Issue, TimeEntry, VersionMeta } from "../types/issue";
import { todayString } from "./activity";
import { PerformanceRow } from "./performance";
import { ChildScope, childHours, ParentProgressRow, StatusSeries } from "./parentProgress";
import {
  aggregateByPriority,
  aggregateByRelease,
  aggregateByStatus,
  aggregateByTracker,
  bucketAgingOpenTickets,
  countClosed,
  countNotClosed,
  estimateVsActual,
  releaseDatesByName,
  ticketAgeDays,
  UserMonthRow,
  UserTimeSummaryRow,
} from "./aggregations";

/** Hours to two decimals, so a logged 1h40m shows as 1.67 rather than 1.6666660000000002. */
const roundHours = (n: number): number => Math.round(n * 100) / 100;

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };

export function styleHeaderRow(sheet: ExcelJS.Worksheet, rowNumber = 1) {
  const row = sheet.getRow(rowNumber);
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = HEADER_FILL;
  row.alignment = { vertical: "middle" };
}

function addMasterSheet(workbook: ExcelJS.Workbook, issues: Issue[], redmineBaseUrl: string, releaseDates: Map<string, string>) {
  const sheet = workbook.addWorksheet("Master Tickets");
  sheet.columns = [
    { header: "Ticket ID", key: "id", width: 10 },
    { header: "Ticket Link", key: "link", width: 40 },
    { header: "Project", key: "project", width: 20 },
    { header: "Tracker", key: "tracker", width: 12 },
    { header: "Status", key: "status", width: 16 },
    { header: "Priority", key: "priority", width: 10 },
    { header: "Author", key: "author", width: 18 },
    { header: "Subject", key: "subject", width: 40 },
    { header: "Description", key: "description", width: 50 },
    { header: "Done %", key: "doneRatio", width: 8 },
    { header: "Created On", key: "createdOn", width: 14 },
    { header: "Updated On", key: "updatedOn", width: 14 },
    { header: "Assigned To", key: "assignedTo", width: 18 },
    { header: "Target Version", key: "targetVersion", width: 20 },
    { header: "Release Date", key: "releaseDate", width: 14 },
    { header: "Start Date", key: "startDate", width: 12 },
    { header: "Due Date", key: "dueDate", width: 12 },
    { header: "Closed On", key: "closedOn", width: 14 },
    { header: "Estimated Hours", key: "estimatedHours", width: 12 },
    { header: "Direct Time Spent", key: "spentHours", width: 12 },
    { header: "Total Time Spent", key: "totalSpentHours", width: 12 },
    { header: "Total Estimated Time", key: "totalEstimatedHours", width: 14 },
    { header: "Assigned QA", key: "assignedQA", width: 18 },
    { header: "Platform", key: "platform", width: 14 },
    { header: "Additional Assignee", key: "additionalAssignee", width: 18 },
    { header: "Estimated Time for QA", key: "estimatedTimeForQA", width: 16 },
  ];
  for (const issue of issues) {
    const row = sheet.addRow({
      id: issue.id,
      link: `#${issue.id}`,
      project: issue.project,
      tracker: issue.tracker,
      status: issue.status,
      priority: issue.priority,
      author: issue.author,
      subject: issue.subject,
      description: issue.description ?? "",
      doneRatio: issue.doneRatio,
      createdOn: issue.createdOn?.slice(0, 10) ?? "",
      updatedOn: issue.updatedOn?.slice(0, 10) ?? "",
      assignedTo: issue.assignedTo ?? "",
      targetVersion: issue.targetVersion ?? "",
      releaseDate: (issue.targetVersion && releaseDates.get(issue.targetVersion)) || "",
      startDate: issue.startDate ?? "",
      dueDate: issue.dueDate ?? "",
      closedOn: issue.closedOn?.slice(0, 10) ?? "",
      estimatedHours: issue.estimatedHours == null ? "" : roundHours(issue.estimatedHours),
      spentHours: issue.spentHours == null ? "" : roundHours(issue.spentHours),
      totalSpentHours: issue.totalSpentHours == null ? "" : roundHours(issue.totalSpentHours),
      totalEstimatedHours: issue.totalEstimatedHours == null ? "" : roundHours(issue.totalEstimatedHours),
      assignedQA: issue.assignedQA ?? "",
      platform: issue.platform ?? "",
      additionalAssignee: issue.additionalAssignee ?? "",
      estimatedTimeForQA: issue.estimatedTimeForQA ?? "",
    });
    row.getCell("link").value = { text: `#${issue.id}`, hyperlink: `${redmineBaseUrl}/issues/${issue.id}` };
  }
  styleHeaderRow(sheet);
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
  // These two columns are Redmine's roll-ups: a parent's figure already includes its sub-tickets, so adding
  // the column up counts those hours more than once. "Direct Time Spent" / "Estimated Hours" are the ticket's own.
  sheet.getCell("U1").note = "Redmine's roll-up: this ticket plus all its sub-tickets. Do not add this column up — use Direct Time Spent.";
  sheet.getCell("V1").note = "Redmine's roll-up: this ticket plus all its sub-tickets. Do not add this column up — use Estimated Hours.";
}

function addSummarySheet(workbook: ExcelJS.Workbook, issues: Issue[], releaseDates: Map<string, string>) {
  const sheet = workbook.addWorksheet("Summary");
  sheet.columns = [
    { header: "Metric / Group", key: "metric", width: 30 },
    { header: "Value / Count", key: "value", width: 15 },
    { header: "Percent", key: "percent", width: 12 },
    { header: "Release Date", key: "releaseDate", width: 14 },
  ];
  sheet.addRow({ metric: "Total Tickets", value: issues.length });
  sheet.addRow({ metric: "Closed", value: countClosed(issues) });
  sheet.addRow({ metric: "Not Closed", value: countNotClosed(issues) });
  sheet.addRow({});
  sheet.addRow({ metric: "Status Summary" }).font = { bold: true };
  for (const b of aggregateByStatus(issues)) sheet.addRow({ metric: b.key, value: b.count, percent: `${b.percent.toFixed(1)}%` });
  sheet.addRow({});
  sheet.addRow({ metric: "Tracker Summary" }).font = { bold: true };
  for (const b of aggregateByTracker(issues)) sheet.addRow({ metric: b.key, value: b.count, percent: `${b.percent.toFixed(1)}%` });
  sheet.addRow({});
  sheet.addRow({ metric: "Priority Summary" }).font = { bold: true };
  for (const b of aggregateByPriority(issues)) sheet.addRow({ metric: b.key, value: b.count, percent: `${b.percent.toFixed(1)}%` });
  sheet.addRow({});
  sheet.addRow({ metric: "Release Summary" }).font = { bold: true };
  sheet.addRow({ metric: "Release", value: "Total / Closed / Not Closed" });
  for (const r of aggregateByRelease(issues)) {
    sheet.addRow({ metric: r.version, value: r.total, percent: `${r.closed} closed / ${r.notClosed} pending`, releaseDate: releaseDates.get(r.version) ?? "" });
  }
  styleHeaderRow(sheet);
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

function addTimeAnalysisSheet(workbook: ExcelJS.Workbook, issues: Issue[]) {
  const sheet = workbook.addWorksheet("Time Analysis");
  sheet.columns = [
    { header: "Ticket ID", key: "id", width: 10 },
    { header: "Subject", key: "subject", width: 40 },
    { header: "Estimated Hours", key: "estimated", width: 14 },
    { header: "Actual Hours", key: "actual", width: 14 },
    { header: "Variance", key: "variance", width: 12 },
    { header: "Variance %", key: "variancePercent", width: 12 },
  ];
  for (const issue of issues) {
    const r = estimateVsActual(issue);
    if (r.estimatedHours === null && r.actualHours === null) continue;
    sheet.addRow({
      id: issue.id,
      subject: issue.subject,
      estimated: r.estimatedHours === null ? "" : roundHours(r.estimatedHours),
      actual: r.actualHours === null ? "" : roundHours(r.actualHours),
      variance: r.variance === null ? "" : roundHours(r.variance),
      variancePercent: r.variancePercent === null ? "" : `${r.variancePercent.toFixed(1)}%`,
    });
  }
  styleHeaderRow(sheet);
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

function addAgingSheet(workbook: ExcelJS.Workbook, issues: Issue[]) {
  const sheet = workbook.addWorksheet("Aging");
  sheet.addRow(["Aging Bucket", "Count", "Percent"]);
  for (const b of bucketAgingOpenTickets(issues)) sheet.addRow([b.key, b.count, `${b.percent.toFixed(1)}%`]);
  sheet.addRow([]);
  sheet.addRow(["Ticket ID", "Subject", "Status", "Created On", "Age (Days)"]);
  const open = issues
    .filter((i) => !i.statusIsClosed)
    .map((i) => ({ issue: i, age: ticketAgeDays(i) ?? 0 }))
    .sort((a, b) => b.age - a.age);
  for (const { issue, age } of open) {
    sheet.addRow([issue.id, issue.subject, issue.status, issue.createdOn?.slice(0, 10) ?? "", age]);
  }
  sheet.getColumn(2).width = 40;
  styleHeaderRow(sheet);
  styleHeaderRow(sheet, 3 + bucketAgingOpenTickets(issues).length); // the second table's header row
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

export async function downloadWorkbook(workbook: ExcelJS.Workbook, filenamePrefix: string, projectName: string) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeName = projectName.replace(/[^a-z0-9]+/gi, "_");
  const dateStamp = todayString(new Date()); // the user's calendar date, not UTC
  a.href = url;
  a.download = `${filenamePrefix}_${safeName}_${dateStamp}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function exportToExcel(issues: Issue[], redmineBaseUrl: string, projectName: string, versions: VersionMeta[] = []) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Redmine Project Tracker";
  workbook.created = new Date();

  const releaseDates = releaseDatesByName(versions);
  addMasterSheet(workbook, issues, redmineBaseUrl, releaseDates);
  addSummarySheet(workbook, issues, releaseDates);
  addTimeAnalysisSheet(workbook, issues);
  addAgingSheet(workbook, issues);

  await downloadWorkbook(workbook, "redmine", projectName);
}

function addTimeByUserSheet(workbook: ExcelJS.Workbook, rows: UserTimeSummaryRow[], scopeLabel: string) {
  const sheet = workbook.addWorksheet("Time by User");
  sheet.addRow([scopeLabel]);
  sheet.addRow([]);
  sheet.addRow(["User", "Total Hours", "Entries", "By Activity"]);
  for (const r of rows) {
    sheet.addRow([r.user, Number(r.totalHours.toFixed(2)), r.entryCount, r.byActivity.map((a) => `${a.activity}: ${a.hours.toFixed(2)}h`).join(", ")]);
  }
  sheet.getColumn(1).width = 24;
  sheet.getColumn(2).width = 14;
  sheet.getColumn(3).width = 10;
  sheet.getColumn(4).width = 60;
  styleHeaderRow(sheet, 3);
  sheet.views = [{ state: "frozen", ySplit: 3 }];
}

function addNoTicketTimeSheet(workbook: ExcelJS.Workbook, entries: TimeEntry[]) {
  const sheet = workbook.addWorksheet("No-Ticket Time");
  sheet.addRow(["Date", "User", "Project", "Activity", "Hours", "Comment"]);
  for (const e of entries) {
    sheet.addRow([e.spentOn, e.user, e.project, e.activity, Number(e.hours.toFixed(2)), e.comments ?? ""]);
  }
  [12, 24, 24, 20, 10, 60].forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  styleHeaderRow(sheet);
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

function addTimeByMonthSheet(workbook: ExcelJS.Workbook, rows: UserMonthRow[], users: string[]) {
  const sheet = workbook.addWorksheet("Time by Month");
  const header = ["Month", ...users, "Total"];
  sheet.addRow(header);
  for (const row of rows) {
    sheet.addRow([row.monthLabel, ...users.map((u) => Number((row.byUser[u] ?? 0).toFixed(2))), Number(row.total.toFixed(2))]);
  }
  sheet.getColumn(1).width = 14;
  for (let i = 2; i <= header.length; i++) sheet.getColumn(i).width = 14;
  styleHeaderRow(sheet);
  sheet.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
}

/**
 * Exports exactly what the Time Spent by User panel currently shows — respects
 * whatever Ticket ID / Month filter is active there, via the already-filtered rows
 * the caller computed, not raw unfiltered data.
 */
export async function exportTimeSpentToExcel(
  userRows: UserTimeSummaryRow[],
  monthRows: UserMonthRow[],
  monthUsers: string[],
  noTicketEntries: TimeEntry[],
  scopeLabel: string,
  projectName: string
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Redmine Project Tracker";
  workbook.created = new Date();

  addTimeByUserSheet(workbook, userRows, scopeLabel);
  addTimeByMonthSheet(workbook, monthRows, monthUsers);
  addNoTicketTimeSheet(workbook, noTicketEntries);

  await downloadWorkbook(workbook, "redmine_time_spent", projectName);
}

const PERFORMANCE_NOTES = [
  "One row per person per task. A parent task (Epic, Feature…) includes the hours, estimates and bugs of every child ticket under it.",
  "Rows therefore overlap: a person's hours appear on a task and again on each parent above it. Do not add the Estimation or Actuals columns up — the total would count the same hours more than once.",
  "Estimation is that person's share of the task's estimate; it is blank when nothing was estimated for their role.",
  "Complexity and AI usage are not recorded in Redmine yet. Comments is left blank for you to fill in.",
  "Only the rows that were on screen (after the filters) are included.",
];

/** Developer/QA performance report. Deliberately NOT in the layout the other exports use:
 * exactly the agreed field list, header on row 1, no scope/title rows — the Comments
 * column is left blank for the reviewer to fill in by hand after download, and
 * Complexity / AI usage are blank until Redmine records them. */
export async function exportPerformanceToExcel(rows: PerformanceRow[], projectName: string) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Redmine Project Tracker";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Performance");
  sheet.columns = [
    { header: "Name", key: "name", width: 24 },
    { header: "Project", key: "project", width: 24 },
    { header: "Task", key: "task", width: 56 },
    { header: "Complexity", key: "complexity", width: 12 },
    { header: "Estimation", key: "estimation", width: 12 },
    { header: "Actuals", key: "actuals", width: 12 },
    { header: "AI usage", key: "aiUsage", width: 12 },
    { header: "Bugs reported", key: "bugsReported", width: 14 },
    { header: "CT Bugs", key: "ctBugs", width: 10 },
    { header: "Comments", key: "comments", width: 40 },
  ];
  for (const r of rows) {
    sheet.addRow({
      name: r.name,
      project: r.project,
      task: `#${r.taskId} ${r.taskSubject}`,
      complexity: "",
      estimation: r.estimation ?? "",
      actuals: r.actuals,
      aiUsage: "",
      bugsReported: r.bugsReported,
      ctBugs: r.ctBugs,
      comments: "",
    });
  }
  styleHeaderRow(sheet);
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };

  // The Performance sheet above keeps exactly the agreed layout; how to read it goes on a second sheet.
  const notes = workbook.addWorksheet("Notes");
  notes.columns = [{ header: "How to read the Performance sheet", key: "note", width: 120 }];
  for (const line of PERFORMANCE_NOTES) notes.addRow({ note: line });
  styleHeaderRow(notes);

  await downloadWorkbook(workbook, "redmine_performance", projectName);
}

/** Parent tickets with their child tickets summarised by status, plus every child listed. */
export async function exportParentProgressToExcel(
  rows: ParentProgressRow[],
  series: StatusSeries[],
  issueById: Map<number, Issue>,
  redmineBaseUrl: string,
  projectName: string,
  scope: ChildScope = "all"
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Redmine Project Tracker";
  workbook.created = new Date();

  // One column per Redmine status (not the chart's folded "Other"), in the chart's order.
  const statusNames = series.flatMap((s) => s.statuses);
  const parents = workbook.addWorksheet("Parent Progress");
  parents.columns = [
    { header: "Parent ID", key: "id", width: 10 },
    { header: "Subject", key: "subject", width: 48 },
    { header: "Tracker", key: "tracker", width: 12 },
    { header: "Status", key: "status", width: 16 },
    { header: "Assignee", key: "assignee", width: 20 },
    { header: "Project", key: "project", width: 22 },
    { header: "Child Tickets", key: "total", width: 13 },
    ...statusNames.map((name, i) => ({ header: name, key: `status${i}`, width: Math.max(10, name.length + 2) })),
    { header: "Closed (total)", key: "closed", width: 14 },
    { header: "% Closed", key: "closedPercent", width: 10 },
    { header: "Avg % Done", key: "avgDone", width: 11 },
    { header: "Estimated Hours", key: "estimated", width: 14 },
    { header: "Spent Hours", key: "spent", width: 12 },
    { header: "Delivered %", key: "delivered", width: 12 },
    { header: "Hours Left", key: "hoursLeft", width: 11 },
    { header: "Open Tickets Without Estimate", key: "unestimatedOpen", width: 18 },
  ];
  for (const r of rows) {
    const data: Record<string, string | number> = {
      id: r.id,
      subject: r.subject,
      tracker: r.tracker,
      status: r.status,
      assignee: r.assignee ?? "",
      project: r.project,
      total: r.total,
      closed: r.closed,
      closedPercent: r.closedPercent === null ? "" : Math.round(r.closedPercent * 10) / 10,
      avgDone: r.avgDonePercent === null ? "" : Math.round(r.avgDonePercent * 10) / 10,
      estimated: r.estimatedHours === null ? "" : roundHours(r.estimatedHours),
      spent: r.spentHours === null ? "" : roundHours(r.spentHours),
      delivered: r.deliveredPercent === null ? "" : Math.round(r.deliveredPercent * 10) / 10,
      hoursLeft: r.hoursLeft,
      unestimatedOpen: r.unestimatedOpen,
    };
    statusNames.forEach((name, i) => {
      data[`status${i}`] = r.byStatus[name] ?? 0;
    });
    const row = parents.addRow(data);
    row.getCell("id").value = { text: `#${r.id}`, hyperlink: `${redmineBaseUrl}/issues/${r.id}` };
  }
  styleHeaderRow(parents);
  parents.views = [{ state: "frozen", ySplit: 1 }];
  parents.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: parents.columns.length } };

  const kids = workbook.addWorksheet("Child Tickets");
  kids.columns = [
    { header: "Parent ID", key: "parentId", width: 10 },
    { header: "Parent Subject", key: "parentSubject", width: 40 },
    { header: "Ticket ID", key: "id", width: 10 },
    { header: "Subject", key: "subject", width: 48 },
    { header: "Tracker", key: "tracker", width: 12 },
    { header: "Status", key: "status", width: 16 },
    { header: "Closed", key: "closed", width: 9 },
    { header: "Assignee", key: "assignee", width: 20 },
    { header: "% Done", key: "done", width: 9 },
    { header: "Estimated Hours", key: "estimated", width: 14 },
    { header: "Spent Hours", key: "spent", width: 12 },
  ];
  for (const r of rows) {
    for (const id of r.childIds) {
      const c = issueById.get(id);
      if (!c) continue;
      const hours = childHours(c, scope);
      const row = kids.addRow({
        parentId: r.id,
        parentSubject: r.subject,
        id: c.id,
        subject: c.subject,
        tracker: c.tracker,
        status: c.status,
        closed: c.statusIsClosed ? "Yes" : "No",
        assignee: c.assignedTo ?? "",
        done: c.doneRatio,
        estimated: hours.estimated === null ? "" : roundHours(hours.estimated),
        spent: hours.spent === null ? "" : roundHours(hours.spent),
      });
      row.getCell("id").value = { text: `#${c.id}`, hyperlink: `${redmineBaseUrl}/issues/${c.id}` };
    }
  }
  styleHeaderRow(kids);
  kids.views = [{ state: "frozen", ySplit: 1 }];
  kids.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: kids.columns.length } };

  await downloadWorkbook(workbook, "redmine_parent_progress", projectName);
}
