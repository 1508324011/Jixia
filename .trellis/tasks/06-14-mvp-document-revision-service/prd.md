# Implement document revision service

## Goal

Implement `doc/MVP_implement.md` Task 8 only: the server-side document service, revision/draft mechanics, lifecycle routes, and tests for the locked Jixia MVP document model.

This task builds on the existing Fastify API foundation, auth/session service, Project CRUD/membership service, permission service, shared contracts, and Prisma data model. It must preserve the server-first rule: the API owns document access, editing, lifecycle, revision, and conflict decisions.

## Requirements

- Create document module files under `apps/api/src/modules/documents/**`:
  - `document.service.ts` for document business rules, repository boundary, revision/draft/lifecycle logic, and metadata-only audit writes.
  - `document.routes.ts` for Fastify routes that require authenticated actors and call the service.
  - `editor-schema.ts` for the current editor schema version, supported block validation/migration helpers, and the empty editor snapshot.
  - `document.service.test.ts` or equivalent tests for service and route behavior.
- Register document routes from the Fastify app without breaking `/health`, auth/invitation routes, project routes, or permission tests.
- Implement notebook and project document creation:
  - Notebook documents must be owned by `ownerUserId` and must not have `projectId`.
  - Project documents must have `projectId` and must not have `ownerUserId`.
  - Project document creation requires an explicit project membership role of `ProjectOwner` or `ProjectEditor`; `ProjectViewer`, non-members, and `SpaceAdmin` without project membership cannot create project documents.
  - New documents start at `revisionNumber = 0`, `status = active`, and the empty editor snapshot `{ editorSchemaVersion: 1, blocks: [{ id: "root-paragraph", type: "paragraph", content: [] }] }`.
- Implement document reads using server-side permissions:
  - Notebook documents are visible only to their owner.
  - Project documents are visible only to explicit project members.
  - Missing, cross-space, unauthorized, malformed, or invariant-broken records fail closed without leaking content.
- Implement autosave drafts:
  - Draft save updates exactly one `DocumentDraft` per `(documentId, userId)`.
  - Draft save stores `baseRevision` and `draftContent` as editor JSON.
  - Draft save never creates a `DocumentRevision` and never updates `Document.currentRevisionId`.
  - Archived documents reject draft saves.
- Implement formal save/revision creation:
  - Formal save requires an active document and edit permission.
  - Submitted `baseRevision` must equal the current `Document.revisionNumber`.
  - Matching saves create a full `DocumentRevision.contentSnapshot`, update `Document.currentRevisionId`, increment `Document.revisionNumber`, and clear the actor's draft.
  - Stale saves return a conflict payload containing the current revision information and the submitted draft/snapshot without overwriting the current document.
  - Revision snapshots are full editor JSON snapshots with `editorSchemaVersion`; Markdown is not primary storage and diffs are not persisted.
- Implement lifecycle rules:
  - Archived documents are read-only and reject draft/formal saves.
  - Notebook archive/restore/hard-delete is owner-only.
  - Project document archive/restore/hard-delete is `ProjectOwner`-only; `ProjectEditor`, `ProjectViewer`, non-members, and `SpaceAdmin` without project ownership cannot perform lifecycle mutations.
  - Hard delete requires an explicit confirmation field and deletes the document, its drafts, revisions, and attachment records in the database.
  - Hard delete writes metadata-only `AuditEvent` entries; audit metadata must not include document body, draft body, revision snapshots, attachment content, signed URLs, credentials, cookies, headers, prompts, responses, or storage credentials.
- Use the existing server-side permission service where appropriate (`canReadDocument`, `canEditDocument`, `canArchiveDocument`, `canHardDeleteDocument`) and do not create client-side permission helpers.
- Keep editor support limited to the MVP block types: `paragraph`, `heading`, `bulletList`, `orderedList`, `todo`, `quote`, `callout`, `codeBlock`, `divider`, `table`, `image`, and `file`.
- Handle old or unknown editor schema versions through safe server-side migration/normalization helpers before persisting restored or migrated snapshots.

## Out of Scope

- Attachment upload/download, object storage signing, multipart upload, resumable upload, or worker cleanup jobs.
- Object storage deletion integration; this task may remove attachment database rows during document hard delete but must not implement S3/MinIO deletion flows.
- AI document writing, AI merge, AI context expansion, AI routes, AI conversations, or AI provider calls.
- Frontend editor UI, browser authorization logic, or client-side permission helpers.
- Project CRUD/membership changes except consuming existing project membership/permission state.
- Auth/session/invitation changes except consuming the existing authenticated actor/session mechanism.
- Public links, realtime collaboration, CRDT/Yjs, evidence graph, citations, references, Library assets, Reader excerpts, or Notebook-to-Project provenance tracking.
- Markdown as primary storage, revision diffs, automatic conflict merge, or AI-assisted conflict resolution.

## Acceptance Criteria

- [ ] `apps/api/src/modules/documents/document.service.ts` implements document creation, read, draft, formal save, conflict, archive, restore, and hard-delete business rules server-side.
- [ ] `apps/api/src/modules/documents/document.routes.ts` registers document routes that require authenticated actors and return only transport-safe DTOs.
- [ ] `apps/api/src/modules/documents/editor-schema.ts` defines the current editor schema version, supported block handling, empty editor snapshot, and safe snapshot normalization/migration helpers.
- [ ] Tests cover notebook owner-only access, project member access, project editor/owner creation and editing, ProjectViewer denial for edits, SpaceAdmin non-bypass, draft save without revision creation, formal save with full snapshot, stale save conflict, archived document save rejection, lifecycle permissions, hard-delete confirmation, and metadata-only audit writes.
- [ ] Existing `/health`, auth/session/invitation, project CRUD/membership, and permission tests remain green.
- [ ] `pnpm --filter @jixia/api test -- documents` passes.
- [ ] `pnpm lint` passes.
- [ ] `pnpm type-check` passes.
- [ ] `pnpm build` passes.
- [ ] `pnpm test` passes.

## Technical Notes

- `doc/MVP_rule.md` is the source of truth when implementation sketches conflict with target-state design.
- Use Prisma transactions for formal save and lifecycle mutations where multiple records must remain consistent.
- Keep route handlers thin; business rules belong in the document service.
- Keep repository/service tests DB-free where practical, following the existing auth/project/permission module testing style.
- Public service/route responses must not expose raw database internals, project membership internals beyond safe DTOs, storage keys, signed URLs, cookies, session IDs, passwords, prompts, responses, document bodies in logs, or audit-prohibited payloads.
