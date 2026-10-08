import type { Metadata } from "next";
import { AuthorForm } from "@/components/author-form";
import { messages } from "@/lib/messages";

export const metadata: Metadata = { title: messages.newTitle };

export default function NewCasePage() {
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">{messages.newEyebrow}</p>
        <h1>{messages.newTitle}</h1>
        <p className="lead">{messages.newDescription}</p>
      </div>
      <AuthorForm />
    </>
  );
}
