# Jixia

Jixia is a server-first research collaboration platform for laboratory teams.
It is designed to run on a lab-hosted server, keep authoritative data on the server side,
and organize research work around spaces, shared literature assets, reading workflows,
versioned writing, and governed AI jobs.

## Current Phase

The repository now includes two aligned layers:

1. a server-first backend scaffold for spaces, library, reading, writing, and governed AI jobs
2. a verified workbench-first web interaction shell for `Login -> Home -> Today/Search/Library/Projects/Settings`

Bootstrap guardrails remain in place, but the project has moved beyond repository-only setup.
The current branch state reflects a verified workbench interaction shell rather than a placeholder
web entry or a purely linear demo.

## Planning Documents

Detailed design and implementation plans live under `docs/plans/`:

- `2026-03-20-jixia-open-source-bootstrap-design.md`
- `2026-03-20-jixia-open-source-bootstrap-implementation.md`
- `2026-03-20-jixia-platform-design.md`
- `2026-03-20-jixia-platform-implementation.md`
- `2026-03-21-jixia-task-10-ui-direction-notes.md`
- `2026-03-22-jixia-task-11-deployment-implementation.md`
- `2026-03-23-jixia-web-interaction-design.md`
- `2026-03-23-jixia-web-interaction-implementation.md`

## Workbench Shell Status

The web layer now centers on a personal-dashboard-first workbench rather than a single
`Spaces -> Library -> Reader -> Writing` walkthrough.

The shipped surfaces include:

- `src/web/app.tsx` and `src/web/router.tsx`
- `src/web/pages/login-page.tsx`
- `src/web/pages/home-page.tsx` for `个人工作台首页`
- top-level surfaces for `今日推荐`, `搜索`, `Library`, `Projects`, and `设置`
- explicit `Personal` vs `Project / 项目名` context indicators
- paper workspace panels for `AI 对话`, `私人笔记`, `共享评论`, and `关键信息`
- project-level `Writer 文档区` cues for promoting mature content into formal writing
- shell HTTP endpoints at `GET /api/discovery/today` and `GET /api/settings/me`
- preserved legacy `/spaces/...` routes so deep-link regression tests still guard compatibility

The personal-facing routes are workbench shorthand over the same server-side space model.
`space` still remains authoritative inside routing, contracts, permissions, and audit logic.

## Verification Snapshot

Current branch verification is maintained with:

- `npm test`
- `npm run typecheck`
- `npm run build`

During the workbench interaction pass, targeted verification also covers:

- workbench routing and navigation
- personal vs project context switching
- paper workspace panels and project writer flow
- discovery/settings HTTP contract exposure

## Near-Term Direction

The next delivery focus has three tracks:

1. continue the Task 11 operator/deployment path so the runtime stays reproducible on lab-hosted infrastructure
2. replace shell/demo data in the new workbench surfaces with authoritative server-backed data while preserving the server-first model
3. expand paper, project, and Writer flows from shell interactions into persisted collaborative workflows

The handoff note in `docs/plans/2026-03-21-jixia-task-10-ui-direction-notes.md`
records what shipped, what remains a shell boundary, and what belongs to the next phase.

## Task 11 Operator Runbook

Task 11 turns the verified web interaction shell into a reproducibly runnable lab-server package.
The current runtime starts a minimal Node 22 HTTP server, serves the built workbench shell,
and exposes `GET /health`, `GET /api/discovery/today`, and `GET /api/settings/me`.
These API surfaces are still shell contracts rather than full product endpoints.

### Prerequisites

- Node.js 22
- npm with the repository lockfile
- Docker and Docker Compose if you want the container path

### Environment contract

Copy `.env.example` to `.env` and fill in operator-specific values.

- `JIXIA_STORAGE_ROOT` controls where Jixia persists server-managed storage assets.
  On a lab server, keep this on durable storage such as `/var/lib/jixia/storage`.
- The current Task 11 runtime persists its server state to
  `JIXIA_STORAGE_ROOT/server-state.json`.
- `JIXIA_DATABASE_URL` remains a reserved runtime boundary for the next DB-backed phase.
  Keep the recommended future-compatible path at `file:/var/lib/jixia/data/jixia.db`.
- `JIXIA_HOST` controls the bind host. Use `127.0.0.1` for local-only runs and `0.0.0.0`
  when the process is containerized or needs to listen on the lab network.
- `JIXIA_PORT` controls the HTTP port. Task 11 uses `3000` as the default runtime port.

Persist `/var/lib/jixia/storage` on the lab server so `server-state.json` survives restarts.
Keep `/var/lib/jixia/data` reserved for the next runtime phase so the future database file can
land on persistent storage without changing the operator contract.

### Local Node startup path

```bash
cp .env.example .env
npm install
npm run build
npm run start:server
```

After startup, the server serves the built workbench shell from `dist/`, responds on `/health`,
and exposes the current shell endpoints under `/api/`.

### Docker Compose startup path

```bash
cp .env.example .env
docker compose up --build
```

The included `docker-compose.yml` maps the runtime port, pins `JIXIA_STORAGE_ROOT` to the mounted
`/var/lib/jixia/storage` path, keeps `JIXIA_DATABASE_URL` on the mounted `/var/lib/jixia/data`
path as a reserved runtime boundary, and persists the Task 11 state file at
`/var/lib/jixia/storage/server-state.json`.
