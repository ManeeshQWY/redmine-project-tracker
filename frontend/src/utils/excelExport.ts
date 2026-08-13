import ExcelJS from "exceljs";
import { Issue } from "../types/issue";
import {
  aggregateByPriority,
  aggregateByRelease,
  aggregateByStatus,
  aggregateByTracker,
  bucketAgingOpenTickets,
  countClosed,
  countNotClosed,
  estimateVsActual,
  ticketAgeDays,
} from "./aggregations";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };

function styleHeaderRow(sheet: ExcelJS.Worksheet) {
  const row = sheet.getRow(1);
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = HEADER_FILL;
  row.alignment = { vertical: "middle" };
}

function addMasterSheet(workbook: ExcelJS.Workbook, issues: Issue[], redmineBaseUrl: string) {
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
      startDate: issue.startDate ?? "",
      dueDate: issue.dueDate ?? "",
      closedOn: issue.closedOn ?? "",
      estimatedHours: issue.estimatedHours ?? "",
      spentHours: issue.spentHours ?? "",
      totalSpentHours: issue.totalSpentHours ?? "",
      totalEstimatedHours: issue.totalEstimatedHours ?? "",
      assignedQA: issue.assignedQA ?? "",
      platform: issue.platform ?? "",
      additionalAssignee: issue.additionalAssignee ?? "",
      estimatedTimeForQA: issue.estimatedTimeForQA ?? "",
    });
    row.getCell("link").value = { text: `#${issue.id}`, hyperlink: `${redmineBaseUrl}/issues/${issue.id}` };
  }
  styleHeaderRow(sheet);
  sheet.autoFilter = { from: "A1", to: `Y1` };
}

function addSummarySheet(workbook: ExcelJS.Workbook, issues: Issue[]) {
  const sheet = workbook.addWorksheet("Summary");
  sheet.columns = [
    { header: "Metric / Group", key: "metric", width: 30 },
    { header: "Value / Count", key: "value", width: 15 },
    { header: "Percent", key: "percent", width: 12 },
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
    sheet.addRow({ metric: r.version, value: r.total, percent: `${r.closed} closed / ${r.notClosed} pending` });
  }
  styleHeaderRow(sheet);
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
      estimated: r.estimatedHours ?? "",
      actual: r.actualHours ?? "",
      variance: r.variance ?? "",
      variancePercent: r.variancePercent === null ? "" : `${r.variancePercent.toFixed(1)}%`,
    });
  }
  styleHeaderRow(sheet);
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
}

export async function exportToExcel(issues: Issue[], redmineBaseUrl: string, projectName: string) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Redmine Project Tracker";
  workbook.created = new Date();

  addMasterSheet(workbook, issues, redmineBaseUrl);
  addSummarySheet(workbook, issues);
  addTimeAnalysisSheet(workbook, issues);
  addAgingSheet(workbook, issues);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeName = projectName.replace(/[^a-z0-9]+/gi, "_");
  const dateStamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `redmine_${safeName}_${dateStamp}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
