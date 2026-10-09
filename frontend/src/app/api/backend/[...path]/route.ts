import { NextRequest, NextResponse } from "next/server";
import { sameOrigin } from "@/lib/same-origin";
import { apiBaseUrl } from "@/lib/api";

const cookieName = "clinical_session";
const allowed = /^(auth\/(me|login|register|logout)|profile|analytics|clinical-cases(\/extract|\/[0-9a-f-]{36}(\/(attempts|edit))?)?)$/;

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const target = path.join("/");
  if (!allowed.test(target)) return NextResponse.json({ error: { message: "Not found." } }, { status: 404 });
  if (request.method !== "GET" && !sameOrigin(request))
    return NextResponse.json({ error: { message: "Cross-origin requests are not allowed." } }, { status: 403 });
  const headers = new Headers({ "Content-Type": "application/json" });
  const token = request.cookies.get(cookieName)?.value;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const traceparent = request.headers.get("traceparent");
  if (traceparent) headers.set("traceparent", traceparent);
  const authorKey = request.headers.get("X-Author-Key");
  if (authorKey) headers.set("X-Author-Key", authorKey);
  const base = (process.env.API_INTERNAL_URL || apiBaseUrl()).replace(/\/$/, "");
  try {
    const upstream = await fetch(`${base}/api/v1/${target}${request.nextUrl.search}`, {
      method: request.method, headers, cache: "no-store", redirect: "error",
      body: request.method === "GET" ? undefined : await request.text(), signal: AbortSignal.timeout(60000),
    });
    const data = await upstream.json();
    const signingIn = (target === "auth/login" || target === "auth/register") && upstream.ok;
    const response = NextResponse.json(signingIn ? data.user : data, { status: upstream.status, headers: { "Cache-Control": "no-store" } });
    for (const name of ["X-Trace-ID", "Location"]) { const value = upstream.headers.get(name); if (value) response.headers.set(name, value); }
    if (signingIn) response.cookies.set(cookieName, data.session_token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 30 * 86400 });
    if ((target === "auth/logout" && upstream.ok) || (upstream.status === 401 && data.error?.code === "session_expired")) response.cookies.delete(cookieName);
    return response;
  } catch {
    return NextResponse.json({ error: { message: "The service is temporarily unavailable." } }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE };
