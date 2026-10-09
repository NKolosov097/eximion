"use client";
import { useSession } from "./session-provider";

export function GuestSubmissionNotice({ acknowledged, onChange, kind, disabled = false }: { acknowledged: boolean; onChange: (value: boolean) => void; kind: "case" | "attempt"; disabled?: boolean }) {
  const { user, loading, openLogin } = useSession();
  if (loading) return <p role="status">Checking sign-in status...</p>;
  if (user) return <p className="field-hint">This {kind === "case" ? "case" : "answer"} will be saved to {user.username}'s profile.</p>;
  return <div className="guest-notice">
    <p>{kind === "case" ? "Without signing in, this is a global case. You cannot edit or archive it later." : "Without signing in, this answer will not appear in a profile."} Guest submissions cannot be added to an account later.</p>
    <button type="button" className="button button-secondary" onClick={openLogin} disabled={disabled}>Sign in without losing your work</button>
    <label className="review-check"><input type="checkbox" checked={acknowledged} onChange={(event) => onChange(event.target.checked)} disabled={disabled} /> I understand and want to submit as a guest.</label>
  </div>;
}
