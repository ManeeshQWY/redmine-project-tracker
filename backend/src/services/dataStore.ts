import { TtlCache, InFlightGuard } from "./cache";
import { getProjectIssues, getProjects, getStatuses, getTrackers, getPriorities, getTimeEntries } from "./redmineService";
import { ProjectIssuesResult, ProjectMeta, StatusMeta, TrackerMeta, PriorityMeta, TimeEntriesResult } from "../types/issue";
import { config } from "../config";

const ISSUES_TTL_MS = 15 * 60 * 1000; // filters/UI work off this without re-hitting Redmine
const META_TTL_MS = 60 * 60 * 1000;
const TIME_ENTRIES_TTL_MS = 15 * 60 * 1000;
const SHARED_KEY = "shared";

// Caches are shared across ALL logged-in users, keyed only by project (not by who asked).
// This assumes everyone on this Redmine instance has the same project/issue visibility —
// true for a small internal team where access isn't role-restricted per project. If that
// assumption doesn't hold, whichever user's request first populates a project's cache
// determines what every other user sees until it expires (Redmine access isn't re-checked
// on a cache hit). The tradeoff buys a roughly N-fold reduction in memory use for N
// concurrent users viewing the same project, which matters on a memory-constrained host.
const issuesCache = new TtlCache<ProjectIssuesResult>(ISSUES_TTL_MS);
const projectsCache = new TtlCache<ProjectMeta[]>(META_TTL_MS);
const statusesCache = new TtlCache<StatusMeta[]>(META_TTL_MS);
const trackersCache = new TtlCache<TrackerMeta[]>(META_TTL_MS);
const prioritiesCache = new TtlCache<PriorityMeta[]>(META_TTL_MS);
const timeEntriesCache = new TtlCache<TimeEntriesResult>(TIME_ENTRIES_TTL_MS);
const issuesInFlight = new InFlightGuard<ProjectIssuesResult>();
const timeEntriesInFlight = new InFlightGuard<TimeEntriesResult>();

export async function loadProjects(apiKey: string): Promise<ProjectMeta[]> {
  const cached = projectsCache.get(SHARED_KEY);
  if (cached) return cached;
  const projects = await getProjects(apiKey);
  projectsCache.set(SHARED_KEY, projects);
  return projects;
}

async function loadCached<T>(cache: TtlCache<T>, key: string, fetcher: () => Promise<T>): Promise<T> {
  const cached = cache.get(key);
  if (cached) return cached;
  const value = await fetcher();
  cache.set(key, value);
  return value;
}

export async function loadMeta(apiKey: string) {
  const [statuses, trackers, priorities] = await Promise.all([
    loadCached(statusesCache, SHARED_KEY, () => getStatuses(apiKey)),
    loadCached(trackersCache, SHARED_KEY, () => getTrackers(apiKey)),
    loadCached(prioritiesCache, SHARED_KEY, () => getPriorities(apiKey)),
  ]);
  // Base URL is not sensitive (only the API key is) — exposed so the frontend can build ticket links.
  return { statuses, trackers, priorities, redmineBaseUrl: config.redmineBaseUrl };
}

export async function loadProjectIssues(
  apiKey: string,
  projectIdentifier: string,
  forceRefresh: boolean
): Promise<ProjectIssuesResult> {
  if (!forceRefresh) {
    const cached = issuesCache.get(projectIdentifier);
    if (cached) {
      console.log(`[cache] Serving cached issues for "${projectIdentifier}" (${cached.issues.length} issues, fetched ${cached.fetchedAt})`);
      return cached;
    }
  } else {
    issuesCache.invalidate(projectIdentifier);
  }

  return issuesInFlight.run(projectIdentifier, async () => {
    console.log(`[redmine] Fetching all issues for project "${projectIdentifier}"...`);
    const start = Date.now();
    let totalPages = 1;
    const result = await getProjectIssues(projectIdentifier, apiKey, (fetched, total, page, pages) => {
      totalPages = pages;
      console.log(`[redmine] Page ${page}/${pages} — ${fetched}/${total} issues retrieved`);
    });
    const durationSec = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[redmine] Retrieved ${result.issues.length} issues for "${projectIdentifier}" across ${totalPages} page(s) in ${durationSec}s`);
    issuesCache.set(projectIdentifier, result);
    return result;
  });
}

export async function loadTimeEntries(
  apiKey: string,
  projectIdentifier: string,
  forceRefresh: boolean
): Promise<TimeEntriesResult> {
  if (!forceRefresh) {
    const cached = timeEntriesCache.get(projectIdentifier);
    if (cached) {
      console.log(`[cache] Serving cached time entries for "${projectIdentifier}" (${cached.timeEntries.length} entries, fetched ${cached.fetchedAt})`);
      return cached;
    }
  } else {
    timeEntriesCache.invalidate(projectIdentifier);
  }

  return timeEntriesInFlight.run(projectIdentifier, async () => {
    console.log(`[redmine] Fetching all time entries for "${projectIdentifier}"...`);
    const start = Date.now();
    let totalPages = 1;
    const result = await getTimeEntries(projectIdentifier, apiKey, (fetched, total, page, pages) => {
      totalPages = pages;
      console.log(`[redmine] Time entries page ${page}/${pages} — ${fetched}/${total} retrieved`);
    });
    const durationSec = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[redmine] Retrieved ${result.timeEntries.length} time entries for "${projectIdentifier}" across ${totalPages} page(s) in ${durationSec}s`);
    timeEntriesCache.set(projectIdentifier, result);
    return result;
  });
}
