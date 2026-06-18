# Task 18.4 Real AI Conversation Run Lifecycle

## Goal

Turn the MVP private AI conversation endpoint into a real server-owned assistant run lifecycle.

Today the conversation service validates ownership and context, then appends only the user message. That is not an AI conversation; it is a database append. This task adds the missing server-side execution boundary: validate the request, decrypt the owner's provider key on the server, call a provider adapter, persist the user and assistant turns, expose safe lifecycle state to the UI, and record only aggregate usage.

The important part is the data boundary. Browser code must remain a dumb client. Provider credentials, permission checks, selected-context authority, provider calls, run state, and usage accounting belong on the server.

## Source Of Truth

- `doc/MVP_rule.md` overrides older design notes when they differ.
- Jixia remains server-first: the API is authoritative for AI config ownership, document/context permissions, provider execution, private conversation persistence, and usage aggregation.
- AI conversations are private owner records. They are not shared project assets and must not become document writes.
- Shared contracts under `packages/shared` are the transport boundary. They must stay browser-safe and must not expose encrypted keys, raw provider payloads, prompt metadata outside private conversation data, or server-private runtime state.

## In Scope

- Add a real provider execution boundary behind `POST /ai/conversations/:conversationId/messages`.
- Persist both the user prompt and the provider-generated assistant response in the owner's private conversation.
- Add a minimal, transport-safe run lifecycle state for message sends: `queued`, `running`, `succeeded`, and `failed` or an equivalent small state set.
- Decrypt provider keys only inside the server provider execution path.
- Re-check current document and selected-context permissions for every new AI call.
- Record aggregate-only usage after successful provider responses through the existing usage service boundary.
- Return safe provider/run failures to the frontend without leaking secrets, raw headers, raw provider payloads, prompts in logs, selected context bodies outside private conversation data, or credentials.
- Update the AI conversation panel to render real server lifecycle and failure states.
- Add focused backend/shared/frontend tests for the run lifecycle and privacy boundary.

## Out Of Scope

- Streaming responses unless the server has a real streaming/resume implementation in this task.
- A fake Stop button, fake cancellation, or UI-only run state that does not map to a server-owned lifecycle.
- Multi-provider SDK framework work beyond the adapter boundary needed for this task.
- Conversation sharing, public links, project-visible AI transcripts, or Space-shared provider configs.
- AI document writeback: no insert, replace, rewrite, apply, autosave, merge, draft mutation, revision mutation, or hidden document-side effect.
- Per-call usage detail rows or user-visible prompt/response usage drilldown.
- Storing raw provider requests/responses, request headers, signed URLs, credentials, API keys, or encrypted API keys in API responses, audit events, usage rows, logs, or frontend storage.
- Broad schema redesign unless the existing JSON message model cannot safely represent the required lifecycle and failure states.

## Required Files

Update these areas unless an equivalent existing structure is clearly better:

- `packages/shared/src/ai.ts`
- `packages/shared/src/index.ts` if exports need adjustment
- `apps/api/src/modules/ai/ai-conversation.service.ts`
- `apps/api/src/modules/ai/ai.routes.ts`
- `apps/api/src/modules/ai/ai-config.service.ts`
- `apps/api/src/modules/ai/crypto.ts`
- `apps/api/src/modules/ai/ai-usage.service.ts`
- `packages/db/prisma/schema.prisma` only if the minimal lifecycle cannot be represented safely in existing data
- `packages/db/src/schema-rules.test.ts` if schema rules change
- `apps/web/src/features/ai/AIConversationPanel.tsx`
- `apps/web/src/features/ai/AIConversationPanel.test.tsx`
- `apps/web/src/features/documents/DocumentEditorPage.tsx` only if integration needs contract updates
- Existing AI service/config/usage tests as needed

## Functional Requirements

### 1. Server-Owned Run Path

- `POST /ai/conversations/:conversationId/messages` must execute the full server flow for a user prompt.
- The route/service must authenticate the actor and verify the actor owns the conversation.
- The service must verify the selected AI provider config belongs to the actor and is usable.
- The service must re-check current read permission for the conversation's current document and any selected context referenced by the call.
- The service must decrypt the provider API key only after ownership and permission checks pass.
- The service must call a provider adapter from the API process, not from browser code.
- The service must append/persist the user message and assistant response in the private conversation when the provider succeeds.
- The returned conversation snapshot must include the persisted assistant response and safe run state.

