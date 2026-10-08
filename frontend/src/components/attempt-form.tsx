"use client";

import { useState, type SubmitEvent } from "react";
import { ApiError, displayError, request } from "@/lib/api";
import { messages } from "@/lib/messages";
import type { AttemptCreate, AttemptResult } from "@/lib/types";
import { textError } from "@/lib/validation";

interface AttemptFormProps {
  caseId: string;
}

export function AttemptForm({ caseId }: AttemptFormProps) {
  const [diagnosis, setDiagnosis] = useState("");
  const [pending, setPending] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AttemptResult | null>(null);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = textError(diagnosis, 1, 200);
    setInvalid(Boolean(validation));
    if (validation) {
      setError(validation);
      event.currentTarget
        .querySelector<HTMLInputElement>("#diagnosis")
        ?.focus();
      return;
    }
    setPending(true);
    setError("");
    setResult(null);
    const body: AttemptCreate = { diagnosis };
    try {
      setResult(
        await request<AttemptResult>(
          `/api/v1/clinical-cases/${caseId}/attempts`,
          { method: "POST", body: JSON.stringify(body) },
        ),
      );
    } catch (error) {
      setError(displayError(error));
      setInvalid(error instanceof ApiError && error.status === 422);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="panel attempt-panel">
      <form
        noValidate
        onSubmit={submit}
        aria-busy={pending}
        data-testid="attempt-form"
      >
        <label className="attempt-label" htmlFor="diagnosis">
          {messages.diagnosisLabel}
        </label>
        <p className="field-hint" id="diagnosis-hint">
          {messages.diagnosisHint}
        </p>
        <div className="attempt-input-row">
          <input
            id="diagnosis"
            data-testid="attempt-diagnosis"
            value={diagnosis}
            onChange={(event) => {
              setDiagnosis(event.target.value);
              setResult(null);
              setError("");
              setInvalid(false);
            }}
            required
            placeholder={messages.diagnosisPlaceholder}
            disabled={pending}
            aria-invalid={invalid}
            aria-describedby={`diagnosis-hint${error ? " attempt-error" : ""}`}
          />
          <button
            className="button"
            type="submit"
            disabled={pending}
            data-testid="attempt-submit"
          >
            {pending ? messages.submitting : messages.submit}
            <span aria-hidden="true"> →</span>
          </button>
        </div>
        {error && (
          <p
            id="attempt-error"
            role="alert"
            className="error-message"
            data-testid="attempt-error"
          >
            {error}
          </p>
        )}
        {result && (
          <div
            role="status"
            data-testid="attempt-result"
            className={`attempt-result ${result.is_correct ? "result-correct" : "result-incorrect"}`}
          >
            <div>
              <h3 data-testid="attempt-result-title">
                {result.is_correct ? messages.correct : messages.incorrect}
              </h3>
              <p data-testid="attempt-feedback">{result.feedback}</p>
              <p className="field-hint">{messages.another}</p>
            </div>
            <div className="score">
              <span>{messages.score}</span>
              <strong data-testid="attempt-score">
                {result.score}
                <small> / {result.max_score}</small>
              </strong>
            </div>
          </div>
        )}
      </form>
    </section>
  );
}
