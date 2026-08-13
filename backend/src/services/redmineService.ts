import { redmineGet, fetchAllPaginated } from "./redmineClient";
import { transformIssue, transformTimeEntry } from "./transform";
import {
  RedmineProject,
  RedmineStatus,
  RedmineTracker,
  RedminePriority,
  RedmineIssue,
  RedmineMembership,
  RedmineTimeEntry,
} from "../types/redmine";
import {
  Issue,
  ProjectMeta,
  StatusMeta,
  TrackerMeta,
  PriorityMeta,
  ProjectIssuesResult,
  TimeEntriesResult,
} from "../types/issue";

/** Special pseudo project identifier meaning "every project on the instance". Never sent to Redmine directly — it just means "omit project_id". */
export const ALL_PROJECTS = "__all__";

export interface CurrentRedmineUser {
  id: number;
  name: string;
  login: string;
  mail: string | null;
}

/** Validates an API key and identifies who it belongs to — used at login time. Any authenticated Redmine account can call this endpoint (no admin rights needed). */
export async function resolveCurrentUser(apiKey: string): Promise<CurrentRedmineUser> {
  const res = await redmineGet<{ user: { id: number; firstname: string; lastname: string; login: string; mail?: string } }>(
    "/users/current.json",
    apiKey
  );
  const u = res.user;
  return { id: u.id, name: `${u.firstname} ${u.lastname}`.trim(), login: u.login, mail: u.mail ?? null };
}

export async function getProjects(apiKey: string): Promise<ProjectMeta[]> {
  const projects = await fetchAllPaginated<RedmineProject>("/projects.json", "projects", apiKey, 100);
  return projects
    .filter((p) => p.status === 1)
    .map((p) => ({ id: p.id, name: p.name, identifier: p.identifier, parent: p.parent?.name ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getStatuses(apiKey: string): Promise<StatusMeta[]> {
  const res = await redmineGet<{ issue_statuses: RedmineStatus[] }>("/issue_statuses.json", apiKey);
  return res.issue_statuses.map((s) => ({ id: s.id, name: s.name, isClosed: s.is_closed }));
}

export async function getTrackers(apiKey: string): Promise<TrackerMeta[]> {
  const res = await redmineGet<{ trackers: RedmineTracker[] }>("/trackers.json", apiKey);
  return res.trackers.map((t) => ({ id: t.id, name: t.name }));
}

export async function getPriorities(apiKey: string): Promise<PriorityMeta[]> {
  const res = await redmineGet<{ issue_priorities: RedminePriority[] }>("/enumerations/issue_priorities.json", apiKey);
  return res.issue_priorities.map((p) => ({ id: p.id, name: p.name }));
}

/**
 * Builds a user id -> display name map from project memberships. This avoids
 * needing the admin-only /users.json endpoint (confirmed 403 even for a
 * normal API key) while still resolving custom fields that store raw user
 * ids, such as "Assigned QA".
 */
export async function getProjectUserMap(projectIdentifier: string, apiKey: string): Promise<Map<number, string>> {
  const memberships = await fetchAllPaginated<RedmineMembership>(
    `/projects/${projectIdentifier}/memberships.json`,
    "memberships",
    apiKey,
    100
  );
  const map = new Map<number, string>();
  for (const m of memberships) {
    if (m.user) map.set(m.user.id, m.user.name);
  }
  return map;
}

/**
 * Union of every project's membership map — used for the "All Projects" view,
 * where a single project's memberships aren't enough to resolve every
 * custom-field user id that might appear. One request per project, capped at
 * 4 concurrent, and cached by the caller (dataStore) for an hour so this only
 * actually hits Redmine occasionally.
 */
export async function getGlobalUserMap(apiKey: string): Promise<Map<number, string>> {
  const projects = await getProjects(apiKey);
  const merged = new Map<number, string>();
  const CONCURRENCY = 4;
  let cursor = 0;

  async function worker() {
    while (cursor < projects.length) {
      const project = projects[cursor++];
      try {
        const map = await getProjectUserMap(project.identifier, apiKey);
        for (const [id, name] of map) merged.set(id, name);
      } catch (err) {
        console.error(`[redmine] Failed to load memberships for "${project.identifier}": ${err}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, projects.length) }, worker));
  return merged;
}

/**
 * Fetches all issues for a single project (subprojects are included
 * automatically by Redmine), or for the whole instance when projectIdentifier
 * is null/ALL_PROJECTS.
 */
export async function getProjectIssues(
  projectIdentifier: string | null,
  apiKey: string,
  onProgress?: (fetched: number, total: number, page: number, totalPages: number) => void
): Promise<ProjectIssuesResult> {
  const start = Date.now();
  const isAllProjects = !projectIdentifier || projectIdentifier === ALL_PROJECTS;
  const path = isAllProjects
    ? "/issues.json?status_id=*"
    : `/issues.json?project_id=${encodeURIComponent(projectIdentifier)}&status_id=*`;

  const [rawIssues, userMap] = await Promise.all([
    fetchAllPaginated<RedmineIssue>(path, "issues", apiKey, 100, onProgress),
    (isAllProjects ? getGlobalUserMap(apiKey) : getProjectUserMap(projectIdentifier!, apiKey)).catch((err) => {
      console.error(`[redmine] Failed to load memberships for user-id resolution: ${err}`);
      return new Map<number, string>();
    }),
  ]);

  const issues: Issue[] = rawIssues.map((raw) => transformIssue(raw, userMap));

  return {
    issues,
    totalCount: rawIssues.length,
    fetchedCount: issues.length,
    durationMs: Date.now() - start,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Fetches time entries (who actually logged time, not just who an issue is
 * assigned to) for a single project or the whole instance. Volume can be very
 * large (tens of thousands for "All Projects"), so callers should treat this
 * as an explicit, on-demand action rather than something to auto-fetch.
 */
export async function getTimeEntries(
  projectIdentifier: string | null,
  apiKey: string,
  onProgress?: (fetched: number, total: number, page: number, totalPages: number) => void
): Promise<TimeEntriesResult> {
  const start = Date.now();
  const isAllProjects = !projectIdentifier || projectIdentifier === ALL_PROJECTS;
  const path = isAllProjects ? "/time_entries.json" : `/time_entries.json?project_id=${encodeURIComponent(projectIdentifier)}`;

  const rawEntries = await fetchAllPaginated<RedmineTimeEntry>(path, "time_entries", apiKey, 100, onProgress);
  const timeEntries = rawEntries.map(transformTimeEntry);

  return {
    timeEntries,
    totalCount: timeEntries.length,
    durationMs: Date.now() - start,
    fetchedAt: new Date().toISOString(),
  };
}
