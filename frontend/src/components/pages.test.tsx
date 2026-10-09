import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import CatalogPage from "@/app/clinical-cases/page";
import CatalogError from "@/app/clinical-cases/error";
import HomePage from "@/app/page";
import RootLayout from "@/app/layout";
import NewCasePage from "@/app/clinical-cases/new/page";
import CasePage from "@/app/clinical-cases/[id]/page";
import Loading from "@/app/clinical-cases/[id]/loading";
import CaseError from "@/app/clinical-cases/[id]/error";
import NotFound from "@/app/not-found";
import { DEMO_CASE_ID, messages } from "@/lib/messages";

const { currentPath } = vi.hoisted(() => ({ currentPath: { value: "/" } }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => currentPath.value,
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
      ["nav-home-link", "/"],
      ["footer-github", "https://github.com/NKolosov097"],
      ["nav-all-cases", "/clinical-cases"],
      ["nav-create-case", "/clinical-cases/new"],
      ["nav-analytics", "/analytics"],
    ]) {
      expect(
        document
          .querySelector(`[data-testid="${selector}"]`)
          ?.getAttribute("href"),
      ).toBe(target);
    }
    const docs = document.querySelector('[data-testid="nav-docs"]');
    expect(document.querySelector('[data-testid="nav-home-link"]')?.getAttribute("aria-current")).toBe("page");
    expect(document.querySelector('[data-testid="nav-all-cases"]')?.hasAttribute("aria-current")).toBe(false);
    expect(docs?.getAttribute("href")).toMatch(/\/docs$/);
    expect(docs?.getAttribute("target")).toBe("_blank");
    expect(docs?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(docs?.getAttribute("aria-label")).toBe(messages.docsLabel);
    expect(docs?.querySelector("svg")).toBeTruthy();
    render(<NewCasePage />);
    expect(screen.getByTestId("author-page-title").textContent).toBe(
      messages.newTitle,
    );
  });

  it("marks the current section on home, catalog, detail, and author routes", async () => {
    const { SiteNav } = await import("@/components/site-nav");
    for (const [routePath, current] of [
      ["/", "nav-home-link"],
      ["/clinical-cases", "nav-all-cases"],
      [`/clinical-cases/${DEMO_CASE_ID}`, "nav-all-cases"],
      ["/clinical-cases/new", "nav-create-case"],
      ["/analytics", "nav-analytics"],
    ]) {
      currentPath.value = routePath;
      const view = render(<SiteNav />);
      expect(view.container.querySelector('[aria-current="page"]')?.getAttribute("data-testid")).toBe(current);
      view.unmount();
    }
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
    expect(page.getByTestId("case-back-home").getAttribute("href")).toBe("/clinical-cases");
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
    const reload = vi.fn();
    vi.stubGlobal("window", { location: { reload } });
    const loading = render(<Loading />);
    expect(screen.getByTestId("case-loading").getAttribute("role")).toBe(
      "status",
    );
    loading.unmount();
    const error = render(<CaseError />);
    expect(screen.getByTestId("case-load-error")).toBeTruthy();
    expect(
      screen.getByTestId("case-load-error-message").getAttribute("role"),
    ).toBe("alert");
    fireEvent.click(screen.getByTestId("case-load-retry"));
    expect(reload).toHaveBeenCalledOnce();
    error.unmount();
    render(<NotFound />);
    expect(screen.getByTestId("case-not-found")).toBeTruthy();
    expect(screen.getByTestId("case-not-found-home").getAttribute("href")).toBe(
      "/clinical-cases",
    );
  });
});


describe("case catalog", () => {
  it("trims and sends the search query and preserves it through pagination", async () => {
    const query = "  Dry & cough 🚑  ";
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [{ id: DEMO_CASE_ID, title: "Saved case", vignette: "Synthetic vignette", age_years: null }],
      has_more: true,
    })));
    vi.stubGlobal("fetch", fetch);
    render(await CatalogPage({ searchParams: Promise.resolve({ page: "2", q: query }) }));
    expect(screen.getByRole("link", { name: "Saved case" }).getAttribute("href")).toBe(`/clinical-cases/${DEMO_CASE_ID}`);
    const previous = new URL(screen.getByRole("link", { name: messages.previous }).getAttribute("href")!, "https://example.test");
    const next = new URL(screen.getByRole("link", { name: messages.next }).getAttribute("href")!, "https://example.test");
    expect(previous.searchParams.get("page")).toBe("1");
    expect(previous.searchParams.get("q")).toBe(query.trim());
    expect(next.searchParams.get("page")).toBe("3");
    expect(next.searchParams.get("q")).toBe(query.trim());
    expect((screen.getByLabelText(messages.searchLabel) as HTMLInputElement).value).toBe(query.trim());
    expect(screen.getByRole("link", { name: messages.clearSearch }).getAttribute("href")).toBe("/clinical-cases");
    expect(screen.getByText(`${messages.age}: ${messages.ageUnknown}`)).toBeTruthy();
    const requestedUrl = new URL(fetch.mock.calls[0][0]);
    expect(Object.fromEntries(requestedUrl.searchParams)).toEqual({ page: "2", page_size: "20", answered: "all", q: query.trim() });
    const search = screen.getByRole("searchbox", { name: messages.searchLabel });
    expect(search.closest("form")?.getAttribute("action")).toBe("/clinical-cases");
    expect(search.closest("form")?.getAttribute("method")).not.toBe("post");
  });

  it("distinguishes no search matches and offers a clear link", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], has_more: false }))));
    render(await CatalogPage({ searchParams: Promise.resolve({ q: "missing" }) }));
    expect(screen.getByTestId("catalog-search-empty").textContent).toContain(messages.catalogSearchEmpty);
    expect(screen.queryByTestId("catalog-empty")).toBeNull();
    expect(screen.getByRole("link", { name: messages.clearSearch }).getAttribute("href")).toBe("/clinical-cases");
  });

  it.each([1, 3])("offers a useful empty state on page %i", async (page) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], has_more: false }))));
    render(await CatalogPage({ searchParams: Promise.resolve({ page: String(page) }) }));
    expect(screen.getByText(page === 1 ? messages.catalogEmpty : messages.catalogPageEmpty)).toBeTruthy();
    expect(screen.queryByRole("link", { name: messages.next })).toBeNull();
    expect(screen.getByRole("link", { name: page === 1 ? messages.create : messages.firstPage }).getAttribute("href")).toBe(page === 1 ? "/clinical-cases/new" : "/clinical-cases?answered=all");
  });

  it.each(["0", "-1", "x", "1000001", ["1", "2"]])("rejects invalid page %s before fetching", async (page) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(CatalogPage({ searchParams: Promise.resolve({ page }) })).rejects.toThrow("not-found");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([{ q: ["a", "b"] }, { q: "bad\0query" }, { q: String.fromCodePoint(0x1f600).repeat(201) }])("rejects invalid search query before fetching", async ({ q }) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(CatalogPage({ searchParams: Promise.resolve({ q }) })).rejects.toThrow("not-found");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("surfaces an unavailable service and retries through a fresh request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 503 })));
    await expect(CatalogPage({ searchParams: Promise.resolve({}) })).rejects.toThrow(messages.unavailable);
    const reload = vi.fn();
    vi.stubGlobal("window", { location: { reload } });
    render(<CatalogError />);
    expect(screen.getByRole("alert").textContent).toBe(messages.unavailable);
    fireEvent.click(screen.getByRole("button", { name: messages.retry }));
    expect(reload).toHaveBeenCalledOnce();
  });
});
