"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { displayError, request } from "@/lib/api";
import type { Profile } from "@/lib/types";
import { useSession } from "./session-provider";

export function AccountDashboard() {
  const { user, loading, openLogin, refresh } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [page, setPage] = useState(1);
  const [casePage, setCasePage] = useState(1);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  useEffect(() => { setPage(1); setCasePage(1); }, [user?.id]);
  useEffect(() => {
    let current = true; setProfile(null); setError("");
    if (user) request<Profile>(`/api/v1/profile?page=${page}&case_page=${casePage}`).then(data => { if (current) setProfile(data); }).catch(error => { if (current) setError(displayError(error)); });
    return () => { current = false; };
  }, [user, page, casePage, revision]);
  async function logout() {
    setPending(true); setError("");
    try { await request("/api/v1/auth/logout", { method: "POST" }); setProfile(null); await refresh(); router.refresh(); }
    catch (error) { setError(displayError(error)); }
    finally { setPending(false); }
  }
  async function archive(id: string) {
    if (!confirm("Archive this case? It will leave the catalog and stop accepting answers. Existing history will be preserved.")) return;
    setPending(true); setError("");
    try { await request(`/api/v1/clinical-cases/${id}`, { method: "DELETE" }); setRevision(r => r + 1); router.refresh(); }
    catch (error) { setError(displayError(error)); }
    finally { setPending(false); }
  }
  if (loading) return <p role="status">Checking sign-in status...</p>;
  if (!user) return <div className="panel"><h1>Your learning profile</h1><p>Sign in to save answers and manage your own cases. Previous guest submissions cannot be added to your account.</p><button className="button" onClick={openLogin}>Sign in / Register</button><p className="field-hint">Username and password only. No email or password recovery.</p></div>;
  return <div className="case-page" data-testid="account-dashboard"><div className="page-heading"><h1>{user.username}'s profile</h1><p>Your answers and the cases you created while signed in.</p><button className="button button-secondary" onClick={logout} disabled={pending}>Sign out</button></div>
    {error && <div role="alert" className="error-message">{error} <button className="text-link" onClick={() => setRevision(r => r + 1)}>Retry</button></div>}
    {!profile && !error && <p role="status">Loading your profile...</p>}
    {profile && <>
      <div className="profile-stats">{[["Attempts",profile.attempt_count],["Correct",profile.correct_count],["Incorrect",profile.incorrect_count],["Points",profile.points]].map(([label,value]) => <div className="panel" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <p className="field-hint">Every submission counts separately, including repeated answers. Each attempt earns 0 or 100 points; only the primary diagnosis is graded.</p>
      <h2>Answer history</h2>
      {!profile.attempts.length && <p>No answers yet. <Link className="text-link" href="/clinical-cases">Browse cases</Link></p>}
      <ul className="profile-list">{profile.attempts.map(attempt => <li className="panel" key={attempt.id}><h3><Link className="text-link" href={`/clinical-cases/${attempt.clinical_case_id}`}>{attempt.title}</Link>{attempt.archived && " (archived)"}</h3><p>{attempt.is_correct ? "Correct" : "Incorrect"} - {attempt.score} / 100 - <time dateTime={attempt.created_at}>{new Date(attempt.created_at).toLocaleString()}</time></p><p><strong>Your diagnosis:</strong> {attempt.diagnosis}</p>{attempt.alternative_diagnoses.length > 0 && <p><strong>Alternatives:</strong> {attempt.alternative_diagnoses.join("; ")}</p>}{attempt.reasoning && <p className="vignette-text"><strong>Reasoning:</strong> {attempt.reasoning}</p>}</li>)}</ul>
      <div className="account-actions">{page>1 && <button className="button button-secondary" onClick={() => setPage(page-1)}>Previous answers</button>}{profile.has_more && <button className="button" onClick={() => setPage(page+1)}>Next answers</button>}</div>
      <h2>My cases</h2><p className="field-hint">Edit only before the first answer by anyone. Archive removes a case from the catalog and preserves its history.</p>
      {!profile.cases.length && <p>No owned cases yet.</p>}
      <ul className="profile-list">{profile.cases.map(item => <li className="panel" key={item.id}><h3><Link className="text-link" href={`/clinical-cases/${item.id}`}>{item.title}</Link>{item.archived && " (archived)"}</h3><div className="account-actions">{item.can_edit && <Link className="button button-secondary" href={`/clinical-cases/${item.id}/edit`}>Edit</Link>}{!item.archived && <button className="button button-secondary" disabled={pending} onClick={() => archive(item.id)}>Archive</button>}</div></li>)}</ul>
      <div className="account-actions">{casePage>1 && <button className="button button-secondary" onClick={() => setCasePage(casePage-1)}>Previous cases</button>}{profile.cases_has_more && <button className="button" onClick={() => setCasePage(casePage+1)}>Next cases</button>}</div>
    </>}
  </div>;
}
