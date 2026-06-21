# Task 20l PRD: BlockNote-Native Attachment Chrome Removal

## Source Of Truth

- Supersedes the partial manual review recorded in `.trellis/tasks/06-21-task-20k-attachment-content-first-visual-cleanup/task.json`.
- Builds on Task20j server-first upload and default BlockNote `codeBlock` direction.
- Builds on Task20k content-first attachment rendering.
- Current remaining bad UI identified during review:
  - Top `Attach` shortcut controls in `apps/web/src/features/documents/editor/JixiaEditor.tsx` around the editor toolbar area.
  - Ready image contextual hover controls (`Open`, `Replace`, `Remove`) in `JixiaEditor.tsx` ready image rendering.
  - Ready file contextual hover controls in `JixiaEditor.tsx` ready file rendering.
  - CSS reveal/chrome rules in `apps/web/src/features/layout/workbench.css`.

## Root Problem

Task20k fixed the worst problem: a ready image no longer looked like a full management/debug panel.

But it still kept unnecessary custom Jixia chrome. That is still bad taste. If we chose BlockNote, the editor should look and behave like BlockNote. Jixia should not keep inventing small custom controls on top of every block.

The correct data relationship is:

```text
BlockNote owns editor interaction surfaces.
Jixia owns server attachment semantics.
```

Not this:

```text
Every ready attachment owns a little Jixia toolbar.
```

## Binding Decisions

1. Remove the top-level `Attach` shortcut UI from the primary editor surface. Attachment insertion should rely on BlockNote-native slash/menu/file/paste/drop behavior where available.
2. Remove ready-state Jixia hover controls such as `Open`, `Replace`, and `Remove` from image/file blocks.
3. Ready image should be the native image/content, without Jixia custom chrome.
4. Ready file should be compact and BlockNote-like/default, without Jixia custom toolbar.
5. Keep upload/server semantics hidden but intact: upload intent, direct PUT, confirm, safe persisted id/metadata, signed download/render.
6. Keep Task20j codeBlock behavior unchanged.
7. Keep Task20k state split: upload/empty/error/drag states may show affordances; ready state must stay clean.

## Goal

Make attachment blocks feel native to the BlockNote document. The user should not see Jixia-specific controls unless there is a real state that requires them, such as upload progress or error recovery.

## Non-Goals

- No new editor engine.
- No custom Notion clone block menu.
- No broad theme redesign.
- No server upload contract rewrite unless needed to preserve existing tests.
- No regression of upload, signed download, Notebook/Project parity, or safe persistence.
- No commit/push/PR in this task flow.

## Functional Requirements

### Attachment Insertion

- The primary editor surface should not require or show a custom top `Attach` control.
- Existing BlockNote-native insertion paths should continue to work as much as the current implementation supports:
  - slash/default menu
  - file panel/default upload behavior
  - paste
  - drag/drop
- If a fallback insertion affordance must remain for accessibility or coverage, it must not be a prominent custom top editor chrome element.

### Ready Image State

- No Jixia hover toolbar with `Open`, `Replace`, or `Remove`.
- No permanent Jixia chrome.
- Image should look like document content.
- If native BlockNote side menu/selection controls exist, rely on those.

### Ready File State

- No Jixia hover toolbar with `Open`, `Replace`, or `Remove`.
- File block/chip remains compact and visually quiet.
- Do not reintroduce metadata panels or status explanations.

### Non-Ready States

- Uploading state may show progress.
- Empty placeholder may show upload/drop affordance if BlockNote needs it.
- Dragging state may show drop affordance.
- Error state must show compact recovery affordance.
- These affordances must not appear in ready state.

### Security And Persistence

- Do not persist signed URLs, raw object keys, bucket names, storage paths, or local filesystem details.
- Keep direct upload credentialless.
- Keep exact-origin/no-wildcard local object-storage rules.
- Save/refresh/reopen must preserve safe attachment metadata and render cleanly.

## Acceptance Criteria

- Manual reviewer sees no top `Attach` control in the primary editor chrome.
- Ready uploaded image has no Jixia `Open`, `Replace`, or `Remove` hover toolbar.
- Ready file block has no Jixia `Open`, `Replace`, or `Remove` hover toolbar.
- Image/file upload still works in Notebook and Project documents.
- Save, refresh, reopen, and signed render/download still work.
- Paste/drop paths are not regressed if currently supported.
- Existing focused tests and Playwright attachment/document specs pass.
- Human visual review confirms the ready-state document body is clean and BlockNote-native.

## Suggested Implementation Order

1. Remove/demote the top `Attach` shortcut UI from `JixiaEditor.tsx`.
2. Remove ready image/file contextual action toolbars from `JixiaNativeAttachmentFrame`.
3. Delete unused handlers/state/CSS after removing those controls.
4. Keep upload/empty/error/drag affordances intact.
5. Update tests to assert absence of Jixia ready-state chrome and continued upload/render/save/reopen behavior.
6. Run focused web tests, Playwright attachment/document specs, lint/build, and stop at manual review gate.

## Manual Review Gate

Record:

- Web origin:
- API origin:
- object-storage public base:
- browser/device:
- Notebook image ready-state evidence:
- Project image ready-state evidence:
- Ready file evidence:
- Confirmation that no top Attach control is visible:
- Confirmation that no ready-state Open/Replace/Remove hover toolbar is visible:
- Save/refresh/reopen result:
- Paste/drop result if checked:

Do not mark the task complete without this evidence.
