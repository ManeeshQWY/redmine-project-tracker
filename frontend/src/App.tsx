import { useEffect, useMemo, useState } from "react";
import { ApiError, CurrentUser, getCurrentUser, getMeta, getProjectIssues, getProjects, logout } from "./services/api";
import { Issue, MetaResult, ProjectMeta } from "./types/issue";
import { applyFilters, EMPTY_FILTERS, TicketFilters } from "./utils/filters";
import { aggregateByStatus, aggregateByTracker, aggregateByPriority, aggregateByTargetVersion } from "./utils/aggregations";
import { exportToExcel } from "./utils/excelExport";

import LoginScreen from "./components/LoginScreen";
import ProjectSelector from "./components/ProjectSelector";
import RefreshBar from "./components/RefreshBar";
import KpiCards from "./components/KpiCards";
import BreakdownChart from "./components/BreakdownChart";
import AssigneeSummaryTable from "./components/AssigneeSummaryTable";
import FiltersBar from "./components/FiltersBar";
import TicketTable from "./components/TicketTable";
import AgingPanel from "./components/AgingPanel";
import ResolutionTimePanel from "./components/ResolutionTimePanel";
import EstimateVsActualPanel from "./components/EstimateVsActualPanel";
import ReleaseDashboard from "./components/ReleaseDashboard";
import QADashboard from "./components/QADashboard";

type Tab = "overview" | "tickets" | "aging" | "release" | "qa";

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "tickets", label: "Ticket Table" },
  { id: "aging", label: "Aging & Resolution" },
  { id: "release", label: "Release Dashboard" },
  { id: "qa", label: "QA Dashboard" },
];

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<CurrentUser | null>(null);

  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [meta, setMeta] = useState<MetaResult | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<TicketFilters>(EMPTY_FILTERS);
  const [tab, setTab] = useState<Tab>("overview");

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
    try {
      const result = await getProjectIssues(projectIdentifier, forceRefresh);
      setIssues(result.issues);
      setLastRefreshed(result.fetchedAt);
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  }

  const filteredIssues = useMemo(() => applyFilters(issues, filters), [issues, filters]);
  const priorityOrder = useMemo(() => (meta ? meta.priorities.map((p) => p.name) : []), [meta]);

  const selectedProjectMeta = projects.find((p) => p.identifier === selectedProject);

  if (!authChecked) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Loading…</div>;
  }

  if (!user) {
    return <LoginScreen onLoggedIn={setUser} />;
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Redmine Project Tracker</h1>
            <p className="text-xs text-slate-500">Internal ticket dashboard for support.qwysoft.com</p>
          </div>
          <div className="flex items-center gap-4">
            <ProjectSelector projects={projects} selected={selectedProject} onSelect={setSelectedProject} />
            <div className="flex items-center gap-2 border-l border-slate-200 pl-4 text-xs text-slate-500">
              <span>{user.name}</span>
              <button onClick={handleLogout} className="font-medium text-brand-600 hover:underline">
                Log out
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] space-y-4 p-6">
        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
        )}

        {!selectedProject && !error && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">
            Select a project above to load its tickets.
          </div>
        )}

        {selectedProject && (
          <>
            <RefreshBar
              lastRefreshed={lastRefreshed}
              loading={loading}
              onRefresh={() => loadIssues(selectedProject, true)}
              onExport={() => meta && exportToExcel(filteredIssues, meta.redmineBaseUrl, selectedProjectMeta?.name ?? selectedProject)}
              exportDisabled={loading || filteredIssues.length === 0}
            />

            {loading && issues.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-slate-500">
                Loading tickets from Redmine — this can take a while for large projects…
              </div>
            ) : (
              <>
                <nav className="flex gap-1 border-b border-slate-200">
                  {TABS.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      className={`px-3 py-2 text-sm font-medium ${
                        tab === t.id ? "border-b-2 border-brand-600 text-brand-700" : "text-slate-500 hover:text-slate-700"
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
                      <BreakdownChart title="Ticket Status" data={aggregateByStatus(filteredIssues)} />
                      <BreakdownChart title="Tracker" data={aggregateByTracker(filteredIssues)} />
                      <BreakdownChart title="Priority" data={aggregateByPriority(filteredIssues)} />
                      <BreakdownChart title="Target Version / Release" data={aggregateByTargetVersion(filteredIssues)} />
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
                    <ResolutionTimePanel issues={filteredIssues} />
                    <EstimateVsActualPanel issues={filteredIssues} />
                  </div>
                )}

                {tab === "release" && <ReleaseDashboard issues={filteredIssues} />}

                {tab === "qa" && <QADashboard issues={filteredIssues} />}
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
