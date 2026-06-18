# Manual QA Notes

This file records user-observed product gaps from local manual MVP smoke testing.

## 2026-06-16 Feedback 1: Left Navigation Information Architecture

User observation: the left navigation should be organized as the primary product spine with these entries, in order:

1. Home
2. Search
3. Library
4. Project
5. Notebook
6. AI
7. Setting

`Setting` should be pinned to the bottom-left corner rather than grouped with the main navigation entries.

Current understanding after checking `doc/Design.md`:

- This is a product/UI information-architecture issue, not merely a label rename.
- The intended navigation model separates core work areas from global settings.
- `Home` is confirmed as the post-login daily cockpit / default first work surface.
- `Search` is confirmed as external discovery only, not internal/global object search. Internal search should be a separate global search / command entry.
- `Library` is confirmed as the user's personal literature asset repository.
- `Project` maps to the project list / formal team collaboration unit; `doc/Design.md` calls the top-level entry `Projects`, while the user requested singular `Project`.
- `Notebook` is confirmed as personal research thinking/synthesis space, distinct from shared `Project Docs`.
- `AI` maps to `AI Workspace`: a top-level but secondary long-context work surface; embedded AI should also exist inside other work surfaces.
- `Setting` is not listed as a target-state top-level work surface in `doc/Design.md`, but Space/governance/system settings are explicitly mentioned as weak foreground governance areas, so pinning `Setting` bottom-left matches the design principle of not making Space a daily work surface.

Remaining clarification needed:

1. Should the sidebar label be exactly singular `Project`, as you wrote, or should it follow `doc/Design.md` and use plural `Projects`?
2. Should the global search / command entry be visually represented by the `Search` sidebar item, or should `Search` remain external-discovery only and global command search be a separate top-bar shortcut/search box?
3. Should AI provider/key configuration live under bottom-left `Setting`, while top-level `AI` only opens AI Workspace/conversations?
4. Should `Setting` include only user/space/system settings, or also project-specific settings when the user is inside a project?

User decisions captured on 2026-06-16:

- Use `Projects` as the sidebar label, matching `doc/Design.md`, not singular `Project`.
- `Search` must strictly follow `doc/Design.md`: external literature / DOI / URL discovery only.
- `Library` needs an internal local search for the user's stored literature/assets.
- AI provider key/config belongs under bottom-left `Setting`, not under the top-level AI workspace.
- `AI Workspace` should currently render a blank / not-yet-open surface; prioritize embedded AI copilot inside existing work surfaces first.
- `Setting` should refer to the ResearchClaw-style settings surface as a product reference.

Remaining clarification needed after user decisions:

1. Confirm whether `AI Workspace` blank state should be visible/clickable with a “not open yet” message, or hidden/disabled until later.
2. Clarify which `Setting` sections from ResearchClaw should be ported/adapted first for Jixia.
3. Clarify what should count as project-internal settings in Jixia, if any, versus global settings.

Next step: use codebase and ResearchClaw search results to explain “project-internal settings” and ask only the remaining product questions.


Codebase and ResearchClaw findings captured on 2026-06-16:

- Current Jixia sidebar is still MVP-temporary: `apps/web/src/features/layout/AppShell.tsx` hard-codes `Projects`, disabled `Documents`, disabled `Attachments`, enabled `AI`, and disabled `Audit & governance`.
- Current Jixia route model is manual in `apps/web/src/app/App.tsx`; `/workspace` maps to Projects, `/ai` and `/ai/settings` currently map to `AISettingsPage`, and there are no dedicated Home/Search/Library/Notebook/Setting route variants yet.
- Current Jixia `AISettingsPage` is semantically a settings surface but is currently mounted under AI. This should move under bottom-left Setting.
- Current Jixia document-scoped `AIConversationPanel` is already an embedded copilot candidate and aligns with the decision to prioritize copilot over top-level AI Workspace.
- Current Jixia backend already has project member-management APIs under `/projects/:projectId/members`; this is the strongest existing candidate for project-internal settings.
- Current Jixia shared contracts distinguish `notebook` and `project` documents, but the web app does not yet expose a top-level Notebook route/list.
- ResearchClaw reference: `src/renderer/components/app-shell.tsx` pins Settings at the sidebar bottom with `mt-auto`, visually separated from primary navigation.
- ResearchClaw reference: `src/renderer/pages/settings/settings-nav.ts` defines settings as grouped sections (`General`, `Models`, `Agents`, `Storage`) with searchable metadata and pure nav helpers.
- ResearchClaw reference: `src/renderer/pages/settings/page.tsx` implements settings-page search, grouped left nav, single active section mode, and multi-section search-results mode.