### 2. Minimal Lifecycle Model

- The lifecycle must be explicit and transport-safe.
- A minimal state set is preferred: `queued`, `running`, `succeeded`, `failed` or equivalent.
- Failed sends must produce a safe failure state/error message for the owner without leaking provider secrets, raw payloads, request headers, selected context bodies, or server stack traces.
- The implementation must not add fake cancellation or streaming controls. If cancellation is exposed, it must cancel real server/provider work.
- Existing conversation reads should keep working for current message data. Do not break existing DTO consumers unnecessarily.

### 3. Provider Adapter Boundary

- Add a small provider adapter interface that accepts server-side config/key material and the prepared conversation/context input.
- Keep direct provider-specific execution out of route handlers.
- Tests must be able to inject a deterministic fake provider response and deterministic provider failure.
- The adapter response may include assistant text plus aggregate token/cost metadata.
- Raw provider payloads must not become public contracts, audit payloads, usage rows, browser state, or logs.

### 4. Privacy And Permission Boundary

- Prompts, assistant responses, and selected context bodies may exist only inside the private owner conversation data needed for the conversation.
- New calls must fail closed after the owner loses read access to the current document or selected context.
- Historical owner conversation reads can remain readable to the owner as private snapshots.
- No project member, SpaceAdmin, or other user may read another owner's AI conversation or provider config.
- The AI call path must not write `AuditEvent` rows containing prompt, response, context body, API key, signed URL, request header, credential, or raw provider payload data.

### 5. Usage Accounting

- Record usage only after successful provider calls.
- Use the existing aggregate usage service boundary when possible.
- Allowed usage data includes owner/user, provider, model, token counts, estimated cost, and aggregate timestamp/period fields.
- Forbidden usage data includes prompt, response, selected context body, request headers, signed URLs, credentials, API keys, encrypted API keys, raw auth config, raw provider request, and raw provider response.
- Provider failures must not create misleading successful usage records.

### 6. Frontend Conversation Behavior

- The AI conversation panel must render real server-returned assistant messages.
- The UI may show sending/running/succeeded/failed state, but it must be derived from API responses or request lifecycle, not invented as durable authority.
- The UI must show provider failures in a safe, user-readable way.
- The UI must not call provider APIs directly.
- The UI must not store prompts, responses, selected context bodies, provider payloads, API keys, or auth tokens in `localStorage`, `sessionStorage`, IndexedDB, or bearer-token state.
- The UI must keep the existing conversation-surface boundary: no apply/insert/rewrite/automerge action and no fake Stop control.

## Acceptance Criteria

- [ ] Sending a message persists both the user message and a provider-generated assistant message in the owner's private conversation.
- [ ] Backend tests can inject a fake provider success and verify the assistant response is returned through the existing conversation endpoint.
- [ ] Backend tests can inject a fake provider failure and verify a safe failed lifecycle/error result without secret or raw payload leakage.
- [ ] New AI calls re-check current document/context permissions and fail after access loss.
- [ ] A user cannot send messages through another user's conversation or provider config.
- [ ] Provider API keys are decrypted only server-side and are never returned to the browser.
- [ ] Usage records are aggregate-only and are written only for successful provider responses.
- [ ] Conversation send does not create or mutate `Document`, `DocumentDraft`, or `DocumentRevision` records.
- [ ] Shared DTOs expose only transport-safe message/run fields.
- [ ] The AI conversation panel renders the returned assistant response and safe failure states.
- [ ] The frontend contains no provider API calls, bearer auth, browser token storage, prompt/response storage, writeback action, or fake cancellation control.
- [ ] Focused API, shared/schema, and web tests pass.

## Verification Commands

Run focused checks first, then broader checks when stable:

```bash
pnpm --filter @jixia/api test -- ai-conversation
pnpm --filter @jixia/web test -- AIConversationPanel
pnpm --filter @jixia/db test -- schema-rules
pnpm --filter @jixia/api lint
pnpm --filter @jixia/web lint
pnpm -r test
pnpm -r build
```

Expected evidence:

- A deterministic fake provider proves the server produces persisted assistant turns.
- Permission-loss tests prove every new call re-checks document/context access.
- Usage tests prove only aggregate data is recorded.
- UI tests prove the conversation panel renders real server results and still has no document writeback path.
- Build/lint output is clean enough for failures to be obvious.
