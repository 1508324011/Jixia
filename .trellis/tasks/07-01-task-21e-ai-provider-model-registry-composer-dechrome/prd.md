# Task 21e AI Provider Model Registry + Composer Dechrome

## Goal

Split Jixia AI provider configuration from model selection so one provider account/credential can expose multiple selectable models, then update settings and chat composer UX so model choice is a first-class, compact chat interaction rather than a provider-config form.

The human review after Task21d found two root problems:

1. The AI dialog remains visually overexplained and composer controls still feel like configuration chrome.
2. Provider settings allow only one model per provider config, forcing users to duplicate provider credentials when they want multiple models under the same OpenAI/OpenRouter-compatible account.

This task must fix the data/product model first. Do not merely rename UI labels.

## Requirements

### Provider/model registry

- Introduce a durable concept equivalent to `AIModelProfile` owned by a provider account/config.
- A provider account/config must represent credential/base URL/provider identity, not exactly one model.
- One provider account must support multiple model profiles with at least:
  - raw provider model id
  - display name
  - temperature
  - max tokens
  - enabled/disabled state
  - default model marker or equivalent default selection
- Existing single-model provider configs must migrate/backfill into one default model profile.
- Preserve existing provider host/baseURL safety validation and provider-key encryption/decryption boundaries.

### API/shared/backend execution

- Update shared DTOs so the browser can list provider accounts with model profiles without receiving provider keys.
- Update create/update/test/import/export paths as needed for the new provider/model model.
- Chat create/stream/run requests must select a model profile or equivalent server-resolved provider+model reference.
- Backend must resolve provider credential + selected model server-side before calling provider adapters.
- Usage/audit/run records may continue storing provider/model strings, but they must reflect the selected model profile.
- Preserve Task21d document-context toggle behavior and no-writeback AI document contract.

### Settings UX

- Redesign AI settings so provider cards show credential/baseURL/provider status separately from model profiles.
- Add nested model profile management for each provider: create/edit/delete/enable/default/test where feasible.
- Manual custom model entry is sufficient for this task; automatic discovery can be deferred.
- Never expose raw API keys, encrypted API keys, Authorization headers, object-storage keys, signed URLs, or cookies.

### Composer UX

- Composer must select a model, not a provider config mislabeled as model.
- Display selected model as a compact chip/popover with provider name + model display name.
- Missing-key/disabled/no-model states must be understandable but not dominate the composer.
- Keep the composer as one rounded control surface with textarea primary, compact context chips, and send/stop affordance.
- Do not add Tailwind, Framer Motion, Lucide, upstream component kits, or plugin marketplaces for this task.

### Compatibility and scope

- Keep standalone AI context-free by default.
- Keep document copilot `Include current document` behavior from Task21d, including explicit empty context when disabled.
- Keep AI output advisory/copyable only; no auto-apply/writeback.
- Keep provider calls server-owned.

## Acceptance Criteria

- [ ] One provider credential/baseURL can own at least two model profiles without duplicating its API key.
- [ ] Existing single-model provider configs are migrated/backfilled into a default model profile.
- [ ] Settings page shows provider/account status separately from nested models.
- [ ] User can add/edit/delete or disable model profiles under a provider account.
- [ ] User can set or infer a default model under a provider account.
- [ ] Composer model picker can switch between two models under one provider.
- [ ] Chat stream request resolves and records the selected model id for each send.
- [ ] Browser never receives raw/encrypted provider key material and never calls upstream provider URLs directly.
- [ ] Task21d document context on/off request semantics still pass.
- [ ] Existing focused AI/chat/document tests pass, with new tests covering multi-model provider behavior.
- [ ] Manual/browser review covers settings page, composer picker, standalone chat, document copilot, provider-key secrecy, and no-writeback behavior.

## Non-goals

- Automatic provider model discovery is optional and may be deferred.
- Multi-model parallel chat is out of scope.
- Agent-role routing is out of scope unless needed for schema shape.
- Pricing/token/capability marketplace UI is out of scope.
- No PR creation unless a later Trellis action asks for `create-pr`.