Working definition of project-internal settings:

Project-internal settings are settings that only make sense inside one specific project and should therefore live inside that project's page, not in global bottom-left Setting. For Jixia, likely candidates are project members/roles, project metadata such as name/description, project-scoped resources/assets, project discussion/activity visibility, archive/delete project actions, and later project-specific templates or workflows. These should remain server-authorized and project-scoped.

Likely global Setting sections for Jixia, adapted from ResearchClaw and Jixia's server-first model:

- Account/Profile: current user display name, email visibility, session/logout controls.
- Space/Governance: space members, invitations, roles, audit entry points, only where server authorizes the user.
- AI Providers: personal provider configs/API keys, default model, usage summary links.
- Preferences: language/theme/editor-like preferences if added later.
- Data/Storage/Integrations: only if Jixia gains user-visible storage/import/provider integrations beyond server-owned storage.

Remaining clarification needed now:

1. Should top-level `AI` be clickable and show a blank/not-open-yet placeholder, or disabled in the sidebar until AI Workspace is opened?
2. For first implementation, should bottom-left `Setting` include only `AI Providers` plus `Account/Profile`, or also include `Space/Governance` now?
3. Should project-internal settings for MVP refinement mean only `Members & roles`, or should it also include project rename/archive/delete controls?

Additional ResearchClaw comparison captured after background exploration:

- ResearchClaw uses one global `/settings` route with internal grouped navigation/search rather than many nested settings routes.
- ResearchClaw's settings groups are `General`, `Models`, `Agents`, and `Storage`; for Jixia this maps best to `Account/Profile`, `AI Providers`, optional `Space/Governance`, and later `Data/Storage/Integrations`.
- ResearchClaw keeps bottom-left Settings visually separate from primary work navigation using a bottom-pinned sidebar section; this supports the Jixia decision to keep Settings out of the main Home/Search/Library/Projects/Notebook/AI spine.
- ResearchClaw model/provider list views expose configured-key state (`hasApiKey`) rather than raw secrets. Jixia must keep the stronger server-first version of this pattern: browser never receives encrypted secret blobs or provider keys; it should only see safe key status and use explicit server APIs for create/update/test.
- ResearchClaw does not appear to have a separate project-settings route. Project-local configuration is edited inside the project detail surface. For Jixia, this supports keeping project-internal settings under each project rather than in global Settings.
- For Jixia, global Settings should not become a catch-all for project content. Project settings should remain scoped to one project and guarded by server-side project roles.

User decisions captured after final IA clarification:

- Top-level `AI` should remain clickable, but currently render a blank / "not open yet" placeholder page.
- First implementation of bottom-left `Setting` should include only `Account/Profile` and `AI Provider` sections.
- Project-internal project actions should follow office-product logic through a right-click / overflow context menu on project entries, containing `Rename`, `Archive`, and `Delete project` actions.
- `Members & roles` should not be forced into global Settings. It needs a mature office-product presentation pattern to be decided before implementation.

Recommended semantics for project actions:

- `Archive project` should be a reversible soft-hide / close action. It removes the project from the active Projects list, prevents normal editing by default, keeps documents/attachments/audit history intact, and can be restored by an authorized owner/admin.
- `Delete project` should be a destructive removal request. It should require stronger confirmation, owner authorization, and ideally a grace period or server-side tombstone before irreversible purge. It should not be the casual way to clean up old work.
- Context menu actions on a project entry should include `Rename`, `Archive`, and `Delete project`; destructive actions should be separated visually and require confirmation.

Recommended mature office-product pattern for `Members & roles`:

- Do not place `Members & roles` directly in the right-click project action menu as the primary management surface.
- Provide a visible `Share` / `Manage access` entry from the project header or project overview, with an optional context-menu shortcut named `Manage members`.
- Open `Members & roles` as a project-scoped modal/drawer/page showing current members, pending invites, roles, and owner continuity rules.
- Use per-row role selectors (`Owner`, `Editor`, `Viewer`) with disabled states when the current user lacks authority or when changing the last owner would violate continuity.
- Show inherited/global context separately from project membership: Space/global settings can manage users and invitations, but project membership controls who can access that specific project content.
- Keep all permission changes server-authorized and audited; frontend should present controls but not decide authorization.

