import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import ChasePanel from "./ChasePanel";
import ErrorBoundary from "./ErrorBoundary";
import ExportButton from "./ExportButton";
import HygienePanel from "./HygienePanel";
import LimitedWindowNotice from "./LimitedWindowNotice";
import NumberInput from "./NumberInput";
import ReadinessPanel from "./ReadinessPanel";
import TimesheetGrid from "./TimesheetGrid";
import { makeIssue } from "../test-utils/factories";
import { ThemeProvider } from "../theme";
import * as api from "../services/api";
import * as reportExport from "../utils/reportExport";
import { LoadWindow } from "../utils/dataWindow";
import { buildChaseTiles, DEFAULT_CHASE_SETTINGS, MAX_SETTING } from "../utils/chase";
import { buildHygiene } from "../utils/hygiene";
import { todayString } from "../utils/activity";
import { stageOfStatus } from "../utils/stages";

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => vi.restoreAllMocks());

const NOW = new Date("2026-03-20T12:00:00Z");
const ALL_TIME: LoadWindow = { kind: "days", days: 0 };
const ISSUES = [
  makeIssue({ id: 1, tracker: "Epic", targetVersion: "v1" }),
  makeIssue({ id: 2, parentId: 1, tracker: "Bug", subject: "Crash", status: "New", assignedTo: "Dan" }),
  makeIssue({ id: 3, parentId: 1, tracker: "Task", subject: "Page", status: "In Progress", assignedTo: "Dan", estimatedHours: 4 }),
];

describe("QA-001: a huge setting cannot take the app down", () => {
  it("clamps the settings instead of throwing 'Invalid time value'", () => {
    expect(() => buildChaseTiles(ISSUES, null, { staleWorkingDays: 1e12, overBudgetPercent: 1e12, movedDays: 999_999_999 }, NOW)).not.toThrow();
    expect(MAX_SETTING).toBe(3650);
    expect(() => buildChaseTiles(ISSUES, null, { ...DEFAULT_CHASE_SETTINGS, movedDays: Number.NaN }, NOW)).not.toThrow();
  });

  it("an error boundary shows a message and recovers when the tab changes, instead of a blank page", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    function Boom({ explode }: { explode: boolean }) {
      if (explode) throw new Error("kaboom");
      return <p>all good</p>;
    }
    const { rerender } = render(
      <ErrorBoundary resetKey="a">
        <Boom explode />
      </ErrorBoundary>
    );
    expect(screen.getByRole("alert")).toHaveTextContent("could not be shown");
    expect(screen.getByRole("alert")).toHaveTextContent("kaboom");
    rerender(
      <ErrorBoundary resetKey="b">
        <Boom explode={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText("all good")).toBeInTheDocument();
  });

  it("the Stand-up setting accepts a huge number without crashing", async () => {
    vi.spyOn(api, "getTimeEntries").mockResolvedValue({ timeEntries: [], totalCount: 0, durationMs: 1, fetchedAt: "x" });
    render(
      <ThemeProvider>
        <ChasePanel projectIdentifier="alpha" issues={ISSUES} redmineBaseUrl="" loadWindow={ALL_TIME} onSessionExpired={() => {}} now={NOW} />
      </ThemeProvider>
    );
    fireEvent.change(screen.getByLabelText("What moved: last (days)"), { target: { value: "999999999" } });
    expect(screen.getByRole("button", { name: /What moved/ })).toBeInTheDocument(); // still rendering
  });
});

describe("QA-017: number fields can be cleared and retyped", () => {
  function Harness({ onCommit }: { onCommit: (n: number) => void }) {
    return <NumberInput aria-label="n" value={5} min={1} max={24} integer onCommit={onCommit} />;
  }

  it("keeps what is typed, commits only valid values, and restores the last good one on blur", () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    const input = screen.getByLabelText("n") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "" } }); // cleared: allowed while editing
    expect(input.value).toBe("");
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "12" } });
    expect(onCommit).toHaveBeenLastCalledWith(12);

    fireEvent.change(input, { target: { value: "99" } }); // above the maximum
    expect(onCommit).toHaveBeenCalledTimes(1);
    fireEvent.change(input, { target: { value: "-3" } });
    expect(onCommit).toHaveBeenCalledTimes(1);

    fireEvent.blur(input); // the value is still 5 as far as the parent is concerned
    expect(input.value).toBe("5");
  });

  it("rounds a decimal when whole numbers are wanted", () => {
    const onCommit = vi.fn();
    render(<Harness onCommit={onCommit} />);
    fireEvent.change(screen.getByLabelText("n"), { target: { value: "7.6" } });
    expect(onCommit).toHaveBeenCalledWith(8);
  });

  it("the Timesheet fields take a decimal and can be cleared", () => {
    render(<TimesheetGrid entries={[]} issues={ISSUES} loadWindow={ALL_TIME} now={NOW} />);
    const hours = screen.getByLabelText(/Hours per day/) as HTMLInputElement;
    fireEvent.change(hours, { target: { value: "" } });
    expect(hours.value).toBe("");
    fireEvent.change(hours, { target: { value: "7.5" } });
    expect(hours.value).toBe("7.5");
  });
});

