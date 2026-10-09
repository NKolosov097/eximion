"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type SubmitEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError, displayError, request } from "@/lib/api";
import type { Account } from "@/lib/types";

const SessionContext = createContext<{ user: Account | null; loading: boolean; refresh: () => Promise<void>; openLogin: () => void }>({ user: null, loading: false, refresh: async () => {}, openLogin: () => {} });
export const useSession = () => useContext(SessionContext);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [register, setRegister] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const sessionVersion = useRef(0);
  async function refresh() {
    const version = ++sessionVersion.current;
    setLoading(true); setSessionError("");
    try { const result = await request<{ user: Account | null }>("/api/v1/auth/me"); if (version === sessionVersion.current) { setUser(result.user); setLoading(false); } }
    catch (error) {
      if (version !== sessionVersion.current) return;
      if (error instanceof ApiError && error.status === 401) { setUser(null); setLoading(false); }
      else setSessionError("Could not check your sign-in status. Submissions are disabled until this is resolved.");
    }
  }
  useEffect(() => { void refresh(); const expired = () => { void refresh(); }; window.addEventListener("session-expired", expired); return () => window.removeEventListener("session-expired", expired); }, []);
  async function authenticate(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setPending(true); setError("");
    try {
      const account = await request<Account>(`/api/v1/auth/${register ? "register" : "login"}`, { method: "POST", body: JSON.stringify({ username: fields.get("username"), password: fields.get("password") }) });
      sessionVersion.current++; setUser(account); setLoading(false); setSessionError(""); dialog.current?.close(); router.refresh();
    } catch (error) { setError(displayError(error)); }
    finally { setPending(false); }
  }
  function openLogin() { setError(""); dialog.current?.showModal(); }
  return <SessionContext.Provider value={{ user, loading, refresh, openLogin }}>
    {sessionError && <div className="guest-notice" role="alert">{sessionError} <button type="button" className="text-link" onClick={() => void refresh()}>Retry sign-in check</button></div>}
    {children}
    <dialog ref={dialog} className="auth-dialog" aria-labelledby="auth-heading" onClose={() => { setError(""); dialog.current?.querySelector("form")?.reset(); }} onCancel={(event) => { if (pending) event.preventDefault(); }}>
      <form onSubmit={authenticate} aria-busy={pending}>
        <h2 id="auth-heading">{register ? "Create an account" : "Sign in"}</h2>
        <p>Your current case and answer stay on this page.</p>
        <label htmlFor="auth-username">Username</label>
        <input id="auth-username" name="username" autoComplete="username" pattern={register ? "[A-Za-z0-9_]{3,32}" : "[A-Za-z0-9_]{1,32}"} minLength={register ? 3 : 1} maxLength={32} required disabled={pending} />
        <p className="field-hint">3-32 letters, numbers or underscores. Not case-sensitive.</p>
        <label htmlFor="auth-password">Password</label>
        <input id="auth-password" name="password" type="password" autoComplete={register ? "new-password" : "current-password"} minLength={register ? 12 : 1} maxLength={128} required disabled={pending} />
        <p className="field-hint">12-128 characters. No email or password recovery: keep your password safe.</p>
        {error && <p role="alert" className="error-message">{error}</p>}
        <div className="account-actions">
          <button className="button" disabled={pending}>{pending ? "Please wait..." : register ? "Create account" : "Sign in"}</button>
          <button className="button button-secondary" type="button" disabled={pending} onClick={() => dialog.current?.close()}>Cancel</button>
        </div>
        <button className="text-link" type="button" disabled={pending} onClick={() => { setRegister(!register); setError(""); }}>{register ? "Already registered? Sign in" : "Need an account? Register"}</button>
      </form>
    </dialog>
  </SessionContext.Provider>;
}
