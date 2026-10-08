import { afterEach, describe, expect, it, vi } from "vitest";
import { request } from "./api";
import { messages } from "./messages";

afterEach(() => vi.unstubAllGlobals());

describe("bounded API requests", () => {
  it("sets a one-minute timeout and reports it clearly", async () => {
    const timeoutSignal = new AbortController().signal;
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(timeoutSignal);
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new DOMException("", "TimeoutError"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(request("/test")).rejects.toThrow(messages.timeoutError);
    expect(timeout).toHaveBeenCalledWith(60000);
    expect(fetchMock.mock.calls[0][1].signal).toBe(timeoutSignal);
  });

  it("preserves a caller-supplied cancellation signal", async () => {
    const signal = new AbortController().signal;
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ status: "ok" })));
    vi.stubGlobal("fetch", fetchMock);
    await expect(request("/test", { signal })).resolves.toEqual({
      status: "ok",
    });
    expect(fetchMock.mock.calls[0][1].signal).toBe(signal);
  });

  it("also reports timeouts while reading the response body", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("", "TimeoutError"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockRejectedValue(new DOMException("", "AbortError")),
      }),
    );
    await expect(
      request("/test", { signal: controller.signal }),
    ).rejects.toThrow(messages.timeoutError);
  });
});
