import type { NextRequest } from "next/server";
export function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    return ["https:", "http:"].includes(parsed.protocol) && parsed.host === host && parsed.origin === origin && (parsed.protocol === "https:" || /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host));
  } catch { return false; }
}

