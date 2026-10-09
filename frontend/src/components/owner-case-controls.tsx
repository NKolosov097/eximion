"use client";

import { CaseActions } from "./case-actions";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { displayError, request } from "@/lib/api";
import type { CaseManagement } from "@/lib/types";
import { useSession } from "./session-provider";

export function OwnerCaseControls({ id, revision, archived }: { id: string; revision: number; archived: boolean }) {
  const { user, loading } = useSession();
  const router = useRouter();
  const [permissions, setPermissions] = useState<CaseManagement | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setPermissions(null); setError("");
    if (user) request<CaseManagement>(`/api/v1/clinical-cases/${id}/management`)
      .then(data => { if (active) setPermissions(data); })
      .catch(error => { if (active) setError(displayError(error)); });
    return () => { active = false; };
  }, [id, revision, archived, user, retry]);
  async function toggleVisibility() {
    if (!archived && !confirm("Hide this case? It will leave the catalog and stop accepting answers. Existing history will be preserved.")) return;
    setPending(true); setError("");
    try {
      await request(`/api/v1/clinical-cases/${id}${archived ? "/restore" : ""}`, { method: archived ? "POST" : "DELETE" });
      setPermissions(null); router.refresh();
    } catch (error) { setError(displayError(error)); }
    finally { setPending(false); }
  }
  if (loading || !user) return null;
  return <div className="owner-case-controls">
    {permissions && (permissions.can_hide || permissions.can_restore) && <CaseActions id={id} hidden={archived} canEdit={permissions.can_edit} pending={pending} onToggle={toggleVisibility} />}
    {error && <p role="alert" className="error-message">{error} <button className="text-link" onClick={() => setRetry(value => value + 1)}>Retry case controls</button></p>}
  </div>;
}
