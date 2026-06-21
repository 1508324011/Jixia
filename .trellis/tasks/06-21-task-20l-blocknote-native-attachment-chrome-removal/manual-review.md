# Task 20l Manual Review Checklist

## Environment

Use the known Task20j/20k server-first review shape or equivalent real API setup.

Record:

- Web origin:
- API origin:
- object-storage public base:
- allowed origins:
- browser/device:

## Required Checks

1. Open a Notebook document.
2. Confirm there is no prominent custom top `Attach` control in the editor chrome.
3. Upload an image using the available BlockNote-native/default path.
4. Confirm the ready image has no Jixia `Open`, `Replace`, or `Remove` hover toolbar.
5. Save, refresh, reopen, and confirm the image remains clean.
6. Repeat in a Project document.
7. Upload a non-image file and confirm ready file has no Jixia `Open`, `Replace`, or `Remove` hover toolbar.
8. Confirm upload/error/empty states still have enough affordance.
9. Inspect persisted snapshot/DTO if possible: no signed URL, object key, bucket, or storage secret.

## Optional If Touched

- Real OS clipboard image paste.
- Real file-manager drag/drop.

## Pass Condition

The ready document body should look BlockNote-native. Jixia-specific attachment controls should not be visible in the ready state.
