# Task 18.6 Copilot Work Surface Refactor

## Goal

Refactor Jixia's right-side AI copilot from the Task 18.5 safe-but-stacked panel into a resizable, thread-first, source-grounded, artifact-aware copilot work surface while preserving the server-first AI boundary: private owner threads, explicit context, server-owned provider execution, transport-safe DTOs, no browser provider calls, no fake cancellation, and no document writeback without a future server approval contract.

Task 18.5 made the data safe enough to render: shared AI render DTOs, server projection/backfill, context chips, source cards, run cards, launchpad, richer message rendering, and safer action boundaries. Task 18.6 is not another button polish pass. It should fix the surface model so the copilot behaves like a research workbench attached to the document, not a 430px inspector full of controls.

## Source of Truth

- `doc/MVP_rule.md` remains authoritative for privacy, server-first behavior, and MVP writeback limits.
- `.trellis/spec/frontend/index.md` requires the UI direction to stay IDE-like and ResearchClaw-adjacent, not generic SaaS dashboard/card UI.
- `packages/shared/src/ai.ts` remains the transport-safe contract boundary for browser-facing AI DTOs.
- Task 18.5 behavior must keep working: existing conversations, context projection, source cards, run cards, safe no-writeback affordances, and no fake Stop/Apply controls.
- The prior Task 18.5 audit is task input: Jixia currently feels like a governance/control console plus chat log; 18.6 must make it a conversation work surface.

## Problem Statement

The current copilot is technically safer than before, but the UI model is still wrong:

- The panel is constrained to a fixed `430px` inspector, so complex research answers and source context have no room to breathe.
- The open surface is a five-row stack: header controls, notice, context manager, scroll body, composer. That reads as an admin panel, not a dialog.
- Explicit context takes prime space above the conversation and feels like a form/control block instead of a quiet source set.
- The composer still behaves like a prompt form with provider controls, quick buttons, labels, and status pills, not a command input.
- Messages are generic bubbles/cards, not source-grounded research briefs with claim-level provenance and artifact affordances.
- History is an overlay list, not a durable memory/thread surface.
- The launchpad is honest but visually underpowered compared with mature copilots: it lacks a spacious greeting, capability cards, command hints, and a bottom composer mental model.
- Artifact/canvas semantics are missing: the UI cannot distinguish normal chat, a research brief, a draft proposal, a citation trail, or a future approval action.

The root cause is data and layout shape, not CSS decoration. If 18.6 only makes the existing stacked blocks prettier, it fails.

## Comparative References

Use these as grammar references, not things to clone blindly:

- `doc/Figures/copilot1.png`: mature empty state with greeting, capability cards, command hints (`/`, `@`, `Shift+Enter`), model/context controls, and prominent rounded composer.
- `doc/Figures/copilot2.png`: active source-grounded answer with source chip row, rich research brief, table/content structure, compact sticky composer, and low chrome.
- `/home/zhurui/github_project/ResearchClaw/src/renderer/components/chat/UnifiedChatModal.tsx`: wider right drawer, optional session sidebar, source counts, compact composer, real stop only because the backend can kill a job.
- `/home/zhurui/github_project/ResearchClaw/src/renderer/pages/papers/reader/page.tsx`: reader/chat split modes, resizable divider, attached paper chips, agent picker, autosizing composer.
- `/home/zhurui/github_project/ResearchClaw/src/renderer/components/agent-todo/MessageStream.tsx`: message stream, grouped tool calls, permission/error cards, scroll behavior.
- `/home/zhurui/github_project/ResearchClaw/src/renderer/components/agent-todo/TextMessage.tsx`: robust Markdown/GFM/code/table rendering.
- assistant-ui Thread/AssistantSidebar: thread viewport, empty welcome, messages, sticky viewport footer composer, scroll-to-bottom, resizable sidebar.
- Vercel AI SDK UI: message parts, streaming states, stop/regenerate when supported, source/document parts, attachments, usage metadata.
- CopilotKit: configurable sidebar shell and slots, not a hardcoded monolith.
- ChatGPT Canvas / Claude Artifacts and Citations / VS Code Copilot: separate transient chat from durable work product, expose sources close to claims, and use modes rather than random button piles.

## In Scope

### 1. Work Surface Shell

- Rework the copilot from fixed inspector thinking toward a resizable/right-work-surface model that still fits Jixia's current workbench architecture.
- Preserve the document editor as the primary workspace while allowing the copilot to expand enough for research answers and source/artifact panes.
- Keep the surface server-first and suggestion-only.

### 2. Thread-First Anatomy

- Define a clear hierarchy: header/mode bar, thread viewport, source/artifact drawer or region, sticky composer.
- Move control-heavy context and provider UI out of the thread's visual priority path.
- Make empty, active, failed, loading, and history states visibly different.

### 3. Source-Grounded Research Briefs

- Render assistant answers as structured research briefs when appropriate, not just chat bubbles.
- Make selected sources visible as a source chip row or source set near the answer.
- Keep source cards/provenance close to claims and safe metadata.
- Preserve Task 18.5 source provenance behavior: per-message/run sources must not drift from mutable conversation context.

### 4. Artifact-Aware UI Without Writeback

- Add UI semantics for draft/proposal/artifact-style assistant output if supported by existing DTOs or safe UI metadata.
- Future document-changing actions may be represented as disabled/unavailable affordances only if they are honest and clearly non-executable.
- Do not add apply/insert/rewrite/automerge/document mutation controls.

### 5. Command-Native Composer

