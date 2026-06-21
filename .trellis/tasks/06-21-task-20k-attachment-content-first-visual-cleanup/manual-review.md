# Task 20k Manual Review Checklist

## Start From Task20j Server-First Stack

Use the same LAN/server-first review shape proven in Task20j, or the real API equivalent.

Record:

- Web origin:
- API origin:
- object-storage public base:
- allowed origins:
- browser/device:

## Required Checks

1. Open Notebook document.
2. Upload an image.
3. Verify the ready state is just the image/content-first presentation.
4. Verify there are no permanent function boxes, metadata panels, status explanations, or replacement dropzone above/below the ready image.
5. Hover/select/right-click the image and verify operations are reachable contextually.
6. Save, refresh, reopen, and verify the same image renders correctly.
7. Repeat the image check in a Project document.
8. Upload a non-image file and verify ready state is compact, not a full management panel.
9. Verify upload/error/empty states still have enough affordance.
10. Inspect persisted snapshot/DTO if possible: no signed URL, object key, bucket, or storage secret.

## Optional If Touched

- Real OS clipboard image paste.
- Real file-manager drag/drop.

## Pass Condition

The reviewer should describe the image as document content, not as an upload/debug widget.
