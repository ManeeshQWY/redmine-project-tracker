import { useEffect, useMemo, useState } from "react";
import { ALL_PROJECTS, ApiError, getTimeEntries } from "../services/api";
import { Issue, TimeEntry } from "../types/issue";
import { aggregateTimeByUser, aggregateTimeByUserAndMonth } from "../utils/aggregations";
import { exportTimeSpentToExcel } from "../utils/excelExport";
import { formatDateTime, formatHours } from "../utils/format";

interface Props {
  projectIdentifier: string;
  projectLabel: string;
  // Full unfiltered project issues (not the tab's filteredIssues) — needed to walk
  // parent/child relationships regardless of whatever tracker/etc. filter is active
  // elsewhere in the app, so a rollup can't silently miss a child ticket of a
  // different tracker than its parent.
  issues: Issue[];
  onSessionExpired: () => void;
}

/** Every descendant ticket id of `rootId` (children, grandchildren, ...), found by
 * walking parentId links — not just direct children, since a subtask can itself have
 * subtasks. Returns just the root id back if it has no children. */
function collectDescendantIds(rootId: number, issues: Issue[]): Set<number> {
  const childrenByParent = new Map<number, number[]>();
  for (const issue of issues) {
    if (issue.parentId == null) continue;
    const siblings = childrenByParent.get(issue.parentId) ?? [];
    siblings.push(issue.id);
    childrenByParent.set(issue.parentId, siblings);
  }

  const collected = new Set<number>([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const childId of childrenByParent.get(current) ?? []) {
      if (!collected.has(childId)) {
        collected.add(childId);
        queue.push(childId);
      }
    }
  }
  return collected;
}

