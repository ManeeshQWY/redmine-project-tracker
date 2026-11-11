import { useMemo, useState } from "react";
import { useTimeEntries } from "../hooks/useTimeEntries";
import { Issue } from "../types/issue";
import { buildChaseTiles, chaseTileAsText, ChaseSettings, ChaseTile, ChaseTileId, DEFAULT_CHASE_SETTINGS, groupByAssignee, MAX_SETTING } from "../utils/chase";
import { LoadWindow } from "../utils/dataWindow";
import { chaseSheets } from "../utils/reportSheets";
import ExportButton from "./ExportButton";
import LimitedWindowNotice from "./LimitedWindowNotice";
import NumberInput from "./NumberInput";
import TicketLink from "./TicketLink";

interface Props {
  projectIdentifier: string;
  issues: Issue[]; // every loaded ticket — "has children" must be judged on the whole set
  trackers?: string[]; // the app-wide Tracker chips: which tickets are listed
  redmineBaseUrl: string;
  projectLabel?: string;
  loadWindow: LoadWindow;
  onSessionExpired: () => void;
  onLoadAllTime?: () => void;
  refreshTick?: number;
  now?: Date;
}

const MAX_SHOWN = 300;
const inputCls =
  "h-8 w-20 rounded-lg border border-ctl bg-white px-2 text-xs text-slate-900 shadow-sm dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100";

/** How serious a tile is when it has tickets in it: a count of things that should be none is an alert or a warning. */
type Severity = "danger" | "warning" | "info";
const SEVERITY: Record<ChaseTileId, Severity> = {
  overdue: "danger",
  overBudget: "danger",
  stale: "warning",
  activeUnassigned: "warning",
  unassigned: "warning",
  noEstimate: "warning",
  loggedButNew: "warning",
  devDoneNoTime: "warning",
  blocked: "warning",
  moved: "info",
};
/** Most urgent first — the order a manager chases in. */
const ORDER: ChaseTileId[] = ["overdue", "overBudget", "stale", "activeUnassigned", "unassigned", "noEstimate", "loggedButNew", "devDoneNoTime", "blocked", "moved"];

const countCls: Record<Severity, string> = {
  danger: "text-rose-700 dark:text-rose-300",
  warning: "text-amber-800 dark:text-amber-300",
  info: "text-slate-900 dark:text-slate-50",
};

/** A badge for how long a ticket has been idle: the number is always there, the colour only adds urgency. */
function idleBadge(days: number): string {
  if (days >= 30) return "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300";
  if (days >= 8) return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
  return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
}

