# Task 14: Build attachment UI

## Goal

Build the MVP browser attachment UI boundary for document image/file blocks: request upload intents from the API, upload directly only to the transient signed URL returned by the server, confirm the upload through the API, insert/update the document block with the returned `attachmentId`, and request private download URLs through the API when a file block is opened.

## Source Of Truth

- `doc/MVP_rule.md` overrides `doc/Design.md` when they differ.
- Jixia MVP is web-only and server-first.
- The API is authoritative for attachment permissions, upload limits, upload intent expiry, signed URL expiry, storage keys, and object storage credentials.
- The frontend must never infer attachment permissions locally, persist signed URLs, log signed URLs, or receive/store object storage credentials.

## In Scope

- A frontend upload helper for the Task 9 attachment flow.
- A frontend download/open helper for private attachment downloads.
- An attachment block component for image/file blocks in the document editor surface.
- Focused tests proving intent request, signed upload, confirm, and secret-free behavior.
- Integration with existing `apiFetch<T>()` and editor attachment placeholders where practical.

## Out Of Scope

- Backend attachment route/service changes unless required to fix a contract mismatch.
- Public attachment links or public buckets.
- Client-side permission decisions.
- Persisting signed URLs, object storage credentials, request headers, API keys, tokens, or file contents.
- Advanced upload progress/resume/multipart uploads.
- AI-based attachment handling or document merge behavior.

## Required Files

- Create `apps/web/src/features/attachments/uploadAttachment.ts`.
- Create `apps/web/src/features/attachments/AttachmentBlock.tsx`.
- Test `apps/web/src/features/attachments/uploadAttachment.test.ts`.
- Update document editor files only as needed to use the attachment block/helper without weakening Task 13 behavior.

## Upload Helper Requirements

Implement the upload flow:

1. `POST /attachments/upload-intents` through `apiFetch` with cookie credentials inherited from the helper.
2. `PUT` the selected `File`/`Blob` to the returned `uploadUrl`/signed URL.
3. Send only the server-required headers returned by the API plus safe content metadata required by the browser upload.
4. `POST /attachments/upload-intents/:id/confirm` through `apiFetch`.
5. Return a safe result suitable for inserting/updating a document block with the confirmed `attachmentId` and metadata.

The helper must:

- Use the locked block types `image` and `file` only.
- Respect server-provided upload intent shape and limits; do not hard-code object storage credentials.
- Never persist or log signed URLs, upload headers, object storage credentials, tokens, request headers, or file contents.
- Avoid returning object storage keys or credentials to UI callers.
- Surface useful non-secret errors for failed intent, upload, and confirm steps.

## Download Helper / Attachment Block Requirements

- For file blocks, clicking/opening the block calls the backend attachment download endpoint and receives a transient signed URL.
- Open the signed URL with normal browser navigation/window behavior without storing it.
- Do not expose the storage key or object credentials.
- Image/file blocks should render clear MVP placeholders when no `attachmentId` exists yet.
- Existing editor behavior must remain human-controlled; attachment UI must not call AI or mutate unrelated document state.

## Security And Privacy Requirements

- Browser code must not use `localStorage`, `sessionStorage`, bearer tokens, or object storage credentials for attachments.
- Signed upload/download URLs must remain transient in memory only.
- Do not log file contents, signed URLs, upload headers, credentials, tokens, or document bodies.
- Attachment permission decisions remain API-owned.

## Acceptance Criteria

- Upload helper requests an upload intent from the API.
- Upload helper PUTs the file/blob to the returned signed URL.
- Upload helper confirms the upload through the API.
- Upload helper returns a safe confirmed attachment result that includes `attachmentId` but no credentials/storage key/signed URL.
- Download/open helper calls the backend download endpoint before opening a file/image attachment URL.
- Attachment block renders image/file states and calls the helper path for upload/open behavior.
- Tests prove the helper never receives or returns object-storage credentials.
- Existing Task 12/13 auth/editor tests and web build remain green.

## Verification Commands

Run focused verification:

```bash
pnpm --filter @jixia/web test -- uploadAttachment
pnpm --filter @jixia/web build
pnpm --filter @jixia/web lint
```

Run broader verification when feasible:

```bash
pnpm -r test
pnpm -r lint
pnpm -r build
```

Expected: helper requests intent, uploads to URL, confirms, returns safe metadata, and never receives/returns object-storage credentials.
