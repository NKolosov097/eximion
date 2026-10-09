import { cookies } from "next/headers";
import { apiBaseUrl } from "./api";

export async function serverRequest(path: string) {
  const token = (await cookies()).get("clinical_session")?.value;
  const base = (process.env.API_INTERNAL_URL || apiBaseUrl()).replace(/\/$/, "");
  return fetch(`${base}${path}`, { cache: "no-store", headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(15000) });
}
