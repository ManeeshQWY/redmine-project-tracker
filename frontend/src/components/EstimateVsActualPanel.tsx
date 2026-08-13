import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Issue } from "../types/issue";
import { estimateVsActual } from "../utils/aggregations";
import { formatHours } from "../utils/format";

export default function EstimateVsActualPanel({ issues }: { issues: Issue[] }) {
  const rows = useMemo(() => {
    const withEstimate = issues
      .map((i) => ({ issue: i, ...estimateVsActual(i) }))
      .filter((r) => r.estimatedHours !== null && r.actualHours !== null);

    const byTracker = new Map<string, { tracker: string; estimated: number; actual: number }>();
    for (const r of withEstimate) {
      const key = r.issue.tracker || "(blank)";
      const entry = byTracker.get(key) ?? { tracker: key, estimated: 0, actual: 0 };
      entry.estimated += r.estimatedHours ?? 0;
      entry.actual += r.actualHours ?? 0;
      byTracker.set(key, entry);
    }

    return { withEstimate, chartData: Array.from(byTracker.values()).sort((a, b) => b.estimated - a.estimated) };
  }, [issues]);

  const totals = rows.withEstimate.reduce(
    (acc, r) => {
      acc.estimated += r.estimatedHours ?? 0;
      acc.actual += r.actualHours ?? 0;
      return acc;
    },
    { estimated: 0, actual: 0 }
  );
  const variance = totals.actual - totals.estimated;
  const variancePercent = totals.estimated === 0 ? null : (variance / totals.estimated) * 100;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">Estimated vs Actual Hours (by Tracker)</h3>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Estimated Hours" value={formatHours(totals.estimated)} />
        <Stat label="Actual Hours" value={formatHours(totals.actual)} />
        <Stat label="Variance" value={formatHours(variance)} />
        <Stat label="Variance %" value={variancePercent === null ? "—" : `${variancePercent.toFixed(1)}%`} />
      </div>
      <div style={{ width: "100%", height: Math.max(200, rows.chartData.length * 40) }}>
        <ResponsiveContainer>
          <BarChart data={rows.chartData} layout="vertical" margin={{ left: 8, right: 24 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="tracker" width={100} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => v.toFixed(1)} />
            <Legend />
            <Bar dataKey="estimated" name="Estimated" fill="#2563eb" radius={[0, 4, 4, 0]} />
            <Bar dataKey="actual" name="Actual" fill="#059669" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {rows.withEstimate.length === 0 && <p className="mt-2 text-xs text-slate-400">No tickets with both estimated and actual hours.</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-center">
      <div className="text-[11px] uppercase text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-800">{value}</div>
    </div>
  );
}
