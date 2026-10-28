import { useMemo, useState } from "react";
import { Issue, StatusMeta } from "../types/issue";
import { useTheme } from "../theme";
import { exportParentProgressToExcel } from "../utils/excelExport";
import { formatHours } from "../utils/format";
import { LoadWindow, windowPhrase } from "../utils/dataWindow";
import {
  buildParentProgress,
  buildStatusSeries,
  ChildScope,
  childHours,
  filterParentProgress,
  ParentProgressRow,
  ParentSort,
  seriesCounts,
  sortParentProgress,
  StatusSeries,
  summarizeParents,
} from "../utils/parentProgress";
import ParentProgressChart from "./ParentProgressChart";

interface Props {
  // Every loaded ticket — children are looked up here, so they are counted whatever tracker
  // chip is selected at the top (the chips only choose which PARENTS are listed).
  issues: Issue[];
  statuses: StatusMeta[]; // Redmine's configured status order
  trackers: string[]; // the app-wide Tracker chips: which parent trackers to list
  redmineBaseUrl: string;
  projectLabel: string;
  loadWindow: LoadWindow;
  onLoadAllTime: () => void;
}

const CHART_COUNTS = [10, 15, 25, 50];
const MAX_CHILDREN_SHOWN = 300;

const inputCls =
  "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200";
const labelCls = "text-[11px] font-medium text-slate-500 dark:text-slate-400";
const buttonCls =
  "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700";

