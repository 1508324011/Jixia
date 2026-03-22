# Jixia Native Demo Showcase Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the current Task 10/11 branch state into a native Node, browser-driven, offline-reproducible Jixia demo that can convincingly showcase product value on the current no-sudo server.

**Architecture:** Stay narrow and server-first. Do not redesign the full transport boundary or chase general deployment polish. Instead, lock a deterministic bootstrap/reset path first, then add the thinnest truthful HTTP API surface and real browser-side data flow needed for one end-to-end showcase: shared space -> import -> reader note/insight -> writing save/publish -> governed job/audit. The result should be easy to demo, easy to reset, and honest about the current platform boundary.

**Tech Stack:** Node.js, TypeScript, Vite, Vitest, React, existing `createJixiaApp()` runtime, file-backed server state, deterministic import connectors, native `fetch` client wrappers.

---

## Current starting point

- Source branch: `task10-layered-ui`
- Demo branch/worktree: `demo-native-showcase`
- Verified baseline in the new worktree before planning: `npm run test`, `npm run typecheck`, and `npm run build` all pass.
- The browser shell exists in `src/web/pages/*`, but it mostly shows placeholders rather than real data.
- `src/server/http-server.ts` currently exposes `/health` and static assets, but not a browser-callable business API.
- The server-side domain logic already exists for spaces, import, reading, writing, jobs, audit, and event streams.
- Import connectors are deterministic placeholders, which is perfect for an offline demo.
- The demo must run with **user-owned** runtime paths, for example:
  - `JIXIA_STORAGE_ROOT=/home/zhurui/.local/share/jixia-demo/storage`
  - `JIXIA_DATABASE_URL=file:/home/zhurui/.local/share/jixia-demo/data/jixia-demo.db`

## Non-goals

- no broad production API redesign
- no authentication system overhaul
- no Docker-first work in this branch
- no real external PubMed or arXiv integration
- no major visual redesign beyond replacing placeholders with real data states

## Execution flow

```mermaid
flowchart LR
    accTitle: Native Demo Implementation Flow
    accDescr: The native demo plan first locks the bootstrap and runbook contract, then seeds deterministic data, adds the minimal HTTP surface, wires the browser shell to real data, optionally adds governed-job showcase surfaces, and finishes with a runbook plus final verification.

    contract["Contract tests"]
    seed["Deterministic bootstrap and reset"]
    api["Minimal read models and HTTP adapter"]
    ui["Spaces library reader writing live wiring"]
    jobs["Optional governed job and audit finale"]
    docs["Demo runbook and admin story"]
    verify["Full verification and showcase rehearsal"]

    contract --> seed --> api --> ui --> jobs --> docs --> verify

    classDef primary fill:#e8eef8,stroke:#2b3a67,stroke-width:1.5px,color:#1f2937

    class contract,seed,api,ui,jobs,docs,verify primary
```

## Implementation notes before execution

1. Preserve the current server-first model. The browser must never become the source of truth for demo data.
2. Add only the minimum read models needed for the showcase, especially library listing and writing document detail.
3. Seed deterministic demo data **before** relying on fixed IDs like `shared-space`, `tumor-board`, or `pmid:123456`.
4. Every important mutation must be proven again after a fresh read, page reload, or route re-entry. A successful POST alone is not enough.
5. Keep the demo storage contract user-owned and explicit in both env guidance and runbook text.
6. Treat jobs/audit as a high-value finale. If time runs short, deliver the main research workflow first.

### Task 1: Lock the native demo bootstrap and runbook contract in tests

**Files:**
- Create: `tests/integration/native-demo-http.test.ts`
- Create: `tests/ui/native-demo-workflow.test.tsx`
- Create: `tests/smoke/native-demo-runbook.test.ts`

**Step 1: Write the failing tests**

Create three tests that lock the demo contract before implementation:

