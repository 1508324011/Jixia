# Task 21f Technical Design

## Diagnosis

Task21e correctly split provider account configuration from model selection by adding model profiles, but it still made users manually type provider model ids. The user rejected that as the wrong mature product direction. The next layer is a connection-first flow where provider credentials are saved once, model discovery happens on the server, and composer options come from a normalized, server-owned model registry.

The key invariant is privacy: the browser never calls upstream provider `/models` endpoints and never receives key material. Browser UI may only ask Jixia to discover or refresh models for a saved provider account.

## Proposed Server Flow

```text
Settings UI
  -> POST /ai/configs/:configId/discover-models
      -> AI config service loads provider config for current user
      -> server validates provider/baseURL and decrypts key
      -> provider adapter calls OpenAI-compatible /models with timeout
      -> service normalizes provider model ids
      -> service upserts AIModelProfile/registry rows
      -> response returns safe provider/model profile views + discovery summary
  -> Composer/document copilot list enabled model profiles
  -> Chat append/stream sends modelProfileId
      -> server resolves provider config + discovered model id
```

## Data Model Direction

Start from Task21e's `AIModelProfile`:

```text
AIProviderConfig
  id, userId, provider, name, baseURL, encryptedApiKey, keyPreview, enabled
  modelProfiles[]

AIModelProfile
  id, providerConfigId
  model            # upstream provider model id
  displayName
  temperature, maxTokens
  enabled, isDefault
  createdAt, updatedAt
```

Task21f may extend profiles with discovery metadata if needed:

```text
discoverySource?      # manual | provider
providerModelId?      # usually same as model if needed for compatibility
lastDiscoveredAt?
discoveryMetadata?    # safe normalized metadata only, never raw headers/keys
isAvailable?          # optional stale/available marker
```

Do not add metadata unless it is needed to satisfy refresh/error/stale behavior. Prefer simple upserts into the existing profile table when sufficient.

## API Plan

Candidate routes:

- `POST /ai/configs/:configId/discover-models` refreshes models for one provider account.
- `GET /ai/configs/:configId/model-profiles` may be optional if existing config list already returns nested safe profiles.
- Existing create/update provider routes may optionally trigger discovery after a successful save/test if that fits current UI patterns.

Response shape should be safe and boring:

```ts
type DiscoverAIModelsResponse = {
  config: AIProviderConfigView;
  discovered: number;
  created: number;
  updated: number;
  skipped: number;
  warnings?: string[];
};
```

Provider errors should be normalized into Jixia errors and should not leak upstream secrets or full raw provider payloads.

## Provider Adapter Direction

- Implement OpenAI-compatible `GET /models` support near the existing provider adapter boundary.
- Reuse provider URL safety validation and request timeout patterns already used for chat completions.
- Normalize upstream rows to a minimal internal representation: `{ id, displayName? }` plus optional safe capability hints if present.
- Make OpenRouter/OpenAI-compatible baseURL behavior explicit in tests and fixture server.

## Frontend Plan

Settings:

- Provider card has a primary connection section: saved key status, base URL/provider, test/discover action, last discovery summary.
- Discovered model rows are listed under the provider with enable/default controls.
- Add/typing a model manually becomes advanced fallback, not first-run happy path.
- Empty/error states explain whether the provider is missing a key, unreachable, returned no models, or needs manual fallback.

Composer/document copilot:

- Continue using `modelProfileId` from Task21e.
- Options are enabled safe profiles returned by the server.
- Missing models state should guide users to settings discovery.
- Do not introduce heavy UI libraries or re-chrome the composer.

## Files Likely In Scope

- `packages/shared/src/ai.ts`
- `packages/db/prisma/schema.prisma` and migrations only if discovery metadata needs persistence
- `apps/api/src/modules/ai/ai.routes.ts`
- `apps/api/src/modules/ai/ai-config.service.ts`
- `apps/api/src/modules/ai/ai-provider-adapter.ts`
- `apps/api/src/modules/ai/ai-conversation.service.ts`
- `apps/web/src/features/ai/AISettingsPage.tsx`
- `apps/web/src/features/ai/chat/AIChatDialog.tsx`
- `apps/web/src/features/ai/chat/ChatComposer.tsx`
- `apps/web/src/features/documents/DocumentCopilotPanel.tsx`
- `apps/web/e2e/test-api.mjs`
- Focused tests beside the changed API/web modules

## Verification

Minimum focused automated checks should include the changed API and web test files. Prefer narrow commands first, then broader lint/type-check if feasible.

Required behavioral coverage:

- Successful server-side discovery creates or updates at least two model profiles under one provider account.
- Discovery failure/empty response produces safe UI and API errors without key leakage.
- Refresh preserves enabled/default user choices.
- Composer sends `modelProfileId` for a discovered model and backend resolves the selected raw model id.
- Browser fixtures assert no client call to upstream provider `/models` and no provider key material in safe config/profile responses.
- Task21d document context disabled still sends explicit empty context and no writeback controls appear.

Manual/browser review must record:

- Settings provider connection and discovery flow.
- Discovered model list, default selection, enable/disable behavior, refresh error state.
- Standalone chat composer model picker using discovered profiles.
- Document copilot picker and context toggle/no-writeback behavior.
- Network/storage inspection showing no raw/encrypted provider key exposure and no browser upstream `/models` call.
