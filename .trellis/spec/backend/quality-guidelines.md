# Backend Quality Guidelines

To be filled by the team.

Initial MVP constraints:

- API checks all document, attachment, project, and AI context permissions.
- SpaceAdmin must not get implicit research-content access.
- Tests should cover permission boundaries and database constraints when backend code exists.

## Scenario: MVP Permission Service Contract

### 1. Scope / Trigger
- Trigger: `apps/api/src/modules/permissions/permission.service.ts` defines the reusable server-side authority for document and attachment access checks.
- Scope: permission service functions, Prisma-backed repository reads, dependency-injected test repositories, and permission boundary tests under `apps/api/src/modules/permissions/**`.
- Boundary: The permission service must not add routes, mutate documents/projects/attachments, write audit events, call object storage, import frontend/browser code, or move permission helpers into `packages/shared`.

### 2. Signatures
- `canReadDocument(userId: string, documentId: string): Promise<boolean>`.
- `canEditDocument(userId: string, documentId: string): Promise<boolean>`.
- `canArchiveDocument(userId: string, documentId: string): Promise<boolean>`.
- `canHardDeleteDocument(userId: string, documentId: string): Promise<boolean>`.
- `canDownloadAttachment(userId: string, attachmentId: string): Promise<boolean>`.
- Testable factory: `createPermissionService(repository: PermissionRepository): PermissionService`.
- Default repository: production permission functions use Prisma data from `Document`, `ProjectMember`, and `DocumentAttachment` through `@jixia/db`.

### 3. Contracts
- Permission functions return booleans only. They must not reveal whether a document, attachment, user, project, or membership exists.
- Notebook documents are readable, editable, lifecycle-authorized, and hard-deletable only when `Document.type = "notebook"`, `ownerUserId = userId`, and `projectId = null`.
- Project documents are readable only by a `ProjectMember` for `Document.projectId`; `ProjectOwner` and `ProjectEditor` can edit active project documents; only `ProjectOwner` can archive, restore, or hard delete project documents.
- `ProjectViewer` can read project documents and download their attachments, but cannot edit, archive, restore, or hard delete them.
- `SpaceAdmin` has no project content bypass. A `SpaceAdmin` user must also hold the required `ProjectMember.role` for the specific project.
- Attachment download inherits read permission from `DocumentAttachment.documentId`; uploader identity alone is not sufficient.
- Archived documents are read-only for edit checks; lifecycle authority remains role/owner based so archive/restore services can use the same server-side authority.

### 4. Validation & Error Matrix
- Missing user, document, attachment, project membership, or malformed document owner/project shape -> return `false`.
- Repository or Prisma read error during a permission check -> return `false` without logging sensitive details.
- Notebook document with both `ownerUserId` and `projectId`, or with neither -> return `false`.
- Project document without `projectId`, or with `ownerUserId` set -> return `false`.
- Attachment pointing at an unreadable, missing, or malformed document -> return `false`.

### 5. Good/Base/Bad Cases
- Good: a future document route calls `await canEditDocument(session.userId, documentId)` before saving a draft or revision.
- Good: attachment download routes call `await canDownloadAttachment(session.userId, attachmentId)` before issuing a transient signed URL.
- Base: DB-free unit tests inject a repository fixture and assert the full owner/member/viewer/non-member matrix.
- Bad: checking `SpaceAdmin` in a document route to bypass `ProjectMember`.
- Bad: exporting `canEditDocument` from `packages/shared` or computing document permissions in the web client.

### 6. Tests Required
- Focused API package test: `pnpm --filter @jixia/api test -- permissions` must cover notebook owner-only access, project owner/editor/viewer/non-member access, `SpaceAdmin` non-bypass, missing/malformed records fail-closed behavior, repository-error fail-closed behavior, archived read-only edit behavior, and attachment read-permission inheritance.
- Repository checks: `pnpm lint`, `pnpm type-check`, `pnpm build`, and `pnpm test` must pass before PR readiness.
- Contract review: scan `apps/web/**` and `packages/shared/**` for client-side permission helpers before merging permission-service work.

### 7. Wrong vs Correct
#### Wrong
```typescript
export function canEditDocumentOnClient(role: string) {
  return role === "SpaceAdmin" || role === "ProjectOwner";
}
```

#### Correct
```typescript
export async function canEditDocument(userId: string, documentId: string): Promise<boolean> {
  return (await getDefaultPermissionService()).canEditDocument(userId, documentId);
}
```

