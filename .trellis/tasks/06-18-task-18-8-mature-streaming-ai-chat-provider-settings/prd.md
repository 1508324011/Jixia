# Task 18.8 Mature Streaming AI Chat and Provider Settings

## Goal
Turn the current working-but-MVP AI experience into a mature, fluent AI product surface by fixing the real data model: provider configuration must be a tested provider/model card workflow, and chat must be run/stream/session driven instead of a blocking CRUD page.

Task 18.7 established a standalone chat foundation. Task 18.8 must make it feel like a real AI product: streaming response, stop/cancel, readable rich messages, cleaner composer, better provider settings, and verified provider connectivity.

## Source of Truth
- `doc/MVP_rule.md`
- `.trellis/spec/frontend/index.md`
- `.trellis/spec/backend/index.md`
- `.trellis/spec/guides/pre-implementation.md`
- `.trellis/spec/guides/cross-layer.md`
- `.trellis/spec/guides/code-reuse.md`
- Task 18.7 standalone chat implementation
- Manual review after successful provider setup and first conversation
- ResearchClaw reference implementation under `/home/zhurui/github_project/ResearchClaw`
- Mature open-source chat patterns from Vercel AI Chatbot, Open WebUI, LobeChat, LibreChat, and AnythingLLM

## Problem Statement
The current Jixia AI feature works once configured, but it is still not a mature product experience.

Current bad data structures and user-visible symptoms:

- Chat transport is a blocking append-message request. The UI waits for the full provider response instead of streaming tokens.
- There is no real stop/cancel contract, so the UI cannot safely show a stop button.
- Message rendering is basic Markdown/GFM without syntax highlighting, code-block copy, robust long-content layout, or polished table/code behavior.
- The composer still carries too much explanatory chrome and model metadata instead of acting as a focused chat input.
- Thread history lacks mature management affordances such as generated titles, rename, delete confirmation, search, pin/archive, or compact metadata.
- Provider settings improved in Task 18.7, but still mixes preset selection, saved providers, field explanations, and edit form into a dense admin screen.
- Provider configuration cannot be tested from settings, so users only discover key/model/baseURL failures after trying chat.
- Provider errors are too generic; users cannot distinguish invalid key, invalid model, unreachable endpoint, provider 4xx/5xx, quota, or timeout.

This is bad taste: the UI is compensating for missing runtime/state contracts. Fix the contracts first, then simplify the UI.

## Target Data Model
The next implementation should be organized around these durable objects:

- `ProviderConfig`: server-owned provider metadata plus encrypted write-only key status.
- `ProviderHealthCheck`: transient test result with safe category, message, latency, provider/model/baseURL, and timestamp.
- `ConversationThread`: persistent server-owned thread metadata and message history.
- `ConversationRun`: server-side run with id, status, timestamps, providerConfigId, cancellation state, safe error, and usage.
- `RunStreamEvent`: append-only stream event for user message, assistant delta, tool/source/run step, final message, usage, error, and done.
- `ComposerState`: local UI-only text/draft/send-disabled state, with no prompt persistence in browser storage.
- `ContextAttachment`: explicit document/block/manual/file context chip, not automatic document context.

## In Scope

### 1. Streaming Chat Runtime
Implement real streaming or an explicit first slice of it. The preferred contract is SSE from the Jixia API:

- create or reuse a conversation thread
- append the user message optimistically
- stream assistant deltas from the server
- persist final assistant message server-side
- expose run status transitions: queued, running, succeeded, failed, cancelled
- record usage when provider supplies it
- do not expose provider keys or provider raw payloads to the browser

If implementation scope forces a smaller first step, the PRD must explicitly preserve the new run/event data model and avoid fake streaming.

### 2. Real Stop / Cancel
Add a real cancellation path before showing a stop button:

- server stores active run controller/job state
- UI can request cancellation by run id
- cancellation updates run status to cancelled or failed-with-cancel category
- cancellation is safe if the run already completed
- tests cover cancel-before-completion and cancel-after-completion behavior

### 3. Mature Message Rendering
Upgrade message rendering to production chat quality:

- Markdown/GFM remains supported
- code blocks show language and copy action
- syntax highlighting may be added if dependency cost is justified
- tables are horizontally scroll-safe
- links remain sanitized
- long code/content does not break the chat layout
- assistant/user/error/run/source message parts have stable role-aware layout

### 4. Cleaner Chat Surface and Composer
Refactor the chat surface toward a mature product anatomy:

- full-height chat shell with history, viewport, sticky composer
- compact header with thread title and model/context status
- model picker is compact and searchable or at least less verbose than the current native select label
- send button and stop button occupy the same visual position
- command hints move behind slash/help affordance instead of always competing with the prompt
- disabled/error state is clear but not noisy
- auto-scroll handles normal streaming, while preserving manual scroll position when user scrolls up

