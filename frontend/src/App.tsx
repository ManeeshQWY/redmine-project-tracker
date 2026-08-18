import { useEffect, useMemo, useState } from "react";
import { ALL_PROJECTS, ApiError, CurrentUser, getCurrentUser, getIssueCount, getMeta, getProjectIssues, getProjects, logout } from "./services/api";
import { Issue, MetaResult, ProjectMeta } from "./types/issue";
import { applyFilters, EMPTY_FILTERS, TicketFilters } from "./utils/filters";
import { aggregateByStatus, aggregateByTracker, aggregateByPriority, aggregateByTargetVersion } from "./utils/aggregations";
import { exportToExcel } from "./utils/excelExport";
import { useTheme } from "./theme";

import LoginScreen from "./components/LoginScreen";
import ProjectSelector from "./components/ProjectSelector";
import RefreshBar from "./components/RefreshBar";
import KpiCards from "./components/KpiCards";
import BreakdownChart from "./components/BreakdownChart";
import AssigneeSummaryTable from "./components/AssigneeSummaryTable";
import FiltersBar from "./components/FiltersBar";
import TicketTable from "./components/TicketTable";
import AgingPanel from "./components/AgingPanel";
import AgingByTrackerPanel from "./components/AgingByTrackerPanel";
import ResolutionTimePanel from "./components/ResolutionTimePanel";
import EstimateVsActualPanel from "./components/EstimateVsActualPanel";
import ReleaseDashboard from "./components/ReleaseDashboard";
import QADashboard from "./components/QADashboard";
import TimeSpentByUserPanel from "./components/TimeSpentByUserPanel";
import LoadingIndicator from "./components/LoadingIndicator";
import ClosedTicketsTrendPanel from "./components/ClosedTicketsTrendPanel";
import UserAssignmentPanel from "./components/UserAssignmentPanel";

type Tab = "overview" | "tickets" | "aging" | "release" | "qa" | "time" | "closedTrend" | "myAssigned";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "tickets", label: "Ticket Table" },
  { id: "aging", label: "Aging & Resolution" },
  { id: "release", label: "Release Dashboard" },
  { id: "qa", label: "QA Dashboard" },
  { id: "time", label: "Time Spent by User" },
  { id: "closedTrend", label: "Closed Tickets Trend" },
  { id: "myAssigned", label: "Open Tickets per User" },
];
const TAB_IDS = new Set(TABS.map((t) => t.id));

const PROJECT_STORAGE_KEY = "rtt.selectedProject";
const TAB_STORAGE_KEY = "rtt.tab";

