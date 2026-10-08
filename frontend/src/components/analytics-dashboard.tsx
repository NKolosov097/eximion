"use client";

import { useState, type FormEvent } from "react";
import { displayError, request } from "@/lib/api";
import { messages } from "@/lib/messages";
import type { AnalyticsSummary } from "@/lib/types";

type Period = "7" | "30" | "90";

export function AnalyticsDashboard() {
  const [authorKey, setAuthorKey] = useState("");
  const [days, setDays] = useState<Period>("30");
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const clearResults = () => {
    setSummary(null);
    setError("");
  };

  const loadAnalytics = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSummary(null);
    setError("");
    setPending(true);
    try {
      const result = await request<AnalyticsSummary>(
        `/api/v1/analytics?days=${days}`,
        {
          cache: "no-store",
          headers: { "X-Author-Key": authorKey },
        },
      );
      setSummary(result);
    } catch (requestError) {
      setError(displayError(requestError));
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="analytics-layout" data-testid="analytics-dashboard">
      <form className="panel analytics-controls" onSubmit={loadAnalytics}>
        <div className="section-heading">
          <h2>Author access</h2>
          <p>Analytics are private and are requested only after you submit your key.</p>
        </div>
        <label htmlFor="analytics-key">{messages.analyticsKeyLabel}</label>
        <input
          id="analytics-key"
          data-testid="analytics-key"
          type="password"
          autoComplete="off"
          required
          value={authorKey}
          onChange={(event) => {
            setAuthorKey(event.target.value);
            clearResults();
          }}
          disabled={pending}
        />
        <label htmlFor="analytics-days">{messages.analyticsPeriodLabel}</label>
        <select
          id="analytics-days"
          data-testid="analytics-days"
          value={days}
          onChange={(event) => {
            setDays(event.target.value as Period);
            clearResults();
          }}
          disabled={pending}
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
        <button className="button full-width" type="submit" data-testid="analytics-load" disabled={pending}>
          {messages.analyticsLoad}
        </button>
      </form>

      <div className="analytics-results" aria-busy={pending}>
        {pending ? (
          <div className="analytics-cards" data-testid="analytics-skeletons" aria-label={messages.analyticsLoading}>
            {[1, 2, 3].map((card) => (
              <div className="panel analytics-card" key={card} aria-hidden="true">
                <div className="skeleton-line skeleton-title" />
                <div className="skeleton-line analytics-value-skeleton" />
                <div className="skeleton-line analytics-hint-skeleton" />
              </div>
            ))}
            <p className="sr-only" role="status">{messages.analyticsLoading}</p>
          </div>
        ) : summary ? (
          <>
            <div className="analytics-cards" data-testid="analytics-cards">
              <MetricCard label={messages.analyticsCases} value={summary.case_count.toLocaleString("en-US")} />
              <MetricCard label={messages.analyticsAttempts} value={summary.attempt_count.toLocaleString("en-US")} />
              <MetricCard
                label={messages.analyticsCorrect}
                value={summary.correct_percentage === null ? "—" : `${summary.correct_percentage.toFixed(1)}%`}
                hint={summary.correct_percentage === null ? messages.analyticsNoAttempts : `${summary.correct_attempt_count.toLocaleString("en-US")} correct attempts`}
              />
            </div>
            <p className="analytics-period" data-testid="analytics-period-note">
              Rolling {summary.days}-day period in UTC: {formatDate(summary.start_at)} to {formatDate(summary.end_at)}. Repeated submissions count as separate attempts.
            </p>
          </>
        ) : error ? (
          <p className="notice analytics-message" role="alert" data-testid="analytics-error">
            {messages.analyticsError}: {error}
          </p>
        ) : (
          <p className="panel analytics-message" role="status" data-testid="analytics-initial">
            {messages.analyticsInitial}
          </p>
        )}
      </div>
    </section>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <article className="panel analytics-card">
      <h2>{label}</h2>
      <p className="analytics-value">{value}</p>
      {hint && <p className="analytics-hint">{hint}</p>}
    </article>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}
