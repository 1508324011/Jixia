# Implement document attachments

## Goal

Implement `doc/MVP_implement.md` Task 9 only: server-side document-scoped attachment upload intents, upload confirmation, private download URL issuance, and expired-intent cleanup, while preserving the MVP rule that attachments inherit `Document` permissions and object storage remains private.

## Requirements

- Add attachment API service/routes under `apps/api/src/modules/attachments/**` and a cleanup worker job under `apps/worker/src/jobs/**`.
- Create `apps/api/src/modules/attachments/attachment.service.ts`, `attachment.routes.ts`, and `object-storage.ts` or equivalent testable adapters.
- Create `apps/worker/src/jobs/cleanup-upload-intents.ts` with an injectable storage/repository boundary.
- Register attachment routes from the Fastify app without breaking `/health`, auth, project, permission, or document routes.
- Require an authenticated actor for every attachment API route.
- Create upload intents only when the actor can edit the target document through the existing server-side permission service.
- Enforce locked upload limits: `image <= 100MB`, `file <= 200MB`.
- Generate object keys only on the server, random and unique, under a temporary prefix such as `tmp/uploads/{uuid}/{safeFileName}`; never accept a client-controlled object key.
- Set `UploadIntent.expiresAt = createdAt + 1h` and persist only safe intent metadata.
- Return a transient presigned single-PUT upload URL for intent creation; do not persist signed URLs, request headers containing credentials, tokens, object storage credentials, or file contents.
- Confirm uploads only when the intent is pending, unexpired, owned by the actor, still permitted by document edit permission, and object storage `HEAD` confirms object existence with matching size and MIME type.
- On successful confirmation, atomically transition the intent to `confirmed` and create a `DocumentAttachment` row linked to the document.
- Implement private attachment download by checking document read permission through `canDownloadAttachment` or equivalent server-side permission integration, then returning a transient 15-minute signed URL.
- Do not write `AuditEvent` for each download.
- Implement cleanup that atomically claims expired pending intents, verifies object existence with `HEAD`, deletes temp objects when present, and marks missing objects as cleaned using locked failure/status semantics.
- Handle confirm/cleanup races so `pending -> confirmed` wins over cleanup, and cleanup-claimed intents reject late confirmation safely.
- Use locked failure reasons only: `expired`, `object_missing`, `size_mismatch`, `mime_mismatch`, `storage_error`, `permission_revoked`.
- Keep failure details short and metadata-only; never store headers, signed URLs, tokens, credentials, or file contents.
- Preserve terminal upload-intent metadata retention boundaries; implement only the expired-pending cleanup job in this task unless metadata-retention cleanup is explicitly needed for correctness.
- Add API tests for intent creation, permission denial, size/MIME validation, confirm success, confirm failure cases, download permission checks, and no download audit.
- Add worker tests for expired pending cleanup, missing-object cleanup, storage error/failure handling, and confirmed-intent preservation.

## Out of Scope

- No frontend upload UI or document editor block insertion UI.
- No multipart/resumable uploads.
- No public/share links.
- No hard quota enforcement.
- No AI, LibraryAsset reuse, citation/evidence/reference features, or reader flows.
- No document revision logic changes except consuming document permission checks.
- No auth/session/project/permission-service changes unless strictly required to consume existing server-side helpers.
- No object-storage credentials, provider keys, signed URLs, cookies, authorization headers, prompts, document bodies, or attachment contents in logs, tests, audit payloads, or persisted records.
- No create-pr/commit/merge flow.

## Acceptance Criteria

- [ ] `apps/api/src/modules/attachments/attachment.service.ts`, `attachment.routes.ts`, and `object-storage.ts` exist and are registered from the API app.
- [ ] `apps/worker/src/jobs/cleanup-upload-intents.ts` exists and is testable without real object storage.
- [ ] Upload intent creation enforces document edit permission, locked size limits, server-generated temp object keys, 1-hour expiry, and safe persisted metadata.
- [ ] Upload confirmation verifies pending/unexpired/uploader-owned/permitted intent plus object-storage `HEAD` size/MIME before creating `DocumentAttachment`.
- [ ] Download issuance checks document read/attachment permission and returns a 15-minute transient signed URL without writing per-download audit.
- [ ] Cleanup handles expired pending intents, object deletion/missing-object outcomes, storage failures, and confirm/cleanup races without deleting confirmed attachments.
- [ ] Tests cover attachment service/routes and cleanup worker behavior, including permission denial and sensitive-field exclusion.
- [ ] `pnpm --filter @jixia/api test -- attachments` passes.
- [ ] `pnpm --filter @jixia/worker test -- cleanup-upload-intents` passes.
- [ ] `pnpm lint`, `pnpm type-check`, `pnpm build`, and `pnpm test` pass.

## Technical Notes

- `DocumentAttachment` permissions inherit the owning `Document`: notebook owner only, project members can read, `ProjectViewer` can download, and `SpaceAdmin` has no implicit content or attachment access.
- Bucket access remains private; signed upload/download URLs are transient response values only.
- `UploadIntent.failureDetail` must remain short metadata text and must never include request headers, signed URLs, tokens, credentials, or object contents.
- Existing document hard-delete logic may delete attachment rows by cascade, but actual object-storage deletion for document hard delete is not part of this task unless the attachment service introduces an explicit safe adapter for future use.
