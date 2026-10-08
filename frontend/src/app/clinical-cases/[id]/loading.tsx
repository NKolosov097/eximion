import { messages } from "@/lib/messages";

export default function Loading() {
  return (
    <div className="status-page" role="status" data-testid="case-loading">
      <span className="loading-dot" />
      <p>{messages.loading}</p>
    </div>
  );
}
