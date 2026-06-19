# Task 20r Editor Engine Adapter Decision

## Status

Decided for Task 20b planning on 2026-06-19. This is an architecture decision artifact only: no production editor dependency, backend API contract, database schema, CRDT/collaboration stack, or production editor replacement is added by this task.

## Roadmap Delta

The older roadmap placed the editor engine decision at Task 23 / Gate F after a custom continuous-editor pass. Task 20a's Gate B failure changes that sequencing: continuing with the custom textarea stack would force Task 20b to rediscover the same runtime problem. This Task 20r record therefore pulls the engine/adapter decision forward before Task 20b implementation while preserving the roadmap's underlying constraints: one Notebook/Project editor, server-first lifecycle ownership, no AI writeback, no CRDT jump, no silent snapshot migration, and an explicit human review gate before dependency adoption.

## Impact Radius

| Level | Current Task 20r Impact | Task 20b Guardrail |
| --- | --- | --- |
| L1 Documentation / decision artifacts | In scope. Adds the decision record, task PRD, and Trellis context files only. | Keep the decision trace updated if the dependency/legal gate changes the primary/fallback path. |
| L2 Web editor UI shell | No production code change in Task 20r. `DocumentEditorPage` and `JixiaEditor` are analyzed but not modified. | Replace `JixiaEditor` behind a `DocumentEditorEngine` adapter without changing Notebook/Project routing. |
| L3 Shared/API document contracts | No `EditorSnapshot`, API DTO, route, database, or normalization change. | Continue writing v1 snapshots until a separate shared/API migration task approves v2. |
| L4 Attachment, AI, and auth-sensitive flows | No runtime behavior change. Existing private attachment helpers and AI no-writeback shell remain untouched. | Reuse server-owned attachment upload/download helpers; never persist signed URLs; do not pass engine mutation handles to AI. |
| L5 Dependency, licensing, and collaboration architecture | No package is added in this task. BlockNote is a recommendation pending approval, not an installed dependency. | Stop before adding BlockNote if MPL-2.0, bundle weight, Yjs-adjacent transitive packages, or CRDT assumptions are unacceptable. |

## Sources Reviewed

- `doc/Notebook_Project_Doc_Editor_Implementation_Plan.md` defines the server-first document loop, one document grammar, no editor fork, no AI writeback, no CRDT jump, and continuous writing goals.
- `.trellis/tasks/06-19-task-20a-continuous-editor-prototype/prd.md` records Gate B failure: the textarea/block-stack prototype still felt block-based and did not grow fluidly with content.
- `apps/web/src/features/documents/DocumentEditorPage.tsx` already owns document load, draft autosave, formal revision save, conflict display, archived read-only state, and AI no-writeback messaging.
- `apps/web/src/features/documents/editor/JixiaEditor.tsx` is a React-controlled list of textarea-backed blocks; this is the runtime model to stop extending for long-term editing.
- `packages/shared/src/documents.ts` defines the current transport boundary: `EditorSnapshot` v1 with readonly `EditorBlock[]`, `editorSchemaVersion: 1`, block types, text, attrs, child content, and attachment IDs.
- `apps/api/src/modules/documents/editor-schema.ts` normalizes only schema version 1 and supported block types, so any v2 transport would require an explicit shared/API change in a later approved task.
- `apps/web/src/features/attachments/AttachmentBlock.tsx` and `apps/web/src/features/attachments/uploadAttachment.ts` already preserve server-authorized upload intents, transient signed URLs, safe metadata, download requests, and read-only behavior.
- Official editor documentation reviewed via direct web fetch after Context7 quota was unavailable: BlockNote document structure, custom schemas, React integration, events, content manipulation, and format interoperability; Tiptap schemas/content checking; CodeMirror 6 system guide; Lexical editor state.
- NPM metadata checked for current BlockNote packages: `@blocknote/core`, `@blocknote/react`, and `@blocknote/mantine` currently report `MPL-2.0`; Tiptap, CodeMirror, and Lexical reviewed license text as MIT.

## Decision Summary

