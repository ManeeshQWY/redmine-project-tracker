import { useMemo, useState } from "react";
import { Issue } from "../types/issue";
import {
  aggregateByPriority,
  aggregateByTracker,
  aggregateByTargetVersion,
  getAssignableUsers,
  getUserAssignedOpenTickets,
  summarizeUserAssignment,
  ticketAgeDays,
  UserAssignedTicket,
} from "../utils/aggregations";
import { blank, formatDate, formatHours } from "../utils/format";

type SortKey = "age" | "createdOn" | "dueDate";

function AssignmentTypeBadge({ type }: { type: UserAssignedTicket["assignmentType"] }) {
  const cls =
    type === "Both"
      ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
      : type === "Main Assignee"
        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
        : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${cls}`}>{type}</span>;
}

function MiniBreakdown({ title, rows }: { title: string; rows: { key: string; count: number }[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h4>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">No open tickets.</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center justify-between gap-4">
              <span className="text-slate-600 dark:text-slate-300">{r.key}</span>
              <span className="font-medium text-slate-800 dark:text-slate-100">{r.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function UserAssignmentPanel({ issues, redmineBaseUrl }: { issues: Issue[]; redmineBaseUrl: string }) {
  const [selectedUser, setSelectedUser] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("age");
  const [selectedTrackers, setSelectedTrackers] = useState<string[]>([]); // [] = All

  const users = useMemo(() => getAssignableUsers(issues), [issues]);
  const assigned = useMemo(() => (selectedUser ? getUserAssignedOpenTickets(issues, selectedUser) : []), [issues, selectedUser]);

  // Tracker options reflect this user's full assigned set (not already tracker-filtered),
  // so switching trackers on/off never removes options out from under you.
  const availableTrackers = useMemo(
    () => Array.from(new Set(assigned.map((a) => a.issue.tracker || "(blank)"))).sort((a, b) => a.localeCompare(b)),
    [assigned]
  );

  function toggleTracker(tracker: string) {
    setSelectedTrackers((prev) => (prev.includes(tracker) ? prev.filter((t) => t !== tracker) : [...prev, tracker]));
  }

  const trackerFiltered = useMemo(
    () => (selectedTrackers.length === 0 ? assigned : assigned.filter((a) => selectedTrackers.includes(a.issue.tracker || "(blank)"))),
    [assigned, selectedTrackers]
  );

  // Filtering by tracker updates the KPI summary/breakdowns too, consistent with how
  // filters work everywhere else in the app (Overview's KPIs already reflect FiltersBar).
  const summary = useMemo(() => summarizeUserAssignment(trackerFiltered), [trackerFiltered]);

  const sorted = useMemo(() => {
    const withAge = trackerFiltered.map((a) => ({ ...a, age: ticketAgeDays(a.issue) ?? 0 }));
    return withAge.sort((a, b) => {
      if (sortKey === "age") return b.age - a.age;
      if (sortKey === "createdOn") return b.issue.createdOn.localeCompare(a.issue.createdOn);
      // dueDate: nulls last, earliest due date first
      if (!a.issue.dueDate) return 1;
      if (!b.issue.dueDate) return -1;
      return a.issue.dueDate.localeCompare(b.issue.dueDate);
    });
  }, [trackerFiltered, sortKey]);

  const assignedIssues = useMemo(() => trackerFiltered.map((a) => a.issue), [trackerFiltered]);
  const byTracker = useMemo(() => aggregateByTracker(assignedIssues), [assignedIssues]);
  const byPriority = useMemo(() => aggregateByPriority(assignedIssues), [assignedIssues]);
  const byVersion = useMemo(() => aggregateByTargetVersion(assignedIssues), [assignedIssues]);

  const selectCls =
    "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200";

  function handleSelectUser(name: string) {
    setSelectedUser(name);
    setSelectedTrackers([]); // reset — last user's tracker selection may not apply to the new user
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
          Assigned User:
          <select className={selectCls} value={selectedUser} onChange={(e) => handleSelectUser(e.target.value)}>
            <option value="">Select a user…</option>
            {users.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </label>
      </div>

      {!selectedUser && (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          Select a user above to see their currently open assigned tickets (as Main Assignee or Additional Assignee).
        </div>
      )}

      {selectedUser && (
        <>
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[180px] rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Selected User</div>
              <div className="mt-1 text-lg font-semibold text-slate-800 dark:text-slate-100">{selectedUser}</div>
            </div>
            <div className="flex-1 min-w-[140px] rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Total Open Assigned</div>
              <div className="mt-1 text-2xl font-semibold text-slate-800 dark:text-slate-100">{summary.total}</div>
            </div>
            <div className="flex-1 min-w-[140px] rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Main Assignee</div>
              <div className="mt-1 text-2xl font-semibold text-brand-600 dark:text-brand-500">{summary.mainCount}</div>
            </div>
            <div className="flex-1 min-w-[140px] rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Additional Assignee</div>
              <div className="mt-1 text-2xl font-semibold text-slate-600 dark:text-slate-300">{summary.additionalCount}</div>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Assigned Open Tickets</h3>
              <select className={selectCls} value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
                <option value="age">Sort by Ticket Age (oldest first)</option>
                <option value="createdOn">Sort by Created On (newest first)</option>
                <option value="dueDate">Sort by Due Date (earliest first)</option>
              </select>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">Tracker:</span>
              <button
                onClick={() => setSelectedTrackers([])}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                  selectedTrackers.length === 0
                    ? "bg-brand-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                }`}
              >
                All
              </button>
              {availableTrackers.map((tracker) => {
                const active = selectedTrackers.includes(tracker);
                return (
                  <button
                    key={tracker}
                    onClick={() => toggleTracker(tracker)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                      active
                        ? "bg-brand-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
                    }`}
                  >
                    {tracker}
                  </button>
                );
              })}
            </div>

            <div className="max-h-[520px] overflow-auto">
              <table className="w-full min-w-[1200px] text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <tr>
                    <th className="px-2 py-1.5">ID</th>
                    <th className="px-2 py-1.5">Subject</th>
                    <th className="px-2 py-1.5">Tracker</th>
                    <th className="px-2 py-1.5">Status</th>
                    <th className="px-2 py-1.5">Priority</th>
                    <th className="px-2 py-1.5">Main Assignee</th>
                    <th className="px-2 py-1.5">Additional Assignee</th>
                    <th className="px-2 py-1.5">Assignment Type</th>
                    <th className="px-2 py-1.5">Target Version</th>
                    <th className="px-2 py-1.5">Created On</th>
                    <th className="px-2 py-1.5">Due Date</th>
                    <th className="px-2 py-1.5 text-right">Age (days)</th>
                    <th className="px-2 py-1.5 text-right">Est. Hours</th>
                    <th className="px-2 py-1.5 text-right">Total Spent</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(({ issue, assignmentType, age }) => (
                    <tr key={issue.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-2 py-1.5 font-medium text-brand-700 dark:text-brand-500">
                        <a href={`${redmineBaseUrl}/issues/${issue.id}`} target="_blank" rel="noreferrer noopener" className="hover:underline">
                          #{issue.id}
                        </a>
                      </td>
                      <td className="max-w-[240px] truncate px-2 py-1.5" title={issue.subject}>{issue.subject}</td>
                      <td className="px-2 py-1.5">{blank(issue.tracker)}</td>
                      <td className="px-2 py-1.5">{blank(issue.status)}</td>
                      <td className="px-2 py-1.5">{blank(issue.priority)}</td>
                      <td className="px-2 py-1.5">{blank(issue.assignedTo)}</td>
                      <td className="px-2 py-1.5">{(issue.additionalAssignees ?? []).map((a) => a.name).join(", ")}</td>
                      <td className="px-2 py-1.5"><AssignmentTypeBadge type={assignmentType} /></td>
                      <td className="px-2 py-1.5">{blank(issue.targetVersion)}</td>
                      <td className="px-2 py-1.5">{formatDate(issue.createdOn)}</td>
                      <td className="px-2 py-1.5">{formatDate(issue.dueDate)}</td>
                      <td className="px-2 py-1.5 text-right font-medium">{age}</td>
                      <td className="px-2 py-1.5 text-right">{formatHours(issue.estimatedHours)}</td>
                      <td className="px-2 py-1.5 text-right">{formatHours(issue.totalSpentHours)}</td>
                    </tr>
                  ))}
                  {sorted.length === 0 && (
                    <tr>
                      <td colSpan={14} className="px-2 py-6 text-center text-slate-400 dark:text-slate-500">
                        No open tickets assigned to {selectedUser}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MiniBreakdown title="Open Tickets by Tracker" rows={byTracker} />
            <MiniBreakdown title="Open Tickets by Priority" rows={byPriority} />
            <MiniBreakdown title="Open Tickets by Target Version" rows={byVersion} />
          </div>
        </>
      )}
    </div>
  );
}
