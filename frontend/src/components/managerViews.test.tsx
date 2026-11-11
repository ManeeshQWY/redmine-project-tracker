import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import AwaitingQaPanel from "./AwaitingQaPanel";
import BugHealthPanel from "./BugHealthPanel";
import ChasePanel from "./ChasePanel";
import DeliveryPanel from "./DeliveryPanel";
import EstimateAccuracyPanel from "./EstimateAccuracyPanel";
import FlowPanel from "./FlowPanel";
import HygienePanel from "./HygienePanel";
import KpiCards from "./KpiCards";
import ReadinessPanel from "./ReadinessPanel";
import StalenessPanel from "./StalenessPanel";
import TimesheetGrid from "./TimesheetGrid";
import { makeEntry, makeIssue } from "../test-utils/factories";
import { ThemeProvider } from "../theme";
import * as api from "../services/api";
import { LoadWindow } from "../utils/dataWindow";

beforeAll(() => {
  // charts measure themselves with ResizeObserver, which jsdom does not have
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

const NOW = new Date("2026-03-20T12:00:00Z"); // a Friday
const ALL_TIME: LoadWindow = { kind: "days", days: 0 };
const wrap = (ui: React.ReactNode) => render(<ThemeProvider>{ui}</ThemeProvider>);

const ISSUES = [
  makeIssue({ id: 1, tracker: "Epic", subject: "Checkout", targetVersion: "v1" }),
  makeIssue({ id: 2, parentId: 1, subject: "Cart page", status: "Closed", statusIsClosed: true, assignedTo: "Dan", estimatedHours: 4, spentHours: 5, closedOn: "2026-03-10T00:00:00Z", createdOn: "2026-03-01T00:00:00Z", updatedOn: "2026-03-10T00:00:00Z" }),
  makeIssue({ id: 3, parentId: 1, subject: "Payment form", status: "In Progress", assignedTo: "Dan", estimatedHours: 6, spentHours: 1, updatedOn: "2026-03-02T00:00:00Z" }),
  makeIssue({ id: 4, parentId: 1, subject: "Receipt email", status: "Dev Completed", assignedTo: "Dee", estimatedHours: 2, spentHours: 2, updatedOn: "2026-03-05T00:00:00Z" }),
  makeIssue({ id: 5, parentId: 1, subject: "Coupon crash", tracker: "Bug", status: "New", createdOn: "2026-02-01T00:00:00Z", updatedOn: "2026-03-19T00:00:00Z" }),
];

describe("DeliveryPanel", () => {
  it("shows how much is delivered and lets the Dev Completed line be moved", () => {
    const onChange = vi.fn();
    wrap(<DeliveryPanel issues={ISSUES} devDoneCounts onDevDoneCountsChange={onChange} />);
    expect(screen.getByText("Delivered (tickets)").nextElementSibling).toHaveTextContent("50%"); // Closed and Dev Completed, of four leaf tickets
    expect(screen.getByRole("list", { name: "Stage legend" })).toHaveTextContent("Dev done, awaiting QA");
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it("shows the lower figure when Dev Completed does not count", () => {
    wrap(<DeliveryPanel issues={ISSUES} devDoneCounts={false} onDevDoneCountsChange={() => {}} />);
    expect(screen.getByText("Delivered (tickets)").nextElementSibling).toHaveTextContent("25%");
  });
});

describe("KpiCards quick counts", () => {
  it("shows unassigned, unestimated and overdue open work", () => {
    render(<KpiCards issues={ISSUES} />);
    const value = (label: string) => screen.getByText(label).nextElementSibling;
    expect(value("Unassigned")).toHaveTextContent("1"); // #5
    expect(value("No Estimate")).toHaveTextContent("1");
    expect(value("Overdue")).toHaveTextContent("0");
  });
});

describe("ChasePanel", () => {
  function renderChase(props: Partial<React.ComponentProps<typeof ChasePanel>> = {}) {
    vi.spyOn(api, "getTimeEntries").mockResolvedValue({ timeEntries: [], totalCount: 0, durationMs: 1, fetchedAt: "2026-03-20T00:00:00Z" });
    return wrap(
      <ChasePanel projectIdentifier="alpha" issues={ISSUES} redmineBaseUrl="https://r.test" loadWindow={ALL_TIME} onSessionExpired={() => {}} now={NOW} {...props} />
    );
  }

  it("counts what needs chasing and lists the tickets of the chosen tile, grouped by person", async () => {
    renderChase();
    const tile = (title: string) => screen.getByRole("button", { name: new RegExp(title) });
    await waitFor(() => expect(screen.getByText(/Hours logged count as activity/)).toBeInTheDocument());
    expect(tile("Active but gone quiet")).toHaveTextContent("1"); // #3, quiet since 2 March
    expect(tile("Open and unassigned")).toHaveTextContent("1");

    fireEvent.click(tile("Active but gone quiet"));
    expect(screen.getByRole("link", { name: "#3" })).toHaveAttribute("href", "https://r.test/issues/3");
    expect(screen.getByText("Payment form")).toBeInTheDocument();
    expect(screen.getByText("Dan")).toBeInTheDocument();
  });

  it("copies the list as text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    renderChase();
    fireEvent.click(screen.getByRole("button", { name: "Copy as text" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain("Active but gone quiet (1)");
    expect(writeText.mock.calls[0][0]).toContain("#3 Payment form");
  });

  it("applies the Tracker chips to the tickets it lists", async () => {
    renderChase({ trackers: ["Bug"] });
    await waitFor(() => expect(screen.getByText(/Hours logged count as activity/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Active but gone quiet/ })).toHaveTextContent("0");
    expect(screen.getByRole("button", { name: /Open and unassigned/ })).toHaveTextContent("1");
  });

  it("warns, with a way out, when only recent tickets are loaded", async () => {
    const onLoadAllTime = vi.fn();
    renderChase({ loadWindow: { kind: "days", days: 30 }, onLoadAllTime });
    fireEvent.click(screen.getByRole("button", { name: "Load all time" }));
    expect(onLoadAllTime).toHaveBeenCalledTimes(1);
  });

  it("works without time entries, and says so", async () => {
    vi.spyOn(api, "getTimeEntries").mockRejectedValue(new api.ApiError("boom", 500));
    wrap(<ChasePanel projectIdentifier="alpha" issues={ISSUES} redmineBaseUrl="" loadWindow={ALL_TIME} onSessionExpired={() => {}} now={NOW} />);
    await waitFor(() => expect(screen.getByText(/Using ticket updates only/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Active but gone quiet/ })).toHaveTextContent("1");
  });
});

describe("HygienePanel", () => {
  it("shows how complete the open tickets are and lists those missing a field", async () => {
    vi.spyOn(api, "getTimeEntries").mockResolvedValue({ timeEntries: [makeEntry({ id: 1, issueId: null })], totalCount: 1, durationMs: 1, fetchedAt: "x" });
    wrap(<HygienePanel projectIdentifier="alpha" issues={ISSUES} redmineBaseUrl="https://r.test" loadWindow={ALL_TIME} onSessionExpired={() => {}} />);
    const line = screen.getByText("Has an assignee").closest("tr")!;
    expect(line).toHaveTextContent("67%"); // #3 and #4 of #3, #4, #5
    expect(line).toHaveTextContent("1 missing");
    fireEvent.click(line);
    expect(screen.getByRole("link", { name: "#5" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Time entries not linked to a ticket (whole project)")).toBeInTheDocument());
  });
});

describe("StalenessPanel", () => {
  it("counts quiet tickets by stage and lists them when a number is clicked", () => {
    wrap(<StalenessPanel issues={ISSUES} redmineBaseUrl="https://r.test" now={NOW} />);
    const table = screen.getByRole("table", { name: "Days since last update" });
    const active = within(table).getByText("Active").closest("tr")!;
    fireEvent.click(within(active).getByRole("button", { name: "1" })); // #3, updated 18 days ago → the 15–30 bucket
    expect(screen.getByText("Payment form")).toBeInTheDocument();
    expect(screen.getByText(/18d ago/)).toBeInTheDocument();
  });

  it("can group by assignee", () => {
    wrap(<StalenessPanel issues={ISSUES} redmineBaseUrl="" now={NOW} />);
    fireEvent.change(screen.getByLabelText("Group quiet tickets by"), { target: { value: "assignee" } });
    expect(within(screen.getByRole("table", { name: "Days since last update" })).getByText("(Unassigned)")).toBeInTheDocument();
  });
});

describe("TimesheetGrid", () => {
  it("shows hours per person per working day, with a dash where nothing was logged", () => {
    const entries = [makeEntry({ id: 1, user: "Dan", spentOn: "2026-03-19", hours: 6 }), makeEntry({ id: 2, user: "Dan", spentOn: "2026-03-20", hours: 12 })];
    render(<TimesheetGrid entries={entries} issues={ISSUES} loadWindow={ALL_TIME} now={NOW} />);
    const dan = within(screen.getByRole("table", { name: "Hours logged per person per day" })).getByText("Dan").closest("tr")!;
    const cells = within(dan).getAllByRole("cell").map((c) => c.textContent);
    // The grid ends at the last finished working day (Thu 19), so Friday 20 — today — is not counted yet
    expect(cells.slice(-5)).toEqual(["1/10", "6", "10%", "1", "2026-03-20"]); // days, hours, capacity, open tickets (#3), last logged
    expect(cells.slice(1, 10).every((c) => c === "—")).toBe(true); // the nine earlier days
    expect(cells[10]).toBe("6"); // Thu 19
  });

  it("lists someone with open tickets who logged nothing, as never logged", () => {
    render(<TimesheetGrid entries={[]} issues={ISSUES} loadWindow={ALL_TIME} now={NOW} />);
    const dee = within(screen.getByRole("table", { name: "Hours logged per person per day" })).getByText("Dee").closest("tr")!;
    expect(dee).toHaveTextContent("0/10");
    expect(dee).toHaveTextContent("never");
  });
});

describe("FlowPanel", () => {
  it("shows created and closed per week, the backlog and who has work in progress", () => {
    wrap(<FlowPanel issues={ISSUES} now={NOW} />);
    const table = screen.getByRole("table", { name: "Flow by period" });
    expect(within(table).getByText(/so far/)).toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: "Work in progress per person" })).getByText("Dan")).toBeInTheDocument();
  });

  it("can switch to months", () => {
    wrap(<FlowPanel issues={ISSUES} now={NOW} />);
    fireEvent.change(screen.getByLabelText("Group flow by"), { target: { value: "month" } });
    expect(within(screen.getByRole("table", { name: "Flow by period" })).getByText(/2026-03/)).toBeInTheDocument();
  });
});

describe("ReadinessPanel", () => {
  it("says whether a release looks safe, from its date and what is left", () => {
    wrap(<ReadinessPanel issues={ISSUES} releaseDates={new Map([["v1", "2026-03-25"]])} devDoneCounts now={NOW} />);
    const row = within(screen.getByRole("table", { name: "Release readiness" })).getByText("v1").closest("tr")!;
    expect(row).toHaveTextContent("At risk"); // 5 days out, half delivered, a bug open
    expect(row).toHaveTextContent("in 5 d");
    expect(row).toHaveTextContent("25 Mar 2026");
  });

  it("can group by milestone instead", () => {
    wrap(<ReadinessPanel issues={ISSUES} releaseDates={new Map()} devDoneCounts now={NOW} />);
    fireEvent.change(screen.getByLabelText("Group readiness by"), { target: { value: "milestone" } });
    expect(within(screen.getByRole("table", { name: "Release readiness" })).getByText("#1 Checkout")).toBeInTheDocument();
  });
});

describe("BugHealthPanel, EstimateAccuracyPanel and AwaitingQaPanel", () => {
  it("shows open bugs and who holds them", () => {
    render(<BugHealthPanel issues={ISSUES} redmineBaseUrl="https://r.test" now={NOW} />);
    expect(within(screen.getByRole("table", { name: "Open bugs per person" })).getByText("(Unassigned)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "#5" })).toBeInTheDocument();
  });

  it("shows nothing when there are no bugs", () => {
    const { container } = render(<BugHealthPanel issues={[makeIssue({ id: 1 })]} redmineBaseUrl="" now={NOW} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("compares estimates with hours on delivered tickets", () => {
    render(<EstimateAccuracyPanel issues={ISSUES} redmineBaseUrl="https://r.test" devDoneCounts />);
    const dan = within(screen.getByRole("table", { name: "Estimate accuracy per person" })).getByText("Dan").closest("tr")!;
    expect(dan).toHaveTextContent("125%"); // 5 h on a 4 h estimate
    expect(within(screen.getByRole("table", { name: "Biggest overruns" })).getByRole("link", { name: "#2" })).toBeInTheDocument();
  });

  it("explains when there is nothing to compare", () => {
    render(<EstimateAccuracyPanel issues={[makeIssue({ id: 1 })]} redmineBaseUrl="" devDoneCounts />);
    expect(screen.getByText(/nothing to compare/i)).toBeInTheDocument();
  });

  it("lists tickets waiting for QA", () => {
    render(<AwaitingQaPanel issues={ISSUES} redmineBaseUrl="https://r.test" now={NOW} />);
    const row = within(screen.getByRole("table", { name: "Waiting for QA" })).getByText("Receipt email").closest("tr")!;
    expect(row).toHaveTextContent("15 d"); // updated 5 March
  });
});
