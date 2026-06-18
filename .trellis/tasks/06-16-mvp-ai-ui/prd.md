# Build AI config and private conversation UI

## Goal

Build the MVP browser UI for personal AI provider configuration, private AI conversations, and aggregate-only usage visibility while preserving Jixia's server-first privacy boundary.

This task implements the web-facing layer for the already server-owned AI services. The UI must let a signed-in user manage their own AI provider configs, use a private conversation panel scoped to the current document plus explicitly selected context, and review only allowed aggregate usage views.

## Source of Truth

- `doc/MVP_rule.md` overrides `doc/Design.md` whenever they differ.
- Jixia MVP is web-only and server-first.
- The API is authoritative for sessions, AI config ownership, provider secrets, conversation visibility, document/context permissions, usage aggregation, and SpaceAdmin aggregate visibility.
- The frontend must not infer AI permissions locally, expose provider secrets, persist AI prompts/responses outside component state, or write AI output into documents.

## In Scope

- AI settings UI for personal provider configs.
- Private AI conversation panel for current-document/context-scoped conversations.
- Aggregate usage UI for own-user usage and SpaceAdmin space aggregate views.
- Integration with the existing cookie-aware `apiFetch<T>()` helper.
- Focused tests for AI settings privacy and core UI behavior.
- Web build/lint verification.

## Out of Scope

- Backend AI service/schema changes unless a contract mismatch blocks the UI.
- Space-shared AI provider configurations.
- Browser storage of API keys, encrypted keys, bearer tokens, raw provider payloads, prompts, responses, selected context bodies, or per-call usage details.
- AI-generated document edits, automatic document merge/rewrite, or direct writes to `Document`, `DocumentDraft`, or `DocumentRevision`.
- Conversation sharing, public links, realtime collaboration, and offline AI workflows.
- Per-user SpaceAdmin usage drilldown or single-call usage detail.

## Required Files

Implement or update these files unless an equivalent existing structure is better:

- `apps/web/src/features/ai/AISettingsPage.tsx`
- `apps/web/src/features/ai/AIConversationPanel.tsx`
- `apps/web/src/features/ai/AIUsagePage.tsx`
- `apps/web/src/features/ai/AISettingsPage.test.tsx`
- Existing app/layout/editor integration files as needed.

## Requirements

### AI Settings UI

- Load and render only the current user's AI provider configs from the API.
- Show `hasKey` and `keyPreview` when available.
- Never render, persist, log, or submit an old full API key value received from the API.
- Allow creating/updating non-secret fields such as `name`, `provider`, `baseURL`, `model`, `temperature`, and `maxTokens`.
- Allow entering a replacement API key only as a write-only form value sent to the API.
- Editing without a new key must preserve the existing server-side encrypted key by omitting `apiKey` from the payload.
- Support setting a personal default config through the API.
- Do not expose another user's config or implement local role/permission decisions.

### Private AI Conversation Panel

- Use current `Document` context plus only user-explicit selected supplemental context.
- Create/open conversations through the API and rely on API-side owner/document/context permission checks.
- Render AI messages only in the conversation UI.
- Do not write, insert, replace, or autosave AI output into `Document`, `DocumentDraft`, or `DocumentRevision`.
- Do not provide an AI merge/rewrite action for document conflict handling.
- Deleting a conversation should call the server hard-delete endpoint and should not create frontend audit payloads.
- Keep prompts/responses and selected context snapshots in React state only as needed for the active UI; do not store them in local/session storage.

### AI Usage UI

- Let users view only their own aggregate usage summary through the API.
- Let SpaceAdmin users view only Space-level aggregate totals/breakdowns if the API authorizes it.
- Do not render per-call details, prompts, responses, selected context body, request headers, credentials, API keys, signed URLs, raw provider payloads, or single-user SpaceAdmin drilldowns.
- Present non-secret errors and empty states.

### Security and Frontend Boundary

- Use the existing `apiFetch<T>()` helper so requests use `/api` prefix and `credentials: "include"`.
- Do not use `localStorage`, `sessionStorage`, bearer headers, or browser-owned auth tokens for AI flows.
- Do not log secrets, prompts, responses, selected context body, provider payloads, or usage detail.
- Keep all AI permission and visibility decisions server-owned.

## Suggested API Surface

Use the existing backend routes/contracts where present. Expected routes may include:

- `GET /ai/configs`
- `POST /ai/configs`
- `PATCH /ai/configs/:configId`
- `DELETE /ai/configs/:configId`
- `POST /ai/configs/:configId/default`
- `GET /ai/conversations`
- `POST /ai/conversations`
- `GET /ai/conversations/:conversationId`
- `POST /ai/conversations/:conversationId/messages`
- `DELETE /ai/conversations/:conversationId`
- `GET /ai/usage/me`
- `GET /ai/usage/space`

If route names differ in shared/backend contracts, follow the implemented API contract rather than inventing duplicate endpoints.

## Acceptance Criteria

- [ ] AI settings list/form renders provider config metadata and never renders a full old API key.
- [ ] `hasKey` and `keyPreview` are shown safely without exposing `encryptedApiKey` or raw key values.
- [ ] Create/update settings send raw `apiKey` only when the user types a replacement key.
- [ ] Update without a new key omits `apiKey` so the server preserves the old encrypted key.
- [ ] Setting a default provider uses the API and remains personal to the current user.
- [ ] Conversation UI can send prompts to a private conversation endpoint using current document/context references.
- [ ] Conversation output stays only in the conversation panel and there is no document writeback action.
- [ ] Usage UI shows own aggregate usage and optional Space aggregate usage without per-call or per-user detail leakage.
- [ ] No `localStorage`, `sessionStorage`, bearer auth, browser token storage, secret logging, or API key persistence exists in AI UI code.
- [ ] Focused tests cover AI settings privacy and key replacement behavior.
- [ ] Web build and lint pass.

## Verification Commands

Run focused checks first, then broader checks when feasible:

```bash
pnpm --filter @jixia/web test -- AISettingsPage
pnpm --filter @jixia/web build
pnpm --filter @jixia/web lint
pnpm -r test
pnpm -r lint
pnpm -r build
```

Expected evidence:

- Settings form never renders a full API key.
- Editing without a replacement key does not submit `apiKey`.
- Conversation UI has no document writeback action.
- Usage UI has no prompt/response/per-call detail rendering.
