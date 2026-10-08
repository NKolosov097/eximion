"use client";

import { messages } from "@/lib/messages";

export default function CatalogError() {
  return (
    <div className="status-page">
      <h1>{messages.catalogError}</h1>
      <p role="alert">{messages.unavailable}</p>
      <button className="button" onClick={() => window.location.reload()}>{messages.retry}</button>
    </div>
  );
}
