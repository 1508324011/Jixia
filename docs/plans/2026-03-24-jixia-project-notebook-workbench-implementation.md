# Superseded: Jixia Project-Notebook Workbench Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

> **Superseded on 2026-03-25.** This document is preserved as historical context only.
>
> The implemented branch truth is now described by:
> - `docs/plans/2026-03-25-jixia-researchclaw-web-redesign-design.md`
> - `docs/plans/2026-03-25-jixia-researchclaw-web-redesign-implementation.md`
>
> Current architecture truth:
> - sidebar navigation is `Home / Projects / Search / Library / Notebooks / AI / Settings`
> - `Search` and `Library` are dense feeder surfaces
> - `Reader` is document-first and docks `AI Workspace` on the right by default
> - `Notebook` is a private document-first surface
> - `Project Docs` remain separate and project-owned

**Historical goal:** Reorganize the `demo-native-showcase` workbench around `Home → Projects → Search → Library → Notebooks` as an intermediate reset before the later 2026-03-25 redesign finalized the independent `AI Workspace`, document-first `Reader`, and private document-first `Notebook` model.

**Historical architecture:** Treat this document as the earlier IA-reset plan that preceded the current browser story. Some later tasks in this file are now intentionally outdated and should not be used as the current acceptance standard.

**Tech Stack:** React, React Router, TypeScript, Vite, Vitest, current `src/web` pages/components/styles, `src/web/lib/demo-api.ts`, `src/shared/contracts/*`, `src/server/http-api.ts`, `src/server/services/*`, and `docs/runbooks/native-demo-showcase.md`.

---

## Planning baseline

This plan intentionally **does not** use ResearchClaw as the product ceiling.

- Borrow from ResearchClaw: full-width workbench feel, compact navigation, clear route boundaries, split-pane reading/notes composition.
- Explicitly exceed ResearchClaw: notebooks must be first-class nav, projects must be directly discoverable, search must support richer metadata and pagination, and reader must be a companion surface rather than the whole center of gravity.
- Remove from current Jixia shell: redundant `Personal lane` duplication, placeholder `/projects` copy blocks, notebook-only-from-reader access, narrow `page-shell` workbench surfaces, and search/library surfaces that still read like separate static demos.

## Delivery order

1. Top-level IA and shell reset
2. `Home` and `Projects` as real work-resumption surfaces
3. First-class notebook routes and navigation
4. Search pagination + metadata density
5. Library width and inventory density
6. Reader as notebook/project companion surface
7. Docs + verification truthfulness pass

---

### Task 1: Reset the top-level workbench IA and remove redundant shell concepts

**Files:**
- Modify: `src/web/router.tsx`
- Modify: `src/web/components/sidebar-nav.tsx`
- Modify: `src/web/components/workbench-layout.tsx`
- Modify: `src/web/components/context-indicator.tsx`
- Modify: `src/web/components/recent-opened-panel.tsx`
- Modify: `src/web/styles/app.css`
- Test: `tests/ui/workbench-navigation.test.tsx`
- Test: `tests/ui/workbench-routing.test.tsx`
- Test: `tests/ui/research-workbench-shell.test.tsx`

**Step 1: Write the failing tests**

```tsx
it('renders Home, Projects, Search, Library, Notebooks, and Settings in the top-level workbench nav', () => {
  renderWorkbench('/home');

  expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Projects' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Search' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Library' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Notebooks' })).toBeInTheDocument();
});

it('does not render a redundant Personal lane panel in personal workbench routes', () => {
  renderWorkbench('/library');

  expect(screen.queryByText('PERSONAL LANE')).not.toBeInTheDocument();
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/ui/workbench-navigation.test.tsx tests/ui/workbench-routing.test.tsx tests/ui/research-workbench-shell.test.tsx`

Expected: FAIL because the current nav still exposes `今日推荐 / 搜索 / Library / Projects / 设置`, there is no `Notebooks` route, and the shell still renders a redundant personal context lane.

**Step 3: Write minimal implementation**

Implement the smallest IA reset that makes the shell truthful:

