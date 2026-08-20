import { MetaResult, ProjectIssuesResult, ProjectMeta, TimeEntriesResult } from "../types/issue";
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
  } catch {
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

function getJson<T>(path: string): Promise<T> {
  return request<T>(path);
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

export function getProjectIssues(projectIdentifier: string, forceRefresh = false): Promise<ProjectIssuesResult> {
  const query = forceRefresh ? "?refresh=true" : "";
  return getJson<ProjectIssuesResult>(`/api/projects/${encodeURIComponent(projectIdentifier)}/issues${query}`);
}

/** One cheap Redmine call (limit=1) just to preview total_count, so the loading screen
 * can show "~X tickets to load" without waiting for the full fetch. Fire-and-forget —
 * if it fails or is slow, the loading screen just falls back to its generic message. */
export function getIssueCount(projectIdentifier: string): Promise<number> {
  return getJson<{ totalCount: number }>(`/api/projects/${encodeURIComponent(projectIdentifier)}/issues/count`).then((r) => r.totalCount);
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
export function sendChatMessage(projectIdentifier: string, message: string, history: ChatTurn[]): Promise<ChatResponse> {
  return postJson<ChatResponse>(`/api/projects/${encodeURIComponent(projectIdentifier)}/chat`, { message, history });
}

/** Not auto-fetched with issues — time entry volume can be very large, so this is called only when the Time Spent by User panel is explicitly opened. */
export function getTimeEntries(projectIdentifier: string, forceRefresh = false): Promise<TimeEntriesResult> {
  const query = forceRefresh ? "?refresh=true" : "";
  return getJson<TimeEntriesResult>(`/api/projects/${encodeURIComponent(projectIdentifier)}/time-entries${query}`);
}