- Replace form-like prompt UX with a compact command composer: quick actions, command hints, provider/model affordance, context count/source set, keyboard behavior, disabled states.
- Support quick prompts as command starters, not visually dominant button piles.
- Keep no fake Stop and no fake streaming. Stop appears only if server cancellation exists end-to-end.

### 6. Thread History and Memory Surface

- Replace the fragile overlay-history feel with a stable thread list/drawer appropriate for the available width.
- Show active state, title, last activity, message count, and safe delete confirmation.
- Do not introduce project-shared/public conversation visibility in this task.

### 7. Tests and Boundary Verification

- Update focused web tests for the new surface anatomy, launchpad, composer, source chip row/cards, history surface, and absence of forbidden controls.
- If shared/API DTO projection changes are needed, update API/shared tests to prove transport safety and compatibility.
- Existing Task 18.4/18.5 AI lifecycle and privacy tests must keep passing.

## Out of Scope

- Real streaming transport unless a server-owned streaming/polling contract is implemented end-to-end.
- Stop/cancel controls without a real server cancellation endpoint and tests.
- Applying, inserting, rewriting, merging, autosaving, or mutating documents from AI output.
- Electron IPC, local CLI/cwd assumptions, local-first prompt concatenation, or ResearchClaw backend transport patterns.
- Browser-side provider fetches, provider key handling, prompt/response localStorage/sessionStorage, or browser authorization decisions.
- Generic SaaS dashboard/card redesign.
- Replacing the entire workbench shell unless needed for the copilot surface contract.

## Functional Requirements

1. The right copilot presents a thread-first work surface, not a stacked inspector form.
2. The surface supports a more spacious or resizable presentation while preserving the document editor layout.
3. Empty state behaves like a mature launchpad with greeting, task suggestions, context/model status, and command hints.
4. Active state prioritizes answer/thread content, selected source set, and sticky composer over admin controls.
5. Assistant output can render as structured research briefs with source/provenance affordances.
6. Context is visible as source chips or source sets, not as a dominant form block.
7. Composer is compact, command-native, keyboard-friendly, and clear about provider/model/context/send state.
8. Thread history is discoverable and stable, with active thread state and safe deletion behavior.
9. Artifact/proposal semantics are visible only as honest suggestion-only UI; no mutation controls are allowed.
10. No fake streaming, fake Stop, fake Apply, direct provider calls, local prompt storage, browser key handling, or browser authorization decisions are introduced.
11. Existing conversations and server-projected Task 18.5 DTOs continue rendering correctly.
12. Focused tests verify both the improved UI and the preserved privacy/writeback boundary.

## Acceptance Criteria

- [ ] The copilot surface has a documented component/layout anatomy: header or mode bar, thread viewport, source/artifact region, sticky composer, and history access.
- [ ] The surface is no longer visually dominated by stacked header/context/composer controls in the open state.
- [ ] The panel can present a wider/resizable or otherwise more workbench-like surface than the fixed narrow inspector pattern, without breaking the document editor.
- [ ] Launchpad state includes research-native capability cards and command hints grounded in the current document.
- [ ] Active answer state can display structured research-brief content with source chip/provenance affordances.
- [ ] Composer uses command-first interaction with quick actions, context/source summary, provider/model affordance, Enter/Shift+Enter behavior, and clear disabled state.
- [ ] History is a stable drawer/list/rail with active state, metadata, and safe delete confirmation.
- [ ] Artifact/draft/proposal UI remains suggestion-only and never mutates documents.
- [ ] No Stop/cancel control is present unless backed by a real server endpoint and tests.
- [ ] No apply/insert/rewrite/automerge/document mutation controls are present.
- [ ] No browser-side provider calls, key handling, local/session storage of AI data, or browser-side authorization logic is introduced.
- [ ] Existing Task 18.5 structured message/source/run rendering remains compatible.
- [ ] Focused web tests and any required shared/API tests pass.

## Required Files to Inspect

- `apps/web/src/features/ai/AIConversationPanel.tsx`
- `apps/web/src/features/ai/AIConversationPanel.test.tsx`
- `apps/web/src/features/layout/workbench.tsx`
- `apps/web/src/features/layout/workbench.css`
- `apps/web/src/features/documents/DocumentEditorPage.tsx`
- `packages/shared/src/ai.ts`
- `apps/api/src/modules/ai/ai-conversation.service.ts`
- `apps/api/src/modules/ai/ai.routes.ts`
- `.trellis/tasks/06-17-task-18-5-mature-ai-copilot-chat-surface/prd.md`
- `.trellis/tasks/06-17-task-18-5-mature-ai-copilot-chat-surface/info.md`
- `doc/Figures/copilot1.png`
- `doc/Figures/copilot2.png`

## Suggested Verification

Run focused checks first, then broader checks:

```bash
pnpm --filter @jixia/web test -- AIConversationPanel
pnpm --filter @jixia/api test -- ai-conversation
pnpm --filter @jixia/web lint
pnpm --filter @jixia/api lint
pnpm -r test
pnpm -r build
```

If implementation only touches frontend layout/components, keep API checks scoped to ensuring no shared/API contract regression is introduced.

## Linus Boundary

Good taste here means deleting special cases from the user's mental model. The user should not see a context form, a provider form, a history popup, and a chat log fighting for 430px. The data structure is simple: a document-scoped thread, a selected source set, assistant messages with typed parts, optional artifact/proposal metadata, and safe actions. Render that honestly. Do not invent controls the server cannot honor.
