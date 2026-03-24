# Jixia Research Workbench Reset Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver the honest current-wave milestone — **Unified Intake & Deep Reading Workbench** — by first freezing state ownership and projection rules, then implementing the discovery/import boundary, unified inventory, single-paper Reader, private Notes Workspace, and project-owned document workspace on top of those frozen semantics.

**Architecture:** This reset is only safe if it is executed ownership-first. The first wave must not start with UI polish or broad HTTP acceptance. Instead, it must first freeze and enforce four truths: raw discovery candidates are not inventory, notebook state is always private, notebook → project is one-way projection, and shared writing begins only in project-owned documents. Only after these boundaries are encoded in policy, contracts, and server slices should the shell and work surfaces be rebuilt.

**Tech Stack:** React, React Router, TypeScript, Vite, Vitest, current `src/web` pages/components/styles, current `src/shared/contracts/*`, `src/server/http-api.ts`, server services/connectors/jobs, and the current `demo-native-showcase` runtime verification flow.

---

## Execution rule

**Tasks 1–4 are prerequisite tasks.** They exist to freeze ownership and boundary semantics before any downstream UI task is allowed to invent behavior.

- UI tasks may not change ownership semantics.
- Reader / Notes Workspace / Project Docs may only consume imported inventory or project-owned projections.
- No task may make a project route depend on live access to private notebook state.

---

### Task 1: Freeze ownership, projection, and allowed-crossing policy

**Files:**
- Create: `src/server/services/workbench-ownership.service.ts`
- Modify: `src/shared/contracts/discovery.ts`
- Modify: `src/shared/contracts/library.ts`
- Create: `src/shared/contracts/notebook.ts`
- Modify: `src/shared/contracts/evidence.ts`
- Modify: `src/shared/contracts/writing.ts`
- Test: `tests/integration/workbench-ownership-boundaries.test.ts`

**Step 1: Write the failing test**

```ts
it('freezes ownership boundaries before any UI work starts', () => {
  const policy = createWorkbenchOwnershipPolicy();

  expect(policy.canEnterDeepReading({ objectType: 'external-candidate' })).toBe(false);
  expect(policy.canProjectReadNotebook({ notebookVisibility: 'private' })).toBe(false);

  const projection = policy.createProjectProjection({
    sourceType: 'notebook-note',
    projectId: 'project-1',
    paperAssetId: 'asset-1',
    selectedText: 'Important excerpt',
  });

  expect(projection).toEqual(
    expect.objectContaining({
      ownerType: 'project',
      projectId: 'project-1',
      paperAssetId: 'asset-1',
    }),
  );
  expect(projection).not.toHaveProperty('notebookBody');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/integration/workbench-ownership-boundaries.test.ts`
Expected: FAIL because there is no single policy module that freezes imported-inventory-only deep reading, notebook privacy, or project-owned projection.

**Step 3: Write minimal implementation**

Implement a boundary policy module that encodes:

- raw `ExternalCandidate` / `RecommendationItem` objects cannot enter Reader / Notes Workspace / Project Docs
- notebook records and notebook notes are owner-private only
- quote / insert creates a **project-owned projection artifact**, not a live link to notebook body
- evidence cards have explicit scope (`private` or `project`)
- shared writing ownership begins in `ProjectDocument*` objects only

