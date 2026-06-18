# Workbench anatomy and conversation surface

## Goal

Turn the post-Task-18.2 Jixia frontend from a thin-rectangle UI into a mature research workbench anatomy.

Manual QA remains correct: Task 18 introduced primitives and Task 18.2 reduced some card chrome, but the dominant structure still feels like stacked rectangular controls. The right AI copilot still behaves like a provider/context/settings form with a transcript embedded inside it, not a first-class conversation surface.

Task 18.3 must fix the data and region structure before any new product surface work. The target anatomy is:

```text
AppShell
├─ ActivityRail          # top-level product spine
├─ ContextSidebar        # surface-specific recents/tree/filters/status
└─ Workspace
   ├─ SurfaceHeader / Toolbar / StatusStrip
   └─ MainSplit
      ├─ ArtifactCanvas  # document/editor/object work surface
      └─ Inspector       # Copilot / Metadata / Versions / Attachments
```

This is a frontend-only correction task. It must preserve server-first MVP behavior: API-authorized data, HttpOnly session usage, document draft/revision separation, human conflict handling, archived read-only state, AI no-writeback, AI key secrecy, transient attachment URLs, and audit/governance visibility.

## Requirements

- Replace the current one-layer shell with a real workbench anatomy:
  - introduce `ActivityRail` for `Home`, `Search`, `Library`, `Projects`, `Notebook`, `AI`, and bottom-pinned `Setting`;
  - introduce `ContextSidebar` for surface-specific recents, project/document tree affordances, filters, draft/conflict counts, or placeholder states;
  - keep the primary rail compact, icon-first or short-label, and free of route descriptions;
  - keep local storage limited to harmless UI preferences such as collapsed/expanded rail state, never authoritative data.
- Rework workspace chrome so regions do not stack as repeated rectangles:
  - avoid duplicated global topbar plus page header plus toolbar where one region can carry the information;
  - reserve strong borders/backgrounds for actual pane boundaries;
  - make ordinary rows, buttons, pills, and notices quieter by default;
  - retain concise status cues for session, draft state, formal revision state, read-only/archive, explicit AI context, and provider/key safety.
- Convert the document editor proof surface into an artifact-first workbench:
  - the writing canvas must visually dominate;
  - normal text blocks should not look like form fields by default;
  - block controls should be contextual, hover/focus/selection-oriented, or grouped under compact insert controls;
  - attachment placeholders should behave as inline editor artifacts, not nested panels;
  - preserve the current document snapshot/block data model and document APIs.
- Rebuild the right AI copilot as a real `ConversationSurface`:
  - persistent structure: header/session controls, compact context chips, scrollable message thread, sticky bottom composer;
  - user/assistant turns should be visually distinct and thread-first;
  - provider/model state must be visible but secondary to the conversation;
  - conversation/session history should be available through a drawer/menu/rail that does not squeeze the current thread inside the narrow right pane;
  - explicit supplemental context editing should be progressive disclosure, not an always-visible form before the transcript;
  - remove fake controls such as disabled `Stop` unless a real cancellation path exists;
  - keep AI output suggestion-only with no apply/insert/rewrite/automerge action.
- Introduce a right-side `Inspector` concept without overbuilding:
  - support at least `Copilot` as the active inspector mode for this task;
  - leave space for later `Metadata`, `Versions`, and `Attachments` tabs without implementing new backend behavior;
  - do not add a dock manager, plugin system, arbitrary tab framework, command palette, or new backend contract.
- Keep object-heavy surfaces compact:
  - project and document lists should remain row/table/explorer-like;
  - creation actions should be compact command rows, drawers, or inline affordances rather than dominant card forms where practical;
  - avoid duplicate “row click + Open button” CTAs unless accessibility requires them.
- Keep product scope narrow:
  - do not implement full `Notebook`, `Search`, or `Library`;
  - do not change database schema, API payload contracts, shared document contracts, AI provider storage, or attachment storage;
  - do not weaken permission, audit, key, attachment, or AI context boundaries.

## Acceptance Criteria

