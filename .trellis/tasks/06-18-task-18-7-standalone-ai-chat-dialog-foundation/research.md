# Task 18.7 Research Notes

## Why This Task Exists
Manual review after Task 18.6 still failed. The user correctly identified that the UI is not an AI dialog; it is a stack of document-copilot controls. The repair is not another local tweak to `AIConversationPanel`. The repair is to build a real chat foundation first.

## Jixia Failure Evidence
- `DocumentEditorPage.tsx` mounts AI as an inspector pane inside the document editor.
- `AIConversationPanel.tsx` remains a large monolith with document/provider/context state as first-class UI state.
- The launchpad copy says “Document-grounded copilot” and “Ask against this document”.
- `AIContextSurface` persists as a visible source-set/control rail.
- `AIComposer` is a form: title input, provider/model select, quick prompt buttons, warning, labeled textarea, status pills, send button.
- CSS widened the inspector but kept the surface as an editor-side control pane.
- Web runtime dependencies do not include mature chat/markdown/composer primitives, which caused a weak hand-rolled UI.

## User-Approved Pivot
The user explicitly allowed pausing copilot-document integration: first make the AI dialog good, then reconnect documents later.

That means Task 18.7 should default to no automatic current-document context.

## ResearchClaw Lessons
Reusable frontend ideas:
- 640px drawer/chat shell
- optional session sidebar
- scrollable message stream
- bottom rounded autosizing composer
- compact context chips near composer
- message stream dedupe/grouping/autoscroll
- Markdown/GFM/syntax rendering
- compact tool/permission cards

Do not reuse ResearchClaw transport/backend assumptions.

## Mature OSS Lessons
- assistant-ui: best candidate for React chat primitives. Its anatomy is the missing piece: thread viewport, messages, sticky viewport footer composer, scroll-to-bottom, thread list, action/tool slots.
- Vercel AI SDK UI: useful model for typed message parts, streaming state, sources, attachments, usage metadata, and regenerate/stop concepts. Only adopt concepts compatible with Jixia server-first transport.
- CopilotKit: good UX reference for sidebar/popup slots, but too runtime-opinionated for the first clean private chat shell.
- Open WebUI / LibreChat / AnythingLLM / Chatbot UI / Vercel chatbot: useful full-app references; do not copy wholesale.

## Practical 18.7 Shape
Build:

```text
AIChatDialog
  ChatShell
    ThreadSidebar
    ThreadViewport
      MessageStream
      Sticky ChatComposer
```

Later, document copilot becomes:

```text
DocumentEditor -> optional attachment adapter -> AIChatDialog
```

Not:

```text
DocumentEditor -> Inspector -> ContextRail -> ComposerForm -> ChatLog
```
