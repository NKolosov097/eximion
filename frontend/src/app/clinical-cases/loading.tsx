import { messages } from "@/lib/messages";

export default function CatalogLoading() {
  return <div className="status-page" role="status">{messages.catalogLoading}</div>;
}