Product review principle added by user:

- User decisions in manual QA are directional, not automatically final UI specs.
- For each product gap, recommendations should be checked against mature office/research collaboration product UI logic.
- The assistant should proactively point out when the user's proposed interaction is likely weaker than a mature-product pattern, explain the tradeoff, and recommend the better product shape before implementation.
- Implementation should proceed from the recommended product shape after confirmation, not from literal transcription of first-pass feedback.

Mature office-product recommendation for the same IA decisions:

- Do not implement top-level AI as a literally blank page. If kept clickable for discoverability, it should render a purposeful coming-soon / not-yet-open empty state that explains AI Workspace is not available yet and points users to embedded document copilot where available. If the product wants to avoid dead surfaces, keep AI disabled with a tooltip until the workspace is ready.
- First Settings implementation should expose only sections with real functionality. `Account/Profile` and `AI Providers` are appropriate first sections; defer empty `Space/Governance` until useful admin/member/audit flows are available.
- Right-click project menus are useful as accelerators, but mature office products do not make them the only path for important project management. Project cards/rows should also expose a visible overflow `...` menu for discoverability.
- Rename/archive/delete fit a project overflow/context menu. Archive should be reversible and low-risk; delete should be separated as destructive, require strong confirmation, and preferably route through server-side tombstone/retention before purge.
- `Members & roles` should use a visible `Share` / `Manage access` entry on project detail, plus optional overflow/context-menu shortcut. It should open a project-scoped modal/drawer with invites, members, role selectors, pending invites, and owner-continuity protections.
- Recommended label: use `Share` for the primary project-detail button if collaboration is central; use `Manage access` inside the modal/title for precision. `Members` is clearer for admin-heavy pages but weaker as the main collaboration affordance.

Implementation directive for Feedback 1:

- Future implementation of the left navigation / settings / project actions should follow the mature office-product recommendation above, not the literal first-pass user wording when the two differ.
- Sidebar should expose `Home`, external `Search`, `Library`, `Projects`, `Notebook`, clickable `AI` with a purposeful not-open-yet empty state, and bottom-pinned `Setting`.
- First `Setting` implementation should contain `Account/Profile` and `AI Providers` only.
- Project cards/rows should expose both right-click context menu and visible overflow menu for `Rename`, `Archive`, and `Delete project`.
- Project collaboration permissions should use a visible `Share` button on project detail that opens a `Manage access` modal/drawer; overflow/context menu may include `Manage members` only as a shortcut.

## 2026-06-16 Feedback 2: UI Has Too Many Cards

User observation: Jixia's UI currently uses too many card-like containers. The design should be re-evaluated against ResearchClaw and mature office-product / IDE UI patterns to understand how to design a research workbench.

Initial understanding:

- This is a product/workbench interaction-design issue, not a simple styling complaint.
- The likely problem is excessive card nesting, low information density, fragmented visual hierarchy, and lack of mature workbench structure.
- Analysis should compare current Jixia UI surfaces with ResearchClaw and mature office/IDE workbench patterns before implementation.
- No code changes should start until the workbench design direction is synthesized and confirmed.

Research workbench diagnosis captured after comparing Jixia, ResearchClaw, and mature office / IDE patterns:

- The issue is architectural: cards are currently being used as both navigation and content containers, which makes the product feel like a SaaS dashboard instead of a serious research workbench.
- Object collections should default to dense rows, tables, trees, tabs, split panes, and inspectors rather than card grids.
- Mature research/office products optimize for comparison, filtering, inspection, editing, review, provenance, and collaboration; those workflows require stable workbench structure and high information density.
- Cards should remain available only for a few specific jobs: onboarding, empty states, templates, small summary snapshots, visual/gallery artifacts, and short recommendation groups.

Recommended Jixia workbench architecture:

- Use a persistent app shell with stable orientation: top command/breadcrumb bar, primary left navigation, contextual sidebar, main work surface, optional right inspector, and optional bottom jobs/audit panel.
- Keep the left navigation as the product spine from Feedback 1, but make it visually compact and workbench-like rather than large card-like navigation blocks.
- Use contextual sidebars inside each product mode: Library collections, Project tree/views, Notebook outline, Search facets, Settings sections.
- Use a right inspector pattern for selected-object details: metadata, abstract, attachments, comments, citations, permissions, versions, AI provenance, audit history, and role controls.
- Use tabs or split panes for multi-object work, especially document editing, search-result preview, paper-to-note workflows, and AI-assisted writing.
- Use a bottom status/jobs area when needed for imports, attachment processing, AI runs, sync/save state, validation errors, and audit events.

