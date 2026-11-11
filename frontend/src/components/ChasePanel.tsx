import { useMemo, useState } from "react";
import { useTimeEntries } from "../hooks/useTimeEntries";
import { Issue } from "../types/issue";
import { buildChaseTiles, chaseTileAsText, ChaseSettings, ChaseTile, ChaseTileId, DEFAULT_CHASE_SETTINGS, groupByAssignee, MAX_SETTING } from "../utils/chase";
import { LoadWindow, windowPhrase } from "../utils/dataWindow";
import { chaseSheets } from "../utils/reportSheets";
import ExportButton from "./ExportButton";
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
  "w-16 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200";

/** The daily stand-up page: one tile per question a manager asks, each with the tickets behind it. */
export default function ChasePanel({ projectIdentifier, issues, trackers = [], redmineBaseUrl, projectLabel = "project", loadWindow, onSessionExpired, onLoadAllTime, refreshTick = 0, now }: Props) {
  const [settings, setSettings] = useState<ChaseSettings>(DEFAULT_CHASE_SETTINGS);
  const [selected, setSelected] = useState<ChaseTileId>("stale");
  const [copied, setCopied] = useState(false);
  const { entries, loading } = useTimeEntries(projectIdentifier, loadWindow, onSessionExpired, true, refreshTick);
  const limitedWindow = loadWindow.kind === "range" || loadWindow.days > 0;

  const tiles = useMemo(() => {
    const built = buildChaseTiles(issues, entries, settings, now ?? new Date());
    if (trackers.length === 0) return built;
    return built.map((t): ChaseTile => ({ ...t, items: t.items.filter((i) => trackers.includes(i.issue.tracker || "(blank)")) }));
  }, [issues, entries, settings, trackers, now]);

  const tile = tiles.find((t) => t.id === selected) ?? tiles[0];
  const groups = useMemo(() => groupByAssignee(tile.items), [tile]);

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
    <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400" title={hint}>
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
      {limitedWindow && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <span>
            Only tickets updated in {windowPhrase(loadWindow)} are loaded, so open tickets nobody has touched since then are missing — and
            those are exactly the ones this page is for.
          </span>
          {onLoadAllTime && (
            <button
              onClick={onLoadAllTime}
              className="rounded border border-amber-300 bg-white px-2 py-0.5 font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-transparent dark:text-amber-300"
            >
              Load all time
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs shadow-sm dark:border-slate-700 dark:bg-slate-900">
        {setting("staleWorkingDays", "Quiet after (working days)", "An In Progress ticket with no update or hours logged for longer than this is 'gone quiet'")}
        {setting("overBudgetPercent", "Over budget at (% of estimate)", "Open tickets whose logged hours are above this share of their estimate")}
        {setting("movedDays", "What moved: last (days)", "How far back 'What moved' looks")}
        <span className="ml-auto">
          <ExportButton build={() => chaseSheets(tiles, redmineBaseUrl)} filenamePrefix="redmine_standup" projectLabel={projectLabel} label="Export all tiles" />
        </span>
        <span className="basis-full text-right text-[11px] text-slate-400 dark:text-slate-500">
          {loading
            ? "Loading time entries to tell quiet from busy…"
            : entries
              ? "Hours logged count as activity."
              : "Using ticket updates only — hours logged are not counted as activity."}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => {
          const active = t.id === tile.id;
          return (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              aria-pressed={active}
              title={t.hint}
              className={`rounded-xl border p-3 text-left shadow-sm transition-colors ${
                active
                  ? "border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-900/40"
                  : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600"
              }`}
            >
              <div className={`text-2xl font-semibold ${t.items.length === 0 ? "text-slate-500 dark:text-slate-500" : "text-slate-800 dark:text-slate-100"}`}>
                {t.items.length.toLocaleString()}
              </div>
              <div className="mt-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">{t.title}</div>
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {tile.title} <span className="font-normal text-slate-400">({tile.items.length.toLocaleString()})</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{tile.hint}</p>
          </div>
          <button
            onClick={copy}
            disabled={tile.items.length === 0}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            {copied ? "Copied ✓" : "Copy as text"}
          </button>
        </div>

        {tile.items.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">Nothing here — all clear.</p>
        ) : (
          <div className="max-h-[560px] space-y-3 overflow-auto">
            {groups.map((g) => {
              const room = Math.max(0, MAX_SHOWN - shownSoFar);
              const list = g.items.slice(0, room);
              shownSoFar += list.length;
              if (list.length === 0) return null;
              return (
                <div key={g.assignee}>
                  <div className="mb-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {g.assignee} <span className="font-normal text-slate-400">({g.items.length})</span>
                  </div>
                  <table className="w-full text-left text-[11px]">
                    <tbody>
                      {list.map((it) => (
                        <tr key={it.issue.id} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="w-16 px-2 py-1"><TicketLink id={it.issue.id} redmineBaseUrl={redmineBaseUrl} /></td>
                          <td className="px-2 py-1">{it.issue.subject}</td>
                          <td className="w-24 px-2 py-1 text-slate-400 dark:text-slate-500">{it.issue.tracker}</td>
                          <td className="w-32 px-2 py-1 text-slate-500 dark:text-slate-400">{it.issue.status}</td>
                          <td className="w-28 px-2 py-1 text-right tabular-nums text-slate-500 dark:text-slate-400" title="Days since the last update or hours logged">
                            idle {it.idleDays}d
                          </td>
                          <td className="w-32 px-2 py-1 text-right tabular-nums text-slate-500 dark:text-slate-400">{it.note ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
            {tile.items.length > MAX_SHOWN && (
              <p className="text-center text-[11px] text-slate-400 dark:text-slate-500">
                Showing the first {MAX_SHOWN} of {tile.items.length.toLocaleString()} — use Copy as text for the whole list.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