describe("QA-002: Tracker chips apply to Data Quality", () => {
  it("measures only the chosen trackers, while parents and versions are still looked up in every ticket", () => {
    const all = buildHygiene(ISSUES, null);
    const bugs = buildHygiene(ISSUES, null, new Set([2]));
    expect(all.openLeaves).toBe(2);
    expect(bugs.openLeaves).toBe(1);
    expect(bugs.checks.find((c) => c.id === "version")!.have).toBe(1); // #2 inherits v1 from the Epic, which is not in scope
  });

  it("the panel narrows to the chip", async () => {
    vi.spyOn(api, "getTimeEntries").mockResolvedValue({ timeEntries: [], totalCount: 0, durationMs: 1, fetchedAt: "x" });
    render(<HygienePanel projectIdentifier="alpha" issues={ISSUES} redmineBaseUrl="" loadWindow={ALL_TIME} onSessionExpired={() => {}} trackers={["Bug"]} />);
    expect(screen.getByText(/Of the 1 open tickets/)).toBeInTheDocument();
  });

  it("shows <1% rather than 0% for a small non-zero share", () => {
    const many = Array.from({ length: 300 }, (_, i) => makeIssue({ id: i + 1, dueDate: i === 0 ? "2026-04-01" : null }));
    vi.spyOn(api, "getTimeEntries").mockResolvedValue({ timeEntries: [], totalCount: 0, durationMs: 1, fetchedAt: "x" });
    render(<HygienePanel projectIdentifier="alpha" issues={many} redmineBaseUrl="" loadWindow={ALL_TIME} onSessionExpired={() => {}} />);
    expect(screen.getByText("Has a due date").closest("tr")).toHaveTextContent("<1%");
  });
});

describe("QA-003 / QA-010: hours left and release status read honestly", () => {
  const issues = [
    makeIssue({ id: 1, tracker: "Epic", targetVersion: "v1" }),
    makeIssue({ id: 2, parentId: 1, status: "New" }), // no estimate
    makeIssue({ id: 3, targetVersion: "old", status: "Closed", statusIsClosed: true }), // a release with nothing left
  ];

  it("marks hours left as a lower bound when open tickets have no estimate", () => {
    render(
      <ThemeProvider>
        <ReadinessPanel issues={issues} releaseDates={new Map([["v1", "2026-04-01"], ["old", "2026-01-01"]])} devDoneCounts now={NOW} />
      </ThemeProvider>
    );
    const table = screen.getByRole("table", { name: "Release readiness" });
    expect(within(table).getByText("v1").closest("tr")).toHaveTextContent("0+");
  });

  it("calls a fully delivered release Done and does not say how late it is", () => {
    render(
      <ThemeProvider>
        <ReadinessPanel issues={issues} releaseDates={new Map([["old", "2026-01-01"]])} devDoneCounts now={NOW} />
      </ThemeProvider>
    );
    const row = within(screen.getByRole("table", { name: "Release readiness" })).getByText("old").closest("tr")!;
    expect(row).toHaveTextContent("Done");
    expect(row).not.toHaveTextContent("late");
  });

  it("milestones are 'In progress' rather than 'No date'", () => {
    render(
      <ThemeProvider>
        <ReadinessPanel issues={issues} releaseDates={new Map()} devDoneCounts now={NOW} />
      </ThemeProvider>
    );
    fireEvent.change(screen.getByLabelText("Group readiness by"), { target: { value: "milestone" } });
    expect(within(screen.getByRole("table", { name: "Release readiness" })).getAllByText("In progress").length).toBeGreaterThan(0);
  });
});