function readStoredTab(): Tab {
  const stored = localStorage.getItem(TAB_STORAGE_KEY);
  return stored && TAB_IDS.has(stored as Tab) ? (stored as Tab) : "overview";
}

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<CurrentUser | null>(null);

  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [meta, setMeta] = useState<MetaResult | null>(null);
  // Restored from localStorage so a reload lands back where you left off — filters are
  // deliberately NOT persisted here, since a stale filter silently hiding data after a
  // reload would be more confusing than just starting fresh.
  const [selectedProject, setSelectedProject] = useState<string | null>(() => localStorage.getItem(PROJECT_STORAGE_KEY));
  const [issues, setIssues] = useState<Issue[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [lastFetchDurationMs, setLastFetchDurationMs] = useState<number | null>(null);
  const [approxTotal, setApproxTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<TicketFilters>(EMPTY_FILTERS);
  const [tab, setTab] = useState<Tab>(readStoredTab);
  const { isDark, toggle: toggleTheme } = useTheme();

  useEffect(() => {
    getCurrentUser()
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    if (!user) return;
    Promise.all([getProjects(), getMeta()])
      .then(([p, m]) => {
        setProjects(p);
        setMeta(m);
      })
      .catch((err) => handleApiError(err));
  }, [user]);

  /** Session cookies expire after 12h server-side — if any call comes back 401, drop back to the login screen instead of showing a confusing error. */
  function handleApiError(err: unknown) {
    if (err instanceof ApiError && err.status === 401) {
      setUser(null);
      return;
    }
    setError(describeError(err));
  }

  async function handleLogout() {
    await logout().catch(() => undefined);
    setUser(null);
    setProjects([]);
    setMeta(null);
    setSelectedProject(null);
    setIssues([]);
    setLastRefreshed(null);
    setError(null);
    localStorage.removeItem(PROJECT_STORAGE_KEY);
  }

  function selectProject(identifier: string) {
    setSelectedProject(identifier);
    localStorage.setItem(PROJECT_STORAGE_KEY, identifier);
  }

  function selectTab(next: Tab) {
    setTab(next);
    localStorage.setItem(TAB_STORAGE_KEY, next);
  }

  /** Jumps to the Ticket Table pre-filtered to whatever chart bar was clicked. */
  function drillDown(field: keyof TicketFilters, value: string) {
    setFilters((prev) => ({ ...prev, [field]: value }));
    selectTab("tickets");
  }

  useEffect(() => {
    if (!selectedProject) return;
    loadIssues(selectedProject, false);
    setFilters(EMPTY_FILTERS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject]);

  async function loadIssues(projectIdentifier: string, forceRefresh: boolean) {
    setLoading(true);
    setError(null);
    setApproxTotal(null);
    // Fire-and-forget: a quick separate call just to preview the total count for the
    // loading screen. Never blocks or fails the real fetch — if it errors or arrives
    // late, the loading screen just keeps its generic message.
    getIssueCount(projectIdentifier)
      .then(setApproxTotal)
      .catch(() => undefined);
    try {
      const result = await getProjectIssues(projectIdentifier, forceRefresh);
      setIssues(result.issues);
      setLastRefreshed(result.fetchedAt);
      setLastFetchDurationMs(result.durationMs);
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  }

  const filteredIssues = useMemo(() => applyFilters(issues, filters), [issues, filters]);
  const priorityOrder = useMemo(() => (meta ? meta.priorities.map((p) => p.name) : []), [meta]);

  const selectedProjectMeta = projects.find((p) => p.identifier === selectedProject);
  const selectedProjectLabel =
    selectedProject === ALL_PROJECTS ? "All Projects" : selectedProjectMeta?.name ?? selectedProject ?? "";

  if (!authChecked) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (!user) {
    return <LoginScreen onLoggedIn={setUser} />;
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white px-6 py-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Redmine Project Tracker</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Internal ticket dashboard for support.qwysoft.com</p>
          </div>
          <div className="flex items-center gap-4">
            <ProjectSelector projects={projects} selected={selectedProject} onSelect={selectProject} />
            <button
              onClick={toggleTheme}
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
              className="rounded-md border border-slate-300 p-1.5 text-slate-500 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              {isDark ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                  <path d="M12 3a1 1 0 011 1v1a1 1 0 11-2 0V4a1 1 0 011-1zm0 15a5 5 0 100-10 5 5 0 000 10zm9-6a1 1 0 010 2h-1a1 1 0 110-2h1zM4 12a1 1 0 010 2H3a1 1 0 110-2h1zm14.36-6.36a1 1 0 011.41 1.41l-.7.71a1 1 0 11-1.42-1.42l.71-.7zM6.34 17.66a1 1 0 011.42 1.42l-.71.7a1 1 0 01-1.41-1.41l.7-.71zM18.36 18.36a1 1 0 01-1.41 0l-.71-.7a1 1 0 111.42-1.42l.7.71a1 1 0 010 1.41zM6.34 6.34a1 1 0 01-1.41 0l-.71-.7A1 1 0 015.63 4.22l.71.7a1 1 0 010 1.42zM12 20a1 1 0 011 1v-1a1 1 0 10-2 0v1a1 1 0 011-1z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                  <path d="M21.75 15.5A9.75 9.75 0 1111.5 2.25a.75.75 0 01.53 1.28 7.25 7.25 0 008.44 8.44.75.75 0 011.28.53z" />
                </svg>
              )}
            </button>
            <div className="flex items-center gap-2 border-l border-slate-200 pl-4 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
              <span>{user.name}</span>
              <button onClick={handleLogout} className="font-medium text-brand-600 hover:underline dark:text-brand-500">
                Log out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-4 p-6">
        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
            {error}
          </div>
        )}

        {!selectedProject && !error && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            Select a project above to load its tickets.
          </div>
        )}

        {selectedProject && (
          <>
            <RefreshBar
              lastRefreshed={lastRefreshed}
              lastFetchDurationMs={lastFetchDurationMs}
              loading={loading}
              onRefresh={() => loadIssues(selectedProject, true)}
              onExport={() => meta && exportToExcel(filteredIssues, meta.redmineBaseUrl, selectedProjectLabel)}
              exportDisabled={loading || filteredIssues.length === 0}
            />

            {loading && issues.length === 0 ? (
              <LoadingIndicator
                message={
                  selectedProject === ALL_PROJECTS
                    ? "Loading tickets from every project on the instance — this covers 19,000+ tickets and can take a minute or more…"
                    : "Loading tickets from Redmine — this can take a while for large projects…"
                }
                approxTotal={approxTotal}
              />
            ) : (
              <>
                <nav className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-700">
                  {TABS.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => selectTab(t.id)}
                      className={`px-3 py-2 text-sm font-medium ${
                        tab === t.id
                          ? "border-b-2 border-brand-600 text-brand-700 dark:text-brand-500"
                          : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </nav>

                {tab === "overview" && (
                  <div className="space-y-4">
                    <KpiCards issues={filteredIssues} />
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <BreakdownChart title="Ticket Status" data={aggregateByStatus(filteredIssues)} onBarClick={(v) => drillDown("status", v)} />
                      <BreakdownChart title="Tracker" data={aggregateByTracker(filteredIssues)} onBarClick={(v) => drillDown("tracker", v)} />
                      <BreakdownChart title="Priority" data={aggregateByPriority(filteredIssues)} onBarClick={(v) => drillDown("priority", v)} />
                      <BreakdownChart
                        title="Target Version / Release"
                        data={aggregateByTargetVersion(filteredIssues)}
                        onBarClick={(v) => drillDown("targetVersion", v)}
                      />
                    </div>
                    <AssigneeSummaryTable issues={filteredIssues} />
                  </div>
                )}

                {tab === "tickets" && (
                  <div className="space-y-4">
                    <FiltersBar issues={issues} filters={filters} onChange={setFilters} />
                    <TicketTable issues={filteredIssues} redmineBaseUrl={meta?.redmineBaseUrl ?? ""} priorityOrder={priorityOrder} />
                  </div>
                )}

                {tab === "aging" && (
                  <div className="space-y-4">
                    <AgingPanel issues={filteredIssues} redmineBaseUrl={meta?.redmineBaseUrl ?? ""} />
                    <AgingByTrackerPanel issues={filteredIssues} />
                    <ResolutionTimePanel issues={filteredIssues} />
                    <EstimateVsActualPanel issues={filteredIssues} />
                  </div>
                )}

                {tab === "release" && <ReleaseDashboard issues={filteredIssues} />}

                {tab === "qa" && <QADashboard issues={filteredIssues} />}

                {tab === "time" && <TimeSpentByUserPanel projectIdentifier={selectedProject} onSessionExpired={() => setUser(null)} />}

                {tab === "closedTrend" && <ClosedTicketsTrendPanel issues={filteredIssues} />}

                {tab === "myAssigned" && <UserAssignmentPanel issues={filteredIssues} redmineBaseUrl={meta?.redmineBaseUrl ?? ""} />}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "Something went wrong. Please try again.";
}
