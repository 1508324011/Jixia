# Initialize MVP monorepo foundation

## Goal

Create the repository foundation for the Jixia MVP described in `doc/MVP_implement.md`, limited to Task 0 and Task 1: repository hygiene, TypeScript monorepo workspace, package manifests, local service configuration, and minimal package entrypoints.

## Requirements

- Add root repository hygiene so generated dependencies, builds, coverage, local databases, Playwright reports, and environment secret files are ignored.
- Create a pnpm TypeScript monorepo with the planned package layout: `apps/web`, `apps/api`, `apps/worker`, `packages/db`, and `packages/shared`.
- Add root package scripts for `dev`, `build`, `test`, `lint`, `db:generate`, `db:migrate`, and `db:deploy`.
- Add strict shared TypeScript configuration with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` enabled.
- Add local service configuration for PostgreSQL 16 and MinIO using Docker Compose.
- Add `.env.example` with the non-secret variables required by the planned API, database, session, AI encryption, and S3/MinIO integrations.
- Add minimal package manifests and placeholder source entrypoints so workspace commands have stable targets without implementing business modules.
- Do not implement authentication, permissions, Prisma schema, documents, attachments, AI services, worker jobs, or UI flows in this task.

## Acceptance Criteria

- [ ] Root `package.json`, `pnpm-workspace.yaml`, and `tsconfig.base.json` exist and match the MVP monorepo layout.
- [ ] Root `.gitignore` protects dependencies, build outputs, reports, local data, and secret env files.
- [ ] `docker-compose.yml` defines PostgreSQL 16 and MinIO services suitable for local development.
- [ ] `.env.example` documents required local environment variables without real secrets.
- [ ] `apps/web`, `apps/api`, `apps/worker`, `packages/db`, and `packages/shared` each have a package manifest.
- [ ] Each workspace package has a minimal TypeScript source entrypoint or equivalent scaffold.
- [ ] Workspace build/test/lint scripts can be invoked or have clear lightweight placeholders when no implementation exists yet.
- [ ] No MVP business rules are weakened or implemented in the frontend only.

## Technical Notes

`doc/MVP_rule.md` is the source of truth for MVP constraints. `doc/MVP_implement.md` defines this task as the foundation before shared domain types, Prisma schema, API modules, editor UI, attachments, AI, and worker jobs. Keep this task structural and minimal.
