import { useMemo, useState } from "react";
import { Issue } from "../types/issue";
import { aggregateByRelease } from "../utils/aggregations";
import { formatHours } from "../utils/format";

type SortKey = "total" | "closed" | "notClosed" | "bugs" | "features" | "totalEstimatedHours" | "totalActualHours";

export default function ReleaseDashboard({ issues }: { issues: Issue[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const rows = useMemo(() => {
    const data = aggregateByRelease(issues);
    return [...data].sort((a, b) => b[sortKey] - a[sortKey]);
  }, [issues, sortKey]);

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
          <option value="closed">Sort by Closed</option>
          <option value="notClosed">Sort by Not Closed</option>
          <option value="bugs">Sort by Bugs</option>
          <option value="features">Sort by Features</option>
          <option value="totalEstimatedHours">Sort by Est. Hours</option>
          <option value="totalActualHours">Sort by Actual Hours</option>
        </select>
      </div>
      <div className="max-h-[480px] overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-2 py-1.5">Release</th>
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