- make `/home` a first-class top-level route in the sidebar rather than a hidden redirect target
- promote `Projects`, `Search`, `Library`, `Notebooks`, and `Settings` into the canonical workbench nav
- add notebook routes to the router tree without creating a second parallel route hierarchy
- remove the `Personal lane` duplication and replace it with one lightweight current-context treatment only where it adds real state
- keep the right rail for contextual assistance, not for recovering missing primary navigation
- preserve current project-scoped routes under `/projects/:projectId/...`

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/ui/workbench-navigation.test.tsx tests/ui/workbench-routing.test.tsx tests/ui/research-workbench-shell.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add tests/ui/workbench-navigation.test.tsx tests/ui/workbench-routing.test.tsx tests/ui/research-workbench-shell.test.tsx src/web/router.tsx src/web/components/sidebar-nav.tsx src/web/components/workbench-layout.tsx src/web/components/context-indicator.tsx src/web/components/recent-opened-panel.tsx src/web/styles/app.css
git commit -m "refactor: reset workbench navigation around projects and notebooks"
```

---

### Task 2: Turn `Home` into a real project control desk and `/projects` into a real project list

**Files:**
- Create: `src/shared/contracts/workbench.ts`
- Modify: `src/server/demo/demo-fixture.ts`
- Modify: `src/server/http-api.ts`
- Modify: `src/web/lib/demo-api.ts`
- Modify: `src/web/pages/home-page.tsx`
- Modify: `src/web/pages/projects-page.tsx`
- Modify: `src/web/pages/project-page.tsx`
- Test: `tests/ui/home-page.test.tsx`
- Test: `tests/ui/workbench-navigation.test.tsx`
- Create: `tests/ui/projects-page.test.tsx`
- Test: `tests/integration/native-demo-http.test.ts`

**Step 1: Write the failing tests**

```tsx
it('renders recent projects and continue-working entries on Home', async () => {
  renderWorkbench('/home');

  expect(await screen.findByRole('heading', { name: /recent projects/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /open tumor board workspace/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /resume notebook/i })).toBeInTheDocument();
});

