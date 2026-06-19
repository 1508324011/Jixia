# Task 19: Server-Authorized Document Collections

## Goal

Close the Notebook and Project Docs collection loop with server-authorized list/create/open flows while preserving Jixia's existing document model, draft/revision lifecycle, attachment boundaries, and no-writeback AI contract.

This task turns `/notebook` into a real document-backed surface and removes the current Project Docs missing-list-route seam. It must prepare the product spine for the later editor-first redesign without changing the editor UX in this task.

## Source of Truth

- `doc/MVP_rule.md`
- `doc/MVP_implement.md` Post-MVP Stage B/C
- `doc/Notebook_Project_Doc_Editor_Implementation_Plan.md`
- `.trellis/spec/guides/pre-implementation.md`
- `.trellis/spec/guides/cross-layer.md`
- `.trellis/spec/guides/code-reuse.md`
- `.trellis/spec/backend/index.md`
- `.trellis/spec/frontend/index.md`
- Existing document service and editor behavior

## Problem Statement

The backend already supports document creation, reading, draft autosave, formal revisions, lifecycle operations, and attachment linkage for `notebook` and `project` documents. But the collection layer is incomplete:

- `ProjectDetailPage` calls `/projects/:projectId/documents`, but the API does not define that endpoint.
- Project document listing therefore falls back to a visible “Project document listing is not available” state.
- `/notebook` is still a placeholder surface even though notebook document creation and read contracts already exist.
- `DocumentList` is project-only and cannot serve Notebook without forking collection UI.

This is bad data flow. The document identity and ownership model exists, but the collection/list boundary is missing. Fix that before touching editor feel or AI document features.

## Target Data Model and Contracts

Task 19 should reuse existing durable objects:

- `Document.type = notebook | project`
- `Document.ownerUserId` for Notebook ownership
- `Document.projectId` and `projectSpaceId` for Project Docs
- `DocumentDraft` for autosave
- `DocumentRevision` for formal saves
- `EditorSnapshot` / `EditorBlock` as the transport grammar
- `DocumentDTO` as the list item shape unless a narrower list item is deliberately added

Expected collection response shape:

```ts
type ListDocumentsResponse = {
  readonly documents: readonly DocumentDTO[];
};
```

A different name is acceptable if implementation follows existing shared-contract style, but the payload must be transport-safe and must not include snapshots, drafts, signed URLs, storage keys, prompts, or browser permission decisions.

## In Scope

### 1. Shared document list contract

Add a shared response type in `packages/shared/src/documents.ts` if no existing shape is sufficient.

Requirements:

- Use `DocumentDTO` or a transport-safe document summary.
- Keep authorization/business logic out of shared contracts.
- Do not expose document body, draft content, attachment storage keys, signed URLs, AI prompts, provider payloads, or server-private state.

### 2. Server-authorized list methods

Extend `apps/api/src/modules/documents/document.service.ts` instead of creating a parallel notebook service.

Add repository and service behavior for:

- listing notebook documents for the current actor only.
- listing project documents for an actor who is explicitly authorized for that project.
- hiding malformed/cross-space/invalid document context.

Expected repository methods:

```ts
listNotebookDocuments(ownerUserId: string): Promise<readonly DocumentRecord[]>;
listProjectDocuments(projectId: string): Promise<readonly DocumentRecord[]>;
```

Exact signatures may vary, but the service must remain the server authority.

### 3. API routes

Add authenticated list routes using existing Fastify/session patterns:

```text
GET /documents/notebook
GET /projects/:projectId/documents
```

`GET /projects/:projectId/documents` is preferred because the current web app already calls it. It may be implemented in the document routes plugin if that preserves the simplest dependency boundary; do not duplicate list logic in project service unless necessary.

### 4. Project Docs frontend loop

Update Project detail so project document list is real:

- call the server list endpoint.
- remove the missing-route fallback copy for authorized projects.
- keep project metadata and document rows server-driven.
- keep create project document flow through `POST /documents/project`.
- keep browser code free of authorization decisions.

### 5. Notebook surface

Create a real Notebook page under `apps/web/src/features/notebook/`.

Requirements:

- `/notebook` must no longer render a placeholder.
- Notebook page lists documents from `GET /documents/notebook`.
- Notebook creation uses `POST /documents/notebook`.
- Opening a notebook document reuses `DocumentEditorPage`.
- Notebook and Project Docs must share editor/draft/revision/attachment behavior.

### 6. Shared collection UI

Generalize `DocumentList` or introduce a `DocumentCollectionPanel` equivalent.

Requirements:

