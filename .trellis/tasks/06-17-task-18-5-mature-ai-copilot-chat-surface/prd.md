# Task 18.5 Mature AI Copilot Chat Surface

## Goal

Turn Jixia's right-side AI copilot from a safe form plus plain-text log into a mature, document-grounded chat surface while preserving Jixia's server-first AI boundary: private owner conversations, explicit context, server-owned provider execution, aggregate-only usage, and no document writeback unless a future server-backed approval workflow explicitly permits it.

Task 18.4 fixed the engine and brakes: provider ownership, context permission checks, server-side key decryption, real provider execution, persisted user/assistant turns, safe run status, and success-only aggregate usage. Task 18.5 fixes the cockpit. The current panel can call the server, but it still looks and behaves like an inspector form. Mature copilots treat context, message parts, sources, tool/run progress, and approval actions as first-class UI objects.

## Source of Truth

- `doc/MVP_rule.md` remains authoritative for privacy, server-first behavior, and MVP writeback limits.
- `packages/shared/src/ai.ts` is the transport-safe contract boundary. Browser-facing DTOs may expose safe rendering metadata, but never raw provider payloads, credentials, headers, signed URLs, stack traces, encrypted keys, or server-private runtime state.
- The AI conversation panel must remain suggestion-only for this task. No apply/insert/rewrite/automerge document mutation controls are allowed unless backed by a real server-side approval and document mutation contract, which is out of scope here.
- Existing Task 18.4 run lifecycle must keep working. Do not break existing conversation list/create/send/read/delete behavior.

## Problem Statement

The current Jixia copilot panel is technically safe but not product-grade:

- It is a single local-state component embedded in a fixed 430px inspector, not a chat-native copilot surface.
- The collapsed state is governance copy, not a launchpad with task suggestions.
- Supplemental context is added through raw document ID/block ID/content fields, not a searchable picker or context attachment workflow.
- Messages render as plain text only; there is no Markdown, table, code, citation/source card, message toolbar, or provenance affordance.
- Queued/running state is a temporary synthetic text bubble, not visible run steps or progress cards.
- Retry is tied to current composer state, not a specific failed run/message.
- Composer is a form textarea with a provider select; it lacks chat-native controls like context chips, quick actions, keyboard hints, compact toolbar, attachments, and mode/model affordances.
- Current document context is flattened client-side into text; rich document structures and selected blocks are not represented as first-class context objects in the UI.

The right fix starts with data structures. If the contract only has `{ role, content }`, the UI will keep being a text log. Task 18.5 must introduce safe renderable AI message structure before polishing the surface.

## Comparative References

Use these as implementation references, not as products to clone blindly:

- Local screenshots: `doc/Figures/copilot1.png`, `doc/Figures/copilot2.png`.
  - Empty-state launchpad with capability cards, `/` and `@` hints, context/model controls, connection/source status, rounded sticky composer.
  - Active document-grounded chat with visible source chip, rich structured answer, compact composer, and quiet panel chrome.
- ResearchClaw:
  - `/home/zhurui/github_project/ResearchClaw/src/renderer/components/chat/UnifiedChatModal.tsx` for right-side drawer, session sidebar, mode/backend selector, context chips, streaming/thinking state, permission cards, send/stop swap.
  - `/home/zhurui/github_project/ResearchClaw/src/renderer/pages/papers/reader/page.tsx` for split reader/chat layout, chat history, quick actions, attached-paper chips, agent picker, and send/stop controls.
  - `/home/zhurui/github_project/ResearchClaw/src/renderer/components/agent-todo/MessageStream.tsx` for message stream, tool-call grouping, plan cards, error cards, permission prompts, and auto-scroll behavior.
  - `/home/zhurui/github_project/ResearchClaw/src/renderer/components/agent-todo/TextMessage.tsx` for Markdown/code/table rendering.
- Mature market/open-source grammar:
  - Vercel AI SDK UI / assistant-ui: message parts, attachments, source/data parts, suggestions, message actions, tool-call rendering.
  - CopilotKit / Continue / Lobe Chat: sidebar chat, tool/action cards, model/mode controls, approval workflows.
  - GitHub Copilot / VS Code Chat: scoped context mentions, session history, ask/agent/plan modes, inline selection context, stop only when real cancellation exists.
  - ChatGPT Canvas / Claude Artifacts/Citations / Notion Agent: source-aware answers, right-side work surface, citations/provenance, plan-before-action, explicit user approval before mutations.

