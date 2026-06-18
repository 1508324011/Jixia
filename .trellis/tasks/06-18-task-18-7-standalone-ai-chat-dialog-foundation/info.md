# Task 18.7 Technical Preparation

## Core Judgment
Task 18.7 is not a CSS cleanup. It is a data-structure correction.

The failed shape was:

```text
Document -> Context Surface -> Provider Controls -> Safety Labels -> Chat Log
```

The correct base shape is:

```text
Chat Runtime -> Thread -> Message Stream -> Composer -> Optional Attachments
```

Everything else should hang off that model, not compete with it.

## Target Components
Recommended frontend module boundary:

```text
apps/web/src/features/ai/chat/
  AIChatDialog.tsx
  ChatShell.tsx
  ThreadSidebar.tsx
  ThreadViewport.tsx
  MessageStream.tsx
  ChatMessage.tsx
  MarkdownMessage.tsx
  ToolRunCard.tsx
  ChatComposer.tsx
  chatTypes.ts
```

Names may change during implementation, but the responsibilities should not collapse back into one monolith.

## Runtime/Data Model
Minimum frontend model:

- `ChatThread`: id, title, status, timestamps, optional model/provider label
- `ChatMessage`: id, role, status, parts, createdAt, optional sources/tool events
- `ComposerState`: text, isSubmitting, optional attachments, optional command state
- `ChatRuntimeState`: active thread, thread list, loading/sending/error states
- `AttachmentChip`: explicit user-selected context only; no automatic current document by default

## Reuse Strategy

### Evaluate First
- `@assistant-ui/react`: likely best primitive candidate for Thread/Message/Composer/ThreadList anatomy.
- AI SDK UI concepts: useful for `message.parts`, streaming state, tool parts, transport design; do not import Next.js assumptions wholesale.

### Safe Direct Dependencies to Consider
- `react-markdown`
- `remark-gfm`
- `remark-breaks`
- syntax highlighter or Shiki
- autosize textarea helper

### ResearchClaw Patterns to Adapt
- `UnifiedChatModal`: drawer shell width, optional history sidebar, flex message area, rounded composer.
- `MessageStream`: message dedupe, grouped tool calls, auto-scroll respecting user scroll position.
- `TextMessage`: Markdown/GFM/syntax rendering and streaming cursor pattern.
- `ToolCallCard` / `ToolCallGroup` / `PermissionCard`: future compact trace rendering.

### Do Not Copy
- Electron IPC
- local CLI/backend spawning
- cwd/path prompt injection
- BrowserWindow broadcasts
- local provider assumptions
- direct kill/stop UI without Jixia server endpoint
- literal ResearchClaw code without license review

## Boundary Rules
- Browser never calls provider APIs.
- Browser never handles provider keys.
- Browser never stores prompts/responses in local/session storage.
- Browser does not decide authorization.
- No document mutation UI appears in this task.
- No fake streaming/cancel UI appears without server implementation.
- Any shared/API DTO change must be transport-safe and covered by focused tests.

## Implementation Order
1. Read relevant specs and prior failure notes.
2. Decide whether to use `assistant-ui` primitives or Jixia-native primitives.
3. Create chat module/component boundaries before moving UI details.
4. Build standalone empty state and active message stream.
5. Build chat-native composer.
6. Add robust Markdown rendering.
7. Wire to existing server-owned AI conversation transport only if it does not reintroduce automatic document context.
8. Add tests for standalone behavior and forbidden-control absence.

## Verification Focus
- First impression reads as AI chat dialog, not control console.
- Default chat works without current document context.
- Composer is the primary action surface.
- History/sidebar does not obscure conversation.
- Markdown output is mature enough for real answers.
- Security/no-writeback boundaries remain intact.
