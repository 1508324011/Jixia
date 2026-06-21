# Task 20k Technical Notes

## Bad Data Shape

Current active attachment rendering behaves like this:

```text
AttachmentFrame = chrome + actions + replacement dropzone + native content + metadata + status
```

That is the wrong default shape for ready content. It forces every ready image through a management panel.

The correct shape is state-driven:

```text
if state == ready && kind == image: image content + delayed contextual controls
if state == ready && kind == file: compact file chip/card + delayed contextual controls
if state == uploading: progress placeholder
if state == error: compact retry/error placeholder
if state == empty: upload/drop placeholder
if state == dragging: drop affordance
```

This removes special-case visual noise by making state explicit.

## First Files To Inspect

- `apps/web/src/features/documents/editor/JixiaEditor.tsx`
  - `JixiaNativeAttachmentFrame`
  - native image/file block specs
  - app snapshot import/export for image/file blocks
- `apps/web/src/features/layout/workbench.css`
  - `.jixia-native-attachment-frame`
  - `.jixia-native-attachment-chrome`
  - `.jixia-native-attachment-dropzone`
  - `.jixia-native-attachment-metadata`
- `apps/web/e2e/attachment-upload.spec.ts`
- `apps/web/e2e/document-save.spec.ts`
- `apps/web/src/features/documents/editor/JixiaEditor.test.ts`

## Invariants To Keep

- Do not regress Task20j `codeBlock` mapping.
- Do not regress server-first upload URL/listen/CORS behavior.
- Do not persist signed URLs or storage internals.
- Keep previous snapshots readable.
- Keep Notebook and Project on one editor path.

## Visual Principle

Content first. Controls later.

If an image upload succeeded, the document should show the image. The controls belong to interaction state, not permanent content.
