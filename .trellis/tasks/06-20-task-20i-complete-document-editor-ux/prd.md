# Task 20i Complete Document Editor UX

## Source of Truth

- Failed predecessor: `.trellis/tasks/06-20-task-20h-manual-review-hardening/task.json`
- Previous architecture checkpoint: `.trellis/tasks/06-20-task-20g-blocknote-native-file-pipeline/task.json`
- Previous manual-review result: `.trellis/tasks/06-20-task-20g-blocknote-native-file-pipeline/prd.md`
- Manual hardening PRD that was not enough: `.trellis/tasks/06-20-task-20h-manual-review-hardening/prd.md`
- Earlier browser-observed repair failure: `.trellis/tasks/06-19-task-20f-browser-observed-block-interaction-repair/prd.md`
- Local attachment storage foundation: `.trellis/tasks/06-19-task-20d-local-attachment-storage-upload-e2e/prd.md`
- Shared editor adapter: `apps/web/src/features/documents/editor/JixiaEditor.tsx`
- Legacy attachment UI: `apps/web/src/features/attachments/AttachmentBlock.tsx`
- Browser upload adapter: `apps/web/src/features/attachments/uploadAttachment.ts`
- Local object-storage boundary: `apps/api/src/modules/attachments/object-storage.ts`, `apps/api/src/modules/attachments/local-object-storage.routes.ts`
- Editor roadmap: `doc/Notebook_Project_Doc_Editor_Implementation_Plan.md`

## Root Problem

This is not a single broken button. The broken data structure is the task state machine: prior work split one user-visible document editor flow into fragments that could each appear green while the user still could not use the editor.

Task 20h is now explicitly `manual-review-failed`. Task 20i must not repeat the same mistake. The unit of completion is the complete browser-observed document editor flow from the reviewer origin, not a private architecture milestone.

The failing layers are:

1. **Upload boundary**: direct upload URLs, public base URL, preflight/CORS, and service reachability must match the actual browser origin, including LAN review origins such as `http://10.128.253.195:5173`.
2. **Editor product model**: BlockNote-native file/image insertion and legacy `AttachmentBlock` upload behavior currently coexist as competing interaction models.
3. **Code-block affordance**: language, copy, and wrap controls are present only in a weak or undiscoverable form.
4. **Paste/drop proof**: synthetic File events are not enough proof for real OS clipboard and file-manager drag payloads.
5. **Trellis gate**: no task may be marked finished until manual-review failure modes are closed or explicitly recorded as blockers.

## Goal

Deliver a complete, shared Notebook/Project document editor experience that a reviewer can use without knowing the implementation:

- write and edit normal document content,
- insert and persist image/file attachments through one safe upload path,
- paste and drop real files with visible progress/error recovery,
- use code blocks with obvious language/copy/wrap controls,
- save, refresh, reopen, and read documents without leaking storage secrets.

## Non-Negotiable Constraints

- Keep one shared `DocumentEditorPage` and `JixiaEditor` boundary for Notebook and Project documents.
- API remains the authority for authorization, upload intents, confirmation, signed downloads, and attachment identity.
- Do not persist signed URLs, storage keys, object keys, bucket names, upload headers, credentials, auth headers, cookies, local filesystem paths, local object-storage paths, or raw storage URLs in document snapshots, DTOs, browser storage, or AI context.
- Do not weaken CORS with wildcard committed defaults. Dev/manual origins must be explicit or safely derived for local-only review.
- Do not introduce a second editor engine, Markdown-source pivot, CodeMirror source mode, collaboration, comments, mentions, AI writeback, export, or unrelated page redesign.
- Do not claim success from architecture, source-code existence, or synthetic-only tests.
- If fixing this requires a database migration or EditorSnapshotV2 rollout, stop and replan before implementing it.

## In Scope

### 1. Browser-Reachable Upload Boundary

- Make local object-storage `publicBaseUrl` and allowed origins correct for the actual reviewer browser origin.
- Ensure preflight and direct `PUT` are reachable from the browser, not only from Node or localhost.
- Preserve no-credentials browser direct upload, followed by API confirmation.
- Improve diagnostics so failures name the failing boundary: intent, preflight, direct upload, confirm, signed download, or render.
- Document exact manual-review env values for both localhost and LAN-origin review.

### 2. Unified Attachment Ingestion

- Route slash command/image upload, toolbar or File Panel insertion, empty attachment affordance, paste, and drop through one editor upload adapter and one state model.
- Demote legacy `jixiaImage`/`jixiaFile` and `AttachmentBlock` interaction to read-compatible fallback or wire it to the same adapter without creating a second upload product.
- Use visible upload placeholders with progress, success, failure, retry, replace, and remove states.
- Store only safe confirmed metadata: app attachment ID, filename, MIME type, size, checksum, uploaded timestamp, captions/alt text, and preview flags.
- Resolve private previews/downloads through `resolveFileUrl` or API signed download only at render time.

### 3. Real Paste/Drop Behavior

- Handle real pasted images from the OS clipboard.
- Handle real pasted non-image files where browser payloads support it.
- Handle files dragged from the OS file manager into the editor.
- Insert near the cursor/drop position where feasible; if not feasible, use a predictable block insertion rule.
- Do not break normal HTML, URL, or plain-text paste.
- Failed paste/drop uploads must leave a visible recoverable block.

### 4. Discoverable Code Blocks

