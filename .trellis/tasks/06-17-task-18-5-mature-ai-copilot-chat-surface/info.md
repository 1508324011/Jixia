# Task 18.5 Technical Design

## Core Judgment

Task 18.5 is a contract-led UI rebuild. Do not start by styling the existing textarea/log panel. Start by giving the browser safe renderable data: message parts, source cards, context attachments, run display steps, and future approval action shapes.

The implementation must preserve Task 18.4 behavior: server-owned provider execution, owner-only conversations, per-call context permission checks, server-side key decryption, safe provider failures, success-only aggregate usage, and no document writeback.

## Data Model Direction

### Shared DTO Additions

Extend `packages/shared/src/ai.ts` with transport-safe rendering types. Suggested shape names are illustrative; implementers may adjust names if tests and usage stay clear.

- `AIConversationMessagePartDTO`
  - `type: "text" | "markdown" | "source_list" | "run_step" | "approval_action"`
  - content fields must be safe for browser rendering.
- `AIConversationSourceDTO`
  - safe reference to context item/document/block: source type, title, document ID when authorized, selected block IDs, revision number, captured timestamp.
  - no full hidden corpus, no signed URLs, no provider payloads.
- `AIConversationRunStepDTO`
  - safe lifecycle display: queued/running/succeeded/failed, title, timestamp, optional safe error.
  - no raw stack traces or provider request/response JSON.
- `AIConversationActionDTO`
  - future-safe action metadata such as copy/retry/show sources.
  - document mutation actions must be absent or disabled in this task.

Compatibility rule: existing messages with only `content` must be projected to one text/markdown part. Do not break consumers expecting `content` unless all callsites and tests are updated deliberately.

### Persistence Direction

Prefer a small compatible JSON-message extension over a broad schema split unless implementation proves JSON cannot safely model the data. If schema changes happen, update `packages/db/prisma/schema.prisma` and `packages/db/src/schema-rules.test.ts`.

### Server Projection

`apps/api/src/modules/ai/ai-conversation.service.ts` should own projection from stored messages/context/run status to browser-safe DTOs. Browser must not infer authorization or build secret-sensitive metadata.

Base cases:

- Good: old message `{role, content}` returns `content` plus `parts: [{type: "markdown" or "text", content}]`.
- Good: assistant response includes safe source cards derived from the selected context snapshot.
- Good: failed provider run returns a failed run card/safe error and no usage row.
- Bad: response contains provider headers, API key, encrypted key, raw provider JSON, stack trace, full hidden project context, or prompt/response outside the private conversation payload.

## UI Architecture Direction

### Split The Current Monolith

Current `AIConversationPanel.tsx` is over 600 lines and owns too many concerns. Keep scope local to the feature, but split by responsibilities if implementation size warrants it:

- `AIConversationPanel` for orchestration and API calls.
- `AIConversationLaunchpad` for collapsed/empty launchpad.
- `AIConversationThread` for message list and auto-scroll behavior.
- `AIMessage` / `AIMessageParts` for rich rendering.
- `AIContextChips` for current/supplemental context attachments.
- `AIComposer` for prompt entry, quick actions, provider/model affordance, retry/send behavior.
- `AIThreadHistory` for thread list/drawer/delete confirmation.

Do not build a generic chat framework. Build only what this panel needs now.

### Surface Requirements

- Launchpad: task cards like summarize, critique, find gaps, suggest next section, extract action items. These should prefill or send prompts without adding hidden context.
- Context chips: current document chip is always visible; supplemental manual context appears as attachment chips with title/source/count/remove/peek.
- Thread: rich messages, Markdown-safe rendering, source cards, run/failure cards, copy/retry/show-sources actions.
- Composer: compact sticky shell, provider/model display, context count, quick action buttons, Enter-to-send and Shift+Enter newline with IME-safe handling.
- History: replace fragile absolute popup with stable drawer/list appropriate for 430px inspector; include active state, message count, timestamp, and delete confirmation.

### Explicit Non-Features

- No Stop button without server cancellation.
- No fake streaming. If the API is still synchronous, show honest queued/running status only.
- No Apply/Insert/Rewrite/Merge controls.
- No browser-side provider calls.
- No local/session storage of prompts, responses, provider keys, context bodies, or tokens.
- No implicit project/notebook/library context expansion.

## Context/Source Rules

Context is product-critical. Mature UI does not hide it.

- Current document context should be visible before send.
- Selected/supplemental context should be user-visible and removable before send.
- Source cards in answers should point back to safe snapshot metadata.
- If a context item cannot be safely opened or previewed, show metadata only; do not fake a preview.
- Existing access-loss semantics from Task 18.4 remain: old owner history readable, new calls fail if source access is lost.

## Test Matrix

### Shared/API

- Old messages with only `content` project into message parts.
- New structured message/source/run/action DTOs are transport-safe.
- Conversation response includes safe source/run metadata.
- Provider failure produces safe failed display state and no usage record.
- No audit/usage/log/browser response contains secrets, raw provider payloads, signed URLs, or context outside private conversation payload.
- Existing `ai-conversation` and `ai-provider-adapter` tests still pass.

### Frontend

- Launchpad renders before first thread and provides safe quick prompts.
- Context chips show current document and supplemental context.
- Manual context flow no longer feels like raw ID/debug form.
- Rich message renderer handles headings/lists/tables/code-like content safely.
- Source cards can be shown/hidden.
- Copy action works without document writeback.
- Retry/regenerate targets the failed run/previous user message, not arbitrary current textarea state.
- No Stop button unless backed by API.
- No apply/insert/rewrite/automerge controls.
- No direct provider fetch/localStorage/sessionStorage/bearer prompt transport appears in the panel.

## Verification Plan

Focused first:

```bash
pnpm --filter @jixia/web test -- AIConversationPanel
pnpm --filter @jixia/api test -- ai-conversation
pnpm --filter @jixia/api test -- ai-provider-adapter
pnpm --filter @jixia/db test -- schema-rules
```

Then broader:

```bash
pnpm --filter @jixia/web lint
pnpm --filter @jixia/api lint
pnpm -r test
pnpm -r build
```

## Implementation Order

1. Update shared DTOs and compatibility helpers.
2. Update API projection/backfill and tests.
3. Add rich message/context/run UI components and tests.
4. Refactor panel composer/history/launchpad.
5. Run focused tests, then broader verification.

## Linus Boundary

The data structures decide whether this is a copilot or a prettier textarea. If the UI has to parse raw strings and guess sources/actions/status, the design is bad. Encode the facts once in the DTOs, render them honestly, and do not invent controls the server cannot honor.
