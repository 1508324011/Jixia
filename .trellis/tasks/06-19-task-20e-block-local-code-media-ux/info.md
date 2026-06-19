# Task 20e Technical Design Notes

## Core Data Relationship

The stable data relationship is simple and must stay simple:

`DocumentEditorPage` owns document lifecycle -> `JixiaEditor` owns editor/runtime blocks -> `AttachmentBlock` owns one media/file block UI -> `uploadAttachment` calls the API upload contract -> persisted `EditorSnapshot` stores only safe app-owned block metadata.

The bad current special case is that media upload exists only as a small action-row file input. That makes the block look interactive while most clicks do nothing. Task 20e should make the block itself the interaction surface and keep the explicit buttons as secondary controls.

## Recommended Implementation Shape

- Keep `DocumentEditorPage` unchanged except for wiring if absolutely necessary.
- Keep BlockNote as the editor adapter.
- Add scoped code-block styling under `.jixia-blocknote-shell` first; only add a custom code block component if CSS and existing BlockNote props cannot provide readable/local controls.
- Move code language/copy/wrap controls into block-local UI or a selected-block overlay owned by the editor/block, not page chrome.
- Extend `AttachmentBlock` with card-level click/keyboard/drop states and a single internal file-selection pathway.
- Add paste/drop handling at the `JixiaEditor` boundary so clipboard/drop files can create upload placeholders near the cursor.
- Reuse `uploadAttachment` and `openAttachmentDownload`; do not duplicate upload protocol code.
- Represent failed/pending upload as explicit editor state or safe temporary block props that cannot be mistaken for confirmed attachment data.

## Known Failure Points To Check First

- `BlockNoteView` currently has `filePanel={false}`; either implement an alternative correctly or deliberately re-enable/configure the native upload path.
- `AttachmentBlock` only uploads through a hidden file input inside an action label.
- `workbench.css` does not own nested code block foreground/token colors.
- There is no `onPaste`/`onDrop`/`ClipboardEvent`/`DataTransfer` handling for files/images.

## Design Bias

Do not build a huge abstraction. Fix the interaction model at the block boundary. One block, one owner, one upload path, one safe persisted representation.
