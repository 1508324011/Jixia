# Task 12: Build Web App Shell And Auth UI

## Goal

Build the MVP browser-facing app shell and authentication UI for Jixia: a cookie-aware API client, login page, invitation acceptance page, and shared app shell/layout that can host the remaining project/document/attachment/AI UI tasks.

This task must keep the server-first boundary intact. The web app may collect user input and render server responses, but it must not own permission decisions, visibility rules, audit decisions, attachment credentials, or AI secret handling.

## Source Of Truth

- `doc/MVP_rule.md` overrides `doc/Design.md` whenever they differ.
- Jixia MVP is web-only.
- The API is the source of truth for authentication, sessions, invitations, permissions, storage keys, audit, AI visibility, and governance rules.
- Frontend code must use API responses rather than reimplementing backend authorization logic.

## In Scope

1. Add or complete the browser app entrypoint and shell.
2. Add a cookie-aware API client helper.
3. Add login UI that submits email/password to the existing auth API.
4. Add invitation acceptance UI that submits token, display name, and password to the existing invitation API.
5. Add a reusable app shell/layout for later MVP pages.
6. Add focused tests for auth UI behavior.
7. Ensure the web package builds cleanly.

## Out Of Scope

- Project/document/attachment/AI feature pages beyond navigation placeholders.
- Client-side permission enforcement beyond hiding/disabling obvious UI affordances.
- Storing session tokens in browser storage.
- Electron/local filesystem functionality.
- Public links or realtime collaboration.
- Client-side audit writing or AI secret management.

## Required Files

Create or update these files as needed:

- `apps/web/src/main.tsx`
- `apps/web/src/app/App.tsx`
- `apps/web/src/lib/api.ts`
- `apps/web/src/features/auth/LoginPage.tsx`
- `apps/web/src/features/auth/AcceptInvitationPage.tsx`
- `apps/web/src/features/layout/AppShell.tsx`
- `apps/web/src/features/auth/LoginPage.test.tsx`

Additional small test/setup files may be added only if required by the existing web test stack.

## API Client Requirements

Implement an API helper equivalent to:

```ts
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { ...init, credentials: "include" });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json() as Promise<T>;
}
```

The final helper should:

- Always use `credentials: "include"` by default.
- Keep cookies/session authority server-owned.
- Avoid localStorage/sessionStorage token storage.
- Support JSON request bodies ergonomically if useful.
- Produce useful but non-secret error messages.

## Login UI Requirements

The login page must:

- Render email and password inputs.
- Submit credentials to `POST /auth/login` through the API helper.
- Use cookies/session via `credentials: "include"`.
- Show loading and error states.
- Avoid storing tokens or secrets in browser storage.
- Navigate or call a success callback after a successful login if routing is not yet implemented.

## Invitation Acceptance Requirements

The invitation acceptance page must:

- Accept an invitation token, display name, and password.
- Prefer reading token from the URL query string when available, while still allowing manual entry if needed.
- Submit to `POST /invitations/accept` through the API helper.
- Show loading, success, and error states.
- Avoid exposing or persisting invite tokens beyond the form interaction.

## App Shell Requirements

The app shell must:

- Provide a stable layout for later MVP pages.
- Include navigation placeholders for projects, documents, attachments, AI, and audit/governance only as appropriate.
- Avoid making permission or visibility decisions locally.
- Keep visual design usable and accessible without overbuilding.

## Acceptance Criteria

- `apiFetch` prefixes `/api`, sends cookies, and throws on non-OK responses.
- Login form posts email/password to the auth login endpoint with cookies enabled.
- Login UI shows loading and error states.
- Invitation form posts token/display name/password to the invitation accept endpoint with cookies enabled.
- Invitation UI can initialize token from URL query string.
- No auth token is stored in `localStorage`, `sessionStorage`, or hard-coded constants.
- App shell renders and can host future MVP pages.
- Web build succeeds.

## Verification Commands

Run the smallest relevant checks first, then broader verification when stable:

```bash
pnpm --filter @jixia/web test -- LoginPage
pnpm --filter @jixia/web build
pnpm --filter @jixia/web lint
pnpm -r test
pnpm -r lint
pnpm -r build
```

Expected result: login tests pass, the web app builds, and workspace checks remain clean.
