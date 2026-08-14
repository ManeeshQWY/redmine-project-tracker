import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Issue } from "../types/issue";
import { aggregateClosedByMonthAndTracker, MonthTrackerRow } from "../utils/aggregations";
import { CHART_COLORS, chartTheme, useTheme } from "../theme";

interface MonthTooltipProps {
  active?: boolean;
  payload?: { dataKey: string | number; value?: number; color?: string; payload: MonthTrackerRow }[];
  label?: string;
  t: ReturnType<typeof chartTheme>;
}

function MonthTooltip({ active, payload, label, t }: MonthTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const total = payload[0]?.payload.total ?? 0;
  return (
    <div
      className="rounded-md border px-3 py-2 text-xs shadow-sm"
      style={{ backgroundColor: t.tooltipBg, borderColor: t.tooltipBorder, color: t.tooltipText }}
    >
      <div className="mb-1 font-medium">{label}</div>
      {payload
        .filter((p) => (p.value ?? 0) > 0)
        .map((p) => (
          <div key={p.dataKey as string} className="flex items-center justify-between gap-4">
            <span style={{ color: p.color }}>{p.dataKey}</span>
            <span>{p.value}</span>
          </div>
        ))}
      <div className="mt-1 flex items-center justify-between gap-4 border-t pt-1 font-medium" style={{ borderColor: t.tooltipBorder }}>
        <span>Total</span>
        <span>{total}</span>
      </div>
    </div>
  );
}

export default function ClosedTicketsTrendPanel({ issues }: { issues: Issue[] }) {
  const { isDark } = useTheme();
  const t = chartTheme(isDark);
  const { rows, trackers } = useMemo(() => aggregateClosedByMonthAndTracker(issues), [issues]);
  const chartRows = useMemo(() => [...rows].sort((a, b) => a.monthKey.localeCompare(b.monthKey)), [rows]); // oldest -> newest reads naturally left-to-right

  const chartData = chartRows.map((r) => ({ monthLabel: r.monthLabel, total: r.total, ...r.byTracker }));

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Closed Tickets by Month</h3>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">No closed tickets in the current view.</p>
        ) : (
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={t.grid} />
                <XAxis dataKey="monthLabel" tick={{ fontSize: 11, fill: t.tick }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: t.tick }} />
                <Tooltip content={(props) => <MonthTooltip {...(props as unknown as MonthTooltipProps)} t={t} />} />
                <Legend wrapperStyle={{ fontSize: 12, color: t.tick }} />
                {trackers.map((tracker, idx) => (
                  <Bar key={tracker} dataKey={tracker} stackId="closed" fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Month-wise Closed Ticket Table</h3>
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-2 py-1.5">Month</th>
                {trackers.map((tracker) => (
                  <th key={tracker} className="px-2 py-1.5 text-right">{tracker}</th>
                ))}
                <th className="px-2 py-1.5 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.monthKey} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-2 py-1.5">{row.monthLabel}</td>
                  {trackers.map((tracker) => (
                    <td key={tracker} className="px-2 py-1.5 text-right">{row.byTracker[tracker] ?? 0}</td>
                  ))}
                  <td className="px-2 py-1.5 text-right font-semibold">{row.total}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={trackers.length + 2} className="px-2 py-6 text-center text-slate-400 dark:text-slate-500">
                    No closed tickets in the current view.
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
