import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import HomePage from "@/app/page";
import RootLayout from "@/app/layout";
import NewCasePage from "@/app/clinical-cases/new/page";
import CasePage from "@/app/clinical-cases/[id]/page";
import Loading from "@/app/clinical-cases/[id]/loading";
import CaseError from "@/app/clinical-cases/[id]/error";
import NotFound from "@/app/not-found";
import { DEMO_CASE_ID, messages } from "@/lib/messages";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  notFound: () => {
    throw new Error("not-found");
  },
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("page selector contract", () => {
  it("distinguishes home actions and demo links without relying on labels", () => {
    render(<HomePage />);
    expect(screen.getByTestId("home-create-case").getAttribute("href")).toBe(
      "/clinical-cases/new",
    );
    for (const selector of [
      "home-demo-case-primary",
      "home-demo-case-banner",
    ]) {
      expect(screen.getByTestId(selector).getAttribute("href")).toBe(
        `/clinical-cases/${DEMO_CASE_ID}`,
      );
    }
  });

  it("exposes global navigation and the author page heading", () => {
    const markup = renderToStaticMarkup(
      <RootLayout>
        <span />
      </RootLayout>,
    );
    const document = new DOMParser().parseFromString(markup, "text/html");
    for (const [selector, target] of [
      ["skip-to-content", "#main"],
      ["nav-home", "/"],
      ["nav-create-case", "/clinical-cases/new"],
    ]) {
      expect(
        document
          .querySelector(`[data-testid="${selector}"]`)
          ?.getAttribute("href"),
      ).toBe(target);
    }
    render(<NewCasePage />);
    expect(screen.getByTestId("author-page-title").textContent).toBe(
      messages.newTitle,
    );
  });

  it("exposes server-rendered public case content and repeated symptom rows", async () => {
    const clinicalCase = {
      id: DEMO_CASE_ID,
      title: "Synthetic case",
      vignette: "A synthetic patient has fever and cough.",
      age_years: 28,
      symptoms: ["Fever", "Cough"],
      created_at: "2026-10-08T12:00:00Z",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(clinicalCase))),
    );
    render(await CasePage({ params: Promise.resolve({ id: DEMO_CASE_ID }) }));
    const page = within(screen.getByTestId("case-page"));
    expect(page.getByTestId("case-back-home").getAttribute("href")).toBe("/");
    expect(page.getByTestId("case-title").textContent).toBe(clinicalCase.title);
    expect(page.getByTestId("case-vignette").textContent).toBe(
      clinicalCase.vignette,
    );
    expect(page.getByTestId("case-age").textContent).toContain("28");
    expect(
      within(page.getByTestId("case-symptoms"))
        .getAllByTestId("case-symptom")
        .map((item) => item.textContent),
    ).toEqual(["+Fever", "+Cough"]);
  });

  it("keeps loading, retry, and not-found states accessible through stable selectors", () => {
    const reset = vi.fn();
    const loading = render(<Loading />);
    expect(screen.getByTestId("case-loading").getAttribute("role")).toBe(
      "status",
    );
    loading.unmount();
    const error = render(<CaseError reset={reset} />);
    expect(screen.getByTestId("case-load-error")).toBeTruthy();
    expect(
      screen.getByTestId("case-load-error-message").getAttribute("role"),
    ).toBe("alert");
    fireEvent.click(screen.getByTestId("case-load-retry"));
    expect(reset).toHaveBeenCalledOnce();
    error.unmount();
    render(<NotFound />);
    expect(screen.getByTestId("case-not-found")).toBeTruthy();
    expect(screen.getByTestId("case-not-found-home").getAttribute("href")).toBe(
      "/",
    );
  });
});