1. **Do not continue Task 20b on `JixiaEditor`'s textarea/block-stack runtime.** CSS and row-count tweaks cannot supply selection ownership, transaction history, paste normalization, structural keyboard behavior, undo/redo, or reliable continuous document flow.
2. **Primary engine path: BlockNote through a Jixia-owned `DocumentEditorEngine` adapter.** BlockNote is the closest fit because its native document is already an array of block objects with IDs, block types, props, inline content, child blocks, built-in headings/lists/checklists/quotes/code/tables/files/images, React integration, change/selection events, and custom schema support. It also sits on Tiptap/ProseMirror, so the underlying editing model is mature without Jixia owning all ProseMirror plumbing immediately.
3. **Fallback path: direct Tiptap/ProseMirror through the same adapter.** Use this if BlockNote's MPL-2.0 license, bundle/dependency weight, UI theming, file/image assumptions, schema limitations, or transaction visibility are rejected during Task 20b dependency/legal review.
4. **Non-paths for Task 20b:** CodeMirror 6 should be used only if product explicitly shifts to Obsidian-style Markdown-source editing; Lexical remains a viable future candidate but is not preferred now because Jixia would need to build more custom block/UI/schema behavior itself; the current custom textarea stack is explicitly rejected.
5. **Canonical storage direction:** structured editor JSON is the long-term canonical content model, with Markdown/plain text derived for export/search/indexing. Markdown should not become canonical unless the product intentionally chooses source-mode editing.
6. **Snapshot strategy:** keep `EditorSnapshot` v1 as the external API transport for Task 20b, using an adapter that imports v1 into BlockNote and exports back to v1. Introduce `EditorSnapshotV2` only in a later explicit migration task after the BlockNote adapter passes Gate B/C and the team approves richer marks/tables/schema storage. When v2 is introduced, support dual-read v1/v2 and write v2 only after a deliberate migration gate.

## Candidate Comparison

| Candidate | Fit for Jixia | Strengths | Weaknesses / Risks | Decision |
| --- | --- | --- | --- | --- |
| BlockNote | High for Notion/Outline-style structured block documents. | Native block array resembles `EditorBlock[]`; React integration via `useCreateBlockNote` and `BlockNoteView`; `onChange`/selection events; block manipulation APIs; custom schemas; built-in heading, quote, list, checklist, code, table, file, and image concepts; lossless native JSON; Markdown/HTML export available as derived formats. | Current packages report `MPL-2.0`, not MIT; dependency graph includes ProseMirror/Tiptap/Yjs packages even if collaboration is unused; default UI may need significant theme pruning; default image/file blocks expect URLs, so Jixia needs private attachment custom blocks; lower-level transactions are less directly exposed than raw ProseMirror. | Primary path, pending explicit license/dependency approval in Task 20b. |
| Tiptap / ProseMirror | High if Jixia needs full schema and transaction control. | Mature ProseMirror core; strict schemas; custom nodes/marks; plugin ecosystem; direct transaction, paste, keyboard, history, node view, and table control; MIT license; easier to forbid lossy content by schema. | More implementation work than BlockNote; Jixia must build block menus, slash commands, side handles, attachment node views, command palette, table UX, and document-level polish; higher chance of Task 20b scope creep. | Fallback path if BlockNote is rejected. |
| CodeMirror 6 Markdown-source editing | Medium/low for current product direction. | Excellent text editor; immutable state, transactions, selections, commands, history, extensions; strong for code/Markdown source and Obsidian-like workflows; MIT license. | Flat string document model fights Jixia's current block transport, attachment blocks, tables, and Notion/Outline-style block operations; structured blocks would be derived from Markdown and potentially lossy; product PRD says stop if team wants Markdown-source behavior. | Not selected unless product changes to Markdown canonical/source mode. |
| Lexical | Medium. | Modern editor state model; JSON serialization; commands, selections, updates, read/edit mode, history; MIT license; custom nodes possible; strong React ecosystem from Meta. | Jixia would still own most block document grammar, menus, attachment nodes, import/export mapping, and Notion-like block behaviors; less directly aligned to current block-array transport than BlockNote; higher implementation risk for Task 20b. | Consider later only if BlockNote and Tiptap are both rejected. |
| Current `JixiaEditor` textarea stack | Low. | Already integrated with `EditorSnapshot` v1 and attachment block UI; no new dependencies. | Does not own DOM selection, rich transactions, structural normalization, undo/redo, paste, keyboard behavior, or fluid growth; Gate B already failed specifically because this model still feels like block forms. | Explicitly rejected for Task 20b. |

## Why BlockNote Matches Jixia's Goals

