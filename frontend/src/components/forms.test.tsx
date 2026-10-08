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

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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

  it("preserves an existing draft if re-extraction fails and invalidates its review", async () => {
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
    ).toBe(false);
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
    render(<AttemptForm caseId="case-id" />);
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
          score: 100,
          max_score: 100,
          is_correct: true,
          feedback: "Your diagnosis matches an accepted answer.",
        },
        201,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<AttemptForm caseId="case-id" />);
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
    });
    fireEvent.change(screen.getByLabelText(messages.diagnosisLabel), {
      target: { value: "Cold" },
    });
    expect(screen.queryByTestId("attempt-result")).toBeNull();
  });
});
