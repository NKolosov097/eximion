import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { SessionProvider } from "./session-provider";
import { AuthorForm } from "./author-form";
import { AttemptForm } from "./attempt-form";

const { refresh, push } = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push }) }));

const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
beforeAll(() => {
  // JSDOM lacks the native modal lifecycle; keep open/close events faithful for React.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value(this: HTMLDialogElement) { this.setAttribute("open", ""); } },
    close: { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); } },
  });
});
afterAll(() => {
  for (const [name, descriptor] of [["showModal", originalShowModal], ["close", originalClose]] as const) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

const account = { id: "00000000-0000-4000-8000-000000000123", username: "learner" };
const guestLabel = "I understand and want to submit as a guest.";
const wrongCredentials = "Invalid username or password.";
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const draft = { title: "Initial case", vignette: "Synthetic patient has a fever.", symptoms: ["Fever"], age_years: 28 };
const answerValues = {
  "attempt-diagnosis": "Influenza",
  "attempt-alternatives": "Cold\nPneumonia",
};
const authorValues = {
  "author-source-text": "A synthetic patient has fever and a persistent dry cough.",
  "author-key": "dummy-author-key",
  "author-draft-title": "Edited teaching case",
  "author-draft-vignette": "Edited synthetic vignette, preserved through sign-in.",
  "author-draft-symptoms": "Fever\nDry cough",
  "author-draft-age": "29",
  "author-reference-diagnosis": "Influenza",
  "author-accepted-alternatives": "Flu\nSeasonal influenza",
};
const fill = (id: string, value: string) => fireEvent.change(screen.getByTestId(id), { target: { value } });
async function fillForm(kind: "case" | "attempt") {
  if (kind === "case") {
    fill("author-source-text", authorValues["author-source-text"]);
    fill("author-key", authorValues["author-key"]);
    fireEvent.click(screen.getByTestId("author-extract-submit"));
    await screen.findByTestId("author-draft-title");
    for (const [id, value] of Object.entries(authorValues)) fill(id, value);
    fireEvent.click(screen.getByTestId("author-review-confirmation"));
  } else {
    for (const [id, value] of Object.entries(answerValues)) fill(id, value);
  }
}
function assertPreserved(kind: "case" | "attempt") {
  for (const [id, value] of Object.entries(kind === "case" ? authorValues : answerValues))
    expect((screen.getByTestId(id) as HTMLInputElement).value).toBe(value);
  if (kind === "case") expect((screen.getByTestId("author-review-confirmation") as HTMLInputElement).checked).toBe(true);
}
function renderForm(kind: "case" | "attempt") {
  return render(<SessionProvider>{kind === "case" ? <AuthorForm /> : <AttemptForm caseRevision={1} caseId="case-id" />}</SessionProvider>);
}

for (const kind of ["case", "attempt"] as const) {
  describe(`${kind} sign-in modal integration`, () => {
    it("preserves every field across failure, cancellation and success without submitting", async () => {
      let loginAttempts = 0;
      const fetch = vi.fn().mockImplementation((url: string, _options?: RequestInit) => {
        if (url.endsWith("/auth/me")) return Promise.resolve(reply({ user: null }));
        if (url.endsWith("/extract")) return Promise.resolve(reply({ draft, warnings: [] }));
        if (url.endsWith("/auth/login")) {
          loginAttempts++;
          return Promise.resolve(loginAttempts < 3
            ? reply({ error: { code: "invalid_credentials", message: wrongCredentials } }, 401)
            : reply(account));
        }
        if (url.endsWith("/clinical-cases") || url.endsWith("/attempts"))
          return Promise.resolve(reply({ error: { code: "session_expired", message: "Session expired. Sign in again." } }, 401));
        throw new Error(`Unexpected submission: ${url}`);
      });
      vi.stubGlobal("fetch", fetch);
      renderForm(kind);
      await waitFor(() => expect(screen.queryByText("Checking sign-in status...")).toBeNull());
      await fillForm(kind);
      fireEvent.click(screen.getByRole("checkbox", { name: guestLabel }));
      fireEvent.click(screen.getByRole("button", { name: "Sign in without losing your work" }));
      const dialog = screen.getByRole("dialog");
      for (const username of ["unknown_user", "learner"]) {
        fireEvent.change(within(dialog).getByLabelText("Username"), { target: { value: username } });
        fireEvent.change(within(dialog).getByLabelText("Password"), { target: { value: "dummy-wrong-password" } });
        fireEvent.submit(dialog.querySelector("form")!);
        expect((await within(dialog).findByRole("alert")).textContent).toBe(wrongCredentials);
        assertPreserved(kind);
        await waitFor(() => expect((within(dialog).getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(false));
      }
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).toBeNull();
      assertPreserved(kind);
      fireEvent.click(screen.getByRole("button", { name: "Sign in without losing your work" }));
      const reopened = screen.getByRole("dialog");
      expect((within(reopened).getByLabelText("Password") as HTMLInputElement).value).toBe("");
      fireEvent.change(within(reopened).getByLabelText("Username"), { target: { value: "learner" } });
      fireEvent.change(within(reopened).getByLabelText("Password"), { target: { value: "dummy-valid-password" } });
      fireEvent.submit(reopened.querySelector("form")!);
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(screen.queryByRole("checkbox", { name: guestLabel })).toBeNull();
      expect(screen.getByText(`This ${kind === "case" ? "case" : "answer"} will be saved to learner's profile.`)).toBeTruthy();
      assertPreserved(kind);
      expect(refresh).toHaveBeenCalledOnce();
      expect(push).not.toHaveBeenCalled();
      expect(fetch.mock.calls.filter(([url]) => !String(url).includes("/auth/") && !String(url).endsWith("/extract"))).toHaveLength(0);
      expect((screen.getByTestId(kind === "case" ? "author-save-submit" : "attempt-submit") as HTMLButtonElement).disabled).toBe(false);
      fireEvent.submit(screen.getByTestId(kind === "case" ? "author-save-form" : "attempt-form"));
      const guestConsent = await screen.findByRole("checkbox", { name: guestLabel });
      const submission = fetch.mock.calls.find(([url]) => String(url).endsWith("/clinical-cases") || String(url).endsWith("/attempts"));
      expect(JSON.parse(submission![1]!.body as string).guest_acknowledged).toBe(false);
      expect((guestConsent as HTMLInputElement).checked).toBe(false);
      expect((screen.getByTestId(kind === "case" ? "author-save-submit" : "attempt-submit") as HTMLButtonElement).disabled).toBe(true);
      assertPreserved(kind);
    });

    it("blocks unknown sessions until retry restores a known guest state", async () => {
      let checks = 0;
      const fetch = vi.fn().mockImplementation((url: string) => {
        if (url.endsWith("/auth/me")) {
          checks++;
          return Promise.resolve(checks === 1 ? reply({}, 503) : reply({ user: null }));
        }
        if (url.endsWith("/extract")) return Promise.resolve(reply({ draft, warnings: [] }));
        throw new Error(`Unexpected submission: ${url}`);
      });
      vi.stubGlobal("fetch", fetch);
      renderForm(kind);
      await screen.findByRole("button", { name: "Retry sign-in check" });
      await fillForm(kind);
      expect(screen.queryByRole("checkbox", { name: guestLabel })).toBeNull();
      const button = screen.getByTestId(kind === "case" ? "author-save-submit" : "attempt-submit") as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      fireEvent.submit(screen.getByTestId(kind === "case" ? "author-save-form" : "attempt-form"));
      expect(fetch.mock.calls.filter(([url]) => !String(url).includes("/auth/") && !String(url).endsWith("/extract"))).toHaveLength(0);
      fireEvent.click(screen.getByRole("button", { name: "Retry sign-in check" }));
      const consent = await screen.findByRole("checkbox", { name: guestLabel });
      expect(button.disabled).toBe(true);
      fireEvent.click(consent);
      expect(button.disabled).toBe(false);
      assertPreserved(kind);
      expect(checks).toBe(2);
    });
  });
}