## Scenario: MVP Project CRUD Membership Contract

### 1. Scope / Trigger
- Trigger: `apps/api/src/modules/projects/**` implements server-side project metadata CRUD and explicit project membership management for the MVP.
- Scope: project service/repository logic, Fastify project routes, app route registration, project DTO responses, metadata-only audit writes, and focused tests under `apps/api/src/modules/projects/**`.
- Boundary: Project CRUD work must not add document bodies or lifecycle routes, attachment storage routes, AI calls/configuration, worker jobs, frontend permission helpers, auth/session implementation changes, or multi-space switching.

### 2. Signatures
- Routes: `GET /projects`, `POST /projects`, `GET /projects/:projectId`, `GET /projects/:projectId/members`, `POST /projects/:projectId/members`, `PATCH /projects/:projectId/members/:userId`, and `DELETE /projects/:projectId/members/:userId`.
- App registration: `createApiApp` registers `projectRoutes` alongside existing cookie, auth, invitation, and health routes without changing `GET /health` semantics.
- Service factory: `createProjectService(repository: ProjectRepository)` returns methods for listing, creating, reading, listing members, adding members, updating member roles, and removing members.
- Default service: production route handlers resolve the authenticated actor from the current session and use the default Prisma-backed project repository.

### 3. Contracts
- Every project route requires an authenticated actor derived from the server-side session/current-user view; route payloads must not choose an effective space or actor.
- The MVP remains one-lab/one-current-space: project creation and lookups use the actor's current `spaceId` and active `SpaceMember` context only.
- Any active `SpaceMember` may create a project, and creation must atomically create the project plus a `ProjectOwner` membership for the creator.
- Project metadata and member lists are private to explicit `ProjectMember`s; `SpaceAdmin` does not bypass project visibility or member-management rules unless also a project member with the required project role.
- Only `ProjectOwner` may add members, update project member roles, or remove members; `ProjectEditor` and `ProjectViewer` can never manage membership.
- Project membership updates must preserve at least one remaining `ProjectOwner` so the last owner cannot be demoted or removed.
- Project creation and membership mutations write `AuditEvent` rows with metadata only; audit metadata must exclude document bodies, drafts, prompts, responses, credentials, session ids, cookies, authorization headers, signed URLs, storage credentials, raw invitation tokens, and passwords.

### 4. Validation & Error Matrix
- Missing or invalid session, actor user, actor space, or actor space membership -> reject without exposing credentials or session details.
- Missing projects or projects outside the actor's current space -> fail closed with a not-found style response.
- Non-project members reading project details/member lists -> fail closed without returning project metadata.
- ProjectEditor, ProjectViewer, non-member, or SpaceAdmin-without-required-project-role managing members -> reject as forbidden.
- Missing target users, cross-space target users, duplicate members, invalid roles, missing memberships, and last-owner demotion/removal -> reject before mutation/audit write.

### 5. Good/Base/Bad Cases
- Good: `POST /projects` ignores any mismatched payload `spaceId`, uses the session actor's current space, and returns transport-safe project/member DTOs.
- Good: `ProjectOwner` adds a `ProjectViewer`, promotes them to `ProjectEditor` or `ProjectOwner`, and removes members while preserving owner continuity.
- Base: API tests inject a fake auth service and repository to prove route authentication, health-route compatibility, member-only visibility, owner-only management, SpaceAdmin non-bypass, and metadata-only audits.
- Bad: a route trusts `spaceId` from the client to switch labs, allows `ProjectOwner` creation through add-member payloads, or lets `SpaceAdmin` read private projects without explicit project membership.
- Bad: audit metadata includes `sessionId`, `cookie`, `authorization`, `prompt`, `response`, `contentSnapshot`, raw tokens, passwords, signed URLs, or provider/storage credentials.

### 6. Tests Required
- Focused API package test: `pnpm --filter @jixia/api test -- projects` must cover regular `SpaceMember` project creation, creator-owner membership, member-only project/member visibility, owner add/update/remove operations, ProjectEditor/ProjectViewer denial, SpaceAdmin non-bypass, cross-space/missing fail-closed behavior, owner-continuity guards, route registration, route authentication, and metadata-only audit events.
- Existing route/service tests for `/health`, auth, invitations, and permissions must remain green.
- Repository checks: `pnpm lint`, `pnpm type-check`, `pnpm build`, and `pnpm test` must pass before PR readiness.
- Contract review: scan `apps/web/**` and `packages/shared/**` to confirm no client-side project permission helper or runtime authorization decision was added.

