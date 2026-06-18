# Monorepo Foundation

## Scenario: MVP TypeScript Monorepo Foundation

### 1. Scope / Trigger
- Trigger: Root workspace scripts, local service wiring, environment keys, and package boundaries were added for the MVP foundation.
- Scope: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `docker-compose.yml`, `.env.example`, `apps/*`, and `packages/*`.
- Boundary: This foundation must not implement authentication, permissions, Prisma schema, documents, attachments, AI services, worker jobs, or UI flows.

### 2. Signatures
- Root commands: `pnpm dev`, `pnpm build`, `pnpm type-check`, `pnpm test`, `pnpm lint`, `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:deploy`.
- Workspace packages: `@jixia/web`, `@jixia/api`, `@jixia/worker`, `@jixia/db`, `@jixia/shared`.
- Database placeholder export: `describeDatabasePlaceholder(): { packageName: "@jixia/db"; prismaSchema: "deferred" }`.
- Shared placeholder export: `describeFoundationPackage(packageName): { packageName; businessModules: "deferred" }`.

### 3. Contracts
- Workspace contract: `pnpm-workspace.yaml` must include `apps/*` and `packages/*`.
- TypeScript contract: `tsconfig.base.json` must enable `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`.
- Local services: `docker-compose.yml` must expose PostgreSQL 16 on `5432` and MinIO on `9000`/`9001` for local development.
- Environment keys: `.env.example` must document `NODE_ENV`, `API_HOST`, `API_PORT`, `WEB_ORIGIN`, `DATABASE_URL`, `SESSION_COOKIE_NAME`, `SESSION_SECRET`, `MASTER_KEY`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_FORCE_PATH_STYLE`.
- Secret handling: `.env.example` may contain placeholders or local development defaults only; real `.env` files must stay ignored.

### 4. Validation & Error Matrix
- Missing workspace package -> `pnpm -r lint` cannot cover all planned targets.
- Missing root command -> finish checklist cannot verify the PR with a single stable command.
- Missing strict TypeScript option -> later package code can compile while hiding undefined or optional-property defects.
- Real secret in `.env.example` -> block PR and replace with placeholder.
- Prisma schema added during foundation task -> block PR because database schema belongs to a later MVP task.
- Frontend-only permission or business rule -> block PR because API owns authorization and business rules.

### 5. Good/Base/Bad Cases
- Good: A package exports a typed placeholder that states business modules are deferred and keeps build/lint stable.
- Base: A workspace package has only `package.json` and one `src` entrypoint until its MVP task starts.
- Bad: A package adds auth flow, document model, attachment upload, AI prompt handling, worker jobs, or Prisma schema during the foundation task.

### 6. Tests Required
- Lint/typecheck: `pnpm lint` and `pnpm type-check` must pass with zero TypeScript errors.
- Build: `pnpm build` must pass or each not-yet-implemented workspace must expose a clear lightweight placeholder.
- Test: `pnpm test` must pass with no-test placeholders until behavior exists.
- Configuration review: verify `.gitignore`, `.env.example`, and `docker-compose.yml` against the contracts in this spec.

### 7. Wrong vs Correct
#### Wrong
```typescript
export function canEditDocumentOnClientOnly() {
  return true;
}
```

#### Correct
```typescript
export function describeFoundationPackage(packageName: WorkspacePackageName) {
  return { packageName, businessModules: "deferred" } as const;
}
```