- Provide visible block-local chrome for code blocks, not hover-only mystery controls.
- Language selection must be labeled and usable from keyboard/focus/selected block state.
- Copy must work in editable and read-only documents and show success/failure feedback.
- Wrap must expose current state and be scoped to the block.
- Read-only documents must allow copy/open/download but hide mutation controls.

### 5. Complete Editor Baseline

- Preserve normal writing behaviors: paragraphs, headings, lists, checklist-like content if supported, quote/divider/basic blocks, block selection, keyboard entry, save, refresh, and reopen.
- Notebook and Project documents must behave identically except for route/container context.
- Existing saved documents must remain readable.

## Functional Requirements

1. A reviewer on the configured origin can upload an image and a non-image file through the editor.
2. Browser Network shows intent, preflight when applicable, direct upload, confirm, signed download, save, refresh, and reopen succeeding.
3. No storage secret or signed/raw storage URL is persisted in document snapshots or DTOs.
4. Every attachment entry point uses the same upload adapter/state model.
5. Legacy attachment blocks remain readable but do not present a separate primary upload path.
6. Pasted images produce visible upload state, confirmed metadata, and stable render after reopen.
7. Dropped files produce visible upload state, confirmed metadata, and stable render after reopen.
8. Upload failure leaves retry, replace, remove, and understandable error state.
9. Code block language/copy/wrap controls are visible and understandable in normal use.
10. Copy works and reports feedback in both editable and read-only modes.
11. Wrap state persists or behaves consistently according to the chosen editor state model.
12. Notebook and Project document flows pass the same checklist.

## Hard Acceptance Criteria

- [ ] `.trellis/.current-task` points to `.trellis/tasks/06-20-task-20i-complete-document-editor-ux` before implementation starts.
- [ ] Task 20h remains recorded as `manual-review-failed`; Task 20i does not erase that history.
- [ ] Manual-review instructions name the exact reviewer origin, API origin, local object-storage public base URL, and allowed origin configuration.
- [ ] From the reviewer browser origin, upload intent succeeds.
- [ ] From the reviewer browser origin, direct upload preflight/`PUT` reaches the object-storage route and succeeds without credentials.
- [ ] Confirm succeeds and signed download renders after save, refresh, and reopen.
- [ ] Code block language/copy/wrap controls are visible without source-code knowledge or random hover hunting.
- [ ] Paste image, paste file, drop image, and drop file are manually checked with real OS/browser payloads.
- [ ] Failed upload can be retried, replaced, or removed without corrupting the document.
- [ ] Read-only mode hides mutation controls while preserving copy/open/download.
- [ ] Notebook and Project documents have identical editor behavior.
- [ ] Automated tests are updated for the boundaries they can honestly prove, and the remaining manual checks are written down.

## Manual Review Gate

Run this gate from the exact origin the human reviewer uses, not a convenient localhost-only substitute.

1. Record reviewer origin, API base, and local object-storage public base URL.
2. Open a Notebook document and verify basic writing/edit/save/reopen.
3. Open a Project document and verify the same writing/edit/save/reopen behavior.
4. Insert a code block; change language; copy; toggle wrap; repeat in read-only mode for copy.
5. Upload an image through the primary editor path.
6. Upload a non-image file through the primary editor path.
7. Paste an OS clipboard image into the editor.
8. Drag an image from the OS file manager into the editor.
9. Drag a non-image file from the OS file manager into the editor.
10. Force direct-upload failure and verify the failed block has retry, replace, and remove.
11. Save, refresh, reopen, and inspect persisted snapshot/DTO for forbidden storage fields.
12. Do not mark finished unless these observations are true or a blocker is recorded.

## Suggested Verification Commands

```bash
pnpm --filter @jixia/web test -- JixiaEditor
pnpm --filter @jixia/web test -- uploadAttachment
pnpm --filter @jixia/web exec playwright test --config ../../playwright.config.ts e2e/attachment-upload.spec.ts
pnpm --filter @jixia/web exec playwright test --config ../../playwright.config.ts e2e/document-save.spec.ts
pnpm --filter @jixia/web lint
pnpm --filter @jixia/web build
```

If API upload/CORS behavior changes:

```bash
pnpm --filter @jixia/api test -- attachment
pnpm --filter @jixia/api lint
```

## Recommended Implementation Order

1. Fix the local/manual upload boundary first: public base URL, allowed origins, preflight, direct `PUT`, confirmation, diagnostics, and docs.
2. Collapse attachment ingestion to one adapter/state model and demote legacy upload interaction.
3. Implement visible upload placeholders and retry/replace/remove state for all insertion paths.
4. Add real paste/drop handling through the same adapter.
5. Rework code-block chrome for visible language/copy/wrap feedback.
6. Verify Notebook and Project parity.
7. Update automated tests only where they prove real behavior; keep a written manual gate for OS clipboard and file-manager drag.

## Stop Conditions

Stop and ask before continuing if:

- the fix would persist signed URLs, raw storage URLs, storage keys, upload headers, credentials, auth headers, cookies, local filesystem paths, or local object-storage paths,
- authorization would move from API to frontend,
- CORS would be widened to unsafe wildcard defaults,
- Notebook and Project editors would fork,
- database migration or EditorSnapshotV2 becomes necessary,
- BlockNote primitives cannot support the required upload/code-block UX after a real attempt,
- the work drifts into export, collaboration, comments, mentions, AI writeback, or unrelated redesign.
