# Database Guidelines

## Scenario: MVP Prisma Persistence Boundary

### 1. Scope / Trigger
- Trigger: `packages/db/**` defines the server-side Prisma/PostgreSQL data model, migration SQL, reusable Prisma client, and database schema invariant tests.
- Scope: Prisma schema, Prisma config, migrations, generated client package exports, database-only test fixtures, and root/package scripts that invoke Prisma commands.
- Boundary: The database package must not add API routes, permission services, auth handlers, UI flows, worker jobs, object-storage integrations, AI provider calls, or browser-facing runtime state.

### 2. Signatures
- Schema file: `packages/db/prisma/schema.prisma` is the Prisma source for MVP persistence models and enums.
- Migration invariant artifact: `packages/db/prisma/migrations/**/migration.sql` carries PostgreSQL check constraints Prisma cannot express directly.
- Client entrypoint: `packages/db/src/client.ts` exports a reusable `prisma` instance and `PrismaClient` type for server/API/worker consumers.
- Package entrypoint: `packages/db/src/index.ts` re-exports the DB client and generated Prisma-safe types from `packages/db/src/generated/prisma`.
- Invariant tests: `packages/db/src/**/*.test.ts` may read schema and migration files to prove contract boundaries without requiring a live database.

### 3. Contracts
- PostgreSQL with Prisma is the canonical persistence layer; `DATABASE_URL` belongs to server-side Prisma config/client creation only.
- Generated Prisma client output is produced by `pnpm db:generate` and remains ignored rather than staged as source.
- MVP schema is intentionally limited to `User`, `Space`, `SpaceMember`, `Project`, `ProjectMember`, `Session`, `Invitation`, `Document`, `DocumentDraft`, `DocumentRevision`, `DocumentAttachment`, `UploadIntent`, `AIProviderConfig`, `AIConversation`, `AIUsageAggregate`, and `AuditEvent`.
- Prisma enums must stay aligned with `packages/shared` locked values for space/project roles, document type/status, attachment block type, upload intent status/failure reason, and AI usage scope.
- `Document.type` ownership is a database invariant: notebook documents require `ownerUserId` and no `projectId`; project documents require `projectId` and no `ownerUserId`.
- Drafts and revisions store block-editor JSON snapshots, not Markdown; revisions are full snapshots, and drafts must retain `baseRevision` for conflict checks.
- Invitations persist `tokenHash` only; sessions persist `userId`, `expiresAt`, and nullable `revokedAt` only.
- Attachments and upload intents persist backend-owned storage keys and metadata only; signed URLs, object-storage credentials, request headers, and file contents must stay out of persisted tables.
- AI provider configs persist encrypted key material plus safe preview metadata only; AI model profiles are provider-owned registry rows with unique `(providerConfigId, displayName)` and `(providerConfigId, model)` identities; AI conversations are owner-private JSON message/context snapshots; AI usage is aggregate rows only, never per-call prompt/response logs.
- Audit events store `metadata` JSON only and must avoid fields that encourage storing content bodies, prompts, responses, signed URLs, tokens, credentials, or request headers.

### 4. Validation & Error Matrix
- New model outside the locked MVP list -> block PR unless `doc/MVP_rule.md`, the PRD, and this spec are updated first.
- Shared literal union differs from a Prisma enum -> block PR until `packages/shared`, Prisma schema, migration SQL, and tests are synchronized.
- Database constraint exists only in prose or tests, not migration SQL/equivalent invariant artifact -> block PR because PostgreSQL will not enforce it.
- DB client reads browser-only state, exposes raw credentials, or imports frontend/runtime UI code -> block PR as a server-first boundary violation.
- Schema adds raw invitation tokens, password reset models, signed URL fields, request headers, storage credentials, raw API keys, prompt/response log tables, or audit content-body fields -> block PR and remove the persisted field/model.

### 5. Good/Base/Bad Cases
- Good: `DocumentDraft.draftContent Json` and `DocumentRevision.contentSnapshot Json` store editor snapshots while conflict checks use `baseRevision`.
- Good: Migration SQL adds `Document_type_owner_project_check` to enforce notebook/project ownership shape at the database layer.
- Good: `UploadIntent.storageKey` and `DocumentAttachment.storageKey` persist backend-owned object keys, while signed upload/download URLs remain transient API responses only.
- Base: `AIProviderConfig.encryptedApiKey` and `keyPreview` support safe config persistence without storing raw provider keys or auth headers.
- Base: `AIModelProfile.model` stores the upstream model id used for discovery/profile selection, while discovery source payloads and provider authorization headers are not persisted.
- Bad: A persisted `uploadUrl`, `requiredHeaders`, `apiKey`, `rawToken`, `prompt`, `response`, or `payload` column appears in a DB model.

### 6. Tests Required
- Schema validation: `pnpm db:validate` must pass for `packages/db/prisma/schema.prisma`.
- Client generation: `pnpm db:generate` must generate the configured Prisma client output before workspace type-check/build.
- Package tests: `pnpm --filter @jixia/db test` must verify locked model/enums, document ownership check SQL, token hashing fields, upload metadata-only fields, aggregate-only AI usage, and metadata-only audit events.
- Final workspace verification: `pnpm lint`, `pnpm type-check`, `pnpm build`, and `pnpm test` must pass before PR readiness is claimed.

### 7. Wrong vs Correct
#### Wrong
```prisma
model Invitation {
  id       String @id @default(cuid())
  rawToken String
}
```

#### Correct
```prisma
model Invitation {
  id        String @id @default(cuid())
  tokenHash String @unique
}
```
