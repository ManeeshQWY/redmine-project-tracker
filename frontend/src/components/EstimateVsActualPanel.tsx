import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Issue } from "../types/issue";
import { estimateVsActual } from "../utils/aggregations";
import { formatHours } from "../utils/format";
import { chartTheme, useTheme } from "../theme";

interface HoursTooltipProps {
  active?: boolean;
  payload?: { dataKey: string; value?: number; color?: string }[];
  label?: string;
  t: ReturnType<typeof chartTheme>;
}

/** Custom content instead of contentStyle/labelStyle — Recharts' default itemStyle for
 * the value lines is hardcoded black and unreadable in dark mode. */
function HoursTooltip({ active, payload, label, t }: HoursTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-md border px-3 py-2 text-xs shadow-sm" style={{ backgroundColor: t.tooltipBg, borderColor: t.tooltipBorder, color: t.tooltipText }}>
      <div className="mb-1 font-medium">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4">
          <span style={{ color: p.color }}>{p.dataKey === "estimated" ? "Estimated" : "Actual"}</span>
          <span>{(p.value ?? 0).toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

export default function EstimateVsActualPanel({ issues }: { issues: Issue[] }) {
  const { isDark } = useTheme();
  const t = chartTheme(isDark);

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
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Estimated vs Actual Hours (by Tracker)</h3>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Estimated Hours" value={formatHours(totals.estimated)} />
        <Stat label="Actual Hours" value={formatHours(totals.actual)} />
        <Stat label="Variance" value={formatHours(variance)} />
        <Stat label="Variance %" value={variancePercent === null ? "—" : `${variancePercent.toFixed(1)}%`} />
      </div>
      <div style={{ width: "100%", height: Math.max(200, rows.chartData.length * 40) }}>
        <ResponsiveContainer>
          <BarChart data={rows.chartData} layout="vertical" margin={{ left: 8, right: 24 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={t.grid} />
            <XAxis type="number" tick={{ fontSize: 11, fill: t.tick }} />
            <YAxis type="category" dataKey="tracker" width={100} tick={{ fontSize: 11, fill: t.tick }} />
            <Tooltip content={(props) => <HoursTooltip {...(props as unknown as HoursTooltipProps)} t={t} />} />
            <Legend wrapperStyle={{ fontSize: 12, color: t.tick }} />
            <Bar dataKey="estimated" name="Estimated" fill="#2563eb" radius={[0, 4, 4, 0]} />
            <Bar dataKey="actual" name="Actual" fill="#059669" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {rows.withEstimate.length === 0 && (
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">No tickets with both estimated and actual hours.</p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-center dark:border-slate-700 dark:bg-slate-800">
      <div className="text-[11px] uppercase text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-lg font-semibold text-slate-800 dark:text-slate-100">{value}</div>
    </div>
  );
}
