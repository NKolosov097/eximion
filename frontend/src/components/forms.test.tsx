import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { AuthorForm } from "./author-form";
import { AttemptForm } from "./attempt-form";
import { messages } from "@/lib/messages";

const { push, openLogin } = vi.hoisted(() => ({ push: vi.fn(), openLogin: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("@/components/session-provider", () => ({
  useSession: () => ({ user: { id: "learner-id", username: "learner" }, loading: false, refresh: vi.fn(), openLogin }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const draft = {
  title: "Fever and cough",
  vignette: "A synthetic patient reports fever and dry cough.",
  symptoms: ["Fever", "Dry cough"],
  age_years: 28,
};
const extraction = { draft, warnings: ["Review the draft."] };
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

async function extractDraft() {
  expect(screen.getByTestId("author-source-text")).toBe(
    screen.getByLabelText(messages.sourceLabel),
  );
  fireEvent.change(screen.getByTestId("author-source-text"), {
    target: { value: "A synthetic patient reports fever and dry cough." },
  });
  fireEvent.change(screen.getByTestId("author-key"), {
    target: { value: "test-author-key" },
  });
  expect(screen.getByTestId("author-draft-empty")).toBeTruthy();
  fireEvent.click(screen.getByTestId("author-extract-submit"));
  expect(
    screen.getByTestId("author-extract-form").getAttribute("aria-busy"),
  ).toBe("true");
  await screen.findByTestId("author-draft-title");
  expect(
    screen.getByTestId("author-extract-form").getAttribute("aria-busy"),
  ).toBe("false");
  expect(screen.queryByTestId("author-draft-empty")).toBeNull();
}

describe("author workflow", () => {
  it("requires a fresh review after any draft or reference edit", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(extraction)));
    render(<AuthorForm />);
    await extractDraft();
    for (const [selector, label] of [
      ["author-key", messages.keyLabel],
      ["author-draft-title", messages.titleLabel],
      ["author-draft-vignette", messages.vignetteLabel],
      ["author-draft-symptoms", messages.symptomsLabel],
      ["author-draft-age", messages.ageLabel],
      ["author-reference-diagnosis", messages.referenceLabel],
      ["author-accepted-alternatives", messages.alternativesLabel],
      ["author-review-confirmation", messages.reviewedLabel],
    ])
      expect(screen.getByTestId(selector)).toBe(screen.getByLabelText(label));
    expect(
      screen.getByTestId("author-draft-warnings").getAttribute("role"),
    ).toBe("status");
    expect(
      screen.getByTestId("author-save-form").getAttribute("aria-busy"),
    ).toBe("false");
    const review = screen.getByTestId(
      "author-review-confirmation",
    ) as HTMLInputElement;
    const save = screen.getByTestId("author-save-submit") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(review);
    expect(save.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText(messages.titleLabel), {
      target: { value: "Edited title" },
    });
    expect(review.checked).toBe(false);
    expect(save.disabled).toBe(true);
    fireEvent.click(review);
    fireEvent.change(screen.getByLabelText(messages.referenceLabel), {
      target: { value: "Influenza" },
    });
    expect(review.checked).toBe(false);
  });

  it("keeps the independent reference and all edits after a failed save", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(extraction))
      .mockResolvedValueOnce(
        response(
          {
            error: {
              code: "database_unavailable",
              message: "Please try later.",
            },
          },
          503,
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<AuthorForm />);
    await extractDraft();
    fireEvent.change(screen.getByLabelText(messages.vignetteLabel), {
      target: { value: "Edited synthetic vignette." },
    });
    fireEvent.change(screen.getByLabelText(messages.referenceLabel), {
      target: { value: "Influenza" },
    });
    fireEvent.change(screen.getByLabelText(messages.alternativesLabel), {
      target: { value: "Flu\nSeasonal influenza" },
    });
    fireEvent.click(screen.getByLabelText(messages.reviewedLabel));
    fireEvent.click(screen.getByRole("button", { name: /Save case/ }));
    expect((await screen.findByTestId("author-save-error")).textContent).toBe(
      "Please try later.",
    );
    expect(
      (screen.getByLabelText(messages.vignetteLabel) as HTMLTextAreaElement)
        .value,
    ).toBe("Edited synthetic vignette.");
    expect(
      (screen.getByLabelText(messages.referenceLabel) as HTMLInputElement)
        .value,
    ).toBe("Influenza");
    expect(
      (screen.getByLabelText(messages.alternativesLabel) as HTMLTextAreaElement)
        .value,
    ).toBe("Flu\nSeasonal influenza");
    expect(push).not.toHaveBeenCalled();
    const saveOptions = fetchMock.mock.calls[1][1];
    expect(JSON.parse(saveOptions.body)).toMatchObject({
      reference_diagnosis: "Influenza",
      accepted_answers: ["Flu", "Seasonal influenza"],
      vignette: "Edited synthetic vignette.",
    });
    expect(JSON.parse(saveOptions.body)).not.toHaveProperty("source_text");
    expect(saveOptions.headers["X-Author-Key"]).toBe("test-author-key");
  });

  it("preserves an existing draft and its review if re-extraction fails", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(response(extraction))
        .mockRejectedValueOnce(new TypeError("Network failed")),
    );
    render(<AuthorForm />);
    await extractDraft();
    fireEvent.click(screen.getByLabelText(messages.reviewedLabel));
    fireEvent.click(screen.getByTestId("author-extract-submit"));
    expect(
      (await screen.findByTestId("author-extract-error")).textContent,
    ).toBe(messages.networkError);
    expect(
      (screen.getByLabelText(messages.titleLabel) as HTMLInputElement).value,
    ).toBe(draft.title);
    expect(
      (screen.getByLabelText(messages.reviewedLabel) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });

  it("asks before replacing a draft and keeps answers for a fresh review", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(extraction))
      .mockResolvedValueOnce(response(extraction));
    vi.stubGlobal("fetch", fetchMock);
    render(<AuthorForm />);
    await extractDraft();
    fireEvent.change(screen.getByLabelText(messages.referenceLabel), {
      target: { value: "Influenza" },
    });
    fireEvent.change(screen.getByLabelText(messages.alternativesLabel), {
      target: { value: "Flu" },
    });
    fireEvent.change(screen.getByTestId("author-draft-title"), {
      target: { value: "Edited title" },
    });
    fireEvent.click(screen.getByTestId("author-extract-submit"));
    expect(confirm).toHaveBeenCalledWith(messages.reextractConfirm);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((screen.getByTestId("author-draft-title") as HTMLInputElement).value).toBe("Edited title");
    expect((screen.getByLabelText(messages.referenceLabel) as HTMLInputElement).value).toBe("Influenza");
    confirm.mockImplementation(() => true);
    fireEvent.click(screen.getByTestId("author-extract-submit"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect((screen.getByTestId("author-draft-title") as HTMLInputElement).value).toBe(draft.title));
    expect((screen.getByLabelText(messages.referenceLabel) as HTMLInputElement).value).toBe("Influenza");
    expect((screen.getByLabelText(messages.alternativesLabel) as HTMLTextAreaElement).value).toBe("Flu");
    expect(screen.getByTestId("author-answers-review-hint").textContent).toBe(messages.reextractReviewHint);
    expect((screen.getByTestId("author-review-confirmation") as HTMLInputElement).checked).toBe(false);
  });

  it("navigates to the saved case after a valid reviewed submission", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(response(extraction))
        .mockResolvedValueOnce(response({ ...draft, id: "new-case-id" }, 201)),
    );
    render(<AuthorForm />);
    await extractDraft();
    expect(
      (screen.getByLabelText(messages.referenceLabel) as HTMLInputElement)
        .value,
    ).toBe("");
    fireEvent.change(screen.getByLabelText(messages.referenceLabel), {
      target: { value: "Influenza" },
    });
    fireEvent.click(screen.getByLabelText(messages.reviewedLabel));
    fireEvent.click(screen.getByRole("button", { name: /Save case/ }));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/clinical-cases/new-case-id"),
    );
  });
});

