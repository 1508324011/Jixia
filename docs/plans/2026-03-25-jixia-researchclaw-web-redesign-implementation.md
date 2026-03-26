# Jixia ResearchClaw-Style Web Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the Jixia web experience around a ResearchClaw-like workbench feel while keeping Jixia's server-first ownership model: a real Reader surface, a global AI workspace, a fully private Notion-like notebook, and separate project-owned Project Docs.

**Architecture:** Keep the existing canonical browser routes and ownership boundaries as the stable foundation, but replace the current block-page composition and question-driven notebook model. The redesigned flow should treat `Reader`, `AI Workspace`, `Notebook`, and `Project Docs` as independent but linked surfaces, with `Search` and `Library` feeding papers into that working loop.

**Tech Stack:** React, React Router, TypeScript, Vite, Vitest, current `src/web` pages/components/styles, `src/web/lib/demo-api.ts`, `src/shared/contracts/*`, `src/server/http-api.ts`, `src/server/services/*`, and `docs/runbooks/native-demo-showcase.md`.

## Status update after shell implementation

As of `2026-03-26`, the shell-density portion of this broader redesign is now implemented by the follow-on shell plan in `docs/plans/2026-03-26-jixia-ide-classic-lite-shell-implementation.md`. The active demo shell now uses an activity rail, compact sidebar, top open-view strip, `editor-canvas` main surface, and quieter inspector rail. Keep this document as the broader redesign sequence, but treat the newer shell plan and current source files as the source of truth for shell-only behavior on `demo-native-showcase`.

---

## Planning baseline

This plan supersedes the old question-driven notebook assumption.

- `Notebook` is fully private and document-first.
- `Project Docs` remains project-owned and shared.
- `AI Workspace` is globally independent, but entering `Reader` docks it on the right by default.
- `Reader` becomes a real reading page and should not turn into a workflow-command panel.
- `Search` and `Library` become denser feeder surfaces rather than stacked block pages.

## Delivery order

1. Freeze the surface model and route graph
2. Build the shared cloud-document foundation for private notebook + project docs
3. Introduce a global AI workspace and reader docking model
4. Rebuild Reader as a true reading page
5. Recompose Search and Library into denser workbench surfaces
6. Align docs, walkthroughs, and verification

---

### Task 1: Freeze the new surface model and route graph

**Files:**
- Modify: `src/web/router.tsx`
- Modify: `src/web/components/sidebar-nav.tsx`
- Modify: `src/web/components/workbench-layout.tsx`
- Create: `src/web/pages/ai-workspace-page.tsx`
- Modify: `src/web/styles/app.css`
- Test: `tests/ui/workbench-routing.test.tsx`
- Test: `tests/ui/workbench-navigation.test.tsx`
- Test: `tests/ui/research-workbench-shell.test.tsx`

**Step 1: Write the failing tests**

```tsx
it('renders a top-level AI workspace entry in the workbench navigation', () => {
  renderWorkbench('/home');

  expect(screen.getByRole('link', { name: 'AI' })).toBeInTheDocument();
});

it('keeps notebook, reader, AI workspace, and project docs as separate surfaces', () => {
  renderWorkbench('/projects/tumor-board/library/entry-1/reader');

  expect(screen.getByRole('link', { name: /open notebook/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /open ai workspace/i })).toBeInTheDocument();
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/ui/workbench-routing.test.tsx tests/ui/workbench-navigation.test.tsx tests/ui/research-workbench-shell.test.tsx`

Expected: FAIL because the current shell has no first-class AI workspace route and still assumes notebook/reader coupling through the old note flow.

**Step 3: Write minimal implementation**

Make the route graph truthful:

- add a canonical `/ai` workspace route
- expose `AI` in the main navigation without removing `Home / Projects / Search / Library / Notebooks / Settings`
- make Reader link to Notebook and AI Workspace as peers, not children
- weaken the current visual dominance of the right context rail so the main canvas can become the true center

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/ui/workbench-routing.test.tsx tests/ui/workbench-navigation.test.tsx tests/ui/research-workbench-shell.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add tests/ui/workbench-routing.test.tsx tests/ui/workbench-navigation.test.tsx tests/ui/research-workbench-shell.test.tsx src/web/router.tsx src/web/components/sidebar-nav.tsx src/web/components/workbench-layout.tsx src/web/pages/ai-workspace-page.tsx src/web/styles/app.css
git commit -m "refactor: freeze reader ai notebook surface model"
```

---

### Task 2: Replace the question notebook with a cloud-document foundation shared by notebook and project docs

**Files:**
- Modify: `src/shared/contracts/reading.ts`
- Modify: `src/shared/contracts/notebook.ts`
- Modify: `src/shared/contracts/writing.ts`
- Modify: `src/server/services/notebook.service.ts`
- Modify: `src/server/services/writing.service.ts`
- Modify: `src/server/http-api.ts`
- Modify: `src/web/pages/notes-page.tsx`
- Modify: `src/web/pages/notebooks-page.tsx`
- Modify: `src/web/pages/writing-page.tsx`
- Create: `src/web/components/document-editor.tsx`
- Test: `tests/ui/notes-workspace.test.tsx`
- Test: `tests/ui/notebooks-page.test.tsx`
- Test: `tests/ui/project-writer-flow.test.tsx`
- Test: `tests/integration/notebook-project-projection.test.ts`

**Step 1: Write the failing tests**

```tsx
it('renders notebook as a document editor instead of a question list', async () => {
  renderWorkbench('/notebooks/notebook-3');

  expect(await screen.findByRole('textbox', { name: /notebook document/i })).toBeInTheDocument();
  expect(screen.queryByText(/notebook questions/i)).not.toBeInTheDocument();
});

