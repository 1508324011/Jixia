# Task 20e Block-local Code and Media UX

## Source of Truth

- Task 20c failed manual review: `.trellis/tasks/06-19-task-20c-rich-block-editing-polish/prd.md`
- Task 20d manual review result and upload foundation: `.trellis/tasks/06-19-task-20d-local-attachment-storage-upload-e2e/prd.md`
- Task 20b BlockNote editor adapter baseline: `.trellis/tasks/06-19-task-20b-blocknote-editor-adapter/prd.md`
- Task 20r editor engine decision: `.trellis/tasks/06-19-task-20r-editor-engine-adapter-decision-spike/decision.md`
- Notebook/project editor roadmap: `doc/Notebook_Project_Doc_Editor_Implementation_Plan.md`
- Shared document lifecycle boundary: `apps/web/src/features/documents/DocumentEditorPage.tsx`
- BlockNote adapter and snapshot conversion: `apps/web/src/features/documents/editor/JixiaEditor.tsx`
- Attachment block UI: `apps/web/src/features/attachments/AttachmentBlock.tsx`
- Upload/open helper: `apps/web/src/features/attachments/uploadAttachment.ts`
- Editor and block styling: `apps/web/src/features/layout/workbench.css`
- Shared contracts: `packages/shared/src/documents.ts`, `packages/shared/src/attachments.ts`
- Local attachment object storage contract: `.trellis/spec/guides/cross-layer.md`

## Background

Task 20b made the basic writing experience smooth enough to use. Task 20c tried to polish rich blocks, but failed manual review because code controls were global/top-of-document and media upload was not usable. Task 20d correctly fixed the backend/local upload foundation: local review can now prove upload intent, direct upload, confirm, signed download, and privacy boundaries without public cloud credentials.

The latest manual review still fails the editor UX: `codeblock 默认的灰底白字根本看不清，image / file / attachment点击没有反应，我直接复制图片等也不能自动插入文档。问题还是很大`. This is not a storage-layer bug. It is a frontend block interaction bug.

Current known implementation facts:

- `JixiaEditor.tsx` uses BlockNote with custom `jixiaImage`, `jixiaFile`, and `jixiaCallout` block specs, but `BlockNoteView` disables `filePanel`, `formattingToolbar`, `linkToolbar`, and `sideMenu`.
- No app-level paste/drop handling exists for clipboard or `DataTransfer` files/images.
- `workbench.css` styles only the outer code block shell; it does not own nested `pre`, `code`, or token colors, so BlockNote/Mantine defaults can produce unreadable grey/white code blocks.
- `AttachmentBlock.tsx` uploads only through a hidden file input inside an explicit bottom action. The card/header/empty body/preview do not behave as click, keyboard, paste, or drop targets.
- `uploadAttachment.ts` and Task 20d's local object storage route are reusable and should not be rewritten for this task.

## Goal

Make rich blocks behave like mature document-editor blocks without forking Notebook and Project documents: readable block-local code blocks, responsive image/file/attachment blocks, paste/drop auto-insert, upload placeholders, retryable errors, and persistence through save/refresh/reopen using the existing attachment upload contract.

## Non-Negotiable Constraints

- Keep Notebook and Project documents behind the shared `DocumentEditorPage` and `JixiaEditor` boundary.
- Do not fork separate Notebook and Project document editors.
- API remains the authority for authorization, attachment intent creation, confirmation, and signed download.
- Frontend renders only server-authorized data and app-owned safe metadata.
- Never persist signed URLs, storage keys, object keys, bucket names, upload headers, credentials, authorization headers, cookies, or raw storage URLs in `EditorSnapshot`, shared DTOs, or document block props.
- Do not weaken Task 20d's backend/object-storage contract.
- Do not reintroduce global document-level code-block toolbars.
- Preserve Task 20b's smooth text-writing feel, draft save, formal revision save, conflict behavior, and read-only behavior.
- Do not add Markdown/PDF export, collaboration, CRDT/realtime, schema migrations, or AI writeback in this task.
- Do not introduce CodeMirror or a nested editor engine unless the implementation cannot meet the acceptance criteria with BlockNote/CSS/custom block UI; if that happens, stop and replan.

## In Scope

### Code Blocks

- Make default code blocks readable in the Jixia editor shell, including background, foreground, nested `pre`/`code`, tokens, selection, caret, line-height, and focus/hover states.
- Provide block-local controls for language, copy, and wrap/unwrap behavior when the block is selected or hovered.
- Store code text and language safely in the existing editor snapshot path.
- Ensure code controls never appear in the global document chrome or at the top of the document because a different block is active.
- Preserve keyboard editing behavior and copy behavior without hurting normal text writing.

### Image/File/Attachment Blocks

- Make empty image/file/attachment blocks respond to card click and keyboard activation by opening the file picker.
- Make attached image/file cards respond predictably: click preview/open where appropriate, keep explicit replace/remove/open/download actions, and avoid accidental destructive behavior.
- Add clear pointer, focus, hover, selected, drag-over, pending, success, error, retry, and remove affordances.
- Preserve and edit only safe metadata such as `attachmentId`, caption, alt text, description, preview visibility, preview width, file name, MIME type, and file size.
- Preserve read-only behavior: no upload, replace, remove, or metadata mutation; safe open/download remains available when authorized.

### Paste/Drop Upload Flow

