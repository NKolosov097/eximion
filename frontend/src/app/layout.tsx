import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
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
          <SiteNav />
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