BlockNote is the best next experiment because Jixia wants a server-first Notion/Outline-like document workbench, not a Markdown source editor. The product model is one shared Notebook/Project editor with blocks, attachments, draft autosave, formal revisions, human conflict review, and future metadata/AI suggestion surfaces. BlockNote's public document model has the same broad shape as Jixia's `EditorSnapshot`: block IDs, block types, props/attrs, content, child blocks, and document-level JSON that can be read on change. That means Task 20b can focus on a thin but strict adapter instead of inventing selection, paste, history, keyboard, and block command semantics.

The choice is not an unconditional dependency approval. Task 20b must begin with license and bundle/dependency review because BlockNote's current NPM packages report `MPL-2.0` and include a broader dependency graph than Jixia currently carries. If that review fails, the same adapter contract should be implemented with direct Tiptap/ProseMirror.

## Adapter Boundary

`DocumentEditorPage` remains the lifecycle shell. `DocumentEditorEngine` owns runtime editing and converts to/from snapshots.

### React Contract

```ts
export type DocumentEditorEngineProps = {
  readonly documentId: string;
  readonly documentVersionKey: string;
  readonly value: EditorSnapshot;
  readonly readOnly: boolean;
  readonly onChange: (nextSnapshot: EditorSnapshot, event: DocumentEditorChangeEvent) => void;
  readonly onRuntimeError?: (error: DocumentEditorRuntimeError) => void;
};

export type DocumentEditorEngineHandle = {
  readonly focus: () => void;
  readonly exportSnapshot: () => EditorSnapshot;
  readonly exportPlainText: () => string;
  readonly exportMarkdown: () => Promise<string>;
};

export type DocumentEditorChangeEvent = {
  readonly source: "local" | "paste" | "drop" | "undo" | "redo" | "programmatic";
  readonly changedBlockIds: readonly string[];
  readonly isStructuralChange: boolean;
};

export type DocumentEditorRuntimeError = {
  readonly category: "import_failed" | "export_failed" | "unsupported_block" | "runtime_error";
  readonly message: string;
};
```

### Ownership Rules

- `DocumentEditorPage` owns `GET /documents/:documentId`, `PUT /documents/:documentId/draft`, `POST /documents/:documentId/revisions`, title editing, base revision, dirty state, draft status, formal save status, conflict display, archived read-only state, route context, and inspector layout.
- `DocumentEditorEngine` owns editor creation/destruction, DOM editing, selection, cursor movement, keyboard shortcuts, undo/redo, paste/drop normalization, slash/block commands, block insertion/deletion/movement/nesting, block type conversion, attachment block rendering hooks, and import/export between Jixia snapshots and engine documents.
- `DocumentEditorPage` must not drive the engine as a fully controlled React textarea list. It passes the initial `value` plus `documentVersionKey`; the engine reinitializes only when document identity or committed server version changes, not on every keystroke.
- `DocumentEditorPage` should call `engineRef.current.exportSnapshot()` immediately before formal save so the payload includes the latest editor runtime state even if React state is one tick behind.
- The adapter must emit `EditorSnapshot` v1 on every local content change for the existing draft autosave debounce, but the engine's internal state remains authoritative for selection/history.
- Runtime errors must become safe UI errors; they must not expose raw provider/storage credentials, signed URLs, stack traces, or unredacted document internals beyond existing document content views.

## Import / Export Responsibilities

### Task 20b With `EditorSnapshot` v1

- Import `EditorSnapshot` v1 into an engine document once per document load or server-version reset.
- Preserve block IDs where valid and unique; generate stable engine IDs only for invalid/duplicate imported IDs and record the mapping during export.
- Convert `attrs` into engine block props only for supported safe fields: heading level, todo checked state, callout tone, code language, table shape, and attachment metadata.
- Convert `content` child blocks into engine child blocks where the selected runtime supports nesting. If unsupported for a block, preserve nested content by flattening conservatively with parent-child order and record an `unsupported_block` runtime warning.
- Export only the current v1 block union and safe `attrs` shape accepted by `apps/api/src/modules/documents/editor-schema.ts`.
- For Task 20b, prevent silent rich text loss by using a minimal schema/UI that disables inline styles not representable in v1, or by mapping them to explicit plain-text Markdown syntax only if the team approves that user-facing behavior. Do not allow users to create bold/italic/link content that disappears on save.
- Keep Markdown/plain-text export derived only; do not persist Markdown as canonical content in Task 20b.

### Later `EditorSnapshotV2` Migration Recommendation