### 7. Wrong vs Correct
#### Wrong
```typescript
app.post("/projects/:projectId/members", async (request) => {
  const { spaceId, userId, role } = request.body as { spaceId: string; userId: string; role: string };
  if (role === "SpaceAdmin") return addProjectMember(spaceId, userId, "ProjectOwner");
});
```

#### Correct
```typescript
app.post("/projects/:projectId/members", async (request, reply) => {
  const actor = await requireActor(request, reply);
  return projectService.addMember({ actor, projectId, userId, role: "ProjectViewer" });
});
```

## Scenario: MVP Document Revision Service Contract

### 1. Scope / Trigger
- Trigger: `apps/api/src/modules/documents/**` implements server-side document creation, reads, draft autosave, formal revisions, conflicts, lifecycle transitions, hard delete, editor snapshot normalization, and focused service/route tests for the locked MVP document model.
- Scope: document service/repository logic, Fastify document routes, app route registration, editor schema helpers, metadata-only audit writes, shared document DTO consumption, and tests under `apps/api/src/modules/documents/**`.
- Boundary: Document service work must not add attachment upload/download flows, object-storage signing or deletion, AI writing/merge/context/provider calls, frontend editor UI, client-side permission helpers, public links, realtime collaboration, CRDT/Yjs, evidence/citation/library/reference flows, Markdown primary storage, persisted diffs, or worker cleanup behavior.

### 2. Signatures
- Routes: `POST /documents/notebook`, `POST /documents/project`, `GET /documents/:documentId`, `PUT /documents/:documentId/draft`, `POST /documents/:documentId/revisions`, `POST /documents/:documentId/archive`, `POST /documents/:documentId/restore`, and `DELETE /documents/:documentId`.
- App registration: `createApiApp` registers `documentRoutes` alongside cookie, auth, project, and health routes without changing `GET /health` semantics.
- Service factory: `createDocumentService(repository, permissions)` returns methods for notebook/project creation, reading, draft save, revision save, archive, restore, and hard delete.
- Editor schema helpers: `currentDocumentEditorSchemaVersion`, `supportedEditorBlockTypes`, `createEmptyEditorSnapshot()`, and `normalizeEditorSnapshot(value)` define and normalize server-owned editor JSON snapshots.
- Default service: production route handlers resolve the authenticated actor from the server-side session and use the Prisma-backed document repository plus the existing server-side permission service.

### 3. Contracts
- The API owns document authorization and lifecycle decisions. Routes must require authenticated actors and must call server-side permission functions rather than trusting client-provided roles or shared/client helpers.
- Notebook documents require `ownerUserId = actor.userId` and `projectId = null`; project documents require `projectId` and `ownerUserId = null` and can be created only by explicit `ProjectOwner` or `ProjectEditor` members.
- New documents start as `status = active`, `revisionNumber = 0`, `currentRevisionId = null`, and the empty editor snapshot `{ editorSchemaVersion: 1, blocks: [{ id: "root-paragraph", type: "paragraph", content: [] }] }`.
- Reads fail closed for missing, unauthorized, cross-space, malformed, invariant-broken, or unnormalizable stored records without leaking document content.
- Draft autosave upserts exactly one `DocumentDraft` per `(documentId, userId)`, stores `baseRevision` and editor JSON, and must not create revisions or update `Document.currentRevisionId`.
- Formal saves require an active editable document and matching `baseRevision`; successful saves create full `DocumentRevision.contentSnapshot` JSON, update current revision and revision number, clear the actor draft, and stale saves return a conflict payload without overwriting the current document.
- Archived documents are read-only. The archived-status guard must run before trusting edit-permission adapters so a permissive or stale adapter cannot authorize draft or formal saves.
- Notebook archive/restore/hard-delete is owner-only; project lifecycle mutations are `ProjectOwner`-only and `SpaceAdmin` has no project-content bypass without explicit project ownership.
- Hard delete requires the shared confirmation literal, deletes document drafts, revisions, and attachment rows in the database, and writes metadata-only audit events.
- Audit metadata keys must be checked case-insensitively and recursively. Forbidden keys include document bodies, draft bodies, revision snapshots, attachment content, prompts, responses, session/cookie/header/token/password fields, signed URLs, object keys, storage keys, storage credentials, and provider credentials.
- Supported editor blocks remain limited to `paragraph`, `heading`, `bulletList`, `orderedList`, `todo`, `quote`, `callout`, `codeBlock`, `divider`, `table`, `image`, and `file`; old or versionless supported snapshots may be normalized, while unknown future versions and unsupported block types are rejected.

