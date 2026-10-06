import { useEffect, useMemo, useState } from "react";
import { getVersions } from "../services/api";
import { Issue, VersionMeta } from "../types/issue";
import { aggregateByRelease, releaseDatesByName } from "../utils/aggregations";
import { formatDate, formatHours } from "../utils/format";

type SortKey = "total" | "closed" | "notClosed" | "bugs" | "features" | "totalEstimatedHours" | "totalActualHours" | "releaseDate";

interface Props {
  issues: Issue[];
  projectIdentifier: string;
}

export default function ReleaseDashboard({ issues, projectIdentifier }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [versions, setVersions] = useState<VersionMeta[]>([]);
  const [versionsError, setVersionsError] = useState(false);

  // Release dates aren't on the tickets themselves (a ticket only knows its version's
  // name/id), so they're fetched separately — lazily, only once this tab is opened.
  useEffect(() => {
    let cancelled = false;
    setVersions([]);
    setVersionsError(false);
    getVersions(projectIdentifier)
      .then((v) => {
        if (!cancelled) setVersions(v);
      })
      .catch(() => {
        if (!cancelled) setVersionsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [projectIdentifier]);

  const dateByName = useMemo(() => releaseDatesByName(versions), [versions]);

  const rows = useMemo(() => {
    const data = aggregateByRelease(issues).map((r) => ({ ...r, releaseDate: dateByName.get(r.version) ?? null }));
    if (sortKey === "releaseDate") {
      // Latest release first; versions with no date sink to the bottom.
      return [...data].sort((a, b) => {
        if (!a.releaseDate) return b.releaseDate ? 1 : 0;
        if (!b.releaseDate) return -1;
        return b.releaseDate.localeCompare(a.releaseDate);
      });
    }
    return [...data].sort((a, b) => b[sortKey] - a[sortKey]);
  }, [issues, sortKey, dateByName]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Release / Target Version Summary</h3>
        <select
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
        >
          <option value="total">Sort by Total</option>
          <option value="releaseDate">Sort by Release Date</option>
          <option value="closed">Sort by Closed</option>
          <option value="notClosed">Sort by Not Closed</option>
          <option value="bugs">Sort by Bugs</option>
          <option value="features">Sort by Features</option>
          <option value="totalEstimatedHours">Sort by Est. Hours</option>
          <option value="totalActualHours">Sort by Actual Hours</option>
        </select>
      </div>
      {versionsError && (
        <p className="mb-2 text-[11px] text-amber-600 dark:text-amber-400">Release dates couldn&apos;t be loaded — everything else below is unaffected.</p>
      )}
      <div className="max-h-[480px] overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-2 py-1.5">Release</th>
              <th className="px-2 py-1.5">Release Date</th>
              <th className="px-2 py-1.5 text-right">Total</th>
              <th className="px-2 py-1.5 text-right">Closed</th>
              <th className="px-2 py-1.5 text-right">Not Closed</th>
              <th className="px-2 py-1.5 text-right">Bugs</th>
              <th className="px-2 py-1.5 text-right">Features</th>
              <th className="px-2 py-1.5 text-right">Est. Hours</th>
              <th className="px-2 py-1.5 text-right">Actual Hours</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.version} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-2 py-1.5">{r.version}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{r.releaseDate ? formatDate(r.releaseDate) : "—"}</td>
                <td className="px-2 py-1.5 text-right">{r.total}</td>
                <td className="px-2 py-1.5 text-right">{r.closed}</td>
                <td className="px-2 py-1.5 text-right">{r.notClosed}</td>
                <td className="px-2 py-1.5 text-right">{r.bugs}</td>
                <td className="px-2 py-1.5 text-right">{r.features}</td>
                <td className="px-2 py-1.5 text-right">{formatHours(r.totalEstimatedHours)}</td>
                <td className="px-2 py-1.5 text-right">{formatHours(r.totalActualHours)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
