# Jixia Usable Native Demo Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn `demo-native-showcase` into a usable, space-first, single-tenant Jixia demo whose remaining major gap can honestly be operator packaging rather than missing core product behavior.

**Architecture:** Preserve the existing truthful native runtime, persistence, and service-layer logic. The main correction is not “add more fake polish”; it is “stop hardwiring one story.” The branch should prove real create/open/reopen behavior for spaces, library, reader, and writing before it claims that Docker is the next big step. Navigation should stay lightweight and reuse current routed surfaces rather than becoming a second product rewrite.

**Tech Stack:** Node.js, TypeScript, Vite, Vitest, React, existing `createJixiaApp()` runtime, file-backed server state, deterministic import connectors, typed browser fetch wrappers, native reset/start scripts.

---

## Current starting point

- Branch/worktree: `demo-native-showcase`
- The branch already passes `npm run test`, `npm run typecheck`, `npm run build`, and `npm run demo:reset`.
- The runtime is truthful and persisted, but still too tightly centered on `nativeDemoFixture`.
- `src/server/http-api.ts` is still anchored to one actor, one seed space, one workspace slug, and one starter document.
- The browser pages are data-backed, but still feel like stages in a prepared walkthrough.
- The backend already has enough meaningful behavior to support a stronger usable demo without inventing fake client-side data.

## Non-goals

- no multi-user login or session system
- no Docker, reverse proxy, or TLS work in this branch
- no false claim that first-class project administration already exists
- no full public API redesign beyond what the demo needs
- no broad visual redesign unrelated to usability

## Execution flow

```mermaid
flowchart LR
    accTitle: Space-First Demo Flow
    accDescr: The usable-demo plan first redefines the contract, then proves persistence and create/open space behavior, broadens the space-first library-reader-writing loop, adds only lightweight navigation, and finishes with docs plus final verification.

    contract["Usable-demo contract tests"]
    persistence["Starter content and persistence semantics"]
    spaces["Create and open space"]
    library["Space-first library usage"]
    reader["Reusable reader workflow"]
    writing["Independent writing workflow"]
    shell["Lightweight current-context navigation"]
    jobs["Optional governed-job finish"]
    docs["Runbook and admin story"]
    verify["Full verification and live rehearsal"]

    contract --> persistence --> spaces --> library --> reader --> writing --> shell --> jobs --> docs --> verify

    classDef primary fill:#e8eef8,stroke:#2b3a67,stroke-width:1.5px,color:#1f2937

    class contract,persistence,spaces,library,reader,writing,shell,jobs,docs,verify primary
```

## Implementation notes before execution

1. Keep `demo-operator` if needed, but stop treating one seeded story as the only valid workflow.
2. Seeded fixture content is **starter content**, not the entire usable world.
3. Persistence semantics come before shell polish. A pretty navigation bar does not prove usability.
4. “Workspace” is demo language, not a claim that a true project model already exists.
5. Every important mutation must be re-proven after refresh, reload, re-entry, or restart where applicable.
6. We can only say “Docker is the next major gap” after create/open/reopen flows are verified for real.

### Task 1: Lock the revised usable-demo contract in tests

**Files:**
- Modify: `tests/integration/native-demo-http.test.ts`
- Modify: `tests/ui/native-demo-workflow.test.tsx`
- Modify: `tests/smoke/native-demo-runbook.test.ts`

**Step 1: Write the failing tests**

Redefine the branch contract around **space-first usability**, not walkthrough completion. The tests must require:

- spaces can be listed and at least one new space can be created
- a chosen space can be opened and reused
- the library can accumulate more than one imported record
- the reader can open an arbitrary chosen entry
- the writing surface can be reopened independently and reloaded
- the runbook no longer describes a guided tour as the primary value

Starter expectations:

```ts
expect(response.spaces.length).toBeGreaterThanOrEqual(1);
expect(runbook).toContain('Create or choose a space');
expect(runbook).toContain('usable native demo');
expect(runbook).not.toContain('guided showcase');
```

**Step 2: Run tests to verify they fail**

Run:

