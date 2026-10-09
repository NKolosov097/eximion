import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { serverRequest } from "@/lib/server-api";
import { CatalogSearch } from "@/components/catalog-search";
import { DEMO_CASE_IDS, messages } from "@/lib/messages";
import type { ClinicalCasePage } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: messages.back };

interface CatalogPageProps {
  searchParams: Promise<{ page?: string | string[]; q?: string | string[]; answered?: string | string[] }>;
}

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const { page: value, q: rawQuery, answered = "all" } = await searchParams;
  if (value !== undefined && (typeof value !== "string" || !/^[1-9]\d{0,6}$/.test(value)))
    notFound();
  if (rawQuery !== undefined && (typeof rawQuery !== "string" || rawQuery.includes("\0")))
    notFound();
  if (typeof answered !== "string" || !["all", "answered", "unanswered"].includes(answered)) notFound();
  const page = Number(value ?? "1");
  const query = rawQuery?.trim() ?? "";
  if (Array.from(query).length > 200) notFound();
  if (page > 1_000_000) notFound();
  const params = new URLSearchParams({ page: String(page), page_size: "20" });
  if (query) params.set("q", query);
  params.set("answered", answered);
  const response = await serverRequest(`/api/v1/clinical-cases?${params}`);
  if (response.status === 401) return <div className="panel"><h1>Sign in to see your answers</h1><Link href="/account" className="button">Sign in</Link><Link href="/clinical-cases" className="text-link">Show all cases</Link></div>;
  if (!response.ok) throw new Error(messages.unavailable);
  const cases: ClinicalCasePage = await response.json();

  return (
    <div className="case-page" data-testid="case-catalog">
      <div className="page-heading">
        <h1>{messages.back}</h1>
        <p className="lead">{messages.catalogDescription}</p>
      </div>
      <CatalogSearch query={query} answered={answered} page={page} />
      {cases.items.length === 0 ? (
        <div className="panel" data-testid={query && page === 1 ? "catalog-search-empty" : "catalog-empty"}>
          <p>{page === 1 && answered !== "all" ? "No cases match your answer filter." : query && page === 1 ? messages.catalogSearchEmpty : page === 1 ? messages.catalogEmpty : messages.catalogPageEmpty}</p>
          {!(query && page === 1) && (
            <Link className="button" href={page === 1 ? "/clinical-cases/new" : `/clinical-cases?${new URLSearchParams({ answered, ...(query ? { q: query } : {}) })}`}>
              {page === 1 ? messages.create : messages.firstPage}
            </Link>
          )}
        </div>
      ) : (
        <ul className="catalog-list">
          {cases.items.map((clinicalCase) => (
            <li className="panel" key={clinicalCase.id} data-testid="catalog-case">
              {clinicalCase.latest_score != null && <p className="age-badge">Answered - Latest score: {clinicalCase.latest_score} / 100</p>}
              <h2><Link className="text-link" href={`/clinical-cases/${clinicalCase.id}`}>{clinicalCase.title}</Link>{DEMO_CASE_IDS.includes(clinicalCase.id) && <span className="age-badge demo-badge" data-testid="case-demo-badge">{messages.demoBadge}</span>}</h2>
              <p className="catalog-summary">{Array.from(clinicalCase.vignette).slice(0, 240).join("")}{Array.from(clinicalCase.vignette).length > 240 ? "..." : ""}</p>
              <span className="age-badge">{messages.age}: {clinicalCase.age_years == null ? messages.ageUnknown : `${clinicalCase.age_years} ${messages.years}`}</span>
            </li>
          ))}
        </ul>
      )}
      {(page > 1 || cases.has_more) && (
        <nav className="catalog-pagination" aria-label={messages.pagination}>
          {page > 1 && <Link className="button button-secondary" href={`/clinical-cases?${new URLSearchParams({ page: String(page - 1), answered, ...(query ? { q: query } : {}) })}`}>{messages.previous}</Link>}
          <span aria-current="page">{messages.pageNumber(page)}</span>
          {cases.has_more && <Link className="button button-secondary" href={`/clinical-cases?${new URLSearchParams({ page: String(page + 1), answered, ...(query ? { q: query } : {}) })}`}>{messages.next}</Link>}
        </nav>
      )}
    </div>
  );
}
