import { useEffect, useMemo, useState } from "react";
import { ALL_PROJECTS, ApiError, getTimeEntries } from "../services/api";
import { Issue, TimeEntry } from "../types/issue";
import { aggregateTimeByUser } from "../utils/aggregations";
import { formatDateTime, formatHours } from "../utils/format";

interface Props {
  projectIdentifier: string;
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

export default function TimeSpentByUserPanel({ projectIdentifier, issues, onSessionExpired }: Props) {
  const [timeEntries, setTimeEntries] = useState<TimeEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [ticketIdFilter, setTicketIdFilter] = useState("");

  // A different project was selected — the previously loaded data is stale, so drop it
  // and require an explicit reload rather than silently showing the wrong project's data.
  useEffect(() => {
    setTimeEntries(null);
    setError(null);
    setFetchedAt(null);
    setTicketIdFilter("");
  }, [projectIdentifier]);

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

  const trimmedFilter = ticketIdFilter.trim();
  const rootTicketId = trimmedFilter && /^\d+$/.test(trimmedFilter) ? Number(trimmedFilter) : null;

  // Rolls up child/grandchild tickets' time too (e.g. an Epic's own logged time is
  // usually 0 — the real hours sit on its subtasks) — not just entries logged directly
  // against the searched id.
  const descendantIds = useMemo(() => (rootTicketId !== null ? collectDescendantIds(rootTicketId, issues) : null), [rootTicketId, issues]);
  const filteredEntries = descendantIds ? timeEntries.filter((e) => e.issueId !== null && descendantIds.has(e.issueId)) : timeEntries;
  const childCount = (descendantIds?.size ?? 1) - 1;
  const rows = aggregateTimeByUser(filteredEntries);
  const grandTotal = rows.reduce((sum, r) => sum + r.totalHours, 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Time Spent by User</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {rootTicketId !== null
              ? `${filteredEntries.length.toLocaleString()} entries on #${rootTicketId}${childCount > 0 ? ` + ${childCount} child ticket${childCount === 1 ? "" : "s"}` : ""} · ${formatHours(grandTotal)}h total`
              : `${timeEntries.length.toLocaleString()} time entries · ${formatHours(grandTotal)}h total`}
            {fetchedAt && ` · loaded ${formatDateTime(fetchedAt)}`}
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          {loading ? "Refreshing…" : "Refresh Time Data"}
        </button>
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
                  {rootTicketId !== null
                    ? `No time entries logged against ticket #${rootTicketId}${childCount > 0 ? " or its child tickets" : ""}.`
                    : "No time entries found for this project."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
