# Task 24a Workbench Foundation and Responsive Geometry

## Goal

Establish the durable visual and responsive foundation for the complete Jixia workbench before adding new product domains. The authenticated shell, login surface, document editor split, and shared layout primitives must remain usable at mobile, compact desktop, and wide desktop widths while introducing the first Simplified Chinese and English UI-chrome boundary.

This is a frontend foundation task. It must not change API contracts, document persistence, AI execution, permissions, or object-storage behavior.

## Requirements

### Workbench shell

- Preserve the IDE-like activity rail, context sidebar, and workspace hierarchy on wide screens.
- Replace text glyphs used as navigation icons with a consistent icon treatment using the existing dependency set or a lightweight local semantic treatment; controls must retain accessible names and stable dimensions.
- Keep every primary surface reachable at all supported widths: Home, Search, Library, Projects, Notebook, AI, and Settings.
- At compact widths, collapse or transform secondary context without removing primary navigation. Horizontal navigation may scroll, but no item may be clipped or hidden behind fixed columns.
- Replace implementation-facing shell copy such as server/API/cookie mechanics with researcher-facing product language. Technical guarantees remain enforced and tested, not advertised as primary UI content.

### Responsive geometry

- Fix the document editor split that currently reserves `minmax(520px, 38vw)` for the inspector and collapses the writing canvas near 1100px.
- Give the artifact canvas and inspector explicit minimum usable widths and switch to a single-column or user-controlled overlay arrangement before either pane becomes unusable.
- Keep the document title, revision action, status information, editor, and Copilot reachable without incoherent overlap or horizontal page overflow.
- Make shared `WorkspaceMainSplit` and `SplitPane` rules robust for consumers beyond the document editor.
- Fix the login layout at 390px so the identity block, form, inputs, actions, and helper copy fit without overlap or horizontal scrolling.
- Use stable responsive constraints instead of viewport-scaled font sizes for compact panel and shell text.

### Localization foundation

- Add a typed English and Simplified Chinese locale catalog for global shell, navigation, login, and shared inspector labels.
- Default from the browser language when it is Chinese; otherwise default to English.
- Provide an accessible language switch on both authenticated and login surfaces without storing sensitive data or introducing a server preference contract in this task.
- Update `document.documentElement.lang` when the locale changes.
- Do not translate paper/source content or invent translation features.

### Product and safety boundaries

- Preserve existing routes and browser history behavior.
- Preserve server-authorized rendering, cookie-based API calls, document draft/revision separation, archived read-only state, conflict handling, private attachments, AI context controls, and AI no-writeback behavior.
- Do not reopen or repair archived Task 21f. Later provider work will use a new task and the accepted provider-capability direction recorded in `doc/Jixia_Implementation_Program.md`.
- Do not add Home, Search, Library, Reader, evidence, or citation persistence in this task.

## Acceptance Criteria

- [x] At 1366px and wider, the shell renders activity rail, context sidebar, and workspace with no horizontal page overflow.
- [x] At 1100px, an open Project or Notebook document retains a usable writing canvas and usable Copilot; neither pane is compressed below its documented minimum width.
- [x] At 390px, all primary navigation surfaces remain reachable and the active route remains visible.
- [x] At 390px, login heading, form fields, submit action, and helper copy fit within the viewport with no overlap or horizontal overflow.
- [x] Shared layout primitives expose responsive behavior without page-specific fixed-width hacks.
- [x] English and Simplified Chinese can be switched from login and authenticated shell surfaces, and `<html lang>` follows the active locale.
- [x] Navigation buttons retain accessible English or Chinese names and visible focus states.
- [x] Existing App, LoginPage, DocumentEditorPage, Notebook, Project, AI, attachment, and no-writeback tests remain green.
- [x] Playwright covers 390px, 1100px, and 1366px shell/document geometry with deterministic bounding-box and overflow assertions.
- [x] Web lint/typecheck and production build pass.

## Technical Notes

- Primary files: `apps/web/src/features/layout/AppShell.tsx`, `apps/web/src/features/layout/workbench.tsx`, `apps/web/src/features/layout/workbench.css`, `apps/web/src/features/auth/LoginPage.tsx`, `apps/web/src/features/documents/DocumentEditorPage.tsx`, and `apps/web/src/app/App.tsx`.
- Add a small typed locale module under `apps/web/src/features/i18n/`; do not add a heavy localization dependency for this bounded catalog.
- Prefer CSS custom properties and container/grid constraints. Avoid JavaScript viewport branching for core geometry.
- Add focused component tests plus a new Playwright responsive-workbench spec or equivalent coverage.

## Verification

```bash
pnpm --filter @jixia/web test
pnpm --filter @jixia/web lint
pnpm --filter @jixia/web build
pnpm --filter @jixia/web e2e -- responsive-workbench
```

## Manual Review Gate

After automated checks pass, inspect login, project document, notebook document, AI workspace, and settings at 390px, 1100px, and 1366px. The task may finish only after navigation reachability, text fit, pane balance, focus states, and bilingual shell quality are accepted.
