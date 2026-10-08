import Link from "next/link";
import { messages } from "@/lib/messages";

export default function NotFound() {
  return (
    <div className="status-page">
      <p className="eyebrow">404 / {messages.appName}</p>
      <h1>{messages.notFoundTitle}</h1>
      <p>{messages.notFoundDescription}</p>
      <Link href="/" className="button">
        {messages.back}
      </Link>
    </div>
  );
}
