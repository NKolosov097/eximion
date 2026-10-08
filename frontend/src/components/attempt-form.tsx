"use client";

import { useState, type FormEvent } from "react";
import { displayError, request } from "@/lib/api";
import { messages } from "@/lib/messages";
import type { AttemptCreate, AttemptResult } from "@/lib/types";

export function AttemptForm({ caseId }: { caseId: string }) {
  const [diagnosis, setDiagnosis] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AttemptResult | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="panel attempt-panel">
      <form onSubmit={submit} aria-busy={pending}>
        <label className="attempt-label" htmlFor="diagnosis">
          {messages.diagnosisLabel}
        </label>
        <p className="field-hint" id="diagnosis-hint">
          {messages.diagnosisHint}
        </p>
        <div className="attempt-input-row">
          <input
            id="diagnosis"
            value={diagnosis}
            onChange={(event) => {
              setDiagnosis(event.target.value);
              setResult(null);
            }}
            required
            maxLength={200}
            placeholder={messages.diagnosisPlaceholder}
            disabled={pending}
            aria-describedby="diagnosis-hint"
          />
          <button className="button" type="submit" disabled={pending}>
            {pending ? messages.submitting : messages.submit}
            <span aria-hidden="true"> →</span>
          </button>
        </div>
        {error && (
          <p role="alert" className="error-message">
            {error}
          </p>
        )}
        {result && (
          <div
            role="status"
            className={`attempt-result ${result.is_correct ? "result-correct" : "result-incorrect"}`}
          >
            <div>
              <h3>
                {result.is_correct ? messages.correct : messages.incorrect}
              </h3>
              <p>{result.feedback}</p>
              <p className="field-hint">{messages.another}</p>
            </div>
            <div className="score">
              <span>{messages.score}</span>
              <strong>
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
