# Task 20j BlockNote default code block and server-first upload

## Source of Truth

- Superseded task: `.trellis/tasks/06-20-task-20i-complete-document-editor-ux/task.json`
- Failed manual hardening: `.trellis/tasks/06-20-task-20h-manual-review-hardening/task.json`
- BlockNote-native file pipeline checkpoint: `.trellis/tasks/06-20-task-20g-blocknote-native-file-pipeline/task.json`
- Local attachment storage foundation: `.trellis/tasks/06-19-task-20d-local-attachment-storage-upload-e2e/prd.md`
- Shared editor adapter: `apps/web/src/features/documents/editor/JixiaEditor.tsx`
- Browser upload adapter: `apps/web/src/features/attachments/uploadAttachment.ts`
- Manual/mock API fixture: `apps/web/e2e/test-api.mjs`
- Local object-storage boundary: `apps/api/src/modules/attachments/object-storage.ts`, `apps/api/src/modules/attachments/local-object-storage.routes.ts`
- Editor roadmap: `doc/Notebook_Project_Doc_Editor_Implementation_Plan.md`

## Root Problem

Task 20i had the wrong data model for the editor UX. It tried to make a custom Jixia code block easier to discover. That is backwards. If Jixia uses BlockNote, the default BlockNote block model and visual language must be the normal path.

The upload bug is a different but equally simple data-structure bug: the browser receives an absolute signed upload URL. That URL, the server listen address, and CORS must describe the same reachable world from the browser's point of view. A loopback-only fixture is not a server-first system.

## Binding Decisions

1. Use BlockNote default `codeBlock` as the authoritative code block path.
2. Normal slash/default insertion (`/code`) must be the primary code-block UX.
3. Remove, disable, or demote the separate `jixiaCodeBlock` custom renderer and the ugly `Insert block` dependency.
4. Accept that default BlockNote code blocks do not provide Jixia custom copy/wrap chrome. If language support is needed, configure BlockNote's default code-block options or extension without creating a separate product path.
5. Treat Jixia as server-first and remote-browser-first. Localhost is only a same-machine review mode, not the product assumption.

## Goal

Deliver a cleaner document-editor foundation that is boring in the good way:

- code blocks use BlockNote's default visual style and insertion behavior,
- image/file upload works from a remote browser against a server-first local stack,
- Notebook and Project documents share one editor path,
- private attachment metadata remains safe and server-authorized,
- manual review can reproduce the real browser boundaries without guessing.

## Non-Negotiable Constraints

- Keep one shared `DocumentEditorPage` and `JixiaEditor` boundary for Notebook and Project documents.
- Do not introduce another editor engine, markdown-source pivot, CodeMirror source mode, collaboration, comments, mentions, AI writeback, export, or unrelated page redesign.
- Do not persist signed URLs, object keys, storage keys, bucket names, upload headers, credentials, cookies, local filesystem paths, raw local object-storage URLs, or other storage secrets in document snapshots, DTOs, browser storage, or AI context.
- Do not weaken committed CORS defaults with wildcard remote access.
- Do not make the custom `Insert block` dropdown the required path for code blocks.
- Do not keep two competing code-block data paths unless one is a documented read-compatible fallback.
- If this requires a schema/migration change beyond editor snapshot mapping, stop and replan before implementation.

## In Scope

### 1. BlockNote Default Code Block

- Map app-level `codeBlock` to BlockNote `type: "codeBlock"`, not a separate `jixiaCodeBlock` primary type.
- Ensure `/code` and any default BlockNote code-block insertion path create the authoritative block.
- Remove or disable the special Jixia code-block chrome from the primary editor path.
- Preserve read compatibility for existing saved `jixiaCodeBlock` content if such snapshots exist.
- Preserve safe serialization back to the shared app document block model.
- Keep code blocks visually consistent with BlockNote defaults.

### 2. Remove Ugly Primary Insert Dependency

- Do not require users to use the custom `Insert block` control for common blocks.
- Keep BlockNote slash/default insertion and native UI as the normal interaction model.
- If the custom control remains temporarily, it must be secondary and must not create divergent block types.

### 3. Server-First Direct Upload

- Make the manual/mock API fixture capable of remote-browser review: listen on a browser-reachable interface when configured, sign upload URLs with a browser-reachable public base, and allow the exact Web origin.
- Keep same-machine localhost review working.
- Ensure direct signed `PUT` still uses no credentials and is followed by API confirmation.
- Improve or preserve diagnostics that distinguish intent, preflight/direct upload, confirm, signed download, render, and save failures.
- Document exact env/command shape for localhost and LAN/domain review.

### 4. Attachment Editor Path Sanity