Introduce `EditorSnapshotV2` only after the real engine passes Gate B/C. The minimum v2 shape should be transport-safe JSON in `packages/shared`, not a runtime object:

```ts
export type EditorSnapshotV2 = {
  readonly editorSchemaVersion: 2;
  readonly canonical: "structured-json";
  readonly engine: "blocknote" | "tiptap-prosemirror";
  readonly blocks: readonly unknown[];
  readonly derived?: {
    readonly plainText?: string;
    readonly markdown?: string;
  };
};
```

The v2 task should support dual-read for v1 and v2. Existing v1 documents import through the adapter. New writes may become v2 only after shared/API normalization, backend tests, web tests, and a migration gate approve the change. Until then, Task 20b must not change `currentEditorSchemaVersion` or the API/database contract.

## Block Mapping

| Jixia v1 block | Primary BlockNote model | v1 import behavior | v1 export behavior | V2 note |
| --- | --- | --- | --- | --- |
| `paragraph` | `paragraph` | `text` becomes plain text inline content. Empty/missing text becomes empty paragraph. | Collapse supported inline content to `text`; preserve `id` and safe child `content`. | Preserve full inline content/styles in native JSON. |
| `heading` | `heading` | `attrs.level` maps to heading level, clamped to 1-3. | Export `attrs.level` and plain `text`. | Preserve additional heading props only if approved. |
| `bulletList` | `bulletListItem` | Import as a list item; child blocks become nested items/children where valid. | Export as `bulletList` with text and child content. | Native nested list JSON preferred. |
| `orderedList` | `numberedListItem` | Import as numbered list item. | Export as `orderedList`. | Native nested list JSON preferred. |
| `todo` | `checkListItem` | `attrs.checked` maps to checklist checked prop. | Export `attrs.checked` and text. | Native checklist props preferred. |
| `quote` | `quote` | Plain text maps to quote content. | Export quote text. | Rich quote content can be preserved in v2. |
| `callout` | Custom `jixiaCallout` block | `attrs.tone` maps to custom callout prop; text becomes content. | Export `type: "callout"`, `attrs.tone`, and text. | Keep as first-class custom block. |
| `codeBlock` | `codeBlock` | Text maps to code content; optional `attrs.language` maps to code language. | Export text and optional language attr. | Preserve language and code metadata natively. |
| `divider` | Custom `jixiaDivider` or runtime horizontal rule wrapper | Import as non-editable divider block. | Export `type: "divider"` with no text. | Keep as atomic block. |
| `table` | `table` when parseable, otherwise custom `jixiaTableText` | Parse simple Markdown pipe-table text into table cells; malformed/complex text imports as a plain table-text block to avoid data loss. | Export table cells as Markdown pipe-table text for v1. | Native `TableContent` should be preserved in v2. |
| `image` | Custom `jixiaImageAttachment` block | `attachmentId` and `attrs.attachment` map to safe props; no signed URL is stored. | Export `attachmentId` and safe attachment metadata in `attrs.attachment`. | Optional preview URL remains transient and excluded from snapshot. |
| `file` | Custom `jixiaFileAttachment` block | Same as image, without image-only rendering. | Same as image. | Same as image. |

## Attachment Integration Plan

- Keep the API-owned attachment flow unchanged: upload intent request, direct PUT to transient signed URL with `credentials: "omit"`, confirm upload, and private download request.
- Reuse `uploadAttachment` and `openAttachmentDownload` behavior, including secret redaction and forbidden storage-key checks.
- Replace the default BlockNote image/file URL persistence with custom private attachment blocks. Block props may contain only `attachmentId` and safe metadata (`fileName`, `mimeType`, `sizeBytes`, `checksum`, `uploadedAt`). Signed upload/download URLs, object keys, storage credentials, and provider headers must never enter the editor snapshot.
- Reuse the existing `AttachmentBlock` UI where possible as the React view inside custom attachment blocks. If BlockNote block views need a new wrapper, keep upload/open actions delegated to the same helper functions.
- In read-only mode, custom attachment blocks may open existing attachments through the server download endpoint but must disable upload/replace/delete mutation controls.
- Image previews, if added, must request transient download URLs at render time and must not persist those URLs in `attrs`, localStorage, sessionStorage, test snapshots, or AI context payloads.

## Persistence And Lifecycle Plan