Surface-specific design direction:

- `Home`: can keep a small number of cards for daily cockpit summaries, recent work, and suggested next actions. It should not establish cards as the default object-list pattern.
- `Search`: external literature / DOI / URL discovery should use faceted search, result rows, rich snippets, preview/metadata pane, and quick actions such as import, cite, save, or ask AI. Search results should not be card galleries.
- `Library`: should become Zotero-like: collection tree on the left, citation table/list in the center, and metadata/abstract/attachments/notes/provenance inspector on the right. Library-local search belongs here.
- `Projects`: should use compact project rows or table/list views with a project detail workbench. Project detail should expose tabs/sections such as activity, assets, reading, writing, AI jobs, members, and settings/actions, not nested project cards.
- `Notebook`: should use notebook list/outline plus a document-like writing canvas and right-side sources/provenance/comments panel. Cards are acceptable only for embedded artifacts, not for every note/block.
- `Document editor`: should become editor-first: outline/file tree left, manuscript canvas center, comments/citations/suggestions/version/provenance right, and compact save/status controls. Editor blocks should feel like an editable canvas, not separate bordered cards.
- `AI Copilot`: should be contextual and governed, attached to the active document/paper/project/search selection. Long-running AI work should appear in auditable job queues with inputs, outputs, approvals, failures, and source provenance.
- `Setting`: should follow a boring, mature settings pattern: left settings nav, main compact forms/tables, provider-key status without raw secrets, and clear danger zones. Settings should not be card-grid navigation.

Visual language recommendation:

- Adopt scholarly workbench minimalism: precise, quiet, dense, archival, and instrument-like.
- Prefer thin separators, aligned rows, compact toolbars, tables, and panes over large rounded containers.
- Keep typography, spacing, and state badges strong enough for scanning titles, authors, dates, owners, roles, source types, visibility, AI provenance, review status, and version state.
- Consider future density controls such as comfortable / compact, but first establish a compact default that feels professional.

Implementation directive for Feedback 2:

- Future redesign should not merely remove card borders or reduce border radius. It should introduce a reusable workbench layout system and move object-heavy surfaces from card grids to rows/tables/trees/inspectors.
- Prioritize the shell and reusable layout primitives before polishing individual pages: app shell, contextual sidebar, main surface, inspector panel, toolbar/header, table/list rows, split pane, and bottom status/jobs area.
- Convert high-impact surfaces first: `Library`, `Search`, `Projects`, and `Document editor`; keep `Home` as the only card-tolerant daily summary surface.
- Preserve server-first governance in the UI: permissions, AI provider state, AI job provenance, storage references, and audit events should be visible through inspectors/tables/status surfaces, not hidden behind decorative cards.
- Recommended first design milestone: define the target workbench shell and density rules, then refactor one representative object surface such as `Library` or `Projects` as the pattern sample before applying it everywhere.

Remaining clarification needed before implementation:

1. Should the first UI-redesign implementation start from the reusable shell/layout primitives, or from one representative page such as `Projects` / `Library` to prove the pattern?
2. Which surface is the highest priority for manual QA pain right now: `Projects`, `Library`, `Document editor`, or `Search`?
3. Should Jixia visually stay closer to ResearchClaw's compact desktop-workbench feel, or should it be slightly more web-office-like with more spacing while still avoiding card grids?

User decisions captured after Feedback 2 synthesis:

- First implementation should start from common workbench shell / layout primitives, then refine individual pages one by one.
- Visual direction should be closer to ResearchClaw's compact desktop-workbench feel rather than a spacious web-card dashboard.
- Current highest manual-QA pain point is `Document editor`.
- The current document editor does not meet the desired Notion-like document editor experience; future redesign should prioritize document-editor architecture after the shared workbench primitives are established.

Document editor implementation implication:

- The first redesign cycle should define common workbench primitives, then apply them immediately to `Document editor` as the proof surface.
- `Document editor` should become an editor-first, Notion-like writing surface: block-based editing, lightweight block controls, slash/insert affordances where appropriate, inline formatting, source/citation grounding, comments/provenance inspector, and contextual AI copilot.
- Avoid treating editor blocks as separate heavy cards. The writing canvas should feel continuous, with structure and tools appearing contextually.
