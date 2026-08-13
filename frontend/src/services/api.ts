import { MetaResult, ProjectIssuesResult, ProjectMeta } from "../types/issue";

// All Redmine access goes through our own backend at /api/* (proxied to
// http://localhost:4000 in dev, see vite.config.ts). The browser never talks
// to Redmine directly and never stores a raw API key — only an httpOnly
// session cookie set by the backend after login, hence credentials:"include"
// on every call.

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