- **Load:** `DocumentEditorPage` calls the existing read endpoint and passes `response.currentSnapshot`, `document.id`, `baseRevision`, and `readOnly` into `DocumentEditorEngine`. The engine imports once for that document/version key.
- **Local edit:** the engine owns editing and calls `onChange(exportSnapshot(), changeEvent)` after local document updates. `DocumentEditorPage` keeps the existing dirty state and 500 ms draft autosave effect.
- **Draft autosave:** `DocumentEditorPage` continues to send `SaveDocumentDraftRequest` with `{ documentId, baseRevision, draftContent }`. The adapter does not call APIs directly.
- **Formal revision save:** before POSTing, `DocumentEditorPage` should read `engineRef.current.exportSnapshot()` to avoid stale React state, then send the existing `SaveDocumentRevisionRequest` with `baseRevision`, `contentSnapshot`, and `title`.
- **Conflict:** 409 conflict handling remains human-visible and manual. The engine must not auto-merge, ask AI to merge, or mutate content in response to a conflict. The conflict view may render exported snapshots for review as today.
- **Read-only:** archived documents pass `readOnly: true`; the engine sets runtime editability false and disables upload, block insertion, deletion, movement, slash commands, paste mutation, and formatting commands while still allowing selection/copy/open attachment.
- **Notebook/Project reuse:** the adapter takes only `documentId`, snapshot, version key, and read-only state. It must not branch on Notebook versus Project route context.
- **AI:** the inspector remains suggestion-only. The engine may later expose selected block IDs or read-only exported text as explicit context, but no AI action may call engine mutation APIs or write document content until a separate server-authorized approval/writeback contract exists.

## Risk Matrix

| Risk | BlockNote Primary | Tiptap/ProseMirror Fallback | Mitigation / Gate |
| --- | --- | --- | --- |
| Dependency weight | Higher: BlockNote pulls UI/editor layers plus ProseMirror/Tiptap/Yjs-related packages. | Moderate: choose only required Tiptap/ProseMirror extensions. | Task 20b starts with bundle/dependency review and rejects unused collaboration packages in runtime config. |
| Licensing | Current NPM metadata reports `MPL-2.0`; legal/product acceptance required. | MIT license reviewed for Tiptap/ProseMirror package path. | Stop before adding BlockNote if MPL-2.0 is unacceptable; use Tiptap fallback. |
| Schema migration cost | Low for Task 20b if v1-only/plain inline schema; medium/high for richer V2 later. | Similar, but schema is fully Jixia-authored. | Keep v1 transport in Task 20b; create explicit V2 migration task after Gate B/C. |
| Browser behavior | Mature contenteditable stack but default UI may conflict with Jixia density and attachment privacy. | Mature ProseMirror behavior but Jixia must implement more UI behavior itself. | Adapter tests plus manual 10-minute Gate B writing review; custom attachment blocks. |
| Testing strategy | Need conversion tests, adapter component tests, and mocked editor if BlockNote is hard in jsdom. | More command/schema tests can run at ProseMirror level; more custom UI tests needed. | Build adapter with pure import/export functions and a narrow React shell; keep DocumentEditorPage tests lifecycle-focused. |
| Accessibility | BlockNote ships UI but must be reviewed in Jixia workbench layout. | Jixia owns more a11y semantics and keyboard UI. | Gate B checklist includes keyboard/screen-reader pass; tests verify read-only controls and attachment labels. |
| Long-term maintainability | Fastest route to block editor UX but risk of coupling to BlockNote's schema/UI decisions. | More code to own but maximum control and stable ProseMirror concepts. | Keep `DocumentEditorEngine` adapter as the only production import boundary; no BlockNote types outside engine adapter files. |
| Attachment privacy | Default image/file blocks persist URLs, which conflicts with Jixia signed URL rules. | Custom node views required but straightforward. | Always use private custom attachment blocks; signed URLs remain transient responses only. |
| AI writeback pressure | Rich block APIs make programmatic insertion easy. | Same. | Do not expose mutation handles to AI panes; future writeback requires separate server approval contract. |

## Task 20b Implementation Split

