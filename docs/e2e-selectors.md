# E2E selector contract

Use `getByTestId(name)` (Playwright or Testing Library) or `[data-testid="name"]`. These names are stable across copy and CSS changes. Keep roles, labels and keyboard behavior when changing markup. Renaming or removing a selector requires updating this contract, tests and E2E consumers together.

Selectors are unique within the active page, except `case-symptom`, which repeats for the ordered symptom rows. Scope row queries to `case-symptoms`. Names never contain case IDs, user content or secrets.

## Navigation and home

| Selector | Element / behavior |
| --- | --- |
| `skip-to-content` | Global skip link to `#main` |
| `nav-home` | Global brand link to `/` |
| `nav-create-case` | Global navigation link to `/clinical-cases/new` |
| `home-create-case` | Home hero link to authoring |
| `home-demo-case-primary` | Home hero link to the demonstration case |
| `home-demo-case-banner` | Home lower banner link to the same demonstration case |

## Case authoring

| Selector | Element / behavior |
| --- | --- |
| `author-page-title` | Authoring page heading |
| `author-extract-form` | Extraction form; `aria-busy="true"` while extracting |
| `author-source-text` | Raw synthetic clinical note textarea |
| `author-key` | Author key password input; key values are never selectors |
| `author-extract-submit` | Extraction button; same selector for initial extraction and re-extraction |
| `author-extract-error` | Extraction error alert, present only after a failure |
| `author-draft-empty` | Placeholder, present only before a draft exists |
| `author-save-form` | Draft/save form; `aria-busy="true"` while saving |
| `author-draft-warnings` | Extraction warning status, present when warnings exist |
| `author-draft-title` | Editable case title input |
| `author-draft-vignette` | Editable clinical vignette textarea |
| `author-draft-symptoms` | Editable symptoms textarea, one per line |
| `author-draft-age` | Optional age number input |
| `author-reference-diagnosis` | Independently entered reference diagnosis input |
| `author-accepted-alternatives` | Accepted alternatives textarea, one per line |
| `author-review-confirmation` | Required review checkbox; cleared when draft or answer fields change |
| `author-save-error` | Save/validation error alert, present only after a failure |
| `author-save-submit` | Save button; disabled until reviewed and while a request is pending |

The draft fields and save form appear after successful extraction. Existing draft inputs remain after failed re-extraction or saving. Check the existing form `aria-busy` and native disabled state for pending work; selectors do not change with button text. Controls in a disabled fieldset are disabled through that fieldset.

## Public case and route states

| Selector | Element / behavior |
| --- | --- |
| `case-page` | Successfully loaded server-rendered case container |
| `case-back-home` | Link back to `/` |
| `case-title` | Public case title heading |
| `case-age` | Public age badge, including the unknown-age state |
| `case-vignette` | Public vignette paragraph |
| `case-symptoms` | Symptom list container |
| `case-symptom` | Repeated symptom list item; use scoped `getAllByTestId` / `getByTestId(...).all()` |
| `case-loading` | Route loading status |
| `case-load-error` | Failed case-load container |
| `case-load-error-message` | Failed case-load alert |
| `case-load-retry` | Retry button, reloads the page and fetches the case again on the server |
| `case-not-found` | Not-found route container |
| `case-not-found-home` | Not-found link back to `/` |

Route loading can be brief or absent when a navigation resolves immediately. Tests of loading should delay the request rather than assume it remains visible.

## Diagnosis attempts

| Selector | Element / behavior |
| --- | --- |
| `attempt-form` | Diagnosis form; `aria-busy="true"` while submitting |
| `attempt-diagnosis` | Diagnosis text input |
| `attempt-submit` | Submit button; same selector while pending |
| `attempt-error` | Submission error alert, present only after a failure |
| `attempt-result` | Result status, present after successful submission; removed when answer changes |
| `attempt-result-title` | Correct/incorrect result heading |
| `attempt-feedback` | API feedback paragraph |
| `attempt-score` | Score value including maximum, for example `100 / 100` |

## Verification

`frontend/src/components/forms.test.tsx` uses selectors during extraction, review, failure recovery and attempt submission, and checks that input selectors still identify labelled controls. `frontend/src/components/pages.test.tsx` verifies navigation destinations, server-rendered public fields, repeated symptoms, loading, error retry and not-found states. Run `npm test`, `npm run typecheck` and `npm run build` from `frontend/`.


For the real deployed browser workflow, run from the repository root (Chrome required):

```sh
npm install --prefix .local/browser-check --no-save playwright@1.64.0
node scripts/browser-smoke.cjs
```

The script reads deployment URLs and the private `.local/cloud-secrets.json` author key, exercises real extraction/review/save/attempts using stable selectors, checks mobile overflow, and saves `docs/cloud-browser-check.json`. It never prints the key. It creates a synthetic case in the deployed database. Optional `FRONTEND_CHECK_URL` selects the other frontend URL alias.

For isolated frontend regression checks, first build with `npm run build --prefix frontend`, then run `node scripts/check-frontend.cjs`. It starts temporary random-port servers, uses a synthetic mock API, and checks Retry, keyboard focus, Unicode limits, reduced motion and responsive overflow. Results are saved to `.local/frontend-check.json`; this does not replace the real cloud smoke test.
