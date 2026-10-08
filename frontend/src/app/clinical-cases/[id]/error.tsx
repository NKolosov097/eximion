"use client";

import { messages } from "@/lib/messages";

export default function CaseError({ reset }: { reset: () => void }) {
  return (
    <div className="status-page" data-testid="case-load-error">
      <p className="eyebrow">{messages.appName}</p>
      <h1>{messages.errorTitle}</h1>
      <p role="alert" data-testid="case-load-error-message">
        {messages.unavailable}
      </p>
      <button className="button" onClick={reset} data-testid="case-load-retry">
        {messages.retry}
      </button>
    </div>
  );
}