it('renders a real project inventory on /projects instead of placeholder copy panels', async () => {
  renderWorkbench('/projects');

  expect(await screen.findByRole('link', { name: /tumor board workspace/i })).toBeInTheDocument();
  expect(screen.getByText(/recent activity/i)).toBeInTheDocument();
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/ui/home-page.test.tsx tests/ui/projects-page.test.tsx tests/ui/workbench-navigation.test.tsx tests/integration/native-demo-http.test.ts`

Expected: FAIL because `/home` is still a static introduction page and `/projects` is still a placeholder shell.

**Step 3: Write minimal implementation**

Introduce one truthful server-backed workbench summary model:

- add a contract for home/project dashboard summaries
- extend demo fixture + HTTP API to expose recent projects, resume targets, active notebooks, and recently imported-but-unassigned papers
- redesign `HomePage` into a project control desk with resume-first cards and high-value shortcuts
- redesign `ProjectsPage` into a true project list with recent activity and direct links into project overview/library/docs
- keep `ProjectPage` as the detailed project workspace, but make it consistent with the new discovery flow

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/ui/home-page.test.tsx tests/ui/projects-page.test.tsx tests/ui/workbench-navigation.test.tsx tests/integration/native-demo-http.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add tests/ui/home-page.test.tsx tests/ui/projects-page.test.tsx tests/ui/workbench-navigation.test.tsx tests/integration/native-demo-http.test.ts src/shared/contracts/workbench.ts src/server/demo/demo-fixture.ts src/server/http-api.ts src/web/lib/demo-api.ts src/web/pages/home-page.tsx src/web/pages/projects-page.tsx src/web/pages/project-page.tsx
git commit -m "feat: turn home and projects into real work-resumption surfaces"
```

---

### Task 3: Promote notebooks to first-class routes and first-class navigation

**Files:**
- Create: `src/web/pages/notebooks-page.tsx`
- Modify: `src/web/router.tsx`
- Modify: `src/web/components/sidebar-nav.tsx`
- Modify: `src/web/pages/notes-page.tsx`
- Modify: `src/web/lib/demo-api.ts`
- Modify: `src/shared/contracts/notebook.ts`
- Modify: `src/server/services/notebook.service.ts`
- Modify: `src/server/http-api.ts`
- Test: `tests/ui/notes-workspace.test.tsx`
- Test: `tests/ui/workbench-navigation.test.tsx`
- Create: `tests/ui/notebooks-page.test.tsx`
- Test: `tests/integration/notebook-project-projection.test.ts`

**Step 1: Write the failing tests**

```tsx
it('lets the user open notebooks directly from the global nav', async () => {
  renderWorkbench('/home');

  await user.click(screen.getByRole('link', { name: 'Notebooks' }));
  expect(await screen.findByRole('heading', { name: /notebooks/i })).toBeInTheDocument();
});

it('renders notebook entries independently of entering from a reader route', async () => {
  renderWorkbench('/notebooks');

  expect(await screen.findByRole('link', { name: /tumor board synthesis notebook/i })).toBeInTheDocument();
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/ui/notebooks-page.test.tsx tests/ui/notes-workspace.test.tsx tests/ui/workbench-navigation.test.tsx tests/integration/notebook-project-projection.test.ts`

Expected: FAIL because notebooks are only accessible through `/library/:entryId/notes` and `/projects/:projectId/library/:entryId/notes` today.

**Step 3: Write minimal implementation**

Create a notebook-first access model without breaking current reading ownership rules:

- add a top-level `/notebooks` route and, if needed, `/notebooks/:notebookId`
- extend notebook contracts/services so notebook summaries can be listed independently of one reader entry
- keep notebook notes/project projection ownership truthful; do not flatten project-owned references back into personal notebook state
- use `NotesPage` as the starting point for notebook detail where that reduces duplication, but reshape it around notebook identity rather than reader-only entry identity
- ensure the notebook list can re-open related papers and project docs rather than trapping the user in reader-only navigation

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/ui/notebooks-page.test.tsx tests/ui/notes-workspace.test.tsx tests/ui/workbench-navigation.test.tsx tests/integration/notebook-project-projection.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add tests/ui/notebooks-page.test.tsx tests/ui/notes-workspace.test.tsx tests/ui/workbench-navigation.test.tsx tests/integration/notebook-project-projection.test.ts src/web/pages/notebooks-page.tsx src/web/router.tsx src/web/components/sidebar-nav.tsx src/web/pages/notes-page.tsx src/web/lib/demo-api.ts src/shared/contracts/notebook.ts src/server/services/notebook.service.ts src/server/http-api.ts
git commit -m "feat: make notebooks a first-class workbench destination"
```

---

### Task 4: Rebuild search into a dense paginated intake surface with richer metadata

**Files:**
- Modify: `src/shared/contracts/discovery.ts`
- Modify: `src/web/lib/demo-api.ts`
- Modify: `src/server/http-api.ts`
- Modify: `src/server/services/discovery.service.ts`
- Modify: `src/server/connectors/pubmed.connector.ts`
- Modify: `src/server/connectors/openalex.connector.ts`
- Modify: `src/server/connectors/arxiv.connector.ts`
- Modify: `src/server/connectors/biorxiv.connector.ts`
- Modify: `src/web/pages/search-page.tsx`
- Modify: `src/web/components/intake-source-board.tsx`
- Modify: `src/web/styles/app.css`
- Test: `tests/ui/search-intake-layout.test.tsx`
- Test: `tests/ui/native-demo-workflow.test.tsx`
- Test: `tests/integration/discovery-import-boundary.test.ts`
- Create: `tests/integration/discovery-pagination.test.ts`

**Step 1: Write the failing tests**

```tsx
it('renders pagination controls and result counts for search intake', async () => {
  renderWorkbench('/search');
  await runSearch('tumor board');

  expect(await screen.findByText(/showing 1-10 of/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /next page/i })).toBeInTheDocument();
});

it('surfaces richer metadata for each candidate without collapsing action density', async () => {
  renderWorkbench('/search');
  await runSearch('tumor board');

  expect(await screen.findByText(/canonical source/i)).toBeInTheDocument();
  expect(screen.getByText(/source label/i)).toBeInTheDocument();
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/ui/search-intake-layout.test.tsx tests/ui/native-demo-workflow.test.tsx tests/integration/discovery-import-boundary.test.ts tests/integration/discovery-pagination.test.ts`

Expected: FAIL because `DiscoverySearchResponse` still has no pagination model, the API only accepts `query`, and the UI still renders a non-paginated intake surface.

**Step 3: Write minimal implementation**

Upgrade discovery around truthful intake density:

- add pagination/request metadata (`page`, `pageSize`, `total`, `hasNextPage`) to the discovery contract
- thread those fields through the search API and demo API client
- redesign the search UI around stable rows/sections with visible counts, page controls, and richer per-item metadata
- avoid fake ranking signals; use fields that are real in the connectors or fixture data
- keep import actions fast and stable across pagination changes

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/ui/search-intake-layout.test.tsx tests/ui/native-demo-workflow.test.tsx tests/integration/discovery-import-boundary.test.ts tests/integration/discovery-pagination.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add tests/ui/search-intake-layout.test.tsx tests/ui/native-demo-workflow.test.tsx tests/integration/discovery-import-boundary.test.ts tests/integration/discovery-pagination.test.ts src/shared/contracts/discovery.ts src/web/lib/demo-api.ts src/server/http-api.ts src/server/services/discovery.service.ts src/server/connectors/pubmed.connector.ts src/server/connectors/openalex.connector.ts src/server/connectors/arxiv.connector.ts src/server/connectors/biorxiv.connector.ts src/web/pages/search-page.tsx src/web/components/intake-source-board.tsx src/web/styles/app.css
git commit -m "feat: add paginated high-density search intake"
```

---

### Task 5: Recast `Library` into a full-width inventory surface rather than a narrow desk

**Files:**
- Modify: `src/server/services/library.service.ts`
- Modify: `src/server/http-api.ts`
- Modify: `src/shared/contracts/library.ts`
- Modify: `src/web/pages/library-page.tsx`
- Modify: `src/web/components/library-filters.tsx`
- Modify: `src/web/styles/app.css`
- Test: `tests/ui/library-and-project-context.test.tsx`
- Create: `tests/ui/library-inventory-layout.test.tsx`
- Test: `tests/integration/library-import.test.ts`

**Step 1: Write the failing tests**

```tsx
it('renders the library as a full-width inventory surface with list density suited for desktop work', async () => {
  renderWorkbench('/library');

  expect(await screen.findByTestId('library-inventory-surface')).toHaveAttribute('data-layout-mode', 'inventory');
});

it('shows richer metadata for library entries to support filtering and triage', async () => {
  renderWorkbench('/library');

  expect(await screen.findByText(/source/i)).toBeInTheDocument();
  expect(screen.getByText(/imported/i)).toBeInTheDocument();
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/ui/library-inventory-layout.test.tsx tests/ui/library-and-project-context.test.tsx tests/integration/library-import.test.ts`

Expected: FAIL because the library is still rendered as a narrow, card-like personal desk with thin metadata.

**Step 3: Write minimal implementation**

Shift library to a desktop inventory model:

- return richer library metadata needed for triage and filtering without inventing unavailable paper fields
- widen the library surface so desktop width is spent on inventory density, not decorative whitespace
- distinguish personal inventory and project inventory by context and action set, not by separate ornamental side modules
- keep reader/notebook/project-doc links clear and stable from each inventory row/card

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/ui/library-inventory-layout.test.tsx tests/ui/library-and-project-context.test.tsx tests/integration/library-import.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add tests/ui/library-inventory-layout.test.tsx tests/ui/library-and-project-context.test.tsx tests/integration/library-import.test.ts src/server/services/library.service.ts src/server/http-api.ts src/shared/contracts/library.ts src/web/pages/library-page.tsx src/web/components/library-filters.tsx src/web/styles/app.css
git commit -m "feat: turn library into a wide inventory surface"
```

---

### Task 6: Recompose reader as a companion evidence surface inside notebook/project work

**Files:**
- Modify: `src/shared/contracts/reading.ts`
- Modify: `src/server/services/reading.service.ts`
- Modify: `src/server/http-api.ts`
- Modify: `src/web/pages/reader-page.tsx`
- Modify: `src/web/pages/notes-page.tsx`
- Modify: `src/web/components/paper-workspace-tabs.tsx`
- Modify: `src/web/components/notebook-question-list.tsx`
- Modify: `src/web/pages/project-page.tsx`
- Test: `tests/ui/paper-workspace.test.tsx`
- Test: `tests/ui/notes-workspace.test.tsx`
- Test: `tests/ui/project-writer-flow.test.tsx`
- Test: `tests/integration/reading-evidence.test.ts`

**Step 1: Write the failing tests**

```tsx
it('renders reader as a companion evidence pane with clear return paths to notebook and project work', async () => {
  renderWorkbench('/projects/tumor-board/library/entry-1/reader');

  expect(await screen.findByRole('link', { name: /back to notebook/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /back to project/i })).toBeInTheDocument();
});

it('keeps notebook questions visible as the primary synthesis structure while reading', async () => {
  renderWorkbench('/projects/tumor-board/library/entry-1/notes');

  expect(await screen.findByRole('heading', { name: /notebook questions/i })).toBeInTheDocument();
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/ui/paper-workspace.test.tsx tests/ui/notes-workspace.test.tsx tests/ui/project-writer-flow.test.tsx tests/integration/reading-evidence.test.ts`

Expected: FAIL because the reader is still a narrow single-paper desk and notebook synthesis is still largely entry-bound.

**Step 3: Write minimal implementation**

Recompose reading around the new IA rather than around isolated paper routes:

- keep the reader honest about current backend limits (metadata/text vs full PDF) while making its role explicit: evidence companion, not whole workspace
- add stable back-links and sibling transitions among project, notebook, reader, and writing surfaces
- make notebook questions the persistent synthesis scaffold, not a secondary side effect of opening notes from reader
- keep project projection and writing handoff visible from notebook/project context rather than forcing the user back through a paper cul-de-sac

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/ui/paper-workspace.test.tsx tests/ui/notes-workspace.test.tsx tests/ui/project-writer-flow.test.tsx tests/integration/reading-evidence.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add tests/ui/paper-workspace.test.tsx tests/ui/notes-workspace.test.tsx tests/ui/project-writer-flow.test.tsx tests/integration/reading-evidence.test.ts src/shared/contracts/reading.ts src/server/services/reading.service.ts src/server/http-api.ts src/web/pages/reader-page.tsx src/web/pages/notes-page.tsx src/web/components/paper-workspace-tabs.tsx src/web/components/notebook-question-list.tsx src/web/pages/project-page.tsx
git commit -m "refactor: make reader a companion surface inside notebook and project work"
```

---

### Task 7: Align docs, walkthroughs, and verification with the new IA

> **Historical note:** This task was superseded by Task 6 in `2026-03-25-jixia-researchclaw-web-redesign-implementation.md`, which changed the browser story to `Search/Library -> Reader -> AI Workspace / Notebook -> Project Docs` and replaced the older notebook-question / companion-reader assumptions below.

**Files:**
- Modify: `docs/runbooks/native-demo-showcase.md`
- Modify: `docs/plans/2026-03-24-jixia-demo-gap-closure-implementation.md`
- Modify: `tests/ui/mvp-workflow.test.tsx`
- Modify: `tests/ui/native-demo-workflow.test.tsx`
- Modify: `tests/integration/native-demo-http.test.ts`

**Step 1: Write the failing tests / walkthrough assertions**

```tsx
it('supports the canonical Home → Projects → Notebooks → Reader → Project Docs browser story', async () => {
  renderWorkbench('/home');

  expect(await screen.findByRole('link', { name: /open tumor board workspace/i })).toBeInTheDocument();
});
```

**Step 2: Run verification-focused tests to expose drift**

Run: `npm test -- tests/ui/mvp-workflow.test.tsx tests/ui/native-demo-workflow.test.tsx tests/integration/native-demo-http.test.ts`

Expected: FAIL until the docs and workflow tests match the new IA and canonical walkthrough.

**Step 3: Write minimal implementation**

Align all truthful guidance and checks:

- rewrite the runbook so the canonical story begins from `Home` / `Projects` / `Notebooks`, not from the old paper-first shell
- update previous plan references so this IA reset is clearly the next phase after gap closure
- revise UI/integration workflow tests so they exercise the real browser path, not the superseded shell assumptions

**Step 4: Run the full verification suite**

Run: `npm test`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

**Step 5: Commit**

```bash
git add docs/runbooks/native-demo-showcase.md docs/plans/2026-03-24-jixia-demo-gap-closure-implementation.md tests/ui/mvp-workflow.test.tsx tests/ui/native-demo-workflow.test.tsx tests/integration/native-demo-http.test.ts
git commit -m "docs: align workbench runbook with project-notebook IA"
```

---

## Final acceptance gate

Do **not** use the acceptance items below as the current implementation gate. They are preserved only to show the phase boundary this older plan was trying to reach.

The current branch acceptance gate is the one in `2026-03-25-jixia-researchclaw-web-redesign-implementation.md`, which requires:

1. Sidebar renders `Home / Projects / Search / Library / Notebooks / AI / Settings`
2. Notebook is a private cloud-document surface and no longer renders notebook-question scaffolding
3. Project Docs remains separate and project-owned
4. AI workspace is globally reachable and appears docked on the right when entering Reader
5. Reader presents a real document-first reading page instead of a metadata companion card
6. Search is dense enough to function as a paper intake surface
7. Library is dense and wide enough to function as a corpus inventory surface
8. Browser walkthrough succeeds: open paper from Search or Library -> read in Reader -> continue in docked AI workspace -> open private notebook -> continue writing -> optionally promote into Project Docs
9. `npm test`, `npm run typecheck`, and `npm run build` all pass

If any acceptance item fails, continue iterating on the corresponding task rather than moving ahead to deeper product features.
