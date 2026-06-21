# Task 20j Manual Review Commands

## Localhost E2E Fixture Review

Use this shape when the browser, API fixture, and Vite dev server all run on the same machine:

```bash
JIXIA_E2E_API_PORT=4174 \
JIXIA_E2E_WEB_PORT=5173 \
node apps/web/e2e/test-api.mjs
```

```bash
JIXIA_E2E_API_URL=http://127.0.0.1:4174 \
pnpm --dir apps/web exec vite --host 127.0.0.1 --port 5173 --strictPort
```

Record these review values:

- Web origin: `http://127.0.0.1:5173`
- API origin: `http://127.0.0.1:4174`
- Object-storage public base: `http://127.0.0.1:4174/local-object-storage`
- API listen host: `127.0.0.1`
- Allowed origins: `http://127.0.0.1:5173,http://localhost:5173`

## LAN Or Domain Review

Use this shape when the browser is on another machine and must reach the server by LAN IP or DNS name:

```bash
SERVER_ORIGIN=http://192.168.1.50
JIXIA_E2E_API_HOST=0.0.0.0 \
JIXIA_E2E_API_PORT=4174 \
JIXIA_E2E_WEB_PORT=5173 \
JIXIA_E2E_API_PUBLIC_ORIGIN=$SERVER_ORIGIN:4174 \
JIXIA_E2E_OBJECT_STORAGE_PUBLIC_BASE_URL=$SERVER_ORIGIN:4174/local-object-storage \
JIXIA_E2E_ALLOWED_ORIGINS=$SERVER_ORIGIN:5173 \
node apps/web/e2e/test-api.mjs
```

```bash
JIXIA_E2E_API_URL=$SERVER_ORIGIN:4174 \
pnpm --dir apps/web exec vite --host 0.0.0.0 --port 5173 --strictPort
```

Record these review values with the real IP or DNS name used by the browser:

- Web origin: `$SERVER_ORIGIN:5173`
- API origin: `$SERVER_ORIGIN:4174`
- Object-storage public base: `$SERVER_ORIGIN:4174/local-object-storage`
- API listen host: `0.0.0.0`
- Allowed origins: `$SERVER_ORIGIN:5173`

## Required Browser Checks

1. Create/open a Notebook document, type `/code`, insert a default BlockNote code block, save, refresh, and reopen.
2. Repeat the code-block flow in a Project document without using any custom `Insert block` control.
3. Upload an image and a non-image file through the editor attachment path.
4. Confirm Network shows API intent, CORS preflight/direct `PUT`, API confirm, signed download/render, save, refresh, and reopen.
5. Inspect persisted document snapshots/DTOs for absence of signed URLs, object keys, storage keys, bucket names, upload headers, credentials, cookies, raw local object-storage URLs, and filesystem paths.
6. Paste a real OS clipboard image into the editor and record the browser result.
7. Drag a file from the OS file manager into the editor and record the browser result.

Do not mark paste/drop complete from synthetic Playwright dispatch alone; record real browser observations here:

- OS paste image: `pass/fail`, browser, origin, notes.
- OS file drag/drop: `pass/fail`, browser, origin, notes.

## Real Local API Review

Use this shape when reviewing against the real API package instead of the E2E fixture. The important rule is that the browser-facing Web origin, API origin, signed object-storage public base, API listen host, and allowed-origin list all describe the same reachable host from the browser's point of view.

### Same-Machine Real API

```bash
NODE_ENV=development \
API_HOST=127.0.0.1 \
API_PORT=3000 \
ATTACHMENT_STORAGE_DRIVER=local \
LOCAL_OBJECT_STORAGE_ROOT=/tmp/jixia-local-object-storage \
LOCAL_OBJECT_STORAGE_PUBLIC_BASE_URL=http://127.0.0.1:3000/local-object-storage \
LOCAL_OBJECT_STORAGE_ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173 \
pnpm --filter @jixia/api dev
```

```bash
JIXIA_E2E_API_URL=http://127.0.0.1:3000 \
pnpm --dir apps/web exec vite --host 127.0.0.1 --port 5173 --strictPort
```

Record:

- Web origin: `http://127.0.0.1:5173`
- API origin: `http://127.0.0.1:3000`
- Object-storage public base: `http://127.0.0.1:3000/local-object-storage`
- API listen host: `127.0.0.1`
- Allowed origins: `http://127.0.0.1:5173,http://localhost:5173`

### Remote-Browser Real API

```bash
SERVER_ORIGIN=http://192.168.1.50
NODE_ENV=development \
API_HOST=0.0.0.0 \
API_PORT=3000 \
ATTACHMENT_STORAGE_DRIVER=local \
LOCAL_OBJECT_STORAGE_ROOT=/tmp/jixia-local-object-storage \
LOCAL_OBJECT_STORAGE_PUBLIC_BASE_URL=$SERVER_ORIGIN:3000/local-object-storage \
LOCAL_OBJECT_STORAGE_ALLOWED_ORIGINS=$SERVER_ORIGIN:5173 \
pnpm --filter @jixia/api dev
```

```bash
JIXIA_E2E_API_URL=$SERVER_ORIGIN:3000 \
pnpm --dir apps/web exec vite --host 0.0.0.0 --port 5173 --strictPort
```

Record with the actual browser-reachable IP or DNS name:

- Web origin: `$SERVER_ORIGIN:5173`
- API origin: `$SERVER_ORIGIN:3000`
- Object-storage public base: `$SERVER_ORIGIN:3000/local-object-storage`
- API listen host: `0.0.0.0`
- Allowed origins: `$SERVER_ORIGIN:5173`
