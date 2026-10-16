import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import RefreshBar from "./RefreshBar";

const base = { lastRefreshed: null, lastFetchDurationMs: null, loading: false, onRefresh: () => {}, exportDisabled: false };

describe("RefreshBar", () => {
  it("shows the app-wide Export to Excel button by default and calls onExport", () => {
    const onExport = vi.fn();
    render(<RefreshBar {...base} onExport={onExport} />);
    fireEvent.click(screen.getByRole("button", { name: /export to excel/i }));
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("can hide the export button (the Performance tab has its own filter-aware export)", () => {
    render(<RefreshBar {...base} onExport={() => {}} showExport={false} />);
    expect(screen.queryByRole("button", { name: /export to excel/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /refresh data/i })).toBeInTheDocument();
  });
});
