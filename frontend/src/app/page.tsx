import Link from "next/link";
import { DEMO_CASE_ID, messages } from "@/lib/messages";

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="status-dot" />
            {messages.homeEyebrow}
          </p>
          <h1>{messages.homeTitle}</h1>
          <p className="lead">{messages.homeDescription}</p>
          <div className="actions">
            <Link className="button" href="/clinical-cases/new">
              {messages.create}
              <span aria-hidden="true"> →</span>
            </Link>
            <Link
              className="text-link"
              href={`/clinical-cases/${DEMO_CASE_ID}`}
            >
              {messages.demo}
              <span aria-hidden="true"> ↗</span>
            </Link>
          </div>
        </div>
        <div className="case-illustration" aria-hidden="true">
          <div className="illustration-label">
            {messages.illustration.label}
          </div>
          <div className="illustration-pulse">⌁</div>
          <div className="illustration-lines">
            <i />
            <i />
            <i />
          </div>
          <div className="illustration-chips">
            {messages.illustration.symptoms.map((symptom) => (
              <span key={symptom}>{symptom}</span>
            ))}
          </div>
          <div className="illustration-bottom">
            <span>{messages.illustration.clues}</span>
            <span>{messages.illustration.reasoning}</span>
          </div>
        </div>
      </section>
      <section className="workflow-section" aria-labelledby="workflow-title">
        <p className="eyebrow" id="workflow-title">
          {messages.workflow}
        </p>
        <div className="workflow-grid">
          {messages.steps.map((step, index) => (
            <article className="step" key={step.title}>
              <span className="step-number">0{index + 1}</span>
              <h2>{step.title}</h2>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="demo-banner">
        <div>
          <h2>{messages.demoTitle}</h2>
          <p>{messages.demoDescription}</p>
        </div>
        <Link
          className="button button-secondary"
          href={`/clinical-cases/${DEMO_CASE_ID}`}
        >
          {messages.demo}
          <span aria-hidden="true"> →</span>
        </Link>
      </section>
    </>
  );
}
