# Task 20h Manual Review Hardening

## Source of Truth

- Task 20g manual review result: `.trellis/tasks/06-20-task-20g-blocknote-native-file-pipeline/task.json`
- Task 20g PRD and architecture checkpoint: `.trellis/tasks/06-20-task-20g-blocknote-native-file-pipeline/prd.md`
- Task 20f failed manual review: `.trellis/tasks/06-19-task-20f-browser-observed-block-interaction-repair/prd.md`
- Task 20d local object-storage upload foundation: `.trellis/tasks/06-19-task-20d-local-attachment-storage-upload-e2e/prd.md`
- BlockNote editor adapter: `apps/web/src/features/documents/editor/JixiaEditor.tsx`
- Legacy attachment card UI: `apps/web/src/features/attachments/AttachmentBlock.tsx`
- Browser upload adapter: `apps/web/src/features/attachments/uploadAttachment.ts`
- Local object-storage config and CORS: `apps/api/src/modules/attachments/object-storage.ts`, `apps/api/src/modules/attachments/local-object-storage.routes.ts`
- Attachment upload E2E coverage: `apps/web/e2e/attachment-upload.spec.ts`
- Notebook/project editor roadmap: `doc/Notebook_Project_Doc_Editor_Implementation_Plan.md`
- Shared safety specs: `.trellis/spec/guides/cross-layer.md`, `.trellis/spec/backend/shared-domain-contracts.md`, `.trellis/spec/frontend/index.md`

## Background

Task 20g moved Jixia toward the right architecture: BlockNote-native file/image blocks, `uploadFile`, `resolveFileUrl`, File Panel support, and private attachment metadata. Automated checks passed, but manual review still failed/partial. The user report that must drive this task is:

> Code block 的语言/copy/wrap 功能不知道怎么用，Paste/drop 失败，Attachment card click 现在会显示上传按钮，但是上传还是失败显示error。问题还是很大

Treat this as a product failure, not a small styling bug. Mature editors make the interaction model obvious and route all file ingestion through one reliable path. Jixia currently has two competing attachment entrypoints and local upload defaults that are too localhost-specific for LAN/manual review.

Known diagnosis:

- `JixiaEditor.tsx` configures BlockNote-native `uploadFile` and `resolveFileUrl`, but legacy `jixiaImage`/`jixiaFile` blocks still render `AttachmentBlock` as a parallel interaction surface.
- Code-block controls exist, but discoverability is poor: language is a plain selector, copy has no success/failure feedback, wrap is not presented like a stable block action, and non-hover/focus affordances are weak.
- Local object storage defaults only allow `http://127.0.0.1:5173` and `http://localhost:5173`, while manual review may run from a LAN origin such as `http://10.128.253.195:5173`.
- Synthetic Playwright paste/drop tests do not prove real OS clipboard or file drag payload behavior.

## Goal

Harden the editor for real manual review: direct upload must work from the configured manual-review origin, all attachment insertion paths must use one BlockNote-native/Jixia-safe upload adapter, paste/drop must insert visible retryable upload placeholders, and code-block language/copy/wrap controls must be obvious without reading source code.

## Non-Negotiable Constraints

- Do not fork Notebook and Project document editors; keep the shared `DocumentEditorPage` and `JixiaEditor` boundary.
- API remains the authority for authorization, attachment intents, confirmation, and signed download.
- Never persist signed URLs, storage keys, object keys, bucket names, upload headers, credentials, auth headers, cookies, local filesystem paths, local object-storage paths, or raw storage URLs in document snapshots, shared DTOs, browser storage, or AI context.
- Keep Task 20d's local object-storage/S3 safety boundary: browser direct upload uses a signed URL without credentials, then API confirmation.
- Do not weaken CORS by allowing every origin in committed defaults. Manual-review origins must be explicit configuration or a safe dev-only derivation.
- Do not continue patching hidden-input/card event propagation as the primary solution.
- Do not introduce a second editor engine, CodeMirror, Markdown-source mode, collaboration, CRDT, comments, mentions, AI writeback, export, or unrelated UI redesign.
- Manual review evidence matters more than synthetic unit optimism.

## In Scope

### Local Upload Origin Hardening

- Make local object-storage public base URL and allowed origins easy to configure for LAN/manual review.
- Ensure a browser opened at a non-localhost dev origin can complete upload intent, direct `PUT /local-object-storage/upload/...`, confirm, signed download, save, refresh, and reopen.
- Add or update diagnostics so CORS/public-base/origin failures are clear to developers and recoverable in the UI.
- Document required env variables for manual review, especially `LOCAL_OBJECT_STORAGE_PUBLIC_BASE_URL` and `LOCAL_OBJECT_STORAGE_ALLOWED_ORIGINS`.

### Unified Attachment Ingestion

- Route `/image`, `/file`, toolbar insertion, File Panel upload, paste, drop, and attachment-card upload affordances through one upload adapter and one state model.
- Treat legacy `jixiaImage`/`jixiaFile` as read-compatible/migration fallback, not the primary interactive upload path.
- Preserve safe confirmed metadata only: app attachment ID, original filename, MIME type, size, checksum, uploaded timestamp, caption/alt/preview flags.
- Keep private download resolution through `resolveFileUrl`/API signed download, not persisted signed URLs.

### Paste/Drop Manual Behavior

- Editor-level paste/drop must detect real file payloads and insert at the cursor/drop position where feasible.
- Pasted images, pasted non-image files, dropped images, and dropped files must use the same upload path and placeholder state.
- HTML/URL/text paste should not be broken by file handling.
- Failed uploads must leave a visible failed placeholder with retry, replace, and remove actions.