describe("diagnosis submission", () => {
  it("keeps the answer after API validation failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          response({ detail: [{ msg: "Invalid value" }] }, 422),
        ),
    );
    render(<AttemptForm caseRevision={1} caseId="case-id" />);
    expect(screen.getByTestId("attempt-diagnosis")).toBe(
      screen.getByLabelText(messages.diagnosisLabel),
    );
    fireEvent.change(screen.getByTestId("attempt-diagnosis"), {
      target: { value: "Influenza" },
    });
    fireEvent.click(screen.getByTestId("attempt-submit"));
    expect(screen.getByTestId("attempt-form").getAttribute("aria-busy")).toBe(
      "true",
    );
    expect((await screen.findByTestId("attempt-error")).textContent).toBe(
      messages.validationError,
    );
    expect(
      (screen.getByLabelText(messages.diagnosisLabel) as HTMLInputElement)
        .value,
    ).toBe("Influenza");
  });

  it("shows the returned score and clears stale feedback when the answer changes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response(
        {
          accepted_diagnoses: ["Influenza", "Flu"],
          matched_alternative_diagnoses: [],
          score: 100,
          max_score: 100,
          is_correct: true,
          feedback: "Your diagnosis matches an accepted answer.",
        },
        201,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<AttemptForm caseRevision={1} caseId="case-id" />);
    fireEvent.change(screen.getByLabelText(messages.diagnosisLabel), {
      target: { value: "FLU" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Submit diagnosis/ }));
    expect(
      (await screen.findByTestId("attempt-result")).getAttribute("role"),
    ).toBe("status");
    expect(screen.getByTestId("attempt-score").textContent).toBe("100 / 100");
    expect(screen.getByTestId("attempt-result-title").textContent).toBe(
      messages.correct,
    );
    expect(screen.getByTestId("attempt-feedback").textContent).toBe(
      "Your diagnosis matches an accepted answer.",
    );
    expect(screen.getByText(messages.correct)).toBeTruthy();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      diagnosis: "FLU",
      alternative_diagnoses: [],
      case_revision: 1,
      guest_acknowledged: false,
    });
    fireEvent.change(screen.getByLabelText(messages.diagnosisLabel), {
      target: { value: "Cold" },
    });
    expect(screen.queryByTestId("attempt-result")).toBeNull();
  });
});