export default function TimeSpentByUserPanel({ projectIdentifier, projectLabel, issues, onSessionExpired }: Props) {
  const [timeEntries, setTimeEntries] = useState<TimeEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [ticketIdFilter, setTicketIdFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState(""); // "" = All Months
  const [exporting, setExporting] = useState(false);

  // A different project was selected — the previously loaded data is stale, so drop it
  // and require an explicit reload rather than silently showing the wrong project's data.
  useEffect(() => {
    setTimeEntries(null);
    setError(null);
    setFetchedAt(null);
    setTicketIdFilter("");
    setMonthFilter("");
  }, [projectIdentifier]);

  const trimmedFilter = ticketIdFilter.trim();
  const rootTicketId = trimmedFilter && /^\d+$/.test(trimmedFilter) ? Number(trimmedFilter) : null;

  // Rolls up child/grandchild tickets' time too (e.g. an Epic's own logged time is
  // usually 0 — the real hours sit on its subtasks) — not just entries logged directly
  // against the searched id. Computed here, before the early return below, because
  // every hook must run unconditionally on every render — putting it after a
  // conditional return previously crashed the whole panel (blank screen) the moment
  // timeEntries went from null to non-null, since that changes how many hooks run.
  const descendantIds = useMemo(() => (rootTicketId !== null ? collectDescendantIds(rootTicketId, issues) : null), [rootTicketId, issues]);

  async function load(forceRefresh: boolean) {
    setLoading(true);
    setError(null);
    try {
      const result = await getTimeEntries(projectIdentifier, forceRefresh);
      setTimeEntries(result.timeEntries);
      setFetchedAt(result.fetchedAt);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSessionExpired();
        return;
      }
      setError(err instanceof ApiError ? err.message : "Unable to load time entries.");
    } finally {
      setLoading(false);
    }
  }

  if (timeEntries === null) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
          Shows total hours logged by <span className="font-medium">every user who logged time</span> on this
          project&apos;s issues — not just the person an issue is assigned to.
        </p>
        <p className="mb-4 text-xs text-slate-400 dark:text-slate-500">
          {projectIdentifier === ALL_PROJECTS
            ? "This covers every time entry across the whole instance and can take a minute or more to load."
            : "This can take a few seconds to load, depending on how many time entries the project has."}
        </p>
        {error && <p className="mb-3 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
        <button
          onClick={() => load(false)}
          disabled={loading}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Loading time entries…" : "Load Time Data"}
        </button>
      </div>
    );
  }

  // Ticket ID scope first (if any), then the Month filter narrows further on top of
  // that — the two filters compose rather than one overriding the other.
  const ticketFilteredEntries = descendantIds ? timeEntries.filter((e) => e.issueId !== null && descendantIds.has(e.issueId)) : timeEntries;
  const childCount = (descendantIds?.size ?? 1) - 1;

  const availableMonths = Array.from(
    new Map(
      ticketFilteredEntries
        .filter((e) => e.spentOn)
        .map((e) => {
          const d = new Date(e.spentOn);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          return [key, d.toLocaleDateString("en-GB", { month: "short", year: "numeric" })] as const;
        })
    ).entries()
  ).sort((a, b) => a[0].localeCompare(b[0]));

  const monthFilteredEntries = monthFilter
    ? ticketFilteredEntries.filter((e) => {
        if (!e.spentOn) return false;
        const d = new Date(e.spentOn);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` === monthFilter;
      })
    : ticketFilteredEntries;

  const rows = aggregateTimeByUser(monthFilteredEntries);
  const grandTotal = rows.reduce((sum, r) => sum + r.totalHours, 0);
  // The monthly breakdown always shows the full month range within the current ticket
  // scope — not narrowed by monthFilter too, since collapsing it to one row would
  // defeat the point of a month-by-month split. The Month filter is for narrowing the
  // summary table above to one month's totals, not for filtering this table.
  // Plain computation (not useMemo) deliberately — every hook must run unconditionally
  // on every render, and this is already past the early `return` above, same reason
  // `rows`/`grandTotal` right above aren't memoized either.
  const monthBreakdown = aggregateTimeByUserAndMonth(ticketFilteredEntries);

  async function handleExport() {
    setExporting(true);
    try {
      const scopeParts = [`Project: ${projectLabel || projectIdentifier}`];
      scopeParts.push(rootTicketId !== null ? `Ticket #${rootTicketId}${childCount > 0 ? ` + ${childCount} child ticket${childCount === 1 ? "" : "s"}` : ""}` : "All tickets");
      scopeParts.push(monthFilter ? `Month: ${availableMonths.find(([k]) => k === monthFilter)?.[1] ?? monthFilter}` : "All months");
      await exportTimeSpentToExcel(rows, monthBreakdown.rows, monthBreakdown.users, scopeParts.join(" · "), projectLabel || projectIdentifier);
    } finally {
      setExporting(false);
    }
  }

  const selectCls =
    "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200";

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Time Spent by User</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {rootTicketId !== null
                ? `${monthFilteredEntries.length.toLocaleString()} entries on #${rootTicketId}${childCount > 0 ? ` + ${childCount} child ticket${childCount === 1 ? "" : "s"}` : ""} · ${formatHours(grandTotal)}h total`
                : `${monthFilteredEntries.length.toLocaleString()} time entries · ${formatHours(grandTotal)}h total`}
              {fetchedAt && ` · loaded ${formatDateTime(fetchedAt)}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              disabled={exporting || rows.length === 0}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              {exporting ? "Exporting…" : "Export to Excel"}
            </button>
            <button
              onClick={() => load(true)}
              disabled={loading}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              {loading ? "Refreshing…" : "Refresh Time Data"}
            </button>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400" htmlFor="time-ticket-filter">
            Ticket ID
          </label>
          <input
            id="time-ticket-filter"
            type="text"
            inputMode="numeric"
            value={ticketIdFilter}
            onChange={(e) => setTicketIdFilter(e.target.value)}
            placeholder="e.g. 25132"
            className="w-32 rounded-md border border-slate-300 px-2 py-1 text-xs shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
          {trimmedFilter && (
            <button
              onClick={() => setTicketIdFilter("")}
              className="rounded-md border border-slate-300 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Clear
            </button>
          )}

          <label className="ml-2 text-[11px] font-medium text-slate-500 dark:text-slate-400" htmlFor="time-month-filter">
            Month
          </label>
          <select id="time-month-filter" className={selectCls} value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
            <option value="">All Months</option>
            {availableMonths.map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>

          {rootTicketId !== null && (
            <span className="text-[11px] text-slate-400 dark:text-slate-500">
              {childCount > 0
                ? `Includes time logged against #${rootTicketId} and all ${childCount} of its child/subtask ticket${childCount === 1 ? "" : "s"}.`
                : `#${rootTicketId} has no child tickets — showing entries logged directly against it.`}
            </span>
          )}
        </div>

        <div className="max-h-[480px] overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-2 py-1.5">User</th>
                <th className="px-2 py-1.5 text-right">Total Hours</th>
                <th className="px-2 py-1.5 text-right">Entries</th>
                <th className="px-2 py-1.5">By Activity</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.user} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-2 py-1.5">{r.user}</td>
                  <td className="px-2 py-1.5 text-right font-medium">{formatHours(r.totalHours)}</td>
                  <td className="px-2 py-1.5 text-right">{r.entryCount}</td>
                  <td className="px-2 py-1.5 text-slate-500 dark:text-slate-400">
                    {r.byActivity.map((a) => `${a.activity}: ${formatHours(a.hours)}h`).join(", ")}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-2 py-6 text-center text-slate-400 dark:text-slate-500">
                    {monthFilter
                      ? "No time entries logged in this month."
                      : rootTicketId !== null
                        ? `No time entries logged against ticket #${rootTicketId}${childCount > 0 ? " or its child tickets" : ""}.`
                        : "No time entries found for this project."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h3 className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-200">Monthly Breakdown</h3>
        <p className="mb-3 text-[11px] text-slate-400 dark:text-slate-500">
          Hours logged per user, by month{rootTicketId !== null ? ` (scoped to #${rootTicketId}${childCount > 0 ? " + its child tickets" : ""})` : ""} —
          always shows every month, regardless of the Month filter above.
        </p>
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-2 py-1.5">Month</th>
                {monthBreakdown.users.map((user) => (
                  <th key={user} className="px-2 py-1.5 text-right">{user}</th>
                ))}
                <th className="px-2 py-1.5 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {monthBreakdown.rows.map((row) => (
                <tr key={row.monthKey} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-2 py-1.5">{row.monthLabel}</td>
                  {monthBreakdown.users.map((user) => (
                    <td key={user} className="px-2 py-1.5 text-right">{formatHours(row.byUser[user] ?? 0)}</td>
                  ))}
                  <td className="px-2 py-1.5 text-right font-semibold">{formatHours(row.total)}</td>
                </tr>
              ))}
              {monthBreakdown.rows.length === 0 && (
                <tr>
                  <td colSpan={monthBreakdown.users.length + 2} className="px-2 py-6 text-center text-slate-400 dark:text-slate-500">
                    No time entries in the current view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
