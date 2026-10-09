"use client";

import { useEffect, useRef, useState } from "react";
import Form from "next/form";
import Link from "next/link";
import { useSession } from "./session-provider";
import { messages } from "@/lib/messages";

export function CatalogSearch({ query, answered, page }: { query: string; answered: string; page: number }) {
  const { user, loading } = useSession();
  const [draft, setDraft] = useState(query);
  const [answerFilter, setAnswerFilter] = useState(answered);
  const form = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ownNavigation = useRef(false);

  function cancelScheduled() {
    clearTimeout(timer.current);
    timer.current = undefined;
  }

  useEffect(() => {
    // Our responses update results, never the newer text the learner is still typing.
    if (!ownNavigation.current) {
      cancelScheduled();
      setDraft(query);
      setAnswerFilter(answered);
    }
  }, [query, answered, page]);

  useEffect(() => {
    function restore(url: URL) {
      cancelScheduled();
      ownNavigation.current = false;
      if (url.pathname === "/clinical-cases") {
        setDraft(url.searchParams.get("q") ?? "");
        setAnswerFilter(url.searchParams.get("answered") ?? "all");
      }
    }
    const historyNavigation = () => restore(new URL(window.location.href));
    function linkNavigation(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      const url = new URL(link.href);
      if (url.origin === window.location.origin) restore(url);
    }
    window.addEventListener("popstate", historyNavigation);
    document.addEventListener("click", linkNavigation, true);
    return () => {
      cancelScheduled();
      window.removeEventListener("popstate", historyNavigation);
      document.removeEventListener("click", linkNavigation, true);
    };
  }, []);

  return <Form ref={form} action="/clinical-cases" scroll={false} className="catalog-search" onSubmit={() => { cancelScheduled(); ownNavigation.current = true; }}>
    <div className="catalog-search-field">
      <label htmlFor="case-search">{messages.searchLabel}</label>
      <input id="case-search" type="search" name="q" placeholder={messages.searchPlaceholder} maxLength={200} value={draft}
        onChange={event => {
          setDraft(event.target.value);
          cancelScheduled();
          timer.current = setTimeout(() => form.current?.requestSubmit(), 300);
        }} />
    </div>
    {user && !loading && <div className="catalog-search-field">
      <label htmlFor="answered-filter">My answers</label>
      <select id="answered-filter" name="answered" value={answerFilter} onChange={event => {
        setAnswerFilter(event.target.value);
        cancelScheduled();
        event.currentTarget.form?.requestSubmit();
      }}>
        <option value="all">All cases</option><option value="answered">Answered</option><option value="unanswered">Unanswered</option>
      </select>
    </div>}
    {draft && <Link className="text-link" href={`/clinical-cases?${new URLSearchParams({ answered: answerFilter })}`}>{messages.clearSearch}</Link>}
  </Form>;
}
