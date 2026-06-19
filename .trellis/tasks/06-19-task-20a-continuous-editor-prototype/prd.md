# Task 20a Continuous Editor Prototype

## Source of Truth

- Roadmap: `doc/Notebook_Project_Doc_Editor_Implementation_Plan.md`
- Predecessor: `.trellis/tasks/06-18-task-19-server-authorized-document-collections/prd.md`
- Gate A status: passed by human review on 2026-06-19
- This task covers only the prototype slice before Gate B. The full editor-first surface belongs to Task 20b after manual review.

## Goal

Replace the current heavy block-card editing feel in `JixiaEditor` with a continuous editor-first writing prototype that is pleasant enough for a 10-minute manual writing review, while preserving the existing document snapshot/block transport and all `DocumentEditorPage` server-owned lifecycle contracts.

## Problem Statement

Task 19 made Notebook and Project document collections server-authorized and opened both flows into the shared `DocumentEditorPage`. The remaining weakness is the writing surface: it still behaves like stacked block forms instead of one continuous notebook/workbench canvas. That is the wrong data relationship to polish later. Before adding inspectors, metadata, tags, or richer engines, Jixia needs a simple prototype that proves the existing `EditorSnapshot`/`EditorBlock` model can support continuous writing without forking Notebook and Project document editors or introducing a new editor dependency.

## In Scope

- Refactor `apps/web/src/features/documents/editor/JixiaEditor.tsx` toward a continuous writing canvas instead of prominent per-block cards.
- Preserve the external `EditorSnapshot` and `EditorBlock` shape from `packages/shared/src/documents.ts`.
- Preserve the existing `DocumentEditorPage` API flow:
  - `GET /documents/:documentId`
  - `PUT /documents/:documentId/draft`
  - `POST /documents/:documentId/revisions`
  - 409 conflict handling remains human-visible.
  - Archived documents remain read-only.
- Keep Notebook and Project documents on the same shared `DocumentEditorPage` and editor component.
- Support the Gate B prototype block set:
  - paragraph
  - heading
  - bullet list or todo
  - quote or code
  - divider
- Provide basic insert/delete controls that feel lightweight and contextual, not like large SaaS cards.
- Provide reasonable focus movement for prototype writing:
  - creating a new text block should move focus into it where feasible.
  - deleting a block should leave focus in a predictable nearby block where feasible.
  - Enter/keyboard behavior should avoid surprising loss of text; keep implementation simple.
- Preserve existing attachment block behavior and do not break image/file attachment rendering or read-only behavior, even if attachments are not the center of the prototype review.
- Keep styling consistent with the existing workbench/ResearchClaw-adjacent visual language.
- Update focused web tests for the editor behavior changed by this prototype.

## Out of Scope

- No Tiptap, ProseMirror, BlockNote, Yjs, Hocuspocus, CRDT, or realtime collaboration dependency.
- No persistence format migration.
- No rich text mark model beyond the existing snapshot/block transport.
- No automatic AI insert, rewrite, apply, or direct document writes.
- No separate Notebook editor or Project Docs editor fork.
- No comments/provenance system beyond harmless visual placeholders if already present.
- No Task 20b completeness work after Gate B, including full block-type polish, inspector integration, metadata/tag persistence, or editor engine adapter decisions.
- No backend schema or API contract changes unless the task is explicitly stopped and replanned.

## Functional Requirements

1. `JixiaEditor` presents existing blocks as one continuous writing surface with reduced visual card boundaries.
2. Paragraph and heading blocks remain editable and serialize back into the same `EditorBlock` shape.
3. At least one list-like block path, bullet or todo, works for prototype writing and serialization.
4. At least one emphasis/structured block path, quote or code, works for prototype writing and serialization.
5. Divider insertion/rendering works without requiring free-text content.
6. Users can insert and delete prototype blocks without breaking block order or producing invalid snapshots.
7. Existing attachment/image/file blocks continue to render through the current attachment flow and respect read-only mode.
8. Read-only archived document mode disables editing and mutating controls.
9. The editor remains usable from both Notebook and Project document routes without route-specific branching in editor internals.
10. Draft save and revision publish still use the existing `DocumentEditorPage` contract and do not require API changes.
11. AI UI remains unable to write document content in this task.

## Acceptance Criteria

- [ ] Opening a Notebook document and a Project document both show the same continuous editor surface through `DocumentEditorPage`.
- [ ] Editing paragraph and heading text updates the local snapshot and can be saved through the existing draft save flow.
- [ ] The prototype supports at least paragraph, heading, bullet or todo, quote or code, and divider blocks.
- [ ] Basic insert/delete controls work without large block-card chrome becoming the dominant UI.
- [ ] Focus movement is predictable enough for a manual 10-minute writing pass.
- [ ] Existing document load, draft save, revision publish, conflict warning, and archived read-only behavior are not regressed.
- [ ] Existing attachment block behavior is not regressed.
- [ ] No new editor framework, CRDT, realtime, schema migration, or AI writeback is introduced.
- [ ] Focused tests cover the changed editor prototype behavior.
- [ ] The implementer stops after this prototype and requests Gate B manual review before Task 20b.

## Verification Commands

Run the most focused checks first, then broader checks if the focused checks pass:

```bash
pnpm --filter @jixia/web test -- DocumentEditorPage
pnpm --filter @jixia/web build
pnpm --filter @jixia/web e2e -- document-save
```

## Human Review Gate B

Stop after the prototype slice is implemented and verified. Do not proceed into Task 20b or full editor redesign until a human performs a 10-minute writing review and explicitly passes Gate B.

Gate B review should check:

- The surface feels like continuous writing, not a stack of forms.
- Insert/delete and focus movement are tolerable for real note-taking.
- Notebook and Project document entry points still share the same editor.
- Save/publish/read-only/conflict behavior still makes sense.

## Gate B Result

Gate B failed during human review on 2026-06-19. The reviewer reported that the editor was not fluid, still felt block-based, and individual blocks did not grow their visible height as content increased.

Root cause: the Task 20a prototype reduced visual chrome around the existing block stack, but it did not change the editor runtime. `JixiaEditor` remains a React-controlled list of textarea-backed blocks, with block-local controls and row-count sizing. That architecture cannot deliver a Notion/Obsidian-class document editing feel through CSS polish alone.

Decision: do not continue into Task 20b on the textarea/block-stack architecture. The next task must be an editor engine adapter decision spike that compares mature editor runtimes, defines the adapter boundary, and decides the storage/runtime model before another writing-surface implementation attempt.

## Stop Conditions

Stop and ask before continuing if any of these happen:

- A backend schema migration appears necessary.
- A new editor framework or realtime/CRDT dependency appears necessary.
- The implementation wants to change `EditorSnapshot` or `EditorBlock` transport shape.
- Notebook and Project docs appear to require separate editor components.
- Permission behavior becomes ambiguous or client-enforced.
- Draft/revision/conflict/read-only guarantees become hard to preserve.
- AI writeback into documents is proposed.
- Manual Gate B review has not happened after the prototype is complete.