### 4. Validation & Error Matrix
- Missing or invalid session -> reject as unauthorized without exposing session details.
- Missing project, cross-space project, missing document, cross-space document, unauthorized read, malformed document ownership shape, invalid current revision pointer, or stored snapshot normalization failure -> not-found style failure.
- ProjectViewer, non-member, or SpaceAdmin without explicit required project role creating/editing/lifecycle-mutating project documents -> forbidden.
- Invalid title, base revision, payload shape, editor snapshot, or hard-delete confirmation -> bad request.
- Archived draft or formal save -> conflict/read-only failure before any draft/revision write.
- Formal save with stale `baseRevision` or concurrent revision unique-race -> conflict response with current revision information and submitted snapshot, without creating or replacing the current revision.
- Hard delete missing after permission check -> not-found style failure; hard delete must not invoke object-storage deletion or cleanup workers.

### 5. Good/Base/Bad Cases
- Good: a project editor creates a project document and saves a full editor JSON revision after `canEditDocument` passes.
- Good: an archived document read remains available to authorized readers, while draft and revision writes return a read-only conflict.
- Good: hard delete audit metadata contains IDs, document type, owner/project IDs, revision number, and deletion counts only.
- Base: document route tests inject fake auth and document services while still proving `/health` remains registered.
- Bad: a route trusts a client role, treats `SpaceAdmin` as implicit project ownership, persists Markdown/diffs as primary revision storage, or stores `contentSnapshot` in audit metadata.
- Bad: document hard delete signs download URLs, deletes S3/MinIO objects, starts worker cleanup, invokes AI merge/writing, or adds browser/editor authorization logic.

### 6. Tests Required
- Focused API package test: `pnpm --filter @jixia/api test -- documents` must cover notebook owner-only access, project member access, project owner/editor creation and editing, ProjectViewer edit denial, SpaceAdmin non-bypass, draft save without revision creation, formal save with full snapshot, stale save conflict, archived save rejection including permissive-adapter regression coverage, lifecycle permissions, hard-delete confirmation, recursive metadata-only audit enforcement, route authentication, route conflict status, and route registration with `/health`.
- Existing route/service tests for `/health`, auth/session/invitation, project CRUD/membership, and permissions must remain green.
- Repository checks: `pnpm lint`, `pnpm type-check`, `pnpm build`, and `pnpm test` must pass before PR readiness.
- Contract review: scan `apps/web/**` and `packages/shared/**` to confirm no client-side document permission helper or runtime authorization decision was added.

### 7. Wrong vs Correct
#### Wrong
```typescript
app.post("/documents/:documentId/revisions", async (request) => {
  const { role, markdown, diff } = request.body as { role: string; markdown: string; diff: string };
  if (role === "SpaceAdmin") {
    return saveRevision({ markdown, diff });
  }
});
```

#### Correct
```typescript
app.post("/documents/:documentId/revisions", async (request, reply) => {
  const actor = await requireActor(request, reply);
  return documentService.saveRevision({ actor, documentId, baseRevision, contentSnapshot });
});
```

## Scenario: MVP Document Collection Contract

### 1. Scope / Trigger
- Trigger: `apps/api/src/modules/documents/**`, `packages/shared/src/documents.ts`, and `apps/web/src/features/{documents,notebook,projects}/**` implement document collection list/create/open flows for Notebook and Project Docs.
- Scope: `ListDocumentsResponse`, `GET /documents/notebook`, `GET /projects/:projectId/documents`, document repository list methods, collection UI, Notebook routing, and Project Detail document rows.
- Boundary: Collection work must not add browser-side permission helpers, expose editor snapshots/drafts/revisions/attachments in list payloads, fork `DocumentEditorPage`, add notebook trees/search/tags/backlinks, create schema migrations, or introduce AI writeback.

