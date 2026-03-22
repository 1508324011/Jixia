# Jixia Task 10 UI Direction Notes

## Purpose

This note records the accepted Task 10 UI direction, the branch-local completion status,
and the handoff from the first scholarly web shell into the next delivery phase.

Task 10 was executed as a layered convergence pass rather than an open-ended visual exploration.
The goal was to freeze the interface temperament first and then land a test-backed
`Spaces -> Library -> Reader -> Writing` workflow shell inside the repository.

## Accepted direction

### Primary direction: `静水流深`

The accepted default language remains `静水流深`:

- calm rather than noisy
- editorial rather than dashboard-heavy
- warm and scholarly rather than retro or ornamental
- governance-visible without turning the product into an operator console

### Secondary structural reference: `书院序列`

`书院序列` remains useful only as a structural backup for grid discipline,
hierarchy, and information grouping. It is not the primary visual identity.

### Explicit rejection: `硅谷墨韵` as the default

`硅谷墨韵` may still inform later dark-mode or contrast studies,
but it is not the primary Task 10 shell language because it pushes the product
too close to generic technology-product aesthetics.

## What Task 10 delivered

Task 10 is complete on this branch as a first browser workflow shell.

Delivered files and capabilities include:

- `src/web/app.tsx` and `src/web/router.tsx`
- `src/web/lib/http-client.ts`
- `src/web/pages/spaces-page.tsx`
- `src/web/pages/library-page.tsx`
- `src/web/pages/reader-page.tsx`
- `src/web/pages/writing-page.tsx`
- `src/web/styles/tokens.css`
- `src/web/styles/app.css`
- `tests/ui/mvp-workflow.test.tsx`

The shell now expresses the confirmed mental model in both copy and routes:

- `Space -> Project -> Entry -> Doc`

It also keeps the required governance signals visible:

- visibility
- shared vs personal context
- publish state
- governed AI / job action cues

## Acceptance status against the plan

Task 10 acceptance criteria are satisfied on this branch:

1. Four page shells are navigable.
2. The pages share one minimal visual language.
3. Governance information is visible in the shell.
4. UI tests cover the minimal workflow and direct deep-link routes.
5. The branch passes test, typecheck, and build verification.

## Verification evidence

Latest verification run for the branch-local Task 10 state:

- `npm run typecheck` ✅
- `npm test` ✅ (`15` files / `41` tests)
- `npm run build` ✅

Notable implementation detail: the original Task 11 handoff list mentioned a future
`build` script, but Task 10 verification exposed that gap and the script was added
immediately so the web shell now produces a real Vite build artifact.

## Remaining boundaries

Task 10 delivers a verified shell, not a fully connected product frontend.
The current UI is appropriate for:

- interface review
- manual workflow walkthroughs
- validating page responsibilities and tone
- checking whether governance cues remain visible and calm

It is not yet the phase for claiming complete browser-side integration with live
library import, reading evidence persistence, or writing publication flows.

## Task 11 handoff

The next phase should focus on deployment and operator readiness.

### Next required work

1. Add Docker-first deployment scaffolding.
2. Add `.env.example` and environment guidance.
3. Expand operator-facing documentation in `README.md` and `README_CN.md`.
4. Make local/server startup paths explicit for contributors and lab operators.

### Why Task 11 comes next

The current shell is now stable enough that the next bottleneck is no longer page structure.
It is reproducibility, deployment clarity, and operator-facing setup documentation.

## Explicit non-goals still in force

- no retro Chinese motif pack
- no ornamental calligraphy UI
- no high-saturation "national style" styling
- no cold enterprise dashboard default
- no over-animated AI-product behavior

## Summary

Task 10 has been successfully converted from direction exploration into a branch-local,
test-backed scholarly web shell. The interface now reflects Jixia's intended temperament:
open, calm, rigorous, and collaborative. The next milestone is to make this shell easier to run,
review, and operate through Task 11 deployment scaffolding and operator docs.
