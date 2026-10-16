import { Fragment, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, getTimeEntries, getUserRoles } from "../services/api";
import { Issue, TimeEntry, UserRolesResult } from "../types/issue";
import { exportPerformanceToExcel } from "../utils/excelExport";
import { formatDateTime, formatHours } from "../utils/format";
import {
  buildPerformanceRows,
  buildRoleLookup,
  EMPTY_PERFORMANCE_FILTERS,
  filterPerformanceRows,
  GROUP_LABELS,
  GroupKey,
  groupPerformanceRows,
  NO_VERSION_LABEL,
  PerformanceFilters,
  PerformanceGroup,
  PerformanceRole,
  PerformanceRow,
  PerformanceTotals,
  SortColumn,
  sortPerformanceRows,
  totalsOf,
} from "../utils/performance";

interface Props {
  projectIdentifier: string;
  projectLabel: string;
  redmineBaseUrl: string;
  // Full unfiltered project issues — parent/child consolidation must see every ticket
  // regardless of the global tracker filter, same reasoning as the Time Spent panel.
  issues: Issue[];
  onSessionExpired: () => void;
}

type FacetField = "names" | "roles" | "projects" | "trackers" | "statuses" | "versions";

const FACETS: { field: FacetField; label: string; value: (r: PerformanceRow) => string }[] = [
  { field: "names", label: "Name", value: (r) => r.name },
  { field: "roles", label: "Role", value: (r) => r.role },
  { field: "projects", label: "Project", value: (r) => r.project || "(blank)" },
  { field: "trackers", label: "Tracker", value: (r) => r.tracker || "(blank)" },
  { field: "statuses", label: "Status", value: (r) => r.status || "(blank)" },
  { field: "versions", label: "Target Version", value: (r) => r.targetVersion ?? NO_VERSION_LABEL },
];

type ColumnId = "name" | "role" | "project" | "task" | "complexity" | "estimation" | "actuals" | "aiUsage" | "bugsReported" | "ctBugs";

interface Column {
  id: ColumnId;
  label: string;
  numeric?: boolean;
  sort?: SortColumn;
}

const COLUMNS: Column[] = [
  { id: "name", label: "Name", sort: "name" },
  { id: "role", label: "Role", sort: "role" },
  { id: "project", label: "Project", sort: "project" },
  { id: "task", label: "Task", sort: "task" },
  { id: "complexity", label: "Complexity" },
  { id: "estimation", label: "Estimation (h)", numeric: true, sort: "estimation" },
  { id: "actuals", label: "Actuals (h)", numeric: true, sort: "actuals" },
  { id: "aiUsage", label: "AI usage" },
  { id: "bugsReported", label: "Bugs reported", numeric: true, sort: "bugsReported" },
  { id: "ctBugs", label: "CT Bugs", numeric: true, sort: "ctBugs" },
];

const GROUP_KEYS = Object.keys(GROUP_LABELS) as GroupKey[];

// Filters are staged: edits go to a draft and only take effect on Apply, so a big table
// isn't recomputed on every click and a half-built filter never half-applies.
interface FilterState {
  filters: PerformanceFilters;
  dateFrom: string; // activity window, YYYY-MM-DD
  dateTo: string;
}
const EMPTY_FILTER_STATE: FilterState = { filters: EMPTY_PERFORMANCE_FILTERS, dateFrom: "", dateTo: "" };

function hasAnyFilter(f: FilterState): boolean {
  const x = f.filters;
  return (
    x.search.trim() !== "" ||
    x.state !== "all" ||
    FACETS.some((facet) => x[facet.field].length > 0) ||
    f.dateFrom !== "" ||
    f.dateTo !== ""
  );
}

