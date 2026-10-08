import type { Metadata } from "next";
import Link from "next/link";
import { messages } from "@/lib/messages";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `${messages.appName} · ${messages.descriptor}`,
    template: "%s · Eximion",
  },
  description: messages.homeDescription,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link" data-testid="skip-to-content">
          {messages.skip}
        </a>
        <header className="site-header">
          <Link
            href="/"
            className="brand"
            aria-label={messages.home}
            data-testid="nav-home"
          >
            <span className="brand-mark" aria-hidden="true">
              e
            </span>
            {messages.appName}
            <span className="brand-description">{messages.descriptor}</span>
          </Link>
          <Link
            href="/clinical-cases/new"
            className="nav-link"
            data-testid="nav-create-case"
          >
            {messages.create}
            <span aria-hidden="true"> ↗</span>
          </Link>
        </header>
        <main id="main" className="main-shell">
          {children}
        </main>
        <footer className="site-footer">
          <span>
            {messages.appName} / {messages.descriptor}
          </span>
          <p>{messages.disclaimer}</p>
        </footer>
      </body>
    </html>
  );
}
