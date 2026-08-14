import { useEffect, useRef, useState } from "react";
import { Issue } from "../types/issue";
import { applyFilters, EMPTY_FILTERS, TicketFilters } from "../utils/filters";

interface Props {
  issues: Issue[];
  filters: TicketFilters;
  onChange: (filters: TicketFilters) => void;
}

function uniqueSorted(values: (string | null)[], fallback: string): string[] {
  const set = new Set(values.map((v) => v ?? fallback));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/** Options for one dropdown are computed from issues filtered by every OTHER active
 * filter (cascading) — e.g. once Tracker=Bug is picked, the Status dropdown only offers
 * statuses that actually occur on bugs, instead of every status in the whole project. */
function optionsExcluding(issues: Issue[], filters: TicketFilters, exclude: keyof TicketFilters): Issue[] {
  return applyFilters(issues, { ...filters, [exclude]: "", search: "" });
}

function useDebouncedSearch(committed: string, onCommit: (value: string) => void, delay = 250) {
  const [local, setLocal] = useState(committed);
  const lastCommitted = useRef(committed);

  // External reset (e.g. Clear Filters) — sync without re-triggering our own debounce.
  useEffect(() => {
    if (committed !== lastCommitted.current) {
      lastCommitted.current = committed;
      setLocal(committed);
    }
  }, [committed]);

  useEffect(() => {
    if (local === lastCommitted.current) return;
    const timer = setTimeout(() => {
      lastCommitted.current = local;
      onCommit(local);
    }, delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);

  return [local, setLocal] as const;
}

export default function FiltersBar({ issues, filters, onChange }: Props) {
  const [searchInput, setSearchInput] = useDebouncedSearch(filters.search, (v) => set("search", v));

  const projectsInView = uniqueSorted(issues.map((i) => i.project), "(blank)");
  const statuses = uniqueSorted(optionsExcluding(issues, filters, "status").map((i) => i.status), "(blank)");
  const trackers = uniqueSorted(optionsExcluding(issues, filters, "tracker").map((i) => i.tracker), "(blank)");
  const priorities = uniqueSorted(optionsExcluding(issues, filters, "priority").map((i) => i.priority), "(blank)");
  const assignees = uniqueSorted(optionsExcluding(issues, filters, "assignee").map((i) => i.assignedTo), "(Unassigned)");
  const versions = uniqueSorted(optionsExcluding(issues, filters, "targetVersion").map((i) => i.targetVersion), "No Target Version");
  const authors = uniqueSorted(optionsExcluding(issues, filters, "author").map((i) => i.author), "(blank)");

  const set = <K extends keyof TicketFilters>(key: K, value: TicketFilters[K]) => onChange({ ...filters, [key]: value });

  const selectCls =
    "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200";
  const labelCls = "text-[11px] font-medium text-slate-500 dark:text-slate-400";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-end gap-3">
        {projectsInView.length > 1 && (
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Project</label>
            <select className={selectCls} value={filters.project} onChange={(e) => set("project", e.target.value)}>
              <option value="">All</option>
              {projectsInView.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <label className={labelCls}>Status</label>
          <select className={selectCls} value={filters.status} onChange={(e) => set("status", e.target.value)}>
            <option value="">All</option>
            {statuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelCls}>Tracker</label>
          <select className={selectCls} value={filters.tracker} onChange={(e) => set("tracker", e.target.value)}>
            <option value="">All</option>
            {trackers.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelCls}>Priority</label>
          <select className={selectCls} value={filters.priority} onChange={(e) => set("priority", e.target.value)}>
            <option value="">All</option>
            {priorities.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelCls}>Assignee</label>
          <select className={selectCls} value={filters.assignee} onChange={(e) => set("assignee", e.target.value)}>
            <option value="">All</option>
            {assignees.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelCls}>Target Version</label>
          <select className={selectCls} value={filters.targetVersion} onChange={(e) => set("targetVersion", e.target.value)}>
            <option value="">All</option>
            {versions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelCls}>Author</label>
          <select className={selectCls} value={filters.author} onChange={(e) => set("author", e.target.value)}>
            <option value="">All</option>
            {authors.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelCls}>Created From</label>
          <input type="date" className={selectCls} value={filters.dateFrom} onChange={(e) => set("dateFrom", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelCls}>Created To</label>
          <input type="date" className={selectCls} value={filters.dateTo} onChange={(e) => set("dateTo", e.target.value)} />
        </div>
        <div className="flex flex-1 min-w-[200px] flex-col gap-1">
          <label className={labelCls}>Search (ID, subject, description, author, assignee)</label>
          <input
            type="text"
            placeholder="Search tickets…"
            className={selectCls}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <button
          onClick={() => onChange(EMPTY_FILTERS)}
          className="rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          Clear Filters
        </button>
      </div>
    </div>
  );
}
