# Task 20f Browser-observed Block Interaction Repair

## Source of Truth

- Task 20e failed manual review: `.trellis/tasks/06-19-task-20e-block-local-code-media-ux/prd.md`
- Task 20d backend/local upload foundation: `.trellis/tasks/06-19-task-20d-local-attachment-storage-upload-e2e/prd.md`
- Task 20b BlockNote editor adapter baseline: `.trellis/tasks/06-19-task-20b-blocknote-editor-adapter/prd.md`
- Task 20r editor engine decision: `.trellis/tasks/06-19-task-20r-editor-engine-adapter-decision-spike/decision.md`
- Notebook/project editor roadmap: `doc/Notebook_Project_Doc_Editor_Implementation_Plan.md`
- Shared document lifecycle boundary: `apps/web/src/features/documents/DocumentEditorPage.tsx`
- BlockNote adapter and custom block implementation: `apps/web/src/features/documents/editor/JixiaEditor.tsx`
- Attachment block UI: `apps/web/src/features/attachments/AttachmentBlock.tsx`
- Upload/open helper: `apps/web/src/features/attachments/uploadAttachment.ts`
- Editor/block styling: `apps/web/src/features/layout/workbench.css`
- Local object-storage route and signing: `apps/api/src/modules/attachments/local-object-storage.routes.ts`, `apps/api/src/modules/attachments/object-storage.ts`
- Shared snapshot/attachment contracts: `packages/shared/src/documents.ts`, `packages/shared/src/attachments.ts`
- Safe metadata and local storage contracts: `.trellis/spec/backend/shared-domain-contracts.md`, `.trellis/spec/guides/cross-layer.md`

## Background

Task 20e added a lot of code and passed automated checks, but manual review still failed. That is the only result that matters for this task. The user reported:

> code block 块内不知道如何进行language/copy/wrap 操作，image / file / attachment点击没有反应，我直接复制图片等显示Attachment direct upload failed before confirmation.，不能自动插入文档。问题还是很大

Known implementation facts:

- `JixiaEditor.tsx` now has a custom `jixiaCodeBlock` with language/copy/wrap controls, but `workbench.css` hides the toolbar by default until hover/focus. The control exists; the user cannot discover or reliably use it.
- `AttachmentBlock.tsx` has click, keyboard, paste, and drop handlers, but real manual review still sees inert cards. Synthetic component tests did not prove the BlockNote/contentEditable/event-wrapper path.
- `JixiaEditor.tsx` owns editor-level paste/drop and creates upload placeholders, but it still disables BlockNote `filePanel` and does not use BlockNote-native `uploadFile`/`resolveFileUrl`/file insertion paths.
- The exact error `Attachment direct upload failed before confirmation.` is thrown by the direct PUT `fetch` before an HTTP response is received. This points to real browser network/CORS/preflight/public-base-url/origin/service reachability, not a confirmation failure.
- Mature editors do not treat paste/drop/click upload as secondary polish. Notion makes block controls visible and local to the selected block. Obsidian imports pasted/dropped files into an app-owned attachment location and embeds them immediately. BlockNote already has upload and file panel primitives that Jixia should reuse unless they cannot satisfy the private attachment contract.

## Goal

Repair the editor using real browser evidence, not synthetic optimism: code-block controls must be visible and usable, image/file/attachment cards must respond to click and keyboard in the actual BlockNote editor, pasted/dropped files must auto-insert and upload through a browser-proven direct-upload path, and the shared Notebook/Project document boundary must remain intact.

## Non-Negotiable Constraints

- Do not fork Notebook and Project document editors; keep `DocumentEditorPage` and `JixiaEditor` shared.
- API remains the authority for authorization, attachment intent creation, confirmation, and signed download.
- Never persist signed URLs, storage keys, object keys, bucket names, upload headers, credentials, auth headers, cookies, local object-storage paths, or raw storage URLs in `EditorSnapshot`, shared DTOs, block props, browser storage, or AI context.
- Do not weaken Task 20d's local object-storage or production S3 safety contract.
- Do not add Markdown/PDF export, collaboration, CRDT/realtime, comments, mentions, or AI writeback.
- Do not hide critical manual-review controls behind hover-only UI unless the selected-block state visibly exposes them.
- Do not trust unit tests alone for click/paste/drop/upload behavior. Browser-observed evidence is required.
- Do not introduce CodeMirror or a second editor engine unless BlockNote cannot support the required behavior after using its native upload/file primitives; if that happens, stop and replan.

## In Scope

### Browser-observed Diagnosis

- Reproduce the manual failures in a running browser with Notebook and Project documents.
- Capture whether click events reach `AttachmentBlock` inside the actual BlockNote/contentEditable wrapper.
- Capture the exact `OPTIONS` and `PUT /local-object-storage/upload/...` network behavior for pasted/dropped files, including request URL, origin, preflight request headers, response headers, status, and browser console error.
- Add temporary diagnostics only if needed, and remove them before completion unless they are deliberate test instrumentation.

### Code Block Repair

- Replace hidden hover-only code controls with a discoverable block-local header.
- Make language visible near the top-left or obvious selected-block region, with copy and wrap actions visible enough for normal users.
- Keep copy available in read-only documents; hide/disable language and wrap mutation in read-only documents.
- Preserve code content, language, wrap metadata, keyboard editing, selection, and save/refresh/reopen behavior.

### Media/File/Attachment Block Repair

