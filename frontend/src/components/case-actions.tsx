"use client";
import Link from "next/link";

export function CaseActions({ id, hidden, canEdit, pending, onToggle }: { id: string; hidden: boolean; canEdit: boolean; pending: boolean; onToggle: () => void }) {
  const label = hidden ? "Show case" : "Hide case";
  return <div className="case-actions">
    {canEdit && <Link className="button button-secondary case-icon-button" href={`/clinical-cases/${id}/edit`} aria-label="Edit case" title="Edit case"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15Z"/></svg></Link>}
    <button className="button button-secondary case-icon-button" type="button" onClick={onToggle} disabled={pending} aria-label={label} title={label} aria-busy={pending}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>{hidden && <path d="m3 3 18 18"/>}</svg></button>
  </div>;
}