describe("QA-008: the 30-day window is flagged", () => {
  it("warns, with a way out, only when a limited period is loaded", () => {
    const onLoadAllTime = vi.fn();
    const { rerender } = render(<LimitedWindowNotice loadWindow={{ kind: "days", days: 30 }} onLoadAllTime={onLoadAllTime} />);
    expect(screen.getByText(/can be skewed/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load all time" }));
    expect(onLoadAllTime).toHaveBeenCalledTimes(1);
    rerender(<LimitedWindowNotice loadWindow={ALL_TIME} onLoadAllTime={onLoadAllTime} />);
    expect(screen.queryByText(/can be skewed/)).not.toBeInTheDocument();
  });
});

describe("QA-018: today is the user's date", () => {
  it("uses the local calendar date", () => {
    const local = new Date(2026, 2, 20, 1, 30); // 01:30 on 20 March, wherever the user is
    expect(todayString(local)).toBe("2026-03-20");
  });
});

describe("QA-021: more statuses are mapped", () => {
  it("places the statuses Redmine has that were missing", () => {
    expect(stageOfStatus("Feasibility Assessment", false)).toBe("notStarted");
    expect(stageOfStatus("BRD Approved", false)).toBe("notStarted");
    expect(stageOfStatus("Completed", false)).toBe("devDone");
    expect(stageOfStatus("Released for UAT", false)).toBe("inQa");
    expect(stageOfStatus("Scheduled for Release", false)).toBe("qaPassed");
    expect(stageOfStatus("Released to Production", false)).toBe("done");
  });
});

describe("ExportButton", () => {
  it("builds the sheets from the screen at click time and downloads them", async () => {
    const exporter = vi.spyOn(reportExport, "exportReport").mockResolvedValue();
    const build = vi.fn(() => [{ name: "S", columns: [{ header: "A", key: "a" }], rows: [{ a: 1 }] }]);
    render(<ExportButton build={build} filenamePrefix="redmine_x" projectLabel="Shop Kerala" label="Export x" />);
    expect(build).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Export x" }));
    await waitFor(() => expect(exporter).toHaveBeenCalledTimes(1));
    expect(exporter.mock.calls[0][1]).toBe("redmine_x");
    expect(exporter.mock.calls[0][2]).toBe("Shop Kerala");
  });

  it("says so when the export fails, and can be retried", async () => {
    vi.spyOn(reportExport, "exportReport").mockRejectedValue(new Error("nope"));
    render(<ExportButton build={() => []} filenamePrefix="p" projectLabel="x" label="Export x" />);
    fireEvent.click(screen.getByRole("button", { name: "Export x" }));
    await waitFor(() => expect(screen.getByText(/export failed/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Export x" })).toBeEnabled();
  });
});

describe("QA-020: Refresh reloads time entries too", () => {
  it("asks the server for fresh entries when the refresh tick changes, but not on first load", async () => {
    const spy = vi.spyOn(api, "getTimeEntries").mockResolvedValue({ timeEntries: [], totalCount: 0, durationMs: 1, fetchedAt: "x" });
    const props = { projectIdentifier: "alpha", issues: ISSUES, redmineBaseUrl: "", loadWindow: ALL_TIME, onSessionExpired: () => {}, now: NOW };
    const { rerender } = render(
      <ThemeProvider>
        <ChasePanel {...props} refreshTick={0} />
      </ThemeProvider>
    );
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    expect(spy.mock.calls[0][1]).toBe(false);
    rerender(
      <ThemeProvider>
        <ChasePanel {...props} refreshTick={1} />
      </ThemeProvider>
    );
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy.mock.calls[1][1]).toBe(true);
  });
});

describe("QA-103: Data Quality lines work from the keyboard", () => {
  it("each check is a button that opens the tickets missing it", async () => {
    vi.spyOn(api, "getTimeEntries").mockResolvedValue({ timeEntries: [], totalCount: 0, durationMs: 1, fetchedAt: "x" });
    render(<HygienePanel projectIdentifier="alpha" issues={ISSUES} redmineBaseUrl="https://r.test" loadWindow={ALL_TIME} onSessionExpired={() => {}} />);
    const button = screen.getByRole("button", { name: "Has an estimate" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "#2" })).toBeInTheDocument(); // the bug has no estimate
  });
});

describe("QA-108: '% delivered by hours' warns when most tickets have no estimate", () => {
  it("flags a release whose figure rests on few estimates", () => {
    const issues = [
      makeIssue({ id: 1, targetVersion: "v1", status: "Closed", statusIsClosed: true, estimatedHours: 5 }),
      makeIssue({ id: 2, targetVersion: "v1", status: "New" }),
      makeIssue({ id: 3, targetVersion: "v1", status: "New" }),
    ];
    render(
      <ThemeProvider>
        <ReadinessPanel issues={issues} releaseDates={new Map()} devDoneCounts now={NOW} />
      </ThemeProvider>
    );
    const cell = within(screen.getByRole("table", { name: "Release readiness" })).getByText("100%").closest("td")!;
    expect(cell).toHaveAttribute("title", expect.stringContaining("67% of these tickets have no estimate"));
    expect(cell).toHaveTextContent("⚠");
  });
});

describe("QA-114: the timesheet note names the real cut-off", () => {
  it("only mentions today when the grid ends yesterday", () => {
    const { rerender } = render(<TimesheetGrid entries={[]} issues={ISSUES} loadWindow={ALL_TIME} now={NOW} />);
    expect(screen.getByText(/today is not counted/)).toBeInTheDocument();
    rerender(<TimesheetGrid entries={[]} issues={ISSUES} loadWindow={{ kind: "range", from: "2026-02-01", to: "2026-02-28" }} now={NOW} />);
    expect(screen.queryByText(/today is not counted/)).not.toBeInTheDocument();
    expect(screen.getByText(/up to 2026-02-28/)).toBeInTheDocument();
  });
});
