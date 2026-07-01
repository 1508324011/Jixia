# Task 21e Manual Review Checklist

## Environment

- Web origin: http://127.0.0.1:53127
- API origin: http://127.0.0.1:43127
- Browser/device: Playwright Chromium, 1366x900 viewport
- Provider config used: Task21e Shared Provider (`openrouter`, `https://openrouter.ai/api/v1`, one saved key, two model profiles: `openai/gpt-4o-mini` and `anthropic/claude-3-5-sonnet`)
- Reviewed at: 2026-07-01T16:13:00Z
- Result: passed

## Provider / Model Registry

- [x] One provider account can contain multiple model profiles.
- [x] User does not need to duplicate provider key/base URL for each model.
- [x] Existing single-model provider configs are represented as default model profiles.
- [x] Settings page separates provider credential/baseURL status from nested model list.
- [x] Add/edit/delete/default/disable model profile flows are understandable.
- Notes/evidence:
  - Browser review created one provider account (`ai-config-1`) with initial default model profile (`ai-model-profile-1`) and added a second profile (`ai-model-profile-2`) under the same provider account without resending the API key.
  - Settings rendered `Configured providers` separately from `Review and save provider` / nested `Model profile editor`, with write-only API key copy.
  - Service/API tests cover backfill/default model profile behavior, provider-owned model profile create/update/delete/default, disabling/default rules, and key redaction.

## Composer Model Picker

- [x] Composer selects a model profile, not a provider config mislabeled as model.
- [x] Picker groups models by provider account.
- [x] Selected model appears as compact provider/model chip or equivalent.
- [x] Missing-key/disabled/no-model states are clear but not visually dominant.
- [x] Switching between two models under one provider changes the model used for stream/run.
- Notes/evidence:
  - Standalone composer used `AI model profile` and sent stream requests with `modelProfileId` values `ai-model-profile-1` then `ai-model-profile-2`.
  - Document copilot composer used `Document copilot model` and sent `ai-model-profile-2` while preserving the same provider account credential.
  - Sanitized evidence saved to `/tmp/opencode/task21e-review-evidence.json`; `streamModelProfileIds` recorded `["ai-model-profile-1", "ai-model-profile-2", "ai-model-profile-2", "ai-model-profile-2"]`.

## Standalone AI and Document Copilot

- [x] Standalone AI still starts with empty document context.
- [x] Document copilot preserves `Include current document` on/off semantics.
- [x] Document context off still sends explicit empty snapshot/items.
- [x] AI output remains advisory/copyable and does not mutate documents automatically.
- [x] Default chat surfaces avoid provider/settings/status chrome walls.
- Notes/evidence:
  - Standalone conversation create request had `currentDocumentId: null` and `selectedContextSnapshot.items.length = 0`.
  - Document copilot stream requests covered context-on with `items.length = 1` and context-off with `items.length = 0`.
  - Browser review saw no `/api/documents/:id/draft` or `/api/documents/:id/revisions` requests during AI copilot sends after resetting the mutation-request collector.

## Security / Boundaries

- [x] Browser never sees raw provider keys or encrypted keys.
- [x] Browser does not call upstream provider URLs directly.
- [x] API Authorization headers, storage keys, signed URLs, cookies, and provider secrets do not appear in UI/storage/log evidence.
- [x] Server-side provider URL safety remains intact.
- Notes/evidence:
  - Browser review recorded `upstreamRequests: []`, `localStorageKeys: []`, `sessionStorageKeys: []`, and `visibleSecretLeaked: false`.
  - Automated request/body checks asserted AI config responses and stream request bodies did not include the raw review key, encrypted key material, or `Authorization` headers; the raw key appeared only in the initial provider creation request.
  - Focused and full tests also cover API-owned provider adapter execution, base URL normalization/safety, safe provider error categories, and no browser provider execution.

## Pass / Fail

- Result: passed
- Reviewer: GPT-5.5 Finish Agent with Playwright Chromium browser/network review
- Reviewed at: 2026-07-01T16:13:00Z
- Required follow-up: None for Task21e acceptance. Playwright MCP could not start because `/opt/google/chrome/chrome` was absent, so the review used the repo Playwright CLI with cached Chromium.

Prepared at: 2026-07-01T05:24:00+00:00
