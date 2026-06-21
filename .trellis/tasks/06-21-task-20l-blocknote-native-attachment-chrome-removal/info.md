# Task 20l Technical Notes

## Core Data Relationship

```text
BlockNote owns visible editor interaction.
Jixia owns server attachment semantics.
```

The previous shape still leaked Jixia controls into ready content:

```text
ready image/file = native content + Jixia hover toolbar
editor toolbar = BlockNote UI + Jixia Attach shortcut
```

The target shape is simpler:

```text
ready image/file = native/default content
uploading/error/empty = explicit affordance
server semantics = hidden props + uploadFile + resolver + safe persisted metadata
```

## First Files To Inspect

- `apps/web/src/features/documents/editor/JixiaEditor.tsx`
  - top attachment shortcut area
  - `JixiaNativeAttachmentFrame`
  - ready image/file branches
  - upload handlers and native image/file specs
- `apps/web/src/features/layout/workbench.css`
  - ready attachment contextual controls
  - attachment action/reveal classes
  - top editor attachment shortcut styling if present
- `apps/web/e2e/attachment-upload.spec.ts`
- `apps/web/e2e/document-save.spec.ts`
- `apps/web/src/features/documents/editor/JixiaEditor.test.ts`

## Invariants

- Do not regress Task20j default `codeBlock` mapping.
- Do not regress Task20j server-first direct-upload configuration.
- Do not regress Task20k content-first ready image/file rendering.
- Do not persist signed URLs or storage internals.
- Do not remove upload/error affordances required to recover from real failures.

## Linus Rule

If the control is visible in ready content, it must justify itself as document content. `Open`, `Replace`, `Remove`, and top `Attach` do not. Delete them from the primary visual path.
