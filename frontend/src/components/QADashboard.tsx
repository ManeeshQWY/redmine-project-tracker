import { useMemo, useState } from "react";
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

type SortKey = "total" | "qaPending" | "qaCompleted";

export default function QADashboard({ issues }: { issues: Issue[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const stageCounts = useMemo(
    () => QA_STAGE_MATCHERS.map((m) => ({ label: m.label, count: issues.filter((i) => m.match(i.status)).length })),
    [issues]
  );
  const qaRows = useMemo(() => {
    const data = aggregateByQA(issues);
    return [...data].sort((a, b) => b[sortKey] - a[sortKey]);
  }, [issues, sortKey]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">QA Pipeline</h3>
        <div className="grid grid-cols-2 gap-2">
          {stageCounts.map((s) => (
            <div key={s.label} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-center dark:border-slate-700 dark:bg-slate-800">
              <div className="text-[11px] uppercase text-slate-500 dark:text-slate-400">{s.label}</div>
              <div className="text-lg font-semibold text-slate-800 dark:text-slate-100">{s.count}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Tickets by Assigned QA</h3>
          <select
            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
          >
            <option value="total">Sort by Total</option>
            <option value="qaPending">Sort by QA Pending</option>
            <option value="qaCompleted">Sort by QA Completed</option>
          </select>
        </div>
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-2 py-1.5">Assigned QA</th>
                <th className="px-2 py-1.5 text-right">Total</th>
                <th className="px-2 py-1.5 text-right">QA Pending</th>
                <th className="px-2 py-1.5 text-right">QA Completed</th>
              </tr>
            </thead>
            <tbody>
              {qaRows.map((r) => (
                <tr key={r.qa} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-2 py-1.5">{r.qa}</td>
                  <td className="px-2 py-1.5 text-right">{r.total}</td>
                  <td className="px-2 py-1.5 text-right">{r.qaPending}</td>
                  <td className="px-2 py-1.5 text-right">{r.qaCompleted}</td>
                </tr>
              ))}
              {qaRows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-2 py-4 text-center text-slate-400 dark:text-slate-500">No tickets with Assigned QA set.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
