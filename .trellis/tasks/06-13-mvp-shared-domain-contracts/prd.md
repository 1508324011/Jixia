# Define MVP Shared Domain Contracts

## Goal

Implement `doc/MVP_implement.md` Task 2 by replacing the shared-package placeholder with transport-safe TypeScript contracts for the locked MVP domains: auth/projects, documents/editor blocks, attachments/upload intents, and private AI configuration/conversations.

## Requirements

- Keep all contracts in `packages/shared/src/**` and export them from `packages/shared/src/index.ts`.
- Add domain modules for auth/project membership, documents/block editor snapshots, attachments/upload/download metadata, and AI provider/conversation/usage views.
- Model only shared constants, literal unions, DTOs, request/response shapes, and lightweight pure helpers needed by API/web/worker boundaries.
- Preserve MVP authority boundaries: API owns permissions and business rules; shared types must not imply frontend-side authorization decisions.
- Keep contracts transport-safe: no Prisma imports, Fastify imports, React imports, browser-only state, server-private state, API keys, signed URLs as persisted config, object storage credentials, or runtime environment access.
- Include the locked MVP values from `doc/MVP_rule.md`: roles, document types/statuses, supported block types, upload statuses/failure reasons, AI provider config view shape, and redaction-sensitive fields by omission.
- Keep implementation scoped: do not add Prisma schema, database migrations, API routes/services, auth/session implementation, document persistence, attachment storage integration, AI provider calls, worker jobs, or UI flows.

## Acceptance Criteria

- [ ] `packages/shared/src/auth.ts` defines roles, session-safe current-user/project membership views, invitation request/response contracts, and project membership DTOs without leaking secrets or password/reset flows.
- [ ] `packages/shared/src/documents.ts` defines `DocumentType`, `DocumentStatus`, supported editor block types, editor snapshot/revision/draft/save/conflict contracts, archive/delete request shapes, and schema-version constants.
- [ ] `packages/shared/src/attachments.ts` defines attachment metadata, upload intent status/failure reasons, upload intent create/confirm/download contracts, and upload limits for image/file blocks.
- [ ] `packages/shared/src/ai.ts` defines personal AI provider config views, safe upsert/import contracts, private conversation/message/context snapshot contracts, and aggregate usage views without prompt/response logging payload contracts beyond the private conversation model.
- [ ] `packages/shared/src/index.ts` re-exports all shared modules and no longer exposes the old foundation placeholder as the primary contract.
- [ ] Workspace validation passes with `pnpm lint`, `pnpm type-check`, `pnpm build`, and `pnpm test`.

## Technical Notes

- Use explicit readonly-friendly DTO shapes and literal unions to keep API/web contracts stable.
- Shared contracts may use TypeScript only; do not add runtime validation libraries in this task unless already present and necessary.
- This task prepares downstream Prisma/API work but must not create database tables or route handlers.