- `npm run test -- tests/integration/native-demo-http.test.ts`
- `npm run test -- tests/ui/native-demo-workflow.test.tsx`
- `npm run test -- tests/smoke/native-demo-runbook.test.ts`

Expected: FAIL because the current branch still satisfies the narrower showcase contract instead of the usable-demo contract.

**Step 3: Write minimal implementation**

Do not satisfy the failures yet. Keep the revised tests as the execution contract.

**Step 4: Run tests again to verify they fail only for missing product behavior**

Run the same three commands again.

Expected: FAIL only on missing usable-demo functionality, not on syntax or import issues.

**Step 5: Commit**

```bash
git add tests/integration/native-demo-http.test.ts tests/ui/native-demo-workflow.test.tsx tests/smoke/native-demo-runbook.test.ts
git commit -m "test: redefine usable native demo contract"
```

### Task 2: Make persistence semantics explicit and demote the fixture to starter content

**Files:**
- Modify: `src/server/demo/demo-fixture.ts`
- Modify: `src/server/demo/bootstrap.ts`
- Modify: `scripts/demo-reset.mjs`
- Modify: `.env.example`
- Modify: `docs/runbooks/native-demo-showcase.md`
- Modify: `tests/integration/native-demo-http.test.ts`
- Modify: `tests/smoke/native-demo-runbook.test.ts`

**Step 1: Write the failing tests**

Require the branch to state and prove what survives:

- reset restores starter content
- created spaces survive reload and restart until reset
- imported entries survive reload and restart until reset
- writing state survives reload and restart until reset
- the runbook explicitly distinguishes normal reuse from deliberate reset

```ts
expect(runbook).toContain('Reset is for rehearsal, not every session');
expect(runbook).toContain('/home/zhurui/.local/share/jixia-demo');
expect(spaces.some((space) => space.spaceId === 'shared-space')).toBe(true);
```

**Step 2: Run tests to verify they fail**

Run:

- `npm run test -- tests/integration/native-demo-http.test.ts`
- `npm run test -- tests/smoke/native-demo-runbook.test.ts`

Expected: FAIL because persistence semantics are not yet stated tightly enough.

**Step 3: Write minimal implementation**

Keep `shared-space`, starter import content, and starter document after reset, but document and enforce that normal usage accumulates beyond them until reset is explicitly invoked.

**Step 4: Run tests to verify they pass**

Run the same two commands again.

Expected: PASS.

**Step 5: Commit**

```bash
git add src/server/demo/demo-fixture.ts src/server/demo/bootstrap.ts scripts/demo-reset.mjs .env.example docs/runbooks/native-demo-showcase.md tests/integration/native-demo-http.test.ts tests/smoke/native-demo-runbook.test.ts
git commit -m "feat: define usable demo persistence contract"
```

### Task 3: Make create/open space the first de-scripting milestone

**Files:**
- Modify: `src/server/http-api.ts`
- Modify: `src/server/routes/spaces.routes.ts`
- Modify: `src/shared/contracts/spaces.ts`
- Modify: `src/web/lib/demo-api.ts`
- Modify: `src/web/pages/spaces-page.tsx`
- Modify: `tests/integration/native-demo-http.test.ts`
- Modify: `tests/ui/native-demo-workflow.test.tsx`

**Step 1: Write the failing tests**

Require the first real user-owned action to be space creation and open:

- `POST /api/spaces` creates a space
- the new space appears in the space list
- the UI can enter the new space without falling back to hardcoded `shared-space`

```ts
expect(createdSpace.spaceId).toBeTruthy();
expect(createdSpace.kind).toBe('shared');
```

```tsx
await user.click(screen.getByRole('button', { name: /create space/i }));
expect(await screen.findByText('Lab Notes')).toBeInTheDocument();
```

**Step 2: Run tests to verify they fail**

Run:

- `npm run test -- tests/integration/native-demo-http.test.ts`
- `npm run test -- tests/ui/native-demo-workflow.test.tsx`

Expected: FAIL because space creation/open is not yet the first-class starting action.

**Step 3: Write minimal implementation**

Expose a thin create-space path over the existing spaces service and make Spaces page treat starter content as helpful defaults rather than the only usable world.

