import { useMemo } from "react";
import { Issue } from "../types/issue";
import { aggregateByQA } from "../utils/aggregations";

// Matches dynamically against whatever status names this Redmine instance actually has,
// rather than assuming fixed names — falls back gracefully if a status doesn't exist.
const QA_STAGE_MATCHERS: { label: string; match: (status: string) => boolean }[] = [
  { label: "Released to QA", match: (s) => s.toLowerCase().includes("released to qa") },
  { label: "QA In Progress", match: (s) => s.toLowerCase().includes("qa in progress") },
  { label: "QA Completed", match: (s) => s.toLowerCase().includes("qa completed") },
  { label: "Closed", match: (s) => s.toLowerCase() === "closed" },
];

export default function QADashboard({ issues }: { issues: Issue[] }) {
  const stageCounts = useMemo(
    () => QA_STAGE_MATCHERS.map((m) => ({ label: m.label, count: issues.filter((i) => m.match(i.status)).length })),
    [issues]
  );
  const qaRows = useMemo(() => aggregateByQA(issues), [issues]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">QA Pipeline</h3>
        <div className="grid grid-cols-2 gap-2">
          {stageCounts.map((s) => (
            <div key={s.label} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-center">
              <div className="text-[11px] uppercase text-slate-500">{s.label}</div>
              <div className="text-lg font-semibold text-slate-800">{s.count}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Tickets by Assigned QA</h3>
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-2 py-1.5">Assigned QA</th>
                <th className="px-2 py-1.5 text-right">Total</th>
                <th className="px-2 py-1.5 text-right">QA Pending</th>
                <th className="px-2 py-1.5 text-right">QA Completed</th>
              </tr>
            </thead>
            <tbody>
              {qaRows.map((r) => (
                <tr key={r.qa} className="border-t border-slate-100">
                  <td className="px-2 py-1.5">{r.qa}</td>
                  <td className="px-2 py-1.5 text-right">{r.total}</td>
                  <td className="px-2 py-1.5 text-right">{r.qaPending}</td>
                  <td className="px-2 py-1.5 text-right">{r.qaCompleted}</td>
                </tr>
              ))}
              {qaRows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-2 py-4 text-center text-slate-400">No tickets with Assigned QA set.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
