import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import CatalogPage from "@/app/clinical-cases/page";
import CasePage from "@/app/clinical-cases/[id]/page";
import { DEMO_CASE_IDS, messages } from "@/lib/messages";

const { serverRequest } = vi.hoisted(() => ({ serverRequest: vi.fn() }));
vi.mock("@/lib/server-api", () => ({ serverRequest }));
vi.mock("@/components/attempt-form", () => ({ AttemptForm: () => null }));
vi.mock("@/components/catalog-search", () => ({ CatalogSearch: () => null }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not-found"); } }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

const ordinaryId = "00000000-0000-4000-8000-000000000001";
const clinicalCase = (id: string) => ({
  id, title: "Reviewed cloud case 1234", vignette: "A synthetic case.", age_years: null,
  symptoms: ["Fever"], created_at: "2026-10-08T12:00:00Z", archived: false,
});

describe("canonical demonstration badge", () => {
  it("labels only the seeded case in a mixed catalog", async () => {
    serverRequest.mockResolvedValue(new Response(JSON.stringify({
      items: [clinicalCase(ordinaryId), ...DEMO_CASE_IDS.map(clinicalCase)], has_more: false,
    })));
    render(await CatalogPage({ searchParams: Promise.resolve({}) }));
    const cards = screen.getAllByTestId("catalog-case");
    expect(cards[0].querySelector('[data-testid="case-demo-badge"]')).toBeNull();
    const badge = cards[1].querySelector('[data-testid="case-demo-badge"]');
    expect(badge?.textContent).toBe(messages.demoBadge);
    expect(badge?.className).toBe("age-badge demo-badge");
    expect(screen.getAllByText(messages.demoBadge)).toHaveLength(3);
  });

  it.each([...DEMO_CASE_IDS.map(id => [id, true] as const), [ordinaryId, false] as const])("shows the detail badge for %s only when canonical", async (id, expected) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(clinicalCase(id as string)))));
    render(await CasePage({ params: Promise.resolve({ id: id as string }) }));
    const badge = screen.queryByTestId("case-demo-badge");
    expect(Boolean(badge)).toBe(expected);
    if (badge) {
      expect(badge.textContent).toBe(messages.demoBadge);
      expect(badge.className).toBe("age-badge demo-badge");
    }
    expect(screen.getByTestId("case-title").textContent).toBe("Reviewed cloud case 1234");
  });
});