- Make the actual block surface respond to click and keyboard activation in the real browser, not just in component tests.
- Prefer BlockNote-native file insertion/upload primitives (`uploadFile`, `resolveFileUrl`, file panel/insertion hooks) where they can be adapted to Jixia's private attachment contract.
- If custom blocks remain necessary, prove that event handling works inside BlockNote's wrapper and eliminate hidden-input/event propagation traps.
- Keep explicit open/download/replace/remove controls, read-only mutation hiding, and safe metadata editing.

### Paste/Drop and Direct Upload Repair

- Pasted and dropped images/files must insert a visible pending block at the cursor or drop location.
- Direct upload must succeed from the real browser against local object storage, or fail with a diagnostic that identifies CORS, preflight, URL, origin, or service issue.
- Replace pending blocks with confirmed app-owned attachment IDs on success.
- Preserve a retryable/removable failed placeholder on failure; never show false success.
- Persist only safe app metadata after save/refresh/reopen.

### Verification

- Add/update Playwright paths that exercise the same browser behavior the user reviews: card click, keyboard activation, paste image, paste file, drop image/file, save/refresh/reopen, open/download, read-only mutation hiding.
- Add network assertions for the local direct-upload path: upload intent, browser direct PUT to local object storage, confirm, signed download.
- Keep focused unit/component tests for pure transformation and safety logic, but do not use them as the primary proof of interactive success.

## Out of Scope

- New production storage provider work.
- Database schema migration.
- EditorSnapshotV2 unless v1 cannot safely represent confirmed attachment identity and metadata; if v2 is required, stop and replan.
- Markdown export, PDF export, AI writeback, realtime collaboration, CRDT, comments, mentions, or full Notion layout parity.
- Cosmetic redesign unrelated to the failed manual paths.

## Functional Requirements

1. Code block language/copy/wrap controls are visible and obvious in normal manual review.
2. Read-only code blocks show non-mutating language/copy affordances and hide mutation controls.
3. Empty image/file/attachment cards open the file picker when clicked in the actual BlockNote editor.
4. Attached image/file cards open or preview safely on click and keep explicit replace/remove/open/download controls.
5. Pasted image and non-image files auto-insert pending blocks and upload successfully through the existing attachment contract.
6. Dropped image/file data inserts at a predictable cursor/drop location and uses the same upload path.
7. Direct local object-storage upload succeeds from the browser with correct CORS/preflight/public-base-url behavior.
8. Upload failure clearly identifies and preserves a retryable/removable failed placeholder.
9. Save, refresh, and reopen preserve only confirmed safe attachment metadata and code metadata.
10. Notebook and Project documents share the same editor implementation and behavior.

## Acceptance Criteria

- [ ] Browser manual review can find and use code language/copy/wrap without reading code or hovering randomly.
- [ ] Browser manual review can click empty image/file/attachment cards and see the native file picker or equivalent upload picker.
- [ ] Browser manual review can paste an image and see it inserted, uploaded, confirmed, saved, refreshed, and reopened.
- [ ] Browser manual review can paste a non-image file and see it inserted, uploaded, confirmed, saved, refreshed, and reopened.
- [ ] Browser manual review can drop an image/file onto the editor and see predictable insertion and confirmation.
- [ ] Network inspection shows successful upload intent, direct local-object-storage PUT, confirm, and signed download without persisted storage secrets.
- [ ] Read-only documents hide upload/replace/remove/metadata mutation and preserve safe open/download/copy behavior.
- [ ] No signed URL, object key, bucket, upload header, credential, auth header, cookie, or local storage path is persisted in document snapshots or shared DTOs.
- [ ] Notebook and Project documents both pass the same manual browser checklist.

## Manual Review Gate

Restart local Jixia and verify in both Notebook and Project documents:

- code block controls are visible and usable,
- code read-only behavior is correct,
- empty media/file/attachment card click opens upload picker,
- attached media/file card click/open/download works,
- paste image auto-inserts and uploads,
- paste non-image file auto-inserts and uploads,
- drop image/file auto-inserts and uploads,
- failed upload can be retried or removed,
- save draft/formal revision, refresh, and reopen preserve confirmed blocks,
- browser Network confirms direct upload path and no persisted storage secrets.

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

- the fix would persist signed URLs, storage keys, object keys, upload headers, credentials, auth headers, cookies, or local storage paths,
- authorization would move from API to frontend,
- the work requires schema migration or EditorSnapshotV2 rollout,
- the existing Task 20d local/S3 storage contract must be weakened,
- Notebook and Project editor paths diverge,
- BlockNote-native upload/file primitives cannot be adapted and the task needs an editor-engine replan,
- work drifts into export, collaboration, AI, comments, mentions, or unrelated UI redesign.

## Manual Review Result

Result: `manual review failed; stop patching custom block interactions`.

The Task20f implementation completed the Trellis implement/debug/finish flow and strengthened browser tests, but manual review still found the editor behavior effectively unchanged: code-block language/copy/wrap controls are not discoverable enough, image/file/attachment block click still appears inert, and paste/drop still does not behave like a mature document editor. The existing custom `jixiaCodeBlock`, `jixiaImage`, `jixiaFile`, shell-level paste/drop handlers, and `AttachmentBlock` hidden-input/card event plumbing are the wrong abstraction to keep patching.

Decision: keep the Task20f code as a checkpoint, but mark the task as manually failed. Route the next work to Task20g: build a BlockNote-native file pipeline using BlockNote `uploadFile`, `resolveFileUrl`, file panel/file insertion behavior, and Jixia's existing safe attachment upload contract. Do not continue adding event-propagation patches to the current custom block surfaces as the primary solution.
