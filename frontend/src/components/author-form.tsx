"use client";

import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { useSession } from "./session-provider";
import { useRouter } from "next/navigation";
import { ApiError, displayError, request } from "@/lib/api";
import { messages } from "@/lib/messages";
import type {
  ClinicalCase,
  ClinicalCaseCreate,
  ClinicalCaseDraft,
  ExtractionResponse,
  ExtractionRequest,
} from "@/lib/types";
import { lines } from "@/lib/text";
import { listError, textError } from "@/lib/validation";

type AuthorPendingState = "extract" | "save" | null;

export function AuthorForm() {
  const router = useRouter();
  const { user, loading: sessionLoading, openLogin } = useSession();
  const [source, setSource] = useState("");
  const [authorKey, setAuthorKey] = useState("");
  const [draft, setDraft] = useState<ClinicalCaseDraft | null>(null);
  const [symptoms, setSymptoms] = useState("");
  const [reference, setReference] = useState("");
  const [alternatives, setAlternatives] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pending, setPending] = useState<AuthorPendingState>(null);
  const [sourceInvalid, setSourceInvalid] = useState(false);
  const [saveInvalidField, setSaveInvalidField] = useState("");
  const [extractError, setExtractError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [answersNeedReview, setAnswersNeedReview] = useState(false);
  const hasUnsavedChanges = Boolean(
    source.trim() ||
      draft ||
      symptoms.trim() ||
      reference.trim() ||
      alternatives.trim(),
  );
  const mayLeave = useRef(false);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!mayLeave.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const confirmNavigation = (event: MouseEvent) => {
      if (
        mayLeave.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (!target || target.target === "_blank" || target.hasAttribute("download")) return;
      const destination = new URL(target.href);
      if (
        destination.origin !== location.origin ||
        destination.href === location.href ||
        (destination.pathname === location.pathname &&
          destination.search === location.search &&
          destination.hash !== location.hash)
      )
        return;
      if (!window.confirm(messages.unsavedChangesConfirm)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    document.addEventListener("click", confirmNavigation, true);
    window.addEventListener("beforeunload", beforeUnload);
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    // ponytail: Back prompts need Navigation API support; broaden this only if legacy browsers are required.
    const confirmBack = (event: Event) => {
      const navigateEvent = event as Event & {
        navigationType?: string;
        destination?: { sameDocument?: boolean; url?: string };
      };
      if (
        mayLeave.current ||
        !event.cancelable ||
        navigateEvent.navigationType !== "traverse" ||
        !navigateEvent.destination?.sameDocument
      )
        return;
      if (navigateEvent.destination.url) {
        const destination = new URL(navigateEvent.destination.url);
        if (
          destination.pathname === location.pathname &&
          destination.search === location.search &&
          destination.hash !== location.hash
        )
          return;
      }
      if (!window.confirm(messages.unsavedChangesConfirm)) event.preventDefault();
    };
    navigation?.addEventListener("navigate", confirmBack);
    return () => {
      document.removeEventListener("click", confirmNavigation, true);
      window.removeEventListener("beforeunload", beforeUnload);
      navigation?.removeEventListener("navigate", confirmBack);
    };
  }, [hasUnsavedChanges]);

  function editDraft(patch: Partial<ClinicalCaseDraft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setReviewed(false);
  }

  async function extract(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || sessionLoading) return;
    if (!user) { openLogin(); return; }
    const validation = textError(source, 20, 20000, false);
    setSourceInvalid(Boolean(validation));
    if (validation) {
      setExtractError(validation);
      event.currentTarget
        .querySelector<HTMLTextAreaElement>("#source-text")
        ?.focus();
      return;
    }
    if (draft && !window.confirm(messages.reextractConfirm)) return;
    setPending("extract");
    setExtractError("");
    const body: ExtractionRequest = { source_text: source };
    try {
      const result = await request<ExtractionResponse>(
        "/api/v1/clinical-cases/extract",
        {
          method: "POST",
          headers: { "X-Author-Key": authorKey },
          body: JSON.stringify(body),
        },
      );
      setDraft(result.draft);
      setSymptoms(result.draft.symptoms.join("\n"));
      setAnswersNeedReview(Boolean(draft));
      setReviewed(false);
      setWarnings(result.warnings);
      setSaveError("");
      setSaveInvalidField("");
    } catch (error) {
      setExtractError(displayError(error));
      if (error instanceof ApiError && (error.code === "sign_in_required" || error.code === "session_expired")) openLogin();
      setSourceInvalid(error instanceof ApiError && error.status === 422);
    } finally {
      setPending(null);
    }
  }

  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError("");
    if (!draft || pending || sessionLoading) return;
    if (!user) { openLogin(); return; }
    const symptomList = lines(symptoms);
    const acceptedAnswers = lines(alternatives);
    const validation = [
      ["case-title", textError(draft.title, 1, 120)],
      ["case-vignette", textError(draft.vignette, 1, 8000)],
      ["case-symptoms", listError(symptomList, 1, messages.invalidList)],
      [
        "case-age",
        event.currentTarget.querySelector<HTMLInputElement>("#case-age")
          ?.validity.badInput ||
        (draft.age_years !== null &&
          draft.age_years !== undefined &&
          (!Number.isInteger(draft.age_years) ||
            draft.age_years < 0 ||
            draft.age_years > 120))
          ? messages.invalidAge
          : "",
      ],
      ["reference-diagnosis", textError(reference, 1, 200)],
      [
        "accepted-alternatives",
        listError(acceptedAnswers, 0, messages.invalidAlternatives),
      ],
      ["review-confirmation", reviewed ? "" : messages.reviewRequired],
    ].find(([, message]) => message);
    setSaveInvalidField(validation?.[0] ?? "");
    if (validation) {
      setSaveError(validation[1]);
      event.currentTarget
        .querySelector<HTMLElement>(`#${validation[0]}`)
        ?.focus();
      return;
    }
    setPending("save");
    const body: Omit<ClinicalCaseCreate, "guest_acknowledged"> = {
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
      mayLeave.current = true;
      router.push(`/clinical-cases/${result.id}`);
    } catch (error) {
      setSaveError(displayError(error));
      if (error instanceof ApiError && (error.code === "sign_in_required" || error.code === "session_expired")) openLogin();
      setPending(null);
    }
  }

  return (
    <div className="author-layout">
      <form
        noValidate
        className="panel source-panel"
        data-testid="author-extract-form"
        onSubmit={extract}
        aria-busy={pending === "extract"}
        aria-describedby={extractError ? "extract-error" : undefined}
      >
        {!user && !sessionLoading && <p className="guest-notice">Sign in to extract and create cases. You can enter text first; signing in keeps your work. <button type="button" className="text-link" onClick={openLogin}>Sign in without losing your work</button></p>}
        <div className="section-heading">
          <h2>{messages.sourceTitle}</h2>
          <p>{messages.sourceDescription}</p>
        </div>
        <fieldset disabled={pending !== null || sessionLoading}>
          <label htmlFor="source-text">{messages.sourceLabel}</label>
          <textarea
            id="source-text"
            data-testid="author-source-text"
            value={source}
            onChange={(event) => {
              setSource(event.target.value);
              setSourceInvalid(false);
              setExtractError("");
              setReviewed(false);
            }}
            required
            rows={10}
            placeholder={messages.sourcePlaceholder}
            aria-invalid={sourceInvalid}
            aria-describedby={`source-hint${sourceInvalid ? " extract-error" : ""}`}
          />
          <p id="source-hint" className="field-hint">
            {messages.sourceHint}
          </p>
          <label htmlFor="author-key">{messages.keyLabel}</label>
          <input
            id="author-key"
            data-testid="author-key"
            type="password"
            autoComplete="off"
            value={authorKey}
            onChange={(event) => {
              setAuthorKey(event.target.value);
              if (extractError === messages.unauthorized) setExtractError("");
              if (saveError === messages.unauthorized) setSaveError("");
            }}
            aria-invalid={
              extractError === messages.unauthorized ||
              saveError === messages.unauthorized
            }
            aria-describedby={`key-hint${extractError === messages.unauthorized ? " extract-error" : ""}${saveError === messages.unauthorized ? " save-error" : ""}`}
          />
          <p id="key-hint" className="field-hint">
            {messages.keyHint}
          </p>
          <button
            className="button full-width"
            type="submit"
            data-testid="author-extract-submit"
            aria-busy={pending === "extract"}
          >
            {pending === "extract"
              ? messages.extracting
              : draft
                ? messages.reextract
                : messages.extract}
            <span aria-hidden="true"> ✦</span>
          </button>
        </fieldset>
        {extractError && (
          <p
            id="extract-error"
            role="alert"
            className="error-message"
            data-testid="author-extract-error"
          >
            {extractError}
          </p>
        )}
      </form>
      <p className="sr-only" role="status">
        {pending === "extract"
          ? messages.extracting
          : pending === "save"
            ? messages.saving
            : draft
              ? messages.draftReady
              : ""}
      </p>
      {!draft ? (
        <section className="panel draft-empty" data-testid="author-draft-empty">
          <span className="draft-icon" aria-hidden="true">
            ≡
          </span>
          <h2>{messages.draftTitle}</h2>
          <p>{messages.draftPlaceholder}</p>
        </section>
      ) : (
        <form
          noValidate
          className="panel draft-panel"
          data-testid="author-save-form"
          onSubmit={save}
          aria-busy={pending === "save"}
          aria-describedby={saveError ? "save-error" : undefined}
          onChange={() => {
            setSaveInvalidField("");
            setSaveError("");
          }}
        >
          <fieldset disabled={pending !== null || sessionLoading}>
            <div className="section-heading">
              <h2>{messages.draftTitle}</h2>
              <p>{messages.draftDescription}</p>
            </div>
            {warnings.length > 0 && (
              <div
                className="notice"
                role="status"
                data-testid="author-draft-warnings"
              >
                {warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            )}
            <label htmlFor="case-title">{messages.titleLabel}</label>
            <input
              id="case-title"
              aria-invalid={saveInvalidField === "case-title"}
              aria-describedby={
                saveInvalidField === "case-title" ? "save-error" : undefined
              }
              data-testid="author-draft-title"
              required
              value={draft.title}
              onChange={(event) => editDraft({ title: event.target.value })}
            />
            <label htmlFor="case-vignette">{messages.vignetteLabel}</label>
            <textarea
              id="case-vignette"
              aria-invalid={saveInvalidField === "case-vignette"}
              aria-describedby={
                saveInvalidField === "case-vignette" ? "save-error" : undefined
              }
              data-testid="author-draft-vignette"
              required
              rows={5}
              value={draft.vignette}
              onChange={(event) => editDraft({ vignette: event.target.value })}
            />
            <div className="draft-field-grid">
              <div>
                <label htmlFor="case-symptoms">{messages.symptomsLabel}</label>
                <textarea
                  id="case-symptoms"
                  aria-invalid={saveInvalidField === "case-symptoms"}
                  aria-describedby={
                    saveInvalidField === "case-symptoms"
                      ? "symptoms-hint save-error"
                      : "symptoms-hint"
                  }
                  data-testid="author-draft-symptoms"
                  required
                  rows={4}
                  value={symptoms}
                  onChange={(event) => {
                    setSymptoms(event.target.value);
                    setReviewed(false);
                  }}
                />
                <p id="symptoms-hint" className="field-hint">
                  {messages.symptomsHint}
                </p>
              </div>
              <div>
                <label htmlFor="case-age">{messages.ageLabel}</label>
                <input
                  id="case-age"
                  aria-invalid={saveInvalidField === "case-age"}
                  aria-describedby={
                    saveInvalidField === "case-age"
                      ? "age-hint save-error"
                      : "age-hint"
                  }
                  data-testid="author-draft-age"
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
            {answersNeedReview && !reviewed && (
              <p className="notice" role="status" data-testid="author-answers-review-hint">
                {messages.reextractReviewHint}
              </p>
            )}
            <label htmlFor="reference-diagnosis">
              {messages.referenceLabel}
            </label>
            <input
              id="reference-diagnosis"
              aria-invalid={saveInvalidField === "reference-diagnosis"}
              aria-describedby={
                saveInvalidField === "reference-diagnosis"
                  ? "save-error"
                  : undefined
              }
              data-testid="author-reference-diagnosis"
              required
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
              aria-invalid={saveInvalidField === "accepted-alternatives"}
              aria-describedby={
                saveInvalidField === "accepted-alternatives"
                  ? "alternatives-hint save-error"
                  : "alternatives-hint"
              }
              data-testid="author-accepted-alternatives"
              rows={3}
              value={alternatives}
              onChange={(event) => {
                setAlternatives(event.target.value);
                setReviewed(false);
              }}
            />
            <p id="alternatives-hint" className="field-hint">
              {messages.alternativesHint}
            </p>
            <label className="review-check" htmlFor="review-confirmation">
              <input
                id="review-confirmation"
                aria-invalid={saveInvalidField === "review-confirmation"}
                aria-describedby={
                  saveInvalidField === "review-confirmation"
                    ? "save-error"
                    : undefined
                }
                data-testid="author-review-confirmation"
                type="checkbox"
                checked={reviewed}
                onChange={(event) => setReviewed(event.target.checked)}
                required
              />
              <span>{messages.reviewedLabel}</span>
            </label>
            <p className="field-hint">{messages.reviewHint}</p>
            {saveError && (
              <p
                id="save-error"
                role="alert"
                className="error-message"
                data-testid="author-save-error"
              >
                {saveError}
              </p>
            )}
            <p className="field-hint">{user ? `This case will be saved to ${user.username}'s profile.` : "Sign in to save your case. Your entered fields will stay here."}</p>
            <p className="field-hint">Signing in links this case to your profile; the Author key is still required. You can edit or hide your own cases. Previous answers keep their original case and score.</p>
            <div className="save-actions">
              <button
                className="button"
                type="submit"
                disabled={!reviewed || sessionLoading}
                data-testid="author-save-submit"
              >
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