it('uses the same editor foundation for project docs and notebook without merging ownership', async () => {
  renderWorkbench('/projects/tumor-board/writing/doc-1');

  expect(await screen.findByRole('textbox', { name: /project document/i })).toBeInTheDocument();
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/ui/notes-workspace.test.tsx tests/ui/notebooks-page.test.tsx tests/ui/project-writer-flow.test.tsx tests/integration/notebook-project-projection.test.ts`

Expected: FAIL because notebook is still driven by `defaultNotebookQuestionPrompts` and both notebook/project docs still use raw textareas without a shared document foundation.

**Step 3: Write minimal implementation**

Build one document foundation that supports two ownership modes:

- private notebook documents
- project-owned writing documents

Do this without merging the two domains:

- remove `defaultNotebookQuestionPrompts` from the notebook-driving UI path
- replace `NotebookQuestionList`-centered editing with a document canvas
- keep project docs separate in ownership, publish state, and reference behavior
- allow optional inserted templates or sections later, but do not make templates the notebook architecture

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/ui/notes-workspace.test.tsx tests/ui/notebooks-page.test.tsx tests/ui/project-writer-flow.test.tsx tests/integration/notebook-project-projection.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add tests/ui/notes-workspace.test.tsx tests/ui/notebooks-page.test.tsx tests/ui/project-writer-flow.test.tsx tests/integration/notebook-project-projection.test.ts src/shared/contracts/reading.ts src/shared/contracts/notebook.ts src/shared/contracts/writing.ts src/server/services/notebook.service.ts src/server/services/writing.service.ts src/server/http-api.ts src/web/pages/notes-page.tsx src/web/pages/notebooks-page.tsx src/web/pages/writing-page.tsx src/web/components/document-editor.tsx
git commit -m "refactor: replace question notebook with private cloud document"
```

---

### Task 3: Introduce the global AI workspace and its docked-reader behavior

**Files:**
- Create: `src/shared/contracts/ai-workspace.ts`
- Modify: `src/server/http-api.ts`
- Modify: `src/web/lib/demo-api.ts`
- Create: `src/web/components/ai-workspace-shell.tsx`
- Create: `src/web/components/ai-context-attachments.tsx`
- Create: `src/web/pages/ai-workspace-page.tsx`
- Modify: `src/web/pages/reader-page.tsx`
- Test: `tests/ui/paper-workspace.test.tsx`
- Create: `tests/ui/ai-workspace-page.test.tsx`
- Test: `tests/ui/workbench-navigation.test.tsx`

**Step 1: Write the failing tests**

```tsx
it('opens a global ai workspace from the top-level nav', async () => {
  renderWorkbench('/home');

  await user.click(screen.getByRole('link', { name: 'AI' }));
  expect(await screen.findByRole('heading', { name: /ai workspace/i })).toBeInTheDocument();
});

it('shows the ai workspace docked on the right when entering reader', async () => {
  renderWorkbench('/projects/tumor-board/library/entry-1/reader');

  expect(await screen.findByRole('heading', { name: /ai workspace/i })).toBeInTheDocument();
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/ui/paper-workspace.test.tsx tests/ui/ai-workspace-page.test.tsx tests/ui/workbench-navigation.test.tsx`

Expected: FAIL because there is currently no independent AI workspace surface and Reader still uses the old paper-companion framing.

**Step 3: Write minimal implementation**

Introduce the AI model the user requested:

- a global AI workspace route and shell
- independent AI sessions
- support for multiple attached papers inside one conversation
- when entering Reader, show the current AI session docked on the right by default without making Reader the owner of that session

Do not overload Reader with explicit workflow push actions. The docked conversation is the integration point.

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/ui/paper-workspace.test.tsx tests/ui/ai-workspace-page.test.tsx tests/ui/workbench-navigation.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add tests/ui/paper-workspace.test.tsx tests/ui/ai-workspace-page.test.tsx tests/ui/workbench-navigation.test.tsx src/shared/contracts/ai-workspace.ts src/server/http-api.ts src/web/lib/demo-api.ts src/web/components/ai-workspace-shell.tsx src/web/components/ai-context-attachments.tsx src/web/pages/ai-workspace-page.tsx src/web/pages/reader-page.tsx
git commit -m "feat: add global ai workspace with docked reader mode"
```

---

### Task 4: Rebuild Reader as a true reading page

**Files:**
- Modify: `src/shared/contracts/reading.ts`
- Modify: `src/server/services/reading.service.ts`
- Modify: `src/server/http-api.ts`
- Modify: `src/web/pages/reader-page.tsx`
- Create: `src/web/components/reader-document-canvas.tsx`
- Modify: `src/web/styles/app.css`
- Test: `tests/ui/paper-workspace.test.tsx`
- Test: `tests/integration/reading-evidence.test.ts`

**Step 1: Write the failing tests**

```tsx
it('renders reader as a document-first reading layout rather than a metadata companion panel', async () => {
  renderWorkbench('/projects/tumor-board/library/entry-1/reader');

  expect(await screen.findByTestId('reader-document-canvas')).toBeInTheDocument();
});

it('keeps reader separate from notebook while still allowing notebook access', async () => {
  renderWorkbench('/projects/tumor-board/library/entry-1/reader');

  expect(await screen.findByRole('link', { name: /open notebook/i })).toBeInTheDocument();
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/ui/paper-workspace.test.tsx tests/integration/reading-evidence.test.ts`

Expected: FAIL because Reader is still structured as `Evidence companion · paper review · notebook handoff` with a metadata-heavy panel stack.

**Step 3: Write minimal implementation**

Rebuild Reader around the validated scope:

- left: editable PDF/HTML reading page
- right: docked AI workspace
- remove the current assumption that Reader's main purpose is to route the user back into notebook/project surfaces
- keep notebook access available, but not as the defining architecture of the page

Do not add extra workflow-command features the user explicitly rejected.

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/ui/paper-workspace.test.tsx tests/integration/reading-evidence.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add tests/ui/paper-workspace.test.tsx tests/integration/reading-evidence.test.ts src/shared/contracts/reading.ts src/server/services/reading.service.ts src/server/http-api.ts src/web/pages/reader-page.tsx src/web/components/reader-document-canvas.tsx src/web/styles/app.css
git commit -m "refactor: turn reader into a real reading page"
```

---

### Task 5: Recompose Search and Library into denser feeder surfaces

**Files:**
- Modify: `src/shared/contracts/discovery.ts`
- Modify: `src/shared/contracts/library.ts`
- Modify: `src/server/services/discovery.service.ts`
- Modify: `src/server/services/library.service.ts`
- Modify: `src/server/http-api.ts`
- Modify: `src/web/pages/search-page.tsx`
- Modify: `src/web/pages/library-page.tsx`
- Modify: `src/web/components/intake-source-board.tsx`
- Modify: `src/web/components/library-filters.tsx`
- Modify: `src/web/styles/app.css`
- Test: `tests/ui/search-intake-layout.test.tsx`
- Test: `tests/ui/library-inventory-layout.test.tsx`
- Test: `tests/ui/library-and-project-context.test.tsx`
- Test: `tests/integration/discovery-pagination.test.ts`
- Test: `tests/integration/library-import.test.ts`

**Step 1: Write the failing tests**

```tsx
it('renders search results as dense intake rows instead of stacked cards', async () => {
  renderWorkbench('/search');
  await runSearch('tumor board');

  expect(await screen.findByTestId('search-intake-surface')).toHaveAttribute('data-density', 'dense');
});

it('renders library as a wide corpus inventory instead of a narrow desk', async () => {
  renderWorkbench('/library');

  expect(await screen.findByTestId('library-inventory-surface')).toHaveAttribute('data-density', 'dense');
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/ui/search-intake-layout.test.tsx tests/ui/library-inventory-layout.test.tsx tests/ui/library-and-project-context.test.tsx tests/integration/discovery-pagination.test.ts tests/integration/library-import.test.ts`

Expected: FAIL because Search still uses grouped card lanes and Library still behaves like a bordered panel desk.

**Step 3: Write minimal implementation**

Keep the truthful backend boundaries but change the presentation model:

- Search becomes denser and faster to scan
- Library becomes a broader inventory surface with less ornamental panel structure
- both surfaces prioritize opening Reader, Notebook, and Project Docs without becoming the workbench center themselves

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/ui/search-intake-layout.test.tsx tests/ui/library-inventory-layout.test.tsx tests/ui/library-and-project-context.test.tsx tests/integration/discovery-pagination.test.ts tests/integration/library-import.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add tests/ui/search-intake-layout.test.tsx tests/ui/library-inventory-layout.test.tsx tests/ui/library-and-project-context.test.tsx tests/integration/discovery-pagination.test.ts tests/integration/library-import.test.ts src/shared/contracts/discovery.ts src/shared/contracts/library.ts src/server/services/discovery.service.ts src/server/services/library.service.ts src/server/http-api.ts src/web/pages/search-page.tsx src/web/pages/library-page.tsx src/web/components/intake-source-board.tsx src/web/components/library-filters.tsx src/web/styles/app.css
git commit -m "refactor: turn search and library into dense feeder surfaces"
```

---

### Task 6: Align docs, walkthroughs, and verification with the corrected surface model

**Files:**
- Modify: `docs/runbooks/native-demo-showcase.md`
- Modify: `docs/plans/2026-03-24-jixia-project-notebook-workbench-implementation.md`
- Modify: `tests/ui/mvp-workflow.test.tsx`
- Modify: `tests/ui/native-demo-workflow.test.tsx`
- Modify: `tests/integration/native-demo-http.test.ts`

**Step 1: Write the failing workflow assertions**

```tsx
it('supports the corrected browser story of Search/Library -> Reader -> AI/Notebook -> Project Docs', async () => {
  renderWorkbench('/home');

  expect(await screen.findByRole('link', { name: /projects/i })).toBeInTheDocument();
});
```

**Step 2: Run workflow verification to expose drift**

Run: `npm test -- tests/ui/mvp-workflow.test.tsx tests/ui/native-demo-workflow.test.tsx tests/integration/native-demo-http.test.ts`

Expected: FAIL until the docs and workflow tests match the corrected model.

**Step 3: Write minimal implementation**

Update the truthful guidance so it matches the new architecture:

- notebook is private
- AI workspace is global and docked in reader by default
- Reader, Notebook, and Project Docs are independent surfaces
- Search and Library are feeder surfaces, not the center of the story

**Step 4: Run the full verification suite**

Run: `npm test`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

**Step 5: Commit**

```bash
git add docs/runbooks/native-demo-showcase.md docs/plans/2026-03-24-jixia-project-notebook-workbench-implementation.md tests/ui/mvp-workflow.test.tsx tests/ui/native-demo-workflow.test.tsx tests/integration/native-demo-http.test.ts
git commit -m "docs: align runbook with global ai and private notebook model"
```

---

## Final acceptance gate

Do **not** claim this redesign complete until all of the following are true in one fresh runtime:

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
