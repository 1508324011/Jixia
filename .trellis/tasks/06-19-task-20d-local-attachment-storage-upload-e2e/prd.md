# Task 20d Local Attachment Storage and Upload E2E

## Source of Truth

- Failed manual review: `.trellis/tasks/06-19-task-20c-rich-block-editing-polish/prd.md`
- Task 20b editor adapter baseline: `.trellis/tasks/06-19-task-20b-blocknote-editor-adapter/prd.md`
- Task 20r editor decision: `.trellis/tasks/06-19-task-20r-editor-engine-adapter-decision-spike/decision.md`
- Roadmap: `doc/Notebook_Project_Doc_Editor_Implementation_Plan.md`
- Attachment service: `apps/api/src/modules/attachments/attachment.service.ts`
- Object storage adapter: `apps/api/src/modules/attachments/object-storage.ts`
- Web upload client: `apps/web/src/features/attachments/uploadAttachment.ts`
- Attachment block UI: `apps/web/src/features/attachments/AttachmentBlock.tsx`

## Background

Task 20c failed manual review. The code block controls were wrongly placed in global document chrome, and image/file/attachment upload still did not work normally in the local review environment. The upload failure is not only a UI problem. The current attachment pipeline requires S3-compatible object storage environment variables and direct browser PUT to a presigned URL. The local review API was started without object storage configuration, while tests mostly use mocks or E2E storage helpers.

Task 20d fixes the data and infrastructure relationship first: local review and automated E2E must prove the real upload-intent -> direct upload -> confirm -> draft/revision save -> refresh/download flow before Task 20e polishes block-local media UI.

## Goal

Make private image/file/attachment upload work end-to-end in local review and automated E2E while preserving Jixia's permission, privacy, and direct-upload safety model.

## Non-Negotiable Constraints

- API owns authorization and attachment business rules.
- Do not persist signed URLs, storage keys, upload headers, access keys, authorization headers, or raw secrets in document snapshots or shared DTOs.
- Preserve the upload-intent, direct upload, confirm, and signed-download safety checks unless a dev-only fallback is explicitly isolated from production behavior.
- Preserve Notebook and Project documents behind the same shared editor boundary.
- Do not implement code-block block-local UI in this task; that belongs to Task 20e.
- Do not implement Markdown/PDF export in this task.
- Do not add CRDT/realtime/collaboration or AI writeback.
- Do not require public cloud credentials for local review or CI.

## In Scope

- Define and implement a local object storage strategy for development and E2E:
  - preferred path: S3-compatible local storage such as MinIO with explicit local environment configuration, or
  - a clearly isolated dev/test object storage fallback that preserves the production contract shape.
- Make local review startup capable of supplying the required object storage configuration.
- Ensure browser direct upload succeeds from `http://127.0.0.1:5173` in the local review stack.
- Ensure API `confirmUploadIntent` can verify uploaded objects via storage metadata/head-object behavior.
- Add or update E2E coverage for the real attachment upload path:
  - create upload intent,
  - perform direct upload,
  - confirm upload,
  - attach image/file block,
  - save draft or formal revision,
  - refresh/reopen,
  - open/download through signed download flow.
- Add backend and frontend tests for object-storage configuration/error cases where useful.
- Preserve `uploadAttachment` safety guards against forbidden storage response fields and credential headers.
- Ensure read-only documents cannot upload, replace, remove, or mutate attachment metadata.
- Document the local review startup requirements for object storage so future manual review does not silently run without upload support.

## Out of Scope

- Moving code block controls into block-local UI.
- Redesigning image/file block NodeViews beyond what is necessary to prove upload works.
- Markdown export.
- PDF export.
- EditorSnapshotV2 persistence rollout.
- Database schema migration unless explicitly stopped and replanned.
- New public cloud storage dependency for local development.
- Worker cleanup jobs unless object storage lifecycle cannot be verified without them.


## Mature Implementation Research Notes

Use these findings as implementation constraints:

- Prefer an object-storage abstraction over editor-specific storage code. Local storage, MinIO, LocalStack, AWS S3, and future S3-compatible providers should sit behind the same API-facing object storage contract.
- Prefer a local S3-compatible target for development and E2E. The local stack must create the bucket, configure CORS, expose the object endpoint to the browser, and use path-style URLs when required by the provider.
- Browser uploads must use server-issued short-lived upload grants. The server generates the storage key and authorizes the document before returning upload information.
- Direct upload should not send app cookies to object storage. The browser should rely on signed upload URL/form fields and required headers only.
- Document content should store application attachment IDs or app redirect/download URLs, not raw storage keys, public object URLs, or long-lived signed URLs.
- Storage keys should be opaque, server-generated, and scoped to workspace/user/document context where possible. Users should not control persistent object keys directly.
- Editor upload reliability should use placeholders: insert a temporary block while upload is pending, update progress, replace with confirmed attachment metadata on success, and remove or mark failed placeholders with a retryable error on failure.
- Upload progress should use an API that exposes upload progress when feasible. If `fetch` remains in use, the UI must still surface pending/failure states clearly.
- CORS must be an explicit test target: allowed origin, method, headers, and exposed `ETag`/metadata behavior should be verified against the local storage provider.
- Large or resumable multipart upload is not required for the first Task 20d slice, but the design should leave a path for multipart support later.
- Pending upload intents and orphaned objects need cleanup behavior or a clear follow-up. A failed direct upload must not leave a document block that looks successfully attached.

