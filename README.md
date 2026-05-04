# Jixia

Jixia is a server-first research collaboration platform for laboratory teams.
It is designed to run on a lab-hosted server, keep authoritative data on the server side,
and organize research work around project collaboration, literature assets, reading workflows,
versioned writing, and governed AI jobs. The current recovery direction is:
**Space is governance. Project is collaboration.**

## Current Phase

The repository now includes two aligned layers:

1. a server-first backend scaffold for spaces, library, reading, writing, and governed AI jobs
2. a project-first browser shell that loads real server-owned projects before entering library, reader, and writing lanes

Bootstrap guardrails remain in place, but the project has moved beyond repository-only setup.
The active product baseline is `docs/plans/design.md`; older Space-first plans are historical
server-first scaffolding notes unless reconciled with the project-first recovery plan.

## Planning Documents

Detailed design and implementation plans live under `docs/plans/`:

- `design.md` — current target product baseline
- `2026-05-03-jixia-project-first-recovery-plan.md` — active project-first recovery plan
- `2026-03-20-jixia-open-source-bootstrap-design.md`
- `2026-03-20-jixia-open-source-bootstrap-implementation.md`
- `2026-03-20-jixia-platform-design.md`
- `2026-03-20-jixia-platform-implementation.md`
- `2026-03-21-jixia-task-10-ui-direction-notes.md`
- `2026-03-22-jixia-task-11-deployment-implementation.md`

## Project-first Recovery Status

The current branch now carries the first project-first recovery slice on top of the earlier browser-runtime shell work.
The web layer now includes:

- `src/web/app.tsx` and `src/web/router.tsx`
- a new `src/web/components/app-shell.tsx` that brings in a ResearchClaw-inspired sidebar, top bar, and shared page chrome
- page shells for projects, spaces, search, library, reader, writing, jobs, and settings
- upgraded donor-style design tokens, Tailwind/PostCSS support, and shared shell styling
- shared `Project`, `ProjectMember`, and `ScopeRef` contracts plus server APIs for project creation, listing, lookup, and membership management
- project routes backed by Prisma/SQLite `Project` and `ProjectMember` authority instead of hardcoded `shared-space`, `tumor-board`, or legacy JSON project arrays
- browser-facing `/api/*` routes for spaces, credentials, and jobs, plus a live SSE job stream endpoint
- browser-facing library/import routes plus presenter-backed `spaces`, `search`, and `library` pages
- browser-facing reading routes plus a presenter-backed `reader` page with detail, note, and insight actions
- a typed web client and presenter layer now backing `spaces`, `search`, `library`, `reader`, `jobs`, and `settings`
- governance-visible UI cues for visibility, shared context, publish state, and governed AI/job language
- UI workflow tests covering the main navigation path and direct deep links

## Verification Snapshot

Latest branch verification evidence:

- `npm run typecheck`
- `npm test` → 22 files / 65 tests passing
- `npm run build`

This means the current shell is now backed by real browser-facing runtime slices for Prisma-backed project membership,
jobs/settings, library/search, and reader flows, even though the broader Notebook, Project Docs, AI job scoping,
and non-project Prisma-backed runtime migrations remain future recovery phases.

## Near-Term Direction

The next delivery focus has two tracks:

1. exercise Task 11 on a Docker-capable operator machine and extend the runtime past the current shell-and-health deployment boundary
2. continue from the Task 10 shell toward deeper server-backed web interactions beyond the current spaces/search/library/reader/jobs/settings slices

The Task 10 handoff note in `docs/plans/2026-03-21-jixia-task-10-ui-direction-notes.md`
records what shipped, what was verified, and what still belongs to the next phase.

## Task 11 Operator Runbook

Task 11 turns the verified Task 10 shell into a reproducibly runnable lab-server package.
The current runtime starts a Node 22 HTTP server, serves the built Task 10 web shell,
and now exposes `GET /health` together with the same-origin browser API routes used by the current spaces/search/library/reader/jobs/settings slices.

### Prerequisites

- Node.js 22
- npm with the repository lockfile
- Docker and Docker Compose if you want the container path

### Environment contract

Copy `.env.example` to `.env` and fill in operator-specific values.

- `JIXIA_STORAGE_ROOT` controls where Jixia persists server-managed storage assets.
  On a lab server, keep this on durable storage such as `/var/lib/jixia/storage`.
- The current runtime still persists legacy non-project server state to
  `JIXIA_STORAGE_ROOT/server-state.json`.
- `JIXIA_DATABASE_URL` controls the SQLite database used for Prisma-backed
  `Project` and `ProjectMember` authority. Keep it on durable storage such as
  `file:/var/lib/jixia/data/jixia.db` so project collaboration survives restarts.
- `JIXIA_HOST` controls the bind host. Use `127.0.0.1` for local-only runs and `0.0.0.0`
  when the process is containerized or needs to listen on the lab network.
- `JIXIA_PORT` controls the HTTP port. Task 11 uses `3000` as the default runtime port.

Persist both `/var/lib/jixia/storage` and `/var/lib/jixia/data` on the lab server:
`server-state.json` still backs legacy domains, while SQLite now backs project collaboration.

### Local Node startup path

```bash
cp .env.example .env
npm install
npm run build
npm run start:server
```

After startup, the server serves the built Task 10 shell from `dist/` and the health endpoint at `/health`.

### Docker Compose startup path

```bash
cp .env.example .env
docker compose up --build
```

The included `docker-compose.yml` maps the runtime port, pins `JIXIA_STORAGE_ROOT` to the mounted
`/var/lib/jixia/storage` path, points `JIXIA_DATABASE_URL` at the mounted `/var/lib/jixia/data`
path for Prisma-backed project collaboration, and persists the legacy state file at
`/var/lib/jixia/storage/server-state.json`.
