# Implement AI provider configs, private conversations, and usage aggregates

## Goal

Implement the MVP private AI service boundary for Jixia: personal AI provider configurations, owner-only AI conversations, aggregate-only AI usage records, and a worker cleanup job for expired usage aggregates.

This task completes the API/worker side of the MVP AI system while preserving the locked server-first, privacy-first boundary from `doc/MVP_rule.md`.

## Source Of Truth

- `doc/MVP_rule.md` overrides `doc/Design.md` whenever they differ.
- MVP AI is personal/private and web-only.
- The API is the source of truth for AI config visibility, conversation visibility, permission checks, encryption, and usage aggregation.
- The frontend must never determine AI config visibility, document/context access, audit boundaries, or secret handling.

## In Scope

- Create personal AI provider configuration services and API routes.
- Encrypt API keys server-side using deployment `MASTER_KEY`.
- Return only non-secret config metadata plus `hasKey` and `keyPreview`.
- Preserve existing encrypted key when editing non-secret config fields without submitting a new key.
- Create owner-only AI conversations tied to the current document and an explicit selected-context snapshot.
- Ensure conversations cannot be shared and do not write back to any document.
- Re-check current document/context permissions for new AI conversation creation/calls.
- Keep old conversations readable to their owner after later project-access loss because they are historical private snapshots.
- Let the owner hard-delete an AI conversation without writing an `AuditEvent` or preserving delete metadata.
- Record aggregate AI usage only, without prompt, response, request header, selected context body, signed URL, credential, or API key fields.
- Allow users to view only their own aggregate usage.
- Allow `SpaceAdmin` to view only Space-level aggregate totals/breakdowns, never single-user usage or single-call detail.
- Add a worker cleanup job that deletes AI usage aggregate rows older than 30 days.

## Out Of Scope

- No Space-shared AI provider configs.
- No `MASTER_KEY` rotation or key rewrap flow.
- No raw provider auth import persistence such as `auth.json`, env files, request headers, or full auth config.
- No single-call AI usage detail view.
- No prompt, response, selected-context body, API key, signed URL, token, request header, or credential storage in logs, audit payloads, usage rows, or service return payloads.
- No AI document writeback: AI cannot create, modify, insert into, replace selection in, autosave, or formally save any `Document`.
- No automatic reading of all notebooks, all project docs, library, lab corpus, or project corpus.
- No audit event for AI conversation deletion, personal AI conversation content, or per-call AI details.

## Required Files

Create or update these API files:

- `apps/api/src/modules/ai/crypto.ts`
- `apps/api/src/modules/ai/ai-config.service.ts`
- `apps/api/src/modules/ai/ai-conversation.service.ts`
- `apps/api/src/modules/ai/ai-usage.service.ts`
- `apps/api/src/modules/ai/ai.routes.ts`
- `apps/api/src/app.ts`

Create or update these worker files:

- `apps/worker/src/jobs/cleanup-ai-usage.ts`

Create or update these tests:

- `apps/api/src/modules/ai/ai-config.service.test.ts`
- `apps/api/src/modules/ai/ai-conversation.service.test.ts`
- `apps/api/src/modules/ai/ai-usage.service.test.ts` if useful for aggregate boundaries
- `apps/worker/src/jobs/cleanup-ai-usage.test.ts`

Update shared contracts and database schema only as needed to satisfy the locked MVP contract.

## Functional Requirements

### 1. Personal AI Provider Configs

- AI provider configs belong to exactly one `ownerUserId`.
- A user may have multiple configs and one default config.
- Config fields must include at least: `ownerUserId`, `name`, `provider`, `baseURL`, `model`, `temperature`, `maxTokens`, `encryptedApiKey`, `keyPreview`, `isDefault`, and timestamps.
- API keys must be encrypted server-side using `MASTER_KEY` from the environment.
- `MASTER_KEY` must not be stored in the database or returned through any API.
- If `MASTER_KEY` is missing when encrypting/decrypting is required, fail closed with a safe error.
- Config responses must never return the full API key or encrypted API key.
- Config responses should expose:

```ts
{
  id: config.id,
  name: config.name,
  provider: config.provider,
  baseURL: config.baseURL,
  model: config.model,
  temperature: config.temperature,
  maxTokens: config.maxTokens,
  hasKey: Boolean(config.encryptedApiKey),
  keyPreview: config.keyPreview,
  isDefault: config.isDefault
}
```

- Editing a config without a new key must preserve the old encrypted key and `keyPreview`.
- Editing with a new key must replace the encrypted key and refresh `keyPreview`.
- Setting a config as default must clear the default flag on the owner’s other configs.
- Users can list, view, create, update, delete, and set default only for their own configs.
- No SpaceAdmin or project role may read another user’s personal AI config.