1. **Dependency/legal gate:** decide whether BlockNote `MPL-2.0` and dependency weight are acceptable. If not, switch to the Tiptap/ProseMirror fallback before writing production code.
2. **Adapter skeleton:** create `apps/web/src/features/documents/editor/DocumentEditorEngine.tsx` and pure conversion helpers. Keep BlockNote/Tiptap imports inside adapter implementation files only.
3. **Conversion test suite:** cover round-trip import/export for every v1 block type, invalid/empty snapshots, duplicate IDs, nested content, safe attrs, attachment metadata, and malformed Markdown-style tables.
4. **Runtime implementation:** initialize the chosen engine from v1 snapshots, configure the minimal representable schema, disable unsupported rich marks unless V2 is approved, wire change/selection events, expose `exportSnapshot()` through a ref, and preserve read-only mode.
5. **Attachment custom blocks:** render private image/file blocks through existing upload/download helpers, preserve metadata, and verify signed URLs/credentials never persist.
6. **`DocumentEditorPage` integration:** replace `JixiaEditor` with `DocumentEditorEngine` without changing API routes, draft/revision payloads, conflict semantics, or Notebook/Project routing.
7. **Focused verification:** run `pnpm --filter @jixia/web test -- DocumentEditorPage`, adapter conversion tests, attachment-focused tests, and `pnpm --filter @jixia/web build`.
8. **Gate B repeat:** stop for manual writing review before calling Task 20b complete or starting inspector/metadata work.

## Testing Plan For Task 20b

- **Pure adapter tests:** `EditorSnapshot` v1 -> engine document -> `EditorSnapshot` v1 round trips for paragraph, heading levels, bullet/ordered/todo lists, quote, callout tone, code language/text, divider, table, image, and file.
- **Loss prevention tests:** unsupported inline marks are either impossible through the configured schema or exported as an explicitly approved textual representation. No styled content silently disappears.
- **Document lifecycle tests:** `DocumentEditorPage` still loads snapshots, updates dirty state on engine changes, autosaves drafts only to the draft endpoint, posts formal revisions only to the revision endpoint, preserves title saves, shows 409 conflict view, and keeps archived documents read-only.
- **Attachment tests:** private upload intent/direct PUT/confirm/download flow still works; read-only disables upload/replace; snapshot includes only `attachmentId` and safe metadata; browser requests do not carry auth headers to signed upload URLs.
- **AI no-writeback tests:** inspector/copilot UI has no insert/apply/rewrite mutation path and no engine mutation handle is passed into AI components.
- **Build/type checks:** run `pnpm --filter @jixia/web test -- DocumentEditorPage`, any new `DocumentEditorEngine`/conversion tests, and `pnpm --filter @jixia/web build` before Gate B.

## Revised Gate B Repeat Checklist

The reviewer should manually write for at least 10 minutes in both a Notebook document and a Project document, using the same shared editor component.

- Typing feels like one continuous document, not a stack of form fields.
- Paragraphs and headings grow fluidly with content without visible textarea row limits.
- Enter, Shift+Enter, Backspace/Delete on empty blocks, arrow navigation, undo/redo, paste, and block type switching behave predictably.
- Lists, todos, quote, callout, code, divider, table, image, and file blocks are discoverable without noisy permanent card chrome.
- Block insertion/deletion/movement does not reset selection or jump scroll unexpectedly.
- Draft autosave still writes drafts only; formal save still advances revision state; conflict still requires human review.
- Archived/read-only documents allow selection/copy/open attachment but no document or attachment mutation.
- Attachment upload/open uses the private server flow and no signed URL is persisted or displayed as document content.
- AI remains suggestion-only with no direct document writeback actions.
- Jixia's compact ResearchClaw-adjacent workbench density is preserved.

## Acceptance Trace

- [x] Rejects continuing Task 20b on the current textarea/block-stack runtime.
- [x] Compares BlockNote, Tiptap/ProseMirror, CodeMirror 6, Lexical, and the current custom editor.
- [x] Recommends BlockNote primary and Tiptap/ProseMirror fallback with rationale tied to Notebook/Project document goals.
- [x] Defines an adapter boundary that keeps `DocumentEditorPage` server lifecycle separate from runtime editing behavior.
- [x] Preserves attachment, read-only, draft save, revision publish, conflict, and AI no-writeback semantics in the plan.
- [x] Addresses `EditorSnapshot` / `EditorBlock` v1 compatibility and recommends a later dual-read `EditorSnapshotV2` migration only after approval.
- [x] Adds no production dependency, backend API change, database schema change, CRDT, or production editor replacement.
- [x] Defines a Task 20b split, testing plan, and Gate B repeat checklist so the next task does not rediscover architecture questions.