function pct(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}%`;
}

/** A thin stacked bar of the children by status, with a visible gap between segments. */
function StatusStrip({ row, series, isDark }: { row: ParentProgressRow; series: StatusSeries[]; isDark: boolean }) {
  const counts = seriesCounts(row, series);
  return (
    <div className="flex h-2 w-44 gap-[2px] overflow-hidden rounded-full bg-transparent" role="img" aria-label={summaryText(row, series)}>
      {series
        .filter((s) => counts[s.key] > 0)
        .map((s) => (
          <div
            key={s.key}
            title={`${s.label}: ${counts[s.key]}`}
            style={{ width: `${(counts[s.key] / row.total) * 100}%`, background: isDark ? s.color.dark : s.color.light }}
          />
        ))}
    </div>
  );
}

function summaryText(row: ParentProgressRow, series: StatusSeries[]): string {
  const counts = seriesCounts(row, series);
  return series
    .filter((s) => counts[s.key] > 0)
    .map((s) => `${s.label} ${counts[s.key]}`)
    .join(" · ");
}

export default function ParentProgressPanel({ issues, statuses, trackers, redmineBaseUrl, projectLabel, loadWindow, onLoadAllTime }: Props) {
  const { isDark } = useTheme();
  const [scope, setScope] = useState<ChildScope>("all");
  const [search, setSearch] = useState("");
  const [state, setState] = useState<"all" | "open" | "closed">("all");
  const [topLevelOnly, setTopLevelOnly] = useState(false);
  const [sort, setSort] = useState<ParentSort>("total");
  const [chartCount, setChartCount] = useState(15);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [exporting, setExporting] = useState(false);

  const allRows = useMemo(() => buildParentProgress(issues, scope), [issues, scope]);
  const rows = useMemo(
    () => sortParentProgress(filterParentProgress(allRows, { trackers, search, state, topLevelOnly }), sort),
    [allRows, trackers, search, state, topLevelOnly, sort]
  );
  const summary = useMemo(() => summarizeParents(rows, issues), [rows, issues]);
  const issueById = useMemo(() => new Map(issues.map((i) => [i.id, i])), [issues]);

  // Colours follow the status itself, worked out from the whole load — so narrowing the
  // list never repaints a status.
  const series = useMemo(
    () => buildStatusSeries(statuses.map((s) => s.name), new Set(issues.map((i) => i.status || "(blank)"))),
    [statuses, issues]
  );

  const limitedWindow = loadWindow.kind === "range" || loadWindow.days > 0;

  function toggle(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleExport() {
    setExporting(true);
    try {
      await exportParentProgressToExcel(rows, series, issueById, redmineBaseUrl, projectLabel, scope);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      {limitedWindow && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <span>
            Counts include only tickets updated in {windowPhrase(loadWindow)}. Child tickets untouched since then aren&apos;t counted, so the
            percentages here can be understated.
          </span>
          <button
            onClick={onLoadAllTime}
            className="rounded border border-amber-300 bg-white px-2 py-0.5 font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-transparent dark:text-amber-300"
          >
            Load all time
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Parent tickets", value: summary.parents.toLocaleString() },
          { label: "Child tickets", value: summary.children.toLocaleString() },
          { label: "Closed", value: summary.closed.toLocaleString() },
          { label: "Overall complete", value: pct(summary.closedPercent) },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{k.label}</div>
            <div className="mt-1 text-2xl font-semibold text-slate-800 dark:text-slate-100">{k.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-[180px] flex-1 flex-col gap-1">
            <label className={labelCls} htmlFor="pp-search">Search parent (subject or #id)</label>
            <input id="pp-search" type="text" className={inputCls} placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls} htmlFor="pp-state">Parent status</label>
            <select id="pp-state" className={inputCls} value={state} onChange={(e) => setState(e.target.value as typeof state)}>
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls} htmlFor="pp-scope">Count</label>
            <select id="pp-scope" className={inputCls} value={scope} onChange={(e) => setScope(e.target.value as ChildScope)}>
              <option value="all">All nested tickets</option>
              <option value="direct">Direct children only</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls} htmlFor="pp-sort">Sort by</label>
            <select id="pp-sort" className={inputCls} value={sort} onChange={(e) => setSort(e.target.value as ParentSort)}>
              <option value="total">Most child tickets</option>
              <option value="open">Most open tickets</option>
              <option value="lowestComplete">Lowest % complete</option>
              <option value="highestComplete">Highest % complete</option>
            </select>
          </div>
          <label className="flex items-center gap-1.5 pb-1.5 text-xs text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={topLevelOnly} onChange={(e) => setTopLevelOnly(e.target.checked)} />
            Top-level parents only
          </label>
          <button onClick={handleExport} disabled={exporting || rows.length === 0} className={buttonCls}>
            {exporting ? "Exporting…" : "Export to Excel"}
          </button>
        </div>
        {trackers.length > 0 && (
          <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">Showing parents of type {trackers.join(", ")} (from the Tracker chips above).</p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Child tickets by status</h3>
          <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            Show top
            <select className={inputCls} value={chartCount} onChange={(e) => setChartCount(Number(e.target.value))} aria-label="Parents in chart">
              {CHART_COUNTS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            parents
          </label>
        </div>
        {rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">
            {allRows.length === 0 ? "No ticket in this view has child tickets under it." : "No parent tickets match the current filters."}
          </p>
        ) : (
          <ParentProgressChart rows={rows.slice(0, chartCount)} series={series} />
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Parent ticket details</h3>
        <div className="max-h-[640px] overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-[1] bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-2 py-1.5">Parent ticket</th>
                <th className="px-2 py-1.5">Status</th>
                <th className="px-2 py-1.5">Assignee</th>
                <th className="px-2 py-1.5 text-right">Child tickets</th>
                <th className="px-2 py-1.5">By status</th>
                <th className="px-2 py-1.5 text-right">% closed</th>
                <th className="px-2 py-1.5 text-right" title="Average of the child tickets' own % done">Avg % done</th>
                <th className="px-2 py-1.5 text-right" title="Redmine's total for the parent, including all its children">Est. (h)</th>
                <th className="px-2 py-1.5 text-right" title="Redmine's total time spent on the parent, including all its children">Spent (h)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const open = expanded.has(r.id);
                return (
                  <ParentRows
                    key={r.id}
                    row={r}
                    open={open}
                    onToggle={() => toggle(r.id)}
                    series={series}
                    isDark={isDark}
                    redmineBaseUrl={redmineBaseUrl}
                    issueById={issueById}
                    scope={scope}
                  />
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-2 py-8 text-center text-slate-400 dark:text-slate-500">
                    No parent tickets to show.
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

function ParentRows({
  row,
  open,
  onToggle,
  series,
  isDark,
  redmineBaseUrl,
  issueById,
  scope,
}: {
  row: ParentProgressRow;
  open: boolean;
  onToggle: () => void;
  series: StatusSeries[];
  isDark: boolean;
  redmineBaseUrl: string;
  issueById: Map<number, Issue>;
  scope: ChildScope;
}) {
  const hours = (h: number | null) => (h === null ? <span className="text-slate-300 dark:text-slate-600">—</span> : formatHours(h));
  const link = (id: number) =>
    redmineBaseUrl ? (
      <a href={`${redmineBaseUrl}/issues/${id}`} target="_blank" rel="noreferrer" className="font-medium text-brand-600 hover:underline dark:text-brand-400" onClick={(e) => e.stopPropagation()}>
        #{id}
      </a>
    ) : (
      <span className="font-medium">#{id}</span>
    );

  const children = open
    ? row.childIds
        .map((id) => issueById.get(id))
        .filter((c): c is Issue => c !== undefined)
        .sort((a, b) => Number(a.statusIsClosed) - Number(b.statusIsClosed) || a.status.localeCompare(b.status) || a.id - b.id)
    : [];

  return (
    <>
      <tr className="cursor-pointer border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50" onClick={onToggle} aria-expanded={open}>
        <td className="px-2 py-2">
          <span className="mr-1.5 inline-block w-3 text-slate-400">{open ? "▾" : "▸"}</span>
          {link(row.id)} {row.subject}
          <span className="ml-1.5 text-[10px] text-slate-400 dark:text-slate-500">{row.tracker}</span>
        </td>
        <td className="px-2 py-2">{row.status}</td>
        <td className="px-2 py-2">{row.assignee ?? <span className="text-slate-300 dark:text-slate-600">—</span>}</td>
        <td className="px-2 py-2 text-right font-medium tabular-nums">{row.total}</td>
        <td className="px-2 py-2">
          <StatusStrip row={row} series={series} isDark={isDark} />
          <div className="mt-1 max-w-[260px] text-[10px] leading-tight text-slate-500 dark:text-slate-400">{summaryText(row, series)}</div>
        </td>
        <td className="px-2 py-2 text-right">
          <div className="font-medium tabular-nums">{pct(row.closedPercent)}</div>
          <div className="ml-auto mt-1 h-1.5 w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden>
            <div className="h-full rounded-full bg-brand-600" style={{ width: `${row.closedPercent ?? 0}%` }} />
          </div>
        </td>
        <td className="px-2 py-2 text-right tabular-nums">{pct(row.avgDonePercent)}</td>
        <td className="px-2 py-2 text-right tabular-nums">{row.estimatedHours === null ? <span className="text-slate-300 dark:text-slate-600">—</span> : formatHours(row.estimatedHours)}</td>
        <td className="px-2 py-2 text-right tabular-nums">{row.spentHours === null ? <span className="text-slate-300 dark:text-slate-600">—</span> : formatHours(row.spentHours)}</td>
      </tr>
      {open && (
        <tr className="bg-slate-50/60 dark:bg-slate-800/30">
          <td colSpan={9} className="px-4 py-3">
            <table className="w-full text-left text-[11px]">
              <thead className="text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-2 py-1">Ticket</th>
                  <th className="px-2 py-1">Tracker</th>
                  <th className="px-2 py-1">Status</th>
                  <th className="px-2 py-1">Assignee</th>
                  <th className="px-2 py-1 text-right">% done</th>
                  <th className="px-2 py-1 text-right" title={scope === "all" ? "The ticket's own estimate" : "Redmine's total for the ticket, including its own children"}>Est. (h)</th>
                  <th className="px-2 py-1 text-right" title={scope === "all" ? "Time logged on the ticket itself" : "Redmine's total time for the ticket, including its own children"}>Spent (h)</th>
                </tr>
              </thead>
              <tbody>
                {children.slice(0, MAX_CHILDREN_SHOWN).map((c) => {
                  const h = childHours(c, scope);
                  return (
                  <tr key={c.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-2 py-1">
                      {link(c.id)} {c.subject}
                    </td>
                    <td className="px-2 py-1">{c.tracker}</td>
                    <td className="px-2 py-1">{c.status}</td>
                    <td className="px-2 py-1">{c.assignedTo ?? "—"}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{c.doneRatio}%</td>
                    <td className="px-2 py-1 text-right tabular-nums">{hours(h.estimated)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{hours(h.spent)}</td>
                  </tr>
                  );
                })}
                {children.length > MAX_CHILDREN_SHOWN && (
                  <tr>
                    <td colSpan={7} className="px-2 py-1 text-center text-slate-400 dark:text-slate-500">
                      Showing the first {MAX_CHILDREN_SHOWN} of {children.length} child tickets — export to see all.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}
