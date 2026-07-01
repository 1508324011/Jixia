# Task 21f Server-Owned AI Model Discovery

## Goal

Turn Task21e's provider/model split into a mature connection-first product flow: users connect a provider account once, Jixia discovers available models server-side, normalizes those models into the model registry/profile contract, and the chat composer/document copilot choose from server-authorized model profiles.

The accepted product direction is:

```text
provider connection -> automatic model discovery -> normalized model registry -> composer model picker
```

The browser must never call upstream provider `/models` endpoints with raw keys. Provider credentials stay private to the Jixia server, and frontend surfaces only render model choices returned by Jixia APIs.

## Requirements

### Provider connection and discovery

- Add a server-owned model discovery flow for saved provider accounts/configs.
- Discovery must use server-side provider credentials and validated provider/base URL settings.
- The browser may trigger discovery through Jixia APIs, but it must not receive raw/encrypted provider keys, upstream authorization headers, cookies, signed URLs, or raw upstream response objects.
- Support OpenAI-compatible model listing as the first implementation path, including configured OpenAI/OpenRouter-compatible base URLs already supported by Jixia provider settings.
- Discovery should report clear states: not connected, testing connection, discovering, discovered count, empty model list, and provider/API error.
- Discovery refresh must be repeatable and safe; it should not silently destroy existing enabled/default model choices.

### Normalized model registry

- Normalize discovered provider model ids into the existing `AIModelProfile`/model-profile contract or a compatible registry shape.
- Persist enough metadata to distinguish discovered models from manually created fallback profiles when useful.
- Upsert discovered models by provider account plus upstream model id.
- Preserve user-controlled fields where possible, especially enabled/disabled and default model selection.
- If no default model exists and discovery returns usable models, choose or prompt for a sensible default.
- Existing Task21e manual profiles must remain compatible; do not strand existing users after the registry becomes discovery-first.

### API and backend boundaries

- Add or extend API routes for server-side discovery, for example under `/ai/configs/:configId/...`.
- Provider-key decryption, upstream fetches, provider URL validation, timeout handling, and provider error normalization must occur server-side.
- Shared DTOs must expose only safe model registry/profile views and discovery status metadata.
- Chat create/append/stream/run paths must continue to accept `modelProfileId` and resolve provider credentials/model ids server-side.
- Usage/run records should reflect the selected discovered model id.
- Preserve Task21d document-context toggle behavior and no-writeback AI document contract.

### Settings UX

- Make provider connection/test/discover the primary settings flow.
- Provider cards should separate credential/base URL/account status from discovered model registry rows.
- Replace manual model-profile creation as the happy path with a discover/refresh action and discovered model list.
- Manual custom model entry may remain only as an advanced fallback for providers that cannot list models.
- Users must be able to enable/disable models, set a default model, and understand stale/error states after refresh.

### Composer and document copilot UX

- Composer model picker must select a server-authorized model profile, not a provider account/config.
- Picker options must come from enabled discovered/normalized profiles with usable provider credentials.
- The selected model chip/popover should remain compact and show provider account plus model display name.
- Missing-key/no-discovered-model states should link users back to provider connection/discovery without dominating the composer.
- Document copilot must use the same model-profile selection semantics and preserve explicit context-on/off behavior.

### Security and privacy

- No browser network call may target upstream provider model-list URLs.
- No browser response, DOM text, local storage/session storage, fixture payload, or client-side type may expose raw/encrypted key material.
- API route tests and web fixtures should include regression coverage for provider-key secrecy and server-owned discovery.

## Acceptance Criteria

- [ ] A saved provider account can discover models through a Jixia API without exposing provider keys to the browser.
- [ ] Discovery calls an OpenAI-compatible server-side model-list path and normalizes provider model ids into model profiles/registry entries.
- [ ] Refreshing discovery upserts new models while preserving existing enabled/default choices unless the user explicitly changes them.
- [ ] Settings UI presents connect/test/discover as the primary model setup flow and renders discovered models under the provider account.
- [ ] Manual model entry is not the primary happy path and is clearly an advanced fallback if retained.
- [ ] Composer can switch between two discovered models under one provider using `modelProfileId`.
- [ ] Document copilot uses the same server-authorized model profile selection and keeps Task21d context/no-writeback guarantees.
- [ ] Browser/e2e fixtures prove no upstream provider `/models` call is made from the client and no provider key material is rendered or returned.
- [ ] Focused API/web tests cover successful discovery, provider error/empty states, refresh preservation, and model picker behavior.
- [ ] Manual/browser review covers settings connection/discovery, composer picker, standalone chat, document copilot, provider-key secrecy, and no-writeback behavior.

## Non-goals

- Full provider marketplace, pricing table, quota dashboard, or plugin ecosystem.
- Background scheduled model sync unless it is trivial and not required for the core flow.
- Multi-agent routing, per-document model policies, or parallel multi-model chat.
- Browser-side provider SDK calls or provider API key storage.
- AI-generated document writeback or auto-apply behavior.
- PR creation unless a later Trellis action explicitly asks for `create-pr`.
