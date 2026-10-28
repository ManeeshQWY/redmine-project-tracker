import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import ParentProgressPanel from "./ParentProgressPanel";
import { ThemeProvider } from "../theme";
import { Issue, StatusMeta } from "../types/issue";
import * as excelExport from "../utils/excelExport";
import { LoadWindow } from "../utils/dataWindow";

beforeAll(() => {
  // the chart measures itself with ResizeObserver, which jsdom doesn't have
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});
afterEach(() => vi.restoreAllMocks());

function issue(overrides: Partial<Issue> & { id: number }): Issue {
  return {
    parentId: null, project: "Shop Kerala", tracker: "Task", status: "New", statusIsClosed: false, priority: "Normal",
    author: "A", subject: `Ticket ${overrides.id}`, description: null, doneRatio: 0, createdOn: "2026-03-10T00:00:00Z",
    updatedOn: "2026-03-10T00:00:00Z", assignedTo: null, targetVersion: null, targetVersionId: null, startDate: null,
    dueDate: null, closedOn: null, estimatedHours: null, spentHours: null, totalSpentHours: null, totalEstimatedHours: null,
    assignedQA: null, platform: null, additionalAssignee: null, additionalAssignees: [], assignedQAs: [],
    estimatedTimeForQA: null, customFields: [],
    ...overrides,
  };
}
const done = { status: "Closed", statusIsClosed: true, doneRatio: 100 };

const STATUSES: StatusMeta[] = [
  { id: 1, name: "New", isClosed: false },
  { id: 2, name: "In Progress", isClosed: false },
  { id: 3, name: "Closed", isClosed: true },
];

const ISSUES = [
  issue({ id: 100, tracker: "Epic", subject: "Checkout", assignedTo: "Priya", totalEstimatedHours: 40, totalSpentHours: 12 }),
  issue({ id: 101, parentId: 100, tracker: "Task", subject: "Cart page", ...done }),
  issue({ id: 102, parentId: 100, tracker: "Task", subject: "Payment form", status: "In Progress" }),
  issue({ id: 103, parentId: 100, tracker: "Bug", subject: "Coupon bug" }),
  issue({ id: 104, parentId: 100, tracker: "Task", subject: "Receipt email", ...done }),
  issue({ id: 200, tracker: "Feature", subject: "Search", status: "In Progress" }),
  issue({ id: 201, parentId: 200, tracker: "Task", subject: "Filters", ...done }),
];

function renderPanel(props: Partial<React.ComponentProps<typeof ParentProgressPanel>> = {}) {
  const onLoadAllTime = vi.fn();
  const view = render(
    <ThemeProvider>
      <ParentProgressPanel
        issues={ISSUES}
        statuses={STATUSES}
        trackers={[]}
        redmineBaseUrl="https://r.test"
        projectLabel="Shop Kerala"
        loadWindow={{ kind: "days", days: 0 }}
        onLoadAllTime={onLoadAllTime}
        {...props}
      />
    </ThemeProvider>
  );
  return { ...view, onLoadAllTime };
}

const dataTable = () => screen.getAllByRole("table")[0];
const parentRows = () => within(dataTable()).getAllByRole("row").filter((r) => r.parentElement?.tagName === "TBODY" && r.getAttribute("aria-expanded") !== null);