- support project and notebook scopes without duplicating editor logic.
- create/list/open from API responses.
- avoid client-side permission helpers.
- keep UI aligned with the compact workbench primitives and ResearchClaw-adjacent style.

### 7. Tests

Add or update focused tests for:

- document service list behavior.
- route authentication and authorization boundaries.
- notebook owner-only list behavior.
- project member list behavior.
- notebook/project isolation.
- ProjectDetailPage real list behavior.
- NotebookPage list/create/open behavior.
- `/notebook` no longer being placeholder routing.

## Out of Scope

- Prisma schema migration unless a real blocker is discovered and documented.
- Rich editor redesign or continuous writing surface changes.
- Nested notebook tree.
- backlinks, tags, graph, global search, or metadata parser.
- automatic Notebook-to-Project promotion.
- AI document writeback, rewrite, apply, merge, or automatic insertion.
- CRDT/Yjs/Hocuspocus/Tiptap/BlockNote adoption.
- direct database, storage, or auth decisions in the browser.
- public share links or realtime collaboration.

## Permission and Privacy Requirements

- API owns all document collection authorization.
- Notebook documents are visible only to their owner.
- Project documents are visible only to explicit authorized project members.
- `SpaceAdmin` must not get implicit project content access without required project membership.
- Project viewers may read/list if existing policy allows project document reads, but must not create/edit.
- Project owners/editors may create project documents if existing policy allows.
- Browser code must not compute authorization from role strings.
- Browser code must not store document bodies in localStorage/sessionStorage.
- Responses and tests must not leak cookies, auth headers, signed URLs, storage keys, object keys, prompts, provider keys, or raw server errors.

## Expected Files To Modify

Likely backend/shared:

- `packages/shared/src/documents.ts`
- `apps/api/src/modules/documents/document.service.ts`
- `apps/api/src/modules/documents/document.routes.ts`
- `apps/api/src/modules/documents/document.service.test.ts`

Possibly backend depending on route wiring:

- `apps/api/src/modules/projects/project.routes.ts`
- `apps/api/src/modules/projects/project.service.test.ts`

Likely frontend:

- `apps/web/src/app/App.tsx`
- `apps/web/src/app/App.test.tsx`
- `apps/web/src/features/projects/ProjectDetailPage.tsx`
- `apps/web/src/features/documents/DocumentList.tsx` or a new `DocumentCollectionPanel.tsx`
- `apps/web/src/features/notebook/NotebookPage.tsx`
- `apps/web/src/features/notebook/NotebookPage.test.tsx`
- `apps/web/src/features/projects/ProjectDetailPage.test.tsx`

Only touch `DocumentEditorPage` if route/back-label scope awareness is necessary.

## Acceptance Criteria

- [ ] `GET /documents/notebook` returns only current user's notebook documents.
- [ ] `GET /projects/:projectId/documents` returns project documents only for authorized project members.
- [ ] Unauthorized users and cross-space/missing projects fail closed without leaking document metadata.
- [ ] Notebook documents do not appear in project document lists.
- [ ] Project documents do not appear in notebook lists.
- [ ] Project detail no longer shows the missing project document listing API warning for authorized projects.
- [ ] Project owner/editor can create and open project documents from the project detail surface.
- [ ] Project viewer cannot create project documents if existing policy does not allow creation.
- [ ] `/notebook` renders a real Notebook page.
- [ ] User can create a notebook document, see it in the notebook list, and open it in the shared document editor.
- [ ] Notebook docs and Project docs share `DocumentEditorPage`, draft autosave, formal save, conflict handling, and attachment behavior.
- [ ] No browser-side authorization helper, browser token storage, AI writeback, editor fork, or schema migration is introduced.

## Verification Commands

Run focused checks first:

```bash
pnpm --filter @jixia/api test -- document.service
pnpm --filter @jixia/web test -- ProjectDetailPage
pnpm --filter @jixia/web test -- NotebookPage
pnpm --filter @jixia/web test -- App
```

Then run package-level checks:

```bash
pnpm --filter @jixia/api lint
pnpm --filter @jixia/web lint
pnpm --filter @jixia/web build
```

If route/editor integration changes are broad enough, also run:

```bash
pnpm --filter @jixia/web test -- DocumentEditorPage
pnpm --filter @jixia/web e2e -- document-save
```

## Human Review Gate A

Stop after Task 19 implementation and automated checks. Do not begin Task 20 until manual review confirms:

- Project Docs create/list/open flow works.
- Notebook create/list/open flow works.
- Notebook and Project Docs remain isolated.
- Permission boundaries are correct for owner/editor/viewer/non-member cases.
- Draft autosave and formal save still work through the shared editor.
