import type { Metadata } from "next";
import { AnalyticsDashboard } from "@/components/analytics-dashboard";
import { messages } from "@/lib/messages";

export const metadata: Metadata = { title: messages.analyticsTitle };

export default function AnalyticsPage() {
  return (
    <>
      <div className="page-heading">
        <h1 data-testid="analytics-title">{messages.analyticsTitle}</h1>
        <p className="lead">{messages.analyticsDescription}</p>
      </div>
      <AnalyticsDashboard />
    </>
  );
}