**Step 4: Run tests to verify they pass**

Run the same two commands again.

Expected: PASS.

**Step 5: Commit**

```bash
git add src/server/http-api.ts src/server/routes/spaces.routes.ts src/shared/contracts/spaces.ts src/web/lib/demo-api.ts src/web/pages/spaces-page.tsx tests/integration/native-demo-http.test.ts tests/ui/native-demo-workflow.test.tsx
git commit -m "feat: make create and open space a real demo action"
```

### Task 4: Make the library a real space-first working surface

**Files:**
- Modify: `src/server/http-api.ts`
- Modify: `src/server/routes/library.routes.ts`
- Modify: `src/shared/contracts/library.ts`
- Modify: `src/web/lib/demo-api.ts`
- Modify: `src/web/pages/library-page.tsx`
- Modify: `tests/integration/native-demo-http.test.ts`
- Modify: `tests/ui/native-demo-workflow.test.tsx`

**Step 1: Write the failing tests**

Require the library to behave like a real shelf:

- imports accumulate over time in the chosen space
- more than one imported entry is visible
- any listed entry can be opened
- revisiting the library later still shows previously imported entries

```tsx
expect(await screen.findByText('Imported PMID paper 654321')).toBeInTheDocument();
expect(await screen.findByText('Imported arXiv paper 2401.01234')).toBeInTheDocument();
```

**Step 2: Run tests to verify they fail**

Run:

- `npm run test -- tests/integration/native-demo-http.test.ts`
- `npm run test -- tests/ui/native-demo-workflow.test.tsx`

Expected: FAIL because the library surface is still too shaped by starter assumptions.

**Step 3: Write minimal implementation**

Keep the API and UI thin, but make the library clearly belong to the current space, with multiple accumulated entries and honest empty/loading/error states.

**Step 4: Run tests to verify they pass**

Run the same two commands again.

Expected: PASS.

**Step 5: Commit**

```bash
git add src/server/http-api.ts src/server/routes/library.routes.ts src/shared/contracts/library.ts src/web/lib/demo-api.ts src/web/pages/library-page.tsx tests/integration/native-demo-http.test.ts tests/ui/native-demo-workflow.test.tsx
git commit -m "feat: make library a usable space-first surface"
```

### Task 5: Make Reader a reusable evidence workspace

**Files:**
- Modify: `src/server/http-api.ts`
- Modify: `src/server/routes/reading.routes.ts`
- Modify: `src/shared/contracts/reading.ts`
- Modify: `src/web/lib/demo-api.ts`
- Modify: `src/web/pages/reader-page.tsx`
- Modify: `tests/integration/native-demo-http.test.ts`
- Modify: `tests/ui/native-demo-workflow.test.tsx`

**Step 1: Write the failing tests**

Require the reader to support:

- opening an arbitrary chosen entry
- saving multiple notes and insights
- refreshing or re-entering the reader and still seeing persisted artifacts
- moving back to library or onward to writing without feeling like a fixed stage transition

```tsx
await user.click(screen.getByRole('button', { name: /refresh reader/i }));
expect(await screen.findByText('Key mutation note')).toBeInTheDocument();
expect(await screen.findByText('Tumor board summary')).toBeInTheDocument();
```

**Step 2: Run tests to verify they fail**

Run:

- `npm run test -- tests/integration/native-demo-http.test.ts`
- `npm run test -- tests/ui/native-demo-workflow.test.tsx`

Expected: FAIL because the reader still feels more guided than reusable.

**Step 3: Write minimal implementation**

Keep the reader tied to real server state, but ensure it can be reopened as an evidence workspace for any currently chosen entry.

**Step 4: Run tests to verify they pass**

Run the same two commands again.

Expected: PASS.

**Step 5: Commit**

```bash
git add src/server/http-api.ts src/server/routes/reading.routes.ts src/shared/contracts/reading.ts src/web/lib/demo-api.ts src/web/pages/reader-page.tsx tests/integration/native-demo-http.test.ts tests/ui/native-demo-workflow.test.tsx
git commit -m "feat: make reader a reusable evidence workspace"
```

