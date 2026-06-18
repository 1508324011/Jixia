# API Foundation

## Scenario: MVP Fastify API Health Foundation

### 1. Scope / Trigger
- Trigger: `apps/api` now exposes a concrete Fastify foundation with reusable app construction, runtime startup, environment parsing, cookie plugin scaffolding, and a shallow health route.
- Scope: `apps/api/src/app.ts`, `apps/api/src/server.ts`, `apps/api/src/config/**`, `apps/api/src/plugins/**`, `apps/api/src/routes/**`, `apps/api/src/test-utils/**`, and `@jixia/api` package scripts.
- Boundary: This foundation must not implement auth, sessions, invitations, permissions, projects, documents, attachments, AI, audit, workers, frontend flows, or MVP business endpoints.

### 2. Signatures
- App factory: `createApiApp(options?: { readonly logger?: FastifyServerOptions["logger"] }): FastifyInstance`.
- Runtime entrypoint: `apps/api/src/server.ts` calls `parseApiEnv(process.env)`, builds the app through `createApiApp`, and starts Fastify with `{ host, port }`.
- Environment parser: `parseApiEnv(env: NodeJS.ProcessEnv): ApiEnv` returns `{ host, logLevel, nodeEnv, port }` or throws `ApiEnvError`.
- Health route: `GET /health` returns `HealthResponse` as `{ readonly ok: true }`.
- Test utility: `createTestApiApp(): Promise<FastifyInstance>` prepares the app for Fastify injection and leaves shutdown to the test.

### 3. Contracts
- `GET /health` is a shallow application-liveness probe only. It must not query PostgreSQL, object storage, AI providers, workers, sessions, or permission state.
- API environment keys are `API_HOST` defaulting to `127.0.0.1`, `API_PORT` defaulting to `3000` with integer range `1..65535`, `API_LOG_LEVEL` defaulting to `info`, and `NODE_ENV` defaulting to `development`.
- Environment parsing must report invalid field names only, never raw environment values, secrets, tokens, storage credentials, provider keys, cookies, signed URLs, prompts, or document bodies.
- Runtime logging must keep request logging disabled unless explicitly configured and must redact authorization headers, cookies, API keys, tokens, signed URLs, prompt fields, document bodies, and storage credentials.
- Cookie support may be registered as an isolated plugin scaffold, but no session signing, auth behavior, or cookie-derived permission decision belongs in this foundation task.
- Route handlers should stay thin and testable; future business rules belong under `apps/api/src/modules/**` and remain server-authoritative.

### 4. Validation & Error Matrix
- Invalid `API_PORT` or `API_LOG_LEVEL` -> throw `ApiEnvError` listing only invalid field names.
- Missing optional API env keys -> use local-development-safe defaults.
- Fastify listen failure -> close the app, log a sanitized startup failure message, and set a non-zero process exit state.
- Database, storage, provider, or worker unavailable -> `GET /health` still returns the shallow health payload.
- A handler or logger attempts to emit authorization headers, cookies, API keys, tokens, signed URLs, prompts, document bodies, or storage credentials -> block PR until the field is removed or redacted.

### 5. Good/Base/Bad Cases
- Good: `app.ts` creates Fastify, registers `cookiePlugin` and `healthRoutes`, and returns the instance without binding a port.
- Good: API tests use `app.inject({ method: "GET", url: "/health" })` and close the app after each test.
- Base: `cookies.ts` registers `@fastify/cookie` without secrets or session semantics so later auth work can extend it deliberately.
- Bad: `/health` performs a Prisma query, checks MinIO readiness, exposes env values, or reports provider configuration.
- Bad: This foundation adds login, session, invitation, permission, project, document, attachment, AI, audit, worker, or frontend behavior.

### 6. Tests Required
- API route test: `pnpm --filter @jixia/api test` must assert `GET /health` returns HTTP 200, JSON content type, and `{ ok: true }` through Fastify injection.
- Repository checks: `pnpm lint`, `pnpm type-check`, `pnpm build`, and `pnpm test` must pass before PR.
- Environment parser changes require focused tests for defaults, valid overrides, invalid field reporting, and secret-value omission.
- Server startup changes require typecheck plus manual review that startup logs include host/port only and sanitized error messages.

### 7. Wrong vs Correct
#### Wrong
```typescript
const app = Fastify();
await app.listen({ port: Number(process.env.API_PORT) });

app.get("/health", async () => ({
  databaseUrl: process.env.DATABASE_URL,
  storage: await minioClient.bucketExists("jixia-dev")
}));
```

#### Correct
```typescript
export function createApiApp(): FastifyInstance {
  const app = Fastify({ disableRequestLogging: true, logger: false });
  app.register(healthRoutes);
  return app;
}
```
