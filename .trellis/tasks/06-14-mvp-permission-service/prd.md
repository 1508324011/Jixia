# Implement Permission Service

## Goal

Implement `doc/MVP_implement.md` Task 6 only: a server-side API permission service for document and attachment access decisions. This task defines reusable permission functions that future document, project, and attachment routes will call; it must preserve the MVP rule that the Fastify API is the permission and business-rule center.

## Requirements

- Create `apps/api/src/modules/permissions/permission.service.ts` with the required permission functions:
  - `canReadDocument(userId: string, documentId: string): Promise<boolean>`
  - `canEditDocument(userId: string, documentId: string): Promise<boolean>`
  - `canArchiveDocument(userId: string, documentId: string): Promise<boolean>`
  - `canHardDeleteDocument(userId: string, documentId: string): Promise<boolean>`
  - `canDownloadAttachment(userId: string, attachmentId: string): Promise<boolean>`
- Create `apps/api/src/modules/permissions/permission.errors.ts` only if helpful for reusable server-side permission errors; do not expose sensitive details.
- Keep all permission decisions server-side and Prisma-backed by default, while allowing dependency injection or fixtures for DB-free unit tests.
- Implement document rules exactly:
  - Notebook documents are readable/editable/archiveable/restorable/hard-deletable only by `ownerUserId`.
  - Project documents are readable by `ProjectMember` only.
  - Project documents are editable by `ProjectOwner` and `ProjectEditor` only.
  - Project documents are archiveable/restorable/hard-deletable by `ProjectOwner` only.
  - `ProjectViewer` can read project documents but cannot edit, archive, restore, or hard delete them.
  - `SpaceAdmin` has no project content bypass unless the same user is also a `ProjectMember` with the required project role.
- Implement attachment download rule: `canDownloadAttachment` inherits the owning document's read permission through `DocumentAttachment.documentId`.
- Return booleans for the required functions; missing documents/attachments, users without membership, revoked assumptions, and unknown records should fail closed with `false` rather than leaking record existence.
- Keep the task focused on permission service and tests only. Do not add project CRUD routes, document service/routes, attachment upload/download routes, auth changes, audit writing, AI features, worker jobs, frontend UI, or client-side permission helpers.
- Keep logs/errors/tests free of document content, draft content, revision snapshots, attachment content, storage keys where not needed, signed URLs, cookies, authorization headers, passwords, invitation tokens, session IDs, provider keys, prompts, or responses.

## Acceptance Criteria

- `apps/api/src/modules/permissions/permission.service.ts` exports the five required functions with the exact names above.
- Permission logic uses server-side data from `Document`, `ProjectMember`, and `DocumentAttachment` relationships and does not import browser/frontend code.
- Tests in `apps/api/src/modules/permissions/permission.service.test.ts` cover the permission matrix for notebook owner-only access, project owner/editor/viewer/non-member access, `SpaceAdmin` non-bypass, missing records fail-closed behavior, and attachment permission inheritance.
- No new business endpoints or frontend permission decisions are introduced.
- Validation passes:
  - `pnpm --filter @jixia/api test -- permissions`
  - `pnpm lint`
  - `pnpm type-check`
  - `pnpm build`
  - `pnpm test`

## Out of Scope

- Project CRUD and project membership mutation APIs.
- Document creation, draft save, formal revision save, archive/restore/delete services.
- Attachment upload intent, confirmation, object storage, signed download URL routes, or cleanup worker.
- Audit event writing.
- Auth/session/invitation changes.
- Frontend UI or client-side permission evaluation.

## Technical Notes

- `doc/MVP_rule.md` overrides `doc/Design.md` for MVP behavior.
- The API is the permission authority. Shared contracts may describe data shapes, but permission helpers must not move into `packages/shared` or the web client.
- Prefer a narrow repository/dependency boundary for tests if it avoids live database requirements, but the default production service should use the Prisma data model from `@jixia/db`.
- Do not accidentally treat `SpaceAdmin` as a project content reader. This is a hard MVP invariant.
