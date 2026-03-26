# Jixia IDE Classic Lite Shell Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the current Jixia card-page shell into an IDE Classic Lite workbench shell using an Activity Rail, Compact Sidebar, wider center canvas, lightweight open-view strip, and quieter right inspector rail.

**Architecture:** Preserve the existing route graph and product semantics, but change the global frame around them. The implementation should treat shell chrome and route presentation as the only phase-one scope, so later Reader/Search/Library redesigns inherit a real workbench shell instead of centered card pages.

**Tech Stack:** React, React Router, TypeScript, Vite, Vitest, current `src/web` shell/components/styles, and existing workbench tests in `tests/ui`.

---

## Phase-one rules

This plan intentionally does **not** redesign notebook, AI, reader semantics, or Search/Library data behavior.

This plan only implements the shell primitives approved during design:

1. Activity Rail + Compact Sidebar
2. Wider de-carded center canvas
3. Lightweight top open-view strip
4. Quieter right inspector rail

---

### Task 1: Lock the shell-only contract with failing tests

**Files:**
- Modify: `tests/ui/research-workbench-shell.test.tsx`
- Modify: `tests/ui/workbench-navigation.test.tsx`
- Create: `tests/ui/workbench-chrome.test.tsx`

**Step 1: Write the failing tests**

```tsx
it('renders a dedicated activity rail and compact sidebar instead of a single nav card', () => {
  renderWorkbench('/home');

  expect(screen.getByTestId('workbench-activity-rail')).toBeInTheDocument();
  expect(screen.getByTestId('workbench-compact-sidebar')).toBeInTheDocument();
});

it('renders a lightweight open-view strip above the main workspace canvas', () => {
  renderWorkbench('/projects');

  expect(screen.getByTestId('workbench-open-view-strip')).toBeInTheDocument();
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/ui/research-workbench-shell.test.tsx tests/ui/workbench-navigation.test.tsx tests/ui/workbench-chrome.test.tsx`

Expected: FAIL because the current shell only exposes a single left rail nav card and has no open-view strip.

**Step 3: Write minimal implementation**

Do not change product semantics. Only tighten the shell contract through test expectations for:

