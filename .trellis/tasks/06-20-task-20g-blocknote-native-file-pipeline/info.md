# Task 20g Technical Notes

## Core Judgment

Task20f failed because it patched the wrong layer. The data relationship should be:

`BlockNote native file event/panel` -> `Jixia upload adapter` -> `attachment intent/direct PUT/confirm` -> `safe block props` -> `resolveFileUrl/openAttachmentDownload at render/open time`.

The current Task20f relationship is worse:

`React shell paste/drop` + `custom AttachmentBlock card click/paste/drop` -> `manual placeholder block props` -> `manual editor.updateBlock/onChange` -> `export sanitization catches runtime props`.

That is too many special cases. Good taste here is to delete the special cases by using BlockNote's file pipeline.

## BlockNote Evidence

- BlockNote editor options include `uploadFile(file, blockId?)`, `resolveFileUrl(url)`, and `pasteHandler`.
- BlockNote wraps upload start/end callbacks around `uploadFile`.
- File Panel upload appears only when `editor.uploadFile` is configured.
- File Panel upload can apply object prop updates returned by `uploadFile`, not just a URL string.
- Built-in paste/drop file extensions route file payloads through a shared `handleFileInsertion` helper.
- Drop handling uses ProseMirror coordinates to insert before/after the target block; Jixia's current cursor-only insertion is inferior.
- BlockNote media render/download calls `resolveFileUrl`, which matches Jixia's private signed-download model.

## Reuse

Keep:

- `DocumentEditorPage` lifecycle and shared Notebook/Project boundary.
- `uploadAttachment` as the single app upload chain.
- `openAttachmentDownload` or equivalent resolver logic for signed download.
- Task20d local object-storage route/signing and E2E network assertions.
- Safe `EditorSnapshot` and shared attachment metadata constraints.
- Existing custom attachment display metadata only if it becomes a display adapter after native upload.

Reduce or remove as primary behavior:

- `JixiaEditor` shell-level `onPasteCapture`/`onDropCapture` file insertion.
- `AttachmentBlock` hidden input as the main file picker.
- Block-local duplicated paste/drop handlers in `AttachmentBlock`.
- Runtime upload status threaded through persisted-like block props as the primary placeholder model.

## Preferred Implementation Shape

1. Create a small Jixia file pipeline adapter inside the editor feature boundary.
2. Pass `uploadFile` into `useCreateBlockNote`/editor creation.
3. Pass `resolveFileUrl` into the editor.
4. Re-enable/configure BlockNote file panel.
5. Map upload result to safe BlockNote block props that carry Jixia attachment identity without signed storage data.
6. Use BlockNote native paste/drop for normal File payloads.
7. Add custom paste/drop only for real unsupported cases, and only by delegating to BlockNote default handling where appropriate.
8. Update snapshot import/export to round-trip native file blocks and legacy `jixiaImage`/`jixiaFile` safely.

## Browser Debug Bias

Do not trust component tests for this task. The proof is real browser behavior:

- file panel opens,
- paste/drop reaches BlockNote native insertion,
- direct PUT gets an HTTP response,
- CORS/preflight evidence is visible,
- save/reopen has safe persisted JSON,
- read-only disables mutation without blocking preview/download.