/** The daily stand-up page: one tile per question a manager asks, each with the tickets behind it. */
export default function ChasePanel({ projectIdentifier, issues, trackers = [], redmineBaseUrl, projectLabel = "project", loadWindow, onSessionExpired, onLoadAllTime, refreshTick = 0, now }: Props) {
  const [settings, setSettings] = useState<ChaseSettings>(DEFAULT_CHASE_SETTINGS);
  const [selected, setSelected] = useState<ChaseTileId>("stale");
  const [copied, setCopied] = useState(false);
  const { entries, loading } = useTimeEntries(projectIdentifier, loadWindow, onSessionExpired, true, refreshTick);

  const tiles = useMemo(() => {
    const built = buildChaseTiles(issues, entries, settings, now ?? new Date());
    const scoped = trackers.length === 0 ? built : built.map((t): ChaseTile => ({ ...t, items: t.items.filter((i) => trackers.includes(i.issue.tracker || "(blank)")) }));
    return [...scoped].sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  }, [issues, entries, settings, trackers, now]);

  const tile = tiles.find((t) => t.id === selected) ?? tiles[0];
  const groups = useMemo(() => groupByAssignee(tile.items), [tile]);

  // The page in one line: how many of the checks have something in them, and the longest wait.
  const lead = useMemo(() => {
    const checks = tiles.filter((t) => t.id !== "moved");
    const flagged = checks.filter((t) => t.items.length > 0);
    let longest: { days: number; who: string } | null = null;
    for (const t of flagged) for (const it of t.items) if (!longest || it.idleDays > longest.days) longest = { days: it.idleDays, who: it.issue.assignedTo ?? "unassigned" };
    return { total: checks.length, flagged: flagged.length, longest };
  }, [tiles]);

  async function copy() {
    const text = chaseTileAsText(tile);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copy this list:", text);
    }
  }

  const setting = (key: keyof ChaseSettings, label: string, hint: string) => (
    <label className="flex flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-400" title={hint}>
      {label}
      <NumberInput
        className={inputCls}
        value={settings[key]}
        min={0}
        max={MAX_SETTING}
        integer
        aria-label={label}
        onCommit={(v) => setSettings((s) => ({ ...s, [key]: v }))}
      />
    </label>
  );

  let shownSoFar = 0;
  return (
    <div className="space-y-4">
      <LimitedWindowNotice loadWindow={loadWindow} onLoadAllTime={onLoadAllTime} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-base leading-6 text-slate-700 dark:text-slate-300">
          <span className="font-semibold text-slate-900 dark:text-slate-50">
            {lead.flagged} of {lead.total} checks
          </span>{" "}
          need attention.
          {lead.longest && lead.longest.days > 0 && (
            <>
              {" "}
              Longest wait: <span className="font-semibold text-slate-900 dark:text-slate-50">{lead.longest.days} days</span> ({lead.longest.who}).
            </>
          )}
        </p>
        <ExportButton build={() => chaseSheets(tiles, redmineBaseUrl)} filenamePrefix="redmine_standup" projectLabel={projectLabel} label="Export all tiles" />
      </div>

      <details className="group rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
          <span>
            Quiet after <b className="text-slate-900 dark:text-slate-100">{settings.staleWorkingDays}</b> working days · Over budget at{" "}
            <b className="text-slate-900 dark:text-slate-100">{settings.overBudgetPercent}%</b> of estimate · What moved looks back{" "}
            <b className="text-slate-900 dark:text-slate-100">{settings.movedDays}</b> day{settings.movedDays === 1 ? "" : "s"}
          </span>
          <span className="font-medium text-brand-700 underline-offset-2 group-open:hidden hover:underline dark:text-brand-400">Edit</span>
          <span
            role="status"
            className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${
              loading
                ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                : entries
                  ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
            }`}
          >
            {loading ? "Loading time entries to tell quiet from busy…" : entries ? "Hours logged count as activity." : "Using ticket updates only — hours logged are not counted as activity."}
          </span>
        </summary>
        <div className="mt-3 flex flex-wrap items-end gap-4 border-t border-slate-100 pt-3 dark:border-slate-800">
          {setting("staleWorkingDays", "Quiet after (working days)", "An In Progress ticket with no update or hours logged for longer than this is 'gone quiet'")}
          {setting("overBudgetPercent", "Over budget at (% of estimate)", "Open tickets whose logged hours are above this share of their estimate")}
          {setting("movedDays", "What moved: last (days)", "How far back 'What moved' looks")}
        </div>
      </details>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {tiles.map((t) => {
          const active = t.id === tile.id;
          const has = t.items.length > 0;
          const severity = SEVERITY[t.id];
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelected(t.id)}
              aria-pressed={active}
              className={`flex min-w-0 flex-col rounded-xl border p-4 text-left shadow-sm transition-colors dark:shadow-none ${
                active
                  ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500 dark:border-brand-400 dark:bg-brand-900/30 dark:ring-brand-400"
                  : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className={`text-3xl font-semibold leading-8 ${has ? countCls[severity] : "text-slate-900 dark:text-slate-50"}`}>{t.items.length.toLocaleString()}</span>
                {has && severity !== "info" ? (
                  <span aria-hidden className={`text-base ${countCls[severity]}`}>▲</span>
                ) : !has ? (
                  <span aria-hidden className="text-base text-emerald-700 dark:text-emerald-400">✓</span>
                ) : null}
              </span>
              <span className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{t.title}</span>
              <span className="mt-1 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{has ? t.hint : "All clear"}</span>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none sm:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-[15px] font-semibold leading-5 text-slate-900 dark:text-slate-50">
              {tile.title} <span className="font-normal text-slate-500 dark:text-slate-400">({tile.items.length.toLocaleString()})</span>
            </h3>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">{tile.hint}</p>
          </div>
          <button
            onClick={copy}
            disabled={tile.items.length === 0}
            className="rounded-lg border border-ctl bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <span aria-live="polite">{copied ? "Copied ✓" : "Copy as text"}</span>
          </button>
        </div>

        {tile.items.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-600 dark:text-slate-400">Nothing here — all clear.</p>
        ) : (
          <div className="max-h-[560px] space-y-4 overflow-auto">
            {groups.map((g) => {
              const room = Math.max(0, MAX_SHOWN - shownSoFar);
              const list = g.items.slice(0, room);
              shownSoFar += list.length;
              if (list.length === 0) return null;
              return (
                <div key={g.assignee}>
                  <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                      {g.assignee.replace(/^\(/, "").slice(0, 1).toUpperCase()}
                    </span>
                    <span>
                      {g.assignee} <span className="font-normal text-slate-500 dark:text-slate-400">({g.items.length})</span>
                    </span>
                  </div>
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {list.map((it) => (
                      <li key={it.issue.id} className="grid grid-cols-[4rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 py-1.5 text-[13px] sm:grid-cols-[4rem_minmax(0,1fr)_auto_auto_auto]">
                        <TicketLink id={it.issue.id} redmineBaseUrl={redmineBaseUrl} />
                        <span className="min-w-0 truncate" title={it.issue.subject}>
                          {it.issue.subject}
                        </span>
                        <span className="col-start-2 text-xs text-slate-500 dark:text-slate-400 sm:col-start-auto">
                          {it.issue.tracker} · {it.issue.status}
                        </span>
                        <span className={`justify-self-start whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium tabular-nums sm:justify-self-end ${idleBadge(it.idleDays)}`} title="Days since the last update or hours logged">
                          idle {it.idleDays}d
                        </span>
                        <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400 sm:text-right">{it.note ?? ""}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            {tile.items.length > MAX_SHOWN && (
              <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                Showing the first {MAX_SHOWN} of {tile.items.length.toLocaleString()} — use Copy as text for the whole list.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
