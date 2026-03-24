# Jixia Research Workbench Reset Risk-First Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver the research workbench reset as a truthful, server-first cutover by freezing ownership semantics first, stabilizing contracts and persisted state second, then rebuilding the workbench surfaces on top of those stable boundaries.

**Architecture:** This plan treats the reset as a controlled rewrite of the `demo-native-showcase` worktree, not as a cosmetic UI refresh and not as a requirement to preserve every legacy demo route. The implementation must first make canonical identities, visibility rules, projection boundaries, and project-document ownership explicit in `src/shared`, `src/server`, and `src/server/app.ts`; only then may `src/web` rebuild the shell, intake, library, reader, notes, and project docs surfaces.

**Tech Stack:** React, React Router, TypeScript, Vite, Vitest, Node HTTP server, current `src/server/http-api.ts`, `src/server/app.ts`, `src/shared/contracts/*`, `src/web/pages/*`, `src/web/components/*`, and the demo-native-showcase runbook at `docs/runbooks/native-demo-showcase.md`.

> **Execution status (2026-03-24):** Tasks 1–9 from this plan are implemented in `demo-native-showcase`, including browser-side notebook-to-project projection, the Project Docs reference rail, and the final truthfulness pass across docs and workflow tests. The remaining work is full verification, Oracle sanity review, and any follow-up fixes those checks uncover.

---

## Reset assumptions frozen by this plan

1. This wave may **reset old demo state** rather than migrate every persisted demo artifact forward.
2. Canonical routes live under `/home`, `/today`, `/search`, `/library`, `/projects`, and `/projects/:projectId/...`.
3. Legacy `/spaces/...` routes are **not** a hard compatibility contract for the final state. They may be redirected temporarily during cutover and removed before final verification.
4. `ExternalCandidate` / recommendation objects are never inventory.
5. Notebook state is always private.
6. Notebook → project crossing happens only through explicit projection/reference artifacts.
7. Shared writing starts in project-owned documents, not in notebook state.
8. Integration tests must follow the existing repo harness: `createHttpServer(...)` + ephemeral port + `fetch(...)`. Do **not** introduce `supertest` / `request(server)` in implementation.

---

## Execution guardrails

- **Tasks 1–5 are prerequisite tasks.** Do not rebuild workbench UI before contracts, persisted state, and server ownership boundaries are stable.
- Every task that adds persisted concepts must list `src/server/app.ts` explicitly.
- Every task that changes HTTP payload shape must update `src/shared/contracts/*` and `src/server/http-api.ts` in the same task.
- Any remaining `/spaces/...` compatibility should be treated as a short-lived cutover aid, not as a second source of truth.
- Final verification must include `npm test`, `npm run typecheck`, `npm run build`, and a manual walkthrough that follows the **new** workbench flow, not the old page-by-page demo flow.

---

### Task 1: Freeze canonical ownership, projection, and cutover policy in code

**Files:**
- Create: `src/server/services/workbench-ownership.service.ts`
- Modify: `src/shared/contracts/discovery.ts`
- Modify: `src/shared/contracts/library.ts`
- Create: `src/shared/contracts/notebook.ts`
- Modify: `src/shared/contracts/evidence.ts`
- Modify: `src/shared/contracts/writing.ts`
- Modify: `src/server/app.ts`
- Test: `tests/integration/workbench-ownership-boundaries.test.ts`

**Step 1: Write the failing test**

```ts
it('freezes imported-inventory-only reading and project-owned projection', () => {
  const policy = createWorkbenchOwnershipPolicy();

  expect(policy.canEnterReader({ objectType: 'external-candidate' })).toBe(false);
  expect(policy.canEnterReader({ objectType: 'library-entry' })).toBe(true);

  const projection = policy.createProjectReference({
    sourceType: 'notebook-note',
    projectId: 'project-1',
    paperAssetId: 'asset-1',
    selectedText: 'Important excerpt',
  });

  expect(projection.ownerType).toBe('project');
  expect(projection.sourceKind).toBe('projection');
  expect(projection).not.toHaveProperty('notebookBody');
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/integration/workbench-ownership-boundaries.test.ts`
Expected: FAIL because there is no single policy module that truthfully freezes reader entry, notebook privacy, or project-owned projection.

