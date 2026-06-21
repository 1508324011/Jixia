# Task 20m PRD: Document Visual Baseline

## Source Of Truth

- Follows successful manual review of `.trellis/tasks/06-21-task-20l-blocknote-native-attachment-chrome-removal`.
- Builds on Task20j: BlockNote default `codeBlock` and server-first remote-browser upload configuration.
- Builds on Task20k: ready images/files became content-first instead of management panels.
- Builds on Task20l: top Jixia `Attach` shortcut and ready-state Jixia attachment hover toolbar were removed.
- Current strategic rule: **BlockNote owns editor interaction. Jixia owns server semantics. Document body stays clean.**

## Root Problem

Jixia stopped being a control exhibition, but it is not yet a mature document surface.

The remaining problem is not one attachment button. The problem is the visual baseline: page width, typography rhythm, block spacing, heading/list/quote/code/image/file balance, empty document affordance, and hover/focus/selection behavior are not designed as one system.

If this is not fixed, every future feature will add more local CSS and the editor will turn back into a pile of special cases.

## Product Comparison

- Notion: clean document body, operations delayed to block handles/slash/context surfaces, strong page rhythm.
- Obsidian: body-first writing, restrained embeds, clean Markdown-like reading surface.
- Outline/BookStack: server-first knowledge systems keep governance outside正文 and preserve readable page structure.
- AFFiNE/AppFlowy/Logseq: useful block interaction feel, but their local-first/CRDT stack is not the model for Jixia now.

Jixia should learn the design patterns, not copy product code or clone databases/graphs before the document body is mature.

## Goal

Create a cohesive, BlockNote-aligned visual baseline for Notebook and Project documents.

This task should make the document body feel calmer, readable, and consistent across common block types without adding new product features.

## Non-Goals

- No new collaboration, comments, AI retrieval, backlinks, templates, or graph features.
- No editor engine replacement.
- No Notion/Obsidian code copying.
- No new custom Jixia block chrome in the document body.
- No changes that weaken server-first upload security or persisted attachment safety.

## Functional Requirements

### Page And Typography

- Establish readable document width and body rhythm for the editor area.
- Improve paragraph, heading, list, quote, code, image, and file spacing as one system.
- Keep style aligned with BlockNote defaults instead of overriding everything.
- Avoid dense enterprise-form UI in the document body.

### Empty And Loading States

- Empty documents should have a calm writing affordance that fits the editor, not a control panel.
- Loading/saving/error states should be visible but not visually dominate normal writing.

### Interaction States

- Hover, focus, selection, and drag/drop states should be subtle, consistent, and not look like Jixia-invented chrome.
- Ready image/file states must remain clean after Task20l.
- BlockNote slash/default/selection/side-menu surfaces should remain the primary editor interaction model.

### Regression Boundaries

- Default BlockNote `codeBlock` remains authoritative.
- Image/file upload, save, refresh, reopen, signed render/download, and safe persistence still work.
- Notebook and Project documents use the same visual/editor path.
- No signed URL, storage key, bucket, or storage secret is persisted.

## Acceptance Criteria

- Manual reviewer sees a visibly calmer, cohesive document surface across Notebook and Project documents.
- Paragraphs/headings/lists/quotes/code/images/files have consistent rhythm and spacing.
- Empty document affordance is useful but not noisy.
- Hover/focus/selection states are subtle and aligned with BlockNote, not custom Jixia chrome.
- Task20l clean attachment ready states do not regress.
- Task20j default `codeBlock` and server-first upload behavior do not regress.
- Focused unit/E2E/lint/build verification passes.
- Human visual review records evidence or detailed observations.

## Suggested Implementation Order

1. Audit current editor/page CSS around document body, BlockNote wrapper, workbench surface, and block spacing.
2. Define a small set of document-body visual rules: width, typography, rhythm, spacing, subtle states.
3. Remove or weaken local styles that fight BlockNote defaults.
4. Improve empty document and normal writing states without adding new controls.
5. Verify common block types: paragraph, heading, list, quote, code, image, file.
6. Verify Notebook and Project parity.
7. Run focused tests and stop at manual visual review gate.

## Manual Review Gate

Record:

- Web origin:
- API origin:
- browser/device:
- Notebook visual observations:
- Project visual observations:
- Paragraph/heading/list/quote/code rhythm:
- Image/file spacing:
- Empty document state:
- Hover/focus/selection behavior:
- Upload/save/refresh/reopen result:
- Before/after screenshots or written evidence:

Do not mark this task complete without human visual approval.
