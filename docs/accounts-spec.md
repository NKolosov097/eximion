# Accounts and learning history

Visitors may register with a username and password, sign in, and sign out. Registration clearly states that email and password recovery are unavailable. Authentication is separate from the author key: extraction, creation and global analytics retain their existing key requirements.

Signed-in creation and submissions belong to the current user. Guests may continue both flows after explicitly checking a required acknowledgement that their records are global/unowned and cannot be attached to a later account. Existing records remain unowned. Clients cannot choose or change an owner.

The private profile shows total attempts, correct and incorrect attempts, total points, paginated answer history and owned cases. Repeated attempts count separately. History includes the primary diagnosis, optional alternative diagnoses and any historical reasoning, timestamp, score and case link. The learner form no longer collects or sends reasoning; the optional backend field remains compatible. Only the primary diagnosis affects the existing deterministic 0/100 grade. Up to five alternatives of 1–200 characters and optional reasoning up to 2,000 characters are accepted; NUL is forbidden.

The catalog shows a signed-in user's latest attempt score and supports All / Answered / Unanswered filtering alongside search and pagination. Other users' answers are never exposed. Guest filtered requests require sign-in.

An owner can edit a non-hidden case at any time; previous attempts retain their original case snapshot and grading. Archiving an owned case removes it from the catalog and prevents new answers, while preserving a read-only detail page and all history. Global cases have no self-service owner controls. Concurrent edit/answer/archive requests must preserve these rules.

Personal responses are not cached. Credentials, session tokens and clinical answer bodies never appear in logs, URLs or browser storage. Logout revokes the session. Invalid or expired credentials never silently create anonymous records. The interface remains keyboard accessible, responsive and explicit about loading/errors.

Acceptance includes database migration round-trip, old-row preservation, two-user isolation, auth validation/throttling/session expiry/logout, CSRF rejection, attempt ownership and grading, edit/answer races, archival/history, catalog filters and pagination, frontend flow and deployed read-only checks.

Guest notices offer a sign-in/register modal. Opening, cancelling, failed login and successful login preserve every mounted form field in memory; successful login removes the guest checkbox without submitting. No localStorage/sessionStorage draft persistence. Pending session lookup never counts as confirmed guest status. The API requires guest_acknowledged=true on anonymous creation and attempts.

Anonymous saves and answers require explicit guest_acknowledged=true and a checkbox. An in-place sign-in/register modal preserves every form field on cancellation, error and success, with no automatic submission and no browser draft storage. Successful submissions reveal the author-provided accepted_diagnoses and matched_alternative_diagnoses only; public GET responses keep the answer key hidden.

Owners can edit their non-hidden cases even after answers, and hide them from both the detail page and My cases. Hiding removes a case from the catalog and prevents new answers while preserving its detail and all history; confirmation explains these effects. No restoration is included. Public owner controls use private no-store capability metadata without an owner ID or answer key.

Every attempt retains an immutable snapshot of the case and accepted diagnoses used for grading. Editing never regrades past attempts or changes their points. History displays the answered version and identifies when the current case differs; catalog scores from earlier versions are labeled. The browser submits the displayed case revision and a stale revision is rejected without recording an answer, with a refresh action preserving entered diagnoses. Older API callers may omit the revision to grade against the current case.