### 5. Provider Settings Card Workflow
Rework provider settings around provider/model cards, not a raw form:

- configured providers are primary cards
- each card shows enabled/default/key status/model/baseURL/test state
- create-from-preset is a secondary flow, not a permanent competing column
- editing an existing provider is inline or modal-like, not mixed with all explanations
- API key remains write-only; blank edit preserves existing encrypted server key
- settings should include a clear path back to chat after a successful provider test/save

### 6. Provider Test Connection
Add a safe provider test endpoint and UI action:

- test unsaved draft config with supplied key without persisting it
- test saved config using server-side encrypted key
- send a small deterministic chat-completions request through the same adapter path
- return safe structured errors, not provider secrets or raw request bodies
- show pass/fail/latency/model/baseURL in settings

### 7. Better Provider Error Taxonomy
Provider failures must become actionable:

- invalid base URL
- missing key
- invalid key/auth failure
- model not found or unsupported
- rate limit/quota
- provider timeout
- provider unavailable / 5xx
- response parse failure
- cancellation

Browser-visible errors must be safe and useful. Logs may contain more internal diagnostics if secrets are redacted.

### 8. ResearchClaw and Mature Product Reuse
Reuse patterns, not incompatible infrastructure:

- Study ResearchClaw `use-acp-chat-stream.ts` for chunk accumulation without text scrambling.
- Study ResearchClaw `UnifiedChatModal.tsx` for drawer/history/scroll/composer anatomy.
- Study ResearchClaw `provider-settings.tsx` and `model-combobox.tsx` for provider card and model selector patterns.
- Do not copy ResearchClaw Electron IPC, local CLI spawning, local filesystem prompt injection, or desktop-only storage.
- Prefer small, Jixia-native primitives unless a dependency clearly simplifies the data model.

## Out of Scope
- Browser-side provider API calls
- Browser-side provider key storage or display
- Local/session storage of prompts or responses
- Automatic document writeback/apply/insert/rewrite/automerge controls
- Fake stop button, fake streaming, or fake tool execution
- Full multi-agent/ACP implementation
- Full Open WebUI clone or wholesale external app fork
- Database-breaking changes without migration and tests
- PR creation or git commit

## Functional Requirements
- A configured user can send a message and see assistant output arrive progressively, or the implementation explicitly defines the new stream contract if streaming is staged.
- The user can stop an in-flight run only when the server can actually cancel it.
- The chat viewport remains stable during long messages, code blocks, tables, and streaming updates.
- The composer feels like a modern chat input: focused, sticky, autosizing, Enter-to-send, Shift+Enter newline.
- Provider settings make the next action obvious: configure, test, set default, then chat.
- Provider test results are visible before the user starts a conversation.
- Provider errors explain what to fix without leaking secrets.
- Existing server-first security boundaries stay intact.
- Existing Task 18.7 standalone chat behavior remains compatible unless deliberately replaced with tests.

## Acceptance Criteria
- [ ] Task 18.7 is closed and Task 18.8 is the active Trellis task.
- [ ] Relevant fullstack Trellis context files are initialized for implement/check/debug.
- [ ] Any new API route or shared DTO has tests and follows cross-layer spec requirements.
- [ ] Chat run state has a real server-owned lifecycle; no UI-only fake running/stop state.
- [ ] Streaming assistant output is implemented or a minimal stream-compatible contract is landed with no fake stream UI.
- [ ] Stop/cancel is shown only if backed by a real endpoint/job controller.
- [ ] Message rendering includes code block copy and layout-safe rich Markdown.
- [ ] Composer and chat shell have visibly lower chrome density than Task 18.7.
- [ ] Provider settings are card/workflow based and less dense than Task 18.7.
- [ ] Provider test connection works for saved and draft configs, with safe structured error messages.
- [ ] API keys remain write-only and never appear in browser responses or tests.
- [ ] No local/session storage is used for prompts, responses, provider keys, or auth shortcuts.
- [ ] Focused tests cover streaming/run behavior, provider test behavior, message rendering, and settings key preservation.
- [ ] Lint/typecheck and relevant focused tests pass before the task is considered complete.

## Technical Notes
- This is fullstack because the main UX defects are caused by missing backend/run contracts.
- Design around data structures first. If `RunStreamEvent` is clean, the UI becomes simple. If it is vague, the UI will become garbage again.
- SSE is likely the simplest web-native transport for Task 18.8. WebSocket is only justified if bidirectional live control is needed beyond cancel requests.
- Use `AbortController` or equivalent server-side run cancellation. Do not pretend cancellation exists if provider fetch cannot be aborted.
- Preserve Jixia auth/session boundaries: all AI traffic goes through the API server with `credentials: include`.
- Consider adding syntax highlighting dependency only after checking bundle and type cost; code-block copy can be implemented without it.
- Keep provider-specific behavior centralized in the backend adapter/service, not scattered through React components.
