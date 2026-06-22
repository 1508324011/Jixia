# Task 21c Technical Design

## Problem Diagnosis

Task21b proved the runtime and integration path works, but the UI still reads as engineered internals. The remaining defects are structural:

- Metadata is too high in the hierarchy.
- Message chrome appears before message content.
- Composer still exposes configuration affordances as primary controls.
- Source/run/action cards use too much bordered card weight.
- Side-panel and standalone layouts still diverge in density and rhythm.

The fix should remove cases and chrome, not add another layer of decoration.

## Design Direction

Use a restrained, editorial chat surface:

- Soft app background with a centered transcript column.
- User messages as compact right-side bubbles.
- Assistant messages as left/open prose with excellent markdown/code/table readability.
- Composer as a single rounded surface with subdued secondary controls.
- Metadata as progressive disclosure: chips, details, hover/focus actions, drawers, and compact source rows.
- Shared visual tokens and selectors reused by standalone and document copilot.

## Reference Translation

- ResearchClaw: drawer/main simplicity, one rounded composer, compact user bubbles, assistant prose, scroll guard, markdown polish, Notion-like palette.
- LobeChat/Open WebUI/Dify: composer as a composed control surface rather than separate form rows.
- AnythingLLM/Chatbot UI: centered transcript max width and quiet sources.
- LibreChat: message actions in subrows/hover/focus layers.

Do not copy code wholesale from external projects. Reimplement the relevant hierarchy in Jixia's existing React and CSS.

## Implementation Plan

1. Audit visible chat chrome in `ChatShell`, `ThreadViewport`, `ChatMessage`, `MessageStream`, `ChatComposer`, `ToolRunCard`, and `DocumentCopilotPanel`.
2. Collapse or demote metadata rows and status pills while keeping keyboard/focus accessibility.
3. Refine shared CSS in `chat.css` for transcript width, message spacing, bubbles/prose, markdown/code/tables, cards, source chips, and composer.
4. Apply compact side-panel overrides only where necessary.
5. Preserve all runtime behavior, callback contracts, provider metadata flow, disabled reasons, no-writeback, and tests.
6. Run focused tests, lint/typecheck if practical, and complete manual review with representative conversations.

## Risks

- Hiding state too aggressively can break auditability. Use progressive disclosure, not removal.
- CSS overrides can regress compact side-panel behavior. Verify both full workspace and document copilot.
- Polishing only empty states is misleading. Review long answer/code/source/error cases.

## Verification

Minimum verification for implementation/check/finish:

- `pnpm --filter @jixia/web test -- --run src/features/ai/chat/AIChatDialog.test.tsx src/features/documents/DocumentCopilotPanel.test.tsx src/features/documents/documentCopilotContext.test.ts src/features/documents/DocumentEditorPage.test.tsx src/app/App.test.tsx`
- `pnpm --filter @jixia/web lint`
- Manual visual review of standalone AI and document copilot with at least one representative provider-backed or mocked stream conversation.
