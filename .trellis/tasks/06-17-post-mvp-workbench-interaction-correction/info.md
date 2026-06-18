# Task 18.2 Technical Design: Workbench Interaction Correction

## Core Diagnosis

Task 18 created a useful primitive layer, but it preserved the wrong interaction structure. Jixia still reads as stacked rectangles because the dominant UI objects are bordered `Panel`, `Pane`, `ListRow`, `Toolbar`, `Button`, and full-width nav buttons. The data relationship is wrong: every thing looks like an equal action card instead of a stable workbench region around a selected research artifact.

Task 18.2 must fix composition first, not add new product pages. The proof surface is the document editor with right AI copilot because it carries the highest manual QA pain and the most server-first behavior to preserve.

## Reference Patterns

ResearchClaw and mature workbench tools show the same structure:

- compact primary sidebar rows or rail entries with icons, short labels, subtle active indicators, recents, and bottom-pinned settings;
- stable named regions: global shell, left navigation/explorer, main artifact surface, right inspector/copilot, status or job feedback surface;
- artifact-first layouts where actions live in toolbars, menus, hover affordances, context chips, or side inspectors, not as repeated large rectangles;
- conversation-first AI surfaces with session/history affordance, message thread, user/assistant turns, bottom composer, context chips, streaming/stop/error/retry states, and provider/model metadata as secondary information.

Concrete local references already inspected:

- `/home/zhurui/github_project/ResearchClaw/src/renderer/components/app-shell.tsx`: compact sidebar rows, active indicator, recents, bottom settings, job/status toasts.
- `/home/zhurui/github_project/ResearchClaw/src/renderer/components/chat/UnifiedChatModal.tsx`: right-side drawer chat, session history, message bubbles, context chips, bottom composer, streaming controls.

## Current Jixia Problem Areas

- `apps/web/src/features/layout/AppShell.tsx`: target spine exists, but nav entries are still full-width buttons with descriptions.
- `apps/web/src/features/layout/workbench.css`: centralizes boxed visual grammar; too many borders/backgrounds/gaps create a rectangle stack.
- `apps/web/src/features/documents/editor/JixiaEditor.tsx`: editor is still a titled `Document blocks` panel with a block-type button wall and per-block card controls.
- `apps/web/src/features/documents/DocumentEditorPage.tsx`: owns critical behavior and should become the proof workbench surface without changing draft/revision semantics.
- `apps/web/src/features/ai/AIConversationPanel.tsx`: provider config, context scope, conversation list, messages, and prompt are nested panels; the message thread is not the primary interaction.
- `apps/web/src/features/attachments/AttachmentBlock.tsx`: attachment UI inherits nested panel rhythm and must keep signed-upload safety intact.

## Implementation Shape

1. Reframe the shell/sidebar:
   - remove long nav descriptions from the primary sidebar;
   - use compact row/rail affordances with subtle active state;
   - keep `Setting` bottom-pinned;
   - keep session/user affordance compact and non-cardlike.

2. Refine primitives and visual grammar:
   - distinguish true pane boundaries from ordinary rows/messages/toolbars;
   - reduce default border/background/padding usage;
   - keep primitives thin; do not introduce plugin systems, dock managers, command registries, or broad dependencies.

3. Correct the document editor proof surface:
   - center the writing canvas;
   - de-emphasize the `Document blocks` wrapper;
   - reduce always-visible block insertion button wall;
   - make block controls lighter/contextual where practical;
   - keep existing block data model and document APIs unchanged.

4. Rebuild the right AI copilot as conversation-first:
   - message thread and bottom composer are the primary UI;
   - context appears as chips/compact affordances;
   - provider/model/current document state is visible but secondary;
   - conversation/session history is available without dominating the current thread;
   - loading/sending/stop/error/retry/empty states are explicit;
   - no apply/insert/auto-writeback actions.

5. Compact object browsers:
   - project and document lists should read as records/explorer rows;
   - avoid duplicate “row is clickable + Open button” patterns unless accessibility requires them;
   - metadata/status/actions should be inline or overflow-style, not card CTAs.

## Hard Boundaries

Do not break these:

- browser remains a renderer of server-authorized data; no client-side permission ownership;
- `apiFetch` keeps `/api` prefix and cookie credentials behavior;
- document load, autosave draft, formal revision save, 409 human conflict handling, and archived read-only state remain intact;
- AI can only use explicit current document/supplemental context and cannot write into documents automatically;
- AI provider keys remain write-only with safe previews only;
- attachment upload/download keeps signed intent flow, `credentials: omit` for storage upload, and no durable signed URLs/credentials in UI state;
- no full Notebook/Search/Library implementation in this task;
- no backend/schema/shared contract change unless strictly necessary to preserve current behavior.

## Verification Plan

Minimum verification after implementation:

- `pnpm --filter @jixia/web test`
- `pnpm --filter @jixia/web build`

Focused areas to watch:

- `apps/web/src/features/documents/DocumentEditorPage.test.tsx`: load, autosave, formal save, conflict, archived read-only, no AI writeback.
- `apps/web/src/features/ai/AISettingsPage.test.tsx`: key secrecy and safe preview behavior.
- `apps/web/src/features/attachments/uploadAttachment.test.ts`: signed upload/download safety.
- `apps/web/src/app/App.test.tsx`: shell/routing/session expectations after nav label changes.

If UI label changes break tests, update tests only to reflect intentional interaction changes; do not weaken behavior assertions.
