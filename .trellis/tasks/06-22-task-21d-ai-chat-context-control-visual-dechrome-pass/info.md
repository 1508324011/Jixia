# Task 21d Technical Design

## Diagnosis

Document Copilot currently behaves as a document-scoped AI surface, but the UI hides a serious privacy/agency decision: the current document snapshot is rebuilt and sent on every message. This is safe only if the user understands and controls it. The current mandatory context card makes the UI visually noisy but still does not provide actual control.

The visual issue is not primarily color. The structure still exposes internal runtime state, provider state, context state, source state, help text, and status labels as default chrome. Mature chat products keep the transcript and composer dominant, then expose metadata through chips, drawers, menus, hover/focus subrows, or details.

## Design Direction

Use a restrained editorial chat surface:

- Transcript and composer are primary.
- Context/source/provider state is subordinate but discoverable.
- Document context is an explicit per-message/conversation control, not hidden magic.
- Default side panel should feel like a compact chat drawer, not a metadata grid.
- Standalone AI should feel like a focused private chat workspace, not a settings page.

## Context Toggle Semantics

Recommended frontend semantics:

1. Add local state in `DocumentCopilotPanel` such as `includeDocumentContext`, default `true`.
2. When enabled, build the existing bounded snapshot via `createDocumentCopilotContext(...)`.
3. When disabled, build an explicit empty snapshot with current document scoping but no content:
   - `currentDocumentId: document.id`
   - `items: []`
   - `capturedAt: new Date().toISOString()`
4. Use that snapshot consistently in both:
   - `POST /ai/conversations` when creating a conversation
   - `POST /ai/conversations/:id/messages/stream` for each user send
5. Keep backend validation intact. Empty `items` means provider prompt should receive no explicit document text.
6. The UI copy should say context is included per message when enabled.

Do not send the full document when the toggle is off. Do not silently keep using the previous conversation snapshot.

## UI Structure

### Document Copilot

- Replace the mandatory default context card with a compact context control row.
- The compact row should include:
  - context on/off switch or segmented chip
  - bounded preview summary (`3 blocks`, `4/4`, current revision)
  - details affordance for full preview
- Move full bounded preview into a disclosure/drawer/popover.
- The composer should stay usable at inspector width and remain visually dominant.

### Standalone AI

- Demote provider/settings/refresh to compact controls.
- Remove explanatory standalone runtime copy from the first screen unless expanded.
- Preserve standalone empty context contract.
- Keep transcript width readable and composer sticky.

### Composer

- One rounded control surface.
- Top chip row for context/model/provider state.
- Textarea as main focus.
- Right-side send/stop affordance.
- Disabled reasons can appear inline only when actionable; otherwise use tooltip/details.

### Sources and Context

- Preserve source disclosure under assistant answers.
- Reuse visual grammar for document context details where possible.
- Consider a shared `ContextDetails`/`SourceDetails` pattern if it reduces duplication without over-abstracting.

## Files Likely to Change

- `apps/web/src/features/documents/DocumentCopilotPanel.tsx`
- `apps/web/src/features/documents/DocumentCopilotPanel.test.tsx`
- `apps/web/src/features/documents/documentCopilotContext.ts`
- `apps/web/src/features/documents/documentCopilotContext.test.ts`
- `apps/web/src/features/ai/chat/AIChatDialog.tsx`
- `apps/web/src/features/ai/chat/ThreadSidebar.tsx`
- `apps/web/src/features/ai/chat/ThreadViewport.tsx`
- `apps/web/src/features/ai/chat/ChatComposer.tsx`
- `apps/web/src/features/ai/chat/ChatMessage.tsx`
- `apps/web/src/features/ai/chat/MessageStream.tsx`
- `apps/web/src/features/ai/chat/chat.css`
- `apps/web/e2e/document-save.spec.ts`
- `apps/web/e2e/test-api.mjs`

## Verification Plan

Minimum commands:

```bash
pnpm --filter @jixia/web test -- --run src/features/ai/chat/AIChatDialog.test.tsx src/features/documents/DocumentCopilotPanel.test.tsx src/features/documents/documentCopilotContext.test.ts src/features/documents/DocumentEditorPage.test.tsx src/app/App.test.tsx
pnpm --filter @jixia/web lint
pnpm type-check
```

Browser/manual review must also verify request bodies:

- Toggle on: stream request contains non-empty `selectedContextSnapshot.items` with `sourceType: current_document`.
- Toggle off: stream request contains empty `selectedContextSnapshot.items` or equivalent empty explicit context.
- First conversation creation follows the same on/off behavior.
- No apply/insert/rewrite/automerge buttons appear.

Use alternate E2E ports if local `4174` / `5173` are occupied.
