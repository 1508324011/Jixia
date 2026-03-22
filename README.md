# Jixia

Jixia is a server-first research collaboration platform for laboratory teams.
It is designed to run on a lab-hosted server, keep authoritative data on the server side,
and organize research work around spaces, shared literature assets, reading workflows,
versioned writing, and governed AI jobs.

## Current Phase

The repository now includes two aligned layers:

1. a server-first backend scaffold for spaces, library, reading, writing, and governed AI jobs
2. the first scholarly web workflow shell for `Spaces -> Library -> Reader -> Writing`

Bootstrap guardrails remain in place, but the project has moved beyond repository-only setup.
The current branch state reflects a verified Task 10 shell rather than a placeholder web entry.

## Planning Documents

Detailed design and implementation plans live under `docs/plans/`:

- `2026-03-20-jixia-open-source-bootstrap-design.md`
- `2026-03-20-jixia-open-source-bootstrap-implementation.md`
- `2026-03-20-jixia-platform-design.md`
- `2026-03-20-jixia-platform-implementation.md`
- `2026-03-21-jixia-task-10-ui-direction-notes.md`

## Task 10 Status

Task 10's first browser workflow shell is complete on this branch.
The web layer now includes:

- `src/web/app.tsx` and `src/web/router.tsx`
- page shells for spaces, library, reader, and writing
- minimal design tokens and shared shell styling
- governance-visible UI cues for visibility, shared context, publish state, and governed AI/job language
- UI workflow tests covering the main navigation path and direct deep links

## Verification Snapshot

Latest branch verification evidence:

- `npm run typecheck`
- `npm test` → 15 files / 41 tests passing
- `npm run build`

This means the current shell is ready for interface review and manual workflow walkthroughs,
even though it is still a shell rather than a fully connected product frontend.

## Near-Term Direction

The next delivery focus has two tracks:

1. complete Task 11's Docker-first deployment scaffolding and operator documentation
2. continue from the Task 10 shell toward real server-backed web interactions

The Task 10 handoff note in `docs/plans/2026-03-21-jixia-task-10-ui-direction-notes.md`
records what shipped, what was verified, and what still belongs to the next phase.
