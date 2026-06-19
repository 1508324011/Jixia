# Notebook / Project Document Editor Implementation Plan

> **Purpose:** define the next post-MVP implementation sequence for Jixia's Notebook and Project document editor surfaces. This plan turns the existing Stage B/C roadmap in `doc/MVP_implement.md` into executable tasks with review gates, acceptance criteria, and verification commands.

## Strategic Direction

Jixia should now prioritize the Notebook / Project document workbench over more standalone AI polish. The AI provider/chat stack already has a usable vertical slice; the document workbench is still missing the product spine that AI should later attach to.

The immediate goal is not to clone Notion, Obsidian, Outline, Logseq, or BlockNote. The goal is to close Jixia's own server-first document loop:

```text
authorized document collection -> create/open -> editor-first writing -> draft autosave -> formal revision -> conflict/read-only handling -> metadata/attachments/versions inspection
```

## Design Principles

- **Server-first document ownership:** the API owns permissions, listing, document identity, revision state, draft state, attachment access, and project/notebook boundaries.
- **One document grammar:** Notebook documents and Project documents must share `EditorSnapshot`, `EditorBlock`, draft save, formal revision save, attachments, and conflict behavior.
- **No editor fork:** Notebook must reuse the same document editor frame as Project Docs. Any scope-specific behavior belongs in collection/listing or metadata, not in a separate editor implementation.
- **No AI writeback:** AI may appear as contextual suggestion-only help later, but it must not silently modify persisted document content.
- **No CRDT jump yet:** do not introduce Yjs, Hocuspocus, Tiptap collaboration, or BlockNote until Jixia has a stable adapter boundary and a proven editor-first UX.
- **Continuous writing first:** the editor should feel like a continuous writing surface with lightweight block controls, not a stack of heavy form cards.

## Existing Assets To Reuse

- `packages/shared/src/documents.ts`: keep `documentTypes = ["notebook", "project"]`, `EditorSnapshot`, `EditorBlock`, create/save/conflict DTOs, and extend only for transport-safe list payloads if needed.
- `packages/db/prisma/schema.prisma`: keep the existing `Document`, `DocumentDraft`, `DocumentRevision`, `DocumentAttachment`, and indexes on `ownerUserId` / `projectId`; Task 19 should not need a Prisma migration.
- `apps/api/src/modules/documents/document.service.ts`: extend the existing repository/service with list methods instead of creating a parallel notebook service.
- `apps/api/src/modules/documents/document.routes.ts`: add document collection routes beside existing create/read/draft/revision lifecycle routes.
- `apps/web/src/features/documents/DocumentEditorPage.tsx`: preserve load, autosave, formal save, 409 conflict, archived read-only, status strip, and no-writeback semantics.
- `apps/web/src/features/documents/editor/JixiaEditor.tsx`: refactor the UI around the same snapshot transport before considering a third-party editor engine.
- `apps/web/src/features/documents/DocumentList.tsx`: generalize into a reusable collection panel for project and notebook scopes.
- `apps/web/src/features/attachments/AttachmentBlock.tsx` and `apps/web/src/features/attachments/uploadAttachment.ts`: reuse the existing private attachment flow.
- `apps/web/src/features/layout/workbench.tsx`: reuse `WorkbenchSurface`, `WorkspaceFrame`, `WorkspaceMainSplit`, `ArtifactCanvas`, `Inspector`, `ListRow`, `MetaGrid`, `StatusStrip`, and related primitives.

## External Patterns To Copy Carefully

- **Notion:** copy the continuous block writing feel and lightweight contextual block controls; do not copy database complexity.
- **Obsidian:** copy the idea of link/tag/backlink metadata as future indexing; do not copy local vault or file-first storage.
- **Outline:** copy collection/project authorized document lists and shared editor framing; this is the closest product-stage analogue.
- **AFFiNE / BlockSuite:** copy the Store -> Model -> View -> Action boundary and block schema discipline; do not import the full architecture now.
- **AppFlowy:** copy transaction/adaptor thinking for future editor operations; avoid direct uncontrolled JSON mutation long term.
- **BlockNote / Tiptap / ProseMirror:** treat as future engine candidates after the adapter boundary exists, not as Task 19 or Task 20 prerequisites.
- **Logseq / SiYuan / Trilium:** copy long-term graph/reference/indexing ideas only after the basic document loop is stable.

## Task Sequence Overview

```text
Task 19: server-authorized document collections for Project Docs and Notebook
Task 20: editor-first continuous writing surface
Task 21: real inspector panels for metadata, versions, and attachments
Task 22: link/tag metadata seed for future search and backlinks
Task 23: editor engine adapter decision and prototype boundary
```

