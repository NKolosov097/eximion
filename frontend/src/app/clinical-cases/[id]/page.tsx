import Link from "next/link";
import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OwnerCaseControls } from "@/components/owner-case-controls";
import { AttemptForm } from "@/components/attempt-form";
import { apiBaseUrl } from "@/lib/api";
import { DEMO_CASE_IDS, messages } from "@/lib/messages";
import type { ClinicalCase } from "@/lib/types";

export const dynamic = "force-dynamic";

interface CasePageParams {
  id: string;
}

interface CasePageProps {
  params: Promise<CasePageParams>;
}

const getClinicalCase = cache(async (id: string): Promise<ClinicalCase> => {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    notFound();
  const baseUrl = (process.env.API_INTERNAL_URL || apiBaseUrl()).replace(
    /\/$/,
    "",
  );
  const response = await fetch(`${baseUrl}/api/v1/clinical-cases/${id}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error(messages.unavailable);
  return response.json();
});

export async function generateMetadata({ params }: CasePageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: (await getClinicalCase(id)).title };
}

export default async function CasePage({ params }: CasePageProps) {
  const { id } = await params;
  const clinicalCase = await getClinicalCase(id);

  return (
    <div className="case-page" data-testid="case-page">
      <Link href="/clinical-cases" className="back-link" data-testid="case-back-home">
        ← {messages.back}
      </Link>
      <div className="page-heading">
        <p className="eyebrow">{messages.practiceEyebrow} {DEMO_CASE_IDS.includes(clinicalCase.id) && <span className="age-badge demo-badge" data-testid="case-demo-badge">{messages.demoBadge}</span>}</p>
        <div className="case-title-row"><h1 data-testid="case-title">{clinicalCase.title}</h1><OwnerCaseControls id={clinicalCase.id} revision={clinicalCase.revision ?? 1} archived={clinicalCase.archived ?? false} /></div>
        <p className="lead">{messages.practiceDescription}</p>
      </div>
      <div className="case-layout">
        <article className="panel case-vignette">
          <div className="case-section-top">
            <h2>{messages.vignette}</h2>
            <span className="age-badge" data-testid="case-age">
              {messages.age}:{" "}
              {clinicalCase.age_years == null
                ? messages.ageUnknown
                : `${clinicalCase.age_years} ${messages.years}`}
            </span>
          </div>
          <p className="vignette-text" data-testid="case-vignette">
            {clinicalCase.vignette}
          </p>
        </article>
        <aside className="panel symptoms-panel">
          <h2>{messages.symptoms}</h2>
          <ul className="symptom-list" data-testid="case-symptoms">
            {clinicalCase.symptoms.map((symptom, index) => (
              <li key={`${index}-${symptom}`} data-testid="case-symptom">
                <span aria-hidden="true">+</span>
                {symptom}
              </li>
            ))}
          </ul>
        </aside>
      </div>
      {clinicalCase.archived ? <div className="panel"><h2>Hidden case</h2><p>This case is hidden from the catalog and is read-only. Existing answers remain in their owners' profiles.</p></div> : <AttemptForm caseId={clinicalCase.id} caseRevision={clinicalCase.revision ?? 1} />}
    </div>
  );
}
