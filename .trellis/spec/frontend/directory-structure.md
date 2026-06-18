# Frontend Directory Structure

The MVP web app lives in `apps/web` as a Vite React application. Keep browser
code server-first: render API responses, submit user intent to API routes, and do
not duplicate permission, visibility, audit, storage-key, or AI-secret decisions
in the client.

## Source Layout

- `apps/web/src/main.tsx`: browser entrypoint that mounts the React app.
- `apps/web/src/app/`: app-level routing, shell composition, and page mounting.
- `apps/web/src/features/<feature>/`: feature UI grouped by product area such as
  `auth` or `layout`.
- `apps/web/src/lib/`: browser-safe shared helpers such as the API client.

## API Boundaries

- Browser API helpers must call server routes under `/api` and include cookies by
  default with `credentials: "include"`.
- Login, invitation acceptance, and future authenticated flows must rely on
  HttpOnly server session cookies, not `localStorage`, `sessionStorage`, bearer
  tokens, or hard-coded auth constants.
- Shared request and response types should come from `packages/shared` whenever a
  contract is consumed by both API and web.

## Test Placement

- Keep focused component tests next to the source file they verify using
  `*.test.tsx`.
- Auth UI tests should verify API path prefixing, cookie credentials, loading
  states, and non-secret error rendering.
