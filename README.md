# Jixia

Jixia is a server-first research collaboration platform for laboratory teams.
It is designed to run on a lab-hosted server, keep authoritative data on the server side,
and organize research work around spaces, shared literature assets, reading workflows,
versioned writing, and governed AI jobs.

## Current Phase

The `main` branch now carries an integrated workbench beta rather than a placeholder shell.

Current branch focus:

1. a server-first backend scaffold for spaces, library, reading, writing, and governed AI jobs
2. an integrated workbench-first beta for `Login -> Home -> Today/Search/Library/Projects/Settings`
3. a current-host beta path that can persist settings, personal imports, paper notes/comments, and Writer drafts across restart

Bootstrap guardrails remain in place, but the repository has moved beyond bootstrap-only setup.
This branch now proves a truthful current-host beta path rather than only an aspirational workbench shell.

## Current-Host Beta Path

The fastest truthful entry for the integrated product flow on `main` is:

- `docs/runbooks/native-demo-showcase.md`

That runbook documents the **current-host beta path** for `main`: start the app natively, enter the workbench, set up Settings, search PubMed, import into Personal Library, open Reader, persist notes/comments/insights, promote into Writer, reopen the Writer draft, restart the process, and confirm the persisted state still exists.

The packaged reset/showcase workflow is a **demo-only convenience** that still belongs to the downstream `demo-native-showcase` branch. On `main`, the runbook is intentionally scoped to the product-truth browser flow that works from the current host without Docker.

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

## Integrated Workbench Beta Surface

The shipped product surface on `main` includes:

- `src/web/app.tsx` and `src/web/router.tsx`
- `src/web/pages/login-page.tsx` and `src/web/pages/home-page.tsx` for `登录` and `个人工作台首页`
- top-level workbench surfaces for `今日推荐`, `搜索`, `Library`, `Projects`, and `设置`
- explicit `Personal` vs `Project / 项目名` context indicators
- paper workspace panels for `AI 对话`, `私人笔记`, `共享评论`, and `关键信息`
- project-level `Writer 文档区` cues plus a reopenable Writer draft preview
- authoritative workbench endpoints for discovery, settings, personal-library import/list, reading detail, reading mutations, and writing reopen/save
- preserved legacy `/spaces/...` routes so deep-link regression tests still guard compatibility

The personal-facing routes are workbench shorthand over the same server-side space model.
`space` still remains authoritative inside routing, contracts, permissions, and audit logic.

## Truthful Runtime Notes

- `/login` is still a shell-only entry page; the current browser flow on `main` enters the product through `/home`
- `GET /api/discovery/today` and `GET /api/discovery/search?query=...` serve the current discovery slice
- `GET /api/settings/me` and `POST /api/settings/me` persist browser-facing settings state without exposing raw API keys in payloads
- `GET /api/library/personal` and `POST /api/library/personal/import` keep personal import ownership on the server
- `GET /api/reading/:entryId`, `POST /api/reading/:entryId/notes`, and `POST /api/reading/:entryId/insights` back the paper workspace
- `GET /api/writing/:spaceId/projects/:projectId/document` and `POST /api/writing/:spaceId/projects/:projectId/document` back Writer reopen/save

## Verification Snapshot

Current branch verification is maintained with:

- `npm test`
- `npm run typecheck`
- `npm run build`

Targeted verification also covers:

- workbench routing and navigation
- personal vs project context switching
- discovery/search to Personal Library import
- paper workspace persistence and Writer promotion/reopen
- current-host beta runbook truthfulness

## Near-Term Direction

The next delivery focus has three tracks:

1. continue the Task 11 operator/deployment path so the runtime stays reproducible on lab-hosted infrastructure
2. keep replacing remaining shell-like affordances with authoritative server-backed behavior while preserving the server-first model
3. keep the downstream `demo-native-showcase` branch limited to demo/operator packaging rather than product-truth divergence

The handoff note in `docs/plans/2026-03-21-jixia-task-10-ui-direction-notes.md`
records what shipped, what still feels shell-like, and what belongs to the next phase.

## Task 11 Operator Runbook

Task 11 turns the verified web interaction shell into a reproducibly runnable lab-server package.
The current runtime starts a minimal Node 22 HTTP server, serves the built browser app, and keeps the current beta state in `server-state.json` under the configured storage root.

### Prerequisites

- Node.js 22
- npm with the repository lockfile
- Docker and Docker Compose if you want the container path

### Environment contract

Copy `.env.example` to `.env` and fill in operator-specific values.

- `JIXIA_STORAGE_ROOT` controls where Jixia persists server-managed storage assets.
  On a lab server, keep this on durable storage such as `/var/lib/jixia/storage`.
- The current runtime persists its server state to `JIXIA_STORAGE_ROOT/server-state.json`.
- `JIXIA_DATABASE_URL` remains a **reserved runtime boundary** for the next DB-backed phase.
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
and exposes the current beta browser/API surface under `/api/`.

### Docker Compose startup path

```bash
cp .env.example .env
docker compose up --build
```

The included `docker-compose.yml` maps the runtime port, pins `JIXIA_STORAGE_ROOT` to the mounted
`/var/lib/jixia/storage` path, keeps `JIXIA_DATABASE_URL` on the mounted `/var/lib/jixia/data`
path as a reserved runtime boundary, and persists the current state file at
`/var/lib/jixia/storage/server-state.json`.