function sameFilterState(a: FilterState, b: FilterState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
const FLAT_PAGE_SIZE = 200;
const GROUP_ROW_CAP = 300;

const inputCls =
  "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200";
const labelCls = "text-[11px] font-medium text-slate-500 dark:text-slate-400";
const buttonCls =
  "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700";

/** A button + floating panel that closes on an outside click or Escape. */
function Popover({ label, align = "left", children }: { label: ReactNode; align?: "left" | "right"; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={buttonCls}>
        {label}
      </button>
      {open && (
        <div
          className={`absolute ${align === "right" ? "right-0" : "left-0"} z-20 mt-1 w-72 rounded-md border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-800`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** Pick any number of people; every figure on the screen then covers only them. */
function PeopleMultiSelect({
  people,
  selected,
  onChange,
}: {
  people: { name: string; role: PerformanceRole }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const visible = q ? people.filter((p) => p.name.toLowerCase().includes(q)) : people;
  const chosen = new Set(selected);

  const toggle = (name: string) => onChange(chosen.has(name) ? selected.filter((n) => n !== name) : [...selected, name]);
  const selectShown = () => onChange(Array.from(new Set([...selected, ...visible.map((p) => p.name)])));

  return (
    <Popover label={`${selected.length === 0 ? "All people" : `${selected.length} selected`} ▾`}>
      <div>
        <input
          type="text"
          aria-label="Search people"
          placeholder="Search people…"
          className={`${inputCls} mb-2 w-full`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="mb-1 flex gap-2">
          <button onClick={selectShown} disabled={visible.length === 0} className="text-[11px] font-medium text-brand-600 hover:underline disabled:opacity-50 dark:text-brand-400">
            Select {q ? "shown" : "all"}
          </button>
          <button onClick={() => onChange([])} disabled={selected.length === 0} className="text-[11px] font-medium text-brand-600 hover:underline disabled:opacity-50 dark:text-brand-400">
            Clear
          </button>
        </div>
        <div className="max-h-64 overflow-auto">
          {visible.map((p) => (
            <label key={p.name} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700">
              <input type="checkbox" checked={chosen.has(p.name)} onChange={() => toggle(p.name)} />
              <span className="flex-1 truncate">{p.name}</span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">{p.role}</span>
            </label>
          ))}
          {visible.length === 0 && <p className="px-1 py-2 text-xs text-slate-400 dark:text-slate-500">No one matches.</p>}
        </div>
      </div>
    </Popover>
  );
}

function RoleListNotices({ roles, unknownNames }: { roles: UserRolesResult; unknownNames: string[] }) {
  const noteCls = "rounded-md border px-4 py-2.5 text-xs";
  const amber = `${noteCls} border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300`;
  const rose = `${noteCls} border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300`;
  const listEmpty = roles.developers.length === 0 && roles.qa.length === 0;
  const SHOWN = 25;
  const [copied, setCopied] = useState(false);

  // A ready-to-paste user_roles.json: the current lists plus everyone not yet classified
  // under "_unclassified" (an ignored key) to move into Developer or QA.
  async function copyStarterFile() {
    const starter = {
      Developer: roles.developers,
      QA: roles.qa,
      _unclassified: unknownNames,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(starter, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copy this into user_roles.json:", JSON.stringify(starter));
    }
  }
  const copyButton = unknownNames.length > 0 && (
    <button onClick={copyStarterFile} className="ml-2 rounded border border-amber-300 bg-white px-2 py-0.5 font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-transparent dark:text-amber-300">
      {copied ? "Copied ✓" : `Copy starter file (${unknownNames.length} names)`}
    </button>
  );

  return (
    <div className="space-y-2">
      {roles.error && <div className={rose}>{roles.error}</div>}
      {!roles.error && listEmpty && (
        <div className={amber}>
          The Developer/QA master list is empty, so everyone is shown as Unknown. Add names to{" "}
          <code>backend-python/user_roles.json</code> and redeploy.
          {copyButton}
        </div>
      )}
      {roles.conflicts.length > 0 && (
        <div className={amber}>
          Listed under both Developer and QA, so treated as Unknown until fixed: {roles.conflicts.join(", ")}.
        </div>
      )}
      {!roles.error && !listEmpty && unknownNames.length > 0 && (
        <div className={amber}>
          {unknownNames.length} {unknownNames.length === 1 ? "person is" : "people are"} not in the master list and show as Unknown:{" "}
          {unknownNames.slice(0, SHOWN).join(", ")}
          {unknownNames.length > SHOWN ? ` and ${unknownNames.length - SHOWN} more` : ""}. Add them to{" "}
          <code>backend-python/user_roles.json</code> to classify them.
          {copyButton}
        </div>
      )}
    </div>
  );
}

function allGroupIds(groups: PerformanceGroup[]): string[] {
  return groups.flatMap((g) => [g.id, ...allGroupIds(g.children)]);
}

export default function PerformanceDashboard({ projectIdentifier, projectLabel, redmineBaseUrl, issues, onSessionExpired }: Props) {
  const [timeEntries, setTimeEntries] = useState<TimeEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [roles, setRoles] = useState<UserRolesResult | null>(null);

  const [applied, setApplied] = useState<FilterState>(EMPTY_FILTER_STATE); // what the table shows
  const [draft, setDraft] = useState<FilterState>(EMPTY_FILTER_STATE); // what the controls show
  const [facetField, setFacetField] = useState<FacetField>("roles");
  const [facetValue, setFacetValue] = useState("");
  const [groupBy, setGroupBy] = useState<(GroupKey | "")[]>(["", ""]);
  const [sort, setSort] = useState<{ column: SortColumn; direction: "asc" | "desc" }>({ column: "actuals", direction: "desc" });
  const [hiddenColumns, setHiddenColumns] = useState<Set<ColumnId>>(new Set());
  const [shown, setShown] = useState(FLAT_PAGE_SIZE);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  // A different project invalidates everything that was loaded or chosen for the last one.
  useEffect(() => {
    setTimeEntries(null);
    setError(null);
    setFetchedAt(null);
    setRoles(null);
    setApplied(EMPTY_FILTER_STATE);
    setDraft(EMPTY_FILTER_STATE);
    setFacetValue("");
    setExpanded(new Set());
    setShown(FLAT_PAGE_SIZE);
  }, [projectIdentifier]);

  // Every hook below runs unconditionally on every render — the "load" early return
  // comes after them (an early return above a hook crashed this app once already).
  const roleLookup = useMemo(
    () => buildRoleLookup(roles?.developers ?? [], roles?.qa ?? [], roles?.conflicts ?? []),
    [roles]
  );
  const allRows = useMemo(
    () => buildPerformanceRows(issues, timeEntries ?? [], { from: applied.dateFrom || null, to: applied.dateTo || null }, roleLookup),
    [issues, timeEntries, applied.dateFrom, applied.dateTo, roleLookup]
  );
  // People who appear in the data but are not in the master list — shown so they can be
  // added to user_roles.json.
  const unknownNames = useMemo(
    () => Array.from(new Set(allRows.filter((r) => r.role === "Unknown").map((r) => r.name))).sort((a, b) => a.localeCompare(b)),
    [allRows]
  );
  const filteredRows = useMemo(() => filterPerformanceRows(allRows, applied.filters), [allRows, applied.filters]);
  const sortedRows = useMemo(() => sortPerformanceRows(filteredRows, sort.column, sort.direction), [filteredRows, sort]);
  const activeGroupKeys = useMemo(() => groupBy.filter((g): g is GroupKey => g !== ""), [groupBy]);
  const groups = useMemo(
    () => (activeGroupKeys.length > 0 ? groupPerformanceRows(sortedRows, activeGroupKeys) : []),
    [sortedRows, activeGroupKeys]
  );
  const totals = useMemo(() => totalsOf(filteredRows), [filteredRows]);
  // Each picker offers only what the OTHER pending filters leave in play — e.g. once a
  // Project is chosen, People lists just the people who worked on that project.
  const people = useMemo(() => {
    const byName = new Map<string, PerformanceRole>();
    for (const r of filterPerformanceRows(allRows, { ...draft.filters, names: [] })) byName.set(r.name, r.role);
    // Keep already-ticked people listed even if another filter now excludes them, so they can be unticked.
    for (const name of draft.filters.names) {
      if (!byName.has(name)) byName.set(name, allRows.find((r) => r.name === name)?.role ?? "Unknown");
    }
    return Array.from(byName, ([name, role]) => ({ name, role })).sort((a, b) => a.name.localeCompare(b.name));
  }, [allRows, draft.filters]);
  const facetOptions = useMemo(() => {
    const facet = FACETS.find((f) => f.field === facetField)!;
    const scoped = filterPerformanceRows(allRows, { ...draft.filters, [facetField]: [] });
    return Array.from(new Set(scoped.map(facet.value))).sort((a, b) => a.localeCompare(b));
  }, [allRows, facetField, draft.filters]);

  async function load(forceRefresh: boolean) {
    setLoading(true);
    setError(null);
    try {
      // The master role list is tiny and read fresh each time. If it can't be fetched the
      // report still loads, with everyone shown as Unknown and the reason on screen.
      const [result, roleList] = await Promise.all([
        getTimeEntries(projectIdentifier, forceRefresh),
        getUserRoles().catch((err): UserRolesResult => {
          if (err instanceof ApiError && err.status === 401) throw err;
          return { developers: [], qa: [], conflicts: [], error: "The Developer/QA master list could not be loaded." };
        }),
      ]);
      setTimeEntries(result.timeEntries);
      setFetchedAt(result.fetchedAt);
      setRoles(roleList);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSessionExpired();
        return;
      }
      setError(err instanceof ApiError ? err.message : "Unable to load time entries.");
    } finally {
      setLoading(false);
    }
  }

  if (timeEntries === null) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
          Developer and QA performance per task — estimation, actual hours and bugs — consolidated up through each
          task&apos;s child tickets.
        </p>
        <p className="mb-4 text-xs text-slate-400 dark:text-slate-500">
          Needs this project&apos;s time entries, which can take a few seconds to load.
        </p>
        {error && <p className="mb-3 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
        <button
          onClick={() => load(false)}
          disabled={loading}
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Loading time entries…" : "Load Performance Data"}
        </button>
      </div>
    );
  }

  const visibleColumns = COLUMNS.filter((c) => !hiddenColumns.has(c.id));
  const hasFacets = FACETS.some((f) => draft.filters[f.field].length > 0);
  const pending = !sameFilterState(draft, applied);
  const anyFilter = hasAnyFilter(draft) || hasAnyFilter(applied);

  function patchDraft(patch: Partial<PerformanceFilters>) {
    setDraft((d) => ({ ...d, filters: { ...d.filters, ...patch } }));
  }

  function addFacet() {
    if (!facetValue) return;
    const current = draft.filters[facetField] as string[];
    if (!current.includes(facetValue)) patchDraft({ [facetField]: [...current, facetValue] });
    setFacetValue("");
  }

  function removeFacet(field: FacetField, value: string) {
    patchDraft({ [field]: (draft.filters[field] as string[]).filter((v) => v !== value) });
  }

  function applyFilters() {
    setApplied(draft);
    setShown(FLAT_PAGE_SIZE);
    setExpanded(new Set());
  }

  function clearFilters() {
    setDraft(EMPTY_FILTER_STATE);
    setApplied(EMPTY_FILTER_STATE);
    setFacetValue("");
    setShown(FLAT_PAGE_SIZE);
    setExpanded(new Set());
  }

  function toggleSort(column: SortColumn) {
    setSort((s) => (s.column === column ? { column, direction: s.direction === "asc" ? "desc" : "asc" } : { column, direction: column === "name" || column === "role" || column === "project" ? "asc" : "desc" }));
  }

  function toggleGroup(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleExport() {
    setExporting(true);
    try {
      await exportPerformanceToExcel(sortedRows, projectLabel || projectIdentifier);
    } finally {
      setExporting(false);
    }
  }

  function cell(col: Column, r: PerformanceRow): ReactNode {
    switch (col.id) {
      case "name": return r.name;
      case "role": return r.role;
      case "project": return r.project;
      case "task":
        return (
          <span>
            {redmineBaseUrl ? (
              <a href={`${redmineBaseUrl}/issues/${r.taskId}`} target="_blank" rel="noreferrer" className="font-medium text-brand-600 hover:underline dark:text-brand-400">
                #{r.taskId}
              </a>
            ) : (
              <span className="font-medium">#{r.taskId}</span>
            )}{" "}
            {r.taskSubject}
            <span className="ml-1.5 text-[10px] text-slate-400 dark:text-slate-500">{r.tracker}</span>
          </span>
        );
      case "complexity": return <span className="text-slate-300 dark:text-slate-600">—</span>;
      case "aiUsage": return <span className="text-slate-300 dark:text-slate-600">—</span>;
      case "estimation": return r.estimation === null ? <span className="text-slate-300 dark:text-slate-600">—</span> : formatHours(r.estimation);
      case "actuals": return formatHours(r.actuals) || "0";
      case "bugsReported": return r.bugsReported;
      case "ctBugs": return r.ctBugs;
    }
  }

  function totalCell(col: Column, t: PerformanceTotals): ReactNode {
    switch (col.id) {
      case "estimation": return t.estimation === null ? <span className="text-slate-300 dark:text-slate-600">—</span> : formatHours(t.estimation) || "0";
      case "actuals": return formatHours(t.actuals) || "0";
      case "bugsReported": return t.bugsReported;
      case "ctBugs": return t.ctBugs;
      default: return null;
    }
  }

  const tdCls = (c: Column) => `px-2 py-1.5 ${c.numeric ? "text-right tabular-nums" : ""}`;

  function renderRows(rows: PerformanceRow[], depth: number) {
    const capped = rows.slice(0, GROUP_ROW_CAP);
    return (
      <>
        {capped.map((r) => (
          <tr key={r.key} className="border-t border-slate-100 dark:border-slate-800">
            {visibleColumns.map((c, i) => (
              <td key={c.id} className={tdCls(c)} style={i === 0 ? { paddingLeft: 8 + depth * 18 } : undefined}>
                {cell(c, r)}
              </td>
            ))}
          </tr>
        ))}
        {rows.length > capped.length && (
          <tr>
            <td colSpan={visibleColumns.length} className="px-2 py-1.5 text-center text-[11px] text-slate-400 dark:text-slate-500" style={{ paddingLeft: 8 + depth * 18 }}>
              Showing the first {capped.length} of {rows.length} rows in this group — narrow the filters or export to see all.
            </td>
          </tr>
        )}
      </>
    );
  }

  function renderGroup(group: PerformanceGroup, depth: number): ReactNode {
    const open = expanded.has(group.id);
    return (
      <>
        <tr className="cursor-pointer border-t border-slate-200 bg-slate-50 font-medium hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:bg-slate-800" onClick={() => toggleGroup(group.id)}>
          {visibleColumns.map((c, i) => (
            <td key={c.id} className={tdCls(c)} style={i === 0 ? { paddingLeft: 8 + depth * 18 } : undefined}>
              {i === 0 ? (
                <span>
                  <span className="mr-1.5 inline-block w-3 text-slate-400">{open ? "▾" : "▸"}</span>
                  {group.label}
                  <span className="ml-1.5 text-[10px] font-normal text-slate-400 dark:text-slate-500">({group.totals.rows})</span>
                </span>
              ) : (
                totalCell(c, group.totals)
              )}
            </td>
          ))}
        </tr>
        {open && (group.children.length > 0 ? group.children.map((g) => <Fragment key={g.id}>{renderGroup(g, depth + 1)}</Fragment>) : renderRows(group.rows, depth + 1))}
      </>
    );
  }

  const flatRows = sortedRows.slice(0, shown);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Developer &amp; QA Performance</h3>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {filteredRows.length.toLocaleString()} of {allRows.length.toLocaleString()} rows · {formatHours(totals.actuals) || "0"}h actual
              {totals.estimation !== null ? ` vs ${formatHours(totals.estimation) || "0"}h estimated` : ""} · {totals.bugsReported} bugs ({totals.ctBugs} CT)
              {fetchedAt && ` · time data loaded ${formatDateTime(fetchedAt)}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              disabled={exporting || sortedRows.length === 0}
              className={buttonCls}
              title="Exports exactly the rows currently shown, in the performance layout"
            >
              {exporting ? "Exporting…" : `Export to Excel (${sortedRows.length.toLocaleString()} rows)`}
            </button>
            <button onClick={() => load(true)} disabled={loading} className={buttonCls}>
              {loading ? "Refreshing…" : "Refresh Time Data"}
            </button>
          </div>
        </div>

        {/* Filter builder: pick a field, pick a value, it becomes a removable facet —
            scales to hundreds of people where a row of chips would not. */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-[180px] flex-1 flex-col gap-1">
            <label className={labelCls} htmlFor="perf-search">Search (name, task subject, #id)</label>
            <input id="perf-search" type="text" className={inputCls} placeholder="Search…" value={draft.filters.search} onChange={(e) => patchDraft({ search: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") applyFilters(); }} />
          </div>
          <div className="flex flex-col gap-1">
            <span className={labelCls}>People</span>
            <PeopleMultiSelect
              people={people}
              selected={draft.filters.names}
              onChange={(names) => patchDraft({ names })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls} htmlFor="perf-facet-field">Add filter</label>
            <div className="flex gap-1">
              <select id="perf-facet-field" className={inputCls} value={facetField} onChange={(e) => { setFacetField(e.target.value as FacetField); setFacetValue(""); }}>
                {FACETS.filter((f) => f.field !== "names").map((f) => <option key={f.field} value={f.field}>{f.label}</option>)}
              </select>
              <select aria-label="Filter value" className={`${inputCls} max-w-[220px]`} value={facetValue} onChange={(e) => setFacetValue(e.target.value)}>
                <option value="">Choose…</option>
                {facetOptions.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <button onClick={addFacet} disabled={!facetValue} className={buttonCls}>Add</button>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls} htmlFor="perf-state">Ticket state</label>
            <select id="perf-state" className={inputCls} value={draft.filters.state} onChange={(e) => patchDraft({ state: e.target.value as PerformanceFilters["state"] })}>
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls} htmlFor="perf-from">Activity from</label>
            <input id="perf-from" type="date" className={inputCls} value={draft.dateFrom} onChange={(e) => setDraft((d) => ({ ...d, dateFrom: e.target.value }))} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls} htmlFor="perf-to">Activity to</label>
            <input id="perf-to" type="date" className={inputCls} value={draft.dateTo} onChange={(e) => setDraft((d) => ({ ...d, dateTo: e.target.value }))} />
          </div>
          <button
            onClick={applyFilters}
            disabled={!pending}
            className="rounded-md bg-brand-600 px-4 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Apply
          </button>
          <button onClick={clearFilters} disabled={!anyFilter} className={buttonCls}>Clear filters</button>
        </div>
        {pending && (
          <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">Filter changes aren&apos;t applied yet — click Apply (or press Enter in the search box).</p>
        )}

        {hasFacets && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {FACETS.flatMap((f) =>
              (draft.filters[f.field] as string[]).map((v) => (
                <span key={`${f.field}:${v}`} className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-2.5 py-1 text-[11px] font-medium text-white">
                  {f.label}: {v}
                  <button aria-label={`Remove ${f.label} ${v}`} onClick={() => removeFacet(f.field, v)} className="ml-0.5 leading-none hover:text-slate-200">×</button>
                </span>
              ))
            )}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          {[0, 1].map((level) => (
            <div key={level} className="flex flex-col gap-1">
              <label className={labelCls} htmlFor={`perf-group-${level}`}>{level === 0 ? "Group by" : "Then by"}</label>
              <select
                id={`perf-group-${level}`}
                className={inputCls}
                value={groupBy[level]}
                disabled={level === 1 && groupBy[0] === ""}
                onChange={(e) => {
                  const next = [...groupBy] as (GroupKey | "")[];
                  next[level] = e.target.value as GroupKey | "";
                  if (level === 0 && next[0] === "") next[1] = "";
                  setGroupBy(next);
                  setExpanded(new Set());
                }}
              >
                <option value="">None</option>
                {GROUP_KEYS.filter((k) => k !== groupBy[1 - level]).map((k) => <option key={k} value={k}>{GROUP_LABELS[k]}</option>)}
              </select>
            </div>
          ))}
          <button
            onClick={() => {
              setGroupBy(["name", ""]);
              setExpanded(new Set());
            }}
            className={buttonCls}
            title="Group by person and collapse, so each line is one person's totals"
          >
            Counts by person
          </button>
          {activeGroupKeys.length > 0 && (
            <>
              <button onClick={() => setExpanded(new Set(allGroupIds(groups)))} className={buttonCls}>Expand all</button>
              <button onClick={() => setExpanded(new Set())} className={buttonCls}>Collapse all</button>
            </>
          )}
          <div className="ml-auto">
            <Popover label="Columns ▾" align="right">
              {COLUMNS.map((c) => (
                <label key={c.id} className="flex items-center gap-2 py-0.5 text-xs text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={!hiddenColumns.has(c.id)}
                    onChange={() =>
                      setHiddenColumns((prev) => {
                        const next = new Set(prev);
                        if (next.has(c.id)) next.delete(c.id);
                        else next.add(c.id);
                        return next;
                      })
                    }
                  />
                  {c.label}
                </label>
              ))}
            </Popover>
          </div>
        </div>
      </div>

      {roles && <RoleListNotices roles={roles} unknownNames={unknownNames} />}

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="max-h-[640px] overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-[1] bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                {visibleColumns.map((c) => (
                  <th key={c.id} className={`px-2 py-1.5 ${c.numeric ? "text-right" : ""}`}>
                    {c.sort ? (
                      <button onClick={() => toggleSort(c.sort!)} className="font-semibold hover:text-slate-800 dark:hover:text-slate-100">
                        {c.label}
                        {sort.column === c.sort ? (sort.direction === "asc" ? " ▲" : " ▼") : ""}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeGroupKeys.length > 0
                ? groups.map((g) => <Fragment key={g.id}>{renderGroup(g, 0)}</Fragment>)
                : flatRows.map((r) => (
                    <tr key={r.key} className="border-t border-slate-100 dark:border-slate-800">
                      {visibleColumns.map((c) => (
                        <td key={c.id} className={tdCls(c)}>{cell(c, r)}</td>
                      ))}
                    </tr>
                  ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={visibleColumns.length} className="px-2 py-8 text-center text-slate-400 dark:text-slate-500">
                    {allRows.length === 0
                      ? "No Developer/QA activity found for this project."
                      : "No rows match the current filters."}
                  </td>
                </tr>
              )}
            </tbody>
            {filteredRows.length > 0 && (
              <tfoot className="sticky bottom-0 bg-slate-50 font-semibold dark:bg-slate-800">
                <tr className="border-t border-slate-300 dark:border-slate-600">
                  {visibleColumns.map((c, i) => (
                    <td key={c.id} className={tdCls(c)}>{i === 0 ? `Total (${totals.rows.toLocaleString()} rows)` : totalCell(c, totals)}</td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {activeGroupKeys.length === 0 && sortedRows.length > shown && (
          <div className="mt-3 text-center">
            <button onClick={() => setShown((n) => n + FLAT_PAGE_SIZE)} className={buttonCls}>
              Show {Math.min(FLAT_PAGE_SIZE, sortedRows.length - shown)} more ({sortedRows.length - shown} remaining)
            </button>
          </div>
        )}
      </div>

      <details className="rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-200">How these numbers are calculated</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <span className="font-medium">Rows</span> are Epics, Features, Stories, Bugs, Change requests and Suggestions — one row per
            person per task. A parent task consolidates the hours, estimates and bugs of all its child tickets.
          </li>
          <li>
            <span className="font-medium">Role</span> comes only from the master list in{" "}
            <code>backend-python/user_roles.json</code>. The Assignee, Additional Assignee and Assigned QA fields only say who is
            on a ticket — never whether they are a Developer or QA. Anyone not in the list shows as Unknown.
          </li>
          <li>
            <span className="font-medium">Estimation</span>: of the people on a ticket, Developers (per the list) share its estimated
            hours equally and QA share &ldquo;Estimated time for QA&rdquo;. Until a ticket has a listed Developer, its Assignee and
            Additional Assignees share the estimate instead (their role still shows Unknown). A dash means nothing was estimated.
          </li>
          <li>
            <span className="font-medium">Actuals</span> are the hours that person logged on the task and its child tickets.
          </li>
          <li>
            <span className="font-medium">Bugs reported</span>: for a Developer (or anyone not yet in the list), Bug tickets under a
            ticket they are on; for QA, Bug tickets they filed under the task. <span className="font-medium">CT Bugs</span> are those with Testing Type = CT. Only bugs
            linked by parent/child are counted.
          </li>
          <li>
            <span className="font-medium">Totals and group subtotals</span> count each hour and bug once per person: when a task and
            one of its child tasks both appear for the same person, only the parent is added (it already includes the child).
            Individual rows are not reduced, so a column can add up to more than its total.
          </li>
          <li>
            <span className="font-medium">Activity from/to</span> limits hours to time logged in that window and bugs to those created in
            it. Complexity and AI usage are not recorded in Redmine yet. Comments are added by hand after exporting.
          </li>
        </ul>
      </details>
    </div>
  );
}
