# Task 21b Technical Design Notes

## Core Judgment

The data model is already good enough: conversation, message, provider config, run status, document context. The bad part is presentation. Do not invent new backend concepts. Fix the view hierarchy.

## Current Jixia Problem Areas

- `apps/web/src/features/ai/chat/ChatShell.tsx` uses a management-style sidebar/main grid.
- `apps/web/src/features/ai/chat/ChatMessage.tsx` renders every message as a bordered record with header/actions/status.
- `apps/web/src/features/ai/chat/ChatComposer.tsx` exposes modelbar/help/chips too prominently.
- `apps/web/src/features/ai/chat/chat.css` uses hard borders, rectangular cards, and status-heavy presentation.
- `apps/web/src/features/documents/DocumentCopilotPanel.tsx` places the context card before the conversation and gives safety metadata first-class visual weight.
- `apps/web/src/features/layout/workbench.css` contains both older AI copilot rules and Task21a document copilot rules; avoid adding more duplicated ad-hoc selectors.

## Design Direction

Use a calm research-chat aesthetic:

- Low-contrast warm/neutral surfaces compatible with existing Jixia shell.
- Rounded chat bubbles and composer surfaces.
- Assistant messages as readable prose, not bordered audit cards.
- User messages as compact right-aligned bubbles.
- Metadata as chips, collapsible details, or side/right rails.
- Hover-only message actions where possible.
- Subtle transition durations around 160-260ms; no heavy animation required.

## ResearchClaw Patterns Worth Reusing Conceptually

- Right drawer and motion shape: `/home/zhurui/github_project/ResearchClaw/src/renderer/components/chat/UnifiedChatModal.tsx`.
- Notion-like color tokens: `/home/zhurui/github_project/ResearchClaw/tailwind.config.ts`.
- Rounded message bubbles and bottom composer: `/home/zhurui/github_project/ResearchClaw/src/renderer/components/chat/UnifiedChatModal.tsx`.
- Scroll guard that avoids stealing scroll when user has moved upward: `/home/zhurui/github_project/ResearchClaw/src/renderer/components/agent-todo/MessageStream.tsx`.
- Assistant markdown as prose: `/home/zhurui/github_project/ResearchClaw/src/renderer/components/agent-todo/TextMessage.tsx`.

Do not copy Tailwind classes directly. Jixia is not a Tailwind app.

## Mature Open-Source References

- LobeChat: floating chat panel, compact/expanded input reuse.
- Open WebUI: full-height chat with optional panels and mature message actions.
- Dify: clean chat container, footer input, assistant answer blocks.
- AnythingLLM: workspace chat with sources/memories sidebars.
- LibreChat / Chatbot UI: autosizing composer with left tool/model slots and right send/stop slot.

## Suggested Implementation Shape

1. Add shared visual CSS tokens for chat surfaces in `chat.css` or a small imported chat theme section.
2. Refactor/extend `ChatMessage` to support presentation variants if necessary: full page and compact side panel.
3. Refactor/extend `ChatComposer` or create `ChatComposerSurface` with slots for provider/context/actions.
4. Rework `DocumentCopilotPanel` so context is compact by default and the transcript is the main visual area.
5. Rework `ChatShell`, `ThreadSidebar`, and `ThreadViewport` so full AI chat uses the same transcript/composer language.
6. Add scroll guard to message streams so streaming does not steal scroll when user is reading earlier content.
7. Update tests for semantic/accessibility expectations; avoid screenshot-only tests unless existing patterns support them.

## Preserve These Contracts

- Browser never receives provider key material.
- Browser never exposes signed attachment URLs, object keys, bucket names, or storage secrets in context display.
- AI output remains advisory and copyable only.
- Existing route and shared DTO contracts remain unchanged.
- Notebook and Project document parity remains intact.
