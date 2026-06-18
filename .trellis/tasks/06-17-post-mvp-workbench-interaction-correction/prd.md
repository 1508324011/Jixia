# Workbench interaction correction

## Goal

Correct the Task 18 workbench foundation so Jixia feels like a compact, mature research workbench instead of a stack of rectangular buttons and boxed forms.

Task 18 successfully introduced a shared primitive layer and the target product spine, but manual QA and ResearchClaw comparison show that the interaction model is still wrong: the shell navigation is still a set of full-width CTA-like buttons, object surfaces still read as nested boxes, the document editor still feels like a block-record form, and the right AI copilot is not a real conversation surface.

Task 18.2 is a frontend correction task. It must reshape the UI structure while preserving all server-first MVP behavior: API-authorized data, HttpOnly session usage, document draft/revision separation, explicit conflict handling, archived read-only state, AI no-writeback, AI key secrecy, transient attachment URLs, and audit/governance visibility.

## Requirements

- Replace the stacked-button shell feel with a compact workbench navigation model inspired by ResearchClaw and mature tools:
  - primary navigation as dense icon/text rows or rail entries, not descriptive card buttons;
  - no per-nav long descriptions in the sidebar;
  - subtle active indicator instead of bordered CTA-card selection;
  - bottom-pinned `Setting` remains separated;
  - include a compact current-user/session affordance without turning it into another card.
- Introduce a real workbench layout hierarchy instead of generic boxed stacks:
  - global shell / left navigation / optional explorer / main artifact surface / right inspector or copilot / status strip;
  - reserve strong borders/background boxes for true pane boundaries, not every row, toolbar, and message;
  - reduce default padding/gap density so object-heavy surfaces scan like tools, not dashboards.
- Rework project and document object surfaces toward compact records and explorer-like structures:
  - avoid duplicate “row is clickable + Open button” patterns unless needed for accessibility;
  - prefer compact rows/tables/lists with metadata columns, inline status, and overflow/action affordances;
  - preserve existing project/document API calls and permissions.
- Redesign the right AI copilot as a true conversation surface, not a nested provider/context/form panel:
  - durable conversation/session list or compact history affordance;
  - visible message thread with user/assistant turns, assistant/user alignment, timestamps or metadata where useful;
  - bottom-anchored multiline composer as the primary interaction;
  - context chips for current document and explicit supplemental context;
  - provider/model state visible but secondary, not the first panel users must fill in;
  - loading, sending, stop/disabled, error, retry, and empty states;
  - no automatic document mutation or hidden context expansion.
- Move explicit context editing into progressive disclosure:
  - current document context should be obvious by default;
  - supplemental context can be added through compact controls/chips/drawer, not a large always-visible form grid;
  - preserve the existing explicit-context payload semantics unless a separate backend contract task is created.
- Start converting the document editor from block-record management toward a writing canvas:
  - reduce the “Document blocks” panel feel;
  - remove or de-emphasize always-visible top-level block-type button rows;
  - make block controls lightweight, contextual, or hover/inline-oriented where practical;
  - keep the actual editor data model and draft/revision API behavior unchanged in this task.
- Add or refine persistent status/governance cues:
  - draft autosave state, formal revision state, conflict state, archived read-only state, AI suggestion-only state, explicit-context state, and provider/key safety should remain visible without becoming large cards.
- Keep the scope intentionally smaller than a new product surface:
  - do not implement full `Notebook`, `Search`, or `Library` here;
  - do not add plugin systems, arbitrary dock managers, command registries, or new backend contracts unless strictly necessary to preserve current behavior;
  - do not weaken server-first authorization or move data ownership into the browser.

## Acceptance Criteria

