import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { ThemeProvider } from "./theme";
import * as api from "./services/api";
import { Issue, ProjectIssuesResult } from "./types/issue";
import { LoadWindow } from "./utils/dataWindow";

// Loading tickets is the slow, interruptible part of the app, so these drive App with
// loads that stay pending until the test settles them: cancelling, changing the period,
// and refreshing all have to behave while a load is still running.

// The Overview charts measure themselves with ResizeObserver, which jsdom doesn't have.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

vi.mock("./services/api", async () => {
  const actual = await vi.importActual<typeof import("./services/api")>("./services/api");
  return {
    ...actual,
    getCurrentUser: vi.fn(),
    getProjects: vi.fn(),
    getMeta: vi.fn(),
    getProjectIssues: vi.fn(),
    getIssueCount: vi.fn(),
    getVersions: vi.fn(),
    getTimeEntries: vi.fn(),
    getUserRoles: vi.fn(),
    logout: vi.fn(),
  };
});

function makeIssue(id: number): Issue {
  return {
    id, parentId: null, project: "Alpha", tracker: "Bug", status: "New", statusIsClosed: false, priority: "Normal",
    author: "A", subject: `Ticket ${id}`, description: null, doneRatio: 0, createdOn: "2026-01-01T00:00:00Z",
    updatedOn: "2026-01-01T00:00:00Z", assignedTo: null, targetVersion: null, targetVersionId: null, startDate: null,
    dueDate: null, closedOn: null, estimatedHours: null, spentHours: null, totalSpentHours: null, totalEstimatedHours: null,
    assignedQA: null, platform: null, additionalAssignee: null, additionalAssignees: [], assignedQAs: [],
    estimatedTimeForQA: null, customFields: [],
  };
}

function result(count: number): ProjectIssuesResult {
  return { issues: Array.from({ length: count }, (_, i) => makeIssue(i + 1)), totalCount: count, fetchedCount: count, durationMs: 5, fetchedAt: "2026-10-19T10:00:00Z" };
}

interface PendingLoad {
  window: LoadWindow;
  refresh: boolean;
  signal?: AbortSignal;
  resolve: (r: ProjectIssuesResult) => void;
}

let loads: PendingLoad[];

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("rtt.selectedProject", "alpha");
  loads = [];
  vi.mocked(api.getCurrentUser).mockResolvedValue({ user: { name: "Tester", login: "tester", mail: null } });
  vi.mocked(api.getProjects).mockResolvedValue([{ id: 1, name: "Alpha", identifier: "alpha", parent: null }]);
  vi.mocked(api.getMeta).mockResolvedValue({ statuses: [], trackers: [], priorities: [], redmineBaseUrl: "https://r.test" });
  vi.mocked(api.getIssueCount).mockResolvedValue(5);
  vi.mocked(api.getVersions).mockResolvedValue([]);
  vi.mocked(api.getProjectIssues).mockImplementation(
    (_project, refresh = false, window = { kind: "days", days: 30 }, signal) =>
      new Promise<ProjectIssuesResult>((resolve, reject) => {
        loads.push({ window, refresh, signal, resolve });
        signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      })
  );
});

function renderApp() {
  return render(
    <ThemeProvider>
      <App />
    </ThemeProvider>
  );
}

const windowSelect = () => screen.getByLabelText("Tickets updated in") as HTMLSelectElement;
const settle = (index: number, count: number) => act(async () => loads[index].resolve(result(count)));
const firstLoad = async () => {
  await waitFor(() => expect(loads).toHaveLength(1));
};

describe("App: the load window", () => {
  it("loads the last 30 days by default and says so", async () => {
    renderApp();
    await firstLoad();
    expect(loads[0].window).toEqual({ kind: "days", days: 30 });
    await settle(0, 3);
    expect(await screen.findByText("Showing 3 tickets updated in the last 30 days.")).toBeInTheDocument();
  });

  it("reloads for another period when the selector changes", async () => {
    renderApp();
    await firstLoad();
    await settle(0, 3);
    await screen.findByText(/Showing 3 tickets/);

    fireEvent.change(windowSelect(), { target: { value: "90" } });

    await waitFor(() => expect(loads).toHaveLength(2));
    expect(loads[1].window).toEqual({ kind: "days", days: 90 });
    await settle(1, 7);
    expect(await screen.findByText("Showing 7 tickets updated in the last 90 days.")).toBeInTheDocument();
  });

  it("loads an exact date range once Apply is clicked", async () => {
    renderApp();
    await firstLoad();
    await settle(0, 3);
    await screen.findByText(/Showing 3 tickets/);

    fireEvent.change(windowSelect(), { target: { value: "custom" } });
    expect(loads).toHaveLength(1); // choosing "Custom range" alone loads nothing
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-03-31" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(loads).toHaveLength(2));
    expect(loads[1].window).toEqual({ kind: "range", from: "2026-01-01", to: "2026-03-31" });
    await settle(1, 4);
    expect(await screen.findByText("Showing 4 tickets updated in 1 Jan 2026 to 31 Mar 2026.")).toBeInTheDocument();
  });

  it("remembers a preset period but not a custom range", async () => {
    renderApp();
    await firstLoad();
    await settle(0, 1);
    await screen.findByText(/Showing 1 tickets/);
    fireEvent.change(windowSelect(), { target: { value: "180" } });
    await waitFor(() => expect(loads).toHaveLength(2));
    expect(localStorage.getItem("rtt.windowDays")).toBe("180");

    fireEvent.change(windowSelect(), { target: { value: "custom" } });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-03-31" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(loads).toHaveLength(3));
    expect(localStorage.getItem("rtt.windowDays")).toBe("180"); // unchanged
  });
});

