# Task 20g BlockNote-native File Pipeline

## Source of Truth

- User directive: stop patching the existing custom block interaction layer and prepare Task20g around a BlockNote-native file pipeline.
- Task20f manual review failure: `.trellis/tasks/06-19-task-20f-browser-observed-block-interaction-repair/prd.md` and `task.json`.
- Task20e manual review failure: `.trellis/tasks/06-19-task-20e-block-local-code-media-ux/prd.md` and `task.json`.
- Task20d backend/local upload foundation: `.trellis/tasks/06-19-task-20d-local-attachment-storage-upload-e2e/prd.md`.
- Task20b BlockNote adapter baseline: `.trellis/tasks/06-19-task-20b-blocknote-editor-adapter/prd.md`.
- Task20r editor engine decision: `.trellis/tasks/06-19-task-20r-editor-engine-adapter-decision-spike/decision.md`.
- Notebook/project editor roadmap: `doc/Notebook_Project_Doc_Editor_Implementation_Plan.md`.
- Shared document lifecycle boundary: `apps/web/src/features/documents/DocumentEditorPage.tsx`.
- Current BlockNote adapter and custom block implementation: `apps/web/src/features/documents/editor/JixiaEditor.tsx`.
- Current attachment block UI: `apps/web/src/features/attachments/AttachmentBlock.tsx`.
- Reusable upload/open helper: `apps/web/src/features/attachments/uploadAttachment.ts`.
- Editor/block styling: `apps/web/src/features/layout/workbench.css`.
- Local object-storage route/signing: `apps/api/src/modules/attachments/local-object-storage.routes.ts`, `apps/api/src/modules/attachments/object-storage.ts`.
- Shared snapshot/attachment contracts: `packages/shared/src/documents.ts`, `packages/shared/src/attachments.ts`.
- Safe metadata and local storage contracts: `.trellis/spec/backend/shared-domain-contracts.md`, `.trellis/spec/guides/cross-layer.md`.

## Background

Task20f tried to repair the browser-observed failures by adding more custom editor-shell and custom attachment-card behavior. That was the wrong direction. The manual result is still failed, and the user gave the correct architectural instruction: do not continue patching the existing custom blocks.

Known facts:

- `JixiaEditor.tsx` uses BlockNote, but still disables native `filePanel` and implements paste/drop by shell-level React event handlers.
- `JixiaEditor.tsx` defines custom `jixiaImage` and `jixiaFile` atomic React blocks and manually threads runtime upload status through block props.
- `AttachmentBlock.tsx` duplicates file picking, click, keyboard, paste, and drop behavior inside a `contentEditable={false}` React island.
- Automated and synthetic E2E tests can pass while manual review still fails, because they exercise narrow selectors and constructed `File` payloads instead of BlockNote's native editor semantics.
- BlockNote's own file model already provides `uploadFile(file, blockId?)`, `resolveFileUrl(url)`, file panel upload/replace, built-in file/image/video/audio blocks, and built-in paste/drop file insertion through `handleFileInsertion`.
- Jixia's backend/local storage contract and `uploadAttachment` helper are reusable. The bad part is the frontend integration layer, not the upload intent/direct PUT/confirm/signed download chain.

## Goal

Replace the custom shell/card file interaction model with a BlockNote-native file pipeline. All file entry points—file panel upload, empty file block add, replace, paste, drop, preview, and download—must flow through BlockNote's native file insertion/upload semantics while adapting to Jixia's private attachment contract.

The result should feel like a mature document editor: users use visible editor/file controls, pasted and dropped files insert at the correct editor location, upload progress/error belongs to the file block lifecycle, and persisted document data contains only safe app-owned attachment identity/metadata.

## Non-Negotiable Constraints

