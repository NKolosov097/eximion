"use client";

import { useEffect, useState, type SubmitEvent } from "react";
import { useRouter } from "next/navigation";
import { GuestSubmissionNotice } from "@/components/guest-submission-notice";
import { useSession } from "@/components/session-provider";
import { ApiError, displayError, request } from "@/lib/api";
import { messages } from "@/lib/messages";
import type { AttemptCreate, AttemptResult } from "@/lib/types";
import { lines } from "@/lib/text";
import { listError, textError } from "@/lib/validation";

interface AttemptFormProps {
  caseId: string;
  caseRevision: number;
}

export function AttemptForm({ caseId, caseRevision }: AttemptFormProps) {
  const router = useRouter();
  const { user, loading } = useSession();
  const [guestAcknowledged, setGuestAcknowledged] = useState(false);
  const [alternatives, setAlternatives] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [pending, setPending] = useState(false);
  const [invalid, setInvalid] = useState("");
  const [error, setError] = useState("");
  const [staleRevision, setStaleRevision] = useState<number | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);
  useEffect(() => { setStaleRevision(null); setError(""); setResult(null); }, [caseRevision]);

  useEffect(() => {
    setGuestAcknowledged(false);
    setResult(null);
  }, [user?.id]);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (staleRevision === caseRevision || pending || loading || (!user && !guestAcknowledged)) return;
    const alternativeDiagnoses = lines(alternatives);
    const validation = [
      ["diagnosis", textError(diagnosis, 1, 200)],
      ["alternative-diagnoses", alternativeDiagnoses.length > 5
        ? messages.attemptAlternativesError
        : listError(alternativeDiagnoses, 0, messages.attemptAlternativesError)],
    ].find(([, message]) => message);
    setInvalid(validation?.[0] ?? "");
    if (validation) {
      setError(validation[1]);
      event.currentTarget
        .querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${validation[0]}`)
        ?.focus();
      return;
    }
    setPending(true);
    setError("");
    setResult(null);
    const body: Omit<AttemptCreate, "reasoning"> = {
      diagnosis,
      case_revision: caseRevision,
      guest_acknowledged: !user && guestAcknowledged,
      alternative_diagnoses: alternativeDiagnoses,
    };
    try {
      setResult(
        await request<AttemptResult>(
          `/api/v1/clinical-cases/${caseId}/attempts`,
          { method: "POST", body: JSON.stringify(body) },
        ),
      );
      router.refresh();
    } catch (error) {
      setError(displayError(error));
      if (error instanceof ApiError && error.status === 409) setStaleRevision(caseRevision);
    } finally {
      setPending(false);
    }
  }

  function clearFeedback() {
    setResult(null);
    setError("");
    setInvalid("");
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
              clearFeedback();
            }}
            required
            placeholder={messages.diagnosisPlaceholder}
            disabled={pending || loading}
            aria-invalid={invalid === "diagnosis"}
            aria-describedby={`diagnosis-hint${error ? " attempt-error" : ""}`}
          />
        </div>
        <div className="attempt-notes">
          <label htmlFor="alternative-diagnoses">{messages.attemptAlternativesLabel}</label>
          <p className="field-hint" id="alternative-diagnoses-hint">{messages.attemptAlternativesHint}</p>
          <textarea
            id="alternative-diagnoses"
            data-testid="attempt-alternatives"
            rows={3}
            value={alternatives}
            onChange={(event) => {
              setAlternatives(event.target.value);
              clearFeedback();
            }}
            disabled={pending || loading}
            aria-invalid={invalid === "alternative-diagnoses"}
            aria-describedby={`alternative-diagnoses-hint${error ? " attempt-error" : ""}`}
          />
        </div>
        <GuestSubmissionNotice
          kind="attempt"
          acknowledged={guestAcknowledged}
          onChange={setGuestAcknowledged}
          disabled={pending}
        />
        <button
          className="button"
          type="submit"
          disabled={staleRevision === caseRevision || pending || loading || (!user && !guestAcknowledged)}
          data-testid="attempt-submit"
        >
          {pending ? messages.submitting : messages.submit}
          <span aria-hidden="true"> →</span>
        </button>
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
        {staleRevision === caseRevision && <p className="field-hint">Refresh to review the current case. Your entered diagnoses will stay here. <button className="button button-secondary" type="button" onClick={() => router.refresh()}>Refresh case</button></p>}
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
              <div className="attempt-answer-key" data-testid="attempt-answer-key">
                <h3>{messages.attemptAnswerKey}</h3>
                <ul>{result.accepted_diagnoses.map((value, index) => <li key={index}>{value}</li>)}</ul>
              </div>
              {lines(alternatives).length > 0 && (
                <div className="attempt-notes-recap" data-testid="attempt-notes-recap">
                  <h3>{messages.attemptNotesTitle}</h3>
                  {lines(alternatives).length > 0 && (
                    <ul>
                      {lines(alternatives).map((value, index) => {
                        const matched = result.matched_alternative_diagnoses.includes(value);
                        return (
                          <li key={index} className={matched ? "alternative-match" : undefined} data-testid="attempt-alternative-result">
                            {value}{" "}
                            <span className="alternative-assessment">
                              {matched ? messages.attemptAcceptedMatch : messages.attemptNotAssessed}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
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