### Code Block Discoverability

- Replace the current weak custom toolbar experience with a Notion-like block-local chrome or a BlockNote-native/custom `codeBlock` implementation with clear affordances.
- Language selection must be visible as a chip/control near the code block, preferably searchable or at least clearly labeled.
- Copy must work in read-only and editable documents and show immediate feedback (`Copy` -> `Copied` -> reset, or clear failure state).
- Wrap must be discoverable as a per-block action and expose current state.
- Hover-only controls are not enough; keyboard focus/selected-block/mobile-safe access must exist.

### Verification

- Add/update browser-first tests for LAN/non-localhost direct upload configuration.
- Keep synthetic paste/drop tests, but add manual-review checklist coverage for real OS clipboard/file drag behavior.
- Verify Notebook and Project documents share identical behavior.
- Verify read-only documents hide mutation controls while preserving safe copy/open/download.
- Verify save/refresh/reopen keeps only safe metadata.

## Out of Scope

- Production storage provider redesign.
- Database schema migration unless current safe metadata cannot represent the confirmed attachment identity; if migration is required, stop and replan.
- EditorSnapshotV2 unless unavoidable; if required, stop and replan.
- Full Notion parity, page layout systems, comments, mentions, collaboration, AI writeback, export, or unrelated visual redesign.

## Functional Requirements

1. Manual review from the configured LAN/non-localhost origin can upload files successfully.
2. Code-block language/copy/wrap actions are obvious and usable without source-code knowledge.
3. Copy provides success/failure feedback and works in read-only mode.
4. Wrap exposes current state and remains per-block.
5. All attachment insertion paths use the same upload adapter and safe metadata contract.
6. Legacy attachment blocks remain readable but are not the primary upload UX.
7. Paste image inserts a visible upload placeholder, uploads, confirms, saves, refreshes, and reopens.
8. Paste non-image file follows the same path.
9. Drop image/file follows the same path and inserts predictably.
10. Upload failure preserves a retryable/removable failed placeholder with a user-understandable reason.
11. Browser direct upload uses no credentials and never persists storage secrets.
12. Notebook and Project documents pass the same checklist.

## Acceptance Criteria

- [ ] `.trellis/.current-task` points to this task directory before implementation starts.
- [ ] Local manual review instructions include explicit LAN origin/public-base/CORS env configuration.
- [ ] Browser Network shows successful intent -> direct PUT -> confirm -> signed download from the configured manual-review origin.
- [ ] Code block language/copy/wrap controls are discoverable in normal manual use, not only after random hover.
- [ ] Copy action visibly confirms success or reports failure.
- [ ] Paste image and paste file auto-insert, upload, confirm, save, refresh, and reopen.
- [ ] Drop image and drop file auto-insert, upload, confirm, save, refresh, and reopen.
- [ ] Empty attachment upload affordance opens a picker or native File Panel path that uses the same upload adapter.
- [ ] Failed upload can be retried, replaced, or removed.
- [ ] Read-only documents hide upload/replace/remove/language mutation while keeping copy/open/download safe.
- [ ] No signed URL, storage key, object key, bucket, upload header, credential, auth header, cookie, local filesystem path, or raw storage URL is persisted in snapshots or DTOs.
- [ ] Notebook and Project document editors behave identically.

## Manual Review Gate

Run from the exact origin used by the human reviewer, not only `localhost`:

1. Start API with local object storage public base reachable by the browser.
2. Start web with Vite host available from that browser origin.
3. Configure allowed origins to include the browser origin exactly.
4. Open a Notebook document and a Project document.
5. Create/edit a code block and verify language, copy, and wrap affordances.
6. Paste an image from the OS clipboard.
7. Paste or drag a non-image file.
8. Drag an image/file from the OS file manager into the editor.
9. Force an upload failure and verify retry/replace/remove.
10. Save, refresh, reopen, and verify confirmed blocks still render through private signed download.
11. Repeat read-only checks.

## Suggested Verification Commands

```bash
pnpm --filter @jixia/web exec playwright test --config ../../playwright.config.ts e2e/attachment-upload.spec.ts
pnpm --filter @jixia/web exec playwright test --config ../../playwright.config.ts e2e/document-save.spec.ts
pnpm --filter @jixia/web test -- JixiaEditor
pnpm --filter @jixia/web test -- uploadAttachment
pnpm --filter @jixia/web lint
pnpm --filter @jixia/web build
```

If API object-storage behavior changes:

```bash
pnpm --filter @jixia/api test -- attachment
pnpm --filter @jixia/api lint
```

## Stop Conditions

Stop and ask before continuing if:

- a proposed fix persists storage secrets or signed URLs,
- API authorization would move to the frontend,
- CORS would be weakened to an unsafe wildcard default,
- Notebook and Project editors would diverge,
- schema migration or EditorSnapshotV2 becomes necessary,
- BlockNote-native file/code primitives cannot support the target behavior after a real attempt,
- the work drifts into export, collaboration, comments, mentions, AI writeback, or unrelated redesign.

## Recommended Implementation Order

1. Fix local manual-review upload environment: public base, allowed origin, diagnostics, documentation.
2. Introduce one editor attachment upload adapter/state model and route native File Panel plus upload affordances through it.
3. Move paste/drop to editor-level ingestion using the same adapter and visible placeholder state.
4. Demote legacy `jixiaImage`/`jixiaFile` interaction to read-compatible fallback/migration path.
5. Rework code-block chrome for visible language/copy/wrap feedback.
6. Add browser tests for non-localhost origin and update the manual review checklist.
7. Run Notebook and Project manual review before marking the task finished.
