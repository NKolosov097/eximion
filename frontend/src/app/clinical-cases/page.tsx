import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { notFound } from "next/navigation";
import { apiBaseUrl } from "@/lib/api";
import { messages } from "@/lib/messages";
import type { ClinicalCasePage } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: messages.back };

interface CatalogPageProps {
  searchParams: Promise<{ page?: string | string[]; q?: string | string[] }>;
}

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const { page: value, q: rawQuery } = await searchParams;
  if (value !== undefined && (typeof value !== "string" || !/^[1-9]\d{0,6}$/.test(value)))
    notFound();
  if (rawQuery !== undefined && (typeof rawQuery !== "string" || rawQuery.includes("\0")))
    notFound();
  const page = Number(value ?? "1");
  const query = rawQuery?.trim() ?? "";
  if (Array.from(query).length > 200) notFound();
  if (page > 1_000_000) notFound();
  const baseUrl = (process.env.API_INTERNAL_URL || apiBaseUrl()).replace(/\/$/, "");
  const params = new URLSearchParams({ page: String(page), page_size: "20" });
  if (query) params.set("q", query);
  const response = await fetch(`${baseUrl}/api/v1/clinical-cases?${params}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(messages.unavailable);
  const cases: ClinicalCasePage = await response.json();

  return (
    <div className="case-page" data-testid="case-catalog">
      <div className="page-heading">
        <h1>{messages.back}</h1>
        <p className="lead">{messages.catalogDescription}</p>
      </div>
      <Form key={query} action="/clinical-cases" className="catalog-search">
        <div className="catalog-search-field">
          <label htmlFor="case-search">{messages.searchLabel}</label>
          <input
            id="case-search"
            type="search"
            name="q"
            placeholder={messages.searchPlaceholder}
            defaultValue={query}
          />
        </div>
        <button className="button" type="submit">{messages.search}</button>
        {query && <Link className="text-link" href="/clinical-cases">{messages.clearSearch}</Link>}
      </Form>
      {cases.items.length === 0 ? (
        <div className="panel" data-testid={query && page === 1 ? "catalog-search-empty" : "catalog-empty"}>
          <p>{query && page === 1 ? messages.catalogSearchEmpty : page === 1 ? messages.catalogEmpty : messages.catalogPageEmpty}</p>
          {!(query && page === 1) && (
            <Link className="button" href={page === 1 ? "/clinical-cases/new" : query ? `/clinical-cases?${new URLSearchParams({ q: query })}` : "/clinical-cases"}>
              {page === 1 ? messages.create : messages.firstPage}
            </Link>
          )}
        </div>
      ) : (
        <ul className="catalog-list">
          {cases.items.map((clinicalCase) => (
            <li className="panel" key={clinicalCase.id} data-testid="catalog-case">
              <h2><Link className="text-link" href={`/clinical-cases/${clinicalCase.id}`}>{clinicalCase.title}</Link></h2>
              <p className="catalog-summary">{Array.from(clinicalCase.vignette).slice(0, 240).join("")}{Array.from(clinicalCase.vignette).length > 240 ? "..." : ""}</p>
              <span className="age-badge">{messages.age}: {clinicalCase.age_years == null ? messages.ageUnknown : `${clinicalCase.age_years} ${messages.years}`}</span>
            </li>
          ))}
        </ul>
      )}
      {(page > 1 || cases.has_more) && (
        <nav className="catalog-pagination" aria-label={messages.pagination}>
          {page > 1 && <Link className="button button-secondary" href={`/clinical-cases?${new URLSearchParams({ page: String(page - 1), ...(query ? { q: query } : {}) })}`}>{messages.previous}</Link>}
          <span aria-current="page">{messages.pageNumber(page)}</span>
          {cases.has_more && <Link className="button button-secondary" href={`/clinical-cases?${new URLSearchParams({ page: String(page + 1), ...(query ? { q: query } : {}) })}`}>{messages.next}</Link>}
        </nav>
      )}
    </div>
  );
}
