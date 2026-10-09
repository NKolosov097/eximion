import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SiteNav } from "./site-nav";

const session = vi.hoisted(() => ({ user: { id: "learner", username: "case_learner" } as { id: string; username: string } | null, loading: false }));
vi.mock("./session-provider", () => ({ useSession: () => session }));
vi.mock("next/navigation", () => ({ usePathname: () => "/account" }));
afterEach(() => { cleanup(); session.user = { id: "learner", username: "case_learner" }; session.loading = false; });

describe("account catalog controls", () => {
  it("shows the signed-in username with an accessible profile link and no icon", () => {
    render(<SiteNav />);
    const link = screen.getByRole("link", { name: "case_learner's profile" });
    expect(link.textContent).toBe("case_learner");
    expect(link.getAttribute("href")).toBe("/account");
    expect(link.getAttribute("aria-current")).toBe("page");
    expect(link.querySelector('svg[aria-hidden="true"]')).toBeNull();
  });
  it("keeps the guest sign-in link and hides the private filter", () => {
    session.user = null;
    render(<SiteNav />);
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/account");
    expect(screen.queryByLabelText("My answers")).toBeNull();
  });
});
