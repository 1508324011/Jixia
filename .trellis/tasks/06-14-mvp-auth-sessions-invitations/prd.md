# Implement Auth, Sessions, and Invitations

## Scope

Implement `doc/MVP_implement.md` Task 5 only: the MVP authentication foundation for invited users, server-side sessions, and SpaceAdmin-managed invitations. This task builds on the existing Fastify API foundation, shared contracts, and Prisma data model.

## Requirements

- Add API auth modules/routes for:
  - `POST /auth/login`
  - `POST /auth/logout`
  - `POST /auth/logout-all`
  - `GET /auth/me`
  - `POST /invitations`
  - `POST /invitations/accept`
- Use server-side sessions persisted in the database; the browser cookie must contain only the opaque session id.
- Cookie behavior must align with MVP rules: HttpOnly, Secure in production, SameSite=Lax, seven-day sliding expiry, and renewal only when remaining lifetime is below two days.
- Store invitation tokens only as hashes; never persist or log raw invitation tokens.
- Enforce invitation-only registration; do not add open registration or password reset.
- Allow only SpaceAdmin users to create invitations.
- Create an initial Space and first SpaceAdmin path only if needed for local bootstrap, and keep it explicit, safe, and documented in tests/config.
- Store password hashes only; never store or return plaintext passwords.
- Keep all authentication and authorization decisions on the API/server side.
- Return only transport-safe shared DTOs from auth/invitation routes.
- Keep logs, errors, tests, and audit payloads free of passwords, raw tokens, session ids, cookies, authorization headers, API keys, signed URLs, prompts, document bodies, and storage credentials.
- Add route/service tests covering login, logout, logout-all, auth/me, invitation creation, invitation acceptance, expired/used invitation rejection, revoked/expired session rejection, and session sliding renewal behavior. Tests may use the API test helper and an isolated database test strategy, but must not require object storage, AI providers, workers, or frontend.

## Out of Scope

- Project CRUD/membership beyond the minimal membership records needed for auth tests.
- Permission service implementation beyond route-level SpaceAdmin/invitation/session checks required here.
- Document, attachment, AI, audit, worker, and frontend flows.
- Password reset, public signup, OAuth, SSO, email delivery, MFA, CSRF middleware, rate limiting, and production deployment hardening beyond the locked cookie/session rules.
- Client-side permission decisions or frontend auth UI.

## Acceptance Criteria

- Auth and invitation routes are registered from the Fastify app without breaking `GET /health`.
- Auth services use Prisma models from `packages/db` and do not import browser/frontend code.
- Route responses use safe shared contract shapes or compatible transport-safe DTOs.
- Cookie creation/clearing uses only an opaque session id and applies the locked security attributes.
- Raw passwords, invitation tokens, and session ids are never returned in API responses or saved to audit/log payloads.
- Tests verify the core happy paths and failure paths listed above.
- `pnpm --filter @jixia/api test`, `pnpm lint`, `pnpm type-check`, `pnpm build`, and `pnpm test` pass.
