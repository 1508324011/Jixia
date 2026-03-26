# Jixia Shell De-Card & Consistency Finish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finish the remaining shell-only polish work so the Jixia IDE Classic Lite workbench stops reading like "new chrome around old cards" and starts reading like one consistent workbench across its primary routes.

**Architecture:** Keep the already-landed shell primitives — `Activity Rail`, `Compact Sidebar`, `Open-view strip`, and `Inspector rail` — but remove the remaining page-card grammar from the dominant work surfaces and fix the route-state inconsistencies that still break the workbench illusion. This is a narrow finish pass, not another redesign of Notebook, AI, Reader semantics, or Search/Library data models.

**Tech Stack:** React, React Router, TypeScript, Vite, Vitest, current `src/web` shell/components/styles, and current shell tests in `tests/ui`.

## Implemented status

As of `2026-03-26`, this finish pass is implemented on `demo-native-showcase`. The current source now fixes top-level `/projects` open-view-strip state, de-cards `Home` into one resumption canvas, flattens `Reader` into one reading workspace with docked AI/support lanes, and normalizes `Home`, `Projects`, `Search`, `Library`, `Notebooks`, and `AI` onto one `workbench-route` shell grammar. The analysis and task list below remain the implementation record of the gaps this pass closed.

---

## Pre-finish truth this plan was based on

Fresh evidence already shows the main shell primitives are in place:

- `src/web/components/activity-rail.tsx`
- `src/web/components/workbench-sidebar.tsx`
- `src/web/components/workbench-open-view-strip.tsx`
- `src/web/components/workbench-layout.tsx`

Fresh live audit on a source-synced `3004` runtime also shows the shell is **not finished**:

- `activityRail ≈ 76px`
- `compactSidebar ≈ 228px`
- `contextRail ≈ 264px`
- `openViewStrip=true`
- main workbench surface still only about **792px** wide at a **1440px** viewport
- `Home` still reads as a dashboard of bordered cards
- `Reader` still reads as stacked bordered panels

Fresh source inspection confirms the real remaining causes:

- `src/web/pages/home-page.tsx` still uses `<main className="page-shell dashboard-page">` and `panel home-desk-card`
- `src/web/pages/reader-page.tsx` still uses `<main className="page-shell">` and multiple boxed `panel` sections
- many other primary routes still keep `page-shell` + `panel` as their dominant grammar
- `src/web/lib/workbench-view-state.ts` still lacks a dedicated `/projects` top-level branch, so the open-view strip falls back to `Home`

This plan only finishes those remaining shell gaps.

---

## Finish-pass scope

### In scope

1. fix `Open-view strip` route-state correctness
2. remove the most visible card/dashboard feel from `Home`
3. remove the most visible stacked-card feel from `Reader`
4. normalize primary route shell templates so major workbench routes feel like one system
5. update shell tests and runbook wording to match the actually finished shell state

### Out of scope

- notebook semantics
- AI workspace semantics
- reader workflow semantics
- search ranking or pagination behavior
- library data behavior
- project docs ownership semantics
- full IDE docking, split editors, status bar, bottom panel system

---

### Task 1: Fix route-backed open-view strip correctness

**Files:**
- Modify: `src/web/lib/workbench-view-state.ts`
- Modify: `tests/ui/workbench-chrome.test.tsx`
- Modify: `tests/ui/workbench-navigation.test.tsx`

**Step 1: Write the failing tests**

```tsx
it('labels the top-level /projects route correctly in the open-view strip', () => {
  renderWorkbench('/projects');

  expect(screen.getByText('Open · Projects')).toBeInTheDocument();
  expect(screen.queryByText('Open · Home')).not.toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/workbench-chrome.test.tsx tests/ui/workbench-navigation.test.tsx`

Expected: FAIL because `/projects` currently falls back to the `Home` view label in `getCurrentView()`.

**Step 3: Write minimal implementation**

Add a dedicated `/projects` top-level branch to `getCurrentView()` and ensure the open-view strip treats project index as its own active route rather than a fallback case.

```ts
if (pathname === '/projects' || pathname.startsWith('/projects?')) {
  return { current: true, label: 'Projects', to: '/projects' };
}
```

