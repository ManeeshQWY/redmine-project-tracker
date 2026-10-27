import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { chartTheme, useTheme } from "../theme";
import { ParentProgressRow, seriesCounts, StatusSeries } from "../utils/parentProgress";

interface Props {
  rows: ParentProgressRow[];
  series: StatusSeries[];
}

interface ChartRow extends Record<string, string | number> {
  label: string;
  id: number;
  total: number;
  closedPercent: number;
}

interface TipProps {
  active?: boolean;
  payload?: { payload: ChartRow }[];
  series: StatusSeries[];
  isDark: boolean;
  t: ReturnType<typeof chartTheme>;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Custom tooltip: Recharts' own one leaves the value lines black in dark mode. */
function StatusTooltip({ active, payload, series, isDark, t }: TipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-md border px-3 py-2 text-xs shadow-sm" style={{ backgroundColor: t.tooltipBg, borderColor: t.tooltipBorder, color: t.tooltipText }}>
      <div className="mb-1 max-w-[260px] font-medium">{row.label}</div>
      {series
        .filter((s) => Number(row[s.key]) > 0)
        .map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: isDark ? s.color.dark : s.color.light }} />
            <span>{s.label}</span>
            <span className="ml-auto pl-3 font-medium">{row[s.key]}</span>
          </div>
        ))}
      <div className="mt-1 border-t pt-1" style={{ borderColor: t.tooltipBorder }}>
        {row.total} tickets · {row.closedPercent.toFixed(0)}% closed
      </div>
    </div>
  );
}

/** One stacked bar per parent ticket: its child tickets split by status. */
export default function ParentProgressChart({ rows, series }: Props) {
  const { isDark } = useTheme();
  const t = chartTheme(isDark);
  const surface = isDark ? "#0f172a" : "#ffffff"; // the card colour — used as the gap between segments

  const data: ChartRow[] = rows.map((r) => ({
    label: `#${r.id} ${truncate(r.subject, 30)}`,
    id: r.id,
    total: r.total,
    closedPercent: r.closedPercent ?? 0,
    ...seriesCounts(r, series),
  }));

  return (
    <div>
      <div style={{ width: "100%", height: Math.max(200, data.length * 34 + 50) }}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={t.grid} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: t.tick }} />
            <YAxis type="category" dataKey="label" width={210} tick={{ fontSize: 11, fill: t.tick }} />
            <Tooltip cursor={{ fill: "transparent" }} content={(props) => <StatusTooltip {...(props as unknown as TipProps)} series={series} isDark={isDark} t={t} />} />
            {series.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId="status"
                fill={isDark ? s.color.dark : s.color.light}
                stroke={surface}
                strokeWidth={2}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Legend: always present for 2+ series, so identity is never colour alone. */}
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300" aria-label="Status legend">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: isDark ? s.color.dark : s.color.light }} />
            {s.label}
            {s.key === "other" && <span className="text-slate-400 dark:text-slate-500">({s.statuses.join(", ")})</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
