# Task 20m Technical Notes

## Good Data Shape

The editor has three layers:

```text
BlockNote interaction layer  -> slash/menu/selection/default block behavior
Jixia server semantics layer -> ids, auth, upload, safe metadata, signed resolver
Document visual layer        -> typography, rhythm, spacing, subtle state
```

Do not mix them. If server semantics leaks into visible document chrome, we repeat the Task20k/20l mistakes.

## First Files To Inspect

- `apps/web/src/features/documents/editor/JixiaEditor.tsx`
- `apps/web/src/features/layout/workbench.css`
- `apps/web/e2e/document-save.spec.ts`
- `apps/web/e2e/attachment-upload.spec.ts`
- `apps/web/src/features/documents/editor/JixiaEditor.test.ts`
- `apps/web/src/app/App.test.tsx`

## Keep These Invariants

- Task20j default BlockNote `codeBlock` path remains authoritative.
- Task20j server-first upload URL/listen/CORS behavior remains intact.
- Task20l no top `Attach` and no ready-state Jixia hover toolbar remains intact.
- Safe persistence remains safe: no signed URL, object key, bucket, or storage secret.
- Notebook and Project share one editor path.

## Linus Rule

This is a visual data-structure task. Define the baseline once. Do not add per-block CSS hacks until it looks acceptable by accident.