- `tests/integration/native-demo-http.test.ts` should assert that a demo HTTP surface exists for the walkthrough path.
- `tests/ui/native-demo-workflow.test.tsx` should assert that the browser flow will eventually rely on real fetched data rather than placeholder text.
- `tests/smoke/native-demo-runbook.test.ts` should assert the presence of a dedicated demo runbook, a `demo:reset` command, and user-owned runtime guidance.

Starter expectations:

```ts
expect(packageJson.scripts?.['demo:reset']).toBeTruthy();
expect(runbook).toContain('npm run start:server');
expect(runbook).toContain('/home/zhurui/.local/share/jixia-demo');
expect(screen.queryByText('Loading state placeholder')).not.toBeInTheDocument();
```

**Step 2: Run tests to verify they fail**

Run:

- `npm run test -- tests/integration/native-demo-http.test.ts`
- `npm run test -- tests/ui/native-demo-workflow.test.tsx`
- `npm run test -- tests/smoke/native-demo-runbook.test.ts`

Expected: FAIL because the demo HTTP surface, runbook, and reset contract do not exist yet.

**Step 3: Write minimal implementation**

Do not try to satisfy all failures at once. Keep these failing tests as the execution contract.

**Step 4: Run tests again to verify they fail only for missing implementation**

Run the same three commands again.

Expected: FAIL only on missing demo functionality, not on syntax or import problems.

**Step 5: Commit**

```bash
git add tests/integration/native-demo-http.test.ts tests/ui/native-demo-workflow.test.tsx tests/smoke/native-demo-runbook.test.ts
git commit -m "test: lock native demo showcase contract"
```

### Task 2: Add deterministic demo bootstrap and reset behavior

**Files:**
- Create: `src/server/demo/bootstrap.ts`
- Create: `src/server/demo/demo-fixture.ts`
- Create: `scripts/demo-reset.mjs`
- Modify: `src/server/http-server.ts`
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `tests/integration/native-demo-http.test.ts`
- Modify: `tests/smoke/native-demo-runbook.test.ts`

**Step 1: Write the failing test for seeded demo state**

Update integration and smoke tests to assert:

- a demo reset command exists
- first startup after reset yields a known `shared-space` and `tumor-board`
- one deterministic paper locator such as `pmid:123456` is documented and reproducible
- the runbook explains user-owned storage and database paths

```ts
expect(packageJson.scripts?.['demo:reset']).toBeTruthy();
expect(runbook).toContain('shared-space');
expect(runbook).toContain('pmid:123456');
expect(runbook).toContain('/home/zhurui/.local/share/jixia-demo/storage');
```

**Step 2: Run tests to verify they fail**

Run:

- `npm run test -- tests/integration/native-demo-http.test.ts`
- `npm run test -- tests/smoke/native-demo-runbook.test.ts`

Expected: FAIL because there is no deterministic demo bootstrap or reset flow yet.

**Step 3: Write minimal implementation**

Add a small deterministic demo bootstrap path that seeds the space/project on first run or when the storage is reset. Add `npm run demo:reset` that removes the demo storage state in a user-owned path. Keep the data minimal and stable.

**Step 4: Run tests to verify they pass**

Run the same two commands again.

Expected: PASS.

**Step 5: Commit**

```bash
git add src/server/demo/bootstrap.ts src/server/demo/demo-fixture.ts scripts/demo-reset.mjs src/server/http-server.ts package.json .env.example tests/integration/native-demo-http.test.ts tests/smoke/native-demo-runbook.test.ts
git commit -m "feat: add deterministic demo bootstrap"
```

### Task 3: Add the minimal demo read models and HTTP adapter

**Files:**
- Create: `src/server/http-api.ts`
- Modify: `src/server/http-server.ts`
- Modify: `src/server/routes/spaces.routes.ts`
- Modify: `src/server/routes/library.routes.ts`
- Modify: `src/server/routes/writing.routes.ts`
- Modify: `src/server/services/library.service.ts`
- Modify: `src/server/services/writing.service.ts`
- Modify: `src/shared/contracts/spaces.ts`
- Modify: `src/shared/contracts/library.ts`
- Modify: `src/shared/contracts/writing.ts`
- Modify: `tests/integration/native-demo-http.test.ts`

