# Jixia Design Contract

This file records the interface already established by the Jixia research
workbench. New surfaces extend this system; they do not introduce a parallel
visual language.

## 1. Atmosphere and identity

Jixia is an operational research workspace: quiet, evidence-led, and designed
for repeated professional use. The interface should feel like a well-organized
lab desk rather than a marketing site. Information density is welcome when
hierarchy, alignment, and scan paths remain clear.

- The warm navigation rail is stable workspace chrome.
- The cool white work area is where reading, comparison, and action happen.
- Teal marks focus, selection, and primary commands; it is not decoration.
- Literature records are evidence rows and panes, never promotional cards.
- UI copy names the object, state, or command. It does not explain the UI.

## 2. Color

Use the tokens defined in `apps/web/src/features/layout/workbench.css`.

- Canvas: white; workspace: cool off-white (`#fbfcfd`).
- Navigation chrome: warm beige (`#efebe2` and `#ebe8df`).
- Primary ink: near-black blue (`#17212b` and `#10202a`).
- Muted text: `#65717d` or the matching existing token.
- Accent and focus: teal (`#0f7180` / `#087f8c`).
- Dividers: cool `#dbe5ed` in work areas and warm `#ded8cd` in navigation.
- Use existing semantic info, success, warning, and danger tokens for status.
- Do not introduce gradients, decorative color fields, or a second accent.

Every text and icon color must retain WCAG AA contrast in its rendered state.
Color never carries provider, import, conflict, or selection meaning alone;
pair it with text, an icon, structure, or an accessible name.

## 3. Typography

Use the existing system font stack and workbench type tokens. Do not add a web
font. Body and control text stays compact and legible; headings reflect the
surface hierarchy rather than viewport size.

- Surface title: existing level-one workbench treatment.
- Pane title: compact 13-16px weight, never hero-sized.
- Body and controls: existing 12-13px tokens.
- Metadata: existing 11-12px tokens, with adequate contrast.
- Letter spacing is zero. Do not add negative tracking.
- Long titles, DOI values, provider record keys, and CJK text must wrap or
  truncate only where the full value remains available in the detail pane.

## 4. Spacing and layout

The spacing base is 4px. Prefer existing 4, 8, 12, 16, and 20px tokens. New
literature layouts must use the current `WorkbenchSurface`, `SurfaceHeader`,
`Pane`, `Panel`, `SplitPane`, `ListRow`, `Field`, `Button`, `Pill`, `Notice`,
`EmptyState`, and `StatusStrip` primitives where their semantics fit.

- Desktop detail views use a list/detail split with the existing 280-380px
  secondary-pane range; collapse to one column below the established breakpoint.
- Page sections are unframed layout regions. Do not nest cards or panels.
- Repeated literature items use bordered rows with clear selected state.
- Inputs and command groups keep a stable minimum control height of 44px.
- Every grid/flex child that may shrink uses `min-width: 0`; vertical scroll
  owners use `min-height: 0`.
- The shell owns viewport height. Feature pages use `100dvh` only when they
  truly own a viewport and otherwise inherit the shell; do not add `100vh`.
- At 375px there is no horizontal page scroll. Controls may wrap, and list and
  detail panes become a predictable vertical flow.
- Verify 375px, 768px, and 1280px widths with long English, CJK, DOI, provider
  key, warning, and project-name content.

## 5. Components, states, accessibility, and scroll ownership

Use Lucide icons already available in the application. Icon-only controls need
an accessible name and tooltip. Text buttons are reserved for clear commands.
Segmented controls are appropriate for personal/project scope; selects are used
for the project choice; status labels are not interactive pills.

Each asynchronous surface must represent these states explicitly:

- Initial: no request has been made and the next action is apparent.
- Loading: preserve stable dimensions and identify the operation to assistive
  technology without replacing the whole workspace.
- Empty: distinguish no query, no matches, and an empty library.
- Partial: show provider-level success and failure together; successful results
  remain usable.
- Error: state what failed and provide a retry only when the operation is safe.
- Success: show the resulting record or navigation action without relying on
  transient color alone.
- Import running: prevent duplicate intent while exposing progress.
- Import failed: retain the operation identity and offer explicit server retry.
- Import succeeded: expose the canonical literature destination.

Interactive elements need visible default, hover, focus-visible, active,
disabled, loading, success, and error states as applicable. Keyboard order must
follow the visual order. Search submission, target selection, result selection,
pagination, import, retry, and detail navigation must work without a pointer.

The application shell owns page scrolling. Within literature split views, only
the long result/list pane and long detail/provenance pane may become independent
scroll owners. Do not create nested scrolling inside individual rows, notices,
or panels. Changing scope, query, page, project, or record cancels obsolete
requests; stale responses must never replace current content.

## 6. Motion

Motion communicates state change only. Use existing CSS timing and easing where
present; otherwise keep transitions short and limited to color, opacity, and
small positional feedback. Do not animate layout dimensions or continuous
background decoration.

Honor `prefers-reduced-motion: reduce` by removing nonessential transitions and
all smooth scrolling. Loading state must remain understandable without motion.

## 7. Depth

Depth is structural, not decorative.

- Prefer borders, background shifts, and spacing over shadows.
- Use only the existing shallow workbench shadow for elevated overlays or a
  genuinely layered surface.
- Literature list rows, search results, provider statuses, and detail groups
  stay flat.
- Radius is 4px for controls and compact surfaces, 8px only where the existing
  workbench already uses it. No pill-shaped containers for ordinary text.

## 8. Accessibility and design debt

The target is WCAG 2.2 AA. All forms have programmatic labels; field errors are
associated with their fields; status updates use appropriate live regions;
focus is never removed; selected rows expose selection semantically. Provider
failures, conflicts, and provenance must be readable with color disabled.

Known legacy debt in the shared stylesheet includes some `100vh` use and
negative letter spacing outside the literature feature. Task 25 does not widen
that debt. New literature CSS stays in
`apps/web/src/features/literature/literature.css`, uses dynamic viewport units
only when necessary, and uses zero letter spacing. Any new exception must be
recorded in `.omo/frontend-design/state.md` with an owner and verification step.

The release gate for new literature UI is real browser use at 375px, 768px, and
1280px; keyboard-only completion of search and import; reduced-motion and CJK
content checks; no overlap or horizontal overflow; no console errors; and a
post-implementation visual and code review.