Keep the implementation server-first and dependency-light.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/integration/workbench-ownership-boundaries.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/integration/workbench-ownership-boundaries.test.ts src/server/services/workbench-ownership.service.ts src/shared/contracts/discovery.ts src/shared/contracts/library.ts src/shared/contracts/notebook.ts src/shared/contracts/evidence.ts src/shared/contracts/writing.ts
git commit -m "feat: freeze workbench ownership boundaries"
```

### Task 2: Reset shared transport contracts around the frozen ownership model

**Files:**
- Modify: `src/shared/contracts/discovery.ts`
- Modify: `src/shared/contracts/library.ts`
- Modify: `src/shared/contracts/reading.ts`
- Modify: `src/shared/contracts/notebook.ts`
- Modify: `src/shared/contracts/evidence.ts`
- Modify: `src/shared/contracts/writing.ts`
- Modify: `src/shared/index.ts`
- Test: `tests/integration/research-workbench-contracts.test.ts`

**Step 1: Write the failing test**

```ts
it('exposes transport-safe contracts that encode ownership and projection truthfully', () => {
  const candidate = makeDiscoveryCandidateFixture();
  expect(candidate.state).toBe('new');

  const notebook = makeNotebookFixture();
  expect(notebook.visibility).toBe('private');

  const projectReference = makeProjectReferenceFixture();
  expect(projectReference.ownerType).toBe('project');
  expect(projectReference.sourceKind).toBe('projection');
  expect(projectReference).not.toHaveProperty('notebookBody');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/integration/research-workbench-contracts.test.ts`
Expected: FAIL because the current contracts still do not fully encode candidate state, notebook privacy, or project-owned reference/projection semantics.

**Step 3: Write minimal implementation**

Add truthful interfaces for:

- `ExternalCandidate`, `RecommendationItem`, `RecommendationFeed`, `InterestProfile`, `CandidateState`, `ImportMapping`
- `UnifiedLibraryItem`, `LibraryFacet`, `SavedLibraryView`
- `ReadingAnnotationRecord`, `ReadingRetrievalState`
- `NotebookRecord`, `NotebookNoteRecord`, `NotebookQuestionRecord`
- `EvidenceCardRecord`
- `ProjectDocumentTreeNode`, `ProjectDocumentSummary`, `ProjectDocumentReference`, `ProjectPresenceRecord`

Ensure contracts distinguish:

- discovery candidates vs imported inventory
- private notebook state vs project-owned shared writing state
- project-owned projections vs private notebook data

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/integration/research-workbench-contracts.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/integration/research-workbench-contracts.test.ts src/shared/contracts/discovery.ts src/shared/contracts/library.ts src/shared/contracts/reading.ts src/shared/contracts/notebook.ts src/shared/contracts/evidence.ts src/shared/contracts/writing.ts src/shared/index.ts
git commit -m "feat: reset workbench transport contracts"
```

### Task 3: Build the discovery/import server boundary and import mapping

**Files:**
- Modify: `src/server/connectors/pubmed.connector.ts`
- Create: `src/server/connectors/openalex.connector.ts`
- Create: `src/server/connectors/biorxiv.connector.ts`
- Modify: `src/server/connectors/arxiv.connector.ts`
- Create: `src/server/services/discovery.service.ts`
- Create: `src/server/services/recommendation.service.ts`
- Modify: `src/server/services/import.service.ts`
- Modify: `src/server/jobs/job-governance.ts`
- Modify: `src/server/jobs/job-runner.ts`
- Modify: `src/server/http-api.ts`
- Test: `tests/integration/discovery-import-boundary.test.ts`

**Step 1: Write the failing test**

```ts
it('keeps discovery candidates outside inventory until explicit import mapping', async () => {
  const search = await request(server).get('/api/discovery/search?q=oncology&page=1');
  const candidate = search.body.boards[0].items[0];

  expect(candidate.state).toBe('new');

  const imported = await request(server)
    .post('/api/discovery/import')
    .send({ candidateId: candidate.id });

  expect(imported.body.importMapping).toEqual(
    expect.objectContaining({
      candidateId: candidate.id,
      paperAssetId: expect.any(String),
      libraryEntryId: expect.any(String),
    }),
  );

  const library = await request(server).get('/api/library');
  expect(library.body.items.some((item: { canonicalId: string }) => item.canonicalId === candidate.canonicalId)).toBe(true);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/integration/discovery-import-boundary.test.ts`
Expected: FAIL because discovery candidates, import mapping, and governed recommendation boundary are not yet separated into a truthful server slice.

**Step 3: Write minimal implementation**

Implement:

- multi-source search returning `ExternalCandidate` records with explicit state
- `POST /api/discovery/import` producing `ImportMapping`
- push-lane scaffolding via `recommendation.service.ts` and governed jobs, but only as a boundary freeze in this wave
- server-side normalization that keeps discovery candidates outside inventory until import

Do not implement behavior-learning, adaptive reranking, or project-level shared recommendation feeds in this task.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/integration/discovery-import-boundary.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/integration/discovery-import-boundary.test.ts src/server/connectors/pubmed.connector.ts src/server/connectors/openalex.connector.ts src/server/connectors/biorxiv.connector.ts src/server/connectors/arxiv.connector.ts src/server/services/discovery.service.ts src/server/services/recommendation.service.ts src/server/services/import.service.ts src/server/jobs/job-governance.ts src/server/jobs/job-runner.ts src/server/http-api.ts
git commit -m "feat: add discovery import boundary"
```

### Task 4: Build the notebook/private-evidence/project-doc projection server boundary

**Files:**
- Create: `src/server/services/notebook.service.ts`
- Create: `src/server/services/project-projection.service.ts`
- Modify: `src/server/services/writing.service.ts`
- Modify: `src/server/http-api.ts`
- Test: `tests/integration/notebook-project-projection.test.ts`

**Step 1: Write the failing test**

```ts
it('creates project-owned references from private notebook material without exposing notebook state', async () => {
  const projection = await request(server)
    .post('/api/projects/project-1/docs/doc-1/references')
    .send({
      sourceType: 'notebook-note',
      notebookId: 'notebook-1',
      noteId: 'note-1',
      selectedText: 'Important excerpt',
      paperAssetId: 'asset-1',
    });

  expect(projection.body.reference).toEqual(
    expect.objectContaining({
      ownerType: 'project',
      projectId: 'project-1',
      paperAssetId: 'asset-1',
    }),
  );
  expect(projection.body.reference).not.toHaveProperty('notebookBody');

  const invalid = await request(server)
    .post('/api/projects/project-1/docs/doc-1/references')
    .send({ sourceType: 'external-candidate', candidateId: 'candidate-1' });

  expect(invalid.status).toBe(400);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/integration/notebook-project-projection.test.ts`
Expected: FAIL because private notebook ownership, project-owned reference projection, and imported-inventory-only insertion rules are not yet enforced server-side.

**Step 3: Write minimal implementation**

Implement:

- notebook service records organized around research questions and private ownership
- project-owned reference/projection records for quote / insert helper
- explicit rejection of raw external candidates as project-doc sources
- project docs consuming imported inventory and derived evidence/projections only

This task must make the shared-writing boundary truthful before any Notes Workspace or Project Docs UI exists.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/integration/notebook-project-projection.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/integration/notebook-project-projection.test.ts src/server/services/notebook.service.ts src/server/services/project-projection.service.ts src/server/services/writing.service.ts src/server/http-api.ts
git commit -m "feat: add notebook projection boundary"
```

### Task 5: Rebuild the shell into a full-screen three-pane workbench

**Files:**
- Modify: `src/web/components/workbench-layout.tsx`
- Modify: `src/web/components/sidebar-nav.tsx`
- Modify: `src/web/components/context-indicator.tsx`
- Modify: `src/web/components/recent-opened-panel.tsx`
- Create: `src/web/components/workbench-context-rail.tsx`
- Create: `src/web/components/workbench-object-rail.tsx`
- Modify: `src/web/router.tsx`
- Modify: `src/web/styles/app.css`
- Test: `tests/ui/workbench-shell-layout.test.tsx`

**Step 1: Write the failing test**

```tsx
test('renders a full-screen three-pane shell with sidebar, main surface, and context rail', () => {
  renderWorkbench('/search');

  expect(screen.getByLabelText('Workbench sidebar')).toBeInTheDocument();
  expect(screen.getByLabelText('Workbench main surface')).toBeInTheDocument();
  expect(screen.getByLabelText('Workbench context rail')).toBeInTheDocument();
  expect(screen.getByText('Recent notebooks')).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/workbench-shell-layout.test.tsx`
Expected: FAIL because current shell is still minimal and desktop layout remains too page-like.

**Step 3: Write minimal implementation**

Implement:

- persistent left rail for nav + recent objects + notebook/project entry points
- main work surface container with route-based layout modes
- context rail for AI / evidence / metadata / presence / activity
- CSS removing the centered narrow desktop shell from workbench routes

Do not introduce new ownership semantics in this task.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/workbench-shell-layout.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/ui/workbench-shell-layout.test.tsx src/web/components/workbench-layout.tsx src/web/components/sidebar-nav.tsx src/web/components/context-indicator.tsx src/web/components/recent-opened-panel.tsx src/web/components/workbench-context-rail.tsx src/web/components/workbench-object-rail.tsx src/web/router.tsx src/web/styles/app.css
git commit -m "feat: add full-screen workbench shell"
```

### Task 6: Build the Discovery & Intake pull-lane UI on top of the frozen server boundary

**Files:**
- Modify: `src/web/lib/demo-api.ts`
- Modify: `src/web/pages/search-page.tsx`
- Modify: `src/web/pages/today-page.tsx`
- Create: `src/web/components/intake-hub-board.tsx`
- Create: `src/web/components/intake-source-board.tsx`
- Create: `src/web/components/direct-ingest-actions.tsx`
- Test: `tests/ui/intake-hub.test.tsx`

**Step 1: Write the failing test**

```tsx
test('search renders one unified query box with per-source result boards and explicit candidate state', async () => {
  renderWorkbench('/search');

  await user.type(screen.getByLabelText('Unified intake query'), 'tumor biomarkers');
  await user.click(screen.getByRole('button', { name: 'Search sources' }));

  expect(await screen.findByRole('region', { name: 'OpenAlex results' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'PubMed results' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Import DOI' })).toBeInTheDocument();
  expect(screen.getByText('Not in library yet')).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/intake-hub.test.tsx`
Expected: FAIL because current Search still renders a thin flat list and does not expose candidate/import boundary clearly.

**Step 3: Write minimal implementation**

Implement:

- one unified search box
- source boards for OpenAlex / PubMed / bioRxiv / arXiv
- rich result cards with authors, venue, date, snippet, and candidate state
- direct-ingest actions for DOI / URL / local PDF
- Today as the Push-lane surface of the same discovery domain, without claiming full recommendation completion

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/intake-hub.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/ui/intake-hub.test.tsx src/web/lib/demo-api.ts src/web/pages/search-page.tsx src/web/pages/today-page.tsx src/web/components/intake-hub-board.tsx src/web/components/intake-source-board.tsx src/web/components/direct-ingest-actions.tsx
git commit -m "feat: build intake hub UI"
```

### Task 7: Rebuild Library into one unified inventory with multiple views

**Files:**
- Modify: `src/server/services/library.service.ts`
- Modify: `src/server/http-api.ts`
- Modify: `src/web/lib/demo-api.ts`
- Modify: `src/web/pages/library-page.tsx`
- Create: `src/web/components/library-view-switcher.tsx`
- Create: `src/web/components/library-facet-panel.tsx`
- Create: `src/web/components/library-grouped-list.tsx`
- Create: `src/web/components/library-saved-views.tsx`
- Test: `tests/ui/library-inventory.test.tsx`
- Test: `tests/integration/library-inventory-http.test.ts`

**Step 1: Write the failing test**

```tsx
test('library behaves as one inventory with multiple views and states', async () => {
  renderWorkbench('/library');

  expect(await screen.findByText('Saved views')).toBeInTheDocument();
  expect(screen.getByText('Tags')).toBeInTheDocument();
  expect(screen.getByText('Categories')).toBeInTheDocument();
  expect(screen.getByText('Retrieval status')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Project view' })).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/library-inventory.test.tsx tests/integration/library-inventory-http.test.ts`
Expected: FAIL because current Library still behaves like a flat import shelf.

**Step 3: Write minimal implementation**

Implement:

- one unified inventory response with tags, categories, retrieval state, read state, and evidence state
- library views for personal / project / saved views
- grouped list support and filter/facet controls
- UI copy that stops presenting frontstage Library as two separate worlds

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/library-inventory.test.tsx tests/integration/library-inventory-http.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/ui/library-inventory.test.tsx tests/integration/library-inventory-http.test.ts src/server/services/library.service.ts src/server/http-api.ts src/web/lib/demo-api.ts src/web/pages/library-page.tsx src/web/components/library-view-switcher.tsx src/web/components/library-facet-panel.tsx src/web/components/library-grouped-list.tsx src/web/components/library-saved-views.tsx
git commit -m "feat: rebuild library as unified inventory"
```

### Task 8: Rebuild Reader into a single-paper deep-reading surface with annotations and evidence cards

**Files:**
- Modify: `src/server/services/reading.service.ts`
- Modify: `src/server/http-api.ts`
- Modify: `src/web/lib/demo-api.ts`
- Modify: `src/web/pages/reader-page.tsx`
- Modify: `src/web/components/paper-workspace-tabs.tsx`
- Create: `src/web/components/reader-mode-switcher.tsx`
- Create: `src/web/components/annotation-drawer.tsx`
- Create: `src/web/components/evidence-card-list.tsx`
- Create: `src/web/components/paper-retrieval-state.tsx`
- Test: `tests/ui/reader-deep-reading.test.tsx`
- Test: `tests/ui/reader-annotation-evidence.test.tsx`

**Step 1: Write the failing test**

```tsx
test('reader focuses on one paper with retrieval states, annotations, and evidence cards', async () => {
  renderWorkbench('/projects/project-1/library/entry-1/reader');

  expect(await screen.findByText('Retrieval state')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reading focus' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Paper + AI' })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Create annotation' }));
  await user.click(screen.getByRole('button', { name: 'Create evidence card' }));

  expect(await screen.findByText('Evidence cards')).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/reader-deep-reading.test.tsx tests/ui/reader-annotation-evidence.test.tsx`
Expected: FAIL because current Reader still uses stacked textareas and weak paper-state presentation.

**Step 3: Write minimal implementation**

Implement:

- single-paper reader modes for deep reading
- retrieval-state UI (`metadata only`, `pdf available`, `text extracted`, `retrieval failed`)
- inline annotation flows via drawer/index instead of a large standalone comment form
- evidence-card creation and listing

Do not allow Reader to consume raw discovery candidates.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/reader-deep-reading.test.tsx tests/ui/reader-annotation-evidence.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/ui/reader-deep-reading.test.tsx tests/ui/reader-annotation-evidence.test.tsx src/server/services/reading.service.ts src/server/http-api.ts src/web/lib/demo-api.ts src/web/pages/reader-page.tsx src/web/components/paper-workspace-tabs.tsx src/web/components/reader-mode-switcher.tsx src/web/components/annotation-drawer.tsx src/web/components/evidence-card-list.tsx src/web/components/paper-retrieval-state.tsx
git commit -m "feat: rebuild reader as deep-reading surface"
```

### Task 9: Build the private Notes Workspace as the cross-paper thinking center

**Files:**
- Modify: `src/server/services/notebook.service.ts`
- Modify: `src/server/http-api.ts`
- Modify: `src/web/lib/demo-api.ts`
- Create: `src/web/pages/notes-page.tsx`
- Create: `src/web/components/notebook-list.tsx`
- Create: `src/web/components/notebook-question-header.tsx`
- Create: `src/web/components/note-canvas.tsx`
- Modify: `src/web/components/evidence-card-list.tsx`
- Test: `tests/ui/notes-workspace.test.tsx`
- Test: `tests/integration/notebook-http.test.ts`

**Step 1: Write the failing test**

```tsx
test('notes workspace organizes private notebooks around research questions', async () => {
  renderWorkbench('/notes/notebook-1');

  expect(await screen.findByText('Research question')).toBeInTheDocument();
  expect(screen.getByText('Private notebook')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add note' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Create evidence card' })).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/notes-workspace.test.tsx tests/integration/notebook-http.test.ts`
Expected: FAIL because there is no independent Notes Workspace route or notebook-oriented UI.

**Step 3: Write minimal implementation**

Implement:

- notebook routes and notebook records organized by research question
- private-only notebook semantics in browser and server contracts
- cross-paper note canvas and evidence-card listing inside Notes Workspace
- no project sharing or project mirroring of notebook data
- no direct loading of raw external candidates into notebook thinking surfaces

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/notes-workspace.test.tsx tests/integration/notebook-http.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/ui/notes-workspace.test.tsx tests/integration/notebook-http.test.ts src/server/services/notebook.service.ts src/server/http-api.ts src/web/lib/demo-api.ts src/web/pages/notes-page.tsx src/web/components/notebook-list.tsx src/web/components/notebook-question-header.tsx src/web/components/note-canvas.tsx src/web/components/evidence-card-list.tsx
git commit -m "feat: add private notes workspace"
```

### Task 10: Rebuild Project Docs into a shared document tree workspace with quote/insert helper and presence

**Files:**
- Modify: `src/server/services/writing.service.ts`
- Modify: `src/server/services/project-projection.service.ts`
- Modify: `src/server/http-api.ts`
- Modify: `src/web/lib/demo-api.ts`
- Modify: `src/web/pages/project-page.tsx`
- Modify: `src/web/pages/writing-page.tsx`
- Modify: `src/web/components/project-writer-list.tsx`
- Create: `src/web/components/project-document-tree.tsx`
- Create: `src/web/components/project-doc-editor-shell.tsx`
- Create: `src/web/components/project-reference-rail.tsx`
- Create: `src/web/components/project-presence-strip.tsx`
- Test: `tests/ui/project-docs-workspace.test.tsx`
- Test: `tests/integration/project-docs-http.test.ts`

**Step 1: Write the failing test**

```tsx
test('project docs provide document tree, current document, quote-insert helper, and presence without realtime co-editing', async () => {
  renderWorkbench('/projects/project-1');

  expect(await screen.findByRole('tree', { name: 'Project documents' })).toBeInTheDocument();
  expect(screen.getByText('Current document')).toBeInTheDocument();
  expect(screen.getByText('Reference rail')).toBeInTheDocument();
  expect(screen.getByText('Present now')).toBeInTheDocument();
  expect(screen.queryByText('Live cursors')).not.toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/ui/project-docs-workspace.test.tsx tests/integration/project-docs-http.test.ts`
Expected: FAIL because current Writer still behaves like a single-document form rather than a project-owned shared document workspace.

**Step 3: Write minimal implementation**

Implement:

- project-scoped document tree / current-document routes
- project document summaries and presence metadata
- reference rail surfacing project-scoped evidence and project-owned quote/insert projections
- explicit v1 rule: no realtime co-editing, no shared private notebook state
- quote / insert helper only referencing imported inventory and derived project-owned evidence/projections

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/ui/project-docs-workspace.test.tsx tests/integration/project-docs-http.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/ui/project-docs-workspace.test.tsx tests/integration/project-docs-http.test.ts src/server/services/writing.service.ts src/server/services/project-projection.service.ts src/server/http-api.ts src/web/lib/demo-api.ts src/web/pages/project-page.tsx src/web/pages/writing-page.tsx src/web/components/project-writer-list.tsx src/web/components/project-document-tree.tsx src/web/components/project-doc-editor-shell.tsx src/web/components/project-reference-rail.tsx src/web/components/project-presence-strip.tsx
git commit -m "feat: rebuild writer as project docs workspace"
```

### Task 11: Align docs, runbook, and full verification around the honest milestone

**Files:**
- Modify: `README.md`
- Modify: `README_CN.md`
- Modify: `docs/runbooks/native-demo-showcase.md`
- Create: `tests/smoke/research-workbench-reset-runbook.test.ts`

**Step 1: Write the failing test**

```ts
it('documents the updated workbench reset flow with ownership-first boundaries', () => {
  const runbook = readFileSync('docs/runbooks/native-demo-showcase.md', 'utf8');
  expect(runbook).toContain('Unified Intake & Deep Reading Workbench');
  expect(runbook).toContain('imported inventory only');
  expect(runbook).toContain('Notebook stays private');
  expect(runbook).toContain('quote / insert helper');
  expect(runbook).toContain('Project Docs');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/smoke/research-workbench-reset-runbook.test.ts`
Expected: FAIL because the public docs and runbook still need to align to the ownership-first milestone framing.

**Step 3: Write minimal implementation**

Update docs so they describe:

- the three-pane workbench shell
- Discovery & Intake with explicit Pull / Push lanes
- imported inventory only as the legal source for Reader / Notes / Project Docs
- Notebook as fully private and Project Docs as project-owned shared writing
- quote / insert helper as one-way projection
- the truthful milestone name: `Unified Intake & Deep Reading Workbench`

Then run the full verification set and one manual current-host walkthrough covering:

- intake search / import
- inventory reopen
- reader annotation/evidence
- private notebook work
- project-doc quote/insert projection

**Step 4: Run verification**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected: all pass.

**Step 5: Commit**

```bash
git add tests/smoke/research-workbench-reset-runbook.test.ts README.md README_CN.md docs/runbooks/native-demo-showcase.md
git commit -m "docs: align runbook with ownership-first milestone"
```

## Explicitly Deferred From This Wave

The following belong to the next Discovery / Recommendation wave and must not be claimed as complete in this reset:

1. automatic recommendation refresh / ranking loops beyond the frozen service boundary
2. behavior-learning or adaptive reranking
3. project-level shared recommendation feeds
4. complex recommendation explanation / feedback loops
5. realtime co-editing inside Project Docs

## Definition of Done

The reset is complete only when all of the following are true:

1. Ownership and allowed-crossing rules are frozen before UI work starts.
2. Raw discovery candidates cannot enter Reader, Notes Workspace, or Project Docs directly.
3. Notebook state remains owner-private and is never mirrored into project scope.
4. Notebook → project uses project-owned projection only.
5. Discovery & Intake is modeled as a bounded context with explicit Pull lane and Push lane semantics.
6. Search exposes a unified intake hub with one query entry, per-source boards, direct-ingest actions, and explicit candidate states.
7. External candidates only enter deep-reading and writing flows after explicit import mapping into unified inventory.
8. Library behaves as one unified research inventory with multiple views.
9. Reader is a single-paper deep-reading surface with retrieval states, annotations, and evidence cards.
10. Notes Workspace exists as a private, question-centered, cross-paper thinking surface.
11. Project Docs provide document tree + current document + reference rail instead of a single document form.
12. Shared writing ownership is truthful: project docs and their references are project-owned artifacts.
13. Collaboration provides presence without pretending to support realtime co-editing.
14. The shell uses a real three-pane, full-screen workbench layout instead of a centered narrow page shell.
15. `npm test`, `npm run typecheck`, and `npm run build` all pass.
16. One manual current-host beta walkthrough completes the truthful chain from intake to project writing.
17. The milestone is presented honestly as `Unified Intake & Deep Reading Workbench`, not as completed automatic recommendation.
