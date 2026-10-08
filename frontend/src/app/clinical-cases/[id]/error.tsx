"use client";

import { messages } from "@/lib/messages";

export default function CaseError({ reset }: { reset: () => void }) {
  return (
    <div className="status-page">
      <p className="eyebrow">{messages.appName}</p>
      <h1>{messages.errorTitle}</h1>
      <p role="alert">{messages.unavailable}</p>
      <button className="button" onClick={reset}>
        {messages.retry}
      </button>
    </div>
  );
}
