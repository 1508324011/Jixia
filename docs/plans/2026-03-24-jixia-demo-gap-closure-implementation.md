# Jixia Demo Gap Closure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

> **Status update (2026-03-25):** This gap-closure plan is implemented and now serves as historical context only. The branch has moved beyond the intermediate intake/library-first recovery state described below. The active browser story on `demo-native-showcase` is now the notebook/project-first workbench flow under `/home`, `/projects`, `/notebooks`, `/library`, and canonical `/projects/:projectId/...` routes.

**Goal:** Close the gap between the current `demo-native-showcase` branch and the previously approved Research Workbench Reset so the demo honestly delivers a full-width, usable `Intake → Inventory → Read → Think → Share/Write` workflow.

**Architecture:** Treat the current branch as a partially completed reset, not as a failed prototype. Keep the ownership, contract, and server-first work already landed in place; finish the branch by correcting the workbench shell, restoring truthful personal/project boundaries, turning placeholder panes into real work surfaces, and updating the verification/docs layer to match the actual supported flow.

**Tech Stack:** React, React Router, TypeScript, Vite, Vitest, current `src/web` pages/components/styles, `src/shared/contracts/*`, `src/server/http-api.ts`, `src/server/services/*`, and `docs/runbooks/native-demo-showcase.md`.

---

## Current gap snapshot

Compared against `docs/plans/2026-03-23-jixia-research-workbench-reset-design.md`, the current demo has the **foundational reset skeleton** but not the full honest beta experience.

### What is already present

- canonical top-level workbench routes under `/home`, `/today`, `/search`, `/library`, `/projects`, `/settings`
- a three-column shell via `src/web/components/workbench-layout.tsx`
- multi-source discovery requests via `/api/discovery/search`
- personal library route and project library route
- separate Reader, Notes Workspace, and Project Docs routes
- server-backed import, reading, notes, and writing endpoints

### What is still missing or misleading

- the central work surface is still constrained by `.page-shell { max-width: 1120px; }`, so the app feels like a narrow page, not a full-width workbench
- search boards use unstable column balancing, producing huge empty areas and inconsistent card density
- personal library still opens the project reader route instead of a truthful personal reading route
- the right rail is mostly static (`ContextIndicator` facts and `recentOpenedItems` array), not a real contextual navigation rail
- `PaperWorkspaceTabs` is mostly decorative; tabs do not expose real AI / notes / comments / metadata panes
- Reader only shows lightweight metadata/abstract text and previews, not truthful retrieval state or deep-reading modes
- Notes Workspace is entry-bound, not notebook/question-bound across papers
- quote / insert helper and project-owned evidence projection are not exposed in the current browser workflow
- docs/tests overstate current completeness relative to the actual user experience

---

## Task 1: Make the shell truly full-width and make the context rails actionable

**Files:**
- Modify: `src/web/styles/app.css`
- Modify: `src/web/components/workbench-layout.tsx`
- Modify: `src/web/components/context-indicator.tsx`
- Modify: `src/web/components/recent-opened-panel.tsx`
- Modify: `src/web/lib/recent-opened-store.ts`
- Test: `tests/ui/research-workbench-shell.test.tsx`
- Test: `tests/ui/home-page.test.tsx`

**Step 1: Write the failing tests**

```tsx
test('renders a desktop workbench shell without page-width constraining the main surface', () => {
  renderWorkbench('/home');

  expect(screen.getByTestId('workbench-main-surface')).toHaveAttribute(
    'data-layout-mode',
    'full-width',
  );
});

test('renders actionable recent-opened links in the context rail', () => {
  renderWorkbench('/home');

  expect(screen.getByRole('link', { name: /signal pathways in shared tumor boards/i })).toBeInTheDocument();
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/ui/research-workbench-shell.test.tsx tests/ui/home-page.test.tsx`

Expected: FAIL because the main page shell still uses a narrow max-width layout and the context rail is mostly static text.

**Step 3: Write minimal implementation**

Implement the smallest shell refactor that makes the current workbench feel like a desktop workspace:

