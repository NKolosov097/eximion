import { messages } from "@/lib/messages";

export default function CatalogLoading() {
  return (
    <div className="case-page" data-testid="catalog-loading">
      <div className="page-heading">
        <h1>{messages.back}</h1>
        <p className="lead">{messages.catalogDescription}</p>
      </div>
      <p className="sr-only" role="status">{messages.catalogLoading}</p>
      <ul className="catalog-list" aria-hidden="true">
        {[0, 1, 2].map((card) => (
          <li className="panel" key={card}>
            <div className="skeleton-line skeleton-title" />
            <div className="skeleton-line" />
            <div className="skeleton-line" />
            <div className="skeleton-line skeleton-badge" />
          </li>
        ))}
      </ul>
    </div>
  );
}
