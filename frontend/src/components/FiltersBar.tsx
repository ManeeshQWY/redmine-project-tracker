import { Issue } from "../types/issue";
import { EMPTY_FILTERS, TicketFilters } from "../utils/filters";

interface Props {
  issues: Issue[];
  filters: TicketFilters;
  onChange: (filters: TicketFilters) => void;
}

function uniqueSorted(values: (string | null)[], fallback: string): string[] {
  const set = new Set(values.map((v) => v ?? fallback));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export default function FiltersBar({ issues, filters, onChange }: Props) {
  const projectsInView = uniqueSorted(issues.map((i) => i.project), "(blank)");
  const statuses = uniqueSorted(issues.map((i) => i.status), "(blank)");
  const trackers = uniqueSorted(issues.map((i) => i.tracker), "(blank)");
  const priorities = uniqueSorted(issues.map((i) => i.priority), "(blank)");
  const assignees = uniqueSorted(issues.map((i) => i.assignedTo), "(Unassigned)");
  const versions = uniqueSorted(issues.map((i) => i.targetVersion), "No Target Version");
  const authors = uniqueSorted(issues.map((i) => i.author), "(blank)");

  const set = <K extends keyof TicketFilters>(key: K, value: TicketFilters[K]) => onChange({ ...filters, [key]: value });

  const selectCls =
    "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        {projectsInView.length > 1 && (
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-slate-500">Project</label>
            <select className={selectCls} value={filters.project} onChange={(e) => set("project", e.target.value)}>
              <option value="">All</option>
              {projectsInView.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-slate-500">Status</label>
          <select className={selectCls} value={filters.status} onChange={(e) => set("status", e.target.value)}>
            <option value="">All</option>
            {statuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-slate-500">Tracker</label>
          <select className={selectCls} value={filters.tracker} onChange={(e) => set("tracker", e.target.value)}>
            <option value="">All</option>
            {trackers.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-slate-500">Priority</label>
          <select className={selectCls} value={filters.priority} onChange={(e) => set("priority", e.target.value)}>
            <option value="">All</option>
            {priorities.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-slate-500">Assignee</label>
          <select className={selectCls} value={filters.assignee} onChange={(e) => set("assignee", e.target.value)}>
            <option value="">All</option>
            {assignees.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-slate-500">Target Version</label>
          <select className={selectCls} value={filters.targetVersion} onChange={(e) => set("targetVersion", e.target.value)}>
            <option value="">All</option>
            {versions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-slate-500">Author</label>
          <select className={selectCls} value={filters.author} onChange={(e) => set("author", e.target.value)}>
            <option value="">All</option>
            {authors.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-slate-500">Created From</label>
          <input type="date" className={selectCls} value={filters.dateFrom} onChange={(e) => set("dateFrom", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-slate-500">Created To</label>
          <input type="date" className={selectCls} value={filters.dateTo} onChange={(e) => set("dateTo", e.target.value)} />
        </div>
        <div className="flex flex-1 min-w-[200px] flex-col gap-1">
          <label className="text-[11px] font-medium text-slate-500">Search (ID, subject, description, author, assignee)</label>
          <input
            type="text"
            placeholder="Search tickets…"
            className={selectCls}
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
          />
        </div>
        <button
          onClick={() => onChange(EMPTY_FILTERS)}
          className="rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
        >
          Clear Filters
        </button>
      </div>
    </div>
  );
}
