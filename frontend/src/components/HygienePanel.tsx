import { useMemo, useState } from "react";
import { useTimeEntries } from "../hooks/useTimeEntries";
import { Issue } from "../types/issue";
import { LoadWindow, windowPhrase } from "../utils/dataWindow";
import { buildHygiene, HygieneCheckId } from "../utils/hygiene";
import { hygieneSheets } from "../utils/reportSheets";
import ExportButton from "./ExportButton";
import TicketLink from "./TicketLink";

interface Props {
  projectIdentifier: string;
  issues: Issue[];
  redmineBaseUrl: string;
  projectLabel?: string;
  loadWindow: LoadWindow;
  onSessionExpired: () => void;
  onLoadAllTime?: () => void;
  trackers?: string[]; // the app-wide Tracker chips: which tickets are measured
  refreshTick?: number;
}

const MAX_SHOWN = 100;
const pct = (n: number | null) => (n === null ? "—" : n > 0 && n < 1 ? "<1%" : `${Math.round(n)}%`);

/** How complete the fields behind every other report are, and who leaves them blank. */
export default function HygienePanel({ projectIdentifier, issues, redmineBaseUrl, projectLabel = "project", loadWindow, onSessionExpired, onLoadAllTime, trackers = [], refreshTick = 0 }: Props) {
  const { entries } = useTimeEntries(projectIdentifier, loadWindow, onSessionExpired, true, refreshTick);
  // The chips choose which tickets are measured; "has children" and inherited versions still look at every ticket.
  const only = useMemo(
    () => (trackers.length > 0 ? new Set(issues.filter((i) => trackers.includes(i.tracker || "(blank)")).map((i) => i.id)) : undefined),
    [issues, trackers]
  );
  const report = useMemo(() => buildHygiene(issues, entries, only), [issues, entries, only]);
  const [open, setOpen] = useState<HygieneCheckId | "closedNotDone" | "activeNoTime" | null>(null);
  const limitedWindow = loadWindow.kind === "range" || loadWindow.days > 0;

  const listFor = (id: typeof open): Issue[] => {
    if (id === null) return [];
    const check = report.checks.find((c) => c.id === id);
    if (check) return check.missing;
    return report.problems.find((p) => p.id === id)?.issues ?? [];
  };
  const list = listFor(open);

  return (
    <div className="space-y-4">
      {limitedWindow && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          <span>Only tickets updated in {windowPhrase(loadWindow)} are loaded, so older open tickets are not part of these percentages.</span>
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

      <div className="flex justify-end">
        <ExportButton build={() => hygieneSheets(report, redmineBaseUrl)} filenamePrefix="redmine_data_quality" projectLabel={projectLabel} label="Export data quality" />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Are the tickets filled in?</h3>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          Of the {report.openLeaves.toLocaleString()} open tickets that have nothing nested under them. Click a line to see the tickets that are missing it.
        </p>
        <table className="w-full text-left text-xs">
          <tbody>
            {report.checks.map((c) => (
              <tr
                key={c.id}
                onClick={() => setOpen(open === c.id ? null : c.id)}
                aria-expanded={open === c.id}
                className="cursor-pointer border-t border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
              >
                <td className="px-2 py-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpen(open === c.id ? null : c.id);
                    }}
                    aria-expanded={open === c.id}
                    className="text-left hover:underline"
                  >
                    {c.label}
                  </button>
                </td>
                <td className="w-48 px-2 py-2">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden>
                    <div className="h-full rounded-full bg-brand-600" style={{ width: `${c.percent ?? 0}%` }} />
                  </div>
                </td>
                <td className="w-16 px-2 py-2 text-right font-medium tabular-nums">{pct(c.percent)}</td>
                <td className="w-40 px-2 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                  {c.missing.length.toLocaleString()} missing
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Things that look wrong</h3>
        <table className="w-full text-left text-xs">
          <tbody>
            {report.problems.map((p) => {
              const clickable = p.issues.length > 0;
              return (
                <tr
                  key={p.id}
                  onClick={clickable ? () => setOpen(open === p.id ? null : (p.id as typeof open)) : undefined}
                  aria-expanded={clickable ? open === p.id : undefined}
                  className={`border-t border-slate-100 dark:border-slate-800 ${clickable ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" : ""}`}
                >
                  <td className="px-2 py-2">
                    {clickable ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpen(open === p.id ? null : (p.id as typeof open));
                        }}
                        aria-expanded={open === p.id}
                        className="text-left hover:underline"
                      >
                        {p.label}
                      </button>
                    ) : (
                      p.label
                    )}
                  </td>
                  <td className="w-32 px-2 py-2 text-right font-medium tabular-nums">{p.count.toLocaleString()}</td>
                  <td className="w-40 px-2 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                    of {p.of.toLocaleString()}
                    {p.of > 0 ? ` (${Math.round((p.count / p.of) * 100)}%)` : ""}
                  </td>
                </tr>
              );
            })}
            {!entries && (
              <tr className="border-t border-slate-100 dark:border-slate-800">
                <td colSpan={3} className="px-2 py-2 text-slate-400 dark:text-slate-500">
                  Time-entry checks (not linked to a ticket, no comment) appear once this project&apos;s time entries have loaded.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {open !== null && (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            {report.checks.find((c) => c.id === open)?.label ?? report.problems.find((p) => p.id === open)?.label}{" "}
            <span className="font-normal text-slate-400">({list.length.toLocaleString()} tickets)</span>
          </h3>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-left text-[11px]">
              <tbody>
                {list.slice(0, MAX_SHOWN).map((i) => (
                  <tr key={i.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="w-16 px-2 py-1"><TicketLink id={i.id} redmineBaseUrl={redmineBaseUrl} /></td>
                    <td className="px-2 py-1">{i.subject}</td>
                    <td className="w-24 px-2 py-1 text-slate-400 dark:text-slate-500">{i.tracker}</td>
                    <td className="w-32 px-2 py-1 text-slate-500 dark:text-slate-400">{i.status}</td>
                    <td className="w-40 px-2 py-1 text-slate-500 dark:text-slate-400">{i.assignedTo ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.length > MAX_SHOWN && (
              <p className="py-2 text-center text-[11px] text-slate-400 dark:text-slate-500">
                Showing the first {MAX_SHOWN} of {list.length.toLocaleString()}.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Who holds the gaps</h3>
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-2 py-1.5">Assignee</th>
                <th className="px-2 py-1.5 text-right">Open tickets</th>
                <th className="px-2 py-1.5 text-right">No estimate</th>
                <th className="px-2 py-1.5 text-right">No due date</th>
                <th className="px-2 py-1.5 text-right">No target version</th>
              </tr>
            </thead>
            <tbody>
              {report.people.map((p) => (
                <tr key={p.name} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-2 py-1.5">{p.name}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{p.open}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{p.noEstimate}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{p.noDueDate}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{p.noVersion}</td>
                </tr>
              ))}
              {report.people.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-6 text-center text-slate-400 dark:text-slate-500">No open tickets.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
