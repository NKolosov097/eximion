import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AnalyticsDashboard } from "@/components/analytics-dashboard";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("private analytics dashboard", () => {
  it("shows no metrics before loading and clears a result when the period changes", async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({
        days: 30,
        start_at: "2026-09-08T12:00:00Z",
        end_at: "2026-10-08T12:00:00Z",
        case_count: 2,
        attempt_count: 3,
        correct_attempt_count: 1,
        correct_percentage: 33.3,
      })),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<AnalyticsDashboard />);

    expect(screen.getByTestId("analytics-initial")).toBeTruthy();
    expect(screen.queryByTestId("analytics-cards")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId("analytics-key"), {
      target: { value: "memory-only" },
    });
    fireEvent.click(screen.getByTestId("analytics-load"));
    expect(await screen.findByTestId("analytics-cards")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/backend\/analytics\?days=30$/),
      expect.objectContaining({
        cache: "no-store",
        headers: expect.objectContaining({ "X-Author-Key": "memory-only" }),
      }),
    );

    fireEvent.change(screen.getByTestId("analytics-key"), {
      target: { value: "edited-memory-only" },
    });
    expect(screen.queryByTestId("analytics-cards")).toBeNull();
    expect(screen.getByTestId("analytics-initial")).toBeTruthy();
    fireEvent.click(screen.getByTestId("analytics-load"));
    expect(await screen.findByTestId("analytics-cards")).toBeTruthy();

    fireEvent.change(screen.getByTestId("analytics-days"), {
      target: { value: "7" },
    });
    expect(screen.queryByTestId("analytics-cards")).toBeNull();
    expect(screen.getByTestId("analytics-initial")).toBeTruthy();
  });

  it("renders an empty attempt rate as a dash with an explanation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        days: 7,
        start_at: "2026-10-01T12:00:00Z",
        end_at: "2026-10-08T12:00:00Z",
        case_count: 0,
        attempt_count: 0,
        correct_attempt_count: 0,
        correct_percentage: null,
      })),
    ));
    render(<AnalyticsDashboard />);
    fireEvent.change(screen.getByTestId("analytics-key"), {
      target: { value: "memory-only" },
    });
    fireEvent.change(screen.getByTestId("analytics-days"), {
      target: { value: "7" },
    });
    fireEvent.click(screen.getByTestId("analytics-load"));
    expect(await screen.findByText("No attempts yet")).toBeTruthy();
    expect(screen.getByTestId("analytics-cards").textContent).toContain("—");
  });
});
