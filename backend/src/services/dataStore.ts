import { TtlCache, InFlightGuard } from "./cache";
import { getProjectIssues, getProjects, getStatuses, getTrackers, getPriorities } from "./redmineService";
import { ProjectIssuesResult, ProjectMeta, StatusMeta, TrackerMeta, PriorityMeta } from "../types/issue";
import { config } from "../config";

const ISSUES_TTL_MS = 15 * 60 * 1000; // filters/UI work off this without re-hitting Redmine
const META_TTL_MS = 60 * 60 * 1000;

// Cache keys are namespaced by Redmine user id, not just project/resource — different
// accounts can have different project/issue visibility in Redmine, so caching globally
// across users could leak one person's data into another's view.
const issuesCache = new TtlCache<ProjectIssuesResult>(ISSUES_TTL_MS);
const projectsCache = new TtlCache<ProjectMeta[]>(META_TTL_MS);
const statusesCache = new TtlCache<StatusMeta[]>(META_TTL_MS);
const trackersCache = new TtlCache<TrackerMeta[]>(META_TTL_MS);
const prioritiesCache = new TtlCache<PriorityMeta[]>(META_TTL_MS);
const issuesInFlight = new InFlightGuard<ProjectIssuesResult>();

export async function loadProjects(userId: number, apiKey: string): Promise<ProjectMeta[]> {
  const cached = projectsCache.get(String(userId));
  if (cached) return cached;
  const projects = await getProjects(apiKey);
  projectsCache.set(String(userId), projects);
  return projects;
}

async function loadCached<T>(cache: TtlCache<T>, key: string, fetcher: () => Promise<T>): Promise<T> {
  const cached = cache.get(key);
  if (cached) return cached;
  const value = await fetcher();
  cache.set(key, value);
  return value;
}

export async function loadMeta(userId: number, apiKey: string) {
  const key = String(userId);
  const [statuses, trackers, priorities] = await Promise.all([
    loadCached(statusesCache, key, () => getStatuses(apiKey)),
    loadCached(trackersCache, key, () => getTrackers(apiKey)),
    loadCached(prioritiesCache, key, () => getPriorities(apiKey)),
  ]);
  // Base URL is not sensitive (only the API key is) — exposed so the frontend can build ticket links.
  return { statuses, trackers, priorities, redmineBaseUrl: config.redmineBaseUrl };
}

export async function loadProjectIssues(
  userId: number,
  apiKey: string,
  projectIdentifier: string,
  forceRefresh: boolean
): Promise<ProjectIssuesResult> {
  const cacheKey = `${userId}:${projectIdentifier}`;

  if (!forceRefresh) {
    const cached = issuesCache.get(cacheKey);
    if (cached) {
      console.log(`[cache] Serving cached issues for "${projectIdentifier}" (${cached.issues.length} issues, fetched ${cached.fetchedAt})`);
      return cached;
    }
  } else {
    issuesCache.invalidate(cacheKey);
  }

  return issuesInFlight.run(cacheKey, async () => {
    console.log(`[redmine] Fetching all issues for project "${projectIdentifier}"...`);
    const start = Date.now();
    let totalPages = 1;
    const result = await getProjectIssues(projectIdentifier, apiKey, (fetched, total, page, pages) => {
      totalPages = pages;
      console.log(`[redmine] Page ${page}/${pages} — ${fetched}/${total} issues retrieved`);
    });
    const durationSec = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[redmine] Retrieved ${result.issues.length} issues for "${projectIdentifier}" across ${totalPages} page(s) in ${durationSec}s`);
    issuesCache.set(cacheKey, result);
    return result;
  });
}
