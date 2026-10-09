import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { CatalogSearch } from "./catalog-search";
import { messages } from "@/lib/messages";

const { submissions, session } = vi.hoisted(() => ({ submissions: vi.fn(), session: { user: { id: "learner", username: "learner" }, loading: false } }));
vi.mock("./session-provider", () => ({ useSession: () => session }));
vi.mock("next/form", () => ({ default: ({ scroll: _scroll, onSubmit, ...props }: ComponentProps<"form"> & { scroll?: boolean }) => <form {...props} onSubmit={event => { event.preventDefault(); onSubmit?.(event); submissions(Object.fromEntries(new FormData(event.currentTarget))); }} /> }));
const input = () => screen.getByRole("searchbox", { name: messages.searchLabel }) as HTMLInputElement;
const change = (value: string) => fireEvent.change(input(), { target: { value } });
beforeEach(() => { vi.useFakeTimers(); window.history.replaceState({}, "", "/clinical-cases"); });
afterEach(() => { cleanup(); vi.useRealTimers(); submissions.mockReset(); });

describe("automatic catalog search", () => {
  it("debounces typing for 300ms, keeps the filter, and has no Search button", () => {
    render(<CatalogSearch query="" answered="answered" page={2} />);
    expect(screen.queryByRole("button", { name: messages.search })).toBeNull();
    change("f");
    act(() => vi.advanceTimersByTime(200));
    change("fever");
    act(() => vi.advanceTimersByTime(299));
    expect(submissions).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(submissions).toHaveBeenCalledExactlyOnceWith({ q: "fever", answered: "answered" });
  });
  it("submits filter changes immediately and cancels the pending text submission", () => {
    render(<CatalogSearch query="" answered="all" page={3} />);
    change("cough");
    fireEvent.change(screen.getByLabelText("My answers"), { target: { value: "unanswered" } });
    expect(submissions).toHaveBeenCalledExactlyOnceWith({ q: "cough", answered: "unanswered" });
    act(() => vi.advanceTimersByTime(400));
    expect(submissions).toHaveBeenCalledTimes(1);
  });
  it("submits Enter immediately without a second delayed request", () => {
    render(<CatalogSearch query="" answered="all" page={1} />);
    change("fever");
    fireEvent.submit(input().form!);
    expect(submissions).toHaveBeenCalledExactlyOnceWith({ q: "fever", answered: "all" });
    act(() => vi.advanceTimersByTime(400));
    expect(submissions).toHaveBeenCalledTimes(1);
  });
  it("keeps the mounted input, focus and newer text through older result props", () => {
    const view = render(<CatalogSearch query="" answered="all" page={1} />);
    input().focus();
    change("dry");
    act(() => vi.advanceTimersByTime(300));
    const field = input();
    change("dry cough");
    field.setSelectionRange(4, 4);
    view.rerender(<CatalogSearch query="dry" answered="all" page={1} />);
    expect(input()).toBe(field);
    expect(document.activeElement).toBe(field);
    expect(field.value).toBe("dry cough");
    expect(field.selectionStart).toBe(4);
    act(() => vi.advanceTimersByTime(300));
    expect(submissions).toHaveBeenLastCalledWith({ q: "dry cough", answered: "all" });
  });
  it("restores URL controls on history navigation and cancels a pending query", () => {
    render(<CatalogSearch query="dry" answered="all" page={1} />);
    change("draft never submitted");
    act(() => {
      window.history.replaceState({}, "", "/clinical-cases?q=fever&answered=answered&page=2");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(input().value).toBe("fever");
    expect((screen.getByLabelText("My answers") as HTMLSelectElement).value).toBe("answered");
    act(() => vi.advanceTimersByTime(400));
    expect(submissions).not.toHaveBeenCalled();
  });
  it("cancels scheduled queries on link navigation and unmount", () => {
    const view = render(<CatalogSearch query="fever" answered="answered" page={2} />);
    change("unfinished");
    const clear = screen.getByRole("link", { name: messages.clearSearch });
    expect(clear.getAttribute("href")).toBe("/clinical-cases?answered=answered");
    // Prevent JSDOM navigation after the component has observed the link intent.
    clear.addEventListener("click", event => event.preventDefault());
    fireEvent.click(clear);
    act(() => vi.advanceTimersByTime(400));
    expect(submissions).not.toHaveBeenCalled();
    change("another unfinished");
    view.unmount();
    act(() => vi.advanceTimersByTime(400));
    expect(submissions).not.toHaveBeenCalled();
  });
});