## Functional Requirements

1. Local API startup fails loudly or documents a clear fallback when attachment storage is not configured.
2. Local review can run with a working attachment object storage target without public cloud credentials.
3. The web upload flow succeeds from the browser and does not rely only on mocked E2E storage.
4. Direct upload and confirmation preserve MIME type, size, checksum/ETag, and safe metadata expectations.
5. Uploaded image/file blocks can be saved, refreshed, reopened, and downloaded through permission-checked API flows.
6. Signed URLs and storage keys never appear in `EditorSnapshot`, shared document DTOs, Markdown-like text, or frontend-persisted block props.
7. Unauthorized or read-only upload attempts fail closed and surface a user-understandable error.
8. Existing document editor save, draft, revision, conflict, and read-only behavior is not regressed.

## Acceptance Criteria

- [ ] A clean local review setup can upload an image/file attachment from `http://127.0.0.1:5173` without public cloud credentials.
- [ ] Automated E2E covers an attachment upload using the same contract shape as production upload-intent/direct-upload/confirm, not only a frontend mock.
- [ ] Uploaded attachment blocks persist through draft autosave or formal revision save and remain visible after refresh/reopen.
- [ ] Download/open uses the existing permission-checked signed download route and keeps signed URLs transient.
- [ ] Tests prove forbidden fields such as signed URLs, storage keys, access keys, and upload headers do not leak into snapshots or DTOs.
- [ ] Missing or invalid local object storage configuration fails with an explicit diagnostic instead of silent upload breakage.
- [ ] Existing health/login/document editor flows continue to pass.
- [ ] Task 20e can focus on block-local code/media UI without rediscovering attachment storage problems.

- [ ] Local object storage CORS is configured and tested with browser-like `Origin`, upload method, required headers, and exposed response metadata.
- [ ] Direct browser upload does not send application cookies to object storage.
- [ ] Editor upload UI represents pending, success, and failure states without leaving false-success attachment blocks in the document.
- [ ] Persisted document content references app-owned attachment identity, not raw object storage URLs or keys.
- [ ] Stale pending upload intents or orphaned uploaded objects have cleanup behavior or an explicitly documented follow-up.

## Verification Commands

Run focused checks first, then broader checks:

```bash
pnpm --filter @jixia/api test -- attachment
pnpm --filter @jixia/web test -- uploadAttachment
pnpm --filter @jixia/web test -- AttachmentBlock
pnpm --filter @jixia/web e2e -- apps/web/e2e/attachment-upload.spec.ts
pnpm --filter @jixia/web e2e -- apps/web/e2e/document-save.spec.ts
pnpm --filter @jixia/api lint
pnpm --filter @jixia/web lint
pnpm --filter @jixia/web build
```

If local object storage setup changes package manifests, scripts, or lockfiles, also run install/build validation.

## Human Review Gate

After implementation, restart local Jixia and explicitly verify:

- image upload from the editor succeeds,
- file upload from the editor succeeds,
- refresh/reopen preserves uploaded blocks,
- open/download works,
- read-only hides mutation controls,
- snapshots never expose signed URLs or storage keys.

## Stop Conditions

Stop and ask before continuing if any of these happen:

- the implementation requires public cloud credentials for local review or CI,
- signed URLs, storage keys, credentials, or upload headers would be persisted in document content,
- API authorization or permission checks need to move into the frontend,
- database schema changes appear necessary,
- production upload contract must be weakened to make local testing pass,
- the task begins drifting into code-block UI, Markdown/PDF export, realtime collaboration, or AI writeback.

## Manual Review Result

Result: `backend upload passed, editor UX failed/partial`.

Backend/upload passed in local review after the local object storage route accepted both `Buffer` and `string` upload bodies. The verified chain was `POST /api/attachments/upload-intents` -> direct `PUT /local-object-storage/upload/...` -> `POST /api/attachments/upload-intents/:id/confirm` -> `POST /api/attachments/:id/download`; downloaded bytes matched the uploaded file. The local runtime used `ATTACHMENT_STORAGE_DRIVER=local`, `LOCAL_OBJECT_STORAGE_ROOT=/tmp/opencode/jixia-local-object-storage`, `LOCAL_OBJECT_STORAGE_PUBLIC_BASE_URL=http://127.0.0.1:3000/local-object-storage`, and `LOCAL_OBJECT_STORAGE_ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173`. Health checks, browser-path login, notebook document listing, and project document listing were also reachable.

Editor UX remains failed/partial. Manual review reported: `codeblock 默认的灰底白字根本看不清，image / file / attachment点击没有反应，我直接复制图片等也不能自动插入文档。问题还是很大`. The storage contract is reusable, but the rich-block editor cannot be considered passed because the remaining failures are in the frontend interaction model: code block theming, block-local media click behavior, and paste/drop insertion.

Decision: keep Task 20d's backend/local storage work as the reusable upload foundation, but route the editor UX failures into Task 20e Block-local Code and Media UX. Do not treat rich-block editing as manually passed until Task 20e closes these frontend gaps.

