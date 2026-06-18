# Task 11: Implement Audit Service

## Goal

Implement the MVP audit service boundary for Jixia so governance events can be written and inspected without leaking document content, AI content, attachment content, credentials, request headers, signed URLs, or other sensitive payload data.

This task is backend-only and must preserve the server-first architecture: the API owns audit writing, redaction enforcement, and audit visibility. Browser-facing code must not decide whether sensitive payload content is safe.

## Source Of Truth

- `doc/MVP_rule.md` overrides `doc/Design.md` whenever they differ.
- Audit is a governance boundary, not a content logging mechanism.
- Audit payloads must be metadata-only.
- Do not add audit events for personal/private AI conversation content or AI conversation deletion.
- Do not add audit events for attachment downloads.

## In Scope

1. Add an audit writer service for creating `AuditEvent` rows.
2. Reject audit payloads that contain forbidden sensitive keys at any nested depth.
3. Add a read route/service for authorized audit inspection if needed by the existing API boundary.
4. Wire audit routes into the Fastify API app without weakening existing routes.
5. Add focused tests proving metadata-only audit payloads are accepted and sensitive/content-bearing payloads are rejected.
6. Keep audit responses and errors free of secrets and content bodies.

## Out Of Scope

- Frontend audit UI.
- Bulk audit export.
- Tamper-proof log storage.
- Audit retention policy beyond the existing MVP schema.
- Per-call AI audit details.
- Attachment download audit events.
- AI conversation deletion audit events.

## Required Files

Create or update these files as needed:

- `apps/api/src/modules/audit/audit.service.ts`
- `apps/api/src/modules/audit/audit.routes.ts`
- `apps/api/src/modules/audit/audit.service.test.ts`
- `apps/api/src/app.ts`

Shared contracts, Prisma schema, or additional tests may be updated only if needed to keep the API transport-safe and verified.

## Audit Writer Requirements

Provide an audit writer equivalent to:

```ts
writeAuditEvent(input: {
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  payload: Record<string, unknown>;
})
```

The implementation must:

- Require an authenticated/known actor at the route boundary when routes are exposed.
- Persist `actorUserId`, `action`, `targetType`, `targetId`, and metadata-only `payload` to `AuditEvent`.
- Fail closed before persistence when payload redaction validation fails.
- Avoid logging or returning sensitive payload fragments in validation errors.
- Keep the service injectable/testable without requiring a real database in unit tests.

## Redaction Requirements

Reject audit payloads containing any forbidden key at any nested depth. Matching must be case-insensitive and should treat common separators consistently enough to catch obvious variants.

Forbidden keys include at minimum:

- `contentSnapshot`
- `draftContent`
- `prompt`
- `response`
- `apiKey`
- `encryptedApiKey`
- `signedUrl`
- `authorization`
- `cookie`
- `token`
- `storageCredentials`

Also reject payloads that obviously carry forbidden MVP data such as:

- document body/content/version snapshots
- attachment content or file bodies
- AI prompt, response, selected context body, or provider payload body
- request headers
- API keys, encrypted API keys, object storage credentials, tokens, signed URLs, or cookies

## Governance Event Boundary

The audit service must support metadata-only events for governance actions such as:

- invitations
- permission changes
- project membership changes
- document archive/restore
- document hard delete
- attachment upload confirmation
- attachment delete
- important configuration governance actions

The implementation must not create audit events for:

- attachment downloads
- `AIConversation` deletion
- personal AI conversation content
- per-AI-call details

If this task only implements the shared audit writer/routes and not every call-site integration, document that boundary in the final report and keep the writer ready for later call-site integration.

## Suggested API Surface

If adding routes, keep them server-first and authenticated. A minimal acceptable surface is:

- `GET /audit/events` or equivalent authenticated audit listing route.
- Optional query filters by `targetType`, `targetId`, `action`, and pagination.

Authorization must fail closed. If a broader audit visibility policy is not yet fully specified, keep the route conservative and test the service boundary heavily.

## Acceptance Criteria

- Metadata-only payloads are accepted and persisted.
- Payloads containing forbidden keys at the top level are rejected.
- Payloads containing forbidden keys nested inside objects or arrays are rejected.
- Rejection errors do not echo sensitive values.
- Audit event DTOs do not expose content, secrets, request headers, signed URLs, tokens, cookies, or storage credentials.
- Routes require authentication if exposed.
- Audit routes are wired into the API app without breaking existing routes.
- Existing auth/project/document/attachment/AI tests remain passing.

## Verification Commands

Run the smallest relevant checks first, then broader verification when stable:

```bash
pnpm --filter @jixia/api test -- audit
pnpm --filter @jixia/api lint
pnpm -r test
pnpm -r lint
pnpm -r build
```

Expected result: audit tests pass, workspace tests/lint/build pass, metadata-only payloads are accepted, and content/secret-bearing payloads are rejected.