describe("ParentProgressPanel", () => {
  it("lists each parent with its child count, % closed and Redmine's own estimate and time", () => {
    renderPanel();
    expect(parentRows()).toHaveLength(2);

    const epic = parentRows().find((r) => r.textContent?.includes("Checkout"))!;
    const cells = within(epic).getAllByRole("cell").map((c) => c.textContent ?? "");
    expect(cells[0]).toContain("#100");
    expect(cells[2]).toBe("Priya");
    expect(cells[3]).toBe("4"); // four tickets under the Epic
    expect(cells[4]).toContain("New 1 · In Progress 1 · Closed 2"); // by status, in Redmine's order
    expect(cells[5]).toContain("50%"); // 2 of 4 closed
    expect(cells[7]).toBe("40");
    expect(cells[8]).toBe("12");
  });

  it("summarises the parents shown, counting a ticket once", () => {
    renderPanel();
    // the headline figures come first on the page; the same words also head table columns and the legend
    const kpi = (label: string) => screen.getAllByText(label)[0].nextElementSibling;
    expect(kpi("Parent tickets")).toHaveTextContent("2");
    expect(kpi("Child tickets")).toHaveTextContent("5");
    expect(kpi("Closed")).toHaveTextContent("3");
    expect(kpi("Overall complete")).toHaveTextContent("60%");
  });

  it("draws a chart with a legend naming every status in use", () => {
    renderPanel();
    const legend = screen.getByRole("list", { name: "Status legend" });
    expect(within(legend).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["New", "In Progress", "Closed"]);
  });

  it("lists only the parents of the selected Tracker chips, and still counts children of any tracker", () => {
    renderPanel({ trackers: ["Epic"] });
    expect(parentRows()).toHaveLength(1);
    expect(parentRows()[0].textContent).toContain("Checkout");
    // the Epic's children are Tasks and a Bug — they are not hidden by the Epic chip
    expect(within(parentRows()[0]).getAllByRole("cell")[3].textContent).toBe("4");
    expect(screen.getByText(/parents of type Epic/)).toBeInTheDocument();
  });

  it("searches by subject or ticket number, and filters by the parent's own status", () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText(/search parent/i), { target: { value: "search" } });
    expect(parentRows()).toHaveLength(1);
    expect(parentRows()[0].textContent).toContain("#200");

    fireEvent.change(screen.getByLabelText(/search parent/i), { target: { value: "#100" } });
    expect(parentRows()).toHaveLength(1);
    expect(parentRows()[0].textContent).toContain("Checkout");

    fireEvent.change(screen.getByLabelText(/search parent/i), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Parent status"), { target: { value: "closed" } });
    expect(screen.getByText(/no parent tickets match/i)).toBeInTheDocument();
  });

  it("sorts, e.g. to put the least finished parent first", () => {
    renderPanel();
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "lowestComplete" } });
    expect(parentRows()[0].textContent).toContain("Checkout"); // 50% vs Search's 100%
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "highestComplete" } });
    expect(parentRows()[0].textContent).toContain("Search");
  });

  it("can count only direct children", () => {
    const issues = [
      issue({ id: 1, tracker: "Epic", subject: "Big" }),
      issue({ id: 2, parentId: 1, tracker: "Feature" }),
      issue({ id: 3, parentId: 2, ...done }),
      issue({ id: 4, parentId: 2, ...done }),
    ];
    renderPanel({ issues });
    const epicRow = () => parentRows().find((r) => r.textContent?.includes("#1"))!;
    expect(within(epicRow()).getAllByRole("cell")[3].textContent).toBe("3");
    fireEvent.change(screen.getByLabelText("Count"), { target: { value: "direct" } });
    expect(within(epicRow()).getAllByRole("cell")[3].textContent).toBe("1");
  });

  it("expands a parent to list its child tickets with their status", () => {
    renderPanel();
    const epic = parentRows().find((r) => r.textContent?.includes("Checkout"))!;
    expect(screen.queryByText("Payment form")).not.toBeInTheDocument();

    fireEvent.click(epic);

    expect(screen.getByText(/Payment form/)).toBeInTheDocument();
    expect(screen.getByText(/Coupon bug/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "#102" })).toHaveAttribute("href", "https://r.test/issues/102");
    fireEvent.click(epic);
    expect(screen.queryByText(/Payment form/)).not.toBeInTheDocument();
  });

  it("says when nothing in the loaded tickets has children", () => {
    renderPanel({ issues: [issue({ id: 1 }), issue({ id: 2 })] });
    expect(screen.getByText(/no ticket in this view has child tickets/i)).toBeInTheDocument();
  });

  it("exports the parents shown, with their children", async () => {
    const exporter = vi.spyOn(excelExport, "exportParentProgressToExcel").mockResolvedValue();
    renderPanel({ trackers: ["Epic"] });
    fireEvent.click(screen.getByRole("button", { name: /export to excel/i }));
    await waitFor(() => expect(exporter).toHaveBeenCalledTimes(1));
    const [rows, , , baseUrl, project] = exporter.mock.calls[0];
    expect(rows.map((r) => r.id)).toEqual([100]);
    expect(baseUrl).toBe("https://r.test");
    expect(project).toBe("Shop Kerala");
  });
});

