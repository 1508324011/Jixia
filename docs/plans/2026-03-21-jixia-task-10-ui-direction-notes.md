# Jixia Task 10 UI Direction Notes

## Purpose

This note records the accepted Task 10 UI direction, the branch-local completion status,
and the handoff from the original scholarly browser shell into the newer workbench-first
interaction model.

Task 10 began as a layered convergence pass around the linear
`Spaces -> Library -> Reader -> Writing` walkthrough.
The current branch keeps that legacy flow only as a regression-guarded compatibility path.
The primary user-facing model is now a personal-dashboard-first workbench.

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

## Structural update after the March 23 interaction pass

The visual temperament did not change, but the primary interaction model did.
The shipped shell now centers the following responsibilities:

- `Login -> Home -> Today/Search/Library/Projects/Settings`
- `Personal vs Project 上下文` cues instead of exposing raw space language in every surface
- paper workspace panels for `AI 对话`, `私人笔记`, `共享评论`, and `关键信息`
- a project-level `Writer 文档区` for promoting mature reading output into formal writing
- shell HTTP endpoints for discovery and settings so the workbench has explicit server-facing boundaries

The old `Spaces -> Library -> Reader -> Writing` shell still exists for legacy route coverage,
deep-link protection, and regression tests, but it is no longer the primary product story.

## What the current shell delivers

The branch now includes the original Task 10 shell plus the workbench interaction expansion.

Delivered files and capabilities include:

- `src/web/app.tsx` and `src/web/router.tsx`
- `src/web/pages/login-page.tsx`
- `src/web/pages/home-page.tsx`
- `src/web/pages/today-page.tsx`
- `src/web/pages/search-page.tsx`
- `src/web/pages/projects-page.tsx`
- `src/web/pages/project-page.tsx`
- `src/web/pages/settings-page.tsx`
- `src/web/pages/library-page.tsx`
- `src/web/pages/reader-page.tsx`
- `src/web/pages/writing-page.tsx`
- `src/web/components/paper-workspace-tabs.tsx`
- `src/web/components/project-writer-list.tsx`
- `src/web/lib/recent-opened-store.ts`
- `src/web/lib/demo-api.ts`
- `src/shared/contracts/discovery.ts`
- `src/shared/contracts/settings.ts`
- `src/server/http-api.ts`
- UI tests covering workbench routing, navigation, context switching, paper workspace, and project writer flow
- integration coverage for `GET /api/discovery/today` and `GET /api/settings/me`

The shell now expresses the confirmed mental model in both copy and routes:

- personal dashboard first
- stable top-level navigation
- project-aware context indicators
- separated paper workspace modes
- explicit promotion path from discussion to Writer documents

Governance cues remain visible through visibility labels, project/personal context hints,
quoted-evidence language, and governed AI terminology.

## Acceptance status against the plan

The current workbench shell satisfies the interaction acceptance direction on this branch:

1. Login and home routes lead into the approved workbench model.
2. The top-level navigation exposes `今日推荐`, `搜索`, `Library`, `Projects`, and `设置`.
3. Personal and project contexts are visually distinct.
4. The paper workspace separates AI, private notes, shared comments, and metadata.
5. Project pages expose a Writer handoff surface.
6. Shell discovery/settings HTTP endpoints exist for the current workbench model.
7. Legacy deep-link coverage still protects the earlier `/spaces/...` flow.

## Verification evidence

The workbench pass added targeted verification for:

- workbench routing and navigation
- personal vs project context switching
- paper workspace tabs
- project writer flow
- workbench HTTP contracts

Branch-completion verification still uses the standard repository commands:

- `npm test`
- `npm run typecheck`
- `npm run build`

## Remaining boundaries

The current branch delivers a verified shell plus minimal shell contracts, not a fully connected product frontend.
The current implementation is appropriate for:

- interface review
- manual workflow walkthroughs
- validating context boundaries and page responsibilities
- checking whether governance cues remain visible and calm
- verifying the first `/api/` contract surfaces for the workbench shell

It is not yet the phase for claiming complete browser-side integration with live search ingestion,
real recommendation ranking, persisted settings, or full Writer publication flows.

## Next handoff

The next phase should continue in two directions at the same time.

### Product-facing next work

1. Replace demo discovery/settings payloads with authoritative server-backed data.
2. Connect the home, today, search, projects, and settings surfaces to real persistence.
3. Expand paper workspace and Writer promotion flows into saved collaborative state.

### Operator/runtime next work

1. Keep the Task 11 deployment path reproducible.
2. Preserve the explicit runtime contract in `README.md` and `README_CN.md`.
3. Extend the minimal Node runtime without weakening the server-first model.

## Explicit non-goals still in force

- no retro Chinese motif pack
- no ornamental calligraphy UI
- no high-saturation "national style" styling
- no cold enterprise dashboard default
- no over-animated AI-product behavior

## Summary

Task 10 is no longer only a first linear browser shell. On this branch it has evolved into a
test-backed workbench interaction model with calm scholarly tone, Personal vs Project context,
paper workspace separation, Writer handoff cues, and minimal HTTP contracts for the new shell.
The next milestone is to replace shell data with authoritative server-backed behavior while
keeping deployment and operator clarity aligned with the server-first architecture.
