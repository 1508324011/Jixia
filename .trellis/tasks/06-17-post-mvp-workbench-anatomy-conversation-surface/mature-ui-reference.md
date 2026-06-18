# Task 18.3 Mature UI Reference

## Research Conclusion

Mature workbench products do not solve this with prettier cards. They solve it with stable region anatomy and artifact-centered flows:

`ActivityRail -> ContextSidebar -> ArtifactCanvas -> Inspector / Conversation -> Status / Jobs`

Jixia Task 18.3 should implement this anatomy for the existing MVP surfaces before building Notebook, Search, or Library.

## Product Pattern Evidence

- VS Code separates Activity Bar, Primary Sidebar, Editor, Secondary Sidebar, Panel, and Status Bar. Chat belongs in a secondary/sidebar region while the artifact remains central.
- Cursor and Copilot-style products make AI context explicit through attached files, docs, diffs, selected text, and bottom-composer interactions. Context is visible and user-controlled.
- Notion and Obsidian-style editors keep the writing surface dominant. Block/page controls are contextual, hover/focus driven, and secondary to text.
- Zotero-style research tools use collection/tag navigation, center object lists/readers, and right metadata/notes/attachments inspectors.
- GitHub PR review uses central diff/artifact review, file/context navigation, inline comments, viewed/progress state, and final review actions.
- Slack-style threads keep conversations attached to objects while avoiding main-surface clutter.
- ChatGPT/Claude project workspaces organize chats, files, instructions, and sharing boundaries, but only where server contracts support that context model.

## Task 18.3 Requirements From Mature Patterns

### ActivityRail

- Slim persistent product spine.
- Stable order: Home, Search, Library, Projects, Notebook, AI, bottom Setting.
- Icon-first with accessible labels.
- Active state via subtle rail/background, not full bordered button cards.
- Badges only for meaningful server-backed counts or statuses.

### ContextSidebar

- Surface-specific navigation and filters.
- Projects: project rows, recent docs, archived/conflict/read-only indicators.
- Documents: document tree/list, drafts, recent activity.
- Library/Search/Notebook placeholders: honest empty/context states, no fake data.
- Collapsible and dense; never a dashboard-card column.

### ArtifactCanvas

- Central dominant work surface.
- Document editor should be continuous writing canvas.
- Project/detail surfaces should behave like artifact workspaces, not metadata landing cards.
- Create/import/refresh actions should be toolbar or inline commands, not dominant cards.

### Inspector / Conversation

- Right pane should be mode-based: Copilot, Metadata, Versions, Attachments, Activity later.
- Task 18.3 must support at least Copilot as the active inspector mode.
- The copilot must be conversation-first: header/session controls, context chips, message stream, sticky composer.
- Provider/model/context editing belongs in compact header controls, popovers, or drawers; not above the message stream as primary content.

### Status / Jobs

- Save, draft, formal revision, conflict, archived/read-only, attachment upload, AI key state, and privacy cues belong in compact status strips.
- Future AI/background jobs should use peripheral toasts or status rows, not blocking full-page cards.

## Explicit Non-Goals

Do not implement in Task 18.3:

- Full Notebook, Search, or Library product surfaces.
- Backend APIs, Prisma schema, shared transport contracts, AI execution changes, or storage changes.
- Dock managers, plugin frameworks, command palettes, broad tab frameworks, or general design-system expansion.
- AI Apply/Insert/Rewrite/Replace/Merge writeback.
- Hidden AI access to all Notebook, Project Docs, Library, or corpus data.
- Browser-owned authoritative recents, permissions, project lists, documents, AI sessions, or attachments.

## Acceptance Signals

Task 18.3 is successful if the user first sees a workbench, not a dashboard:

- The left side looks like app chrome and context navigation, not a button stack.
- The center looks like a working artifact, not a sequence of panels.
- The right side looks like a conversation/inspector, not a settings form.
- Status and governance are visible but quiet.
- Existing server-first behavior and safety tests still pass.