Keep the open-view strip lightweight and route-backed; do not turn this into a full tab manager.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/workbench-chrome.test.tsx tests/ui/workbench-navigation.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/web/lib/workbench-view-state.ts tests/ui/workbench-chrome.test.tsx tests/ui/workbench-navigation.test.tsx
git commit -m "fix: align open view strip with projects route"
```

---

### Task 2: De-card the Home route into one dominant workspace canvas

**Files:**
- Modify: `src/web/pages/home-page.tsx`
- Modify: `src/web/styles/app.css`
- Modify: `tests/ui/home-page.test.tsx`
- Modify: `tests/ui/workbench-chrome.test.tsx`

**Step 1: Write the failing tests**

```tsx
it('renders Home as one workbench resumption canvas instead of a dashboard card grid', async () => {
  renderWorkbench('/home');

  expect(await screen.findByTestId('home-resumption-canvas')).toBeInTheDocument();
  expect(screen.queryByLabelText('Recent projects')).not.toHaveClass('panel');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/home-page.test.tsx tests/ui/workbench-chrome.test.tsx`

Expected: FAIL because `Home` still uses `page-shell`, `dashboard-grid`, and `home-desk-card` panels.

**Step 3: Write minimal implementation**

Replace the dashboard-card composition with one dominant workbench canvas that keeps the same content but changes the shell grammar:

- remove `page-shell dashboard-page` from the primary Home container
- replace the `panel-grid dashboard-grid` cluster with one workbench-resumption layout
- keep the same data and links, but present them as inline regions/lanes rather than standalone cards

```tsx
<main className="workbench-route workbench-route--home" data-testid="home-resumption-canvas">
```

```css
.workbench-route {
  display: grid;
  gap: var(--jixia-space-4);
  min-width: 0;
}

.workbench-route--home .dashboard-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border: none;
  box-shadow: none;
  background: transparent;
}
```

The point is not the exact class names; the point is to eliminate the floating-card feel.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/home-page.test.tsx tests/ui/workbench-chrome.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/web/pages/home-page.tsx src/web/styles/app.css tests/ui/home-page.test.tsx tests/ui/workbench-chrome.test.tsx
git commit -m "refactor: de-card the home workbench canvas"
```

---

### Task 3: De-card the Reader route so it stops reading like stacked panels

**Files:**
- Modify: `src/web/pages/reader-page.tsx`
- Modify: `src/web/components/ai-workspace-shell.tsx`
- Modify: `src/web/components/ai-context-attachments.tsx`
- Modify: `src/web/styles/app.css`
- Modify: `tests/ui/paper-workspace.test.tsx`
- Modify: `tests/ui/workbench-chrome.test.tsx`

**Step 1: Write the failing tests**

```tsx
it('renders Reader as one dominant reading workspace instead of stacked boxed panels', async () => {
  renderWorkbench('/projects/tumor-board/library/entry-1/reader');

  expect(await screen.findByTestId('reader-workspace-canvas')).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/paper-workspace.test.tsx tests/ui/workbench-chrome.test.tsx`

Expected: FAIL because `Reader` still wraps the route in `page-shell` and uses multiple boxed `panel` sections.

**Step 3: Write minimal implementation**

Keep the current Reader semantics, but change the shell grammar:

- remove `page-shell` framing from the top-level Reader route
- make the document surface visually dominant and flatter
- collapse the right-side AI/context sections into a more integrated support rail instead of multiple loud cards

```tsx
<main className="workbench-route workbench-route--reader" data-testid="reader-workspace-canvas">
```

```css
.workbench-route--reader .reader-document-surface,
.workbench-route--reader .reader-support-rail,
.workbench-route--reader .ai-workspace-shell {
  border-radius: var(--jixia-radius-md);
  box-shadow: none;
}
```

Again, the exact CSS may differ; the goal is a flatter, more continuous reading workspace.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/paper-workspace.test.tsx tests/ui/workbench-chrome.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/web/pages/reader-page.tsx src/web/components/ai-workspace-shell.tsx src/web/components/ai-context-attachments.tsx src/web/styles/app.css tests/ui/paper-workspace.test.tsx tests/ui/workbench-chrome.test.tsx
git commit -m "refactor: flatten reader workspace shell"
```

---

### Task 4: Normalize shell grammar across the primary workbench routes

**Files:**
- Modify: `src/web/pages/projects-page.tsx`
- Modify: `src/web/pages/search-page.tsx`
- Modify: `src/web/pages/library-page.tsx`
- Modify: `src/web/pages/notebooks-page.tsx`
- Modify: `src/web/pages/ai-workspace-page.tsx`
- Modify: `src/web/styles/app.css`
- Modify: `tests/ui/workbench-chrome.test.tsx`
- Modify: `tests/ui/native-demo-workflow.test.tsx`
- Modify: `tests/ui/mvp-workflow.test.tsx`

**Step 1: Write the failing tests**

```tsx
it('keeps the primary workbench routes inside one shell grammar instead of mixing card pages and workbench pages', () => {
  const routes = ['/home', '/projects', '/search', '/library', '/notebooks', '/ai'];

  for (const route of routes) {
    renderWorkbench(route);
    expect(screen.getByTestId('workbench-main-surface')).toHaveAttribute('data-layout-mode', 'editor-canvas');
    cleanup();
  }
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/workbench-chrome.test.tsx tests/ui/native-demo-workflow.test.tsx tests/ui/mvp-workflow.test.tsx`

Expected: FAIL or expose mismatches because the routes still apply inconsistent `page-shell` / `panel` grammars even though the shell chrome is shared.

**Step 3: Write minimal implementation**

Introduce one shared workbench-route presentation pattern and move the primary routes onto it:

- Projects
- Search
- Library
- Notebooks
- AI

Keep `writing-page.tsx`, `notes-page.tsx`, `settings-page.tsx`, `spaces-page.tsx`, and auth routes out of this finish pass unless a primary-route change forces a shared utility extraction.

The point is to finish the primary workbench routes first, not to chase every page in the repo.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/workbench-chrome.test.tsx tests/ui/native-demo-workflow.test.tsx tests/ui/mvp-workflow.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/web/pages/projects-page.tsx src/web/pages/search-page.tsx src/web/pages/library-page.tsx src/web/pages/notebooks-page.tsx src/web/pages/ai-workspace-page.tsx src/web/styles/app.css tests/ui/workbench-chrome.test.tsx tests/ui/native-demo-workflow.test.tsx tests/ui/mvp-workflow.test.tsx
git commit -m "refactor: normalize shell grammar across primary routes"
```

---

### Task 5: Align docs and verify the shell finish pass end-to-end

**Files:**
- Modify: `docs/runbooks/native-demo-showcase.md`
- Modify: `docs/plans/2026-03-26-jixia-ide-classic-lite-shell-design.md`
- Modify: `docs/plans/2026-03-26-jixia-ide-classic-lite-shell-implementation.md`
- Modify: `docs/plans/2026-03-26-jixia-shell-decard-consistency-finish-implementation.md`
- Modify: `tests/ui/research-workbench-shell.test.tsx`
- Modify: `tests/ui/workbench-navigation.test.tsx`
- Modify: `tests/ui/workbench-chrome.test.tsx`

**Step 1: Update docs to reflect the finish-pass target**

Document that the shell primitives landed first, and this finish pass closes the remaining card/dashboard drift on the primary workbench routes.

**Step 2: Run focused verification**

Run: `npm test -- tests/ui/research-workbench-shell.test.tsx tests/ui/workbench-navigation.test.tsx tests/ui/workbench-chrome.test.tsx tests/ui/home-page.test.tsx tests/ui/paper-workspace.test.tsx tests/ui/native-demo-workflow.test.tsx tests/ui/mvp-workflow.test.tsx`

Expected: PASS.

**Step 3: Run full verification**

Run: `npm test`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

**Step 4: Commit**

```bash
git add docs/runbooks/native-demo-showcase.md docs/plans/2026-03-26-jixia-ide-classic-lite-shell-design.md docs/plans/2026-03-26-jixia-ide-classic-lite-shell-implementation.md docs/plans/2026-03-26-jixia-shell-decard-consistency-finish-implementation.md tests/ui/research-workbench-shell.test.tsx tests/ui/workbench-navigation.test.tsx tests/ui/workbench-chrome.test.tsx tests/ui/home-page.test.tsx tests/ui/paper-workspace.test.tsx tests/ui/native-demo-workflow.test.tsx tests/ui/mvp-workflow.test.tsx
git commit -m "docs: align shell finish pass with de-carded routes"
```

---

## Final acceptance gate for this finish pass

Do **not** consider this shell phase complete until all of the following are true in one fresh runtime:

1. `/projects` shows the correct open-view strip state and no longer falls back to `Home`
2. `Home` no longer reads as a dashboard of bordered cards
3. `Reader` no longer reads as stacked boxed panels
4. `Home`, `Projects`, `Search`, `Library`, `Notebooks`, and `AI` all feel like one workbench shell rather than a mix of old page cards and new shell chrome
5. the center canvas reads as the dominant work area on a `1440px` viewport
6. `npm test`, `npm run typecheck`, and `npm run build` all pass

When those gates pass, the shell-only phase is ready for broader human review. Until then, keep the scope narrow and finish the shell before reopening any deeper redesign work.
