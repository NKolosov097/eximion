# Review remediation, frontend conventions and independent acceptance

## Specification

Fix all six confirmed audit findings: preserve CORS on redeployment; make case Retry issue a new server request; release telemetry flush waiters once their generation is exported rather than waiting for quiet traffic; reject NUL in persisted text with422; classify input validation as422 without downgrading Gemini output failures; align frontend trimmed Unicode code-point limits with backend.

Frontend handwritten component props must use named interfaces, ReactNode must be imported directly, and author pending states must use a named union alias. Generated API types remain generated and must not be edited manually. Extract reusable pure text/validation helpers (including lines) to focused shared modules under src/lib; keep component-specific state handlers local. Replace deprecated FormEvent with the supported event type from installed React typings.

Audit/fix accessibility: labels, keyboard/focus behavior, error-field associations, status announcements, contrast and CSS prefers-reduced-motion. Keep stable data-testid and input preservation. Errors remain inline with accessible associations; no new toast library.

Split GitHub CI into typechecks (frontend and meaningful backend static typing), unit tests without PostgreSQL, integration tests requiring real PostgreSQL, API contract drift, production/container builds, and an aggregate required result. Every backend test must belong to the correct unit/integration selection; integration job must fail rather than silently skip without its test database. Pin type-checker dependency. Preserve dependency lockfiles.

Investigate reported contentscript.js MaxListenersExceededWarning by checking app source and a clean browser runtime. Do not suppress warnings or increase listener limits without identifying the source. Ask for the source URL/stack if it belongs to the user's browser context.

After verified fixes, run three independent Astra code reviews and a separate Astra assignment-coverage review given the original three-part assignment verbatim. Address confirmed actionable regressions; clearly distinguish required work from optional additions. Rebuild local apps, deploy reviewed changes, verify actual browser/API/trace behavior, and save evidence.

## Ownership and plan

- Backend: backend/** instrumentation/validation/static typing/test classification, report CI commands. Do not edit workflow or shared deployment scripts.
- Frontend: frontend/** and frontend tests/browser verification script for accessibility/retry; no backend or workflow edits.
- Coordinator: scripts/deploy.py, scripts/tests, workflows, contract generation, shared docs, console diagnosis, cloud integration and commits.
- Independent coverage reviewer: read only; original assignment vs implementation, no speculative scope expansion.

## Tasks

- [x] Inspect clean working tree and save scope before implementation.
- [ ] Fix backend findings and static type checking; classify tests.
- [ ] Fix frontend findings/conventions/shared helpers/accessibility and verify.
- [ ] Preserve CORS during redeployment with a failure-path regression test.
- [ ] Split and verify GitHub CI jobs.
- [ ] Diagnose console warning using source and browser evidence.
- [ ] Complete independent assignment-coverage review.
- [ ] Complete three independent Astra reviews after fixes and address confirmed issues.
- [ ] Verify local and cloud workflows/traces; record evidence and commit/push changes.