**Step 3: Write minimal implementation**

Implement `createWorkbenchOwnershipPolicy()` and the minimum supporting contract fields so that the codebase has one canonical answer for:

- what can enter Reader / Notes / Project Docs
- what stays private notebook state
- what becomes a project-owned projection/reference
- which objects belong in persisted app state

Keep this task server-first and dependency-light. Do not rebuild UI here.

**Step 4: Run test to verify it passes**

Run: `npm test -- tests/integration/workbench-ownership-boundaries.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/integration/workbench-ownership-boundaries.test.ts src/server/services/workbench-ownership.service.ts src/shared/contracts/discovery.ts src/shared/contracts/library.ts src/shared/contracts/notebook.ts src/shared/contracts/evidence.ts src/shared/contracts/writing.ts src/server/app.ts
git commit -m "feat: freeze workbench ownership boundaries"
```

---

### Task 2: Stabilize shared contracts, persisted app state, and HTTP payload seams

**Files:**
- Modify: `src/shared/contracts/discovery.ts`
- Modify: `src/shared/contracts/library.ts`
- Modify: `src/shared/contracts/reading.ts`
- Modify: `src/shared/contracts/notebook.ts`
- Modify: `src/shared/contracts/evidence.ts`
- Modify: `src/shared/contracts/writing.ts`
- Modify: `src/shared/index.ts`
- Modify: `src/server/app.ts`
- Modify: `src/server/http-api.ts`
- Test: `tests/integration/research-workbench-contracts.test.ts`
- Test: `tests/integration/workbench-http-contracts.test.ts`

**Step 1: Write the failing tests**

```ts
it('exports truthful transport-safe workbench contracts', () => {
  const notebook = makeNotebookFixture();
  const reference = makeProjectReferenceFixture();

  expect(notebook.visibility).toBe('private');
  expect(reference.ownerType).toBe('project');
  expect(reference.sourceKind).toBe('projection');
});

it('serves the new contract shape through the current HTTP server', async () => {
  const { baseUrl } = await startWorkbenchTestServer();
  const response = await fetch(`${baseUrl}/api/discovery/today`);
  const payload = await response.json();

  expect(payload.boards[0].items[0]).toEqual(
    expect.objectContaining({
      state: expect.any(String),
      imported: expect.any(Boolean),
    }),
  );
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/integration/research-workbench-contracts.test.ts tests/integration/workbench-http-contracts.test.ts`
Expected: FAIL because current shared contracts and HTTP payloads still mix old reading/writing semantics.

**Step 3: Write minimal implementation**

Make the contracts and `JixiaAppState` honest about the new model:

- candidate state vs imported inventory
- notebook records and questions
- explicit evidence scope
- project document summaries / references / presence
- route payloads shaped for canonical `/projects/...` workbench flows

