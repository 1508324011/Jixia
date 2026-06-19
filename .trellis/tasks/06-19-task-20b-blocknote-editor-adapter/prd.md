# Task 20b BlockNote Editor Adapter

## Source of Truth

- Roadmap: `doc/Notebook_Project_Doc_Editor_Implementation_Plan.md`
- Gate B failed prototype: `.trellis/tasks/06-19-task-20a-continuous-editor-prototype/prd.md`
- Editor engine decision: `.trellis/tasks/06-19-task-20r-editor-engine-adapter-decision-spike/decision.md`
- Frontend runtime boundary spec: `.trellis/spec/frontend/state-management.md`
- Current document lifecycle shell: `apps/web/src/features/documents/DocumentEditorPage.tsx`
- Current shared transport contract: `packages/shared/src/documents.ts`

## Background

Task 20a proved the wrong architecture: a React-controlled textarea/block-stack cannot become a real document editor through lighter styling. Gate B failed because the surface was not fluid, still felt block-like, and block display height did not grow naturally with content.

Task 20r decided that Task 20b must implement a real editor runtime behind a shared adapter boundary. `DocumentEditorPage` keeps server lifecycle responsibilities. The editor engine owns DOM editing, selection, commands, transactions, keyboard/paste behavior, undo/history, and import/export.

## Goal

Replace the failed textarea-backed `JixiaEditor` runtime with a BlockNote-backed editor adapter for Notebook and Project documents, while preserving existing document API contracts and current `EditorSnapshot` / `EditorBlock` v1 import/export compatibility.

## Non-Negotiable Architecture

- Do not continue polishing the textarea/block-stack runtime as production editor behavior.
- Notebook and Project documents must use the same shared editor boundary.
- `DocumentEditorPage` owns document load, title state, base revision, dirty state, draft autosave, formal revision save, conflict display, archived/read-only state, and route context.
- The editor engine owns editable DOM state, selection, transactions, keyboard behavior, paste behavior, undo/history, block commands, and conversion to/from Jixia snapshots.
- `EditorSnapshot` / `EditorBlock` v1 remains the external transport boundary in this task.
- No backend API, database schema, or persistence format migration unless the task is stopped and explicitly replanned.
- No CRDT, realtime collaboration, Yjs, Hocuspocus, or multi-user editing implementation.
- No AI writeback into documents.

## In Scope

- Add the minimum frontend dependencies required for a BlockNote-backed editor adapter.
- Introduce an adapter-oriented editor implementation under the existing shared document editor feature area.
- Import current `EditorSnapshot` v1 blocks into BlockNote-compatible runtime blocks.
- Export BlockNote runtime content back to current `EditorSnapshot` v1 blocks for draft autosave and formal revision save.
- Preserve paragraph, heading, bullet list, numbered list, todo/check list, quote, code, divider, table-like/simple table placeholder, callout, image, and file block compatibility where feasible.
- Map image/file blocks to the existing attachment flow without leaking signed URLs, storage keys, or server-sensitive metadata into snapshots.
- Preserve read-only behavior: archived documents cannot mutate content or attachments, but users can still select/copy text and safely open existing attachments.
- Preserve `DocumentEditorPage` draft save, formal revision save, conflict handling, loading, error, and title behavior.
- Keep the editor usable from both Notebook and Project document routes without route-specific editor logic.
- Add or update focused tests around adapter import/export, read-only behavior, save export, shared Notebook/Project usage, and attachment block preservation.
- Keep styling aligned with the existing workbench visual language while letting the editor runtime own editing interactions.
- After implementation and verification, stop for repeat Gate B manual review before moving to Task 21 or any deeper editor expansion.

## Out of Scope

- No `EditorSnapshotV2` persistence rollout in this task.
- No backend/database migration.
- No collaborative realtime editing.
- No AI insert/rewrite/apply/writeback.
- No separate Notebook-only or Project-only editor fork.
- No inspector/sidebar metadata work beyond preserving existing shell behavior.
- No comments/provenance system.
- No broad Task 21/22/23 work.

## Functional Requirements

1. Opening an existing document imports its current `EditorSnapshot` v1 into the BlockNote adapter.
2. Editing content in the BlockNote surface produces a new `EditorSnapshot` v1 through the adapter export path.
3. Existing draft autosave continues to call `PUT /documents/:documentId/draft` through `DocumentEditorPage` with v1 snapshot content.
4. Formal save continues to call `POST /documents/:documentId/revisions` through `DocumentEditorPage` with v1 snapshot content and current title.
5. Conflict responses remain human-visible and do not get swallowed by the editor runtime.
6. Archived/read-only documents render content but disable content mutation and attachment upload/change controls.
7. Attachment-backed image/file blocks keep using existing attachment authorization and open/download behavior.
8. Notebook and Project document routes continue sharing the same `DocumentEditorPage` and editor implementation.
9. The editor supports natural long-form typing without row caps or textarea field behavior.
10. The editor supports expected document-editor basics: Enter creates new blocks, Backspace/Delete behavior is runtime-owned, undo/redo works through the editor runtime, paste is handled by the editor runtime where supported.
11. AI components still cannot mutate document content.

## Acceptance Criteria

- [ ] The production editor path no longer relies on React-controlled textarea blocks for long-form editing.
- [ ] BlockNote is integrated behind a Jixia editor adapter boundary.
- [ ] Current `EditorSnapshot` v1 data can be imported into the editor and exported back without backend/API/schema changes.
- [ ] Paragraph, heading, list/todo, quote/code, divider, and attachment blocks remain usable enough for repeat Gate B review.
- [ ] Existing load, draft autosave, formal save, conflict, read-only, and attachment behavior remain intact.
- [ ] Notebook and Project document entry points share the same editor implementation.
- [ ] Focused tests cover import/export, save integration, read-only, and attachment preservation.
- [ ] No CRDT/realtime, backend migration, AI writeback, or editor fork is introduced.
- [ ] Verification commands pass.
- [ ] Implementation stops for repeat Gate B manual review after completion.

## Verification Commands

Run focused checks first, then broader checks after fixes:

```bash
pnpm --filter @jixia/web test -- DocumentEditorPage
pnpm --filter @jixia/web build
pnpm --filter @jixia/web lint
pnpm --filter @jixia/web e2e -- document-save
```

If the BlockNote dependency changes package manager state, also run the workspace-level install/build checks required by the changed lockfile/package manifests.

## Repeat Gate B Review

After implementation and verification, stop and request human repeat Gate B review. The reviewer should write for at least 10 minutes in both Notebook and Project document paths and judge:

- Does typing feel like a document editor rather than filling forms?
- Do blocks grow and flow naturally with content?
- Do Enter, paste, undo, delete/backspace, and selection feel acceptable?
- Are insert/type controls discoverable without dominating the writing surface?
- Do save, publish, read-only, conflict, and attachment behavior still make sense?

Do not proceed into Task 21 or metadata/inspector expansion until repeat Gate B passes.

## Stop Conditions

Stop and ask before continuing if any of these happen:

- BlockNote cannot preserve current draft/revision/read-only/conflict semantics without backend changes.
- The implementation needs a backend API, database schema, or snapshot persistence migration.
- The implementation requires CRDT/realtime collaboration.
- The adapter requires separate Notebook and Project editors.
- Attachment blocks would expose signed URLs, storage keys, or sensitive metadata in snapshots.
- AI writeback into documents becomes necessary.
- The package/dependency impact is too large or license compatibility is unclear.