- [ ] Sidebar navigation no longer appears as stacked rectangular descriptive buttons; it uses compact workbench-style row/rail navigation with a subtle active state.
- [ ] `Setting` remains bottom-pinned and visually separated from daily work surfaces.
- [ ] Main work surfaces reduce boxed/card repetition by using compact records, pane boundaries, metadata rows, and toolbar/action affordances.
- [ ] Project/document lists avoid unnecessary duplicate CTA buttons and read as object browsers rather than card grids.
- [ ] The document editor no longer presents every block as a heavy standalone card by default; writing content receives visual priority.
- [ ] The AI copilot right pane behaves like a conversation: thread/history affordance, message stream, bottom composer, context chips, and clear send/loading/error states.
- [ ] Provider/model configuration and explicit-context editing remain accessible but secondary to the conversation flow.
- [ ] AI output remains suggestion-only and cannot write into documents automatically.
- [ ] Existing document load, draft autosave, revision save, conflict handling, archived read-only behavior, attachment upload/download intent, AI provider key secrecy, AI usage/config calls, and AI conversation API calls remain functionally intact.
- [ ] Tests are updated only for intentional UI label/structure changes, not for weakened behavior.
- [ ] Verification evidence includes focused web tests and web build, or clear blocker notes if local environment cannot run them.

## Technical Notes

Primary source of truth:

- `doc/MVP_implement.md` post-MVP Task 18-19 sequence explains why UI/workbench primitives and document editor correction precede new product surfaces.
- `.trellis/workspace/manual-qa-notes.md` records the manual QA finding that Jixia still feels too card-heavy and that Document editor is the highest-priority pain point.
- `.trellis/tasks/06-16-post-mvp-workbench-shell-primitives/prd.md` is the predecessor task. Task 18.2 intentionally corrects the interaction layer that Task 18 did not finish.
- `.trellis/spec/frontend/component-guidelines.md` requires an IDE-like, ResearchClaw-adjacent workbench rather than generic SaaS dashboard/card UI.

Current Jixia evidence:

- `apps/web/src/features/layout/AppShell.tsx` currently renders nav entries as buttons with labels and descriptions, creating the stacked-button feel.
- `apps/web/src/features/layout/workbench.css` centralizes many bordered boxes (`Pane`, `Panel`, `ListRow`, `Toolbar`, nav buttons), which reduces style duplication but keeps the old rectangle-stack rhythm.
- `apps/web/src/features/ai/AIConversationPanel.tsx` currently nests provider config, context scope, private conversations, messages, and prompt form as separate panels. This is not a mature chat/copilot surface.
- `apps/web/src/features/documents/editor/JixiaEditor.tsx` still presents a `Document blocks` panel, top-level add-block toolbar, and per-block panels/select/remove controls.
- `apps/web/src/features/documents/DocumentEditorPage.tsx` owns high-risk behavior that must be preserved: document load, draft autosave, formal revision save, conflict state, archived read-only state, and embedded AI copilot placement.
- `apps/web/src/features/ai/AISettingsPage.tsx` remains the high-risk secret-safety surface for provider key previews and write-only replacement behavior.

ResearchClaw/mature implementation references to follow:

- ResearchClaw uses compact sidebar rows, active indicators, recents, bottom settings, route-aware layout, and persistent job/status toasts instead of descriptive nav cards.
- ResearchClaw chat uses a real drawer/session model: session history, message thread, context chips, bottom composer, streaming state, stop/send controls, and permission/error states.
- Mature workbenches such as VS Code/Cursor use stable named regions and compact view containers; Zotero uses collection/item/detail panes; Notion prioritizes a writing canvas with hover/inline controls; Slack/ChatGPT/Claude/Cursor use durable conversation threads with a bottom composer and explicit context.

Implementation guidance:

- Fix the data/interaction structure first. CSS-only polish is not enough.
- Prefer deleting special-case visual boxes over adding more variants.
- Keep current APIs and payloads stable unless a separate backend task is created.
- Avoid broad dependency additions unless they eliminate more code than they add and do not introduce framework gravity.

Suggested verification:

- `pnpm --filter @jixia/web test`
- `pnpm --filter @jixia/web build`
- If document editor or major route labels change, run the relevant E2E smoke spec when browser dependencies are available.