- remove the desktop `max-width: 1120px` constraint from workbench pages while preserving centered auth/basic pages
- make `WorkbenchLayout` carry the shell width responsibility instead of every page body
- turn `ContextIndicator` facts into contextual navigation/actions where appropriate
- make `RecentOpenedPanel` render real links using actual route targets instead of inert list items
- keep mobile/tablet fallback behavior intact

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/ui/research-workbench-shell.test.tsx tests/ui/home-page.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add tests/ui/research-workbench-shell.test.tsx tests/ui/home-page.test.tsx src/web/styles/app.css src/web/components/workbench-layout.tsx src/web/components/context-indicator.tsx src/web/components/recent-opened-panel.tsx src/web/lib/recent-opened-store.ts
git commit -m "feat: make the workbench shell truly full-width"
```

---

## Task 2: Rebuild search results into a stable, high-density intake surface

**Files:**
- Modify: `src/web/pages/search-page.tsx`
- Modify: `src/web/components/intake-source-board.tsx`
- Modify: `src/web/styles/app.css`
- Modify: `src/shared/contracts/discovery.ts`
- Test: `tests/ui/native-demo-workflow.test.tsx`
- Create: `tests/ui/search-intake-layout.test.tsx`

**Step 1: Write the failing tests**

```tsx
test('renders source sections with stable result density instead of equal-height sparse boards', async () => {
  renderWorkbench('/search');
  await runSearch('tumor board');

  expect(screen.getByRole('region', { name: /pubmed intake lane/i })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: /arxiv intake lane/i })).toBeInTheDocument();
  expect(screen.queryByTestId('equal-height-search-board')).not.toBeInTheDocument();
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/ui/search-intake-layout.test.tsx tests/ui/native-demo-workflow.test.tsx`

Expected: FAIL because the current board layout still produces unstable whitespace and card heights.

**Step 3: Write minimal implementation**

Redesign search rendering around readability and consistent action placement:

- replace equal-height column boards with vertically stacked source sections or dense source rows
- give every candidate the same action area structure and consistent metadata rhythm
- surface richer metadata that already exists in `TodayRecommendation` (`abstractText`, `canonicalId`, `sourceLabel`) without creating fake scores
- make the import state update in-place without reshuffling the whole result surface
- keep the search box singular and stable

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/ui/search-intake-layout.test.tsx tests/ui/native-demo-workflow.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add tests/ui/search-intake-layout.test.tsx tests/ui/native-demo-workflow.test.tsx src/web/pages/search-page.tsx src/web/components/intake-source-board.tsx src/web/styles/app.css src/shared/contracts/discovery.ts
git commit -m "feat: stabilize intake search result layout"
```

---

## Task 3: Restore truthful personal reading routes and context-specific reader entry

**Files:**
- Modify: `src/web/router.tsx`
- Modify: `src/web/pages/library-page.tsx`
- Modify: `src/web/pages/reader-page.tsx`
- Modify: `src/web/pages/notes-page.tsx`
- Test: `tests/ui/workbench-routing.test.tsx`
- Test: `tests/ui/library-and-project-context.test.tsx`
- Test: `tests/ui/paper-workspace.test.tsx`

**Step 1: Write the failing tests**

```tsx
test('opens a personal library entry in a personal reader route', () => {
  renderWorkbench('/library');

  expect(screen.getByRole('link', { name: /open reader/i })).toHaveAttribute(
    'href',
    expect.stringMatching(/^\/library\/[^/]+\/reader$/),
  );
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/ui/workbench-routing.test.tsx tests/ui/library-and-project-context.test.tsx tests/ui/paper-workspace.test.tsx`

Expected: FAIL because personal library still links into `/projects/project-1/library/:entryId/reader`.

**Step 3: Write minimal implementation**

Introduce truthful route boundaries:

