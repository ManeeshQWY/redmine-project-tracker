import { MetaResult, ProjectIssuesResult, ProjectMeta, TimeEntriesResult, UserRolesResult, VersionMeta } from "../types/issue";
import { DEFAULT_WINDOW, LoadWindow, windowQuery } from "../utils/dataWindow";
import { TicketFilters } from "../utils/filters";

// All Redmine access goes through our own backend at /api/* (proxied to
// http://localhost:4001 in dev, see vite.config.ts). The browser never talks
// to Redmine directly and never stores a raw API key — only an httpOnly
// session cookie set by the backend after login, hence credentials:"include"
// on every call.

/** Special project identifier meaning "every project on the instance" — must match backend's ALL_PROJECTS. */
export const ALL_PROJECTS = "__all__";

export interface CurrentUser {
  name: string;
  login: string;
  mail: string | null;
}

/** True when a request was cancelled with an AbortController (the person pressed Cancel). */
export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, credentials: "include" });
  } catch (err) {
    if (isAbortError(err)) throw err; // a cancelled load is not a connection problem
    throw new ApiError("Unable to reach the application server. Please check that the backend is running.", 0);
  }

  if (!response.ok) {
    let message = "An unexpected error occurred.";
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore parse failure, use default message
    }
    throw new ApiError(message, response.status);
  }

  return (await response.json()) as T;
}

function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, signal ? { signal } : undefined);
}

function postJson<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function login(apiKey: string): Promise<{ user: CurrentUser }> {
  return postJson<{ user: CurrentUser }>("/api/auth/login", { apiKey });
}

export function logout(): Promise<{ ok: true }> {
  return postJson<{ ok: true }>("/api/auth/logout");
}

export function getCurrentUser(): Promise<{ user: CurrentUser }> {
  return getJson<{ user: CurrentUser }>("/api/auth/me");
}

export function getProjects(): Promise<ProjectMeta[]> {
  return getJson<{ projects: ProjectMeta[] }>("/api/projects").then((r) => r.projects);
}

export function getMeta(): Promise<MetaResult> {
  return getJson<MetaResult>("/api/meta");
}

/** Tickets last updated within `window`. Pass a `signal` to be able to cancel — the server
 * then stops fetching from Redmine too. */
export function getProjectIssues(
  projectIdentifier: string,
  forceRefresh = false,
  window: LoadWindow = DEFAULT_WINDOW,
  signal?: AbortSignal
): Promise<ProjectIssuesResult> {
  const query = `?${windowQuery(window)}${forceRefresh ? "&refresh=true" : ""}`;
  return getJson<ProjectIssuesResult>(`/api/projects/${encodeURIComponent(projectIdentifier)}/issues${query}`, signal);
}

/** One cheap Redmine call (limit=1) just to preview total_count, so the loading screen
 * can show "~X tickets to load" without waiting for the full fetch. Fire-and-forget —
 * if it fails or is slow, the loading screen just falls back to its generic message. */
export function getIssueCount(projectIdentifier: string, window: LoadWindow = DEFAULT_WINDOW, signal?: AbortSignal): Promise<number> {
  return getJson<{ totalCount: number }>(
    `/api/projects/${encodeURIComponent(projectIdentifier)}/issues/count?${windowQuery(window)}`,
    signal
  ).then((r) => r.totalCount);
}

/** Release dates for the target versions on a project's tickets — fetched lazily (only
 * when the Release Dashboard is opened) so it never slows the main ticket load. */
export function getVersions(projectIdentifier: string, window: LoadWindow = DEFAULT_WINDOW): Promise<VersionMeta[]> {
  return getJson<{ versions: VersionMeta[] }>(`/api/projects/${encodeURIComponent(projectIdentifier)}/versions?${windowQuery(window)}`).then(
    (r) => r.versions
  );
}

/** The master list of who is a Developer / QA — the only source of role for the Dev & QA
 * Performance report. */
export function getUserRoles(): Promise<UserRolesResult> {
  return getJson<UserRolesResult>("/api/user-roles");
}

export interface ChatTurn {
  role: "user" | "model";
  text: string;
}

export interface ChatResponse {
  reply: string;
  // Present when the answer was scoped to one specific assignee/tracker/status/priority/
  // search term — apply it to jump straight to that slice in the Ticket Table.
  suggestedFilter: Partial<TicketFilters> | null;
}

/** Read-only Q&A over the current project's already-loaded tickets — scoped to the
 * whole project, not whatever tracker/etc. filters are active in the UI. `history` is
 * the prior turns of this conversation (the backend keeps no state between requests). */
export function sendChatMessage(
  projectIdentifier: string,
  message: string,
  history: ChatTurn[],
  window: LoadWindow = DEFAULT_WINDOW
): Promise<ChatResponse> {
  return postJson<ChatResponse>(`/api/projects/${encodeURIComponent(projectIdentifier)}/chat?${windowQuery(window)}`, { message, history });
}

/** Not auto-fetched with issues — time entry volume can be very large, so this is called only when the Time Spent by User panel is explicitly opened. */
export function getTimeEntries(
  projectIdentifier: string,
  forceRefresh = false,
  window: LoadWindow = DEFAULT_WINDOW,
  signal?: AbortSignal
): Promise<TimeEntriesResult> {
  const query = `?${windowQuery(window)}${forceRefresh ? "&refresh=true" : ""}`;
  return getJson<TimeEntriesResult>(`/api/projects/${encodeURIComponent(projectIdentifier)}/time-entries${query}`, signal);
}
