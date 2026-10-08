"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { displayError, request } from "@/lib/api";
import { messages } from "@/lib/messages";
import type {
  ClinicalCase,
  ClinicalCaseCreate,
  ClinicalCaseDraft,
  ExtractionResponse,
} from "@/lib/types";

const lines = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

export function AuthorForm() {
  const router = useRouter();
  const [source, setSource] = useState("");
  const [authorKey, setAuthorKey] = useState("");
  const [draft, setDraft] = useState<ClinicalCaseDraft | null>(null);
  const [symptoms, setSymptoms] = useState("");
  const [reference, setReference] = useState("");
  const [alternatives, setAlternatives] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pending, setPending] = useState<"extract" | "save" | null>(null);
  const [extractError, setExtractError] = useState("");
  const [saveError, setSaveError] = useState("");

  function editDraft(patch: Partial<ClinicalCaseDraft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setReviewed(false);
  }

  async function extract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("extract");
    setExtractError("");
    setReviewed(false);
    try {
      const result = await request<ExtractionResponse>(
        "/api/v1/clinical-cases/extract",
        {
          method: "POST",
          headers: { "X-Author-Key": authorKey },
          body: JSON.stringify({ source_text: source }),
        },
      );
      setDraft(result.draft);
      setSymptoms(result.draft.symptoms.join("\n"));
      setWarnings(result.warnings);
      setSaveError("");
    } catch (error) {
      setExtractError(displayError(error));
    } finally {
      setPending(null);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError("");
    if (!draft || !reviewed) {
      setSaveError(messages.reviewRequired);
      return;
    }
    const symptomList = lines(symptoms);
    const acceptedAnswers = lines(alternatives);
    if (
      symptomList.length < 1 ||
      symptomList.length > 20 ||
      symptomList.some((item) => [...item].length > 200)
    ) {
      setSaveError(messages.invalidList);
      return;
    }
    if (
      acceptedAnswers.length > 20 ||
      acceptedAnswers.some((item) => [...item].length > 200)
    ) {
      setSaveError(messages.invalidAlternatives);
      return;
    }
    setPending("save");
    const body: ClinicalCaseCreate = {
      ...draft,
      symptoms: symptomList,
      reference_diagnosis: reference,
      accepted_answers: acceptedAnswers,
    };
    try {
      const result = await request<ClinicalCase>("/api/v1/clinical-cases", {
        method: "POST",
        headers: { "X-Author-Key": authorKey },
        body: JSON.stringify(body),
      });
      router.push(`/clinical-cases/${result.id}`);
    } catch (error) {
      setSaveError(displayError(error));
      setPending(null);
    }
  }

  return (
    <div className="author-layout">
      <form
        className="panel source-panel"
        onSubmit={extract}
        aria-busy={pending === "extract"}
      >
        <div className="section-heading">
          <h2>{messages.sourceTitle}</h2>
          <p>{messages.sourceDescription}</p>
        </div>
        <fieldset disabled={pending !== null}>
          <label htmlFor="source-text">{messages.sourceLabel}</label>
          <textarea
            id="source-text"
            value={source}
            onChange={(event) => {
              setSource(event.target.value);
              setReviewed(false);
            }}
            required
            minLength={20}
            maxLength={20000}
            rows={10}
            placeholder={messages.sourcePlaceholder}
            aria-describedby="source-hint"
          />
          <p id="source-hint" className="field-hint">
            {messages.sourceHint}
          </p>
          <label htmlFor="author-key">{messages.keyLabel}</label>
          <input
            id="author-key"
            type="password"
            autoComplete="off"
            value={authorKey}
            onChange={(event) => setAuthorKey(event.target.value)}
            aria-describedby="key-hint"
          />
          <p id="key-hint" className="field-hint">
            {messages.keyHint}
          </p>
          <button className="button full-width" type="submit">
            {pending === "extract"
              ? messages.extracting
              : draft
                ? messages.reextract
                : messages.extract}
            <span aria-hidden="true"> ✦</span>
          </button>
        </fieldset>
        {extractError && (
          <p role="alert" className="error-message">
            {extractError}
          </p>
        )}
      </form>
      {!draft ? (
        <section className="panel draft-empty">
          <span className="draft-icon" aria-hidden="true">
            ≡
          </span>
          <h2>{messages.draftTitle}</h2>
          <p>{messages.draftPlaceholder}</p>
        </section>
      ) : (
        <form
          className="panel draft-panel"
          onSubmit={save}
          aria-busy={pending === "save"}
        >
          <fieldset disabled={pending !== null}>
            <div className="section-heading">
              <h2>{messages.draftTitle}</h2>
              <p>{messages.draftDescription}</p>
            </div>
            {warnings.length > 0 && (
              <div className="notice" role="status">
                {warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            )}
            <label htmlFor="case-title">{messages.titleLabel}</label>
            <input
              id="case-title"
              required
              maxLength={120}
              value={draft.title}
              onChange={(event) => editDraft({ title: event.target.value })}
            />
            <label htmlFor="case-vignette">{messages.vignetteLabel}</label>
            <textarea
              id="case-vignette"
              required
              maxLength={8000}
              rows={5}
              value={draft.vignette}
              onChange={(event) => editDraft({ vignette: event.target.value })}
            />
            <div className="draft-field-grid">
              <div>
                <label htmlFor="case-symptoms">{messages.symptomsLabel}</label>
                <textarea
                  id="case-symptoms"
                  required
                  rows={4}
                  value={symptoms}
                  onChange={(event) => {
                    setSymptoms(event.target.value);
                    setReviewed(false);
                  }}
                  aria-describedby="symptoms-hint"
                />
                <p id="symptoms-hint" className="field-hint">
                  {messages.symptomsHint}
                </p>
              </div>
              <div>
                <label htmlFor="case-age">{messages.ageLabel}</label>
                <input
                  id="case-age"
                  type="number"
                  min={0}
                  max={120}
                  step={1}
                  value={draft.age_years ?? ""}
                  onChange={(event) =>
                    editDraft({
                      age_years:
                        event.target.value === ""
                          ? null
                          : Number(event.target.value),
                    })
                  }
                  aria-describedby="age-hint"
                />
                <p id="age-hint" className="field-hint">
                  {messages.ageHint}
                </p>
              </div>
            </div>
            <div className="section-heading answer-heading">
              <h2>{messages.answersTitle}</h2>
              <p>{messages.answersDescription}</p>
            </div>
            <label htmlFor="reference-diagnosis">
              {messages.referenceLabel}
            </label>
            <input
              id="reference-diagnosis"
              required
              maxLength={200}
              value={reference}
              onChange={(event) => {
                setReference(event.target.value);
                setReviewed(false);
              }}
            />
            <label htmlFor="accepted-alternatives">
              {messages.alternativesLabel}
            </label>
            <textarea
              id="accepted-alternatives"
              rows={3}
              value={alternatives}
              onChange={(event) => {
                setAlternatives(event.target.value);
                setReviewed(false);
              }}
              aria-describedby="alternatives-hint"
            />
            <p id="alternatives-hint" className="field-hint">
              {messages.alternativesHint}
            </p>
            <label className="review-check" htmlFor="review-confirmation">
              <input
                id="review-confirmation"
                type="checkbox"
                checked={reviewed}
                onChange={(event) => setReviewed(event.target.checked)}
                required
              />
              <span>{messages.reviewedLabel}</span>
            </label>
            <p className="field-hint">{messages.reviewHint}</p>
            {saveError && (
              <p role="alert" className="error-message">
                {saveError}
              </p>
            )}
            <div className="save-actions">
              <button className="button" type="submit" disabled={!reviewed}>
                {pending === "save" ? messages.saving : messages.save}
                <span aria-hidden="true"> →</span>
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </div>
  );
}