- add canonical personal reader and personal notes routes
- make personal library link to personal reading surfaces
- keep project reader/project notes routes for shared/project context
- ensure the context bar, return links, and right rail reflect `Personal` vs `Project / …` truthfully
- avoid reintroducing `/spaces/...` as a second canonical tree

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/ui/workbench-routing.test.tsx tests/ui/library-and-project-context.test.tsx tests/ui/paper-workspace.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add tests/ui/workbench-routing.test.tsx tests/ui/library-and-project-context.test.tsx tests/ui/paper-workspace.test.tsx src/web/router.tsx src/web/pages/library-page.tsx src/web/pages/reader-page.tsx src/web/pages/notes-page.tsx
git commit -m "refactor: restore personal reader boundaries"
```

---

## Task 4: Turn Reader and Notes Workspace from previews into real work surfaces

**Files:**
- Modify: `src/shared/contracts/reading.ts`
- Modify: `src/server/services/reading.service.ts`
- Modify: `src/server/http-api.ts`
- Modify: `src/web/pages/reader-page.tsx`
- Modify: `src/web/pages/notes-page.tsx`
- Modify: `src/web/components/paper-workspace-tabs.tsx`
- Modify: `src/web/components/notebook-question-list.tsx`
- Test: `tests/integration/reading-evidence.test.ts`
- Test: `tests/ui/paper-workspace.test.tsx`
- Test: `tests/ui/notes-workspace.test.tsx`

**Step 1: Write the failing tests**

```tsx
test('switches between real reader workspace tabs instead of rendering one decorative AI panel', async () => {
  renderWorkbench('/library/entry-1/reader');

  await user.click(screen.getByRole('tab', { name: /关键信息/i }));
  expect(screen.getByText(/retrieval state/i)).toBeInTheDocument();
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/integration/reading-evidence.test.ts tests/ui/paper-workspace.test.tsx tests/ui/notes-workspace.test.tsx`

Expected: FAIL because the current reader tabs are mostly decorative and the Notes Workspace is still entry-centric.

**Step 3: Write minimal implementation**

Upgrade the reading model and browser surfaces so the experience becomes truthful:

- add explicit retrieval/readiness state to `ReadingDetailView`
- make the reader expose real tabbed panes for metadata, notes, comments, and AI helper content
- keep Reader focused on single-paper reading and evidence
- make Notes Workspace visibly notebook/question-driven instead of just “reader notes on another page”
- avoid inventing full PDF infrastructure if the backend only supports metadata/text today; represent the limitation explicitly in the UI

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/integration/reading-evidence.test.ts tests/ui/paper-workspace.test.tsx tests/ui/notes-workspace.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add tests/integration/reading-evidence.test.ts tests/ui/paper-workspace.test.tsx tests/ui/notes-workspace.test.tsx src/shared/contracts/reading.ts src/server/services/reading.service.ts src/server/http-api.ts src/web/pages/reader-page.tsx src/web/pages/notes-page.tsx src/web/components/paper-workspace-tabs.tsx src/web/components/notebook-question-list.tsx
git commit -m "feat: make reader and notes surfaces truthful"
```

---

## Task 5: Expose evidence cards and quote/insert projection into project docs

**Files:**
- Modify: `src/server/services/project-projection.service.ts`
- Modify: `src/server/services/notebook.service.ts`
- Modify: `src/server/services/writing.service.ts`
- Modify: `src/server/http-api.ts`
- Modify: `src/web/pages/notes-page.tsx`
- Modify: `src/web/pages/writing-page.tsx`
- Modify: `src/web/components/project-document-tree.tsx`
- Modify: `src/web/components/project-writer-list.tsx`
- Test: `tests/integration/notebook-project-projection.test.ts`
- Test: `tests/integration/project-doc-ownership.test.ts`
- Test: `tests/ui/project-writer-flow.test.tsx`

**Step 1: Write the failing tests**

```tsx
test('projects private notebook material into a project-owned reference from the browser workflow', async () => {
  renderWorkbench('/projects/project-1/library/entry-1/notes');

  await user.click(screen.getByRole('button', { name: /insert into project docs/i }));
  expect(screen.getByText(/project-owned reference created/i)).toBeInTheDocument();
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/integration/notebook-project-projection.test.ts tests/integration/project-doc-ownership.test.ts tests/ui/project-writer-flow.test.tsx`

Expected: FAIL because the current browser flow does not expose quote / insert helper semantics even though the boundary policy exists server-side.

**Step 3: Write minimal implementation**

Finish the cross-boundary workflow the design doc depends on:

- expose evidence card / projection actions from Notes Workspace
- create project-owned reference artifacts, not live notebook sharing
- show inserted material in the writing surface/reference rail
- keep notebook private and avoid leaking notebook bodies into project routes

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/integration/notebook-project-projection.test.ts tests/integration/project-doc-ownership.test.ts tests/ui/project-writer-flow.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add tests/integration/notebook-project-projection.test.ts tests/integration/project-doc-ownership.test.ts tests/ui/project-writer-flow.test.tsx src/server/services/project-projection.service.ts src/server/services/notebook.service.ts src/server/services/writing.service.ts src/server/http-api.ts src/web/pages/notes-page.tsx src/web/pages/writing-page.tsx src/web/components/project-document-tree.tsx src/web/components/project-writer-list.tsx
git commit -m "feat: expose quote and insert projection workflow"
```

---

## Task 6: Run the truthfulness pass and align docs, walkthroughs, and verification

**Files:**
- Modify: `docs/runbooks/native-demo-showcase.md`
- Modify: `docs/plans/2026-03-23-jixia-research-workbench-reset-design.md`
- Modify: `docs/plans/2026-03-24-jixia-research-workbench-reset-risk-first-implementation.md`
- Modify: `tests/ui/mvp-workflow.test.tsx`
- Modify: `tests/ui/native-demo-workflow.test.tsx`
- Modify: `tests/integration/native-demo-http.test.ts`

**Step 1: Write the failing/obsolete-state checklist**

Verify these statements are no longer true anywhere in docs or tests:

- the demo is allowed to remain a narrow page-shell workbench
- personal inventory may reuse project reading routes
- right-rail context can remain static/non-interactive
- quote / insert helper may remain server-only and absent from the browser workflow
- the workbench may claim ResearchClaw-like behavior without a truthful multi-surface experience

**Step 2: Run focused verification first**

Run: `npm test -- tests/integration/native-demo-http.test.ts tests/ui/native-demo-workflow.test.tsx tests/ui/mvp-workflow.test.tsx`

Expected: PASS only after docs/tests describe the actual rebuilt flow.

**Step 3: Update runbook and plans truthfully**

Document the final supported walkthrough:

1. open `/home`
2. enter `/search` or `/today`
3. import into personal inventory
4. open the personal reader
5. save private notebook material
6. project selected material into project docs
7. verify project-owned output in writer

**Step 4: Run full verification**

Run: `npm test`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

**Step 5: Commit**

```bash
git add docs/runbooks/native-demo-showcase.md docs/plans/2026-03-23-jixia-research-workbench-reset-design.md docs/plans/2026-03-24-jixia-research-workbench-reset-risk-first-implementation.md tests/ui/mvp-workflow.test.tsx tests/ui/native-demo-workflow.test.tsx tests/integration/native-demo-http.test.ts
git commit -m "docs: align demo walkthrough with truthful workbench flow"
```

---

## Recommended delivery order

1. **Task 1 first** — because the narrow-shell problem poisons every surface review.
2. **Task 3 second** — because personal/project boundary errors are the highest-signal workflow bug.
3. **Task 2 third** — because search is the most visibly broken surface after shell/boundary fixes.
4. **Task 4 fourth** — because Reader/Notes truthfulness matters once routing and shell are correct.
5. **Task 5 fifth** — because quote/insert is the key bridge to project docs.
6. **Task 6 last** — final truthfulness/docs/verification pass.

## Definition of done for this gap-closure plan

- Desktop workbench uses a full-width shell instead of a blog-width center column.
- Search results are visually stable and source-consistent.
- Personal library opens truthful personal reading routes.
- Reader and Notes Workspace expose real, non-decorative work surfaces.
- Right rail is contextual and actionable.
- Quote / insert helper is available in the browser workflow and produces project-owned references.
- `npm test`, `npm run typecheck`, and `npm run build` all pass.
- The runbook and reset docs describe the demo honestly.
