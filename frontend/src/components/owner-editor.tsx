"use client";
import { useEffect, useState, type SubmitEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { displayError, request } from "@/lib/api";
import type { ClinicalCaseCreate } from "@/lib/types";
import { useSession } from "./session-provider";

export function OwnerEditor({ id }: { id: string }) {
  const [draft, setDraft] = useState<ClinicalCaseCreate | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const { user, loading, openLogin } = useSession();
  const router = useRouter();
  useEffect(() => { let active = true; setDraft(null); if (user) request<ClinicalCaseCreate>(`/api/v1/clinical-cases/${id}/edit`).then(data => { if (active) setDraft(data); }).catch(error => { if (active) setError(displayError(error)); }); return () => { active = false; }; }, [id,user]);
  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError("");
    const data = new FormData(event.currentTarget);
    const lines = (name: string) => String(data.get(name)).split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
    try { await request(`/api/v1/clinical-cases/${id}`, { method: "PUT", body: JSON.stringify({title:data.get("title"),vignette:data.get("vignette"),symptoms:lines("symptoms"),age_years:data.get("age") === "" ? null : Number(data.get("age")),reference_diagnosis:data.get("reference"),accepted_answers:lines("accepted")}) }); router.push(`/clinical-cases/${id}`); router.refresh(); }
    catch(error) { setError(displayError(error)); setPending(false); }
  }
  if (loading) return <p role="status">Checking sign-in status...</p>;
  if (!user) return <div className="panel"><h1>Sign in to edit your case</h1><button className="button" onClick={openLogin}>Sign in</button></div>;
  return <div className="case-page"><h1>Edit your case</h1><p>Changes are allowed only before anyone submits an answer.</p>{error && <p role="alert" className="error-message">{error}</p>}{!draft && !error && <p role="status">Loading case...</p>}{draft && <form className="panel owner-editor" onSubmit={save}><fieldset disabled={pending}><label>Title<input name="title" defaultValue={draft.title} required/></label><label>Clinical vignette<textarea name="vignette" defaultValue={draft.vignette} required/></label><label>Symptoms (one per line)<textarea name="symptoms" defaultValue={draft.symptoms.join("\n")} required/></label><label>Age<input name="age" type="number" min={0} max={120} defaultValue={draft.age_years ?? ""}/></label><label>Reference diagnosis<input name="reference" defaultValue={draft.reference_diagnosis} required/></label><label>Accepted names (one per line)<textarea name="accepted" defaultValue={draft.accepted_answers?.join("\n")}/></label><div className="account-actions"><button className="button">{pending ? "Saving..." : "Save changes"}</button><Link className="text-link" href="/account">Cancel</Link></div></fieldset></form>}</div>;
}
