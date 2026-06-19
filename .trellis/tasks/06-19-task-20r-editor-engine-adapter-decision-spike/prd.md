# Task 20r Editor Engine Adapter Decision Spike

## Source of Truth

- Roadmap: `doc/Notebook_Project_Doc_Editor_Implementation_Plan.md`
- Failed prototype: `.trellis/tasks/06-19-task-20a-continuous-editor-prototype/prd.md`
- Current editor shell: `apps/web/src/features/documents/DocumentEditorPage.tsx`
- Current failed editor prototype: `apps/web/src/features/documents/editor/JixiaEditor.tsx`
- Shared transport contract: `packages/shared/src/documents.ts`

## Gate B Context

Task 20a failed Gate B during human review on 2026-06-19. The reviewer reported that the editor was not fluid, still felt block-based, and blocks did not grow with content. This is not a CSS-only bug. The prototype still used a React-controlled textarea stack as the runtime editor model.

A real Notebook / Project document editor needs an editor runtime that owns selection, transactions, normalization, keyboard behavior, paste behavior, undo/redo, block commands, and serialization. `DocumentEditorPage` should keep owning server lifecycle, while the editor engine owns editing.

## Goal

Choose the editor engine and adapter architecture for the Notebook / Project document editor before attempting Task 20b. The output must be a concrete decision that future implementation can follow without guessing.

## Problem Statement

Jixia already has useful server-side document ownership, draft/revision APIs, attachment authorization, and shared Notebook/Project routes. What it lacks is the runtime editing layer. Continuing to polish `JixiaEditor` as textarea-backed blocks will keep producing form-like behavior, not a document editor comparable to Notion, Obsidian, Outline, BlockNote, or ProseMirror-based systems.

The next good data structure is an adapter boundary:

- `DocumentEditorPage` owns document load, draft save, revision publish, conflict handling, read-only mode, and route context.
- `DocumentEditorEngine` owns DOM editing, selection, commands, history, paste, keyboard behavior, and conversion to/from Jixia snapshots.
- `EditorSnapshot` remains the current external transport boundary until a deliberate versioned migration is approved.

## In Scope

- Compare mature editor runtime options against Jixia's product needs:
  - BlockNote
  - Tiptap / ProseMirror
  - CodeMirror 6 Markdown-source editing
  - Lexical, if JSON/custom-node ownership looks materially better than the ProseMirror options
- Recommend one primary engine path and one fallback path.
- Define a `DocumentEditorEngine` adapter contract for React integration.
- Define how the chosen runtime imports from and exports to current `EditorSnapshot` / `EditorBlock` v1.
- Propose whether Jixia should keep v1 transport, introduce `EditorSnapshotV2`, or support both during migration.
- Decide canonical storage direction for the next phase:
  - structured JSON canonical with derived Markdown/plaintext, or
  - Markdown canonical with derived structured blocks.
- Map attachment/image/file blocks into the proposed runtime model.
- Map read-only, draft autosave, formal revision save, and conflict handling into the adapter boundary.
- Map AI interaction boundaries and preserve the rule that AI cannot directly write document content without explicit future approval.
- Produce a risk matrix covering dependency weight, schema migration cost, browser behavior, testing strategy, accessibility, licensing, and long-term maintainability.
- Define the Task 20b implementation split after the decision.

## Out of Scope

- No production editor replacement in this task.
- No backend API or database schema migration.
- No CRDT, realtime collaboration, Yjs, Hocuspocus, or multi-user editing implementation.
- No Task 20b continuous editor implementation.
- No AI writeback into documents.
- No Notebook/Project editor fork.
- No attempt to salvage the textarea-stack prototype as the long-term editor.

## Candidate Direction Bias

Start from BlockNote as the primary candidate because its public block shape is closest to Jixia's current block-oriented transport and it already sits on ProseMirror/Tiptap. Evaluate Tiptap/ProseMirror directly if Jixia needs deeper schema or transaction control than BlockNote exposes. Evaluate CodeMirror 6 only if the product decision shifts toward Obsidian-style Markdown-source editing.

## Expected Deliverables

- A decision document or PRD update that names the recommended editor engine path.
- A proposed `DocumentEditorEngine` adapter interface with import/export responsibilities.
- A proposed snapshot migration strategy, including whether to introduce `EditorSnapshotV2`.
- A block mapping table for paragraph, headings, lists, todo, quote, callout, code, divider, table, image, and file.
- An attachment integration plan that reuses the existing attachment service and UI where possible.
- A persistence/lifecycle plan that preserves existing draft/revision/conflict/read-only contracts.
- A testing plan for Task 20b.
- A revised Gate B repeat checklist for validating the real editor implementation.

## Acceptance Criteria

- [ ] The decision explicitly rejects continuing Task 20b on the current textarea/block-stack runtime.
- [ ] The decision compares BlockNote, Tiptap/ProseMirror, CodeMirror 6, and any other candidate considered.
- [ ] The recommended path explains why it matches Jixia's Notebook / Project document goals.
- [ ] The adapter boundary keeps `DocumentEditorPage` server lifecycle separate from runtime editing behavior.
- [ ] Current attachment, read-only, draft save, revision publish, and conflict behavior have a preservation plan.
- [ ] Current `EditorSnapshot` / `EditorBlock` compatibility or migration is addressed explicitly.
- [ ] No production dependency or schema migration is added without a decision record.
- [ ] Task 20b can be created from this decision without rediscovering the same architecture questions.

## Verification

This task is primarily architectural. Verification should focus on evidence quality rather than broad build commands:

```bash
pnpm --filter @jixia/web test -- DocumentEditorPage
pnpm --filter @jixia/web build
```

Only run prototype-specific checks if the task explicitly creates a disposable spike branch or proof-of-concept code.

## Stop Conditions

Stop and ask before continuing if any of these happen:

- The spike requires adding a production editor dependency to the main app.
- The spike requires changing API contracts or database schema.
- The recommendation depends on CRDT/realtime collaboration.
- The adapter would require separate Notebook and Project editors.
- The decision cannot preserve draft/revision/conflict/read-only semantics.
- The team wants Obsidian-style Markdown-source behavior instead of Notion-style structured blocks.