describe("App: cancelling a load", () => {
  it("cancelling the very first load stops it and offers to load again", async () => {
    renderApp();
    await firstLoad();
    expect(loads[0].signal?.aborted).toBe(false);

    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(loads[0].signal?.aborted).toBe(true);
    expect(await screen.findByText("Loading was cancelled.")).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong|unable to/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Load again" }));
    await waitFor(() => expect(loads).toHaveLength(2));
    await settle(1, 2);
    expect(await screen.findByText(/Showing 2 tickets/)).toBeInTheDocument();
  });

  it("cancelling a longer period returns to the period that was on screen", async () => {
    renderApp();
    await firstLoad();
    await settle(0, 3);
    await screen.findByText(/Showing 3 tickets/);

    // an accidental click on 6 months…
    fireEvent.change(windowSelect(), { target: { value: "180" } });
    await waitFor(() => expect(loads).toHaveLength(2));
    expect(windowSelect().value).toBe("180");

    // …cancelled
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(loads[1].signal?.aborted).toBe(true); // the 6-month fetch is abandoned
    await waitFor(() => expect(windowSelect().value).toBe("30")); // back to 30 days
    await waitFor(() => expect(loads).toHaveLength(3)); // and the 30-day tickets are brought back
    expect(loads[2].window).toEqual({ kind: "days", days: 30 });
    await settle(2, 3);
    expect(await screen.findByText("Showing 3 tickets updated in the last 30 days.")).toBeInTheDocument();
    expect(localStorage.getItem("rtt.windowDays")).toBe("30"); // not left on 6 months
  });

  it("cancelling a custom range returns to the previous preset", async () => {
    renderApp();
    await firstLoad();
    await settle(0, 3);
    await screen.findByText(/Showing 3 tickets/);

    fireEvent.change(windowSelect(), { target: { value: "custom" } });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2020-01-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-03-31" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(loads).toHaveLength(2));

    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(loads[1].signal?.aborted).toBe(true);
    await waitFor(() => expect(loads).toHaveLength(3));
    expect(loads[2].window).toEqual({ kind: "days", days: 30 });
    await waitFor(() => expect(windowSelect().value).toBe("30"));
  });

  it("choosing another period while one is loading abandons the first", async () => {
    renderApp();
    await firstLoad();
    await settle(0, 3);
    await screen.findByText(/Showing 3 tickets/);

    fireEvent.change(windowSelect(), { target: { value: "180" } });
    await waitFor(() => expect(loads).toHaveLength(2));
    fireEvent.change(windowSelect(), { target: { value: "90" } });
    await waitFor(() => expect(loads).toHaveLength(3));

    expect(loads[1].signal?.aborted).toBe(true);
    expect(loads[2].signal?.aborted).toBe(false);
    await settle(2, 5);
    expect(await screen.findByText("Showing 5 tickets updated in the last 90 days.")).toBeInTheDocument();
  });

  it("cancelling a Refresh keeps the tickets already on screen", async () => {
    renderApp();
    await firstLoad();
    await settle(0, 3);
    await screen.findByText(/Showing 3 tickets/);

    fireEvent.click(screen.getByRole("button", { name: /refresh data/i }));
    await waitFor(() => expect(loads).toHaveLength(2));
    expect(loads[1].refresh).toBe(true);

    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(loads[1].signal?.aborted).toBe(true);
    expect(await screen.findByRole("button", { name: /refresh data/i })).toBeEnabled();
    expect(screen.getByText("Showing 3 tickets updated in the last 30 days.")).toBeInTheDocument();
    expect(screen.queryByText("Loading was cancelled.")).not.toBeInTheDocument();
    expect(loads).toHaveLength(2); // nothing was re-requested
  });

  it("shows only one Cancel button on the first load, not two", async () => {
    renderApp();
    await firstLoad();
    expect(await screen.findAllByRole("button", { name: "Cancel" })).toHaveLength(1);
  });
});
