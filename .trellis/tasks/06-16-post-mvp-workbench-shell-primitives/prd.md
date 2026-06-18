# Refactor workbench shell and UI primitives

## Goal

Refactor the MVP web UI foundation into a compact, server-first research workbench shell before adding full new product surfaces. The task should replace the current card-heavy, per-page inline UI structure with a small set of reusable workbench primitives that preserve existing authenticated project, document, attachment, AI provider, AI usage, and document-copilot behavior.

This is the first post-MVP manual QA task pinned in `doc/MVP_implement.md`. It prepares Jixia for `Home`, external `Search`, `Library`, `Projects`, `Notebook`, clickable `AI`, and bottom-pinned `Setting`, but it must not pretend that Search/Library/Notebook are complete products before server-owned contracts exist.

## Requirements

- Define the top-level workbench spine as `Home`, `Search`, `Library`, `Projects`, `Notebook`, `AI`, and bottom-pinned `Setting`.
- Keep `Projects` as the first fully working object-heavy surface during this refactor.
- Move AI provider configuration semantics toward global `Setting`; `AI` remains clickable but should render a purposeful not-open-yet state that points users to embedded copilots.
- Introduce only primitives demanded by current code: `WorkbenchSurface`, `SurfaceHeader`, `Toolbar`, `Pane`, `Panel`, `SplitPane`, `ListRow`, `MetaGrid`, `Field`, `Button`, `Pill`, `Notice`, `EmptyState`, and `StatusStrip`.
- Prefer named shell regions over a plugin workbench: left rail/sidebar, top work-surface indicator or toolbar, main work area, optional right inspector/copilot pane, and optional status strip.
- Use compact rows, panes, toolbars, inspectors, and split layouts as the default for object-heavy work; avoid expanding the current card dashboard metaphor.
- Preserve server-first boundaries: browser renders API responses, submits user intent through `/api`, relies on HttpOnly cookies, and never infers permissions locally.
- Preserve document editor behavior: draft autosave updates drafts only, formal save creates revisions only, conflict resolution stays explicit/manual, and archived documents remain read-only.
- Preserve AI safety behavior: provider keys are write-only, raw/encrypted secrets are never rendered, AI conversation output does not write into documents automatically, and AI context remains explicit.
- Preserve attachment safety behavior: browser requests upload intent through the API, uploads only to server-issued transient URLs, and resolves attachments through private download APIs.
- Keep the primitive layer thin. Do not add extension hosts, command registries, arbitrary dock managers, drag-to-reparent panels, multi-window layout restore, or speculative Notion block editor infrastructure in this task.

## Acceptance Criteria

- [ ] `AppShell` exposes the target navigation spine with `Setting` visually separated and pinned at the bottom.
- [ ] `AI` has a purposeful placeholder or not-yet-open state instead of routing users directly to provider settings.
- [ ] Existing project list, project detail, document list, document editor, AI settings, AI usage, AI conversation, and attachment UI are expressed through shared workbench primitives where practical.
- [ ] Object-heavy surfaces no longer rely on large nested card grids as the dominant structure.
- [ ] Existing server calls and payload behavior remain unchanged for projects, documents, drafts, revisions, attachments, AI provider configs, AI usage, and AI conversations.
- [ ] Existing tests for auth routing/session display, document editor autosave/revision/conflict behavior, and AI key secrecy still pass or are updated only for intentional markup/label changes.
- [ ] Narrow-screen behavior is intentionally handled: desktop split panes should degrade to stacked sections or sheet-style panels without breaking access to primary actions.
- [ ] New primitives are typed without `any`, `@ts-ignore`, or `@ts-expect-error` suppressions.
- [ ] Verification evidence includes focused web tests and a web build, or clearly documents any environment blocker.

## Technical Notes

Primary source of truth:

- `doc/MVP_implement.md` Task 18 is the implementation-plan anchor for this task.
- `.trellis/workspace/manual-qa-notes.md` records manual QA decisions behind the post-MVP sequence.
- `.trellis/spec/frontend/component-guidelines.md` controls the IDE-like, ResearchClaw-adjacent visual direction.
- `.trellis/spec/frontend/directory-structure.md`, `state-management.md`, `hook-guidelines.md`, `quality-guidelines.md`, and `type-safety.md` define frontend boundaries.
- `.trellis/spec/guides/pre-implementation.md`, `cross-layer.md`, and `code-reuse.md` control task discipline.

Known current implementation facts:

- `apps/web/src/app/App.tsx` owns the hand-rolled route model and shell mounting.
- `apps/web/src/features/layout/AppShell.tsx` currently exposes only the MVP temporary nav: Projects, disabled Documents, disabled Attachments, AI, disabled Audit/governance.
- `apps/web/src/lib/api.ts` is the browser API boundary and must keep `/api` prefixing and cookie credentials.
- `ProjectListPage`, `ProjectDetailPage`, `DocumentList`, `DocumentEditorPage`, `JixiaEditor`, `AttachmentBlock`, `AISettingsPage`, `AIUsagePage`, and `AIConversationPanel` repeat local inline style primitives and are the first refactor consumers.
- `DocumentEditorPage` is the highest-risk preservation surface because it owns load, draft autosave, formal revision save, conflict handling, read-only archived state, and embedded AI copilot layout.
- `AISettingsPage` is the highest-risk secret-safety surface because tests assert safe key previews and write-only replacement behavior.

Recommended implementation shape:

- Build a named-region shell, not a plugin/docking framework.
- Centralize only local UI state such as open/collapsed panels, panel width, active shell surface, and responsive panel mode.
- Persist only harmless layout preferences if persistence is added; workspace data, permissions, literature assets, jobs, documents, and AI decisions remain server-owned.
- Favor thin wrappers around existing React elements first. Add third-party primitive libraries only if the repository already has dependency appetite and the implementation can justify the extra dependency.

Suggested verification:

- `pnpm --filter @jixia/web test`
- `pnpm --filter @jixia/web build`
- If shell labels or editor affordances change substantially, run relevant E2E smoke coverage such as `pnpm --filter @jixia/web e2e` when local browser dependencies are available.
