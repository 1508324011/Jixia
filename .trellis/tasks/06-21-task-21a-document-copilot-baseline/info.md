# Task 21a Technical Notes

## Data First

The correct data structure is:

```text
DocumentEditorPage state
  -> DocumentCopilotContext
  -> AIConversationContextSnapshot
  -> existing AI conversation stream
  -> advisory assistant message
```

The incorrect structure is:

```text
AI output owns editor mutation
```

Do not build that.

## Existing Code to Inspect First

- `apps/web/src/features/documents/DocumentEditorPage.tsx`
  - Current placeholder is `DeferredDocumentAI`.
  - Page owns document id, title, snapshot, base revision, read-only status, and editor ref.
- `apps/web/src/features/documents/editor/JixiaEditor.tsx`
  - `JixiaEditorHandle.exportSnapshot()` is the safe current editor boundary.
- `apps/web/src/features/ai/chat/AIChatDialog.tsx`
  - Existing provider loading, thread creation, streaming, optimistic messages, and status state.
- `apps/web/src/features/ai/chat/chatStream.ts`
  - Stream parser to reuse.
- `apps/web/src/features/ai/chat/ChatComposer.tsx`, `ChatMessage.tsx`, `MessageStream.tsx`
  - Reuse only if they fit inspector layout.
- `apps/api/src/modules/ai/ai.routes.ts`
  - Existing AI API route surface.
- `apps/api/src/modules/ai/ai-conversation.service.ts`
  - Existing conversation/run data model.
- `packages/shared/src/ai.ts`
  - Existing `AIConversationContextSnapshot` and context item DTOs.

## Context Contract

A Task21a context snapshot should be small and explicit:

- `currentDocumentId`
- one `current_document` context item
- title
- document id/type/project id if known
- revision number/base revision
- selected block ids if available, otherwise empty array
- bounded plain text extracted from the editor snapshot
- capture timestamp

If plain-text extraction from BlockNote/app snapshot is not already available, implement a small deterministic extractor. Do not send raw full JSON if a readable bounded text representation is enough.

## UI Shape

The panel should have four stable regions:

1. Header/status: provider, run status, setup link.
2. Context card: what the model will see.
3. Conversation viewport: user/assistant messages.
4. Composer: prompt input and send/cancel.

No document-body controls. No inline AI chrome. No auto apply.

## Invariants

- Provider keys stay server-owned.
- Document save/revision conflict behavior stays unchanged.
- Task20m document visual baseline stays intact.
- Task20l clean attachment states stay intact.
- Task20j server-first upload/default codeBlock stays intact.
- Standalone AI chat remains usable unless a deliberate shared refactor covers it with tests.

## Testing Suggestions

- Unit test context extraction from a known editor snapshot.
- Component test provider-missing state.
- Component/integration test happy-path stream with mocked `apiStream` events.
- Regression test that send/stream does not call document draft/revision save or mutate editor snapshot.
- Existing standalone AI chat tests should still pass.