## In Scope

### 1. Transport-Safe AI Rendering Contracts

Add or refine shared DTOs that let the UI render mature copilot output without importing server-private state:

- Message parts for at least text/markdown-style content and future-safe non-text parts.
- Source or citation parts/cards that reference safe document/context metadata, selected block IDs, titles, revision numbers, and captured timestamps.
- Context attachment/chip metadata suitable for rendering current document, selected blocks, selected documents, manual notes, and future asset/literature attachments.
- Run step/tool/trace display metadata for safe lifecycle visualization, even if Task 18.5 initially maps Task 18.4 provider execution to simple server-run steps.
- Approval/action DTO shape for future document-changing actions, but any writeback action must be rendered disabled/unavailable in this task unless a real server mutation path exists.

Do not expose raw prompts/responses outside private conversation data. Do not expose provider request/response JSON, headers, credentials, encrypted keys, signed URLs, or stack traces.

### 2. Server-Owned Conversation Projection

Update server mapping/persistence only as needed to return safe renderable conversation snapshots:

- Preserve existing JSON message persistence unless a small, justified schema extension is required.
- Backfill/render existing `{ role, content }` messages as text message parts so old conversations still display.
- Include safe run state, failure, and source/context metadata in the conversation response.
- Keep provider execution, permission checks, and usage behavior from Task 18.4 intact.
- If new fields are persisted, add Prisma/schema guardrail tests and avoid leaking sensitive bodies into audit/usage/logging.

### 3. Mature Right-Side Copilot Surface

Refactor the panel into a real chat surface:

- Replace the collapsed governance card with a copilot launchpad: greeting, short explanation, task suggestion cards, current document/context status, and a primary open/send affordance.
- Keep governance visible but subordinate: “private”, “server-owned”, “suggestion-only”, “no writeback” should be chips/status, not the whole product.
- Render context as chips/attachments with source type, title, selected blocks/counts, and remove/peek affordances.
- Replace the raw supplemental context form with a safer context workflow. At minimum, make manual context visually an attachment/chip workflow; if searchable document/block picking is not available yet, do not fake it.
- Render rich assistant messages: Markdown paragraphs/headings/lists/tables/code-safe formatting, role labels, timestamps, run/failure status, source cards, and message action toolbar.
- Add message actions that are safe in MVP: copy, retry/regenerate when tied to the failed or previous user turn, show/hide sources. Do not add apply/insert/rewrite controls.
- Make queued/running/succeeded/failed visible as server run status. Do not add Stop unless there is a real server cancellation endpoint. Do not fake streaming unless the server actually streams or polls run updates.
- Make the composer chat-native: compact sticky shell, prompt textarea, provider/model affordance, context chip count, quick prompt buttons, Enter-to-send/Shift+Enter hint, clear disabled states, and safe retry behavior.
- Improve history from a fragile popup to a more durable thread surface appropriate for the 430px inspector. If a persistent sidebar cannot fit, provide a clean drawer/list with active state, message count, timestamp, and delete confirmation.

### 4. Tests and Verification

Add focused tests that prove the new UI and contracts keep the safety boundary:

- Shared DTO tests or type-level coverage for message parts/source/run/action contracts where applicable.
- API/service tests for safe projection/backfill of old messages and no leakage of secrets/provider payloads.
- Web tests for launchpad, context chips, rich message rendering, source cards, safe failure/run states, retry tied to failed run/message, no fake Stop, no writeback controls, and no direct provider calls/browser storage.
- Existing Task 18.4 tests must continue passing.

## Out of Scope

- Real streaming transport, unless a server-owned streaming or polling contract is implemented end-to-end in this task.
- Stop/cancel controls without a real server cancellation endpoint.
- Applying, inserting, rewriting, merging, autosaving, or mutating documents from AI output.
- Public/shared AI conversations, project-visible transcripts, or Space-shared provider configs.
- Broad provider SDK redesign or new provider types.
- Raw provider trace/debug UI.
- Replacing the whole workbench shell unless strictly necessary for the panel.
- A generic SaaS dashboard/card redesign. Jixia should stay IDE-like and ResearchClaw-adjacent.