### 2. Private AI Conversations

- `AIConversation` is a private user record and must be visible only to `ownerUserId`.
- Conversations cannot be shared with other users or exposed through project membership.
- Conversation data must include `ownerUserId`, `currentDocumentId`, `selectedContextSnapshot`, messages, and timestamps.
- Creating a conversation for a document must check the actor’s current read permission for that document.
- Any new AI call/message that reads a document or selected context must re-check current permissions first.
- If the owner later loses project access, existing conversations remain readable to the owner as history snapshots.
- A lost-access owner must not be able to make new AI calls that read the no-longer-accessible project document/context.
- AI output must stay in the AI/chat UI data model only. It must not mutate `Document`, `DocumentDraft`, or `DocumentRevision`.
- Owner hard delete removes the conversation messages and selected context snapshot without creating an `AuditEvent` and without preserving delete metadata.

### 3. AI Usage Aggregates

- Record only aggregate usage statistics.
- Allowed fields include user, provider, model, token counts, estimated cost, and timestamp or period.
- Forbidden fields include prompt, response, selected context body, request headers, signed URL, credentials, API keys, raw provider payloads, and per-call detail bodies.
- Users may view only their own aggregate usage.
- `SpaceAdmin` may view only Space-level aggregate totals/breakdowns, never single-user usage, single-call details, prompt/response/context, headers, or credentials.
- Usage rows must be retained for 30 days.

### 4. Cleanup Worker

- Add a cleanup job for AI usage aggregate records older than 30 days.
- Cleanup must delete old aggregate rows only.
- Cleanup must not inspect, log, or persist prompt/response/context bodies because those fields must not exist in aggregate rows.
- The job should return structured counts for verification.

## Security And Privacy Requirements

- Routes and services must require an authenticated actor.
- Services must fail closed on missing permissions or missing records.
- Do not log or persist API keys, encrypted API keys in output payloads, request headers, credentials, full auth configs, prompts, responses, selected context bodies, signed URLs, or tokens.
- Audit payloads must not include AI prompts, responses, selected context bodies, API keys, signed URLs, request headers, credentials, or tokens.
- Do not create `AuditEvent` rows for AIConversation deletion, personal AI conversation content, or per-call AI details.
- Keep server-first boundaries: no frontend-only permission or visibility decisions.

## Suggested API Surface

The exact route shape may follow existing project conventions, but should cover:

- `GET /ai/configs`
- `POST /ai/configs`
- `GET /ai/configs/:configId`
- `PATCH /ai/configs/:configId`
- `DELETE /ai/configs/:configId`
- `POST /ai/configs/:configId/default`
- `GET /ai/conversations`
- `POST /ai/conversations`
- `GET /ai/conversations/:conversationId`
- `POST /ai/conversations/:conversationId/messages` or equivalent call endpoint
- `DELETE /ai/conversations/:conversationId`
- `GET /ai/usage/me`
- `GET /ai/usage/space` for SpaceAdmin aggregate view only

## Acceptance Criteria

- [ ] Full API keys are encrypted at rest and never returned to clients.
- [ ] Config update without a new API key preserves the previous encrypted key.
- [ ] A user cannot list, view, update, delete, or set default on another user’s AI configs.
- [ ] Only one default config exists per owner after default updates.
- [ ] AI conversations are visible only to `ownerUserId`.
- [ ] Project members and SpaceAdmin cannot read another user’s private AI conversations.
- [ ] Existing owner conversations remain readable after project access loss.
- [ ] New AI calls re-check current document/context permissions and fail after project access loss.
- [ ] AI conversation create/call/delete never writes to `Document`, `DocumentDraft`, or `DocumentRevision`.
- [ ] Owner hard delete removes conversation data without writing `AuditEvent`.
- [ ] Usage aggregate records contain no prompt, response, selected context body, request headers, signed URLs, credentials, API keys, or raw provider auth payloads.
- [ ] Users can see only their own aggregate usage.
- [ ] SpaceAdmin can see only Space-level aggregate totals/breakdowns.
- [ ] Cleanup removes AI usage aggregate rows older than 30 days and leaves newer rows intact.
- [ ] API routes are wired into the Fastify app without weakening existing routes.

## Verification Commands

Run the smallest relevant commands first, then broader checks when stable:

```bash
pnpm --filter @jixia/api test -- ai
pnpm --filter @jixia/worker test -- cleanup-ai-usage
pnpm --filter @jixia/api lint
pnpm --filter @jixia/worker lint
pnpm -r test
pnpm -r lint
pnpm -r build
```

Expected result: all commands pass. The AI config tests prove the full API key is never returned; conversation tests prove owner-only privacy and permission re-checks; usage tests prove aggregate-only records; cleanup tests prove 30-day retention behavior.
