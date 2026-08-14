import { useEffect, useState } from "react";
import { ALL_PROJECTS, ApiError, getTimeEntries } from "../services/api";
import { TimeEntry } from "../types/issue";
import { aggregateTimeByUser } from "../utils/aggregations";
import { formatDateTime, formatHours } from "../utils/format";

interface Props {
  projectIdentifier: string;
  onSessionExpired: () => void;
}

export default function TimeSpentByUserPanel({ projectIdentifier, onSessionExpired }: Props) {
  const [timeEntries, setTimeEntries] = useState<TimeEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  // A different project was selected — the previously loaded data is stale, so drop it
  // and require an explicit reload rather than silently showing the wrong project's data.
  useEffect(() => {
    setTimeEntries(null);
    setError(null);
    setFetchedAt(null);
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

  const rows = aggregateTimeByUser(timeEntries);
  const grandTotal = rows.reduce((sum, r) => sum + r.totalHours, 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Time Spent by User</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            {timeEntries.length.toLocaleString()} time entries · {formatHours(grandTotal)}h total
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
                  No time entries found for this project.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
