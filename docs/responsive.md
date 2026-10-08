# Responsive layout follow-up

## Specification
All existing pages and form states must remain usable at 320, 390, 768, 1024 and 1440 CSS pixels and at increased text size. No horizontal page overflow, clipped controls, inaccessible sticky panels or overlap of long clinical content. Use CSS Grid/Flexbox, fluid spacing/type and media queries; JavaScript remains for form/network behavior only. Respect reduced motion and provide practical touch targets.

## Plan and tasks
- [x] Inspect existing CSS and form structures; preserve the current visual design and API contract.
- [x] Harden grid/flex sizing, mobile forms/results, long strings and short landscape layouts in globals.css only.
- [x] Verify all three pages, populated draft and scoring states across viewport sizes; production build and existing tests.
- [x] Record evidence, commit and push the finished change.

Billing remains a separate external prerequisite for the existing deployment objective.

## Verification
- CSS only; no JS viewport handlers, inline styles or animation library added.
- Headless Chrome: home, case/result, 200-character unbroken symptom, empty and populated author form at 320/390/768/1024/1440px: 25 checks passed without horizontal overflow.
- Enlarged root text, short landscape static panel and reduced-motion checks passed. Mobile 320px screenshot visually inspected.
- npm test --prefix frontend: 9 passed. docker compose build frontend: production build passed. docker compose up -d --wait frontend: passed.
- Local verification script: node .local/check-responsive.cjs (temporary Playwright 1.64.0 tooling, no added application dependency).
