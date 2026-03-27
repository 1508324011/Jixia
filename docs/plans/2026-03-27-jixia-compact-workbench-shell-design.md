# Jixia Compact Workbench Shell Design

**Goal:** Correct the current Jixia workbench shell so it behaves like a compact ResearchClaw / VSCode-style tool rather than a persistent shell wrapped around repeated page-level cards, explanations, and duplicate navigation.

## Implemented status

As of `2026-03-27`, this compact-shell pass is implemented on `demo-native-showcase`.

The shipped branch now applies the compact-shell rules across the live shell primitives and primary workbench routes:

- `Activity Rail` is the only global mode switcher
- the second column is a route-aware contextual sidebar instead of a repeated top-level nav list
- the open-view strip is reduced to compact route pills without explanatory eyebrow/summary copy
- the right rail is conditional and no longer defaults to `RecentOpenedPanel`
- `Home`, `Projects`, `Search`, `Library`, `Notebooks`, `AI`, and `Reader` all use reduced route chrome instead of leading with large explanatory headers

The current source-of-truth implementation lives primarily in:

- `src/web/components/contextual-sidebar-content.tsx`
- `src/web/components/workbench-sidebar.tsx`
- `src/web/components/workbench-open-view-strip.tsx`
- `src/web/components/workbench-layout.tsx`
- `src/web/components/context-indicator.tsx`
- `src/web/pages/home-page.tsx`
- `src/web/pages/projects-page.tsx`
- `src/web/pages/search-page.tsx`
- `src/web/pages/library-page.tsx`
- `src/web/pages/notebooks-page.tsx`
- `src/web/pages/ai-workspace-page.tsx`
- `src/web/pages/reader-page.tsx`
- `src/web/styles/app.css`

## Why this design exists

The latest shell finish pass successfully landed the first IDE Classic Lite primitives:

- far-left `Activity Rail`
- `Compact Sidebar`
- `Open-view strip`
- center `editor-canvas` shell grammar
- quieter right-side inspector rail

Fresh live and source evidence shows the next problem is no longer missing shell primitives. The problem is **shell duplication**.

### Current duplication that breaks the compact workbench feel

#### 1. Left shell duplicates navigation instead of dividing responsibilities

Current code:

- `src/web/components/activity-rail.tsx`
- `src/web/components/sidebar-nav.tsx`
- `src/web/components/workbench-sidebar.tsx`

Problem:

- `Activity Rail` already switches between `Home / Projects / Search / Library / Notebooks / AI / Settings`
- the current compact sidebar repeats those same destinations again as full text links

This means the left side is using two layers to solve the same job. In a compact workbench, that is wrong.

#### 2. Pages still explain themselves too much

Current code shows `page-header`, `page-title`, and `page-description` repeated across primary routes:

- `src/web/pages/home-page.tsx`
- `src/web/pages/projects-page.tsx`
- `src/web/pages/search-page.tsx`
- `src/web/pages/library-page.tsx`
- `src/web/pages/notebooks-page.tsx`
- `src/web/pages/ai-workspace-page.tsx`
- `src/web/pages/reader-page.tsx`

Problem:

- the shell already tells the user where they are
- the page body should now behave like a tool surface
- repeated title/explainer blocks make every route feel like a self-contained page instead of part of one workbench

#### 3. The right rail still contains filler UI

Current code:

- `src/web/components/context-indicator.tsx`
- `src/web/components/recent-opened-panel.tsx`
- `src/web/components/workbench-layout.tsx`

Problem:

- the right rail is still always occupied by a context block plus `RecentOpenedPanel`
- the content often duplicates what the center page already shows
- `RecentOpenedPanel` is especially weak as default chrome because it repeats resume/recent info already available elsewhere

This makes the shell feel busy rather than concise.

#### 4. The open-view strip is useful, but still too explanatory

Current code:

- `src/web/components/workbench-open-view-strip.tsx`

Problem:

- it still includes explanatory eyebrow + summary copy
- a compact workbench tab/open-view strip should act like a tool, not a mini documentation card

## Correct shell principle

The compact shell must follow this rule:

> **Navigation belongs to the shell. Context belongs to the active mode. Explanations belong only where the user is blocked.**

That means:

- no repeated page-level navigation cards
- no repeated shell explanations in every area
- no permanent filler side rails
- no verbose page intros on every route

## The corrected shell model

### 1. Keep the Activity Rail

Keep the far-left `Activity Rail` as the **only global mode switcher**.

It should remain narrow and stable.

Responsibilities:

- global mode switching
- shell identity
- stable spatial orientation

It should **not** be duplicated by another full navigation block beside it.

### 2. Replace the current text-navigation sidebar with a contextual sidebar

The current `SidebarNav` pattern is wrong because it simply repeats global navigation.

The replacement should be a **contextual sidebar**, whose content changes by current mode.

Examples:

- `Projects` → project list / project tree / saved workspaces
- `Search` → search history / source scopes / saved filters
- `Library` → shelf scopes / visibility slices / saved views
- `Notebooks` → notebook list / recent notebooks
- `AI` → session list
- `Home` → recent workspace surfaces (if needed)

This preserves two left columns, but each one now has a distinct job.

### 3. Keep the open-view strip, but compress it

The `Open-view strip` is worth keeping because it gives route continuity.

But it should be compressed into a tighter workbench primitive:

- remove eyebrow + explanatory summary
- keep only the view tabs / pills themselves
- keep it visually subordinate to the main canvas

It should read like a tab strip, not a header card.

### 4. Make the center canvas dominant and quiet

The center should feel like a real work surface.

That requires:

- removing most repeated `page-header` patterns from primary routes
- reducing or deleting hero/explainer sections in Home and similar routes
- favoring small labels, subheaders, or breadcrumbs over full intro blocks
- keeping the user inside the active work surface as quickly as possible

### 5. Make the right rail conditional, not always filled

The right rail should survive only as a true **inspector / utility rail**.

That means:

- `RecentOpenedPanel` should be removed as the default right-rail content
- `ContextIndicator` should be compressed drastically or made conditional
- the right rail should appear only when a current mode truly benefits from auxiliary information

If no useful inspector content exists, the main canvas should expand and the right rail should disappear.

## What this design explicitly deletes

1. duplicate navigation between `Activity Rail` and `SidebarNav`
2. persistent default `RecentOpenedPanel`
3. oversized route intros on primary workbench routes
4. shell self-explanation such as `IDE Classic Lite` summaries and `Open views` help text
5. page-body wayfinding that repeats shell orientation

## What this design explicitly keeps

1. far-left global mode switching
2. route-backed open-view continuity
3. a contextual second column when it serves the active mode
4. a main center canvas as the dominant work surface
5. an optional auxiliary/inspector rail only when it adds real value

## What this is not

This is **not** another broader redesign of notebook, reader, AI, or Search/Library semantics.

It is a shell compaction and chrome discipline pass.

The purpose is to stop the app from looking like:

> workbench shell + repeated page cards + repeated nav + filler side rail

and make it look like:

> one compact research tool with stable chrome and mode-specific content.

## Acceptance criteria for this design

This design is successful when:

1. global navigation appears only once, in the `Activity Rail`
2. the second left column is contextual, not repetitive
3. the open-view strip is compact and tool-like
4. primary routes no longer waste vertical space on large explanatory headers
5. the right rail is either conditional or minimal enough that it no longer feels like a default filler column
6. `Home`, `Projects`, `Search`, `Library`, `Notebooks`, `AI`, and `Reader` all feel like views inside one compact workbench, not standalone page cards