- Intercept pasted and dropped image/file data at the editor boundary or block boundary.
- Insert an upload placeholder block at the cursor or nearest valid drop target before asynchronous upload begins.
- Use `uploadAttachment({ documentId, blockType, file })` for the upload contract.
- Replace the placeholder with a confirmed image/file/attachment block on success.
- Mark failures clearly with retry/remove controls; do not leave a failed upload looking attached.
- If `fetch` cannot expose true upload progress, still show pending and terminal states clearly.

### Persistence and Tests

- Save draft/formal revision after rich-block edits and verify refresh/reopen preserves code and media blocks.
- Reuse Task 20d E2E storage setup; do not add a new storage backend.
- Add or update component tests for `JixiaEditor`, `AttachmentBlock`, and upload helpers.
- Add or update Playwright E2E for click upload, paste/drop upload, save/refresh/open/download, and read-only mutation hiding.

## Out of Scope

- New backend object storage implementation.
- Production S3 behavior changes except consuming the existing safe upload/download contract.
- Database schema changes.
- EditorSnapshotV2 rollout unless existing safe block props cannot represent required metadata; if v1 is insufficient, stop and replan.
- Markdown export.
- PDF export.
- Realtime collaboration, CRDT, comments, mention systems, or AI writing into documents.
- Full Notion parity such as resize handles, drag-reorder, slash-menu redesign, or multi-column layout unless required to satisfy the explicit acceptance criteria.

## Functional Requirements

1. Code blocks must be readable by default in local review and automated screenshots/tests.
2. Code block language/copy/wrap controls must be block-local and contextual, never global document chrome.
3. Empty image/file/attachment blocks must respond to direct card click and keyboard activation.
4. Pasted images/files must auto-insert into the document through upload placeholders and confirmed attachment IDs.
5. Dropped images/files must auto-insert at a predictable cursor/drop location through the same upload path.
6. Upload pending, success, failure, retry, and remove states must be visible and non-destructive.
7. Attachment open/download must keep using the permission-checked signed download route.
8. Persisted document content must reference app-owned attachment identity and safe metadata only.
9. Read-only documents must hide or disable mutation controls while preserving safe open/download behavior.
10. Existing text editing, save, draft/revision, conflict, and shared Notebook/Project routing behavior must not regress.

## Acceptance Criteria

- [ ] Default code block text is clearly readable against its background in the Jixia editor shell.
- [ ] Code block controls appear only on or next to the active/hovered code block.
- [ ] Code language and content persist through draft/formal save, refresh, and reopen.
- [ ] Empty image/file/attachment blocks open the file picker when the card is clicked or activated by keyboard.
- [ ] Attached media/file cards provide explicit open/download, replace, remove, and metadata affordances with clear read-only restrictions.
- [ ] Pasting an image inserts an image attachment block, uploads it, confirms it, and persists it after save/refresh/reopen.
- [ ] Pasting a non-image file inserts a file attachment block, uploads it, confirms it, and persists it after save/refresh/reopen.
- [ ] Dropping an image/file onto the editor inserts the correct block at a predictable location and uses the same safe upload path.
- [ ] Upload failure leaves a retryable placeholder/error block, not a false-success attached block.
- [ ] No signed URL, object key, bucket, upload header, credential, auth header, cookie, or local storage path is stored in document snapshots or shared DTOs.
- [ ] Notebook and Project docs continue to share `DocumentEditorPage` and `JixiaEditor`.
- [ ] E2E verifies local upload/open/download through the Task 20d local storage stack.

## Manual Review Gate

Restart local Jixia and verify in both Notebook and Project documents:

- code block readability without selecting or hovering,
- block-local code language/copy/wrap controls,
- direct click on empty image/file/attachment cards,
- replace/remove/open/download on attached cards,
- paste image auto-insert,
- paste file auto-insert,
- drop image/file auto-insert,
- save draft/formal revision, refresh, reopen, and confirm persisted rich blocks,
- read-only document hides mutation controls,
- browser/network inspection shows no persisted signed URLs, storage keys, or upload credentials.

## Verification Commands

Run focused checks first, then broader checks:

```bash
pnpm --filter @jixia/web test -- JixiaEditor
pnpm --filter @jixia/web test -- AttachmentBlock
pnpm --filter @jixia/web test -- uploadAttachment
pnpm --filter @jixia/web exec playwright test --config ../../playwright.config.ts e2e/attachment-upload.spec.ts
pnpm --filter @jixia/web exec playwright test --config ../../playwright.config.ts e2e/document-save.spec.ts
pnpm --filter @jixia/web lint
pnpm --filter @jixia/web build
```

If a backend boundary is touched accidentally, also run:

```bash
pnpm --filter @jixia/api test -- attachment
pnpm --filter @jixia/api lint
```

## Stop Conditions

Stop and ask before continuing if any of these happen:

- implementation would persist signed URLs, storage keys, object keys, bucket names, upload headers, credentials, auth headers, or cookies in document content,
- authorization or permission decisions would move from API to frontend,
- the task needs schema migration or EditorSnapshotV2 rollout,
- backend upload/storage contract must be weakened,
- Notebook and Project document editors start diverging,
- the work drifts into Markdown/PDF export, realtime collaboration, AI writeback, comments, or unrelated editor features,
- BlockNote cannot support the required behavior without a larger editor-engine replan.
