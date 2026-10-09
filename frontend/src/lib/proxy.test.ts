// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { sameOrigin } from "./same-origin";
import { POST } from "@/app/api/backend/[...path]/route";

afterEach(() => vi.unstubAllGlobals());

describe("same-origin session proxy", () => {
  it("uses the external Host behind Cloud Run, not the internal server URL", () => {
    expect(sameOrigin(new NextRequest("http://0.0.0.0:8080/api/backend/auth/login", { headers: { host: "frontend.run.app", origin: "https://frontend.run.app" } }))).toBe(true);
    expect(sameOrigin(new NextRequest("http://127.0.0.1:3000/api/backend/auth/login", { headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" } }))).toBe(true);
    for (const origin of ["https://evil.test", "http://frontend.run.app", "null", "https://frontend.run.app/", ""]) {
      expect(sameOrigin(new NextRequest("http://0.0.0.0:8080/test", { headers: { host: "frontend.run.app", origin } }))).toBe(false);
    }
  });

  it("rejects forged mutations before fetching", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const result = await POST(new NextRequest("http://localhost/api/backend/auth/login", { method:"POST", headers:{host:"localhost",origin:"https://evil.test"},body:"{}" }), { params:Promise.resolve({path:["auth","login"]}) });
    expect(result.status).toBe(403); expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps a session on failed logout and revokes the cookie only on success", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({error:{message:"Unavailable"}}),{status:503})).mockResolvedValueOnce(new Response(JSON.stringify({signed_out:true})));
    vi.stubGlobal("fetch",fetch);
    const call = () => POST(new NextRequest("http://localhost/api/backend/auth/logout",{method:"POST",headers:{host:"localhost",origin:"http://localhost",cookie:"clinical_session=private-token"}}),{params:Promise.resolve({path:["auth","logout"]})});
    expect((await call()).headers.get("set-cookie")).toBeNull();
    expect((await call()).headers.get("set-cookie")).toContain("clinical_session=");
    expect(fetch.mock.calls[0][1].headers.get("authorization")).toBe("Bearer private-token");
  });

  it("stores login token in HttpOnly cookie and never returns it in JSON", async () => {
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({user:{id:"id",username:"alice"},session_token:"private-token"}))));
    const result = await POST(new NextRequest("http://localhost/api/backend/auth/login",{method:"POST",headers:{host:"localhost",origin:"http://localhost"},body:"{}"}),{params:Promise.resolve({path:["auth","login"]})});
    expect(await result.json()).toEqual({id:"id",username:"alice"});
    expect(result.headers.get("set-cookie")).toContain("HttpOnly");
    expect(result.headers.get("set-cookie")).toContain("SameSite=lax");
    expect(result.headers.get("cache-control")).toBe("no-store");
  });
});
