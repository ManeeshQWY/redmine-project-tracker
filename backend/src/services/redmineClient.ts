import { config } from "../config";

export class RedmineApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly userMessage: string
  ) {
    super(message);
    this.name = "RedmineApiError";
  }
}

function friendlyMessageFor(status: number | null, path: string): string {
  switch (status) {
    case 401:
      return "Redmine rejected this API key (unauthorized). Please check the key in your Redmine account and log in again.";
    case 403:
      return "Access to this Redmine resource is forbidden for your account.";
    case 404:
      return "The requested Redmine resource was not found.";
    case 429:
      return "Redmine is rate-limiting requests. Please wait a moment and try again.";
    case null:
      return "Unable to connect to Redmine. Please check the Redmine URL or your network connection.";
    default:
      if (status >= 500) {
        return "Redmine server encountered an error. Please try again shortly.";
      }
      return "Unable to connect to Redmine. Please check your Redmine credentials.";
  }
}

const DEFAULT_TIMEOUT_MS = 20000;

/** Every call takes the caller's own Redmine API key — there is no shared/global key. Never log it. */
async function requestJson<T>(path: string, apiKey: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const url = `${config.redmineBaseUrl}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "X-Redmine-API-Key": apiKey,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const isAbort = err instanceof Error && err.name === "AbortError";
    const message = isAbort ? `Request timed out after ${timeoutMs}ms: ${path}` : `Network error calling Redmine: ${String(err)}`;
    console.error(`[redmine] ${message}`);
    throw new RedmineApiError(message, null, isAbort ? "Redmine request timed out. Please try again." : friendlyMessageFor(null, path));
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    const message = `Redmine ${response.status} ${response.statusText} for ${path}: ${bodyText.slice(0, 500)}`;
    console.error(`[redmine] ${message}`);
    throw new RedmineApiError(message, response.status, friendlyMessageFor(response.status, path));
  }

  try {
    return (await response.json()) as T;
  } catch (err) {
    const message = `Invalid JSON from Redmine for ${path}: ${String(err)}`;
    console.error(`[redmine] ${message}`);
    throw new RedmineApiError(message, response.status, "Redmine returned an unexpected response. Please try again.");
  }
}

/**
 * Generic pagination helper: repeatedly requests `basePath` with offset/limit
 * query params until all records (per total_count) are retrieved, then
 * de-duplicates by id.
 */
export async function fetchAllPaginated<TItem extends { id: number }>(
  basePath: string,
  listKey: string,
  apiKey: string,
  pageSize = 100,
  onProgress?: (fetched: number, total: number, page: number, totalPages: number) => void
): Promise<TItem[]> {
  const sep = basePath.includes("?") ? "&" : "?";
  const firstUrl = `${basePath}${sep}limit=${pageSize}&offset=0`;
  const first = await requestJson<Record<string, unknown>>(firstUrl, apiKey);

  const totalCount = Number(first["total_count"] ?? 0);
  const items: TItem[] = [...((first[listKey] as TItem[]) ?? [])];
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  onProgress?.(items.length, totalCount, 1, totalPages);

  const offsets: number[] = [];
  for (let offset = pageSize; offset < totalCount; offset += pageSize) {
    offsets.push(offset);
  }

  // Fetch remaining pages with limited concurrency to avoid overloading the server.
  const CONCURRENCY = 4;
  let cursor = 0;
  let page = 1;

  async function worker() {
    while (cursor < offsets.length) {
      const idx = cursor++;
      const offset = offsets[idx];
      const pageUrl = `${basePath}${sep}limit=${pageSize}&offset=${offset}`;
      const res = await requestJson<Record<string, unknown>>(pageUrl, apiKey);
      const pageItems = (res[listKey] as TItem[]) ?? [];
      items.push(...pageItems);
      page++;
      onProgress?.(items.length, totalCount, page, totalPages);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, offsets.length) }, worker));

  const seen = new Set<number>();
  const deduped: TItem[] = [];
  for (const item of items) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      deduped.push(item);
    }
  }

  return deduped;
}

export async function redmineGet<T>(path: string, apiKey: string): Promise<T> {
  return requestJson<T>(path, apiKey);
}
