# Jixia IDE Classic Lite Shell Design

**Goal:** Rebuild the Jixia web shell so the product feels like a ResearchClaw / VSCode-style workbench instead of a stack of bordered cards, while deliberately avoiding deeper feature or product-model changes in this phase.

## Implemented status

As of `2026-03-26`, this phase-one shell is implemented on `demo-native-showcase`. The current source now ships the approved Activity Rail + Compact Sidebar split, a lightweight route-backed open-view strip, an `editor-canvas` main surface, and an inspector-style right rail through `src/web/components/workbench-layout.tsx`, `src/web/components/activity-rail.tsx`, `src/web/components/workbench-sidebar.tsx`, and `src/web/components/workbench-open-view-strip.tsx`. The analysis below remains the rationale for the design, but the shell is no longer only a proposal.

## Scope of this design

This design is intentionally narrow.

It does **not** redesign:

- notebook semantics
- AI workspace semantics
- Reader information architecture
- Search data model
- Library data model
- project/document ownership boundaries

It redesigns only one point:

> **UI display and interaction at the workbench shell level**

The target is the workbench feel the user described as either:

- **ResearchClaw-style**, or if that feels ambiguous,
- **VSCode-style**: compact sidebars, persistent shell, multi-page switching, one continuous workspace rather than a sequence of floating pages.

## Why the current UI still feels card-based

Fresh live and source evidence in `demo-native-showcase` shows the problem is primarily a shell/frame problem.

### Live evidence

On the fresh `3003` runtime:

- major routes still render at roughly **812px** main content width on a **1440px** viewport
- Home still reads like a resumption dashboard made of separate cards
- Reader still visually reads as stacked bordered panels even though its underlying surface model is now improved
- AI is the closest page to an actual workbench feel because it has fewer card-layer resets

### Source evidence

- `src/web/styles/app.css` still defines `.page-shell { max-width: 1120px; border; border-radius; box-shadow; padding; }`
- the app still uses `.panel`, `.panel-grid`, `.home-desk-card`, and similar boxed surface classes per route
- `src/web/components/workbench-layout.tsx` already provides a useful three-zone shell (`left rail / main / context rail`), but the route content inside it still behaves like floating page cards
- the right rail remains visually strong enough to feel like a third major column instead of a quieter utility inspector

This means the biggest mismatch is not "missing features". The mismatch is:

> **Workbench shell outside, card pages inside.**

## What the user approved for phase one

During the design discussion, the user explicitly narrowed the redesign to one point at a time and approved the following choices for phase one:

1. **Focus only on ResearchClaw / VSCode-style shell display and interaction**
2. Use **IDE Classic Lite** as the phase-one shell direction
3. The first visible primitive to introduce should be **Activity Rail + Compact Sidebar**

That means the first redesign phase is not trying to deliver a full IDE framework. It is trying to establish a convincing workbench shell.

## The three shell approaches that were considered

### 1. Shell Densification Lite

Only de-card pages, widen the center canvas, and tighten the current shell.

**Pros:** low risk, fast visual improvement.

**Cons:** still feels route-page driven; too weak to create a true VSCode-style workbench feel.

### 2. IDE Classic Lite — **Approved direction**

Introduce:

- compact activity-style left chrome
- compact contextual sidebar
- wider central canvas
- a lightweight tab/open-view strip
- a quieter right inspector rail

**Pros:** strongest workbench feel per unit of scope; enough to break the card-page illusion.

**Cons:** still stops short of full docking, multi-group tabs, bottom panels, and saved layouts.

### 3. Full Workbench Framework

Introduce a full VSCode-like shell immediately: activity bar, sidebar, tabs, panels, docking, resizers, status bar.

**Pros:** strongest resemblance to a real IDE.

**Cons:** too wide for the current scope and would repeat the earlier mistake of changing too much at once.

## Phase-one shell thesis

The phase-one shell should feel like:

> **Instrument panel, not card gallery.**

The user should feel they are staying inside one persistent research tool and switching modes inside it, not hopping between separate web pages.

## Approved shell structure

### 1. Activity Rail

The outermost left column becomes a narrow, persistent **Activity Rail**.

Responsibilities:

- top-level mode switching
- icon-led navigation for primary surfaces
- workbench identity anchor

Initial top-level destinations should remain aligned with current app routing:

- Home
- Projects
- Search
- Library
- Notebooks
- AI
- Settings

This rail is not a decorative card. It is persistent application chrome.

### 2. Compact Sidebar

The current large navigation card becomes a tighter, more workbench-like **Primary Sidebar**.

Responsibilities:

- context for the currently active mode
- short lists, quick filters, recent/open items, or mode-specific navigation
- compact density, not large page-card presentation

The visual rhythm should be:

- tighter rows
- less padding
- less rounded containment
- clear active state
- lower ornamental weight

### 3. Central Workspace Canvas

The center becomes the unquestioned dominant work area.

Responsibilities:

- host the active route/view
- behave like an editor/work surface rather than a centered document card
- occupy most of the width

Required changes:

- de-emphasize or remove the current `page-shell` framing in main workbench pages
- remove the feeling of a centered floating panel
- reduce the use of nested bordered boxes as the main page grammar

### 4. Right Inspector Rail

The current context rail should remain, but as a **supporting inspector** rather than a co-equal third page.

Responsibilities:

- contextual metadata
- recent/opened references
- lightweight actions or supporting status

The right rail should be:

- quieter
- narrower
- less boxed
- less visually dominant by default

## Page switching model

The user explicitly wants a workbench feel closer to VSCode / ResearchClaw. That requires page switching to feel different from ordinary route changes.

### Approved phase-one switching primitive

Introduce a **lightweight top open-view strip**.

This is not a full tab manager yet.

It should:

- show current/active workbench views
- create continuity across route changes
- make the user feel they are switching between open work surfaces rather than reloading pages

This strip should be minimal and route-backed in phase one.

It does **not** need to support:

- multi-group editor splits
- drag-and-drop tab reordering
- complex tab persistence rules

## Visual rules for phase one

### Keep

- the idea of a persistent left shell
- mode switching through navigation
- a multi-zone workbench layout

### Remove or weaken

- centered page-card feeling
- heavy shadows and rounded panel stacks as the dominant visual pattern
- large padded nav-card presentation
- the right rail feeling like another main page

### Introduce

- flatter surfaces
- tighter spacing rhythm
- stronger shell hierarchy
- obvious persistent chrome
- more direct route continuity

## What this phase will intentionally ignore

To avoid mixing concerns, this phase does **not** decide:

- how Reader should evolve semantically
- how Notebook should evolve semantically
- how AI and Reader should interact semantically
- how Search results should change structurally beyond shell fit
- how Library content density should change structurally beyond shell fit

Those are separate phases.

This phase only establishes the shell the later feature work will live inside.

## Acceptance criteria for the design

This shell-only phase succeeds when:

1. Jixia no longer feels like a sequence of bordered page cards inside a shell
2. The left chrome immediately reads as a workbench, not a page navigation card
3. The center becomes the obvious dominant workspace
4. Switching routes feels closer to switching workbench modes than opening unrelated pages
5. The right rail behaves like an inspector/support surface instead of a third major page column

## Consequence for planning

The next implementation plan for this phase should therefore focus on exactly four things:

1. Activity Rail + Compact Sidebar
2. Central canvas de-carding and width reclaim
3. Lightweight top open-view strip
4. Right inspector rail demotion

Nothing outside those four shell primitives should be treated as phase-one scope.