## Mandatory Human Review Gates

- **Gate A, after Task 19:** manually verify Project Docs and Notebook data loops before any editor UX refactor.
- **Gate B, mid-Task 20:** manually write in the continuous editor prototype for at least 10 minutes before completing the full editor redesign.
- **Gate C, after Task 20:** manually verify server-first editor behavior, including draft, formal save, conflict, archived read-only, attachments, and AI no-writeback.
- **Gate D, after Task 21:** manually inspect information density and usefulness of the inspector panes.
- **Gate E, before Task 22 persistence:** review a mini spec for link/tag/reference metadata shape before schema/index/storage changes.
- **Gate F, during Task 23:** manually decide whether to keep the custom editor, adopt Tiptap/ProseMirror, or adopt BlockNote. Agents may prepare evidence, but must not choose automatically.

If only three gates can be enforced, keep Gate A, Gate B, and Gate F.

---

## Task 19: Server-Authorized Document Collections

**Goal:** close the Project Docs and Notebook collection loop without changing the core document schema.

### Scope

- Add shared list response types, for example `ListDocumentsResponse`, only if existing DTOs are insufficient.
- Add repository methods:
  - `listProjectDocuments(projectId)`
  - `listNotebookDocuments(ownerUserId)`
- Add service methods that enforce actor permissions and existing document context rules:
  - project docs are visible only through authorized project/project-space access.
  - notebook docs are owner-only.
  - invalid document context remains hidden.
- Add minimal list routes:
  - `GET /documents/notebook`
  - `GET /projects/:projectId/documents` or `GET /documents/project?projectId=...`
- Fix `ProjectDetailPage` so it loads project docs from a real API endpoint and no longer shows the missing-route message.
- Create `apps/web/src/features/notebook/NotebookPage.tsx`.
- Convert `/notebook` from placeholder to real notebook collection surface.
- Generalize `DocumentList` into a shared `DocumentCollectionPanel` or equivalent reusable component.
- Reuse `DocumentEditorPage` for both Notebook and Project document open flows.

### Non-Goals

- No Prisma schema migration unless an implementation blocker is discovered.
- No nested notebook tree yet.
- No backlinks, tags, graph, or full search.
- No editor UX redesign beyond what is necessary to open existing documents.
- No automatic Notebook-to-Project promotion.

### Acceptance Criteria

- Project detail loads project documents from the API.
- The old “Project document listing is not available in the current API” state is gone for authorized projects.
- Project owner/editor can create and open project documents.
- Project viewer behavior matches existing permission policy and cannot create if not authorized.
- `/notebook` is a real page, not a placeholder route.
- A user can create a notebook document, see it in the notebook list, open it, autosave a draft, and perform a formal save.
- Notebook documents do not leak into project document lists.
- Project documents do not leak into the notebook list.
- Notebook and Project Docs share the same editor, draft, revision, and attachment mechanisms.

### Verification

Run focused checks first:

```bash
pnpm --filter @jixia/api test -- document.service
pnpm --filter @jixia/web test -- ProjectDetailPage
pnpm --filter @jixia/web test -- NotebookPage
```

Then run broader package checks:

```bash
pnpm --filter @jixia/api lint
pnpm --filter @jixia/web lint
pnpm --filter @jixia/web build
```

### Human Review Gate A

Stop after implementation and automated checks. The reviewer should manually verify:

- Project Docs create/list/open flow.
- Notebook create/list/open flow.
- Notebook/Project isolation.
- Permission boundaries for owner/editor/viewer where applicable.
- Draft autosave and formal revision save through the shared editor.

Do not start Task 20 until Gate A passes.

---

## Task 20: Editor-First Continuous Writing Surface

**Goal:** turn `JixiaEditor` from a block-card/textarea stack into a continuous editor-first writing surface while preserving the existing snapshot transport and server-owned lifecycle.

### Scope

- Preserve `EditorSnapshot` and `EditorBlock` as the external transport format.
- Replace heavy per-block card presentation with a continuous writing canvas.
- Add lightweight block controls that appear contextually instead of permanent form chrome.
- Support at minimum:
  - paragraph
  - heading
  - bullet list
  - ordered list
  - todo
  - quote
  - code block
  - callout
  - divider
  - table placeholder or simple table text block
  - image/file attachment blocks through existing attachment flow
- Improve keyboard behavior where feasible:
  - Enter creates a reasonable next block.
  - Empty block deletion behaves predictably.
  - Block type switching keeps content when safe.
  - Focus moves naturally after insert/delete.