- dedicated activity rail
- compact sidebar
- open-view strip
- supporting inspector rail behavior

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/ui/research-workbench-shell.test.tsx tests/ui/workbench-navigation.test.tsx tests/ui/workbench-chrome.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add tests/ui/research-workbench-shell.test.tsx tests/ui/workbench-navigation.test.tsx tests/ui/workbench-chrome.test.tsx
git commit -m "test: lock ide classic lite shell contract"
```

---

### Task 2: Split the current left rail into Activity Rail + Compact Sidebar

**Files:**
- Create: `src/web/components/activity-rail.tsx`
- Create: `src/web/components/workbench-sidebar.tsx`
- Modify: `src/web/components/workbench-layout.tsx`
- Modify: `src/web/components/sidebar-nav.tsx`
- Modify: `src/web/router.tsx`
- Modify: `src/web/styles/app.css`
- Test: `tests/ui/research-workbench-shell.test.tsx`
- Test: `tests/ui/workbench-navigation.test.tsx`

**Step 1: Write the failing test for shell split**

```tsx
it('renders top-level modes in the activity rail and mode-local content in the compact sidebar', () => {
  renderWorkbench('/search');

  expect(screen.getByTestId('workbench-activity-rail')).toHaveTextContent('Search');
  expect(screen.getByTestId('workbench-compact-sidebar')).toBeInTheDocument();
});
```

**Step 2: Run the targeted tests and confirm failure**

Run: `npm test -- tests/ui/research-workbench-shell.test.tsx tests/ui/workbench-navigation.test.tsx`

Expected: FAIL because the current shell still renders one large sidebar card.

**Step 3: Implement the minimal shell split**

Create:

- a narrow persistent icon-led Activity Rail
- a Compact Sidebar responsible for current mode context

Keep current routes, labels, and navigation meaning intact. This phase is shell-only.

**Step 4: Run the targeted tests and confirm pass**

Run: `npm test -- tests/ui/research-workbench-shell.test.tsx tests/ui/workbench-navigation.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/web/components/activity-rail.tsx src/web/components/workbench-sidebar.tsx src/web/components/workbench-layout.tsx src/web/components/sidebar-nav.tsx src/web/router.tsx src/web/styles/app.css tests/ui/research-workbench-shell.test.tsx tests/ui/workbench-navigation.test.tsx
git commit -m "refactor: split workbench nav into activity rail and sidebar"
```

---

### Task 3: Add the lightweight open-view strip

**Files:**
- Create: `src/web/components/workbench-open-view-strip.tsx`
- Create: `src/web/lib/workbench-view-state.ts`
- Modify: `src/web/components/workbench-layout.tsx`
- Modify: `src/web/router.tsx`
- Test: `tests/ui/workbench-chrome.test.tsx`
- Test: `tests/ui/workbench-navigation.test.tsx`

**Step 1: Write the failing tests**

```tsx
it('keeps a route-backed open-view strip visible while switching major workbench surfaces', async () => {
  renderWorkbench('/home');

  expect(screen.getByTestId('workbench-open-view-strip')).toBeInTheDocument();
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/ui/workbench-chrome.test.tsx tests/ui/workbench-navigation.test.tsx`

Expected: FAIL because there is currently no open-view strip.

**Step 3: Implement the minimal open-view strip**

Introduce a lightweight, route-backed open-view strip that:

- stays visible above the main workspace
- reflects the current major route/view
- creates continuity across mode switches

Do not implement a full draggable IDE tab manager in this phase.

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/ui/workbench-chrome.test.tsx tests/ui/workbench-navigation.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/web/components/workbench-open-view-strip.tsx src/web/lib/workbench-view-state.ts src/web/components/workbench-layout.tsx src/web/router.tsx tests/ui/workbench-chrome.test.tsx tests/ui/workbench-navigation.test.tsx
git commit -m "feat: add lightweight open view strip"
```

---

### Task 4: Reclaim the center canvas and demote the right rail

**Files:**
- Modify: `src/web/styles/app.css`
- Modify: `src/web/components/workbench-layout.tsx`
- Modify: `src/web/components/context-indicator.tsx`
- Modify: `src/web/components/recent-opened-panel.tsx`
- Test: `tests/ui/research-workbench-shell.test.tsx`
- Test: `tests/ui/workbench-chrome.test.tsx`

**Step 1: Write the failing tests**

```tsx
it('treats the right rail as a supporting inspector instead of a co-equal main column', () => {
  renderWorkbench('/reader');

  expect(screen.getByTestId('workbench-context-rail')).toHaveAttribute('data-rail-variant', 'inspector');
});

it('renders workbench pages without the centered floating page-shell feel', () => {
  renderWorkbench('/home');

  expect(screen.getByTestId('workbench-main-surface')).toHaveAttribute('data-layout-mode', 'editor-canvas');
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/ui/research-workbench-shell.test.tsx tests/ui/workbench-chrome.test.tsx`

Expected: FAIL because the main surface is still visually framed by `page-shell` conventions and the context rail is only marked as a generic supporting surface.

**Step 3: Implement the minimal shell rebalance**

Change shell presentation only:

- widen the center canvas
- reduce page-card framing in main workbench routes
- soften and narrow the inspector rail
- preserve the underlying route/content model

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/ui/research-workbench-shell.test.tsx tests/ui/workbench-chrome.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/web/styles/app.css src/web/components/workbench-layout.tsx src/web/components/context-indicator.tsx src/web/components/recent-opened-panel.tsx tests/ui/research-workbench-shell.test.tsx tests/ui/workbench-chrome.test.tsx
git commit -m "style: rebalance main canvas and inspector rail"
```

---

### Task 5: Normalize route-level shell templates for major surfaces

**Files:**
- Modify: `src/web/pages/home-page.tsx`
- Modify: `src/web/pages/projects-page.tsx`
- Modify: `src/web/pages/search-page.tsx`
- Modify: `src/web/pages/library-page.tsx`
- Modify: `src/web/pages/reader-page.tsx`
- Modify: `src/web/pages/ai-workspace-page.tsx`
- Modify: `src/web/styles/app.css`
- Test: `tests/ui/native-demo-workflow.test.tsx`
- Test: `tests/ui/mvp-workflow.test.tsx`
- Test: `tests/ui/workbench-chrome.test.tsx`

**Step 1: Write the failing tests**

```tsx
it('keeps major workbench routes inside the same shell grammar rather than route-specific card stacks', async () => {
  renderWorkbench('/home');

  expect(screen.getByTestId('workbench-main-surface')).toBeInTheDocument();
});
```

**Step 2: Run the route-level shell tests and confirm failure**

Run: `npm test -- tests/ui/native-demo-workflow.test.tsx tests/ui/mvp-workflow.test.tsx tests/ui/workbench-chrome.test.tsx`

Expected: FAIL or expose mismatches because major routes still apply route-local card stacks and page-shell framing differently.

**Step 3: Implement minimal normalization**

Normalize shell-level page presentation across:

- Home
- Projects
- Search
- Library
- Reader
- AI

Do not redesign their product semantics. Only enforce the approved workbench shell grammar.

**Step 4: Run the route-level shell tests and confirm pass**

Run: `npm test -- tests/ui/native-demo-workflow.test.tsx tests/ui/mvp-workflow.test.tsx tests/ui/workbench-chrome.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/web/pages/home-page.tsx src/web/pages/projects-page.tsx src/web/pages/search-page.tsx src/web/pages/library-page.tsx src/web/pages/reader-page.tsx src/web/pages/ai-workspace-page.tsx src/web/styles/app.css tests/ui/native-demo-workflow.test.tsx tests/ui/mvp-workflow.test.tsx tests/ui/workbench-chrome.test.tsx
git commit -m "refactor: normalize ide classic lite shell across main routes"
```

---

### Task 6: Align docs and verify the shell-only phase end to end

**Files:**
- Modify: `docs/runbooks/native-demo-showcase.md`
- Modify: `docs/plans/2026-03-25-jixia-researchclaw-web-redesign-design.md`
- Modify: `docs/plans/2026-03-25-jixia-researchclaw-web-redesign-implementation.md`
- Modify: `docs/plans/2026-03-26-jixia-ide-classic-lite-shell-design.md`
- Test: `tests/ui/research-workbench-shell.test.tsx`
- Test: `tests/ui/workbench-navigation.test.tsx`
- Test: `tests/ui/workbench-chrome.test.tsx`

**Step 1: Write the final shell-phase checklist into docs/tests**

Document that phase one proves shell/UI-only change, not product-model change.

**Step 2: Run the focused UI verification**

Run: `npm test -- tests/ui/research-workbench-shell.test.tsx tests/ui/workbench-navigation.test.tsx tests/ui/workbench-chrome.test.tsx tests/ui/native-demo-workflow.test.tsx tests/ui/mvp-workflow.test.tsx`

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
git add docs/runbooks/native-demo-showcase.md docs/plans/2026-03-25-jixia-researchclaw-web-redesign-design.md docs/plans/2026-03-25-jixia-researchclaw-web-redesign-implementation.md docs/plans/2026-03-26-jixia-ide-classic-lite-shell-design.md tests/ui/research-workbench-shell.test.tsx tests/ui/workbench-navigation.test.tsx tests/ui/workbench-chrome.test.tsx tests/ui/native-demo-workflow.test.tsx tests/ui/mvp-workflow.test.tsx
git commit -m "docs: align shell-only workbench phase"
```

---

## Final acceptance gate for this phase

Do **not** consider this phase complete until all of the following are true:

1. The left side reads as **Activity Rail + Compact Sidebar**, not one large nav card
2. Main workbench routes no longer feel like centered floating `page-shell` cards
3. The center canvas is the clear dominant surface
4. A lightweight top open-view strip is visible and creates route continuity
5. The right rail feels like an inspector/support surface, not a co-equal main column
6. `Home`, `Projects`, `Search`, `Library`, `Reader`, and `AI` all visibly feel like the same workbench shell
7. `npm test`, `npm run typecheck`, and `npm run build` all pass

If those conditions are not met, continue iterating on the shell phase before starting page-specific redesign work.
