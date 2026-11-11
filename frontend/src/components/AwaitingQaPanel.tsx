import { useMemo } from "react";
import { Issue } from "../types/issue";
import { awaitingQa } from "../utils/insights";
import { awaitingQaSheets } from "../utils/reportSheets";
import ExportButton from "./ExportButton";
import TicketLink from "./TicketLink";

interface Props {
  issues: Issue[];
  redmineBaseUrl: string;
  projectLabel?: string;
  now?: Date;
}

const MAX_SHOWN = 100;

/** The testing queue: development is finished, nobody has picked it up for QA yet. */
export default function AwaitingQaPanel({ issues, redmineBaseUrl, projectLabel = "project", now }: Props) {
  const queue = useMemo(() => awaitingQa(issues, now ?? new Date()), [issues, now]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        Waiting for QA <span className="font-normal text-slate-500 dark:text-slate-400">({queue.length.toLocaleString()})</span>
      </h3>
        <ExportButton build={() => awaitingQaSheets(queue, redmineBaseUrl)} filenamePrefix="redmine_waiting_for_qa" projectLabel={projectLabel} label="Export QA queue" disabled={queue.length === 0} />
      </div>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Tickets in &ldquo;Dev Completed&rdquo; (or similar) that have not started testing, longest wait first. The wait is the days since the ticket was last updated.
      </p>
      {queue.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">Nothing is waiting for QA.</p>
      ) : (
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-left text-xs" aria-label="Waiting for QA">
            <tbody>
              {queue.slice(0, MAX_SHOWN).map((q) => (
                <tr key={q.issue.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="w-16 px-2 py-1"><TicketLink id={q.issue.id} redmineBaseUrl={redmineBaseUrl} /></td>
                  <td className="px-2 py-1">{q.issue.subject}</td>
                  <td className="w-28 px-2 py-1 text-slate-500 dark:text-slate-400">{q.issue.status}</td>
                  <td className="w-32 px-2 py-1 text-slate-500 dark:text-slate-400">{q.issue.assignedTo ?? "—"}</td>
                  <td className="w-20 px-2 py-1 text-right tabular-nums text-slate-500 dark:text-slate-400">{q.waitingDays} d</td>
                </tr>
              ))}
            </tbody>
          </table>
          {queue.length > MAX_SHOWN && (
            <p className="py-1 text-center text-xs text-slate-500 dark:text-slate-400">Longest {MAX_SHOWN} of {queue.length} shown.</p>
          )}
        </div>
      )}
    </div>
  );
}