**Step 1: Write the failing test for space, library, and writing read models**

Extend `tests/integration/native-demo-http.test.ts` to require these capabilities against seeded demo state:

```ts
expect(result.spaces[0]?.spaceId).toBe('shared-space');
expect(result.entries[0]?.entryId).toBeTruthy();
expect(result.document.documentId).toBeTruthy();
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/integration/native-demo-http.test.ts`

Expected: FAIL because space listing, library listing, and writing detail are not exposed through the HTTP layer yet.

**Step 3: Write minimal implementation**

Implement the thinnest adapter layer that maps browser-safe JSON routes onto existing services:

- `GET /api/spaces`
- `POST /api/spaces/:spaceId/import`
- `GET /api/spaces/:spaceId/projects/:projectId/library`
- `GET /api/library/:entryId`
- `GET /api/reading/:entryId`
- `GET /api/writing/:spaceId/projects/:projectId/document`
- `POST /api/writing/:spaceId/projects/:projectId/document`
- `POST /api/writing/:documentId/publish`

Keep parsing and response serialization centralized in `src/server/http-api.ts` so `src/server/http-server.ts` stays readable.

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/integration/native-demo-http.test.ts`

Expected: PASS for the read-model and HTTP adapter assertions added in this task.

**Step 5: Commit**

```bash
git add src/server/http-api.ts src/server/http-server.ts src/server/routes/spaces.routes.ts src/server/routes/library.routes.ts src/server/routes/writing.routes.ts src/server/services/library.service.ts src/server/services/writing.service.ts src/shared/contracts/spaces.ts src/shared/contracts/library.ts src/shared/contracts/writing.ts tests/integration/native-demo-http.test.ts
git commit -m "feat: add native demo http adapter"
```

### Task 4: Wire the Spaces and Library pages to real server data

**Files:**
- Create: `src/web/lib/demo-api.ts`
- Modify: `src/web/lib/http-client.ts`
- Modify: `src/web/pages/spaces-page.tsx`
- Modify: `src/web/pages/library-page.tsx`
- Modify: `src/web/styles/app.css`
- Modify: `tests/ui/native-demo-workflow.test.tsx`

**Step 1: Write the failing UI test**

Update `tests/ui/native-demo-workflow.test.tsx` to require:

- a rendered space list from fetched data
- a working import action
- a rendered library list from fetched data rather than placeholder copy

```tsx
expect(await screen.findByText('shared-space')).toBeInTheDocument();
await user.click(screen.getByRole('button', { name: /import paper/i }));
expect(await screen.findByText(/Imported PMID paper 123456/i)).toBeInTheDocument();
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/ui/native-demo-workflow.test.tsx`

Expected: FAIL because the browser shell still renders placeholder content.

**Step 3: Write minimal implementation**

Create a small demo API client in `src/web/lib/demo-api.ts`, then update `SpacesPage` and `LibraryPage` to fetch, render, and mutate real data with honest loading and empty states.

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/ui/native-demo-workflow.test.tsx`

Expected: PASS for the spaces and library interactions.

**Step 5: Commit**

```bash
git add src/web/lib/demo-api.ts src/web/lib/http-client.ts src/web/pages/spaces-page.tsx src/web/pages/library-page.tsx src/web/styles/app.css tests/ui/native-demo-workflow.test.tsx
git commit -m "feat: wire demo spaces and library pages"
```

### Task 5: Wire Reader and Writing to real notes, insights, and document state