- Keep `DocumentEditorPage` contracts intact:
  - `GET /documents/:documentId`
  - `PUT /documents/:documentId/draft`
  - `POST /documents/:documentId/revisions`
  - 409 conflict human merge.
  - archived documents are read-only.
  - AI cannot write into documents.

### Non-Goals

- No Tiptap, ProseMirror, BlockNote, Yjs, or Hocuspocus adoption in this task.
- No full rich text marks if they require changing persistence format.
- No automatic AI insert/rewrite/apply.
- No comments/provenance system yet unless it is purely visual placeholder work.

### Prototype Slice Before Gate B

Build a small prototype before completing the full task:

- paragraph
- heading
- bullet or todo
- quote or code
- divider
- basic insert and delete controls
- reasonable focus movement

### Acceptance Criteria

- The editor feels like one continuous document, not a form made of cards.
- Existing document snapshots load without migration.
- Edits still produce valid `EditorSnapshot` payloads.
- Draft autosave still works.
- Formal save still creates revisions.
- Conflict handling still opens the existing human merge flow.
- Archived documents remain read-only.
- Attachments still use private upload/download flow.
- Tests still prove AI no-writeback.

### Verification

```bash
pnpm --filter @jixia/web test -- DocumentEditorPage
pnpm --filter @jixia/web build
pnpm --filter @jixia/web e2e -- document-save
```

### Human Review Gate B

Stop after the prototype slice. The reviewer should manually write in the editor for at least 10 minutes and judge:

- Does typing feel like writing, not filling forms?
- Are Enter, delete, insert, block type switching, and focus movement acceptable?
- Are block controls discoverable without being noisy?
- Does the density match Jixia's compact research workbench direction?

If the editor still feels like a form, redesign the interaction before continuing Task 20.

### Human Review Gate C

Stop again after Task 20 is complete. The reviewer should manually verify:

- 10-20 mixed blocks can be written comfortably.
- Refresh restores drafts as expected.
- Formal save advances revision state.
- Conflict display still works.
- Archived documents are visibly and functionally read-only.
- Attachments still upload and open safely.
- AI remains suggestion-only/no-writeback.

Do not start Task 21 until Gate C passes.

---

## Task 21: Real Inspector Panels

**Goal:** make the right inspector useful for understanding document state without distracting from writing.

### Scope

- Implement real inspector modes using existing `Inspector` primitives:
  - metadata
  - versions
  - attachments
- Keep Copilot disabled or suggestion-only unless a separate approved AI document task exists.
- Metadata panel should show useful server-owned facts such as type, owner/project context, status, revision number, updated time, and permission context where available.
- Versions panel should show current revision state and enough revision/draft information to support user trust. Add API support only if existing read payloads are insufficient.
- Attachments panel should summarize document attachments and link to safe download/open actions where possible.
- Preserve the editor as the primary surface; inspector should not dominate the layout.

### Non-Goals

- No full audit log browser.
- No comments system.
- No AI-generated document modifications.
- No rich provenance graph.

### Acceptance Criteria

- Inspector tabs are no longer decorative disabled controls.
- Metadata panel helps identify document ownership, type, status, and revision state.
- Versions panel helps understand save/revision state without exposing raw JSON as the primary UX.
- Attachments panel helps locate files associated with the document.
- Inspector remains compact and does not crowd the writing surface.
- Existing editor tests still pass.

### Verification

```bash
pnpm --filter @jixia/web test -- DocumentEditorPage
pnpm --filter @jixia/web build
pnpm --filter @jixia/api test -- document.service
```

### Human Review Gate D

Stop after implementation. The reviewer should inspect information architecture:

- Is the default tab useful?
- Does the inspector reduce uncertainty about document state?
- Is information density appropriate?
- Did Copilot remain non-authoritative?
- Is anything becoming a garbage drawer?

---

## Task 22: Link / Tag Metadata Seed

**Goal:** seed the minimum metadata shape needed for future search, backlinks, and knowledge graph features without building the graph yet.

### Required Pre-Implementation Mini Spec

Before writing persistence code, produce a mini spec that answers:

- What is the source syntax for links and tags?
- Are links document-level, block-level, or both?
- Are tags stored as normalized records, derived metadata, or both?
- What is recomputed from `EditorSnapshot` versus stored durably?
- What indexes are needed now?
- How does this avoid leaking notebook-private metadata into project contexts?
- How does this preserve the existing snapshot transport?

### Candidate Scope After Approval

