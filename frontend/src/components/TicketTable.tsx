import { useMemo, useState } from "react";
import { Issue } from "../types/issue";
import { SortField, SortState, sortIssues } from "../utils/filters";
import { blank, formatDate, formatHours } from "../utils/format";
import { PriorityBadge, StatusBadge } from "./Badge";

interface Props {
  issues: Issue[];
  redmineBaseUrl: string;
  priorityOrder: string[];
}

const PAGE_SIZES = [25, 50, 100, 200];

const BASE_COLUMNS: { field: SortField | null; label: string }[] = [
  { field: "id", label: "ID" },
  { field: null, label: "Tracker" },
  { field: "status", label: "Status" },
  { field: "priority", label: "Priority" },
  { field: null, label: "Author" },
  { field: null, label: "Subject" },
  { field: null, label: "Done %" },
  { field: "createdOn", label: "Created" },
  { field: "updatedOn", label: "Updated" },
  { field: "assignedTo", label: "Assigned To" },
  { field: null, label: "Target Version" },
  { field: "dueDate", label: "Due Date" },
  { field: "closedOn", label: "Closed On" },
  { field: "estimatedHours", label: "Est. Hours" },
  { field: null, label: "Direct Spent" },
  { field: "totalSpentHours", label: "Total Spent" },
  { field: null, label: "Total Estimated" },
  { field: null, label: "Assigned QA" },
];

// Columns whose values are numbers: right-aligned, so the digits line up
const NUMERIC_COLUMNS = new Set(["Done %", "Est. Hours", "Direct Spent", "Total Spent", "Total Estimated"]);

// ID column is pinned during horizontal scroll (18 columns is wide) — needs a solid
// background matching the row/header so scrolled-under content doesn't show through.
const STICKY_ID_CELL = "sticky left-0 z-[1] bg-white dark:bg-slate-900 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]";
const STICKY_ID_HEADER = "sticky left-0 z-20 bg-slate-50 dark:bg-slate-800 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]";

export default function TicketTable({ issues, redmineBaseUrl, priorityOrder }: Props) {
  const [sort, setSort] = useState<SortState>({ field: "createdOn", direction: "desc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Only show the Project column when the current view actually spans more than one
  // project (parent + subprojects, or All Projects) — keeps the normal single-project
  // table uncluttered.
  const showProjectColumn = useMemo(() => new Set(issues.map((i) => i.project)).size > 1, [issues]);
  const columns = useMemo(
    () => (showProjectColumn ? [BASE_COLUMNS[0], { field: "project" as SortField, label: "Project" }, ...BASE_COLUMNS.slice(1)] : BASE_COLUMNS),
    [showProjectColumn]
  );

  const sorted = useMemo(() => sortIssues(issues, sort, priorityOrder), [issues, sort, priorityOrder]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleSort = (field: SortField) => {
    setPage(1);
    setSort((prev) => (prev.field === field ? { field, direction: prev.direction === "asc" ? "desc" : "asc" } : { field, direction: "desc" }));
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
        <span>{sorted.length.toLocaleString()} tickets</span>
        <div className="flex items-center gap-2">
          <span>Rows per page:</span>
          <select
            className="rounded border border-ctl bg-white px-1.5 py-1 dark:border-slate-600 dark:bg-slate-800"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="overflow-auto" style={{ maxHeight: 560 }}>
        <table className="w-full min-w-[1400px] text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <tr>
              {columns.map((col, idx) => (
                <th
                  scope="col"
                  key={col.label}
                  aria-sort={col.field && col.field === sort.field ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}
                  className={`whitespace-nowrap px-3 py-2.5 font-semibold ${NUMERIC_COLUMNS.has(col.label) ? "text-right" : ""} ${idx === 0 ? STICKY_ID_HEADER : ""}`}
                >
                  {col.field ? (
                    <button type="button" onClick={() => toggleSort(col.field!)} className="select-none font-semibold hover:text-slate-900 dark:hover:text-slate-100">
                      {col.label}
                      {col.field === sort.field ? (sort.direction === "asc" ? " ▲" : " ▼") : ""}
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((issue) => (
              <TicketRow key={issue.id} issue={issue} redmineBaseUrl={redmineBaseUrl} showProjectColumn={showProjectColumn} />
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-2 py-6 text-center text-slate-500 dark:text-slate-400">
                  No tickets match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
        <span>
          Page {currentPage} of {totalPages}
        </span>
        <div className="flex gap-1">
          <button className="rounded border border-ctl px-2 py-1 disabled:opacity-40 dark:border-slate-600" disabled={currentPage <= 1} onClick={() => setPage(1)}>
            « First
          </button>
          <button className="rounded border border-ctl px-2 py-1 disabled:opacity-40 dark:border-slate-600" disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)}>
            ‹ Prev
          </button>
          <button className="rounded border border-ctl px-2 py-1 disabled:opacity-40 dark:border-slate-600" disabled={currentPage >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next ›
          </button>
          <button className="rounded border border-ctl px-2 py-1 disabled:opacity-40 dark:border-slate-600" disabled={currentPage >= totalPages} onClick={() => setPage(totalPages)}>
            Last »
          </button>
        </div>
      </div>
    </div>
  );
}

function TicketRow({ issue, redmineBaseUrl, showProjectColumn }: { issue: Issue; redmineBaseUrl: string; showProjectColumn: boolean }) {
  const link = `${redmineBaseUrl}/issues/${issue.id}`;
  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60">
      <td className={`px-2 py-1.5 font-medium text-brand-700 dark:text-brand-400 ${STICKY_ID_CELL}`}>
        <a href={link} target="_blank" rel="noreferrer noopener" className="hover:underline">
          #{issue.id}
        </a>
      </td>
      {showProjectColumn && <td className="px-2 py-1.5">{blank(issue.project)}</td>}
      <td className="px-2 py-1.5">{blank(issue.tracker)}</td>
      <td className="px-2 py-1.5">
        <StatusBadge status={issue.status} isClosed={issue.statusIsClosed} />
      </td>
      <td className="px-2 py-1.5">
        <PriorityBadge priority={issue.priority} />
      </td>
      <td className="whitespace-nowrap px-3 py-2">{blank(issue.author)}</td>
      <td className="max-w-[280px] truncate px-2 py-1.5" title={issue.subject}>
        <a href={link} target="_blank" rel="noreferrer noopener" className="hover:underline">
          {issue.subject}
        </a>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{issue.doneRatio}%</td>
      <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatDate(issue.createdOn)}</td>
      <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatDate(issue.updatedOn)}</td>
      <td className="whitespace-nowrap px-3 py-2">{blank(issue.assignedTo)}</td>
      <td className="whitespace-nowrap px-3 py-2">{blank(issue.targetVersion)}</td>
      <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatDate(issue.dueDate)}</td>
      <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatDate(issue.closedOn)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatHours(issue.estimatedHours)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatHours(issue.spentHours)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatHours(issue.totalSpentHours)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatHours(issue.totalEstimatedHours)}</td>
      <td className="whitespace-nowrap px-3 py-2">{blank(issue.assignedQA)}</td>
    </tr>
  );
}
