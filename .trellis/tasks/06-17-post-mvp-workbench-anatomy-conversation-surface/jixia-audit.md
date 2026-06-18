# Task 18.3 Jixia UI Audit

## Core Finding

Task 18.2 improved the surface vocabulary, but the product still reads as a stack of rectangular controls because the underlying region model is still weak. The next implementation must move Jixia from component-level cleanup to workbench anatomy: `ActivityRail`, `ContextSidebar`, `Workspace`, `ArtifactCanvas`, `Inspector`, and `ConversationSurface`.

This is a frontend interaction refactor. It must preserve all server-first behavior: cookie-backed `/api` calls, document drafts and revisions, human-only conflict handling, archived read-only behavior, AI key secrecy, explicit AI context, no AI writeback, and signed attachment upload/download flows.

## Evidence From Current Jixia

- `apps/web/src/features/layout/AppShell.tsx` already exposes the target surface set, but navigation is still mapped directly to button-like shell entries and a generic topbar. Task 18.3 should make the shell anatomy explicit rather than continuing to style the same one-level navigation model.
- `apps/web/src/features/layout/workbench.css` still makes `Pane`, `Panel`, `Button`, `ListRow`, `Notice`, and `Pill` visually heavy by default. This is why the UI still feels like thin cards/buttons even after Task 18.2.
- `apps/web/src/features/layout/workbench.tsx` reuses row-action classes across headers, panes, panels, and empty states. That gives unrelated areas the same rectangular action rhythm.
- `apps/web/src/features/documents/DocumentEditorPage.tsx` is correctly the proof surface and preserves draft/revision/conflict behavior, but it still stacks header, toolbar, status, split pane, editor, and copilot as separate chrome bands.
- `apps/web/src/features/documents/editor/JixiaEditor.tsx` has a writing-canvas wrapper, but block insertion, block type, remove controls, and labeled textareas still make each block feel like a form record.
- `apps/web/src/features/ai/AIConversationPanel.tsx` contains conversation functionality, but provider controls, context controls, and history layout visually precede the thread and composer. It is still control-panel-first rather than conversation-first.
- `apps/web/src/features/ai/AIConversationPanel.tsx` includes a disabled `Stop` affordance. Without real cancellation, this should be removed or turned into honest status text.
- `apps/web/src/app/App.tsx` composes Settings around `AISettingsPage`, while `AISettingsPage` itself returns a full workbench surface. That nested surface pattern is a clear source of chrome stacking.
- `apps/web/src/features/attachments/uploadAttachment.ts` already enforces safe signed upload behavior and should not be changed for visual work unless absolutely necessary.

## Files In Scope

Primary scope:

- `apps/web/src/features/layout/AppShell.tsx`
- `apps/web/src/features/layout/workbench.tsx`
- `apps/web/src/features/layout/workbench.css`
- `apps/web/src/features/documents/DocumentEditorPage.tsx`
- `apps/web/src/features/documents/editor/JixiaEditor.tsx`
- `apps/web/src/features/ai/AIConversationPanel.tsx`
- `apps/web/src/app/App.tsx`
- `apps/web/src/features/ai/AISettingsPage.tsx`

Secondary scope:

- `apps/web/src/features/projects/ProjectListPage.tsx`
- `apps/web/src/features/projects/ProjectDetailPage.tsx`
- `apps/web/src/features/documents/DocumentList.tsx`
- `apps/web/src/features/attachments/AttachmentBlock.tsx`
- `apps/web/src/features/ai/AIUsagePage.tsx`

Safety-sensitive files to preserve:

- `apps/web/src/features/attachments/uploadAttachment.ts`
- `apps/web/src/lib/api.ts`
- shared document and AI API payload contracts

## Anti-Patterns To Remove

- Bordered `Pane` and `Panel` as the default for every region.
- Equal-weight rectangular nav/action buttons where persistent workbench chrome should exist.
- Create forms dominating project/document list surfaces.
- Permanent block controls around every editor block.
- Provider/context controls above the AI conversation thread.
- Fake disabled chat controls such as `Stop` without real cancellation.
- Full `WorkbenchSurface` nested inside another settings pane.
- Decorative governance/status pills that do not help the user act.

## Acceptance Criteria

- The shell clearly has `ActivityRail`, `ContextSidebar`, and `Workspace` roles.
- Navigation still exposes Home, Search, Library, Projects, Notebook, AI, and bottom-pinned Setting, but no longer reads as stacked rectangular buttons.
- The editor proof surface reads as document + assistant + status, not as headers/toolbars/notices/forms stacked together.
- The document editor presents a continuous writing canvas with contextual block controls.
- The AI pane presents conversation first: thread, composer, visible context chips, compact session/header controls, and secondary provider/model affordances.
- No AI writeback controls appear: no Apply, Insert, Replace, Rewrite, Merge, or silent draft update.
- Settings composition has one shell/frame, not nested workbench pages.
- Project and document lists become compact workbench records with subdued create/refresh actions.
- Draft autosave, formal revisions, conflict behavior, archived read-only behavior, AI key safety, explicit AI context, and attachment upload/download safety remain unchanged.

## Verification Targets

Run or preserve coverage for:

- `pnpm --filter @jixia/web test -- DocumentEditorPage`
- `pnpm --filter @jixia/web test -- AIConversationPanel`
- `pnpm --filter @jixia/web test -- AISettingsPage`
- `pnpm --filter @jixia/web build`
- `pnpm --filter @jixia/web e2e -- document-save` when editor route or labels change
- `pnpm --filter @jixia/web e2e -- attachment-upload` when block insertion or attachment labels change