### 2. Signatures
- Shared list payload: `ListDocumentsResponse = { readonly documents: readonly DocumentDTO[] }` unless a future narrower transport-safe summary is deliberately introduced.
- Repository methods: `listNotebookDocuments(ownerUserId: string): Promise<readonly DocumentRecord[]>` and `listProjectDocuments(projectId: string): Promise<readonly DocumentRecord[]>`.
- Service methods: `listNotebookDocuments(actor)` and `listProjectDocuments({ actor, projectId })` return `ListDocumentsResponse` after server-side authorization and context filtering.
- Routes: `GET /documents/notebook` and `GET /projects/:projectId/documents` require authenticated actors derived from the server-side session.
- Web collection component: one shared collection UI accepts a `notebook` or `project` scope and opens documents through the shared document editor route.

### 3. Contracts
- Notebook collection lists only `Document.type = "notebook"` rows owned by the current actor, with `projectId = null` and no project-space context.
- Project collection lists only `Document.type = "project"` rows for an actor who is an explicit member of that project in the actor's current space; `SpaceAdmin` has no implicit project content bypass.
- Malformed, cross-space, missing-project, non-member, unreadable, or permission-adapter-error cases fail closed without returning document metadata.
- List payloads must contain transport-safe document metadata only: IDs, type/status/title, owner/project IDs, revision pointers/numbers, and timestamps. They must not include editor snapshots, draft bodies, revision snapshots, attachment storage keys, signed URLs, object keys, prompts, provider payloads, cookies, auth headers, or raw server errors.
- Project document creation remains `POST /documents/project`; Notebook creation remains `POST /documents/notebook`; create/edit authorization stays in the API.
- Notebook and Project Docs must reuse `DocumentEditorPage`, draft autosave, formal revision save, conflict handling, archived read-only state, and attachment behavior.
- Browser code may show server responses and submit intent, but must not compute authorization from roles or cache document bodies in local/session storage.

### 4. Validation & Error Matrix
- Missing or invalid session on either list route -> unauthorized response with no session detail.
- Missing project, cross-space project, non-member actor, or `SpaceAdmin` without explicit project membership -> not-found style response for project lists.
- Project viewer with read membership -> may list/read project documents, but project document creation remains forbidden by the existing create policy.
- Notebook document with a project ID, project document with an owner ID, cross-space project document, or list row failing `canReadDocument` -> omit the row or fail closed without leaking metadata.
- Any list response exposes content snapshots, drafts, storage/object keys, signed URLs, prompts, provider data, cookies, authorization headers, or stack traces -> block PR.

### 5. Good/Base/Bad Cases
- Good: `GET /documents/notebook` returns `{ documents: [DocumentDTO...] }` for the current owner and omits another user's notebook documents.
- Good: a project viewer receives project document rows from `GET /projects/:projectId/documents` while a non-member receives a not-found style response.
- Good: `/notebook` renders a real collection page, posts notebook creation to the API, and opens `/notebook/documents/:documentId` through `DocumentEditorPage`.
- Base: `ProjectDetailPage` loads project metadata and document rows from separate server endpoints and no longer renders missing-route fallback copy for authorized projects.
- Bad: frontend code checks `ProjectOwner` or `ProjectEditor` strings to decide whether a create button is allowed.
- Bad: a list endpoint joins and returns `currentSnapshot`, `draftContent`, attachment object keys, signed URLs, AI prompts, or provider request metadata.

### 6. Tests Required
- API tests must cover notebook owner-only lists, project member lists, viewer read/list behavior, non-member and `SpaceAdmin` non-bypass failures, notebook/project isolation, malformed/cross-space row hiding, route authentication, and transport-safe list payloads.
- Web tests must cover `ProjectDetailPage` loading the real project document endpoint, absence of missing-route fallback copy, project document create/open intent, `NotebookPage` list/create/open behavior, and `/notebook` routing as a real surface.
- Final Task 19 checks should include `pnpm --filter @jixia/api test -- document.service`, `pnpm --filter @jixia/web test -- ProjectDetailPage`, `pnpm --filter @jixia/web test -- NotebookPage`, `pnpm --filter @jixia/web test -- App`, `pnpm --filter @jixia/api lint`, `pnpm --filter @jixia/web lint`, and `pnpm --filter @jixia/web build`.

### 7. Wrong vs Correct
#### Wrong
```typescript
const canCreate = currentUser.projectRole === "ProjectOwner" || currentUser.projectRole === "ProjectEditor";
const response = await apiFetch(`/documents/project?projectId=${projectId}`);
```

#### Correct
```typescript
const response = await apiFetch<ListDocumentsResponse>(`/projects/${encodeURIComponent(projectId)}/documents`);
```
