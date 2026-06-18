# Task 18.3 ResearchClaw Reference

## Conclusion

ResearchClaw is useful for Task 18.3 as an interaction-grammar reference, not as code to copy. Jixia should emulate the workbench anatomy, density, tabs, split surfaces, message stream, and status/job primitives while reimplementing all data flow around server-owned state, auditability, permissions, and browser-safe contracts.

## Reusable Patterns

### App shell and navigation

- `/home/zhurui/github_project/ResearchClaw/src/renderer/components/app-shell.tsx` defines the central shell contract: collapsible sidebar, aligned top tab strip, content slot, recents, bottom settings, and floating job/download toasts.
- The sidebar uses compact row navigation with short labels, subtle active state, a collapsed width, and bottom-pinned settings.
- Recent objects appear in the sidebar only when expanded. Jixia should source any recents from server-authorized activity or API data, not from authoritative browser-only state.

### Route metadata and work tabs

- `/home/zhurui/github_project/ResearchClaw/src/renderer/router.tsx` uses route handles to opt selected pages into full-width/full-height work surfaces.
- `/home/zhurui/github_project/ResearchClaw/src/renderer/hooks/use-tabs.tsx` tabs durable work objects such as reader, notes, project detail, and settings. Static sidebar destinations are not all tabs.
- For Jixia, Task 18.3 should not build a full tab system yet, but it should structure `AppShell` so future work-object tabs can exist without another shell rewrite.

### Settings

- `/home/zhurui/github_project/ResearchClaw/src/renderer/pages/settings/settings-nav.ts` keeps grouped settings navigation data outside React rendering.
- `/home/zhurui/github_project/ResearchClaw/src/renderer/pages/settings/page.tsx` uses a search-first settings shell: top search, narrow grouped nav, independent right content.
- Jixia should keep Settings boring and server-safe: provider references, account/profile, governance/storage later, no card-grid settings dashboard.

### Reader/chat split surface

- `/home/zhurui/github_project/ResearchClaw/src/renderer/pages/papers/reader/page.tsx` models `split`, `chat-only`, and `pdf-only` modes with resizable panes.
- The chat pane has history, a reusable message stream, context attachments, model/agent selector, and bottom composer next to the artifact.
- Jixia should translate this into a server-first document/reader/editor workspace, not copy local PDF/file assumptions.

### Message stream and AI/job surfaces

- `/home/zhurui/github_project/ResearchClaw/src/renderer/components/agent-todo/MessageStream.tsx` separates message rendering from stream state and supports user/assistant/tool/plan/error/permission states.
- `/home/zhurui/github_project/ResearchClaw/src/renderer/hooks/use-agent-stream.ts` demonstrates recoverable streaming state, but Jixia must use server APIs/SSE/WebSocket/server actions rather than Electron IPC.
- `/home/zhurui/github_project/ResearchClaw/src/renderer/components/agent-todo/StatusDot.tsx`, `RunTimeline.tsx`, `ToolCallCard.tsx`, `ToolCallGroup.tsx`, and `PlanCard.tsx` are useful patterns for future AI job/status surfaces.

### Density tokens

- `/home/zhurui/github_project/ResearchClaw/tailwind.config.ts` defines a Notion-like neutral palette, 11px metadata text, subtle shadows, and warm sidebar tokens.
- `/home/zhurui/github_project/ResearchClaw/src/renderer/styles/globals.css` sets compact base typography, thin scrollbars, markdown/article typography, and dense tables.
- Jixia should express equivalent tokens in its CSS rather than scattering one-off Tailwind-style values.

## Non-Goals For Jixia

- Do not copy Electron title bars, draggable window regions, IPC calls, local path PDF assumptions, or desktop filesystem behavior.
- Do not store authoritative project/document/job/provider/audit state in browser local state.
- Do not copy local CLI/provider configuration semantics; Jixia must keep AI provider keys and job policy server-governed.
- Do not adopt an arbitrary dock manager, broad tab system, or full plugin architecture in Task 18.3.

## Task 18.3 Implications

- Refactor Jixia shell into `ActivityRail`, `ContextSidebar`, and `Workspace` regions.
- Leave room for work-object tabs later but do not implement a full tab framework now.
- Promote AI copilot into a reusable conversation/message surface with context chips, thread, composer, and clear server-owned state boundaries.
- Add or prepare small status primitives for draft/revision/conflict/archive/provider/job cues.
- Keep document/editor work as the proof surface before expanding Notebook/Search/Library.
