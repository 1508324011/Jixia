# Task 20m Manual Review Checklist

## Environment

- Web origin: http://10.128.253.195:5173
- API origin: http://10.128.253.195:4174
- object-storage public base: http://10.128.253.195:4174/local-object-storage
- browser/device: remote browser via server-first LAN review stack
- reviewed at: 2026-06-21T14:54:22+00:00
- result: passed

## Required Visual Checks

1. Open a Notebook document. — Passed.
2. Inspect empty document state. — Passed.
3. Create paragraph, heading, list, quote, code, image, and file blocks. — Passed.
4. Verify page width, typography, and spacing feel cohesive. — Passed.
5. Verify hover/focus/selection states are subtle and BlockNote-aligned. — Passed.
6. Verify no top custom Attach control returns. — Passed.
7. Verify ready image/file states remain clean with no Jixia ready-state hover toolbar. — Passed.
8. Save, refresh, reopen, and verify visual state persists. — Passed.
9. Repeat representative checks in a Project document. — Passed.
10. Record before/after screenshots or detailed written observations. — User confirmed the current baseline is fully usable.

## Upload/Safety Spot Check

- Upload image: Passed in manual review.
- Upload file: Passed in manual review.
- Save/refresh/reopen: Passed in manual review.
- Persisted snapshot/DTO has no signed URL/object key/bucket/storage secret: Covered by Task20m automated checks and retained as a manual safety assertion.

## Pass Condition

Passed. The user confirmed the document now feels fully usable as a cohesive BlockNote-based writing surface, not a collection of unrelated Jixia widgets.
