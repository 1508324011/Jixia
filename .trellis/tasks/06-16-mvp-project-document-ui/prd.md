# Task 13: Build Project and Document UI

## Goal

Build the MVP browser UI for projects and documents: project list/detail pages, document list, a document editor wrapper, draft autosave, formal save with `baseRevision`, and a human-only conflict view.

This task is frontend-only. The browser must remain a client of the server-first API and must not duplicate authorization, persistence, storage, audit, or AI decision logic.

## Source of Truth

- `doc/MVP_rule.md` overrides `doc/Design.md` where they differ.
- The API is authoritative for sessions, project membership, document visibility, revisions, conflicts, attachments, AI visibility, and audit boundaries.
- The frontend may present state returned by the API, but it must not infer project/document access rules locally.

## In Scope

- Project list page that reads projects from `GET /projects`.
- Project create flow that calls `POST /projects` and relies on the API to create owner membership.
- Project detail page that displays one project and its documents.
- Document list component for project-scoped documents.
- Document editor page that loads a document, renders the locked MVP block set, autosaves drafts, and formally saves revisions.
- A lightweight `JixiaEditor` wrapper suitable for the MVP block model.
- Conflict state shown to the human user when formal save returns a conflict.
- Focused tests for editor loading, draft save, formal save with `baseRevision`, and conflict display.

## Out of Scope

- Attachment block upload/download UI; that is Task 14.
- AI config/conversation/usage UI; that is Task 15.
- Browser-side permission enforcement beyond hiding obviously unavailable controls from returned data.
- AI-assisted merge, AI rewrite, or automatic conflict resolution.
- Direct database/storage access from the web app.
- Realtime collaboration, public sharing links, or offline/local-first editing.

## Required Files

Create or update:

- `apps/web/src/features/projects/ProjectListPage.tsx`
- `apps/web/src/features/projects/ProjectDetailPage.tsx`
- `apps/web/src/features/documents/DocumentList.tsx`
- `apps/web/src/features/documents/DocumentEditorPage.tsx`
- `apps/web/src/features/documents/editor/JixiaEditor.tsx`
- `apps/web/src/features/documents/DocumentEditorPage.test.tsx`
- `apps/web/src/app/App.tsx`
- `apps/web/src/features/layout/AppShell.tsx`

Additional helpers/tests may be added if needed, but keep the implementation focused on the MVP plan.

## API Client Boundary

- Use the existing `apiFetch<T>()` helper from `apps/web/src/lib/api.ts`.
- All API calls must use the `/api` prefix and cookie sessions through `credentials: "include"` via the helper.
- Do not use `localStorage`, `sessionStorage`, bearer headers, or browser-owned auth tokens.
- Do not persist server responses containing document bodies outside React component state/test fixtures.

## Project UI Requirements

- Project list shows projects returned by `GET /projects`.
- Create project calls `POST /projects` with the minimum server contract fields.
- The UI must rely on the API to assign owner membership automatically.
- Project detail loads a project and renders the project-scoped document list.
- Errors must be user-readable but must not leak cookies, headers, tokens, or raw response internals.

## Document List Requirements

- Document list renders project-scoped documents returned by API calls.
- It should support opening a document editor for a selected document.
- Creating a document may be included if supported by existing API contracts; otherwise keep the UI aligned with current endpoints and document any limitation in the final report.

## Editor Requirements

The editor must support the locked MVP block set:

```text
paragraph, heading, bulletList, orderedList, todo, quote, callout, codeBlock, divider, table, image, file
```

- The MVP wrapper may render/edit blocks using a lightweight React implementation if full Tiptap integration is not already available.
- The data shape must remain compatible with shared document contracts.
- Unsupported/custom blocks must not be invented beyond the locked set.
- Image and file blocks may render placeholders only; upload behavior belongs to Task 14.

## Draft and Formal Save Requirements

- Autosave calls the draft endpoint with the current document body.
- Manual formal save calls the formal save/revision endpoint with the current `baseRevision`.
- On successful formal save, update visible revision/base revision state from the API response.
- If the API returns a conflict response, show a human merge/conflict view with enough metadata for manual resolution.
- Conflict handling must never call AI, never auto-merge, and never mutate server state without explicit user action.

## Security and Privacy Requirements

- Frontend must not decide whether the user can view/edit a project or document; it can only render API-returned state and handle API errors.
- Do not log document body, cookies, auth headers, tokens, prompts, API keys, signed URLs, or credentials.
- Do not create audit events from the browser.
- Do not write AI output into `Document`, `DocumentDraft`, or `DocumentRevision`.

## Acceptance Criteria

- Project list fetches and displays API projects.
- Project creation posts to the API and refreshes/navigates using the returned project.
- Project detail displays project metadata and document list.
- Editor renders the locked block types.
- Draft autosave sends the current document body to the draft endpoint.
- Manual formal save sends `baseRevision`.
- Conflict API responses show a human conflict view and do not call AI.
- No browser token storage or local authorization logic is introduced.
- Web tests, lint/typecheck, and build pass.

## Verification Commands

Run at minimum:

```bash
pnpm --filter @jixia/web test -- DocumentEditorPage
pnpm --filter @jixia/web build
pnpm --filter @jixia/web lint
```

Before finish, also run broader verification when feasible:

```bash
pnpm -r test
pnpm -r lint
pnpm -r build
```
