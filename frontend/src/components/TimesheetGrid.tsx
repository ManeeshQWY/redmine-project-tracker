import { useMemo, useState } from "react";
import { Issue, TimeEntry } from "../types/issue";
import { LoadWindow } from "../utils/dataWindow";
import { todayString } from "../utils/activity";
import { formatHours } from "../utils/format";
import { timesheetSheets } from "../utils/reportSheets";
import { buildTimesheet } from "../utils/timesheet";
import ExportButton from "./ExportButton";
import NumberInput from "./NumberInput";

interface Props {
  entries: TimeEntry[];
  issues: Issue[];
  loadWindow: LoadWindow;
  projectLabel?: string;
  now?: Date;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_SHOWN = 10;
const inputCls =
  "w-14 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200";

function dayHeader(date: string): string {
  return `${WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]} ${Number(date.slice(8, 10))}`;
}

/** Who logged hours on each of the last ten working days: blanks are the people to chase. */
export default function TimesheetGrid({ entries, issues, loadWindow, projectLabel = "project", now }: Props) {
  const [hoursPerDay, setHoursPerDay] = useState(6);
  const [maxDaily, setMaxDaily] = useState(10);
  // A period that ended in the past has nothing to say about "the last ten days"
  const current = now ?? new Date();
  // Today is not over, so a blank today is not "missing": the grid ends at the last finished day.
  const yesterday = todayString(new Date(current.getTime() - 86_400_000));
  const end = loadWindow.kind === "range" && loadWindow.to < yesterday ? loadWindow.to : yesterday;
  const sheet = useMemo(() => buildTimesheet(entries, issues, end, DAYS_SHOWN, hoursPerDay, maxDaily), [entries, issues, end, hoursPerDay, maxDaily]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Who logged time — last {DAYS_SHOWN} working days</h3>
        <div className="flex items-center gap-4 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          <ExportButton build={() => timesheetSheets(sheet)} filenamePrefix="redmine_timesheet" projectLabel={projectLabel} label="Export timesheet" disabled={sheet.people.length === 0} />
          <label className="flex items-center gap-1.5" title="Used for the capacity column">
            Hours per day
            <NumberInput className={inputCls} value={hoursPerDay} min={1} max={24} aria-label="Hours per day" onCommit={setHoursPerDay} />
          </label>
          <label className="flex items-center gap-1.5" title="A day with more hours than this is highlighted">
            Flag above (h)
            <NumberInput className={inputCls} value={maxDaily} min={1} max={24} aria-label="Flag above (hours)" onCommit={setMaxDaily} />
          </label>
        </div>
      </div>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Everyone who logged time, or has an open ticket, up to {end}{end === yesterday ? " (today is not counted until it is over)" : ""}. A dash is a working day with nothing logged; amber is more than {maxDaily} hours.
      </p>

      {sheet.people.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">Nobody has logged time or has open tickets.</p>
      ) : (
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full text-left text-xs" aria-label="Hours logged per person per day">
            <thead className="sticky top-0 z-[1] bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-2 py-1.5">Person</th>
                {sheet.days.map((d) => (
                  <th key={d} className="px-1.5 py-1.5 text-center font-medium">{dayHeader(d)}</th>
                ))}
                <th className="px-2 py-1.5 text-right" title="Days with hours logged, out of the days shown">Days</th>
                <th className="px-2 py-1.5 text-right">Hours</th>
                <th className="px-2 py-1.5 text-right" title="Hours logged as a share of days x hours per day">Capacity</th>
                <th className="px-2 py-1.5 text-right" title="Open tickets they are on">Open</th>
                <th className="px-2 py-1.5 text-right">Last logged</th>
              </tr>
            </thead>
            <tbody>
              {sheet.people.map((p) => (
                <tr key={p.name} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="whitespace-nowrap px-2 py-1.5">{p.name}</td>
                  {sheet.days.map((d) => {
                    const h = p.hoursByDay[d] ?? 0;
                    const cls =
                      h === 0
                        ? "bg-rose-50 text-rose-400 dark:bg-rose-950/40 dark:text-rose-400"
                        : h > maxDaily
                          ? "bg-amber-100 font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                          : "";
                    return (
                      <td key={d} className={`px-1.5 py-1.5 text-center tabular-nums ${cls}`}>
                        {h === 0 ? "—" : formatHours(h)}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-right tabular-nums">{p.daysLogged}/{sheet.days.length}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{formatHours(p.total) || "0"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{Math.round(p.capacityPercent)}%</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{p.openTickets === 0 ? <span className="text-slate-300 dark:text-slate-600">0</span> : p.openTickets}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-slate-500 dark:text-slate-400">{p.lastLogged ?? "never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
