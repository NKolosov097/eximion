import Link from "next/link";
import { messages } from "@/lib/messages";

export default function NotFound() {
  return (
    <div className="status-page" data-testid="case-not-found">
      <p className="eyebrow">404 / {messages.appName}</p>
      <h1>{messages.notFoundTitle}</h1>
      <p>{messages.notFoundDescription}</p>
      <Link href="/" className="button" data-testid="case-not-found-home">
        {messages.back}
      </Link>
    </div>
  );
}