**Files:**
- Modify: `src/shared/contracts/reading.ts`
- Modify: `src/shared/contracts/writing.ts`
- Modify: `src/server/routes/reading.routes.ts`
- Modify: `src/server/routes/writing.routes.ts`
- Modify: `src/web/pages/reader-page.tsx`
- Modify: `src/web/pages/writing-page.tsx`
- Modify: `src/web/lib/demo-api.ts`
- Modify: `tests/ui/native-demo-workflow.test.tsx`
- Modify: `tests/integration/native-demo-http.test.ts`

**Step 1: Write the failing tests**

Add expectations that the browser can:

- load reader detail for a real entry
- create a note
- save a generated insight
- refresh or re-fetch and still see the saved note/insight
- load or create a writing document
- save content, re-fetch the document, and reflect publish-state transitions

```tsx
await user.type(screen.getByLabelText(/note body/i), 'Key mutation note');
await user.click(screen.getByRole('button', { name: /save note/i }));
expect(await screen.findByText('Key mutation note')).toBeInTheDocument();
await user.click(screen.getByRole('button', { name: /refresh reader/i }));
expect(await screen.findByText('Key mutation note')).toBeInTheDocument();

await user.type(screen.getByLabelText(/draft body/i), 'Tumor board synthesis');
await user.click(screen.getByRole('button', { name: /save draft/i }));
await user.click(screen.getByRole('button', { name: /reload draft/i }));
expect(await screen.findByDisplayValue('Tumor board synthesis')).toBeInTheDocument();
```

**Step 2: Run tests to verify they fail**

Run:

- `npm run test -- tests/integration/native-demo-http.test.ts`
- `npm run test -- tests/ui/native-demo-workflow.test.tsx`

Expected: FAIL because reader and writing are not yet data-driven and do not yet prove persistence after a fresh read.

**Step 3: Write minimal implementation**

Expose the remaining reader/writing HTTP endpoints, then wire `ReaderPage` and `WritingPage` to real state using the new demo API client. Add the smallest refresh or reload affordance needed to prove persistence honestly.

**Step 4: Run tests to verify they pass**

Run the same two commands again.

Expected: PASS.

**Step 5: Commit**

```bash
git add src/shared/contracts/reading.ts src/shared/contracts/writing.ts src/server/routes/reading.routes.ts src/server/routes/writing.routes.ts src/web/pages/reader-page.tsx src/web/pages/writing-page.tsx src/web/lib/demo-api.ts tests/ui/native-demo-workflow.test.tsx tests/integration/native-demo-http.test.ts
git commit -m "feat: wire demo reader and writing workflow"
```

### Task 6: Add the governed job and audit finale

**Files:**
- Modify: `src/server/routes/jobs.routes.ts`
- Modify: `src/server/routes/job-stream.routes.ts`
- Modify: `src/shared/contracts/jobs.ts`
- Modify: `src/web/lib/demo-api.ts`
- Modify: `src/web/pages/reader-page.tsx`
- Modify: `src/web/pages/writing-page.tsx`
- Modify: `tests/integration/native-demo-http.test.ts`
- Modify: `tests/ui/native-demo-workflow.test.tsx`

**Step 1: Write the failing tests**

Add expectations that a governed job can be created and run from the browser-facing demo flow, and that at least one audit or event artifact is visible.

```tsx
await user.click(screen.getByRole('button', { name: /run governed summary/i }));
expect(await screen.findByText(/queued|running|succeeded/i)).toBeInTheDocument();
expect(await screen.findByText(/audit|event/i)).toBeInTheDocument();
```

**Step 2: Run tests to verify they fail**

Run:

- `npm run test -- tests/integration/native-demo-http.test.ts`
- `npm run test -- tests/ui/native-demo-workflow.test.tsx`

Expected: FAIL because job/audit data is not yet surfaced in the browser demo flow.

**Step 3: Write minimal implementation**

Expose the smallest truthful governed-job API needed by the demo and surface it in the UI as an optional final action, not as the main workflow.

**Step 4: Run tests to verify they pass**

Run the same two commands again.

Expected: PASS.

**Step 5: Commit**