- [ ] `AppShell` exposes a clear workbench anatomy with `ActivityRail`, `ContextSidebar`, and `Workspace` regions instead of a single sidebar plus page stack.
- [ ] `Setting` remains bottom-pinned and separated from daily work surfaces.
- [ ] Top-level navigation no longer reads as stacked equal-weight rectangular buttons.
- [ ] Surface-specific context appears in `ContextSidebar` or equivalent compact region, not as oversized page cards.
- [ ] Workspace header/toolbar/status chrome is not duplicated across shell and page layers.
- [ ] Primitive defaults reduce boxed/card rhythm: ordinary buttons, rows, pills, notices, and fields do not all draw heavy rectangles.
- [ ] Document editor reads as a writing canvas first; block data controls are contextual/secondary.
- [ ] Right AI copilot reads as a conversation: message thread and bottom composer are primary, context chips are visible, provider/model state is secondary, and history does not crowd the current thread.
- [ ] AI copilot exposes no automatic writeback, apply, insert, rewrite, or conflict-resolution action.
- [ ] Existing document load, draft autosave, formal revision save, 409 human conflict handling, archived read-only behavior, attachment upload/download intent, AI provider key secrecy, AI usage/config calls, and AI conversation API calls remain intact.
- [ ] Tests are updated only for intentional interaction/label changes and continue to assert behavior/safety invariants.
- [ ] Verification evidence includes focused web tests and web build; run E2E smoke where route labels, editor affordances, or attachment selectors change.

## Technical Notes

Primary references:

- `doc/MVP_implement.md` records the post-MVP sequence and says UI/workbench primitives and document-editor correction must precede full new surfaces.
- `.trellis/workspace/manual-qa-notes.md` records repeated manual QA feedback: Jixia still feels card/rectangle-heavy, and the document editor plus right AI copilot are the proof surfaces.
- `.trellis/tasks/06-16-post-mvp-workbench-shell-primitives/prd.md` is Task 18, which introduced the target spine and primitive layer.
- `.trellis/tasks/06-17-post-mvp-workbench-interaction-correction/prd.md` is Task 18.2, which corrected some interaction chrome but did not fully establish region anatomy.
- `.trellis/tasks/06-17-post-mvp-workbench-interaction-correction/info.md` and `mature-ui-research.md` contain the direct ResearchClaw/mature-product findings that motivate Task 18.3.

Current Jixia evidence to address:

- `apps/web/src/features/layout/AppShell.tsx`: the target spine exists, but the shell still needs `ActivityRail` + `ContextSidebar` anatomy.
- `apps/web/src/features/layout/workbench.css`: primitive defaults still make too many UI elements read as rectangles.
- `apps/web/src/features/documents/DocumentEditorPage.tsx`: owns the high-risk editor behavior and should become the proof workbench surface.
- `apps/web/src/features/documents/editor/JixiaEditor.tsx`: writing canvas exists, but block insertion/type/remove/textarea controls still dominate.
- `apps/web/src/features/ai/AIConversationPanel.tsx`: provider/context/history/forms still compete with the message thread and composer.
- `apps/web/src/features/attachments/AttachmentBlock.tsx`: attachment UI should stay safe while becoming an inline editor artifact.

ResearchClaw and mature-product references:

- `/home/zhurui/github_project/ResearchClaw/src/renderer/components/app-shell.tsx`: compact sidebar rows, subtle active indicator, recents, bottom settings, and job/status toasts.
- `/home/zhurui/github_project/ResearchClaw/src/renderer/components/chat/UnifiedChatModal.tsx`: session sidebar, message thread, bottom composer, context chips, streaming and permission states.
- `/home/zhurui/github_project/ResearchClaw/src/renderer/pages/papers/reader/page.tsx`: split reader/chat pane model and composer next to an artifact.
- Mature VS Code/Zotero/Notion/Slack/GitHub/Linear patterns converge on stable named regions, dense object browsers, artifact-first canvases, contextual inspectors, and durable conversation threads.

Implementation guidance:

- Fix the data/region structure first; CSS-only polish is not enough.
- Prefer deleting visual boxes and fake controls over adding more variants.
- Keep changes frontend-only unless a separate backend task is created.
- Keep local UI preference state non-authoritative.
- Avoid broad dependencies unless they remove more code than they add and do not introduce framework gravity.

Suggested verification:

- `pnpm --filter @jixia/web test`
- `pnpm --filter @jixia/web build`
- `pnpm --filter @jixia/web lint`
- If route labels, editor block controls, or attachment selectors change, run the relevant E2E smoke spec with alternate ports if the default e2e ports are occupied.
