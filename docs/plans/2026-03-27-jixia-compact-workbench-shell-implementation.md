# Jixia Compact Workbench Shell Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove duplicated navigation, reduce explanatory chrome, and compress the current Jixia shell into a true compact ResearchClaw / VSCode-style workbench without reopening broader product redesign scope.

**Architecture:** Keep the already-landed shell primitives — Activity Rail, open-view strip, center canvas, and optional right rail — but change their responsibilities. The left rail remains the only global mode switcher, the second column becomes contextual rather than repetitive, the open-view strip becomes denser, and the right rail becomes conditional instead of always filled by recent/opened cards.

## Implemented status

As of `2026-03-27`, this compact-shell implementation is shipped on `demo-native-showcase`.

The implemented branch now includes:

- a route-aware `workbench-contextual-sidebar` instead of repeated top-level text navigation in the second column
- a compressed open-view strip with only the route pills, not shell explainer copy
- a conditional right rail that renders only when the route has real inspector content
- reduced page-level chrome across `Home`, `Projects`, `Search`, `Library`, `Notebooks`, `AI`, and `Reader`
- updated shell-contract and workflow tests proving the compact-shell rules end-to-end

The task list below remains the execution record for how this compact-shell phase was delivered.

**Tech Stack:** React, React Router, TypeScript, Vite, Vitest, current `src/web` shell/components/styles, and current shell/workbench tests in `tests/ui`.

---

## Scope lock

### In scope

1. replace repeated text-navigation sidebar with contextual sidebar behavior
2. compress the open-view strip into a true workbench primitive
3. remove or drastically weaken large page-header / explainer chrome on primary routes
4. remove `RecentOpenedPanel` as default right-rail filler
5. make the right rail conditional or minimal by default

### Out of scope

- notebook semantics
- AI workspace semantics
- reader workflow semantics
- search/library backend or ranking logic
- document ownership or project boundaries
- new docking system / status bar / bottom panel / advanced IDE framework

---

### Task 1: Lock the compact-shell contract with failing tests

**Files:**
- Modify: `tests/ui/workbench-chrome.test.tsx`
- Modify: `tests/ui/workbench-navigation.test.tsx`
- Create: `tests/ui/compact-workbench-shell.test.tsx`

**Step 1: Write the failing tests**

```tsx
it('does not duplicate top-level workbench navigation inside the contextual sidebar', () => {
  renderWorkbench('/projects');

  expect(screen.queryByRole('link', { name: 'Home' })).not.toBeInTheDocument();
});

it('does not render recent-opened filler cards in the default compact shell', () => {
  renderWorkbench('/home');

  expect(screen.queryByText('最近打开')).not.toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/workbench-chrome.test.tsx tests/ui/workbench-navigation.test.tsx tests/ui/compact-workbench-shell.test.tsx`

Expected: FAIL because the current shell still repeats global nav in `SidebarNav` and still renders `RecentOpenedPanel` by default.

**Step 3: Write minimal implementation**

Do not change product semantics. Only lock the new shell contract in tests:

- one global nav source
- contextual second column
- no default recent-opened filler rail
- compressed chrome across primary views

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/workbench-chrome.test.tsx tests/ui/workbench-navigation.test.tsx tests/ui/compact-workbench-shell.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add tests/ui/workbench-chrome.test.tsx tests/ui/workbench-navigation.test.tsx tests/ui/compact-workbench-shell.test.tsx
git commit -m "test: lock compact workbench shell contract"
```

---

### Task 2: Replace repeated text navigation with a contextual sidebar

**Files:**
- Modify: `src/web/components/workbench-sidebar.tsx`
- Modify: `src/web/components/sidebar-nav.tsx`
- Create: `src/web/components/contextual-sidebar-content.tsx`
- Modify: `src/web/components/activity-rail.tsx`
- Modify: `src/web/styles/app.css`
- Test: `tests/ui/workbench-navigation.test.tsx`
- Test: `tests/ui/compact-workbench-shell.test.tsx`

**Step 1: Write the failing tests**

```tsx
it('renders mode-specific contextual content in the second column instead of repeating global links', () => {
  renderWorkbench('/search');

  expect(screen.getByTestId('workbench-contextual-sidebar')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Projects' })).not.toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/workbench-navigation.test.tsx tests/ui/compact-workbench-shell.test.tsx`

Expected: FAIL because `WorkbenchSidebar` still wraps `SidebarNav compact`, which repeats global navigation.

**Step 3: Write minimal implementation**

Replace the current repeated text-nav sidebar with contextual content keyed to the current mode.

Examples of acceptable first-pass contextual content:

- `Projects`: project list / shortcuts
- `Search`: saved scopes / query history
- `Library`: shelf filters / slices
- `Notebooks`: notebook list
- `AI`: session list
- `Home`: recent work surfaces

The important part is the responsibility split, not a perfect information model.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/workbench-navigation.test.tsx tests/ui/compact-workbench-shell.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/web/components/workbench-sidebar.tsx src/web/components/sidebar-nav.tsx src/web/components/contextual-sidebar-content.tsx src/web/components/activity-rail.tsx src/web/styles/app.css tests/ui/workbench-navigation.test.tsx tests/ui/compact-workbench-shell.test.tsx
git commit -m "refactor: turn second column into contextual sidebar"
```

---

### Task 3: Compress the open-view strip and remove shell self-explanation

**Files:**
- Modify: `src/web/components/workbench-open-view-strip.tsx`
- Modify: `src/web/components/workbench-sidebar.tsx`
- Modify: `src/web/styles/app.css`
- Test: `tests/ui/workbench-chrome.test.tsx`

**Step 1: Write the failing tests**

```tsx
it('renders the open-view strip without explanatory summary copy', () => {
  renderWorkbench('/library');

  expect(screen.queryByText(/surface the current lane/i)).not.toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/workbench-chrome.test.tsx`

Expected: FAIL because the strip still renders eyebrow + summary copy, and the sidebar still explains `IDE Classic Lite` in prose.

**Step 3: Write minimal implementation**

Compress shell chrome:

- strip explanatory summary from `WorkbenchOpenViewStrip`
- remove `IDE Classic Lite` explainer block from `WorkbenchSidebar`
- keep only compact structural labels where absolutely needed

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/workbench-chrome.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/web/components/workbench-open-view-strip.tsx src/web/components/workbench-sidebar.tsx src/web/styles/app.css tests/ui/workbench-chrome.test.tsx
git commit -m "style: compress shell chrome and open view strip"
```

---

### Task 4: Remove default right-rail filler and make inspector content conditional

**Files:**
- Modify: `src/web/components/workbench-layout.tsx`
- Modify: `src/web/components/context-indicator.tsx`
- Modify: `src/web/components/recent-opened-panel.tsx`
- Modify: `src/web/styles/app.css`
- Test: `tests/ui/workbench-chrome.test.tsx`
- Test: `tests/ui/compact-workbench-shell.test.tsx`

**Step 1: Write the failing tests**

```tsx
it('does not render RecentOpenedPanel as default right-rail chrome on primary routes', () => {
  renderWorkbench('/home');

  expect(screen.queryByLabelText('recent opened')).not.toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/workbench-chrome.test.tsx tests/ui/compact-workbench-shell.test.tsx`

Expected: FAIL because `WorkbenchLayout` still mounts `RecentOpenedPanel` unconditionally.

**Step 3: Write minimal implementation**

Turn the right rail into a real inspector:

- remove unconditional `RecentOpenedPanel`
- render inspector content only when the current route truly needs it
- compress `ContextIndicator` into minimal state/action chrome instead of a mini explainer card

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/workbench-chrome.test.tsx tests/ui/compact-workbench-shell.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/web/components/workbench-layout.tsx src/web/components/context-indicator.tsx src/web/components/recent-opened-panel.tsx src/web/styles/app.css tests/ui/workbench-chrome.test.tsx tests/ui/compact-workbench-shell.test.tsx
git commit -m "refactor: make right rail conditional and non-duplicative"
```

---

### Task 5: Reduce page-level explanatory chrome across primary routes

**Files:**
- Modify: `src/web/pages/home-page.tsx`
- Modify: `src/web/pages/projects-page.tsx`
- Modify: `src/web/pages/search-page.tsx`
- Modify: `src/web/pages/library-page.tsx`
- Modify: `src/web/pages/notebooks-page.tsx`
- Modify: `src/web/pages/ai-workspace-page.tsx`
- Modify: `src/web/pages/reader-page.tsx`
- Modify: `src/web/styles/app.css`
- Test: `tests/ui/home-page.test.tsx`
- Test: `tests/ui/workbench-chrome.test.tsx`
- Test: `tests/ui/native-demo-workflow.test.tsx`

**Step 1: Write the failing tests**

```tsx
it('keeps primary routes concise instead of leading with large explanatory page headers', () => {
  renderWorkbench('/search');

  expect(screen.queryByText(/search across the current discovery sources/i)).not.toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/home-page.test.tsx tests/ui/workbench-chrome.test.tsx tests/ui/native-demo-workflow.test.tsx`

Expected: FAIL because primary routes still render large `page-header` and `page-description` blocks.

**Step 3: Write minimal implementation**

Reduce route-level chrome on primary workbench surfaces:

- keep only minimal labels, breadcrumbs, or compact section headings
- remove large explanatory paragraphs and route-intro duplication
- preserve necessary action affordances, but stop explaining the page where the shell already explains the mode

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/home-page.test.tsx tests/ui/workbench-chrome.test.tsx tests/ui/native-demo-workflow.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/web/pages/home-page.tsx src/web/pages/projects-page.tsx src/web/pages/search-page.tsx src/web/pages/library-page.tsx src/web/pages/notebooks-page.tsx src/web/pages/ai-workspace-page.tsx src/web/pages/reader-page.tsx src/web/styles/app.css tests/ui/home-page.test.tsx tests/ui/workbench-chrome.test.tsx tests/ui/native-demo-workflow.test.tsx
git commit -m "style: reduce page chrome across primary routes"
```

---

### Task 6: Align docs and verify the compact workbench shell end-to-end

**Files:**
- Modify: `docs/runbooks/native-demo-showcase.md`
- Modify: `docs/plans/2026-03-27-jixia-compact-workbench-shell-design.md`
- Modify: `docs/plans/2026-03-27-jixia-compact-workbench-shell-implementation.md`
- Modify: `tests/ui/research-workbench-shell.test.tsx`
- Modify: `tests/ui/workbench-navigation.test.tsx`
- Modify: `tests/ui/workbench-chrome.test.tsx`
- Modify: `tests/ui/compact-workbench-shell.test.tsx`

**Step 1: Update docs to match the corrected compact-shell rules**

Document that shell compactness now depends on:

- one global nav source
- contextual second column
- compressed open-view strip
- conditional right inspector
- reduced page-level explanatory chrome

**Step 2: Run focused verification**

Run: `npm test -- tests/ui/research-workbench-shell.test.tsx tests/ui/workbench-navigation.test.tsx tests/ui/workbench-chrome.test.tsx tests/ui/compact-workbench-shell.test.tsx tests/ui/home-page.test.tsx tests/ui/native-demo-workflow.test.tsx`

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
git add docs/runbooks/native-demo-showcase.md docs/plans/2026-03-27-jixia-compact-workbench-shell-design.md docs/plans/2026-03-27-jixia-compact-workbench-shell-implementation.md tests/ui/research-workbench-shell.test.tsx tests/ui/workbench-navigation.test.tsx tests/ui/workbench-chrome.test.tsx tests/ui/compact-workbench-shell.test.tsx tests/ui/home-page.test.tsx tests/ui/native-demo-workflow.test.tsx
git commit -m "docs: align compact workbench shell rules"
```

---

## Final acceptance gate for this phase

Do **not** consider this compact-shell phase complete until all of the following are true:

1. global mode switching appears only in the `Activity Rail`
2. the second left column is contextual and no longer repeats the top-level route list
3. the open-view strip is compact and tool-like
4. the right rail is conditional or minimal and no longer defaults to `RecentOpenedPanel`
5. primary routes no longer lead with large explanatory page headers and filler copy
6. the app reads as one compact workbench rather than a shell plus repeated page-level navigation
7. `npm test`, `npm run typecheck`, and `npm run build` all pass

If those gates are not met, keep working at the shell/chrome level before reopening any larger redesign discussion.
