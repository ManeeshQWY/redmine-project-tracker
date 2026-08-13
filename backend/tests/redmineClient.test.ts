import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// config requires env vars at import time; set them before importing the module under test.
process.env.REDMINE_BASE_URL = "https://redmine.test";

import { fetchAllPaginated, redmineGet, RedmineApiError } from "../src/services/redmineClient";

const TEST_API_KEY = "test-key";

interface Item {
  id: number;
  name: string;
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("fetchAllPaginated", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("follows total_count/offset/limit until all pages are retrieved", async () => {
    const totalCount = 250;
    const pageSize = 100;
    fetchMock.mockImplementation(async (url: string) => {
      const offsetMatch = /offset=(\d+)/.exec(url);
      const offset = offsetMatch ? Number(offsetMatch[1]) : 0;
      const remaining = totalCount - offset;
      const count = Math.min(pageSize, remaining);
      const items: Item[] = Array.from({ length: count }, (_, i) => ({ id: offset + i + 1, name: `item-${offset + i + 1}` }));
      return jsonResponse({ items, total_count: totalCount, offset, limit: pageSize });
    });

    const items = await fetchAllPaginated<Item>("/items.json", "items", TEST_API_KEY, pageSize);
    expect(items).toHaveLength(totalCount);
    const ids = items.map((i) => i.id).sort((a, b) => a - b);
    expect(ids[0]).toBe(1);
    expect(ids[ids.length - 1]).toBe(totalCount);
  });

  it("does not assume the first page contains everything (total_count=2268 style example)", async () => {
    const totalCount = 2268;
    const pageSize = 100;
    let requestCount = 0;
    fetchMock.mockImplementation(async (url: string) => {
      requestCount++;
      const offsetMatch = /offset=(\d+)/.exec(url);
      const offset = offsetMatch ? Number(offsetMatch[1]) : 0;
      const count = Math.min(pageSize, totalCount - offset);
      const items: Item[] = Array.from({ length: count }, (_, i) => ({ id: offset + i + 1, name: "x" }));
      return jsonResponse({ items, total_count: totalCount, offset, limit: pageSize });
    });

    const items = await fetchAllPaginated<Item>("/items.json", "items", TEST_API_KEY, pageSize);
    expect(items).toHaveLength(totalCount);
    expect(requestCount).toBe(Math.ceil(totalCount / pageSize));
  });

  it("de-duplicates issues that appear more than once across pages", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const offsetMatch = /offset=(\d+)/.exec(url);
      const offset = offsetMatch ? Number(offsetMatch[1]) : 0;
      if (offset === 0) {
        return jsonResponse({ items: [{ id: 1 }, { id: 2 }], total_count: 3, offset: 0, limit: 2 });
      }
      // Overlapping id 2 returned again on the second page (simulates a shifting result set).
      return jsonResponse({ items: [{ id: 2 }, { id: 3 }], total_count: 3, offset: 2, limit: 2 });
    });

    const items = await fetchAllPaginated<Item>("/items.json", "items", TEST_API_KEY, 2);
    const ids = items.map((i) => i.id).sort();
    expect(ids).toEqual([1, 2, 3]);
  });

  it("handles zero total_count without error", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ items: [], total_count: 0, offset: 0, limit: 100 }));
    const items = await fetchAllPaginated<Item>("/items.json", "items", TEST_API_KEY, 100);
    expect(items).toEqual([]);
  });
});

describe("API error handling", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([401, 403, 404, 429, 500, 503])("wraps HTTP %i into a friendly RedmineApiError", async (status) => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "boom" }, status));
    await expect(redmineGet("/x.json", TEST_API_KEY)).rejects.toBeInstanceOf(RedmineApiError);
    try {
      await redmineGet("/x.json", TEST_API_KEY);
    } catch (err) {
      expect(err).toBeInstanceOf(RedmineApiError);
      const apiErr = err as RedmineApiError;
      expect(apiErr.status).toBe(status);
      expect(apiErr.userMessage).not.toMatch(/boom/);
      expect(apiErr.userMessage.length).toBeGreaterThan(0);
    }
  });

  it("wraps network failures as a friendly error", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(redmineGet("/x.json", TEST_API_KEY)).rejects.toBeInstanceOf(RedmineApiError);
  });

  it("wraps invalid JSON as a friendly error", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
      text: async () => "not json",
    } as unknown as Response);
    await expect(redmineGet("/x.json", TEST_API_KEY)).rejects.toBeInstanceOf(RedmineApiError);
  });
});