- Keep BlockNote-native image/file insertion as the primary path.
- Keep Jixia's private attachment identity, permissions, signed upload, confirm, and signed download semantics.
- Make wrappers look like BlockNote-native blocks where custom metadata is unavoidable.
- Do not revive legacy attachment-card upload as a competing primary product path.

## Out of Scope

- Notion database features.
- Obsidian graph/backlink implementation.
- Real-time collaboration/Yjs.
- Plugin system.
- AI retrieval/writeback.
- Full attachment manager redesign.
- Production reverse proxy automation beyond documenting the server-first local/manual review shape.

## Functional Requirements

1. `/code` creates a default-looking BlockNote code block.
2. App-level saved `codeBlock` data reopens as default BlockNote `codeBlock`.
3. Existing documents with previous code-block snapshots remain readable.
4. The custom `jixiaCodeBlock` path is not the primary path for new code blocks.
5. The custom `Insert block` control is not required for inserting code blocks.
6. A remote browser can create an upload intent, perform direct upload, confirm, render signed download, save, refresh, and reopen.
7. The upload public base URL in intent responses is reachable from the browser origin used for review.
8. CORS allows the exact review origin and does not rely on wildcard committed defaults.
9. Notebook and Project document routes behave the same for code blocks and attachments.
10. Persisted snapshots and DTOs contain only safe app metadata, not storage implementation secrets.

## Acceptance Criteria

- [ ] `.trellis/.current-task` points to `.trellis/tasks/06-21-task-20j-blocknote-default-codeblock-server-first-upload` before implementation starts.
- [ ] Task 20i is recorded as `manual-review-failed` and `supersededBy` Task 20j.
- [ ] New code-block insertion through `/code` uses BlockNote default `codeBlock` and default visual style.
- [ ] App-level `codeBlock` serialization/deserialization does not route new blocks through `jixiaCodeBlock`.
- [ ] The custom `Insert block` path is removed, disabled, or demoted so it cannot create a divergent primary code-block UX.
- [ ] Existing saved code block content remains readable after the mapping change.
- [ ] Localhost review still works: Web origin, API origin, object-storage public base, and CORS are documented.
- [ ] Remote-browser review works: Web origin, API origin, object-storage public base, listen host, and CORS are documented and tested from the browser's point of view.
- [ ] Direct upload failure messages identify whether the failure is intent, preflight/direct PUT, confirm, signed download, render, or save.
- [ ] Notebook and Project editor flows pass the same manual checklist.
- [ ] Automated tests cover the code-block mapping and upload adapter boundaries they can honestly prove.
- [ ] Any remaining real OS paste/drop uncertainty is recorded as a manual gate, not claimed as finished from synthetic tests.

## Manual Review Gate

Run this from the actual remote browser origin when reviewing server-first behavior.

1. Record Web origin, API origin, local object-storage public base URL, API listen host, and allowed origins.
2. Create/open a Notebook document.
3. Type `/code`, insert a code block, save, refresh, and reopen.
4. Verify the code block looks like BlockNote default code block and was not inserted through `Insert block`.
5. Repeat the same code-block flow in a Project document.
6. Upload an image through the editor's primary BlockNote path.
7. Upload a non-image file through the editor's primary BlockNote path.
8. Verify browser Network shows intent, preflight/direct `PUT`, confirm, signed download/render, save, refresh, and reopen.
9. Inspect persisted document snapshot/DTO for forbidden storage fields.
10. Paste an OS clipboard image and drag a file from the OS file manager if the implementation touches paste/drop. Record real browser results.
11. Do not mark finished unless all required observations are true or blockers are explicitly recorded.

## Suggested Verification Commands

```bash
pnpm --filter @jixia/web test -- JixiaEditor
pnpm --filter @jixia/web test -- uploadAttachment
pnpm --filter @jixia/web exec playwright test --config ../../playwright.config.ts e2e/attachment-upload.spec.ts
pnpm --filter @jixia/web exec playwright test --config ../../playwright.config.ts e2e/document-save.spec.ts
pnpm --filter @jixia/web lint
pnpm --filter @jixia/web build
```

If API or fixture upload/CORS behavior changes:

```bash
pnpm --filter @jixia/api test -- attachment
pnpm --filter @jixia/api lint
```

## Recommended Implementation Order

1. Collapse the code-block data path: app `codeBlock` -> BlockNote `codeBlock`; preserve read compatibility.
2. Remove or demote `jixiaCodeBlock` and the custom `Insert block` dependency.
3. Update code-block tests to cover the active editor mapping and slash/default insertion path where possible.
4. Make `apps/web/e2e/test-api.mjs` configurable for server-first manual review: listen host, public object-storage base, and allowed Web origins.
5. Verify direct upload from the remote-browser origin.
6. Update manual-review instructions and stop at the human review gate.
