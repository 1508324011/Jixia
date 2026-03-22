# Jixia

Jixia is a server-first research collaboration platform for laboratory teams.
It is designed to run on a lab-hosted server, keep authoritative data on the server side,
and organize research work around spaces, shared literature assets, reading workflows,
versioned writing, and governed AI jobs.

## Current Phase

The repository now includes a server-first backend scaffold and a native demo showcase that exercises the main browser workflow against real file-backed server state.

Current branch focus:

1. a server-first backend scaffold for spaces, library, reading, writing, and governed AI jobs
2. a native Node demo for `Spaces -> Import Paper -> Reader -> Writing -> governed summary` with deterministic reset

Bootstrap guardrails remain in place, but the branch is now beyond a placeholder web shell.
The current state is a verified native showcase rather than a static Task 10-only handoff.

## Native Demo Showcase

The quickest way to understand the current branch is the dedicated runbook:

- `docs/runbooks/native-demo-showcase.md`

That runbook covers the exact reset/start commands, user-owned runtime paths, and the real click-path through `Enter shared space`, `Import paper`, `Open reader`, `Refresh reader`, `Open writing`, `Reload draft`, `Publish`, and the optional `Run governed summary` finale.

## Planning Documents

Detailed design and implementation plans live under `docs/plans/`:

- `2026-03-20-jixia-open-source-bootstrap-design.md`
- `2026-03-20-jixia-open-source-bootstrap-implementation.md`
- `2026-03-20-jixia-platform-design.md`
- `2026-03-20-jixia-platform-implementation.md`
- `2026-03-21-jixia-task-10-ui-direction-notes.md`
- `2026-03-22-jixia-task-11-deployment-implementation.md`

## Current Showcase Surface

The web layer now includes:

- `src/web/app.tsx` and `src/web/router.tsx`
- real spaces, library, reader, and writing pages backed by the native HTTP server
- minimal design tokens and shared shell styling
- governance-visible UI cues for visibility, shared context, publish state, and governed AI/job language
- UI workflow tests covering the main navigation path, direct deep links, refresh-visible persistence, and the governed-job finale

## Verification Snapshot

Latest branch verification evidence:

- `npm run typecheck`
- `npm test`
- `npm run build`

This means the current branch is ready for native demo walkthroughs and operator-facing review, even though it is still a scoped showcase rather than a full production deployment story.

## Near-Term Direction

The next delivery focus is operator hardening: turn the native demo contract into a more controlled deployment path with clearer service supervision, persistent storage ownership, secret handling, and reproducible operational packaging.

## Task 11 Operator Runbook

Task 11 now packages the native showcase as a reproducibly runnable lab-server path.
The current runtime starts a minimal Node 22 HTTP server, serves the built browser app plus
the native demo JSON API surface, and still exposes `GET /health` for operator checks.

### Prerequisites

- Node.js 22
- npm with the repository lockfile
- Docker and Docker Compose if you want the container path

### Environment contract

Copy `.env.example` to `.env` to use the runnable native-demo defaults on the current host,
or edit the values if your operator-owned paths differ.

- `JIXIA_STORAGE_ROOT` controls where Jixia persists server-managed storage assets.
  The checked-in demo default uses `/home/zhurui/.local/share/jixia-demo/storage`.
- The current Task 11 runtime persists its server state to
  `JIXIA_STORAGE_ROOT/server-state.json`.
- `JIXIA_DATABASE_URL` remains a reserved runtime boundary for the next DB-backed phase.
  The checked-in demo default uses `file:/home/zhurui/.local/share/jixia-demo/data/jixia-demo.db`.
- `JIXIA_HOST` controls the bind host. Use `127.0.0.1` for local-only runs and `0.0.0.0`
  when the process is containerized or needs to listen on the lab network.
- `JIXIA_PORT` controls the HTTP port. Task 11 uses `3000` as the default runtime port.

For an operator-owned deployment, move those defaults onto durable storage before handing the
branch to a wider lab audience.

### Local Node startup path

```bash
cp .env.example .env
npm install
npm run build
npm run demo:reset
npm run start:server
```

After startup, the server serves the built browser app from `dist/`, the server-backed native demo
API, and the health endpoint at `/health`. The browser walkthrough is now `Enter shared space` ->
`Import paper` -> `Open reader` -> `Refresh reader` -> `Open writing` -> `Reload draft` ->
`Publish` -> optional `Run governed summary`.

### Docker Compose startup path

```bash
cp .env.example .env
docker compose up --build
```

The included `docker-compose.yml` maps the runtime port, pins `JIXIA_STORAGE_ROOT` to the mounted
`/var/lib/jixia/storage` path, keeps `JIXIA_DATABASE_URL` on the mounted `/var/lib/jixia/data`
path as a reserved runtime boundary, and persists the Task 11 state file at
`/var/lib/jixia/storage/server-state.json`.
