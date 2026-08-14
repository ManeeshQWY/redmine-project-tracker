import { useMemo, useState } from "react";
import { Issue } from "../types/issue";
import { aggregateByAssignee } from "../utils/aggregations";
import { formatHours } from "../utils/format";

type SortKey = "total" | "open" | "closed" | "totalTimeSpent";

export default function AssigneeSummaryTable({ issues }: { issues: Issue[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const rows = useMemo(() => {
    const data = aggregateByAssignee(issues);
    return [...data].sort((a, b) => b[sortKey] - a[sortKey]);
  }, [issues, sortKey]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Assignee Summary</h3>
        <select
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
        >
          <option value="total">Sort by Total Tickets</option>
          <option value="open">Sort by Open Tickets</option>
          <option value="closed">Sort by Closed Tickets</option>
          <option value="totalTimeSpent">Sort by Total Time Spent</option>
        </select>
      </div>
      <div className="max-h-80 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-2 py-1.5">Assignee</th>
              <th className="px-2 py-1.5 text-right">Total</th>
              <th className="px-2 py-1.5 text-right">Open</th>
              <th className="px-2 py-1.5 text-right">Closed</th>
              <th className="px-2 py-1.5 text-right">Total Time Spent (h)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.assignee} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-2 py-1.5">{r.assignee}</td>
                <td className="px-2 py-1.5 text-right">{r.total}</td>
                <td className="px-2 py-1.5 text-right">{r.open}</td>
                <td className="px-2 py-1.5 text-right">{r.closed}</td>
                <td className="px-2 py-1.5 text-right">{formatHours(r.totalTimeSpent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
