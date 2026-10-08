"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { apiBaseUrl } from "@/lib/api";
import { messages } from "@/lib/messages";

export function SiteNav() {
  const pathname = usePathname();
  const active =
    pathname === "/"
      ? "home"
      : pathname === "/clinical-cases/new"
        ? "create"
        : pathname === "/clinical-cases" || pathname.startsWith("/clinical-cases/")
          ? "cases"
          : "";
  return (
    <nav className="site-nav" aria-label="Main navigation">
      <Link
        href="/"
        className="nav-link"
        data-testid="nav-home-link"
        aria-current={active === "home" ? "page" : undefined}
      >
        {messages.navHome}
      </Link>
      <Link
        href="/clinical-cases"
        className="nav-link"
        data-testid="nav-all-cases"
        aria-current={active === "cases" ? "page" : undefined}
      >
        {messages.navCases}
      </Link>
      <Link
        href="/clinical-cases/new"
        className="nav-link"
        data-testid="nav-create-case"
        aria-current={active === "create" ? "page" : undefined}
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
        <svg
          className="external-link-icon"
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14 3h7v7M21 3l-11 11M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" />
        </svg>
      </a>
    </nav>
  );
}
