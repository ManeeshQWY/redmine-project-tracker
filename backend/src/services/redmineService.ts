import { redmineGet, fetchAllPaginated } from "./redmineClient";
import { transformIssue } from "./transform";
import {
  RedmineProject,
  RedmineStatus,
  RedmineTracker,
  RedminePriority,
  RedmineIssue,
  RedmineMembership,
} from "../types/redmine";
import { Issue, ProjectMeta, StatusMeta, TrackerMeta, PriorityMeta, ProjectIssuesResult } from "../types/issue";

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

export async function getProjectIssues(
  projectIdentifier: string,
  apiKey: string,
  onProgress?: (fetched: number, total: number, page: number, totalPages: number) => void
): Promise<ProjectIssuesResult> {
  const start = Date.now();

  const [rawIssues, userMap] = await Promise.all([
    fetchAllPaginated<RedmineIssue>(
      `/issues.json?project_id=${encodeURIComponent(projectIdentifier)}&status_id=*`,
      "issues",
      apiKey,
      100,
      onProgress
    ),
    getProjectUserMap(projectIdentifier, apiKey).catch((err) => {
      console.error(`[redmine] Failed to load project memberships for user-id resolution: ${err}`);
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
