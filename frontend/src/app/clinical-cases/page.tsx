import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { apiBaseUrl } from "@/lib/api";
import { messages } from "@/lib/messages";
import type { ClinicalCasePage } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: messages.back };

interface CatalogPageProps {
  searchParams: Promise<{ page?: string | string[] }>;
}

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const { page: value } = await searchParams;
  if (value !== undefined && (typeof value !== "string" || !/^[1-9]\d{0,6}$/.test(value)))
    notFound();
  const page = Number(value ?? "1");
  if (page > 1_000_000) notFound();
  const baseUrl = (process.env.API_INTERNAL_URL || apiBaseUrl()).replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/api/v1/clinical-cases?page=${page}&page_size=20`, {
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
      {cases.items.length === 0 ? (
        <div className="panel" data-testid="catalog-empty">
          <p>{page === 1 ? messages.catalogEmpty : messages.catalogPageEmpty}</p>
          <Link className="button" href={page === 1 ? "/clinical-cases/new" : "/clinical-cases"}>
            {page === 1 ? messages.create : messages.firstPage}
          </Link>
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
          {page > 1 && <Link className="button button-secondary" href={`/clinical-cases?page=${page - 1}`}>{messages.previous}</Link>}
          <span aria-current="page">{messages.pageNumber(page)}</span>
          {cases.has_more && <Link className="button button-secondary" href={`/clinical-cases?page=${page + 1}`}>{messages.next}</Link>}
        </nav>
      )}
    </div>
  );
}
