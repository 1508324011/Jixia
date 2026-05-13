# Jixia

Jixia is a server-first research collaboration platform for laboratory teams. It is designed to run on a lab-hosted server, keep authoritative data on the server side, and organize research work around project collaboration, literature assets, reading workflows, versioned writing, and governed AI jobs. The current recovery direction remains: **Space is governance. Project is collaboration.**

## Current Phase

The `main` branch now carries an integrated workbench beta rather than a placeholder shell. Current branch focus:

1. a server-first backend scaffold for spaces, library, reading, writing, and governed AI jobs
2. a project-first browser shell that loads real server-owned projects before entering library, reader, and writing lanes
3. an integrated workbench-first beta for `Login -> Home -> Today/Search/Library/Projects/Settings`
4. a current-host beta path that can persist settings, personal imports, paper notes/comments, and Writer drafts across restart

Bootstrap guardrails remain in place, but the repository has moved beyond bootstrap-only setup. The active product baseline is `docs/plans/design.md`; older Space-first plans are historical server-first scaffolding notes unless reconciled with the project-first recovery plan.

## Current-Host Beta Path

The fastest truthful entry for the integrated product flow on `main` is:

- `docs/runbooks/native-demo-showcase.md`

That runbook documents the **current-host beta path** for `main`: start the app natively, enter the workbench, set up Settings, search PubMed, import into Personal Library, open Reader, persist notes/comments/insights, promote into Writer, reopen the Writer draft, restart the process, and confirm the persisted state still exists. The packaged reset/showcase workflow is a **demo-only convenience** that still belongs to the downstream `demo-native-showcase` branch.

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
- `2026-03-23-jixia-web-interaction-design.md`
- `2026-03-23-jixia-web-interaction-implementation.md`

## Integrated Workbench Beta Surface

The shipped product surface includes:

- `src/web/app.tsx` and `src/web/router.tsx`
- `src/web/pages/login-page.tsx` and `src/web/pages/home-page.tsx` for `登录` and `个人工作台首页`
- top-level workbench surfaces for `今日推荐`, `搜索`, `Library`, `Projects`, and `设置`
- explicit `Personal` vs `Project / 项目名` context indicators
- paper workspace panels for `AI 对话`, `私人笔记`, `共享评论`, and `关键信息`
- project-level `Writer 文档区` cues plus a reopenable Writer draft preview
- server-backed project routes using Prisma/SQLite `Project` and `ProjectMember` authority instead of legacy JSON project arrays
- browser-facing `/api/*` routes for spaces, credentials, jobs, library/import, reading, notebooks, project docs, and the workbench compatibility endpoints
- preserved `/spaces/...` routes so deep-link regression tests still guard compatibility

Personal-facing routes are workbench shorthand over server-side ownership and scope rules. Space remains governance context for routing and audit compatibility, while library/import ownership and access control are authoritative through server-normalized `ScopeRef` plus `Project`/`ProjectMember` checks; legacy `spaceId` and `visibility` fields in those payloads are compatibility mirrors only.

## Truthful Runtime Notes

- `/login` is the real session entry page; the root route still redirects to `/home`, and unauthenticated browsers are redirected back to `/login?redirect=...` by the protected route boundary.
- `POST /api/session/login`, `GET /api/session/me`, and `POST /api/session/logout` manage the server-owned `jixia_session` cookie used by browser auth.
- `POST /api/session/login` accepts only a supported bounded `{ loginProfileKey }` selector for the seeded lab/demo personas; raw identity fields such as `userId`, `email`, `actorUserId`, and similar caller-supplied actor selectors are rejected from the login body/query instead of minting authority.
- `GET /api/discovery/today` and `GET /api/discovery/search?query=...` serve the discovery slice.
- `GET /api/settings/me` and `POST /api/settings/me` persist browser-facing settings through Prisma-backed per-user workbench settings and encrypted provider credential secret rows without exposing raw API keys in responses or stored settings records.
- `GET /api/library/personal` and `POST /api/library/personal/import` keep personal import ownership on the server.
- `GET /api/reading/:entryId`, `POST /api/reading/:entryId/notes`, and `POST /api/reading/:entryId/insights` back the paper workspace.
- `GET /api/projects/:projectId/writing-document` lets the project workspace reopen the latest visible shared Writer draft, or truthfully report that the project has no shared draft yet.
- `GET /api/project-docs/:documentId` returns the latest Project Doc snapshot; when a document exists but has not been saved yet, the server returns an empty snapshot with `versionNumber: 0` instead of browser-authored fallback content.
- `GET /api/writing/:spaceId/projects/:projectId/document` and `POST /api/writing/:spaceId/projects/:projectId/document` remain compatibility-only workbench endpoints for preserved legacy deep links; Project Docs remain the authoritative project writing runtime.
- `GET /api/projects/:projectId/writing/document` and `POST /api/projects/:projectId/writing/document` remain workbench compatibility endpoints backed by Project Docs for newer route callers; the project-doc routes are the authoritative project writing runtime.

