import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OwnerCaseControls } from "./owner-case-controls";

const session = vi.hoisted(() => ({ user: { id: "owner", username: "owner" } as { id: string; username: string } | null, loading: false }));
const refresh = vi.hoisted(() => vi.fn());
vi.mock("./session-provider", () => ({ useSession: () => session }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); session.user = { id: "owner", username: "owner" }; });

describe("owner detail actions", () => {
  it("shows edit and hide only with private owner permissions and confirms hiding", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response({ can_edit: true, can_hide: true })).mockResolvedValue(response({ archived: true }));
    vi.stubGlobal("fetch", fetch);
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true); vi.stubGlobal("confirm", confirm);
    render(<OwnerCaseControls id="case-id" revision={2} archived={false} />);
    expect((await screen.findByRole("link", { name: "Edit case" })).getAttribute("href")).toBe("/clinical-cases/case-id/edit");
    fireEvent.click(screen.getByRole("button", { name: "Hide case" }));
    expect(fetch).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Hide case" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(fetch.mock.calls[1][1].method).toBe("DELETE");
    expect(confirm.mock.calls[0][0]).toContain("Existing history will be preserved");
    expect(screen.queryByRole("link", { name: "Edit case" })).toBeNull();
  });
  it("shows failure and retains actions for retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response({ can_edit: true, can_hide: true })).mockResolvedValue(response({ error: { message: "Unavailable" } }, 503)));
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    render(<OwnerCaseControls id="case-id" revision={1} archived={false} />);
    fireEvent.click(await screen.findByRole("button", { name: "Hide case" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Unavailable");
    expect((screen.getByRole("button", { name: "Hide case" }) as HTMLButtonElement).disabled).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });
  it("does not expose controls to other users, guests or hidden cases", async () => {
    const fetch = vi.fn().mockResolvedValue(response({ can_edit: false, can_hide: false })); vi.stubGlobal("fetch", fetch);
    const view = render(<OwnerCaseControls id="case-id" revision={1} archived={false} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(screen.queryByRole("link")).toBeNull();
    session.user = null;
    view.rerender(<OwnerCaseControls id="case-id" revision={1} archived={false} />);
    expect(screen.queryByRole("button")).toBeNull();
    view.rerender(<OwnerCaseControls id="case-id" revision={1} archived={true} />);
    expect(fetch).toHaveBeenCalledOnce();
  });
});