describe("ParentProgressPanel and the loaded period", () => {
  const limited: LoadWindow[] = [{ kind: "days", days: 30 }, { kind: "range", from: "2026-01-01", to: "2026-03-31" }];

  it.each(limited)("warns that percentages can be understated when only recent tickets are loaded (%o)", (loadWindow) => {
    const { onLoadAllTime } = renderPanel({ loadWindow });
    expect(screen.getByText(/can be understated/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load all time" }));
    expect(onLoadAllTime).toHaveBeenCalledTimes(1);
  });

  it("shows no warning when everything is loaded", () => {
    renderPanel({ loadWindow: { kind: "days", days: 0 } });
    expect(screen.queryByText(/can be understated/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load all time" })).not.toBeInTheDocument();
  });
});

describe("ParentProgressPanel child ticket hours", () => {
  const hoursIssues = [
    issue({ id: 1, tracker: "Epic", subject: "Big" }),
    issue({ id: 2, parentId: 1, tracker: "Feature", subject: "Mid", estimatedHours: 1, spentHours: 0.5, totalEstimatedHours: 9, totalSpentHours: 4 }),
    issue({ id: 3, parentId: 2, subject: "Leaf", estimatedHours: 8, spentHours: 3.5, totalEstimatedHours: 8, totalSpentHours: 3.5 }),
    issue({ id: 4, parentId: 1, subject: "Unestimated" }),
  ];
  const childRow = (name: string) =>
    within(parentRows().find((r) => r.textContent?.includes("Big"))!.nextElementSibling as HTMLElement)
      .getAllByRole("row")
      .find((r) => r.textContent?.includes(name))!;
  const cellsOf = (name: string) => within(childRow(name)).getAllByRole("cell").map((c) => c.textContent);

  it("lists each child's estimate and time spent, blank when there is none", () => {
    renderPanel({ issues: hoursIssues });
    fireEvent.click(parentRows().find((r) => r.textContent?.includes("Big"))!);
    // columns: Ticket, Tracker, Status, Assignee, % done, Est. (h), Spent (h)
    expect(cellsOf("Leaf").slice(5)).toEqual(["8", "3.50"]);
    expect(cellsOf("Unestimated").slice(5)).toEqual(["—", "—"]);
    // every descendant is listed, so the Feature shows only its own hours
    expect(cellsOf("Mid").slice(5)).toEqual(["1", "0.50"]);
  });

  it("shows a child's Redmine total when only direct children are counted", () => {
    renderPanel({ issues: hoursIssues });
    fireEvent.change(screen.getByLabelText("Count"), { target: { value: "direct" } });
    fireEvent.click(parentRows().find((r) => r.textContent?.includes("Big"))!);
    expect(cellsOf("Mid").slice(5)).toEqual(["9", "4"]);
  });

  it("passes the count mode to the export", async () => {
    const exporter = vi.spyOn(excelExport, "exportParentProgressToExcel").mockResolvedValue();
    renderPanel({ issues: hoursIssues });
    fireEvent.change(screen.getByLabelText("Count"), { target: { value: "direct" } });
    fireEvent.click(screen.getByRole("button", { name: /export to excel/i }));
    await waitFor(() => expect(exporter).toHaveBeenCalledTimes(1));
    expect(exporter.mock.calls[0][5]).toBe("direct");
  });
});
