import ExcelJS from "exceljs";
import { downloadWorkbook, styleHeaderRow } from "./excelExport";

// One way to turn "what this screen shows" into a workbook: a list of sheets, each a header plus
// rows. Every screen's export builds its sheets (see reportSheets.ts) and hands them to
// `exportReport`, so they all look and behave the same: header on row 1, frozen, filterable,
// numbers stored as numbers, ticket numbers as links.

export type Cell = string | number | null | { text: string; hyperlink: string };

export interface ReportColumn {
  header: string;
  key: string;
  width?: number;
}

export interface ReportSheet {
  name: string;
  columns: ReportColumn[];
  rows: Record<string, Cell>[];
}

/** Excel sheet names: at most 31 characters, none of  \ / ? * [ ] : */
export function safeSheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, "-").slice(0, 31) || "Sheet";
}

export function buildReportWorkbook(sheets: ReportSheet[]): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Redmine Project Tracker";
  workbook.created = new Date();
  const used = new Set<string>();

  for (const spec of sheets) {
    let name = safeSheetName(spec.name);
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${safeSheetName(spec.name).slice(0, 28)} ${n}`;
    used.add(name.toLowerCase());

    const sheet = workbook.addWorksheet(name);
    sheet.columns = spec.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? Math.max(12, c.header.length + 2) }));
    for (const row of spec.rows) {
      const added = sheet.addRow(Object.fromEntries(spec.columns.map((c) => [c.key, typeof row[c.key] === "object" && row[c.key] !== null ? (row[c.key] as { text: string }).text : row[c.key] ?? null])));
      for (const c of spec.columns) {
        const value = row[c.key];
        if (value !== null && typeof value === "object") added.getCell(c.key).value = value;
      }
    }
    styleHeaderRow(sheet);
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    if (spec.columns.length > 0) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: spec.columns.length } };
  }
  return workbook;
}

export async function exportReport(sheets: ReportSheet[], filenamePrefix: string, projectName: string): Promise<void> {
  await downloadWorkbook(buildReportWorkbook(sheets), filenamePrefix, projectName);
}