- Do not fork Notebook and Project document editors; keep `DocumentEditorPage` and `JixiaEditor` shared.
- Do not keep adding primary behavior to the current custom `jixiaImage`/`jixiaFile`/`AttachmentBlock` event-propagation layer. Those surfaces may remain only as transitional display/export adapters if needed.
- Prefer BlockNote-native `uploadFile`, `resolveFileUrl`, File Panel, and built-in file insertion/drop/paste semantics before writing new event handlers.
- API remains the authority for authorization, upload intent creation, confirmation, signed download, and storage policy.
- Never persist signed URLs, storage keys, object keys, bucket names, upload headers, credentials, auth headers, cookies, local object-storage paths, or raw storage URLs in `EditorSnapshot`, shared DTOs, block props, browser storage, or AI context.
- Do not weaken Task20d local object-storage or production S3 safety contracts.
- Do not add Markdown/PDF export, collaboration, CRDT/realtime, comments, mentions, or AI writeback.
- Do not introduce CodeMirror or a second editor engine unless BlockNote-native file primitives cannot satisfy the private attachment contract; if that happens, stop and replan.

## In Scope

### BlockNote-native Upload Adapter

- Configure the BlockNote editor with a Jixia upload adapter equivalent to `uploadFile(file, blockId?)`.
- The adapter must reuse `uploadAttachment({ documentId, blockType, file })` or a small wrapper over the same API chain.
- The adapter may return BlockNote block prop updates, but returned persisted values must be safe app-owned identifiers/metadata, not signed storage URLs.
- Upload failure must expose whether the failure happened at intent creation, direct upload, or confirmation, while redacting signed path/query and credentials.

### Resolve URL Adapter

- Configure BlockNote with a resolver equivalent to `resolveFileUrl(url)` for previews/downloads of private Jixia attachments.
- Persist stable app-owned attachment identity or canonical private attachment URL/key; resolve transient signed download URLs only at render/open time.
- Missing, unauthorized, deleted, or expired assets must show controlled error UI rather than broken images or silent failures.

### File Panel and File Blocks

- Re-enable or deliberately configure BlockNote File Panel behavior for file/image upload and replace.
- Support built-in or adapted file/image/video/audio/generic file blocks according to MIME type.
- Preserve safe metadata such as file name, MIME type, size, checksum, caption, alt text, preview visibility, and preview width where supported.
- If custom display blocks remain, they must be downstream adapters around BlockNote's native upload pipeline, not independent upload initiators.

### Paste/Drop Pipeline

- Let BlockNote's built-in paste/drop file insertion handle file DataTransfer payloads where possible.
- Add a custom paste/drop handler only for explicitly unsupported payloads, and it must call BlockNote's default handler or consume the event deliberately to avoid duplicate insertion.
- Drop insertion must use BlockNote/ProseMirror position semantics, not current-cursor-only insertion.
- Clipboard payloads containing both files and `text/html` must have a defined duplicate-prevention rule.

### Compatibility and Migration

- Existing Task20f custom attachment blocks in saved documents must still render safely or be migrated in-memory/exported safely.
- Draft/revision save, refresh, reopen, read-only behavior, and Notebook/Project routing must remain intact.
- Existing local object-storage E2E network assertions should be reused to prove upload intent -> direct PUT -> confirm -> signed download.

## Out of Scope

- New production storage provider work.
- Database schema migration unless BlockNote-native integration cannot safely represent attachment identity in current v1 snapshot; if schema or EditorSnapshotV2 is required, stop and replan.
- Full asset library/browser UI, bulk upload management, versioned attachments, annotations, comments, mentions, collaboration, AI writeback, Markdown/PDF export, or full Notion layout parity.
- Cosmetic redesign unrelated to file pipeline correctness.

## Functional Requirements

1. `JixiaEditor` configures BlockNote with a single Jixia file upload adapter.
2. `JixiaEditor` configures BlockNote with a private attachment URL resolver for preview/download.
3. The editor does not depend on shell-level `onPasteCapture`/`onDropCapture` as the primary file insertion path.
4. The editor does not depend on `AttachmentBlock` hidden-input/card event plumbing as the primary upload path.
5. File Panel upload and replace use the same upload adapter as paste and drop.
6. Paste image/file creates exactly one file/media block at the BlockNote insertion location.
7. Drop image/file inserts at the drop location, not merely after the last cursor block.
8. Direct local object-storage upload succeeds from the browser, with CORS/preflight/ETag evidence.
9. Read-only documents hide upload/replace/remove/metadata mutation while preserving safe preview/open/download/copy behavior.
10. Persisted snapshots contain only safe app-owned attachment identity and display metadata.

