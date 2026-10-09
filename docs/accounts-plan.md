# Account implementation plan

1. Add PostgreSQL users, hashed opaque sessions and atomic throttle buckets; nullable ownership and archival columns; alternative-diagnosis JSONB and reasoning Text with defaults for old rows. Preserve existing grading tables and values.
2. Use standard-library PBKDF2-HMAC-SHA256 (600,000 iterations, independent random salts) to avoid high per-login memory use; cap simultaneous password work per process and reject excess work. Database throttle protects normalized account names across instances; registration has a conservative shared bucket. Store only SHA-256 hashes of random 32-byte session tokens, expire after 30 days, revoke on logout. Generic login errors; no email recovery.
3. Add auth/profile routes and ownership-aware queries. Lock the case row for every submission, owner update and archival; preserve immutable attempt snapshots when editing. Keep existing author-key checks. Return private history only for the authenticated user and add latest-score metadata to catalog results.
4. Add an allowlisted same-origin Next API proxy. HttpOnly, SameSite=Lax, production Secure cookie; reject cross-origin mutations, forward only explicit headers and backend paths, strip login tokens from browser responses. Server catalog reads forward the cookie as bearer credentials. No browser token storage.
5. Add session provider, account/profile UI, owned-case editor/archive, guest author warning and catalog filters. Coordinate richer attempt fields with the existing attempt component. Regenerate OpenAPI and TypeScript contract after backend changes.
6. Verify backend on real PostgreSQL, type checks and frontend tests/build. Add browser checks and update reviewed screenshots through the existing root workflow. Review before release.

Password parameters follow OWASP Password Storage guidance: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html . Cookie and token design follows https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html . No new dependency is required.

Owner management refinement:
1. Add a case revision and nullable per-attempt JSON snapshot; backfill legacy rows, and freeze any legacy NULL rows under the case lock before the first edit to support rolling deployment.
2. Permit owner edits after attempts while retaining original snapshots/scores. Compare the browser revision under the existing answer/edit/archive row lock; reject stale answers. Older API clients omitting revision explicitly use current grading.
3. Return private can_edit/can_hide capabilities; show both actions on detail and profile. Hide reuses archival, with confirmation and preserved history.
4. Show answered snapshots and prior-version score labels. Refresh stale forms without losing input or auto-submitting.
5. Verify migration/backfill, ownership isolation, historical grading, stale submissions, concurrency, browser controls and error states.

Authenticated author and icon-control refinement:
1. Require CurrentUser on extraction and creation; retain author-key enforcement and guest answer consent.
2. Add row-locked owner restore action and can_restore metadata; no database migration.
3. Reuse a single accessible icon action component in title rows for detail and profile; preserve confirmation/error behavior and responsive wrapping.
4. Gate author actions through the existing login modal, retain drafts, and remove guest creation copy/checkbox.
5. Update contract and all author fixtures/smoke callers. Verify unauthenticated valid-key rejection before LLM, owner-only restore, guest answers, modal preservation, icon semantics and layout.
