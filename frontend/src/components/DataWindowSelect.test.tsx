import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DataWindowSelect from "./DataWindowSelect";
import { DEFAULT_WINDOW } from "../utils/dataWindow";

const select = () => screen.getByLabelText("Tickets updated in") as HTMLSelectElement;

describe("DataWindowSelect presets", () => {
  it("shows the current period and every option, plus a custom range", () => {
    render(<DataWindowSelect window={DEFAULT_WINDOW} onChange={() => {}} />);
    expect(select().value).toBe("30");
    expect([...select().options].map((o) => o.textContent)).toEqual([
      "Last 30 days", "Last 90 days", "Last 6 months", "Last 12 months", "All time", "Custom range…",
    ]);
  });

  it("loads straight away when a preset is chosen, 0 for all time", () => {
    const onChange = vi.fn();
    render(<DataWindowSelect window={DEFAULT_WINDOW} onChange={onChange} />);
    fireEvent.change(select(), { target: { value: "90" } });
    expect(onChange).toHaveBeenLastCalledWith({ kind: "days", days: 90 });
    fireEvent.change(select(), { target: { value: "0" } });
    expect(onChange).toHaveBeenLastCalledWith({ kind: "days", days: 0 });
  });

  it("can be disabled", () => {
    render(<DataWindowSelect window={DEFAULT_WINDOW} onChange={() => {}} disabled />);
    expect(select()).toBeDisabled();
  });
});

describe("DataWindowSelect custom range", () => {
  it("shows the date fields without loading anything until Apply is clicked", () => {
    const onChange = vi.fn();
    render(<DataWindowSelect window={DEFAULT_WINDOW} onChange={onChange} />);
    expect(screen.queryByLabelText("From")).not.toBeInTheDocument();

    fireEvent.change(select(), { target: { value: "custom" } });
    expect(screen.getByLabelText("From")).toBeInTheDocument();
    expect(screen.getByLabelText("To")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("applies the chosen from/to dates", () => {
    const onChange = vi.fn();
    render(<DataWindowSelect window={DEFAULT_WINDOW} onChange={onChange} />);
    fireEvent.change(select(), { target: { value: "custom" } });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-03-31" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onChange).toHaveBeenCalledWith({ kind: "range", from: "2026-01-01", to: "2026-03-31" });
  });

  it("will not apply a backwards range", () => {
    const onChange = vi.fn();
    render(<DataWindowSelect window={DEFAULT_WINDOW} onChange={onChange} />);
    fireEvent.change(select(), { target: { value: "custom" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-03-31" } });
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows an active range as Custom with its dates, and leaves it when a preset is picked", () => {
    const onChange = vi.fn();
    render(<DataWindowSelect window={{ kind: "range", from: "2026-01-01", to: "2026-03-31" }} onChange={onChange} />);
    expect(select().value).toBe("custom");
    expect((screen.getByLabelText("From") as HTMLInputElement).value).toBe("2026-01-01");
    expect((screen.getByLabelText("To") as HTMLInputElement).value).toBe("2026-03-31");
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled(); // nothing changed yet

    fireEvent.change(select(), { target: { value: "30" } });
    expect(onChange).toHaveBeenLastCalledWith({ kind: "days", days: 30 });
  });
});
