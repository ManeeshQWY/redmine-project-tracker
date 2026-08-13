import { useMemo } from "react";
import { Issue } from "../types/issue";
import { bucketAgingOpenTickets, ticketAgeDays } from "../utils/aggregations";
import { formatDate } from "../utils/format";
import BreakdownChart from "./BreakdownChart";

export default function AgingPanel({ issues, redmineBaseUrl }: { issues: Issue[]; redmineBaseUrl: string }) {
  const buckets = useMemo(() => bucketAgingOpenTickets(issues), [issues]);

  const oldestOpen = useMemo(() => {
    return issues
      .filter((i) => !i.statusIsClosed)
      .map((i) => ({ issue: i, age: ticketAgeDays(i) ?? 0 }))
      .sort((a, b) => b.age - a.age)
      .slice(0, 25);
  }, [issues]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <BreakdownChart title="Ticket Aging (Open Tickets)" data={buckets} />
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Oldest Open Tickets</h3>
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-2 py-1.5">ID</th>
                <th className="px-2 py-1.5">Subject</th>
                <th className="px-2 py-1.5">Status</th>
                <th className="px-2 py-1.5">Created</th>
                <th className="px-2 py-1.5 text-right">Age (days)</th>
              </tr>
            </thead>
            <tbody>
              {oldestOpen.map(({ issue, age }) => (
                <tr key={issue.id} className="border-t border-slate-100">
                  <td className="px-2 py-1.5 font-medium text-brand-700">
                    <a href={`${redmineBaseUrl}/issues/${issue.id}`} target="_blank" rel="noreferrer noopener" className="hover:underline">
                      #{issue.id}
                    </a>
                  </td>
                  <td className="max-w-[240px] truncate px-2 py-1.5" title={issue.subject}>{issue.subject}</td>
                  <td className="px-2 py-1.5">{issue.status}</td>
                  <td className="px-2 py-1.5">{formatDate(issue.createdOn)}</td>
                  <td className="px-2 py-1.5 text-right font-medium">{age}</td>
                </tr>
              ))}
              {oldestOpen.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-4 text-center text-slate-400">No open tickets.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