describe("inline field validation", () => {
  it("rejects a short trimmed source and focuses its associated error", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<AuthorForm />);
    const source = screen.getByTestId("author-source-text");
    fireEvent.change(source, { target: { value: "                    a " } });
    fireEvent.submit(screen.getByTestId("author-extract-form"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(source.getAttribute("aria-invalid")).toBe("true");
    expect(source.getAttribute("aria-describedby")).toContain(
      screen.getByTestId("author-extract-error").id,
    );
    expect(document.activeElement).toBe(source);
  });

  it.each([
    ["author-draft-title", " "],
    ["author-draft-vignette", "a\0b"],
    ["author-draft-symptoms", "a".repeat(201)],
    ["author-draft-age", "1.5"],
    ["author-reference-diagnosis", " "],
    ["author-accepted-alternatives", "a\0b"],
  ])(
    "associates save errors with %s and preserves its input",
    async (selector, value) => {
      const fetchMock = vi.fn().mockResolvedValue(response(extraction));
      vi.stubGlobal("fetch", fetchMock);
      render(<AuthorForm />);
      await extractDraft();
      fireEvent.change(screen.getByTestId("author-reference-diagnosis"), {
        target: { value: "Flu" },
      });
      const field = screen.getByTestId(selector) as HTMLInputElement;
      fireEvent.change(field, { target: { value } });
      fireEvent.click(screen.getByTestId("author-review-confirmation"));
      fireEvent.submit(screen.getByTestId("author-save-form"));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(field.getAttribute("aria-invalid")).toBe("true");
      expect(field.getAttribute("aria-describedby")).toContain(
        screen.getByTestId("author-save-error").id,
      );
      expect(document.activeElement).toBe(field);
      expect(field.value).toBe(value);
    },
  );

  it("submits full-length emoji answers and rejects NUL without a request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        accepted_diagnoses: ["Influenza", "Flu"],
        matched_alternative_diagnoses: [],
        score: 0,
        max_score: 100,
        is_correct: false,
        feedback: "Try again.",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<AttemptForm caseRevision={1} caseId="case-id" />);
    const field = screen.getByTestId("attempt-diagnosis");
    const diagnosis = `  ${String.fromCodePoint(0x1f600).repeat(200)}  `;
    expect(field.hasAttribute("maxlength")).toBe(false);
    fireEvent.change(field, { target: { value: diagnosis } });
    fireEvent.submit(screen.getByTestId("attempt-form"));
    await screen.findByTestId("attempt-result");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).diagnosis).toBe(
      diagnosis,
    );
    fireEvent.change(field, { target: { value: "a\0b" } });
    fireEvent.submit(screen.getByTestId("attempt-form"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(field.getAttribute("aria-describedby")).toContain("attempt-error");
    expect(document.activeElement).toBe(field);
  });
});

it("associates an unauthorized extraction with the author key", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ error: { code: "unauthorized", message: messages.unauthorized } }, 401)));
  render(<AuthorForm />);
  fireEvent.change(screen.getByTestId("author-source-text"), {
    target: { value: "A synthetic patient has fever and cough." },
  });
  fireEvent.submit(screen.getByTestId("author-extract-form"));
  await screen.findByTestId("author-extract-error");
  const key = screen.getByTestId("author-key");
  expect(key.getAttribute("aria-invalid")).toBe("true");
  expect(key.getAttribute("aria-describedby")).toContain("extract-error");
  fireEvent.change(key, { target: { value: "corrected-key" } });
  expect(key.getAttribute("aria-invalid")).toBe("false");
  expect(screen.queryByTestId("author-extract-error")).toBeNull();
});


it("keeps an invalid Author key error on the form without opening account login", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(response({ error: { code: "unauthorized", message: "A valid author key is required." } }, 401))));
  render(<AuthorForm />);
  fireEvent.change(screen.getByTestId("author-source-text"), { target: { value: "A synthetic patient has fever and cough." } });
  fireEvent.submit(screen.getByTestId("author-extract-form"));
  expect((await screen.findByTestId("author-extract-error")).textContent).toContain("author key");
  expect(openLogin).not.toHaveBeenCalled();
});
