import { afterEach, describe, expect, it, vi } from "vitest";
import { getIssueCount, getProjectIssues, getTimeEntries, getVersions, isAbortError, sendChatMessage } from "./api";

function mockFetch() {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify({ issues: [], versions: [], timeEntries: [], totalCount: 0, reply: "" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const urlOf = (fetchMock: ReturnType<typeof mockFetch>) => String(fetchMock.mock.calls[0][0]);

afterEach(() => vi.unstubAllGlobals());

const days = (n: number) => ({ kind: "days", days: n }) as const;
const range = { kind: "range", from: "2026-01-01", to: "2026-03-31" } as const;

describe("API calls carry the load window", () => {
  it("tickets default to the last 30 days", async () => {
    const f = mockFetch();
    await getProjectIssues("alpha");
    expect(urlOf(f)).toBe("/api/projects/alpha/issues?days=30");
  });

  it("tickets can ask for another period, all time (0), and a refresh", async () => {
    const f = mockFetch();
    await getProjectIssues("alpha", true, days(0));
    expect(urlOf(f)).toBe("/api/projects/alpha/issues?days=0&refresh=true");
  });

  it("tickets can ask for an exact date range", async () => {
    const f = mockFetch();
    await getProjectIssues("alpha", false, range);
    expect(urlOf(f)).toBe("/api/projects/alpha/issues?from=2026-01-01&to=2026-03-31");
  });

  it("time entries, the count, versions and chat all use the same window", async () => {
    const f = mockFetch();
    await getTimeEntries("alpha", false, days(90));
    expect(urlOf(f)).toBe("/api/projects/alpha/time-entries?days=90");

    const f2 = mockFetch();
    await getIssueCount("alpha", days(90));
    expect(urlOf(f2)).toBe("/api/projects/alpha/issues/count?days=90");

    const f3 = mockFetch();
    await getVersions("alpha", range);
    expect(urlOf(f3)).toBe("/api/projects/alpha/versions?from=2026-01-01&to=2026-03-31");

    const f4 = mockFetch();
    await sendChatMessage("alpha", "hi", [], days(365));
    expect(urlOf(f4)).toBe("/api/projects/alpha/chat?days=365");
  });
});

describe("cancelling a request", () => {
  it("passes the abort signal to fetch", async () => {
    const f = mockFetch();
    const controller = new AbortController();
    await getProjectIssues("alpha", false, days(30), controller.signal);
    expect((f.mock.calls[0][1] as RequestInit).signal).toBe(controller.signal);
  });

  it("surfaces an abort as an abort — not as a connection error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")));
    const err = await getTimeEntries("alpha", false, days(30), new AbortController().signal).catch((e) => e);
    expect(isAbortError(err)).toBe(true);
  });

  it("still reports a genuine network failure as a connection problem", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const err = await getProjectIssues("alpha").catch((e) => e);
    expect(isAbortError(err)).toBe(false);
    expect(String(err.message)).toMatch(/Unable to reach/);
  });
});