## Required Files to Inspect

- `packages/shared/src/ai.ts`
- `packages/shared/src/index.ts`
- `apps/api/src/modules/ai/ai-conversation.service.ts`
- `apps/api/src/modules/ai/ai.routes.ts`
- `apps/api/src/modules/ai/ai-provider-adapter.ts`
- `apps/api/src/modules/ai/ai-conversation.service.test.ts`
- `apps/api/src/modules/ai/ai-provider-adapter.test.ts`
- `packages/db/prisma/schema.prisma`
- `packages/db/src/schema-rules.test.ts`
- `apps/web/src/features/ai/AIConversationPanel.tsx`
- `apps/web/src/features/ai/AIConversationPanel.test.tsx`
- `apps/web/src/features/documents/DocumentEditorPage.tsx`
- `apps/web/src/features/layout/workbench.tsx`
- `apps/web/src/features/layout/workbench.css`
- `doc/Figures/copilot1.png`
- `doc/Figures/copilot2.png`

## Functional Requirements

1. Shared contracts model renderable AI conversations beyond plain `{ role, content }` while remaining transport-safe.
2. Existing messages continue rendering through compatibility/backfill into text parts.
3. Conversation responses include enough safe metadata for source/context chips and run/failure rendering.
4. The panel has a mature empty-state launchpad with task suggestions and context status.
5. The thread renders rich assistant messages with structured content and safe message actions.
6. Context appears as first-class chips/attachments; raw context form UX is removed or demoted behind a safer manual attachment flow.
7. The composer is sticky, compact, chat-native, and clear about provider/model/context/send state.
8. Retry/regenerate is tied to a specific failed run or previous user turn, not arbitrary current textarea content.
9. UI must not show fake streaming, fake Stop, or fake apply/writeback controls.
10. No browser path directly contacts AI providers, stores provider keys, stores prompts/responses in local/session storage, or performs local authorization decisions.
11. Server-side provider execution, permission checks, and aggregate-only usage from Task 18.4 remain intact.
12. Tests cover both the improved UX and the preserved privacy/writeback boundary.

## Acceptance Criteria

- [ ] `AIConversationMessageDTO` or adjacent shared DTOs support safe message parts, source/context card metadata, run status display metadata, and future approval/action shapes without leaking server-private data.
- [ ] Existing plain content conversations still render correctly.
- [ ] API/service projection returns safe structured conversation data and does not expose raw provider payloads, credentials, headers, encrypted keys, stack traces, prompt metadata outside private conversation data, or signed URLs.
- [ ] Right-side copilot collapsed/empty state behaves like a launchpad with task suggestions and visible context/model status.
- [ ] Message thread renders Markdown-like structured content, source/context cards, run/failure states, and safe message actions.
- [ ] Composer supports chat-native send behavior, quick prompt actions, context chips, provider/model affordance, and clear Enter/Shift+Enter behavior.
- [ ] Context workflow renders current document and supplemental context as chips/attachments with remove/peek affordances.
- [ ] No apply/insert/rewrite/automerge/document mutation controls are present.
- [ ] No Stop/cancel control is present unless backed by a real server endpoint and tests.
- [ ] No direct provider fetch, bearer-token prompt transport to provider, local/session storage of AI data, or browser-side key handling is introduced.
- [ ] Focused API/shared/web tests pass.
- [ ] Existing Task 18.4 lifecycle/privacy tests still pass.

## Suggested Verification

Run the smallest relevant checks first, then broader checks:

```bash
pnpm --filter @jixia/web test -- AIConversationPanel
pnpm --filter @jixia/api test -- ai-conversation
pnpm --filter @jixia/db test -- schema-rules
pnpm --filter @jixia/web lint
pnpm --filter @jixia/api lint
pnpm -r test
pnpm -r build
```

## Linus-Style Boundary

Good UI here is not decoration. It is the right data model rendered honestly. If the implementation just makes the current textarea and plain `<article>` bubbles prettier, it fails. If it adds fake Stop, fake streaming, or fake Apply, it is worse than before. The right shape is simple: structured messages, explicit sources, visible run state, safe actions, and no document mutation without a real server contract.