- Parse simple document references and tags from snapshot text content.
- Store derived metadata only if necessary for future list/search/backlink use.
- Keep metadata read-only from the editor until a later UX task defines editing flows.
- Expose minimal metadata in inspector or debug-safe UI only if useful.
- Add tests for notebook/project boundary and parser stability.

### Non-Goals

- No full backlink graph UI.
- No global search implementation.
- No Obsidian-style vault model.
- No Logseq-style page/block database rewrite.
- No automatic cross-project reference sharing.

### Acceptance Criteria

- A reviewed metadata shape exists before persistence changes.
- Any parser is deterministic and safe on malformed content.
- Notebook-private metadata remains private.
- Project metadata remains scoped to authorized project access.
- Existing document save/read behavior does not change for users.

### Verification

```bash
pnpm --filter @jixia/api test -- document.service
pnpm --filter @jixia/db db:validate
pnpm --filter @jixia/api lint
pnpm --filter @jixia/web lint
```

### Human Review Gate E

Stop before schema/index/storage implementation. The reviewer must approve the mini spec and explicitly decide whether Task 22 should:

- stay parser-only,
- add persisted derived metadata,
- add Prisma schema changes,
- or defer persistence entirely.

---

## Task 23: Editor Engine Adapter Decision

**Goal:** decide the long-term editor engine path based on the Task 20 editor-first experience and the Task 19-22 server contracts.

### Scope

- Create a comparison report or prototype branch-level evaluation for:
  - continuing custom `JixiaEditor`,
  - adopting Tiptap/ProseMirror,
  - adopting BlockNote,
  - adopting a narrower internal adapter around current `EditorSnapshot`.
- Evaluate each option against:
  - existing `EditorSnapshot` compatibility,
  - attachment block support,
  - custom block support,
  - server-first draft/revision/conflict behavior,
  - archived read-only state,
  - future comments/provenance,
  - future suggestion-only AI workflows,
  - migration risk,
  - bundle and maintenance cost,
  - testability.
- Define an adapter boundary regardless of engine choice.

### Non-Goals

- Do not rewrite the editor engine in Task 23 unless a separate implementation task is approved.
- Do not introduce CRDT/collaboration as a side effect.
- Do not silently change persisted document JSON shape.

### Acceptance Criteria

- There is a clear recommendation with tradeoffs and migration path.
- The recommendation explains how existing documents remain readable.
- The recommendation explains how server-first revision/conflict behavior survives.
- The recommendation identifies what would be implemented in the next task.

### Verification

If only a report is produced, no build is required beyond checking any touched docs. If a prototype is produced, run:

```bash
pnpm --filter @jixia/web test -- DocumentEditorPage
pnpm --filter @jixia/web build
```

### Human Review Gate F

Stop for a manual architecture decision. The reviewer decides:

- keep custom editor for another cycle,
- adopt Tiptap/ProseMirror,
- adopt BlockNote,
- or build a stricter internal adapter first.

Agents must not automatically make this decision because it creates a long-term architecture commitment.

---

## Suggested Trellis Task Creation Order

Use one Trellis task per implementation unit:

1. `Task 19 - Server-authorized document collections`
2. `Task 20a - Continuous editor prototype`
3. `Task 20b - Complete editor-first surface`
4. `Task 21 - Inspector metadata versions attachments`
5. `Task 22a - Link tag metadata mini spec`
6. `Task 22b - Approved metadata seed implementation`
7. `Task 23 - Editor engine adapter decision`

This split keeps manual review gates enforceable and avoids burying product/architecture decisions inside large implementation tasks.

## Stop Conditions For Agents

Agents must stop and ask for human review when any of these occur:

- A schema migration is required before Task 22 mini spec approval.
- A new editor dependency is proposed before Task 23.
- Any implementation wants AI to write directly into document snapshots.
- Notebook and Project Docs require separate editor components.
- Permission behavior becomes ambiguous or client-enforced.
- Existing draft/revision/conflict/read-only guarantees are hard to preserve.
- Manual editor feel review has not happened after the Task 20 prototype.

## Final Definition Of Done For This Sequence

The Task 19-23 sequence is complete when:

- Project Docs and Notebook both have server-authorized collection surfaces.
- Both surfaces create, list, open, draft-save, and formal-save documents through shared document contracts.
- The editor feels like a continuous writing surface and no longer like a block form.
- Metadata, versions, and attachments are visible through useful inspector panels.
- Link/tag metadata direction is explicitly approved or deferred.
- The editor engine path is explicitly decided with a migration plan.
- AI remains non-authoritative for document persistence.
