# Task 20j Technical Design Notes

## Good-Taste Fix

The current bad shape is two code-block identities:

- BlockNote default `codeBlock` from `defaultBlockSpecs`.
- Jixia custom `jixiaCodeBlock` created by app-side insertion and custom chrome.

That creates special cases. Delete the special case from the primary path. The stable app concept is still `codeBlock`; the editor implementation should render it with BlockNote's default `codeBlock`.

## Upload Data Model

Direct upload has three browser-visible stages:

1. API intent through `/api`.
2. Browser direct `PUT` to the signed object-storage URL.
3. API confirm and later signed download/render.

For server-first review, the signed URL must be reachable by the browser. `127.0.0.1` means the browser's own machine, not the Jixia server. Therefore the manual fixture and real API need explicit public-base/listen/CORS configuration.

## First Files To Inspect

- `apps/web/src/features/documents/editor/JixiaEditor.tsx`
- `apps/web/src/features/attachments/uploadAttachment.ts`
- `apps/web/e2e/test-api.mjs`
- `apps/api/src/modules/attachments/object-storage.ts`
- `apps/api/src/modules/attachments/local-object-storage.routes.ts`
- `apps/api/src/config/env.ts`
- `packages/shared/src/documents.ts`
- `packages/shared/src/attachments.ts`
