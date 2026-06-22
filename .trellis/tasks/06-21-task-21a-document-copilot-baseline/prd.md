# Task 21a Document Copilot Baseline

## Source of Truth

- Supersedes the placeholder document inspector in `apps/web/src/features/documents/DocumentEditorPage.tsx`.
- Builds on Task20m: the document body is now usable and must stay clean.
- Builds on Task18.8/18.7: Jixia already has a standalone streaming AI chat surface and server-owned provider settings.
- Existing AI contracts live in `packages/shared/src/ai.ts`.
- Existing AI services/routes live in `apps/api/src/modules/ai/`.
- Existing chat UI and stream helpers live in `apps/web/src/features/ai/chat/`.

## Core Judgment

This is worth doing, but only if the data model is clean.

The copilot is not a magic editor. It is a document-scoped conversation with explicit context. The user must see what context is being sent, and the AI must not silently write back into the document.

Bad shape:

```text
editor state -> hidden prompt magic -> AI output -> silent document mutation
```

Good shape:

```text
explicit document context snapshot -> AI conversation stream -> advisory response -> human decides what to copy/use
```

## Root Problem

`DocumentEditorPage` currently renders `DeferredDocumentAI`, which tells users to use the standalone AI workspace. That was honest while the editor was unstable, but it is now a dead end. Jixia needs a document copilot that understands the current document without polluting the document body or creating a second AI backend.

## Binding Decisions

1. Document copilot lives in the document inspector, not inside the document body.
2. The context sent to AI must be explicit and visible: current document id, title, type, base revision, selected blocks if available, and a bounded text snapshot.
3. Reuse the existing AI conversation/run streaming API and provider config system.
4. Provider keys stay server-owned. The browser may see `AIProviderConfigView.hasKey`; it must never see raw keys or encrypted material.
5. Task21a has no auto-apply, no auto-insert, no rewrite button, and no silent mutation.
6. AI output is advisory and copyable only.
7. Notebook and Project documents must share one copilot implementation.
8. The visual model should learn from mature copilot side panels: calm context card, provider/status row, message viewport, composer, and clear source chips.

## Product Goal

Replace the placeholder document AI panel with a real document copilot baseline that can:

- show the current document context that will be sent,
- send a user prompt with that context through the existing server AI pipeline,
- stream an assistant response in the inspector,
- preserve document save/revision behavior,
- keep all document mutations human-controlled.

## Non-Goals

- No auto-editing or inline AI rewrite.
- No applying model output to the editor.
- No cross-document retrieval or vector search.
- No comments, tasks, citations database, or provenance graph.
- No new AI provider adapter stack.
- No replacing the standalone AI workspace.
- No copying ResearchClaw/Notion/Obsidian code. Learn the interaction pattern; reuse Jixia and open-source-compatible primitives only.

## Functional Requirements

### Document Context

- The copilot must capture context from the active document page.
- The panel must display a context card before send:
  - document title,
  - document id,
  - document type if available,
  - base revision/current revision number,
  - whether the document is active/read-only,
  - approximate bounded content size.
- If selected-block context is not implemented yet, say so explicitly in the UI and send current-document context only.
- The serialized context must use existing `AIConversationContextSnapshot` shape or a compatible extension in `packages/shared/src/ai.ts`.
- Context text must be bounded. Do not send unbounded JSON snapshots blindly.

### Conversation Runtime

- The panel must load provider configs through `/ai/configs`.
- If no usable provider exists, show a clear setup state with a settings action.
- Sending a message must use existing conversation/message streaming endpoints.
- The stream must expose queued/running/succeeded/failed/cancelled states.
- The user can cancel a running stream if the existing stack supports abort.
- Retry/copy actions may be reused from the existing chat UI if they fit the inspector.

### Visual Baseline

- The copilot must look like a document side panel, not a giant modal or standalone workspace pasted into the inspector.
- Minimum layout:
  - compact header/status row,
  - explicit context card/source chips,
  - message viewport,
  - composer pinned at the bottom or visually stable,
  - provider/status/error affordances.
- The document body remains visually unaffected.

### Safety

- No provider key or encrypted key leaves the server.
- No raw signed attachment URL, object key, bucket, local storage path, or storage secret is persisted into conversation context.
- AI output must not change the editor snapshot unless the user manually copies text.
- Draft autosave and formal revision save must behave exactly as before.

### Compatibility

- Notebook documents and Project documents use the same copilot component.
- Existing standalone AI chat must continue to work unless explicitly untouched tests prove no regression.
- Existing Task20j/20k/20l/20m editor, attachment, upload, and visual contracts must not regress.

## Acceptance Criteria

- Opening a Notebook document shows a real document copilot panel, not the placeholder telling users to open standalone chat.
- Opening a Project document shows the same copilot behavior.
- The panel shows current document context before sending.
- Sending a prompt streams an assistant response through the server AI pipeline.
- The user can see provider missing/error/running/done states.
- No document content changes after sending/receiving AI messages unless the user manually edits the editor.
- Refresh/reopen preserves document content and normal draft/revision behavior.
- Tests cover context snapshot construction, no-writeback behavior, provider-missing state, and at least one stream happy path using the existing fixture/mocks.
- Manual review records browser/device, document type, provider state, sent context summary, stream result, and no-writeback verification.

## Suggested Implementation Order

1. Extract a `DocumentCopilotPanel` from the placeholder area in `DocumentEditorPage`.
2. Define a small document-context capture boundary from current page state and `JixiaEditorHandle.exportSnapshot()`.
3. Reuse existing chat stream helper/components where they fit; do not import the whole standalone workspace if it brings thread-sidebar/modal assumptions.
4. Wire provider config loading and message send/stream using existing AI routes.
5. Add tests for context visibility, provider missing state, stream path, and no document mutation.
6. Run focused web tests, AI API tests if contracts change, lint/build, and browser/manual review.

## Manual Review Gate

Do not mark this task complete until a human verifies:

- Notebook document copilot appears and sends explicit current-document context.
- Project document copilot appears and sends explicit current-document context.
- The AI answer streams in the inspector.
- The document content does not change after AI response.
- Provider missing/error states are understandable.
- Existing save/refresh/reopen still works.
