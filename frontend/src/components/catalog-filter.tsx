"use client";
import { useSession } from "./session-provider";
export function CatalogFilter({ value }: { value: string }) {
  const { user, loading } = useSession();
  if (!user || loading) return null;
  return <div className="catalog-search-field"><label htmlFor="answered-filter">My answers</label><select id="answered-filter" name="answered" defaultValue={value}><option value="all">All cases</option><option value="answered">Answered</option><option value="unanswered">Unanswered</option></select></div>;
}