### Task 6: Make Writing independently usable and restart-persistent

**Files:**
- Modify: `src/server/http-api.ts`
- Modify: `src/server/routes/writing.routes.ts`
- Modify: `src/shared/contracts/writing.ts`
- Modify: `src/web/lib/demo-api.ts`
- Modify: `src/web/pages/writing-page.tsx`
- Modify: `tests/integration/native-demo-http.test.ts`
- Modify: `tests/ui/native-demo-workflow.test.tsx`

**Step 1: Write the failing tests**

Require writing to support:

- opening independently from current space/work context
- saving draft content
- reloading draft content
- publishing and verifying persisted publish state
- surviving restart until reset

```tsx
await user.click(screen.getByRole('button', { name: /save draft/i }));
await user.click(screen.getByRole('button', { name: /reload draft/i }));
expect(await screen.findByDisplayValue('Tumor board synthesis')).toBeInTheDocument();
```

**Step 2: Run tests to verify they fail**

Run:

- `npm run test -- tests/integration/native-demo-http.test.ts`
- `npm run test -- tests/ui/native-demo-workflow.test.tsx`

Expected: FAIL because the writing surface is still too tied to the old narrative shape.

**Step 3: Write minimal implementation**

Make writing usable as an independent ongoing workspace for the current space/work context, without claiming a richer project model than the backend truly has.

**Step 4: Run tests to verify they pass**

Run the same two commands again.

Expected: PASS.

**Step 5: Commit**

```bash
git add src/server/http-api.ts src/server/routes/writing.routes.ts src/shared/contracts/writing.ts src/web/lib/demo-api.ts src/web/pages/writing-page.tsx tests/integration/native-demo-http.test.ts tests/ui/native-demo-workflow.test.tsx
git commit -m "feat: make writing independently usable"
```

### Task 7: Add lightweight current-context navigation only after the working surfaces are real

**Files:**
- Create: `src/web/lib/demo-session.ts`
- Create: `src/web/components/demo-shell-nav.tsx`
- Modify: `src/web/app.tsx`
- Modify: `src/web/router.tsx`
- Modify: `src/web/styles/app.css`
- Modify: `tests/ui/native-demo-workflow.test.tsx`

**Step 1: Write the failing UI test**

Require only lightweight, honest navigation:

- visible current space/context
- stable links between spaces, library, reader, and writing
- no overbuilt shell that implies a broader domain model than exists

```tsx
expect(screen.getByRole('navigation', { name: /workspace navigation/i })).toBeInTheDocument();
expect(screen.getByText(/current space/i)).toBeInTheDocument();
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/ui/native-demo-workflow.test.tsx`

Expected: FAIL because the pages still feel too isolated.

**Step 3: Write minimal implementation**

