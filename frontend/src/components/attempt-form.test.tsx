import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AttemptForm } from "./attempt-form";
import { messages } from "@/lib/messages";

const session = vi.hoisted(() => ({
  user: { id: "learner-id", username: "learner" } as { id: string; username: string } | null,
  loading: false,
  refresh: vi.fn(),
  openLogin: vi.fn(),
}));
vi.mock("@/components/session-provider", () => ({ useSession: () => session }));
const { refreshRoute } = vi.hoisted(() => ({ refreshRoute: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: refreshRoute }) }));

const result = { accepted_diagnoses: ["Influenza", "Flu"], matched_alternative_diagnoses: ["Influenza"], score: 0, max_score: 100, is_correct: false, feedback: "Your diagnosis does not match an accepted answer." };
const response = (body: unknown, status = 201) => new Response(JSON.stringify(body), { status });
const fill = (id: string, value: string) => fireEvent.change(screen.getByTestId(id), { target: { value } });
const fillAnswer = () => {
  fill("attempt-diagnosis", "Cold");
  fill("attempt-alternatives", " Influenza \n Pneumonia ");
  fill("attempt-reasoning", " Fever and cough suggest an infection. ");
};

beforeEach(() => {
  session.user = { id: "learner-id", username: "learner" };
  session.loading = false;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("richer learner answer", () => {
  it("submits ungraded notes, shows only server grading and clears feedback after any edit", async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(response(result)));
    vi.stubGlobal("fetch", fetch);
    render(<AttemptForm caseId="case-id" />);
    fillAnswer();
    expect(screen.queryByTestId("attempt-answer-key")).toBeNull();
    fireEvent.submit(screen.getByTestId("attempt-form"));
    await screen.findByTestId("attempt-result");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      diagnosis: "Cold", alternative_diagnoses: ["Influenza", "Pneumonia"],
      reasoning: "Fever and cough suggest an infection.", guest_acknowledged: false,
    });
    expect(screen.getByTestId("attempt-score").textContent).toBe("0 / 100");
    expect(refreshRoute).toHaveBeenCalledOnce();
    expect(screen.getByTestId("attempt-answer-key").textContent).toContain("Influenza");
    expect(screen.getByTestId("attempt-answer-key").textContent).toContain("Flu");
    const alternatives = screen.getAllByTestId("attempt-alternative-result");
    expect(alternatives[0].textContent).toContain(messages.attemptAcceptedMatch);
    expect(alternatives[0].className).toBe("alternative-match");
    expect(alternatives[1].textContent).toContain("Pneumonia");
    expect(alternatives[1].textContent).toContain(messages.attemptNotAssessed);
    expect(alternatives[1].className).toBe("");

    expect(screen.getByTestId("attempt-notes-recap").textContent).toContain("Influenza");
    expect(screen.getByTestId("attempt-notes-recap").textContent).toContain(messages.attemptNotesTitle);
    fill("attempt-alternatives", "Flu");
    expect(screen.queryByTestId("attempt-result")).toBeNull();
    fireEvent.submit(screen.getByTestId("attempt-form"));
    await screen.findByTestId("attempt-result");
    fill("attempt-reasoning", "Different reasoning");
    expect(screen.queryByTestId("attempt-result")).toBeNull();
  });

  it.each([
    ["attempt-alternatives", "A\nB\nC\nD\nE\nF"],
    ["attempt-alternatives", "a".repeat(201)],
    ["attempt-alternatives", "a\0b"],
    ["attempt-reasoning", "a".repeat(2001)],
    ["attempt-reasoning", "a\0b"],
  ])("focuses invalid %s and preserves input", (id, value) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<AttemptForm caseId="case-id" />);
    fillAnswer();
    fill(id, value);
    fireEvent.submit(screen.getByTestId("attempt-form"));
    const field = screen.getByTestId(id) as HTMLTextAreaElement;
    expect(fetch).not.toHaveBeenCalled();
    expect(field.value).toBe(value);
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(field.getAttribute("aria-describedby")).toContain("attempt-error");
    expect(document.activeElement).toBe(field);
  });

  it("accepts full Unicode boundaries and five alternatives", async () => {
    const fetch = vi.fn().mockResolvedValue(response(result));
    vi.stubGlobal("fetch", fetch);
    render(<AttemptForm caseId="case-id" />);
    fill("attempt-diagnosis", "Cold");
    const emoji = String.fromCodePoint(0x1f600);
    fill("attempt-alternatives", Array(5).fill(emoji.repeat(200)).join("\n"));
    fill("attempt-reasoning", ` ${emoji.repeat(2000)} `);
    fireEvent.submit(screen.getByTestId("attempt-form"));
    await screen.findByTestId("attempt-result");
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.alternative_diagnoses).toHaveLength(5);
    expect([...body.alternative_diagnoses[0]]).toHaveLength(200);
    expect([...body.reasoning]).toHaveLength(2000);
  });

  it("disables all inputs while pending and keeps all fields after failure", async () => {
    let complete!: (value: Response) => void;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise<Response>((resolve) => { complete = resolve; })));
    render(<AttemptForm caseId="case-id" />);
    fillAnswer();
    fireEvent.submit(screen.getByTestId("attempt-form"));
    for (const id of ["attempt-diagnosis", "attempt-alternatives", "attempt-reasoning", "attempt-submit"])
      expect((screen.getByTestId(id) as HTMLInputElement).disabled).toBe(true);
    complete(response({ error: { message: "Temporary failure" } }, 503));
    await screen.findByTestId("attempt-error");
    expect(refreshRoute).not.toHaveBeenCalled();
    expect((screen.getByTestId("attempt-diagnosis") as HTMLInputElement).value).toBe("Cold");
    expect((screen.getByTestId("attempt-alternatives") as HTMLTextAreaElement).value).toBe(" Influenza \n Pneumonia ");
    expect((screen.getByTestId("attempt-reasoning") as HTMLTextAreaElement).value).toBe(" Fever and cough suggest an infection. ");
  });

  it("blocks loading and unacknowledged guests, sends explicit consent and resets it after sign-in", async () => {
    session.user = null;
    session.loading = true;
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(response(result)));
    vi.stubGlobal("fetch", fetch);
    const view = render(<AttemptForm caseId="case-id" />);
    fireEvent.submit(screen.getByTestId("attempt-form"));
    expect(fetch).not.toHaveBeenCalled();
    session.loading = false;
    view.rerender(<AttemptForm caseId="case-id" />);
    fillAnswer();
    fireEvent.submit(screen.getByTestId("attempt-form"));
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.submit(screen.getByTestId("attempt-form"));
    await screen.findByTestId("attempt-result");
    expect(JSON.parse(fetch.mock.calls[0][1].body).guest_acknowledged).toBe(true);
    session.user = { id: "learner-id", username: "learner" };
    view.rerender(<AttemptForm caseId="case-id" />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect((screen.getByTestId("attempt-diagnosis") as HTMLInputElement).value).toBe("Cold");
    expect((screen.getByTestId("attempt-alternatives") as HTMLTextAreaElement).value).toBe(" Influenza \n Pneumonia ");
    expect((screen.getByTestId("attempt-reasoning") as HTMLTextAreaElement).value).toBe(" Fever and cough suggest an infection. ");
    expect(fetch).toHaveBeenCalledTimes(1);
    session.user = null;
    view.rerender(<AttemptForm caseId="case-id" />);
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
    expect((screen.getByTestId("attempt-submit") as HTMLButtonElement).disabled).toBe(true);
  });
});