## Acceptance Criteria

- [ ] File Panel upload tab is available when editing and is absent/disabled in read-only documents.
- [ ] Inserting an image/file via BlockNote file panel uploads through Jixia's upload intent -> direct PUT -> confirm chain.
- [ ] Replacing an existing file block uses the same upload adapter and updates only that block.
- [ ] Pasting an image inserts one image/media block at the paste location and persists after save/refresh/reopen.
- [ ] Pasting a non-image file inserts one file block at the paste location and persists after save/refresh/reopen.
- [ ] Dropping an image/file between blocks inserts at the drop location and persists after save/refresh/reopen.
- [ ] Preview/open/download uses resolver-time signed access, not persisted signed URLs.
- [ ] Network inspection shows successful upload intent, browser direct local-object-storage PUT, confirm, and signed download.
- [ ] No signed URL, object key, bucket, upload header, credential, auth header, cookie, or local storage path is persisted in document snapshots or shared DTOs.
- [ ] Notebook and Project documents pass the same browser checklist through the shared editor.

## Manual Review Gate

Restart local Jixia and verify in both Notebook and Project documents:

- BlockNote/File Panel or native picker path is visible and usable.
- Empty file/image/media insertion does not require guessing where a hidden custom card click target is.
- Paste image auto-inserts, uploads, confirms, saves, reloads, and previews.
- Paste non-image file auto-inserts, uploads, confirms, saves, reloads, and downloads.
- Drop image/file inserts at the visual drop location.
- Replace/open/download controls work.
- Read-only documents hide mutation and preserve safe open/download/preview.
- Browser Network shows no persisted storage secrets and successful direct upload path.

## Verification Commands

Run browser-first checks before claiming success:

```bash
pnpm --filter @jixia/web exec playwright test --config ../../playwright.config.ts e2e/attachment-upload.spec.ts
pnpm --filter @jixia/web exec playwright test --config ../../playwright.config.ts e2e/document-save.spec.ts
pnpm --filter @jixia/web test -- JixiaEditor
pnpm --filter @jixia/web test -- AttachmentBlock
pnpm --filter @jixia/web test -- uploadAttachment
pnpm --filter @jixia/web lint
pnpm --filter @jixia/web build
```

If direct-upload server behavior is touched, also run:

```bash
pnpm --filter @jixia/api test -- attachment
pnpm --filter @jixia/api lint
```

## Stop Conditions

Stop and ask before continuing if any of these happen:

- BlockNote-native upload/file primitives cannot be adapted to Jixia's private attachment contract.
- The implementation would persist signed URLs, storage keys, object keys, upload headers, credentials, auth headers, cookies, or local storage paths.
- Authorization would move from API to frontend.
- The work requires database migration or EditorSnapshotV2 rollout.
- Notebook and Project editor paths diverge.
- The work drifts back into custom shell/card event patching as the primary solution.
- The work drifts into export, collaboration, AI, comments, mentions, or unrelated UI redesign.

## Manual Review Result

Result: `architecture improved, manual UX/upload partial/failed`.

The Task20g implementation moved the editor in the right architectural direction by adopting BlockNote-native `uploadFile`, `resolveFileUrl`, File Panel, native file/image block insertion, and native paste/drop paths instead of continuing to patch the old custom shell/card event layer. Automated unit and browser checks passed in the implementation flow.

Manual review is still not passed. The reported failures were: `Code block 的语言/copy/wrap 功能不知道怎么用，Paste/drop 失败，Attachment card click 现在会显示上传按钮，但是上传还是失败显示error。问题还是很大`.

Decision: keep Task20g as an architecture checkpoint, not as a completed UX pass. The next task should harden the real manual-review path: local public-base/origin/CORS/direct-upload proof, real clipboard and OS drag payloads, legacy attachment-card fallback behavior, and Notion-like code block affordances with explicit copy/wrap feedback.