Add only the shell affordances needed to keep orientation and re-entry clear. Reuse current routes; do not build a second information architecture.

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/ui/native-demo-workflow.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/web/lib/demo-session.ts src/web/components/demo-shell-nav.tsx src/web/app.tsx src/web/router.tsx src/web/styles/app.css tests/ui/native-demo-workflow.test.tsx
git commit -m "feat: add lightweight usable demo navigation"
```

### Task 8: Keep governed jobs as an optional product finish

**Files:**
- Modify: `src/web/pages/writing-page.tsx`
- Modify: `src/web/pages/reader-page.tsx`
- Modify: `src/web/lib/demo-api.ts`
- Modify: `tests/integration/native-demo-http.test.ts`
- Modify: `tests/ui/native-demo-workflow.test.tsx`

**Step 1: Write the failing tests**

Require governed jobs to remain optional but demonstrable:

```tsx
await user.click(screen.getByRole('button', { name: /run governed summary/i }));
expect(await screen.findByText(/queued|running|succeeded/i)).toBeInTheDocument();
expect(await screen.findByText(/audit trail|event timeline/i)).toBeInTheDocument();
```

**Step 2: Run tests to verify they fail**

Run:

- `npm run test -- tests/integration/native-demo-http.test.ts`
- `npm run test -- tests/ui/native-demo-workflow.test.tsx`

Expected: FAIL only if the optional governed-job finish is still incomplete after the core usability work.

**Step 3: Write minimal implementation**

Keep governed-job proof available as a capstone, but do not let it become the main justification for the branch.

**Step 4: Run tests to verify they pass**

Run the same two commands again.

Expected: PASS.

**Step 5: Commit**

```bash
git add src/web/pages/writing-page.tsx src/web/pages/reader-page.tsx src/web/lib/demo-api.ts tests/integration/native-demo-http.test.ts tests/ui/native-demo-workflow.test.tsx
git commit -m "feat: keep governed jobs as optional usable proof"
```

### Task 9: Rewrite the runbook and admin-facing story for a usable demo

**Files:**
- Modify: `docs/runbooks/native-demo-showcase.md`
- Modify: `README.md`
- Modify: `README_CN.md`
- Modify: `tests/smoke/native-demo-runbook.test.ts`

**Step 1: Write the failing smoke test**

Require the runbook to describe:

- native startup and reset
- user-owned storage paths
- create or choose a space
- import multiple papers into that space
- open reader and writing as reusable surfaces
- the conditional admin message: packaging is next only because the product loop is already real

```ts
expect(runbook).toContain('Create or choose a space');
expect(runbook).toContain('Import more than one paper');
expect(runbook).toContain('Packaging is the next operator step');
```

**Step 2: Run test to verify it fails**

Run: `npm run test -- tests/smoke/native-demo-runbook.test.ts`

Expected: FAIL because the current runbook still frames the branch as a showcase.

**Step 3: Write minimal implementation**

Rewrite the runbook so it explains a usable native product session rather than a fixed scripted tour.

**Step 4: Run test to verify it passes**

Run: `npm run test -- tests/smoke/native-demo-runbook.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add docs/runbooks/native-demo-showcase.md README.md README_CN.md tests/smoke/native-demo-runbook.test.ts
git commit -m "docs: rewrite usable native demo runbook"
```

### Task 10: Rehearse and verify the full usable native demo

**Files:**
- Modify: `tests/ui/native-demo-workflow.test.tsx`
- Modify: `docs/runbooks/native-demo-showcase.md`

**Step 1: Add final verification expectations**

Ensure the final tests and runbook prove that the branch now behaves like a usable product demo instead of a guided corridor.

**Step 2: Run the full suite and collect failures**

Run:

- `npm run test`
- `npm run typecheck`
- `npm run build`
- `npm run demo:reset`

Expected: FAIL only if the branch still has remaining usability gaps.

**Step 3: Write minimal implementation**

Adjust wording, navigation, route behavior, and runbook steps until the product and the docs describe the same space-first usable experience.

**Step 4: Run final verification and live rehearsal**

Run:

- `npm run test`
- `npm run typecheck`
- `npm run build`
- `npm run demo:reset`
- `npm run start:server`

Then manually verify in the browser:

1. open Spaces
2. create or choose a space
3. open Library and import multiple papers
4. open any chosen entry in Reader
5. save note and insight, then refresh and verify persistence
6. open Writing independently, save draft, reload, publish, and verify persistence
7. restart without reset and verify that the new state is still present
8. optionally run the governed summary

Expected: the branch now behaves like a usable native demo whose next major step can honestly be operator packaging.

**Step 5: Commit**

```bash
git add tests/ui/native-demo-workflow.test.tsx docs/runbooks/native-demo-showcase.md
git commit -m "test: verify usable native demo flow"
```

## Final verification checklist

- `npm run test`
- `npm run typecheck`
- `npm run build`
- `npm run demo:reset`
- `npm run start:server`
- live browser rehearsal proving create/open/reopen/restart behavior

## Definition of done

This branch is done when all of the following are true:

- Jixia runs natively on this host without sudo or Docker
- a user can create or choose a space and keep using it later
- library entries accumulate over time in that space
- reader and writing state survive refresh, reload, and restart until reset
- the UI no longer depends on a forced click order to feel coherent
- the admin-facing message can honestly be: product behavior is real here; packaging and operator support are the next step
