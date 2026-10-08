import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { apiBaseUrl } from "@/lib/api";
import { messages } from "@/lib/messages";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `${messages.appName} · ${messages.descriptor}`,
    template: `%s · ${messages.appName}`,
  },
  description: messages.homeDescription,
};

interface RootLayoutProps {
  readonly children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
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
              c
            </span>
            {messages.appName}
            <span className="brand-description">{messages.descriptor}</span>
          </Link>
          <nav className="site-nav" aria-label="Main navigation">
            <Link href="/" className="nav-link" data-testid="nav-home-link">
              {messages.navHome}
            </Link>
            <Link href="/clinical-cases" className="nav-link" data-testid="nav-all-cases">
              {messages.navCases}
            </Link>
            <Link
              href="/clinical-cases/new"
              className="nav-link"
              data-testid="nav-create-case"
            >
              {messages.create}
            </Link>
            <a
              href={`${apiBaseUrl()}/docs`}
              className="nav-link"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={messages.docsLabel}
              data-testid="nav-docs"
            >
              {messages.docs}
              <svg className="external-link-icon" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 3h7v7M21 3l-11 11M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" />
              </svg>
            </a>
          </nav>
        </header>
        <main id="main" tabIndex={-1} className="main-shell">
          {children}
        </main>
        <footer className="site-footer">
          <div className="footer-credit">
            <span>{messages.appName} / {messages.descriptor}</span>
            <a href="https://github.com/NKolosov097" className="text-link" data-testid="footer-github">
              Nikita Kolosov on GitHub
            </a>
          </div>
          <p>{messages.disclaimer}</p>
        </footer>
      </body>
    </html>
  );
}
