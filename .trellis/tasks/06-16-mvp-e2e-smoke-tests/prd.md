# Task 17: End-to-end smoke tests

## Goal

Add MVP browser smoke coverage with Playwright for the core end-to-end paths that prove the web app, API, persistence, attachment flow, and auth session boundaries work together.

## Source Of Truth

- `doc/MVP_rule.md` overrides `doc/Design.md` whenever they differ.
- Jixia MVP is web-only and server-first: the API owns sessions, invitations, permissions, documents, attachments, signed URLs, audit, and AI boundaries.
- Browser tests must verify behavior through public API/UI surfaces without adding client-owned authorization, browser token storage, public buckets, or direct database/storage access from frontend code.

## In Scope

- Add Playwright setup for local web/API smoke tests.
- Add smoke specs for:
  - Accept invitation -> login -> create project.
  - Create project document -> draft save -> formal save.
  - Upload image block -> reload document -> image block still resolves.
  - Logout current device -> `auth/me` returns unauthenticated.
- Add deterministic test helpers/fixtures only as needed for local services.
- Wire `@jixia/web` E2E script and root Playwright config if missing.
- Keep secrets and generated browser artifacts out of source-controlled payloads.

## Out Of Scope

- New product features beyond smoke-test support.
- Public attachment links/buckets, browser-owned permission logic, or direct object-storage credentials in browser code.
- AI-generated merge/writeback flows.
- Full visual regression or exhaustive browser matrix beyond MVP smoke coverage.
- Git commit, push, PR creation, or missing `create-pr` flow.

## Required Files

Create or update as needed:

- `playwright.config.ts`
- `apps/web/e2e/auth-and-project.spec.ts`
- `apps/web/e2e/document-save.spec.ts`
- `apps/web/e2e/attachment-upload.spec.ts`
- `apps/web/package.json`
- Supporting test helpers/fixtures under `apps/web/e2e/` only if needed.

## Playwright Setup Requirements

- Configure Playwright to run against local web and API services.
- Prefer project scripts/webServer entries that start only local MVP services needed for smoke tests.
- Reuse the existing web/API build/runtime conventions when possible.
- Ensure tests can run with `pnpm --filter @jixia/web e2e`.
- Keep traces/screenshots/videos in ignored/generated locations.
- Avoid committing generated reports, browser downloads, or secrets.

## Smoke Flow Requirements

### Auth And Project Smoke

- Exercise invitation acceptance and login with cookie-backed session behavior.
- Create a project through the UI/API path used by the MVP shell.
- Confirm project creation relies on API session cookies and does not require bearer/local-storage tokens.

### Document Save Smoke

- Create or open a project document.
- Edit draft content and verify draft save path.
- Perform formal save with revision/base-revision behavior.
- If a conflict path is simulated, verify conflict is human-facing and does not call AI.

### Attachment Upload Smoke

- Upload an image block through the browser attachment UI.
- Ensure the helper requests upload intent, uploads to transient signed URL, confirms via API, and stores only safe attachment metadata in the document block.
- Reload the document and verify the image/file block still resolves through the private attachment/download flow.
- Never expose object-storage credentials, storage keys, signed URL persistence, or auth headers in browser code/test fixtures.

### Logout Smoke

- Logout current device through the supported auth route/UI path.
- Verify `/auth/me` or equivalent session check returns unauthenticated after logout.

## Privacy And Safety Requirements

- Do not store auth tokens in `localStorage`, `sessionStorage`, or browser globals.
- Do not log or persist API keys, cookies, bearer tokens, signed URLs, object-storage credentials, attachment content, document bodies outside test fixtures, AI prompts/responses, or request headers.
- Use server APIs for permissions, signed URL issuance, attachment confirmation, document saves, and auth session checks.
- Tests may assert request shapes but must avoid printing secrets or signed URLs in failure messages.

## Acceptance Criteria

- `playwright.config.ts` exists and can run local MVP browser smoke tests.
- `apps/web/e2e/auth-and-project.spec.ts` covers accept invitation/login/create project.
- `apps/web/e2e/document-save.spec.ts` covers document draft/formal save path.
- `apps/web/e2e/attachment-upload.spec.ts` covers image attachment upload/confirm/reload resolution path.
- Logout smoke proves the current device session is cleared and `/auth/me` is unauthenticated.
- E2E setup does not require browser token storage or object-storage credentials in the browser.
- Unit tests, builds, and browser smoke tests pass or any environment-specific skip/fallback is explicit, deterministic, and documented by the implementation/check report.

## Verification Commands

Run the smallest relevant commands first and then broader verification when feasible:

```bash
pnpm test
pnpm build
pnpm --filter @jixia/web e2e
pnpm -r test
pnpm -r lint
pnpm -r build
```

Expected result: unit tests, builds, and browser smoke tests pass; no generated Playwright artifacts or secrets are committed.
