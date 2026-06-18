# Backend Logging Guidelines

To be filled by the team.

Initial MVP constraints:

- Logs and audit events must not contain document body, AI prompt/response, API keys, tokens, signed URLs, request headers, or object storage credentials.
- Audit is for governance actions, not content surveillance.

## Scenario: MVP Audit Service Boundary

### 1. Scope / Trigger
- Trigger: `apps/api/src/modules/audit/**` defines the reusable server-side audit writer, recursive metadata validation, authenticated audit inspection route, and focused audit tests.
- Scope: audit service/repository interfaces, Prisma-backed audit persistence, Fastify audit routes, route registration in `apps/api/src/app.ts`, and metadata-only audit checks reused by governance-writing services.
- Boundary: Audit work must not add frontend audit UI, bulk export, retention policy, tamper-proof storage, attachment-download events, AI conversation deletion events, personal AI conversation content, per-call AI prompt/response details, or browser-side redaction decisions.

### 2. Signatures
- Writer: `writeAuditEvent(input: { actorUserId: string; action: string; targetType: string; targetId: string; payload: Record<string, unknown> })` persists one `AuditEvent` row after redaction validation.
- Redaction guard: `ensureMetadataOnlyAuditPayload(payload: Record<string, unknown>): void` rejects forbidden keys and obvious secret-bearing values before persistence or DTO emission.
- Read route: `GET /audit/events` is authenticated and supports conservative metadata filters by `targetType`, `targetId`, `action`, `limit`, and `cursor`.
- App registration: `createApiApp` registers `auditRoutes` with injectable test services and without changing `/health` behavior.

### 3. Contracts
- The API owns audit writing, redaction enforcement, and audit visibility. Browser-facing code must not decide whether audit payload content is safe.
- Audit payloads are metadata-only JSON records. They may contain governance identifiers, roles, statuses, counts, timestamps, and safe configuration metadata only.
- Audit metadata validation must fail closed before persistence and before returning persisted DTOs, including for records read back from storage.
- Forbidden audit keys are matched recursively at any nested object or array depth, case-insensitively, and with common separator variants normalized.
- Forbidden audit data includes document bodies, draft content, revision snapshots, attachment bodies, AI prompts/responses, selected context bodies, provider payload bodies, request headers, cookies, authorization values, tokens, signed URLs, raw or encrypted API keys, object keys, storage keys, and storage credentials.
- Audit inspection is conservative until a fuller policy exists: routes require an authenticated current session and are limited to `SpaceAdmin` actors without exposing session details.
- Audit errors and DTOs must not echo sensitive keys, values, content bodies, request headers, cookies, signed URLs, tokens, or credentials.

### 4. Validation & Error Matrix
- Missing or invalid route session -> unauthorized response without exposing cookie or session identifiers.
- Non-admin audit inspector -> forbidden response without leaking whether matching audit events exist.
- Empty, overlong, or malformed `actorUserId`, `action`, `targetType`, `targetId`, pagination, or filters -> sanitized bad request.
- Payload contains a forbidden key at the top level, nested inside an object, or nested inside an array -> sanitized bad request before persistence.
- Payload contains non-JSON values, cyclic structures, class instances, non-finite numbers, bearer tokens, or obvious presigned URL fragments -> sanitized bad request before persistence.
- Persisted audit metadata that fails the metadata-only guard during reads -> block DTO emission and return a sanitized audit failure instead of leaking the stored payload.

### 5. Good/Base/Bad Cases
- Good: `project_member.role_updated` metadata includes project ID, target user ID, previous role, next role, and count-style governance fields only.
- Good: `document.hard_deleted` metadata includes document ID, document type, owner/project IDs, revision number, and deletion counts only.
- Base: audit route tests inject fake auth and audit services, prove `/health` remains registered, and verify unauthenticated/member users cannot inspect audit events.
- Bad: audit metadata includes `contentSnapshot`, `draftContent`, `prompt`, `response`, `selectedContextBody`, `authorization`, `cookie`, `token`, `signedUrl`, `apiKey`, `encryptedApiKey`, `storageKey`, `objectKey`, or `storageCredentials`.
- Bad: attachment download or AI conversation deletion writes an audit event, or an audit route accepts a client-provided actor/role to decide visibility.

### 6. Tests Required
- Focused API package test: `pnpm --filter @jixia/api test -- audit` must cover metadata-only persistence, top-level forbidden key rejection, nested object/array forbidden key rejection, normalized key matching, sensitive value rejection, sanitized errors, read DTO redaction enforcement, route authentication, conservative admin-only inspection, route registration, and absence of a write route.
- Existing route/service tests for `/health`, auth/session/invitation, projects, documents, attachments, AI, and permissions must remain green.
- Repository checks: `pnpm --filter @jixia/api lint`, `pnpm -r test`, `pnpm -r lint`, and `pnpm -r build` must pass before PR readiness.
- Contract review: scan audit-producing call sites to confirm no attachment-download, AI conversation deletion, personal AI content, per-call AI prompt/response, request header, credential, token, signed URL, object key, or storage key payload is added.

### 7. Wrong vs Correct
#### Wrong
```typescript
await writeAuditEvent({
  actorUserId,
  action: "document_revision.saved",
  targetType: "DocumentRevision",
  targetId: revision.id,
  payload: { contentSnapshot, authorization: request.headers.authorization }
});
```

#### Correct
```typescript
await writeAuditEvent({
  actorUserId,
  action: "document.hard_deleted",
  targetType: "Document",
  targetId: documentId,
  payload: { documentId, documentType, projectId, revisionNumber, deletedRevisionCount }
});
```
