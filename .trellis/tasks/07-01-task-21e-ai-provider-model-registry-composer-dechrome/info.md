# Task 21e Technical Design

## Diagnosis

Jixia currently uses `AIProviderConfig` as both provider account and model profile. The single scalar `model` field appears in Prisma, shared DTOs, API route schemas, config service/repository, settings UI, composer selection, and run execution. This forces one provider config per model and makes the chat composer show a `Model` select that actually selects `providerConfigId`.

The mature pattern from ResearchClaw, LobeChat, Open WebUI, Dify, AnythingLLM, LibreChat, and Chatbot UI is provider/account credentials plus model choices. Jixia should implement the lightweight version: provider accounts with nested custom model profiles, then a compact composer model picker.

## Data Model Direction

Recommended normalized shape:

```text
AIProviderConfig
  id
  userId
  name
  provider
  baseURL
  encryptedApiKey
  keyPreview
  defaultModelProfileId? or modelProfiles[].isDefault
  enabled/status timestamps

AIModelProfile
  id
  providerConfigId
  model
  displayName
  temperature
  maxTokens
  enabled
  isDefault
  createdAt/updatedAt
```

Migration/backfill:

- Create one model profile for every existing `AIProviderConfig.model` value.
- Preserve old temperature/maxTokens on the default model profile if they move there.
- Keep a compatibility response shape during the transition if necessary, but do not keep the product model as one provider per model.

## API and Service Plan

- Extend shared DTOs to expose provider accounts with nested safe model views.
- Accept model-profile create/update/delete/default operations under provider config routes or a dedicated model-profile route.
- Update AI chat request schema to carry `modelProfileId` or a clearly equivalent server-resolved model ref.
- `prepareRun` should resolve model profile -> provider config -> decrypted key/server adapter input.
- Provider adapter remains OpenAI-compatible and receives a concrete model string.
- Audit/run/usage records continue storing provider/model strings for observability.
- Preserve provider URL safety and key encryption boundaries.

## Frontend Plan

Settings:

- Provider card: account name, provider, base URL, key status, test/configure actions.
- Nested model list: display name, raw model id, temperature/max tokens, enabled/default, test/edit/delete.
- Add model: provider-owned modal with searchable/freeform model id; no raw key display.

Composer:

- Replace provider-config select with model-profile picker.
- Group model options by provider account.
- Show compact selected chip: provider name + model display name.
- Show disabled/missing-key/no-model states in compact details/popover.
- Keep existing textarea/send/stop/context semantics.

Document copilot:

- Reuse the same model picker path as standalone chat.
- Keep Task21d context toggle and empty snapshot semantics.
- No document writeback controls.

## Files Likely In Scope

- `packages/db/prisma/schema.prisma`
- `packages/shared/src/ai.ts`
- `apps/api/src/modules/ai/ai.routes.ts`
- `apps/api/src/modules/ai/ai-config.service.ts`
- `apps/api/src/modules/ai/ai-conversation.service.ts`
- `apps/api/src/modules/ai/ai-provider-adapter.ts`
- `apps/web/src/features/ai/AISettingsPage.tsx`
- `apps/web/src/features/ai/chat/chatTypes.ts`
- `apps/web/src/features/ai/chat/AIChatDialog.tsx`
- `apps/web/src/features/ai/chat/ChatComposer.tsx`
- `apps/web/src/features/documents/DocumentCopilotPanel.tsx`
- `apps/web/e2e/test-api.mjs`
- Related tests and Prisma migrations if this repo uses migration files.

## Verification

Minimum automated checks:

```bash
pnpm --filter @jixia/web test -- --run src/features/ai/chat/AIChatDialog.test.tsx src/features/documents/DocumentCopilotPanel.test.tsx src/features/documents/documentCopilotContext.test.ts src/features/documents/DocumentEditorPage.test.tsx src/app/App.test.tsx
pnpm --filter @jixia/web lint
pnpm --filter @jixia/api lint
pnpm type-check
```

Add focused tests for:

- Backfill/migration or service compatibility from existing single-model provider configs.
- Provider account with two model profiles and one key.
- Composer selects model A then model B under same provider and stream request resolves different model ids.
- Provider-key secrecy in settings/list responses.
- Task21d document context off still sends empty snapshot.

Manual/browser review must observe:

- Settings provider account + nested model profiles.
- Composer model picker grouped by provider.
- Standalone chat uses selected model and remains context-free.
- Document copilot uses selected model while preserving context toggle/no-writeback.
- No raw provider key or upstream Authorization header appears in browser evidence.
