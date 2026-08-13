import { useMemo, useState } from "react";
import { Issue } from "../types/issue";
import { resolutionTimeStats } from "../utils/aggregations";

type BreakdownDim = "tracker" | "priority" | "assignedTo" | "targetVersion";

const DIM_LABEL: Record<BreakdownDim, string> = {
  tracker: "Tracker",
  priority: "Priority",
  assignedTo: "Assignee",
  targetVersion: "Target Version",
};

function StatCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-center">
      <div className="text-[11px] uppercase text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-800">{value === null ? "—" : `${value.toFixed(1)}d`}</div>
    </div>
  );
}

export default function ResolutionTimePanel({ issues }: { issues: Issue[] }) {
  const [dim, setDim] = useState<BreakdownDim>("tracker");
  const overall = useMemo(() => resolutionTimeStats(issues), [issues]);

  const breakdown = useMemo(() => {
    const groups = new Map<string, Issue[]>();
    for (const issue of issues) {
      const key = (issue[dim] as string | null) || (dim === "targetVersion" ? "No Target Version" : "(blank)");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(issue);
    }
    return Array.from(groups.entries())
      .map(([key, group]) => ({ key, stats: resolutionTimeStats(group) }))
      .filter((row) => row.stats.sampleSize > 0)
      .sort((a, b) => (b.stats.average ?? 0) - (a.stats.average ?? 0));
  }, [issues, dim]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">Resolution Time (Closed Tickets)</h3>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="Average" value={overall.average} />
        <StatCard label="Median" value={overall.median} />
        <StatCard label="Minimum" value={overall.min} />
        <StatCard label="Maximum" value={overall.max} />
      </div>
      <div className="mb-2 flex items-center gap-2">
        <label className="text-xs font-medium text-slate-500">Breakdown by</label>
        <select className="rounded border border-slate-300 px-2 py-1 text-xs" value={dim} onChange={(e) => setDim(e.target.value as BreakdownDim)}>
          {Object.entries(DIM_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      <div className="max-h-64 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 text-slate-500">
            <tr>
              <th className="px-2 py-1.5">{DIM_LABEL[dim]}</th>
              <th className="px-2 py-1.5 text-right">Avg (d)</th>
              <th className="px-2 py-1.5 text-right">Median (d)</th>
              <th className="px-2 py-1.5 text-right">Min (d)</th>
              <th className="px-2 py-1.5 text-right">Max (d)</th>
              <th className="px-2 py-1.5 text-right">Sample</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.map((row) => (
              <tr key={row.key} className="border-t border-slate-100">
                <td className="px-2 py-1.5">{row.key}</td>
                <td className="px-2 py-1.5 text-right">{row.stats.average?.toFixed(1)}</td>
                <td className="px-2 py-1.5 text-right">{row.stats.median?.toFixed(1)}</td>
                <td className="px-2 py-1.5 text-right">{row.stats.min?.toFixed(1)}</td>
                <td className="px-2 py-1.5 text-right">{row.stats.max?.toFixed(1)}</td>
                <td className="px-2 py-1.5 text-right">{row.stats.sampleSize}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