Do not add UI-specific convenience fields that bypass ownership truth.

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/integration/research-workbench-contracts.test.ts tests/integration/workbench-http-contracts.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/integration/research-workbench-contracts.test.ts tests/integration/workbench-http-contracts.test.ts src/shared/contracts/discovery.ts src/shared/contracts/library.ts src/shared/contracts/reading.ts src/shared/contracts/notebook.ts src/shared/contracts/evidence.ts src/shared/contracts/writing.ts src/shared/index.ts src/server/app.ts src/server/http-api.ts
git commit -m "feat: stabilize reset contracts and app state"
```

---

### Task 3: Land the discovery and intake server boundary before any UI cutover

**Files:**
- Modify: `src/server/connectors/pubmed.connector.ts`
- Modify: `src/server/connectors/arxiv.connector.ts`
- Create: `src/server/connectors/openalex.connector.ts`
- Create: `src/server/connectors/biorxiv.connector.ts`
- Create: `src/server/services/discovery.service.ts`
- Create: `src/server/services/recommendation.service.ts`
- Modify: `src/server/services/import.service.ts`
- Modify: `src/server/jobs/job-runner.ts`
- Modify: `src/server/http-api.ts`
- Modify: `src/server/app.ts`
- Test: `tests/integration/discovery-import-boundary.test.ts`
- Test: `tests/integration/library-import.test.ts`

**Step 1: Write the failing tests**

```ts
it('keeps discovery candidates outside inventory until explicit import', async () => {
  const { baseUrl } = await startWorkbenchTestServer();
  const search = await fetch(`${baseUrl}/api/discovery/search?q=oncology`);
  const searchBody = await search.json();
  const candidate = searchBody.boards[0].items[0];

  expect(candidate.state).toBe('new');

  const imported = await fetch(`${baseUrl}/api/discovery/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidateId: candidate.id }),
  });

  const importedBody = await imported.json();
  expect(importedBody.importMapping.libraryEntryId).toEqual(expect.any(String));
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/integration/discovery-import-boundary.test.ts tests/integration/library-import.test.ts`
Expected: FAIL because discovery/import mapping is not yet isolated from inventory truth.

**Step 3: Write minimal implementation**

Implement the smallest truthful server slice for:

- multi-source discovery candidates
- explicit import mapping
- direct ingest endpoints that match this wave’s supported sources
- recommendation feed scaffolding without pretending ranking loops are complete

Keep recommendation feedback, adaptive reranking, and project-shared feeds deferred.

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/integration/discovery-import-boundary.test.ts tests/integration/library-import.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/integration/discovery-import-boundary.test.ts tests/integration/library-import.test.ts src/server/connectors/pubmed.connector.ts src/server/connectors/arxiv.connector.ts src/server/connectors/openalex.connector.ts src/server/connectors/biorxiv.connector.ts src/server/services/discovery.service.ts src/server/services/recommendation.service.ts src/server/services/import.service.ts src/server/jobs/job-runner.ts src/server/http-api.ts src/server/app.ts
git commit -m "feat: add risk-first discovery import boundary"
```

---

### Task 4: Split notebook, evidence, and project projection on the server

**Files:**
- Create: `src/server/services/notebook.service.ts`
- Create: `src/server/services/project-projection.service.ts`
- Modify: `src/server/services/reading.service.ts`
- Modify: `src/server/http-api.ts`
- Modify: `src/server/app.ts`
- Test: `tests/integration/notebook-project-projection.test.ts`
- Test: `tests/integration/reading-evidence.test.ts`

**Step 1: Write the failing tests**

```ts
it('creates project references without exposing notebook bodies', async () => {
  const { baseUrl } = await startWorkbenchTestServer();

  const response = await fetch(`${baseUrl}/api/projects/project-1/docs/doc-1/references`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceType: 'notebook-note',
      notebookId: 'notebook-1',
      noteId: 'note-1',
      selectedText: 'Important excerpt',
      paperAssetId: 'asset-1',
    }),
  });

  const body = await response.json();
  expect(body.reference.ownerType).toBe('project');
  expect(body.reference).not.toHaveProperty('notebookBody');
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/integration/notebook-project-projection.test.ts tests/integration/reading-evidence.test.ts`
Expected: FAIL because current reading/evidence flows still mix private notes and shared outputs.

**Step 3: Write minimal implementation**

Refactor server state and services so that:

- notebook state is private and paper/question scoped
- evidence can be explicitly private or project scoped
- projection creates project-owned reference artifacts
- Reader no longer depends on direct access to private notebook bodies from project routes

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/integration/notebook-project-projection.test.ts tests/integration/reading-evidence.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/integration/notebook-project-projection.test.ts tests/integration/reading-evidence.test.ts src/server/services/notebook.service.ts src/server/services/project-projection.service.ts src/server/services/reading.service.ts src/server/http-api.ts src/server/app.ts
git commit -m "feat: split notebook and project projection boundaries"
```

---

### Task 5: Refactor writing ownership into project-owned document trees

**Files:**
- Modify: `src/server/services/writing.service.ts`
- Modify: `src/server/services/versioning.service.ts`
- Modify: `src/server/http-api.ts`
- Modify: `src/shared/contracts/writing.ts`
- Modify: `src/server/app.ts`
- Test: `tests/integration/project-doc-ownership.test.ts`
- Test: `tests/integration/writing-versioning.test.ts`

**Step 1: Write the failing tests**

```ts
it('stores project docs as project-owned shared documents', async () => {
  const service = createWritingService(makeWritingStore());
  const document = await service.saveProjectDocument({
    actorSpaceId: 'space-1',
    actorUserId: 'user-alice',
    projectId: 'project-1',
    spaceId: 'space-1',
    title: 'Protocol Draft',
    content: 'Shared project content',
    citations: [],
  });

  expect(document.ownerType).toBe('project');
  expect(document.projectId).toBe('project-1');
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/integration/project-doc-ownership.test.ts tests/integration/writing-versioning.test.ts`
Expected: FAIL because current writing storage is still actor-owned by `ownerUserId`.

**Step 3: Write minimal implementation**

Replace the old actor-owned document assumption with a project-owned tree model that still preserves version history and citations. This task must leave one authoritative answer for:

- where project docs are stored
- who owns them
- how presence / references attach
- how current `saveProjectDocument(...)` maps into the new ownership model

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/integration/project-doc-ownership.test.ts tests/integration/writing-versioning.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/integration/project-doc-ownership.test.ts tests/integration/writing-versioning.test.ts src/server/services/writing.service.ts src/server/services/versioning.service.ts src/server/http-api.ts src/shared/contracts/writing.ts src/server/app.ts
git commit -m "feat: make project docs truly project-owned"
```

---

### Task 6: Cut over canonical routes and remove legacy `/spaces` dependence

**Files:**
- Modify: `src/web/router.tsx`
- Modify: `src/web/pages/spaces-page.tsx`
- Modify: `src/web/pages/project-page.tsx`
- Modify: `src/web/pages/writing-page.tsx`
- Modify: `src/web/components/sidebar-nav.tsx`
- Test: `tests/ui/workbench-routing.test.tsx`
- Test: `tests/ui/workbench-navigation.test.tsx`
- Test: `tests/integration/native-demo-http.test.ts`

**Step 1: Write the failing tests**

```tsx
it('uses /projects routes as the canonical workbench paths', async () => {
  render(<AppRouter />);

  expect(screen.queryByText(/spaces/i)).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /projects/i })).toHaveAttribute('href', '/projects');
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/ui/workbench-routing.test.tsx tests/ui/workbench-navigation.test.tsx tests/integration/native-demo-http.test.ts`
Expected: FAIL because current router still exposes legacy `/spaces/...` paths as first-class routes.

**Step 3: Write minimal implementation**

Make `/projects/...` canonical and either:

- redirect any surviving `/spaces/...` deep links during cutover, or
- remove them once the rest of the workbench tests pass.

Do not keep two fully supported route trees by the end of this task.

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/ui/workbench-routing.test.tsx tests/ui/workbench-navigation.test.tsx tests/integration/native-demo-http.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/ui/workbench-routing.test.tsx tests/ui/workbench-navigation.test.tsx tests/integration/native-demo-http.test.ts src/web/router.tsx src/web/pages/spaces-page.tsx src/web/pages/project-page.tsx src/web/pages/writing-page.tsx src/web/components/sidebar-nav.tsx
git commit -m "refactor: cut over workbench routing to canonical project paths"
```

---

### Task 7: Rebuild the shell, intake hub, and unified library on top of the new model

**Files:**
- Modify: `src/web/components/workbench-layout.tsx`
- Modify: `src/web/components/recent-opened-panel.tsx`
- Modify: `src/web/components/context-indicator.tsx`
- Create: `src/web/components/intake-source-board.tsx`
- Create: `src/web/components/library-filters.tsx`
- Modify: `src/web/pages/home-page.tsx`
- Modify: `src/web/pages/today-page.tsx`
- Modify: `src/web/pages/search-page.tsx`
- Modify: `src/web/pages/library-page.tsx`
- Test: `tests/ui/home-page.test.tsx`
- Test: `tests/ui/library-and-project-context.test.tsx`
- Create: `tests/ui/research-workbench-shell.test.tsx`

**Step 1: Write the failing tests**

```tsx
it('renders a stable three-pane workbench shell with intake and inventory surfaces', async () => {
  render(<AppRouter />);

  expect(screen.getByTestId('workbench-left-rail')).toBeInTheDocument();
  expect(screen.getByTestId('workbench-main-surface')).toBeInTheDocument();
  expect(screen.getByTestId('workbench-context-rail')).toBeInTheDocument();
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/ui/home-page.test.tsx tests/ui/library-and-project-context.test.tsx tests/ui/research-workbench-shell.test.tsx`
Expected: FAIL because the current shell and pages still reflect the older demo workflow.

**Step 3: Write minimal implementation**

Rebuild the shell and top-level work surfaces so that:

- the left rail is stable
- the center area hosts intake / library as true work surfaces
- the right rail carries contextual metadata / evidence / activity
- library becomes one inventory with multiple views instead of a split-stack mental model

Do not reintroduce legacy route assumptions from removed `/spaces` flows.

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/ui/home-page.test.tsx tests/ui/library-and-project-context.test.tsx tests/ui/research-workbench-shell.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/ui/home-page.test.tsx tests/ui/library-and-project-context.test.tsx tests/ui/research-workbench-shell.test.tsx src/web/components/workbench-layout.tsx src/web/components/recent-opened-panel.tsx src/web/components/context-indicator.tsx src/web/components/intake-source-board.tsx src/web/components/library-filters.tsx src/web/pages/home-page.tsx src/web/pages/today-page.tsx src/web/pages/search-page.tsx src/web/pages/library-page.tsx
git commit -m "feat: rebuild workbench shell intake and library"
```

---

### Task 8: Rebuild Reader, Notes Workspace, and Project Docs as separate work surfaces

**Files:**
- Modify: `src/web/pages/reader-page.tsx`
- Create: `src/web/pages/notes-page.tsx`
- Modify: `src/web/pages/project-page.tsx`
- Modify: `src/web/pages/writing-page.tsx`
- Create: `src/web/components/project-document-tree.tsx`
- Create: `src/web/components/notebook-question-list.tsx`
- Modify: `src/web/router.tsx`
- Test: `tests/ui/paper-workspace.test.tsx`
- Test: `tests/ui/project-writer-flow.test.tsx`
- Test: `tests/ui/native-demo-workflow.test.tsx`
- Create: `tests/ui/notes-workspace.test.tsx`

**Step 1: Write the failing tests**

```tsx
it('keeps deep reading, private notes, and project docs on separate surfaces', async () => {
  render(<AppRouter />);

  expect(screen.getByRole('heading', { name: /reader/i })).toBeInTheDocument();
  expect(screen.queryByText(/promote latest insight to writer/i)).not.toBeInTheDocument();
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- tests/ui/paper-workspace.test.tsx tests/ui/project-writer-flow.test.tsx tests/ui/native-demo-workflow.test.tsx tests/ui/notes-workspace.test.tsx`
Expected: FAIL because Reader, notes, and project writing are still coupled to older promotion flows.

**Step 3: Write minimal implementation**

Rebuild these surfaces with hard boundaries:

- Reader = single-paper deep reading
- Notes Workspace = private, cross-paper question-driven thinking
- Project Docs = project-owned tree + current document + reference rail

By the end of this task, the old “Reader promotes directly into Writer draft” flow should be gone.

**Step 4: Run tests to verify they pass**

Run: `npm test -- tests/ui/paper-workspace.test.tsx tests/ui/project-writer-flow.test.tsx tests/ui/native-demo-workflow.test.tsx tests/ui/notes-workspace.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/ui/paper-workspace.test.tsx tests/ui/project-writer-flow.test.tsx tests/ui/native-demo-workflow.test.tsx tests/ui/notes-workspace.test.tsx src/web/pages/reader-page.tsx src/web/pages/notes-page.tsx src/web/pages/project-page.tsx src/web/pages/writing-page.tsx src/web/components/project-document-tree.tsx src/web/components/notebook-question-list.tsx src/web/router.tsx
git commit -m "feat: separate reader notes and project docs"
```

---

### Task 9: Run the truthfulness pass, update the runbook, and verify the cutover end-to-end

**Files:**
- Modify: `docs/runbooks/native-demo-showcase.md`
- Modify: `docs/plans/2026-03-23-jixia-research-workbench-reset-design.md`
- Modify: `docs/plans/2026-03-24-jixia-research-workbench-reset-risk-first-implementation.md`
- Modify: `tests/ui/mvp-workflow.test.tsx`
- Test: `tests/integration/native-demo-http.test.ts`
- Test: `tests/ui/native-demo-workflow.test.tsx`

**Step 1: Write the failing/obsolete-doc check**

Create a checklist in the task notes and verify these statements are no longer true anywhere in docs or tests:

- legacy `/spaces/...` is the main workbench route
- Reader owns project writing workflow
- project docs are still user-owned drafts
- tests use `request(server)`

**Step 2: Run focused tests before the full suite**

Run: `npm test -- tests/integration/native-demo-http.test.ts tests/ui/native-demo-workflow.test.tsx tests/ui/mvp-workflow.test.tsx`
Expected: PASS only after docs/tests match the new flow.

**Step 3: Update docs and walkthroughs truthfully**

Update the runbook and reset docs so that a new contributor can follow the rebuilt workbench without falling back to the old demo model.

**Step 4: Run full verification**

Run: `npm test`
Expected: PASS.

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run build`
Expected: PASS.

Then manually verify this walkthrough:

1. Open `/home`
2. Enter intake via `/search` or `/today`
3. Import a paper into inventory
4. Open the paper in Reader
5. Save private notebook material
6. Project selected material into a project reference
7. Open project docs and confirm the reference is project-owned

**Step 5: Commit**

```bash
git add docs/runbooks/native-demo-showcase.md docs/plans/2026-03-23-jixia-research-workbench-reset-design.md docs/plans/2026-03-24-jixia-research-workbench-reset-risk-first-implementation.md tests/ui/mvp-workflow.test.tsx tests/integration/native-demo-http.test.ts tests/ui/native-demo-workflow.test.tsx
git commit -m "docs: align workbench reset runbook with truthful cutover"
```

---

## Definition of done for this risk-first reset

- Discovery candidates and imported inventory are different objects with different responsibilities.
- Notebook state is private and never read directly from project routes.
- Project references and project docs are project-owned.
- Canonical workbench routing uses `/projects/...`; legacy `/spaces/...` is removed or reduced to a non-authoritative redirect shim.
- The shell is a stable three-pane workbench.
- Library is one inventory with multiple views.
- Reader, Notes Workspace, and Project Docs are separate work surfaces.
- `npm test`, `npm run typecheck`, and `npm run build` all pass.
- `docs/runbooks/native-demo-showcase.md` describes the rebuilt workbench truthfully.
