# Implement MVP Prisma data model

## Goal

Implement `doc/MVP_implement.md` Task 3: the Prisma/PostgreSQL data model, database client export, and schema invariant tests for the locked Jixia MVP. This task turns the shared contracts into persistence-ready tables while preserving the server-first, project-scoped permission model from `doc/MVP_rule.md`.

## Requirements

- Add `packages/db/prisma/schema.prisma` for PostgreSQL and configure Prisma Client generation for the `@jixia/db` package.
- Replace the placeholder DB client with a real Prisma client export from `packages/db/src/client.ts` and package exports from `packages/db/src/index.ts`.
- Model the MVP entities only: `User`, `Space`, `SpaceMember`, `Project`, `ProjectMember`, `Session`, `Invitation`, `Document`, `DocumentDraft`, `DocumentRevision`, `DocumentAttachment`, `UploadIntent`, `AIProviderConfig`, `AIConversation`, `AIUsageAggregate`, and `AuditEvent`.
- Encode locked role/status/type values as Prisma enums aligned with `packages/shared`: space/project roles, document type/status, upload intent status/failure reason, and AI provider identifiers where useful.
- Enforce the document ownership invariant at the database layer: notebook documents require `ownerUserId` and no `projectId`; project documents require `projectId` and no `ownerUserId`.
- Persist document revisions and drafts as block-editor JSON snapshots, not Markdown; revisions are full snapshots, not diffs; drafts must retain `baseRevision` for conflict checks.
- Persist `Invitation.tokenHash` only; do not add raw invitation tokens, reset-password flows, or password reset models.
- Persist sessions with `userId`, `expiresAt`, and nullable `revokedAt`; do not implement cookie/session runtime in this task.
- Persist document-scoped attachments and upload intents with backend-owned storage keys; do not persist signed URLs, request headers, object storage credentials, or file contents.
- Persist AI provider configs with encrypted key storage and safe preview metadata; do not persist raw API keys or provider auth headers.
- Persist AI conversations as owner-private records with JSON messages/context snapshots, and usage as aggregate rows only; do not add per-call prompt/response log tables.
- Persist audit events as metadata JSON only and avoid schema fields that encourage storing content bodies, prompts, responses, signed URLs, tokens, credentials, or request headers.
- Add schema invariant tests under `packages/db/src` or `packages/db/test` that prove the generated schema includes the MVP models/enums and the document ownership check constraint.
- Keep this task database-package focused. Do not add API routes, permission service functions, auth handlers, UI flows, worker jobs, object-storage integrations, AI provider calls, or business logic outside `packages/db` except root script wiring needed for Prisma commands.

## Acceptance Criteria

- [ ] `packages/db/prisma/schema.prisma` exists, validates with Prisma, and contains only the MVP persistence model described above.
- [ ] `packages/db/src/client.ts` exports a reusable Prisma client without reading browser-only state or leaking credentials.
- [ ] `packages/db/src/index.ts` exposes the DB client and any generated-safe package entrypoints needed by API/worker consumers.
- [ ] Root and package DB scripts run real Prisma commands against the schema path instead of placeholder `node -e` messages.
- [ ] A database-level document ownership check is represented in migration SQL or an equivalent Prisma-compatible invariant artifact and covered by tests.
- [ ] Tests verify schema invariants for document ownership, invitation token hashing fields, upload intent persisted fields, AI aggregate-only usage, and audit metadata-only boundaries.
- [ ] `pnpm db:generate`, `pnpm lint`, `pnpm type-check`, `pnpm build`, and `pnpm test` pass.

## Technical Notes

- `doc/MVP_rule.md` is the source of truth if it conflicts with `doc/Design.md` or earlier implementation sketches.
- Prisma schema should stay server-side in `packages/db`; browser-facing packages must not import database runtime state.
- Prefer JSON columns for editor snapshots, AI messages/context snapshots, and audit metadata until later domain services define stricter runtime validators.
- If Prisma cannot express a required PostgreSQL check constraint directly, add the minimal migration SQL or invariant artifact needed and document/test it in this task.
- Do not solve live database deployment or Docker service startup beyond schema/client/test support; those belong to later API/worker tasks.