## Verification Snapshot

Current branch verification is maintained with:

- `npm test`
- `npm run typecheck`
- `npm run build`

Targeted verification also covers workbench routing/navigation, personal vs project context switching, discovery/search to Personal Library import, paper workspace persistence, Writer promotion/reopen, current-host beta runbook truthfulness, and server-first Prisma-backed project membership.

## Near-Term Direction

The next delivery focus has three tracks:

1. continue the Task 11 operator/deployment path so the runtime stays reproducible on lab-hosted infrastructure
2. keep replacing remaining shell-like affordances with authoritative server-backed behavior while preserving the server-first model
3. keep the downstream `demo-native-showcase` branch limited to demo/operator packaging rather than product-truth divergence

The handoff note in `docs/plans/2026-03-21-jixia-task-10-ui-direction-notes.md` records what shipped, what still feels shell-like, and what belongs to the next phase.

## Task 11 Operator Runbook

Task 11 turns the verified web interaction shell into a reproducibly runnable lab-server package. The current runtime starts a Node 22 HTTP server, serves the built browser app from `dist/`, exposes `/health`, and persists server-managed state under the configured storage root while Prisma/SQLite backs project collaboration, provider credential secrets, and workbench settings. This is the Prisma-backed project collaboration path for lab-server operation.

### Prerequisites

- Node.js 22
- npm with the repository lockfile
- Docker and Docker Compose if you want the container path

### Environment contract

Copy `.env.example` to `.env` and fill in operator-specific values.

- `JIXIA_STORAGE_ROOT` controls where Jixia persists server-managed storage assets. On a lab server, keep this on durable storage such as `/var/lib/jixia/storage`.
- The current runtime still keeps legacy non-Prisma beta state in `JIXIA_STORAGE_ROOT/server-state.json`, but new credential secret material and workbench settings are no longer written there.
- `JIXIA_DATABASE_URL` controls the SQLite database used for Prisma-backed `Space`, `Project`, `ProjectMember`, library, notebook, Project Doc, provider credential secret, and workbench settings authority. Keep it on durable storage such as `file:/var/lib/jixia/data/jixia.db`.
- `JIXIA_STORAGE_ROOT/credentials.key` is the local encryption authority for provider credential secrets. Durable encrypted credentials require both the durable SQLite database and this durable key file; losing or replacing the key makes existing credential rows unusable rather than silently recreating or exposing them.
- `JIXIA_HOST` controls the bind host. Use `127.0.0.1` for local-only runs and `0.0.0.0` when the process is containerized or needs to listen on the lab network.
- `JIXIA_PORT` controls the HTTP port. Task 11 uses `3000` as the default runtime port.

Persist both `/var/lib/jixia/storage` and `/var/lib/jixia/data` on the lab server, and include `credentials.key` in the storage-root backup plan.

### Local Node startup path

```bash
cp .env.example .env
npm install
npm run build
npm run start:server
```

After startup, the server serves the built workbench shell from `dist/`, responds on `/health`, and exposes the current beta browser/API surface under `/api/`.

### Docker Compose startup path

```bash
cp .env.example .env
docker compose up --build
```

The included `docker-compose.yml` maps the runtime port, pins `JIXIA_STORAGE_ROOT` to the mounted `/var/lib/jixia/storage` path, points `JIXIA_DATABASE_URL` at the mounted `/var/lib/jixia/data` path for Prisma-backed collaboration, persists legacy beta state at `/var/lib/jixia/storage/server-state.json`, and keeps credential encryption key material under the same durable storage root.
