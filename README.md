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
- `2026-03-22-jixia-task-11-deployment-implementation.md`

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
- `npm test` → 16 files / 48 tests passing
- `npm run build`

This means the current shell is ready for interface review and manual workflow walkthroughs,
even though it is still a shell rather than a fully connected product frontend.

## Near-Term Direction

The next delivery focus has two tracks:

1. exercise Task 11 on a Docker-capable operator machine and extend the runtime past the current shell-and-health deployment boundary
2. continue from the Task 10 shell toward real server-backed web interactions

The Task 10 handoff note in `docs/plans/2026-03-21-jixia-task-10-ui-direction-notes.md`
records what shipped, what was verified, and what still belongs to the next phase.

## Task 11 Operator Runbook

Task 11 turns the verified Task 10 shell into a reproducibly runnable lab-server package.
The current runtime starts a minimal Node 22 HTTP server, serves the built Task 10 web shell,
and exposes `GET /health`. It does not yet imply full browser-side live data integration.

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

After startup, the server serves the built Task 10 shell from `dist/` and the health endpoint at `/health`.

### Docker Compose startup path

```bash
cp .env.example .env
docker compose up --build
```

The included `docker-compose.yml` maps the runtime port, pins `JIXIA_STORAGE_ROOT` to the mounted
`/var/lib/jixia/storage` path, keeps `JIXIA_DATABASE_URL` on the mounted `/var/lib/jixia/data`
path as a reserved runtime boundary, and persists the Task 11 state file at
`/var/lib/jixia/storage/server-state.json`.
