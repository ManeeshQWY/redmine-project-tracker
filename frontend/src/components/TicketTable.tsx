import { useMemo, useState } from "react";
import { Issue } from "../types/issue";
import { SortField, SortState, sortIssues } from "../utils/filters";
import { blank, formatDate, formatHours } from "../utils/format";

interface Props {
  issues: Issue[];
  redmineBaseUrl: string;
  priorityOrder: string[];
}

const PAGE_SIZES = [25, 50, 100, 200];

const COLUMNS: { field: SortField | null; label: string }[] = [
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

export default function TicketTable({ issues, redmineBaseUrl, priorityOrder }: Props) {
  const [sort, setSort] = useState<SortState>({ field: "createdOn", direction: "desc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const sorted = useMemo(() => sortIssues(issues, sort, priorityOrder), [issues, sort, priorityOrder]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleSort = (field: SortField) => {
    setPage(1);
    setSort((prev) => (prev.field === field ? { field, direction: prev.direction === "asc" ? "desc" : "asc" } : { field, direction: "desc" }));
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 text-xs text-slate-500">
        <span>{sorted.length.toLocaleString()} tickets</span>
        <div className="flex items-center gap-2">
          <span>Rows per page:</span>
          <select
            className="rounded border border-slate-300 px-1.5 py-1"
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
          <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500">
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.label}
                  className={`whitespace-nowrap px-2 py-2 font-medium ${col.field ? "cursor-pointer select-none hover:text-slate-800" : ""}`}
                  onClick={() => col.field && toggleSort(col.field)}
                >
                  {col.label}
                  {col.field === sort.field ? (sort.direction === "asc" ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((issue) => (
              <TicketRow key={issue.id} issue={issue} redmineBaseUrl={redmineBaseUrl} />
            ))}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-2 py-6 text-center text-slate-400">
                  No tickets match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-xs text-slate-500">
        <span>
          Page {currentPage} of {totalPages}
        </span>
        <div className="flex gap-1">
          <button className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40" disabled={currentPage <= 1} onClick={() => setPage(1)}>
            « First
          </button>
          <button className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40" disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)}>
            ‹ Prev
          </button>
          <button className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40" disabled={currentPage >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next ›
          </button>
          <button className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40" disabled={currentPage >= totalPages} onClick={() => setPage(totalPages)}>
            Last »
          </button>
        </div>
      </div>
    </div>
  );
}

function TicketRow({ issue, redmineBaseUrl }: { issue: Issue; redmineBaseUrl: string }) {
  const link = `${redmineBaseUrl}/issues/${issue.id}`;
  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50">
      <td className="px-2 py-1.5 font-medium text-brand-700">
        <a href={link} target="_blank" rel="noreferrer noopener" className="hover:underline">
          #{issue.id}
        </a>
      </td>
      <td className="px-2 py-1.5">{blank(issue.tracker)}</td>
      <td className="px-2 py-1.5">{blank(issue.status)}</td>
      <td className="px-2 py-1.5">{blank(issue.priority)}</td>
      <td className="px-2 py-1.5">{blank(issue.author)}</td>
      <td className="max-w-[280px] truncate px-2 py-1.5" title={issue.subject}>
        <a href={link} target="_blank" rel="noreferrer noopener" className="hover:underline">
          {issue.subject}
        </a>
      </td>
      <td className="px-2 py-1.5">{issue.doneRatio}%</td>
      <td className="px-2 py-1.5">{formatDate(issue.createdOn)}</td>
      <td className="px-2 py-1.5">{formatDate(issue.updatedOn)}</td>
      <td className="px-2 py-1.5">{blank(issue.assignedTo)}</td>
      <td className="px-2 py-1.5">{blank(issue.targetVersion)}</td>
      <td className="px-2 py-1.5">{formatDate(issue.dueDate)}</td>
      <td className="px-2 py-1.5">{formatDate(issue.closedOn)}</td>
      <td className="px-2 py-1.5">{formatHours(issue.estimatedHours)}</td>
      <td className="px-2 py-1.5">{formatHours(issue.spentHours)}</td>
      <td className="px-2 py-1.5">{formatHours(issue.totalSpentHours)}</td>
      <td className="px-2 py-1.5">{formatHours(issue.totalEstimatedHours)}</td>
      <td className="px-2 py-1.5">{blank(issue.assignedQA)}</td>
    </tr>
  );
}
