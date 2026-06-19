# Task 20c Rich Block Editing Polish

## Source of Truth

- Task 20b implementation: `.trellis/tasks/06-19-task-20b-blocknote-editor-adapter/prd.md`
- Task 20r decision: `.trellis/tasks/06-19-task-20r-editor-engine-adapter-decision-spike/decision.md`
- Task 20a Gate B failure record: `.trellis/tasks/06-19-task-20a-continuous-editor-prototype/prd.md`
- Roadmap: `doc/Notebook_Project_Doc_Editor_Implementation_Plan.md`
- Current editor adapter: `apps/web/src/features/documents/editor/JixiaEditor.tsx`
- Current editor lifecycle shell: `apps/web/src/features/documents/DocumentEditorPage.tsx`
- Shared snapshot contract: `packages/shared/src/documents.ts`

## Background

Task 20b replaced the failed textarea/block-stack editor with a BlockNote-backed shared editor adapter. Human repeat review says the writing surface is now smooth and meets the basic usability bar, but code blocks and attachment/image/file blocks currently behave mostly as display blocks. They need first-class edit controls before Jixia can claim a useful Notebook / Project document editor.

This task should not replace the editor engine again. The BlockNote adapter direction is correct. The problem is now rich block behavior and safe metadata editing.

## Goal

Make code blocks and private attachment/image/file blocks editable enough for real Notebook / Project authoring while preserving the Task 20b adapter boundary, current document lifecycle contracts, and private attachment safety rules.

## Non-Negotiable Constraints

- Keep Notebook and Project documents behind the same shared `DocumentEditorPage` and `JixiaEditor` adapter.
- Keep `DocumentEditorPage` responsible for document load, title, base revision, dirty state, draft autosave, formal revision save, conflict display, archived/read-only mode, and route context.
- Keep the editor runtime responsible for DOM editing, selection, commands, keyboard behavior, paste behavior, history, and import/export.
- Preserve current `EditorSnapshot` / `EditorBlock` v1 compatibility unless the task explicitly stops and creates a migration design.
- Do not persist signed URLs, storage keys, authorization headers, private upload internals, AI prompts, provider data, or raw secrets in document snapshots.
- Do not add backend API, database schema, CRDT/realtime, collaboration, or AI writeback changes in this task unless stopped and replanned.
- Do not fork Notebook and Project editors.

## In Scope

- Code block editing polish:
  - code text remains directly editable inside the BlockNote surface.
  - language selection or language metadata editing is available and persists through v1 `attrs.language`.
  - code block copy action is available where feasible.
  - code block paste/import/export still round-trips through current v1 snapshot shape.
  - fenced-code paste behavior preserves raw text and language where feasible.
  - tab/indent behavior is predictable and does not unexpectedly leave or corrupt the code block.
  - syntax highlighting or readable code styling is improved without turning this task into a full IDE.
  - do not embed a nested CodeMirror runtime in Task 20c; keep this as BlockNote code-block polish unless code editing becomes a separate product priority.
- Image and file block editing polish:
  - users can insert/upload an image or file block from the editor surface.
  - users can replace an existing attachment where permissions allow while keeping the block id stable.
  - replacing an attachment preserves user-authored safe metadata such as caption, preview width, display toggle, and alt text unless the user edits it.
  - users can remove an attachment block from the document.
  - users can edit safe display metadata such as `caption`, `altText`, `description`, `previewWidth`, and `showPreview` if v1 snapshot validation preserves it.
  - selected-state controls expose upload/replace/open/download/caption/preview-width actions where writable.
  - read-only documents can view/open/download existing attachments but cannot mutate block metadata, resize previews, caption, upload, replace, or delete.
- Attachment privacy and safety:
  - snapshots may store only `attachmentId` plus safe display metadata (`fileName`, `mimeType`, `sizeBytes`, `checksum`, `uploadedAt`, `caption`, `altText`, `description`, `previewWidth`, `showPreview`).
  - previews/downloads must resolve transient access through the existing attachment flow.
  - tests must prove signed URLs/storage keys/private fields do not round-trip into snapshots.
- BlockNote adapter consistency:
  - preserve `snapshotToBlockNoteBlocks` and `blockNoteBlocksToSnapshot` as the import/export boundary.
  - keep conversion tests close to `JixiaEditor`.
  - update E2E helpers only when required by changed block UI.
- Decide whether current v1 `attrs`/`content` can safely carry caption/alt/description/code language data. If API normalization drops required metadata, stop and produce a follow-up `EditorSnapshotV2` task instead of hacking around it.

## Out of Scope

- Markdown export.
- PDF export.
- Inspector panels, backlinks, tags, or metadata sidebars.
- Full `EditorSnapshotV2` persistence rollout.
- Backend schema or API changes.
- Realtime collaboration, CRDT, Yjs, Hocuspocus, or multi-user cursors.
- AI automatic insert/rewrite/apply/writeback.
- Comments, provenance UI, version diff UI, or Task 21/22 work.

## Mature Editor Research Notes

Use these as implementation references, not as permission to change engine again:

- BlockNote custom blocks are the primary implementation model. A custom block should be a typed block spec with explicit props, `content: "inline"` or `content: "none"`, a React render function, and optional external HTML conversion. Update safe props through BlockNote block updates, not by bypassing the editor runtime.
- BlockNote file/image examples use props such as `caption`, `showPreview`, and `previewWidth`. Jixia may copy that metadata shape, but must not copy public URL persistence; Jixia attachment access remains server-authorized and transient.
- Outline is the best UX reference for media polish: captions, replace/download actions, resize controls, and drag-resize behavior. Copy the interaction model, not its storage assumptions.
- Obsidian is the Markdown interop reference: code fences and attachment embeds are simple and exportable. Task 20c may keep future Markdown conventions in mind, but Markdown/PDF export remains out of scope.
- Tiptap/ProseMirror NodeViews and CodeMirror-in-code-block patterns are future escape hatches. Do not embed nested CodeMirror in Task 20c unless a separate code-editor task is created.

## Functional Requirements

1. Existing paragraph/list/heading/quote/callout/table/divider behavior from Task 20b is not regressed.
2. Code block text and language metadata can be edited and saved through draft/revision flows.
3. Image and file blocks can be inserted or uploaded through the editor surface when the document is writable.
4. Existing image/file attachment blocks can be replaced or removed when writable.
5. Safe attachment display metadata, such as `caption`, `altText`, `description`, `previewWidth`, and `showPreview`, can be edited if the current snapshot contract preserves it.
6. Read-only archived documents disable all rich block mutations while preserving selection, copy, and safe open/download behavior.
7. Draft autosave and formal revision save export the latest runtime snapshot before sending API requests.
8. Sensitive attachment fields are never persisted in snapshots or exposed through Markdown-like text.
9. Focus behavior after inserting or editing rich blocks remains predictable enough for manual writing review.

## Acceptance Criteria

- [ ] Code blocks are no longer display-only for practical authoring: users can edit text and language metadata and save/refresh without data loss.
- [ ] Image blocks can be inserted/uploaded, displayed, replaced or removed, and optionally captioned when writable.
- [ ] File blocks can be inserted/uploaded, displayed, replaced or removed, and optionally described when writable.
- [ ] Replacing an image/file keeps the block id stable and preserves existing caption/preview metadata unless the user changes it.
- [ ] `caption`, `altText`, `description`, `previewWidth`, `showPreview`, `attachmentId`, and safe file metadata survive draft autosave, refresh, formal save, and conflict display paths where applicable.
- [ ] Read-only mode renders code/media/captions but hides or disables every mutation control: upload, replace, delete, resize, caption editing, and metadata editing.
- [ ] Existing attachment privacy tests still prove signed URLs/storage keys/private fields do not round-trip.
- [ ] `DocumentEditorPage` lifecycle and shared Notebook/Project routing remain unchanged.
- [ ] Focused unit tests cover conversion and rich block mutation behavior.
- [ ] Focused E2E or component tests cover at least one code block save and one attachment/image/file block save path.
- [ ] If v1 snapshot cannot preserve needed safe metadata, this task stops and creates an explicit v2 migration follow-up rather than silently losing user input.

## Verification Commands

Run focused checks first, then broader checks after they pass:

```bash
pnpm --filter @jixia/web test -- JixiaEditor
pnpm --filter @jixia/web test -- DocumentEditorPage
pnpm --filter @jixia/web lint
pnpm --filter @jixia/web build
pnpm --filter @jixia/web e2e -- apps/web/e2e/document-save.spec.ts
```

If package manifests or lockfiles change, also run the relevant install/build validation.

## Manual Review Result

Manual review failed after local Task 20c restart on 2026-06-19. The reviewer reported two blocking issues:

- Code block language/copy controls are rendered outside the code block at the top of the document, and they appear even when the document has no code block.
- Image/file/attachment blocks still cannot upload normally in the local review environment.

Root causes identified before opening Task 20d:

- `JixiaEditor` models code block language/copy controls as editor-level chrome instead of block-local or selected-block UI. That violates the Notion/BlockNote/Outline pattern where code block controls belong inside or adjacent to the selected code block.
- Attachment upload depends on S3-compatible object storage configuration and direct browser PUT to a presigned URL, but the local review API was started without `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, or `S3_SECRET_ACCESS_KEY`. The current local setup cannot prove real attachment upload.
- Current tests mock the upload path or use E2E storage helpers, so they do not catch missing local object storage or direct upload/head-object failures in the manual review stack.

Decision: Task 20c must not be treated as a successful rich-block polish deliverable until repair work is done. The immediate next task is Task 20d, focused narrowly on local attachment storage and real upload E2E. Block-local code/media UI repair should follow after the upload pipeline is reliable.

## Human Review Gate

After implementation and verification, restart local Jixia and request another manual review focused only on rich block behavior:

- code block text editing, language selection, save/refresh persistence.
- image/file upload, replace, delete, caption/description if implemented.
- read-only behavior for existing rich blocks.
- no regression to the smooth baseline writing feel from Task 20b.

## Stop Conditions

Stop and ask before continuing if any of these happen:

- safe metadata cannot be represented in v1 snapshots without loss.
- backend schema/API changes appear necessary.
- attachment preview/download requires persisting signed URLs or storage keys.
- BlockNote custom block limitations require a different engine decision.
- AI writeback, realtime collaboration, or editor fork is proposed.
- implementation would break Task 20b baseline writing smoothness.
