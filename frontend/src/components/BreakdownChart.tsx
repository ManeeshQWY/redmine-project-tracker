import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CountBucket } from "../utils/aggregations";
import { CHART_COLORS, chartTheme, useTheme } from "../theme";

interface Props {
  title: string;
  data: CountBucket[];
  maxBars?: number;
  onBarClick?: (key: string) => void;
}

export default function BreakdownChart({ title, data, maxBars = 10, onBarClick }: Props) {
  const { isDark } = useTheme();
  const t = chartTheme(isDark);
  const shown = data.slice(0, maxBars);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
        {onBarClick && <span className="text-[11px] text-slate-400 dark:text-slate-500">Click a bar to filter tickets</span>}
      </div>
      <div style={{ width: "100%", height: Math.max(180, shown.length * 32) }}>
        <ResponsiveContainer>
          <BarChart data={shown} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={t.grid} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: t.tick }} />
            <YAxis type="category" dataKey="key" width={140} tick={{ fontSize: 11, fill: t.tick }} />
            <Tooltip
              formatter={(value: number, _n, item) => [`${value} (${item.payload.percent.toFixed(1)}%)`, "Count"]}
              contentStyle={{ backgroundColor: t.tooltipBg, borderColor: t.tooltipBorder, color: t.tooltipText, fontSize: 12 }}
              labelStyle={{ color: t.tooltipText }}
            />
            <Bar
              dataKey="count"
              radius={[0, 4, 4, 0]}
              onClick={onBarClick ? (entry) => onBarClick(entry.key) : undefined}
              cursor={onBarClick ? "pointer" : undefined}
            >
              {shown.map((_, idx) => (
                <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
