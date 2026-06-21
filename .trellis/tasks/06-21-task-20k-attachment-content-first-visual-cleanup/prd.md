# Task 20k PRD: Attachment Content-First Visual Cleanup

## Source Of Truth

- Supersedes the visual/manual-review failure recorded in `.trellis/tasks/06-21-task-20j-blocknote-default-codeblock-server-first-upload/task.json`.
- Builds on Task20j, which fixed the BlockNote default `codeBlock` direction and server-first upload reachability.
- Active implementation targets:
  - `apps/web/src/features/documents/editor/JixiaEditor.tsx`
  - `apps/web/src/features/layout/workbench.css`
  - `apps/web/src/features/attachments/uploadAttachment.ts`
  - `apps/web/e2e/attachment-upload.spec.ts`
  - `apps/web/e2e/document-save.spec.ts`
- Active render component identified during manual review diagnosis: `JixiaNativeAttachmentFrame` in `JixiaEditor.tsx`.

## Root Problem

Task20j fixed the upload pipe. The attachment reaches the document. Then we make it ugly.

A ready uploaded image is still rendered like a management/debug panel: permanent top chrome, action buttons, replacement dropzone, metadata rows, native content, and explanatory status text. That is the wrong data structure for UI state. A ready image is content. It is not an upload form anymore.

Mature editors follow a simple rule:

- ready image: show the image
- uploading image: show lightweight progress
- failed image: show compact retry/error surface
- empty image placeholder: show upload/drop affordance
- selected or hovered image: reveal operations contextually

Jixia currently treats these as one always-visible frame. That creates special-case visual garbage instead of eliminating it.

## Binding Decisions

1. A ready uploaded image must render content-first: visually it should look like an image in a document, not a card full of controls.
2. Controls must move out of the permanent ready-state surface. Use hover, selected state, right-click/context menu, tiny overlay, popover, inspector, or explicit debug/manual-review surface.
3. Keep Task20j decisions intact: BlockNote default `codeBlock` remains authoritative, and server-first upload host/public-base/CORS behavior must not regress.
4. Preserve security and persistence invariants: saved snapshots and DTOs may contain safe attachment identifiers/metadata, never raw storage keys, buckets, unsigned local paths, or persisted signed URLs.
5. Do not replace BlockNote or build a second editor engine.

## Goal

Make uploaded attachments feel like native document content.

For images, the default ready state should be just the image, integrated with text around it. For files, the default ready state should be a compact document-style file chip/card. Operations still exist, but they are contextual. Debug metadata still exists when needed, but not as permanent body content.

## Non-Goals

- No new editor engine.
- No collaboration/Yjs/comments/plugin system.
- No redesign of the upload service contract except where tests need to verify unchanged behavior.
- No Notion/Obsidian code copying.
- No broad theme redesign outside the active attachment frame and directly related tests/docs.
- No wildcard CORS or relaxed attachment security to make review easier.

## Functional Requirements

### Ready Image State

- A successfully uploaded image renders as the image itself in the editor body.
- There must be no permanent action strip, metadata list, explanatory status message, or replacement dropzone above/below the ready image.
- The image should inherit BlockNote/editor spacing as much as possible.
- Contextual operations must remain discoverable through one or more mature surfaces:
  - hover overlay
  - selected state controls
  - right-click/context menu
  - block menu/side menu integration
  - inspector or details popover

### Ready File State

- A non-image file renders as a compact file chip/card with file name/type/size if safe and useful.
- It must not render as a full debug panel.
- Download/open/copy/replace/remove must be contextual or compact.

### Uploading, Empty, Dragging, Error States

- Uploading state may show progress/status because the user needs feedback.
- Empty state may show upload/drop affordance.
- Dragging state may show a drop target.
- Error state must show a compact retry/error affordance.
- These visible affordances must not leak into ready state.

### Persistence And Security

- Save/refresh/reopen must preserve attachment identity and render the same content-first state.
- Persisted editor snapshots must not include signed URLs, raw object keys, bucket names, or storage internals.
- Server-authorized signed download/render flow remains unchanged.

### Notebook/Project Parity

- The same editor path and visual behavior must work in Notebook documents and Project documents.

## Acceptance Criteria

- Manual reviewer uploads an image and sees the image inline, with no permanent boxes above or below it.
- Hover/selection/right-click exposes necessary operations without making the default state noisy.
- Manual reviewer uploads a file and sees a compact file presentation, not a management panel.
- Image/file save, refresh, reopen, and signed download/render still work.
- Existing upload pipeline tests still pass.
- E2E verifies attachment upload/render/save/reopen in the active editor path.
- Visual evidence is recorded in manual review notes or screenshots.

## Suggested Implementation Order

1. Refactor `JixiaNativeAttachmentFrame` to branch by attachment state before rendering chrome.
2. Make ready image state render only the native BlockNote image/content wrapper plus minimal contextual affordance.
3. Make ready file state compact.
4. Move metadata/status/actions into contextual surfaces or debug/manual-review-only affordances.
5. Delete or weaken heavy `.jixia-native-attachment-frame` ready-state card CSS.
6. Preserve/uploading/error/empty visible affordances.
7. Update tests for active editor behavior, not legacy attachment-card assumptions.
8. Run focused web tests, Playwright attachment/document specs, lint/build, and then stop at human visual review gate.

## Manual Review Gate

Record:

- Web origin
- API origin
- object-storage public base URL
- browser used
- Notebook image upload screenshot/result
- Project image upload screenshot/result
- ready image default state evidence
- contextual controls evidence
- ready file compact state evidence
- save/refresh/reopen result
- any real OS paste/drop evidence if touched

Do not mark this task complete without human visual approval.
