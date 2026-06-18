# Frontend Quality Guidelines

To be filled by the team.

Initial MVP constraints:

- Browser tests should cover login, project access boundaries, document editing, attachments, and AI private conversation flows once the app exists.
- Do not add realtime collaboration or public share links in MVP.

## Scenario: MVP Browser Smoke Test Contract

### 1. Scope / Trigger
- Trigger: `apps/web/e2e/**` and root `playwright.config.ts` define MVP browser smoke coverage for local web/API integration paths.
- Scope: Playwright config, `@jixia/web` E2E package script, browser smoke specs, deterministic local E2E API fixtures, and generated artifact ignore rules.
- Boundary: Browser smoke tests must not add product features, client-owned authorization, direct database or object-storage access, public buckets/links, browser auth token storage, or AI-generated merge/writeback behavior.

### 2. Signatures
- Command: `pnpm --filter @jixia/web e2e` runs Playwright through the root config.
- Required smoke specs: `apps/web/e2e/auth-and-project.spec.ts`, `apps/web/e2e/document-save.spec.ts`, and `apps/web/e2e/attachment-upload.spec.ts`.
- Local service fixture: `apps/web/e2e/test-api.mjs` may emulate only public MVP API surfaces needed by browser smoke tests.
- Generated artifacts: Playwright reports, traces, screenshots, videos, and test results must stay in ignored generated paths such as `playwright-report/` and `test-results/`.

### 3. Contracts
- E2E browser flows use public UI and `/api` routes only. They must prove the browser submits user intent while the API owns sessions, invitations, project membership, document permissions, draft/revision saves, attachment signing, and auth checks.
- Local Vite E2E proxying must preserve the `/api` prefix when forwarding to `apps/web/e2e/test-api.mjs`; the fixture serves public MVP API paths exactly as the browser calls them.
- Auth smoke must exercise invitation acceptance, login, cookie-backed session behavior, project creation, current-device logout, and an unauthenticated `/auth/me` result after logout.
- Document smoke must exercise project document creation, draft autosave to the draft endpoint, formal revision save with base revision behavior, and human-facing conflict handling if a conflict path is simulated.
- Attachment smoke must request an upload intent, upload the selected file to a transient signed URL without browser credentials, confirm the intent through the API, store only safe block metadata plus attachment ID, reload the document, and resolve the attachment through the private download API.
- Tests may observe request paths and response statuses, but must not print or persist cookies, bearer tokens, signed URLs, object-storage keys, request headers, file contents, document bodies outside fixtures, prompts, responses, or provider/storage credentials.

### 4. Validation & Error Matrix
- Missing local services or browser dependencies should fail deterministically; any intentional environment skip or fallback must be explicit in code and documented in the check report.
- API requests with `Authorization` headers from browser code are invalid for MVP smoke coverage; tests should assert this remains empty for covered flows.
- Direct object upload requests carrying cookies or authorization headers are invalid and should fail in the local fixture.
- Browser `localStorage`, `sessionStorage`, visible cookies, globals, generated reports, and committed fixtures must not expose session IDs, auth tokens, signed URLs, storage keys, object keys, or credentials.
- E2E fixture state may be in memory and deterministic, but it must model the public route shape closely enough to catch broken UI/API integration behavior.

### 5. Good/Base/Bad Cases
- Good: a Playwright spec accepts an invitation, verifies `/api/auth/me` succeeds by cookie, logs out with `/api/auth/logout`, and verifies `/api/auth/me` returns unauthenticated.
- Good: an attachment spec observes upload-intent, direct PUT, confirm, reload, and download API calls while asserting no browser authorization headers or storage-key text leaks into the page.
- Base: root Playwright web servers start only local MVP smoke services and write artifacts to ignored generated locations.
- Base: `JIXIA_E2E_API_URL` points Vite at the local test API and `/api/invitations/accept` reaches the fixture unchanged.
- Bad: a test writes a bearer token to `localStorage`, imports Prisma or object-storage clients into web fixtures, snapshots signed URLs into failure output, or uses public attachment buckets/links.
- Bad: a browser helper computes authorization from client-side roles instead of calling server APIs.

### 6. Tests Required
- Focused E2E command: `pnpm --filter @jixia/web e2e` must pass before claiming MVP browser smoke readiness.
- Repository checks: `pnpm test`, `pnpm build`, `pnpm -r test`, `pnpm -r lint`, and `pnpm -r build` should pass when feasible; environment-specific failures must be reported with the exact failing command.
- Contract review: scan `apps/web/**`, `apps/web/e2e/**`, and generated artifact paths before PR readiness to confirm no browser token storage, client-side permission helpers, object-storage credentials, signed URL persistence, or generated Playwright artifacts are included.

### 7. Wrong vs Correct
#### Wrong
```typescript
localStorage.setItem("authToken", response.token);
await fetch(upload.url, { headers: { Authorization: `Bearer ${response.token}` } });
```

#### Correct
```typescript
await fetch("/api/auth/me", { credentials: "include" });
await fetch(upload.url, { method: "PUT", body: file, credentials: "omit" });
```
