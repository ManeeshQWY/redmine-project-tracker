import { useMemo } from "react";
import { Issue } from "../types/issue";
import { aggregateByRelease } from "../utils/aggregations";
import { formatHours } from "../utils/format";

export default function ReleaseDashboard({ issues }: { issues: Issue[] }) {
  const rows = useMemo(() => aggregateByRelease(issues), [issues]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">Release / Target Version Summary</h3>
      <div className="max-h-[480px] overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 text-slate-500">
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
              <tr key={r.version} className="border-t border-slate-100">
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
