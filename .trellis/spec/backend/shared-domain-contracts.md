# Shared Domain Contracts

## Scenario: MVP Shared Domain Contract Boundary

### 1. Scope / Trigger
- Trigger: `packages/shared/src/**` contains transport-safe MVP contracts for auth/project membership, documents/editor snapshots, attachments/upload intents, and private AI configuration/conversations.
- Scope: Shared TypeScript constants, literal unions, DTOs, request/response shapes, and lightweight pure helpers exported from `packages/shared/src/index.ts`.
- Boundary: Shared contracts must not implement authorization, persistence, storage integration, AI provider calls, worker jobs, route handlers, UI flows, Prisma schema, or runtime environment access.

### 2. Signatures
- Auth module: `spaceRoles`, `projectRoles`, `CurrentSessionView`, `CurrentUserView`, `ProjectDTO`, `ProjectMembershipDTO`, invitation request/response DTOs, and role guard helpers.
- Documents module: `DocumentType`, `DocumentStatus`, `EditorBlockType`, editor schema-version constants, editor snapshot/draft/revision/save/conflict/lifecycle request and response DTOs.
- Attachments module: `AttachmentMetadataDTO`, `UploadIntentDTO`, upload status/failure literal unions, upload/download request and response DTOs, upload expiry/retention constants, and image/file upload limits.
- AI module: `AIProviderConfigView`, safe provider upsert/import request contracts, private conversation/message/context snapshot DTOs, renderable conversation message parts, source/context attachment cards, safe run-step metadata, future approval/action DTOs, and aggregate usage views.
- Entrypoint: `packages/shared/src/index.ts` must re-export the domain modules as the primary shared API; any foundation placeholder exports are legacy scaffold helpers only.

### 3. Contracts
- Shared contracts are transport-safe TypeScript only: no Prisma, Fastify, React, browser state, server-private state, environment reads, object storage credentials, raw API keys, token hashes, request headers, signed URLs as persisted config, or provider runtime clients.
- API remains the authority for permissions and business rules. Shared DTO names may describe request shapes but must not imply that frontend code can decide document, attachment, project, AI, or audit access.
- Locked MVP values must match `doc/MVP_rule.md`: project roles, document types/statuses, supported block types, attachment upload statuses/failure reasons, upload limits, AI config view fields, private AI conversation model, and redaction-sensitive omissions.
- Signed upload/download URLs may appear only as transient response fields for direct upload/download flows; they must not appear in persisted metadata/config DTOs.
- Prompt, response, selected context body, API key, storage credential, and signed URL payloads must stay out of audit/log/usage DTOs. AI message and selected-context content may exist only inside the private conversation model.
- AI render metadata must be projection-safe. Message parts, source cards, run steps, and action descriptors may reference document IDs, block IDs, titles, revision numbers, timestamps, statuses, labels, and disabled action reasons; they must not expose provider request/response JSON, headers, raw or encrypted keys, signed URLs, stack traces, audit payloads, or server runtime state.
- AI writeback/action DTOs are allowed only as future-safe descriptors. Until a real server approval and document mutation contract exists, any document-changing action must be disabled/unavailable and must not imply browser-side mutation authority.

### 4. Validation & Error Matrix
- Shared module imports server/browser frameworks or generated database clients -> block PR because contracts are no longer transport-safe.
- DTO exposes password hashes, reset flows, raw provider keys, encrypted keys, token hashes, object keys, storage credentials, request headers, prompt logs, response logs, or signed URLs in persisted views -> block PR and remove the field.
- Request/response shape performs authorization-like decisions or exports frontend permission helpers -> block PR because the API owns authorization.
- Literal union diverges from `doc/MVP_rule.md` without updating the rule document -> block PR until product rules and shared constants are synchronized.
- Shared package adds route handlers, Prisma schema, migrations, provider calls, worker cleanup logic, storage integration, or UI state -> block PR as scope creep.

### 5. Good/Base/Bad Cases
- Good: `UploadIntentDTO` stores status, failure reason, timestamps, size, checksum, and user/document identifiers while a create/download response carries a short-lived URL separately.
- Good: `AIProviderConfigView` exposes `hasKey` and `keyPreview` but never raw or encrypted provider credentials.
- Good: `AIConversationMessageDTO.parts` contains markdown text, source-card metadata, run-step status, and a disabled approval-preview action while the API keeps provider payloads and keys server-side.
- Base: A module exports readonly-friendly DTOs and pure literal-union guard helpers with no runtime dependency beyond TypeScript.
- Bad: A shared helper named `canEditDocument()` checks roles and document ownership on the client side.
- Bad: A shared provider config DTO includes `encryptedApiKey`, `apiKey`, request headers, or an imported auth file payload.
- Bad: A shared AI source or run-step DTO includes raw provider traces, authorization headers, stack traces, signed URLs, or browser-executable document writeback instructions.

### 6. Tests Required
- Typecheck/lint: `pnpm lint` and `pnpm type-check` must pass with the shared contracts included in the workspace TypeScript project.
- Build: `pnpm build` must pass for all workspace packages that import `@jixia/shared`.
- Test: `pnpm test` must pass even when behavior tests are still deferred.
- Contract review: scan `packages/shared/src/**` for forbidden runtime imports and sensitive persisted fields before PR.
- AI projection review: service/API tests must prove legacy plain `{ role, content }` messages are backfilled into renderable parts and that projected conversations do not include raw provider payloads, credentials, headers, encrypted keys, signed URLs, or stack traces.

### 7. Wrong vs Correct
#### Wrong
```typescript
import type { PrismaClient } from "@prisma/client";

export function canReadAttachment(client: PrismaClient, userId: string, attachmentId: string) {
  return client.documentAttachment.findFirst({ where: { id: attachmentId, uploadedByUserId: userId } });
}
```

#### Correct
```typescript
export type AttachmentDownloadResponse = {
  readonly attachment: AttachmentMetadataDTO;
  readonly downloadUrl: string;
  readonly expiresAt: string;
};
```
