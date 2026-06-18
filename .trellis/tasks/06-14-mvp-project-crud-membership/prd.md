# Implement Project CRUD and Membership

## Goal

Implement `doc/MVP_implement.md` Task 7 only: server-side Project CRUD and ProjectMember management for the Jixia MVP. This task must build on the existing Fastify API foundation, Prisma data model, auth/session services, and permission boundaries without expanding into document, attachment, AI, worker, or frontend flows.

## Requirements

1. Add project service and route modules under `apps/api/src/modules/projects/**`.
2. Register project routes from the Fastify app without breaking `GET /health` or existing auth/invitation routes.
3. Implement these API routes:
   - `GET /projects`
   - `POST /projects`
   - `GET /projects/:projectId`
   - `GET /projects/:projectId/members`
   - `POST /projects/:projectId/members`
   - `PATCH /projects/:projectId/members/:userId`
   - `DELETE /projects/:projectId/members/:userId`
4. Require an authenticated actor for every project route.
5. Preserve the one-lab MVP model: use the actor's current `spaceId`/membership context, do not add multi-Space switching or cross-Space permissions.
6. Allow any active `SpaceMember` to create a `Project`; the creator must automatically become `ProjectOwner` in the same transaction.
7. Keep projects private by default: project details and member lists are readable only by explicit `ProjectMember`s.
8. Enforce that only `ProjectOwner` can add members, remove members, or change member roles.
9. Preserve the hard boundary that `SpaceAdmin` has no implicit research content or project-detail bypass unless also an explicit `ProjectMember` with the required project role.
10. Record project creation and project membership changes as metadata-only `AuditEvent` records. Audit payloads must not include document bodies, prompts, credentials, session ids, cookies, authorization headers, signed URLs, storage credentials, raw invitation tokens, or passwords.
11. Return only transport-safe DTOs compatible with `packages/shared/src/auth.ts` project/member contracts or equivalently safe local response shapes.
12. Fail closed for missing projects, missing users, cross-space membership attempts, duplicate members, invalid roles, non-members, and insufficient project roles. Do not leak sensitive content or credentials in errors/logs/tests.

## Out of Scope

- Document service, document revisions, drafts, archive/restore/delete flows.
- Attachment upload/download routes or object storage integration.
- AI provider configuration, AI conversations, AI usage, or AI calls.
- Worker jobs or background schedulers.
- Frontend pages, client-side permission helpers, or browser authorization decisions.
- Auth/session implementation changes except consuming the existing authenticated actor/session state.
- Permission service changes except using the existing server-side permission/membership logic where appropriate.
- Public signup, password reset, OAuth/SSO, MFA, email delivery, CSRF/rate-limit/deployment hardening.
- Project document/content access endpoints beyond project metadata and membership required here.

## Acceptance Criteria

1. `apps/api/src/modules/projects/project.service.ts` implements project creation, listing/detail visibility, member listing, member add/update/remove, owner checks, and metadata-only audit writes.
2. `apps/api/src/modules/projects/project.routes.ts` exposes exactly the Task 7 routes and registers them from the API app.
3. Tests under `apps/api/src/modules/projects/**` cover:
   - regular `SpaceMember` can create projects;
   - creator becomes `ProjectOwner`;
   - project details/member lists are member-only;
   - `ProjectOwner` can add/update/remove members;
   - `ProjectEditor` and `ProjectViewer` cannot manage members;
   - `SpaceAdmin` without project membership has no project-detail or member-management bypass;
   - cross-space or missing users/projects fail closed;
   - project creation and membership mutations produce metadata-only audit events.
4. Existing `/health`, auth, invitation, and permission-service tests remain green.
5. Verification passes:
   - `pnpm --filter @jixia/api test -- projects`
   - `pnpm lint`
   - `pnpm type-check`
   - `pnpm build`
   - `pnpm test`