```bash
git add src/server/routes/jobs.routes.ts src/server/routes/job-stream.routes.ts src/shared/contracts/jobs.ts src/web/lib/demo-api.ts src/web/pages/reader-page.tsx src/web/pages/writing-page.tsx tests/integration/native-demo-http.test.ts tests/ui/native-demo-workflow.test.tsx
git commit -m "feat: add governed job demo finale"
```

### Task 7: Add the showcase runbook and admin-facing story

**Files:**
- Create: `docs/runbooks/native-demo-showcase.md`
- Modify: `README.md`
- Modify: `README_CN.md`
- Modify: `tests/smoke/native-demo-runbook.test.ts`

**Step 1: Write the failing smoke test**

Require a dedicated runbook with:

- reset instructions
- startup commands
- explicit user-owned storage and database paths
- exact demo clicks or flow
- admin-facing explanation of why Docker or controlled ops support is the next step

```ts
expect(runbook).toContain('Shared Space -> Import Paper -> Reader -> Writing');
expect(runbook).toContain('Why operator support is next');
expect(runbook).toContain('npm run demo:reset');
expect(runbook).toContain('/home/zhurui/.local/share/jixia-demo/storage');
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/smoke/native-demo-runbook.test.ts`

Expected: FAIL because the runbook does not exist yet.

**Step 3: Write minimal implementation**

Create `docs/runbooks/native-demo-showcase.md` and add short pointers from both READMEs. Keep the runbook practical and under ten minutes of walkthrough time.

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/smoke/native-demo-runbook.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add docs/runbooks/native-demo-showcase.md README.md README_CN.md tests/smoke/native-demo-runbook.test.ts
git commit -m "docs: add native demo showcase runbook"
```

### Task 8: Rehearse the full demo and lock final verification

**Files:**
- Modify: `tests/ui/native-demo-workflow.test.tsx`
- Modify: `docs/runbooks/native-demo-showcase.md`

**Step 1: Write the final failing verification expectations**

Add final expectations that the demo workflow covers the complete showcase path and that the runbook matches the real UI wording, including the refresh-visible persistence proof.

**Step 2: Run the full suite and collect failures**

Run:

- `npm run test`
- `npm run typecheck`
- `npm run build`

Expected: FAIL only if the demo branch still has incomplete browser-state or runbook gaps.

**Step 3: Write minimal implementation**

Adjust wording, button labels, refresh controls, and runbook steps so the runnable demo and the documented story match exactly.

**Step 4: Run full verification and a live rehearsal**

Run:

- `npm run test`
- `npm run typecheck`
- `npm run build`
- `npm run demo:reset`
- `npm run start:server`

Then manually verify in the browser:

1. open Spaces
2. enter `shared-space`
3. import one deterministic paper
4. open Reader and save a note and insight
5. refresh or re-fetch and confirm those artifacts remain visible
6. open Writing and save/publish
7. reload the document and confirm the latest state remains visible
8. optionally run the governed job finale

Expected: the runbook and the actual demo match one another exactly.

**Step 5: Commit**

```bash
git add tests/ui/native-demo-workflow.test.tsx docs/runbooks/native-demo-showcase.md
git commit -m "test: verify native demo showcase flow"
```

## Final verification checklist

- `npm run test`
- `npm run typecheck`
- `npm run build`
- `npm run demo:reset`
- `npm run start:server`
- browser walkthrough of the full showcase flow, including refresh-visible persistence checks

## Definition of done

This branch is done when all of the following are true:

- the current server can run the demo natively with no sudo and no Docker
- the browser shows real server-backed data rather than placeholder workflow shells
- the showcase can be reset to a known state deterministically
- the import path is offline-reproducible on this host
- reading and writing mutations are visible again after a fresh read or refresh
- at least one governed job or audit artifact can be demonstrated, or the branch explicitly documents why that finale was deferred
- the repo contains a short admin-facing runbook that explains both the product value and the operational next step
