# Add API Health Foundation

## Goal

Implement `doc/MVP_implement.md` Task 4: establish the minimal Fastify API foundation for the Jixia MVP with a health endpoint, environment parsing, app/server separation, and API package tests.

## Requirements

- Replace the API scaffold placeholder with a real Fastify app factory in `apps/api/src/app.ts`.
- Keep `apps/api/src/server.ts` as the runtime entrypoint that loads environment config and starts the app.
- Add API environment parsing under `apps/api/src/config/**` using safe defaults for local development and no hardcoded secrets.
- Add a health route at `GET /health` that returns a transport-safe JSON payload suitable for smoke checks.
- Add API test utilities and tests that exercise the app through Fastify injection without requiring a running database or object storage service.
- Preserve server-first boundaries: the API remains the future permission/business-rule center, but this task must not implement auth, sessions, invitations, permissions, projects, documents, attachments, AI, audit, workers, or frontend flows.
- Keep logs and errors free of secrets, provider keys, signed URLs, cookies, authorization headers, prompts, document bodies, and storage credentials.
- Keep changes aligned with the existing monorepo scripts and TypeScript strictness.

## Acceptance Criteria

- [ ] `apps/api/src/app.ts` exports a reusable Fastify app factory with the `/health` route registered.
- [ ] `apps/api/src/server.ts` starts the API via the app factory and handles startup failures safely.
- [ ] `apps/api/src/config/env.ts` or equivalent validates API runtime settings without committing secrets.
- [ ] `apps/api/src/test-utils/**` or equivalent supports DB-free route testing.
- [ ] API tests verify `GET /health` returns a successful JSON response.
- [ ] `pnpm --filter @jixia/api test`, `pnpm lint`, `pnpm type-check`, `pnpm build`, and `pnpm test` pass.
- [ ] No MVP business endpoints or permission decisions are implemented in this task.

## Technical Notes

- This is a foundation task only. It should set up app construction, route registration style, environment parsing, and tests so later tasks can add auth and permissions deliberately.
- Health should be shallow application health, not a deep database/storage/provider readiness probe.
- Prefer route handlers that are thin and testable; future business rules belong under `apps/api/src/modules/**`.
