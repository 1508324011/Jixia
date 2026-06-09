# Jixia Development Loop Plan

_Date: 2026-06-09_  
_Status: Trellis execution roadmap for the current project-first recovery line_  
_Purpose: turn the active Jixia product baseline and recovery architecture into an ordered sequence of implementation tasks that can be executed without re-litigating product semantics._

---

## 1. Operating principle and baseline

Jixia development continues from the current target-state product baseline in
`docs/plans/design.md` and the active architecture recovery plan in
`docs/plans/2026-05-03-jixia-project-first-recovery-plan.md`.

The operating sentence remains non-negotiable:

> **Space is governance. Project is collaboration.**

The repository should keep moving as a **server-first, lab-hosted research
collaboration platform**. Browser surfaces are thin terminals over server-owned
state. The server owns identity, projects, memberships, scoped library entries,
paper files, reading artifacts, private notebooks, shared Project Docs, governed
AI jobs, credential references, and audit records.

Older Space-first platform plans, especially
`docs/plans/2026-03-20-jixia-platform-design.md`, remain useful historical notes
for server-first runtime principles, but their foreground Space model is not the
active product model unless reconciled with the project-first recovery plan.

---

## 2. Current state summary

The `main` branch is no longer a placeholder shell. Current implementation facts
from `README.md`, schema, and executable specs are:

- The browser starts from real session login and authenticated workbench routes.
  Session cookies, not request body actor fields, are the normal browser
  authority boundary.
- The foreground workbench is project-first: `Home`, `Today/Search`, `Library`,
  `Projects`, `Notebook`, `Settings`, project library, project Reader, and
  Project Docs routes consume server APIs rather than hardcoded project ids.
- `Space` remains present as a governance container for membership, settings,
  storage, audit compatibility, and project ownership context.
- `Project` and `ProjectMember` are Prisma-backed collaboration authority. A
  `SpaceMembership` alone must not grant access to project library, docs, jobs,
  files, or audit records.
- `PaperAsset` is the deduplicated paper/source asset. It may contain server
  storage metadata internally, but browser DTOs expose only safe availability
  hints such as `hasFile`.
- `LibraryEntry` is the scoped adoption row. Its canonical ownership boundary is
  `ScopeRef`, not legacy `spaceId` or `visibility` mirrors.
- Server-owned file handling is in place: uploaded PDFs are stored under
  `JIXIA_STORAGE_ROOT`, deduplicated by checksum, and served only through
  authorized `GET|HEAD /api/library/:entryId/file` using a scoped
  `LibraryEntry.id`.
- Reader state is Prisma-backed: private notes, project comments, reading state,
  generated insights, durable Reader excerpts, canonical ReaderAnnotation/source
  text foundations, and Notebook capture paths are separate and scoped.
- `NotebookDocument` is private/user-owned. Reader evidence capture writes into
  the current actor's owner-only Notebook through explicit capture routes.
- `ProjectDoc` is project-owned, versioned, citable, and ProjectMember-gated.
  The foreground Project Docs path uses selected Reader evidence,
  project-visible citations/references, and explicit Project Library adoption;
  whole-Notebook Project Docs ingestion remains a legacy/internal compatibility
  endpoint only.
- Project Doc citation trace is browser-safe and ProjectMember-gated. It must
  report adoption-needed states truthfully instead of exposing private Notebook
  material, storage keys, checksums, or credential refs.
- Governed AI jobs, job events, audit logs, provider credential metadata,
  encrypted credential secrets, AI result artifacts, and workbench settings are
  Prisma-backed server authority. Jobs use explicit scope and audited lifecycle
  transitions.
- `Home` and `Project Workspace` read models are server-owned aggregate DTOs, not
  browser-local dashboards.

This plan assumes those implementation facts are the starting point. It does not
authorize a return to JSON state as collaborative truth, client-side actor
authority, foreground Space-first navigation, or browser/demo fallback data that
hides server failure.

---

## 3. Non-negotiable invariants

Every Trellis task created from this plan must preserve these invariants.

1. **Server-derived actor authority**
   - Protected browser APIs derive the actor from `jixia_session` or an
     explicitly gated legacy test/operator transport override.
   - Browser payload or query fields such as `actorUserId`, `requestedByUserId`,
     `authorUserId`, `startedByUserId`, `userId`, `ownerId`, or `actorSpaceId`
     are not authority and must fail closed where the specs require.

2. **`ScopeRef` ownership boundary**
   - New ownership-aware code uses `ScopeRef = { type: "user"; id } | { type:
     "project"; id }`.
   - Legacy `spaceId`, `visibility`, route defaults, and browser state are never
     ownership truth.

3. **Paper asset versus scoped adoption**
   - `PaperAsset` is global and deduplicated.
   - `LibraryEntry` is the scoped adoption row for personal or project libraries.
   - Project citations and Reader access must prove a scoped entry is available
     to the actor.

4. **Private Notebook versus shared Project Docs**
   - `NotebookDocument` is private and user-owned.
   - `ProjectDoc` is shared, project-owned, versioned, and citable.
   - Notebook and Project Docs may share the Jixia document block grammar, but
     they do not share ownership semantics.

5. **AI is suggestion/provenance first**
   - AI suggestions/results do not become durable Notebook or Project Doc
     knowledge without explicit user confirmation.
   - AI job payloads, result artifacts, and apply flows must keep provenance and
     auditability while avoiding raw provider payload or secret leakage.

6. **No storage or credential leakage**
   - Browser DTOs and business payloads never expose `storageKey`, checksums,
     `papers/...` keys, absolute file paths, `JIXIA_STORAGE_ROOT`, raw provider
     keys, encrypted secrets, decrypted secrets, or credential plaintext.

7. **ProjectMember gates project collaboration**
   - Project library, project Reader comments/excerpts, Project Docs, project
     files, project-scoped jobs, project audit, and project workspace state are
     visible only through `ProjectMember(projectId, actorUserId)`.
   - `SpaceMembership` remains governance context and is not a substitute for
     project access.

8. **Truthful empty/error states**
   - Missing data must render as an empty state, unavailable state, or explicit
     error.
   - Browser/demo fixtures must not silently replace failed server data in the
     authenticated product path.

9. **Trellis and git discipline**
   - Each implementation loop creates exactly one focused Trellis task.
   - Git operations in the PR phase must be run with `GIT_MASTER=1`.
   - Implement/check/debug agents must not manually run `git commit`, `git push`,
     or `git merge`; PR automation owns commit/push when invoked.

---

## 4. Stop and ask policy

The loop should continue autonomously through implementation, check, debug, and
draft PR creation for tasks that preserve the accepted product model. Stop and
ask the user before any change that would alter one of these areas:

- product direction or information architecture beyond `design.md`
- permission model or ownership semantics
- AI persistence semantics, especially automatic AI writes into durable research
  objects
- major UI temperament or product language decisions beyond the accepted
  `静水流深` direction
- schema changes that would weaken or replace `ScopeRef`, `ProjectMember`,
  `NotebookDocument`, `ProjectDoc`, or audited job boundaries
- adoption of deferred surfaces as foreground product work, including global
  search, realtime collaborative editing, object-attached discussion, full AI
  Workspace expansion, or public SaaS/multi-tenant assumptions
- any test or manual QA finding that suggests the current docs contradict the
  active baseline instead of simply exposing an implementation bug

If a stop condition is encountered during a Trellis task, record the finding in
that task's PRD/info or check report and pause before broadening scope.

---

## 5. Roadmap overview

The roadmap prioritizes hardening server-owned ownership loops before expanding
product surface area. Each row is intended to become one Trellis task.

| Order | Trellis-ready task | Primary purpose |
| --- | --- | --- |
| 1 | Project research loop invariant smoke test | Prove the current server-owned loop end-to-end and catch regressions without changing product semantics. |
| 2 | Authenticated browser fallback removal/gating | Ensure normal authenticated UI shows real empty/error states rather than demo fallback state. |
| 3 | ScopeRef and ProjectMember access assertion sweep | Harden project access checks across library, files, jobs, audit, and docs. |
| 4 | Project Doc citation trace and adoption-needed hardening | Make evidence availability, Project Library adoption, and citation trace failures deterministic and safe. |
| 5 | Governed AI result explicit-apply path | Ensure AI outputs remain reviewable suggestions until a user confirms Notebook or Project Doc persistence. |
| 6 | Home/Today continuation quality pass | Improve server-derived next-action usefulness without moving prioritization logic into the browser. |
| 7 | Project Docs block/reference editor hardening | Strengthen the Notion-like document grammar, reference preservation, and read-only viewer behavior. |
| 8 | Operator current-host verification gate | Keep lab-server startup, persistence, and backup expectations reproducible as the product surface grows. |

---

## 6. Roadmap task details

### Task 1 — Project research loop invariant smoke test

**Purpose**

Add a low-risk, high-signal invariant harness that exercises the current
server-owned research loop through real API/service boundaries. This task should
mostly add tests and, if needed, tighten small validation gaps discovered by the
test. It should not introduce new product semantics.

**Likely files / areas touched**

- `tests/integration/minimal-recovery-loop.test.ts` or a new focused integration
  test file
- Existing integration fixtures/helpers for session login, seeded users,
  temporary SQLite databases, and storage roots
- Potentially small fixes in `src/server/http-server.ts`, `src/server/app.ts`, or
  service mappers only if the test reveals direct invariant drift
- No foreground UI redesign in this task

**Acceptance criteria**

- Alice can log in through the supported session flow.
- Alice can create or use a visible project as a `ProjectMember`.
- A paper source can enter Alice's Personal Library and then be explicitly
  adopted into the target Project Library.
- Project Reader access is through the project-scoped `LibraryEntry`.
- A private Reader note remains private while a project comment is visible to an
  authorized project member.
- A durable Reader excerpt or generated insight can be captured into Alice's
  private Notebook without exposing it to another project member.
- A Project Doc can be created/saved with project-visible evidence, and its
  citation trace returns browser-safe provenance.
- A project-scoped governed job can be created/listed/read by authorized project
  members while non-members are denied.
- Charlie, as a non-member, cannot read the project's library entry, file,
  Project Doc, project job, or project audit trail.
- The harness asserts absence of storage keys, checksums, provider secrets,
  private Notebook bodies, and caller-supplied actor fields in browser-facing
  payloads.

**Verification commands**

```bash
npm test -- --run tests/integration/minimal-recovery-loop.test.ts
npm run typecheck
npm run build
```

Run full `npm test` if the task modifies shared services, app wiring,
schema-facing code, or route parsing beyond the test harness.

**Stop conditions**

- The smoke test requires changing product direction or permission semantics.
- A required step cannot be expressed without inventing a new workflow outside
  the current recovery plan.
- Fixing the failure requires schema changes that are not a direct consistency
  repair.

---

### Task 2 — Authenticated browser fallback removal/gating

**Purpose**

Make the authenticated product path truthful: server failures and empty data
should surface as explicit states, not demo fixtures or optimistic local objects.

**Likely files / areas touched**

- `src/web/pages/home-page.tsx`
- `src/web/pages/today-page.tsx`
- `src/web/pages/search-page.tsx`
- `src/web/pages/library-page.tsx`
- `src/web/pages/projects-page.tsx`
- `src/web/pages/project-page.tsx`
- `src/web/pages/reader-page.tsx`
- `src/web/pages/writing-page.tsx`
- `src/web/presenters/*`
- `src/web/lib/http-client.ts`
- UI guard tests such as `tests/ui/project-first-route-guard.test.ts`,
  `tests/ui/home-page.test.tsx`, `tests/ui/workbench-navigation.test.tsx`, and
  route-specific page tests

**Acceptance criteria**

- Production workbench pages import typed `apiClient`/presenters, not
  `createDemoApi`, for authenticated product data.
- Failed `Home`, `Today`, `Search`, `Library`, `Projects`, `Project Workspace`,
  Reader, Settings, and Project Doc loads produce explicit loading/empty/error
  states.
- No authenticated page fabricates project ids, document ids, paper entries,
  file links, credentials, jobs, or dashboard cards when the server response is
  empty or failed.
- Top-level Search imports only into Personal Library; project sharing remains an
  explicit project library adoption action.

**Verification commands**

```bash
npm test -- --run tests/ui/project-first-route-guard.test.ts tests/ui/home-page.test.tsx tests/ui/workbench-navigation.test.tsx
npm run typecheck
npm run build
```

Run full `npm test` if shared client contracts, route parsing, or cross-page
presenter behavior changes.

**Stop conditions**

- Removing a fallback exposes a product copy or visual hierarchy decision that
  changes the accepted UI temperament.
- A page cannot render a truthful state without adding new product semantics.

---

### Task 3 — ScopeRef and ProjectMember access assertion sweep

**Purpose**

Harden the server access boundary across existing project-owned surfaces by
adding focused assertions and closing any discovered drift from `ScopeRef` and
`ProjectMember` rules.

**Likely files / areas touched**

- `src/server/services/library.service.ts`
- `src/server/services/project-docs.service.ts`
- `src/server/services/reading.service.ts`
- `src/server/jobs/job-governance.ts`
- `src/server/routes/jobs.routes.ts`
- `src/server/routes/job-stream.routes.ts`
- `src/server/services/audit.service.ts`
- `src/server/http-server.ts`
- Integration tests for library import, reading evidence, writing docs, job
  governance, project audit, and actor boundary

**Acceptance criteria**

- Space-only members are denied project library, project files, Project Docs,
  project jobs, project job streams/events/audit, and project audit.
- Personal-scope APIs require the actor to own the user scope.
- Project-scope APIs require `ProjectMember(projectId, actorUserId)`.
- Route/body/query `spaceId`, `actorSpaceId`, `visibility`, `scopeType`, and
  caller actor fields cannot widen access.
- Negative tests exist for both matching and mismatched legacy actor/context
  residue where specs require rejection.

**Verification commands**

```bash
npm test -- --run tests/integration/library-import.test.ts tests/integration/reading-evidence.test.ts tests/integration/writing-versioning.test.ts tests/integration/job-governance.test.ts tests/integration/governance-audit.test.ts tests/integration/http-server-actor-boundary.test.ts
npm run typecheck
npm run build
```

Run full `npm test` because this task is cross-layer and access-control focused.

**Stop conditions**

- A required fix changes the role model, adds a new ACL level, or changes which
  project roles may mutate shared objects.
- A test suggests `SpaceMembership` should grant foreground project access.

---

### Task 4 — Project Doc citation trace and adoption-needed hardening

**Purpose**

Make Project Doc evidence availability deterministic, recoverable, and safe.
Project Doc saves should reject unavailable sources with stable details; the UI
should offer adoption only when the server provides a safe source entry id; trace
reads should remain browser-safe.

**Likely files / areas touched**

- `src/server/services/project-docs.service.ts`
- `src/server/routes/project-docs.routes.ts`
- `src/server/http-server.ts`
- `src/shared/contracts/project-docs.ts`
- `src/web/pages/writing-page.tsx`
- `src/web/presenters/project-doc-presenter.ts`
- `src/web/lib/http-client.ts`
- `tests/integration/http-server-writing-docs.test.ts`
- `tests/ui/project-writer-flow.test.tsx`
- `tests/contracts/core-contracts.test.ts`

**Acceptance criteria**

- Project Doc save failures for readable-but-not-project-adopted evidence return
  `PROJECT_DOC_CITATION_SOURCE_UNAVAILABLE` with browser-safe details.
- Citation trace rows report `available` only after target-project adoption is
  proven through a project-scoped `LibraryEntry`.
- When `sourceLibraryEntryId` is present, the UI can call the existing project
  adoption route with exactly `{ sourceLibraryEntryId }` and retry the same save
  payload.
- When no safe source entry id exists, the UI gives deterministic manual adoption
  guidance without fabricating source authority.
- Trace payloads and rendered panels omit private Notebook content, Reader private
  notes, storage keys, checksums, provider secrets, credential refs, and actor
  authority fields.

**Verification commands**

```bash
npm test -- --run tests/integration/http-server-writing-docs.test.ts tests/integration/writing-versioning.test.ts tests/ui/project-writer-flow.test.tsx tests/contracts/core-contracts.test.ts
npm run typecheck
npm run build
```

Run full `npm test` if shared citation contracts or Project Doc persistence
helpers change.

**Stop conditions**

- The task needs a new citation ontology, citation formatting engine, or
  automatic cross-module transfer mechanism.
- A proposed fix would make personal Library or private Notebook sources directly
  citable in Project Docs without explicit target-project adoption.

---

### Task 5 — Governed AI result explicit-apply path

**Purpose**

Clarify and harden the user-confirmed AI persistence boundary. AI jobs may create
reviewable result artifacts or suggestions; durable Notebook or Project Doc
knowledge changes must require an explicit apply/save action with audit records
and provenance.

**Likely files / areas touched**

- `src/server/services/ai-results.service.ts` or current AI result artifact
  services/routes
- `src/server/services/project-docs.service.ts`
- `src/server/services/notebooks.service.ts`
- `src/server/routes/jobs.routes.ts`
- `src/server/routes/project-docs.routes.ts`
- `src/shared/contracts/ai-results.ts`, `src/shared/contracts/project-docs.ts`,
  and related job contracts
- `src/web/pages/writing-page.tsx`
- `src/web/pages/ai-workspace-page.tsx`
- AI result/job governance integration and UI tests

**Acceptance criteria**

- AI result artifacts store safe provenance and scoped job references.
- Applying an AI result to a Notebook requires the current actor to own the
  Notebook and creates a new Notebook version only after confirmation.
- Applying an AI result to a Project Doc requires owner/editor ProjectMember
  authority and creates a Project Doc version only after confirmation.
- Project Doc Evidence Copilot suggestions remain local draft changes until the
  user explicitly saves the Project Doc.
- Job payloads, result artifacts, audit metadata, and browser DTOs omit raw
  provider payloads, raw secrets, private Notebook bodies, storage keys, and
  actor authority fields.

**Verification commands**

```bash
npm test -- --run tests/integration/job-governance.test.ts tests/integration/http-server-writing-docs.test.ts tests/ui/project-writer-flow.test.tsx tests/ui/ai-workspace-page.test.tsx
npm run typecheck
npm run build
```

Run full `npm test` because this task crosses jobs, audit, AI artifacts,
Notebook, Project Docs, and UI.

**Stop conditions**

- Any change would allow AI to write durable research objects without user
  confirmation.
- Product semantics for AI Workspace, result review, or suggestion acceptance are
  ambiguous.

---

### Task 6 — Home/Today continuation quality pass

**Purpose**

Improve Home and Today usefulness while keeping read-model authority on the
server. The browser should render server-classified next actions, continuation
items, review/attention, and empty states instead of deriving product truth from
local activity filters.

**Likely files / areas touched**

- `src/server/services/home-cockpit.service.ts`
- `src/server/services/today-continuation.service.ts`
- `src/server/routes/home-cockpit.routes.ts`
- `src/server/http-server.ts`
- `src/shared/contracts/home-cockpit.ts`
- `src/shared/contracts/today-continuation.ts`
- `src/web/pages/home-page.tsx`
- `src/web/pages/today-page.tsx`
- Home/Today integration and UI tests

**Acceptance criteria**

- `GET /api/home-cockpit` and `GET /api/today/continuation` derive actor from
  session and reject legacy identity/context query residue.
- Home project review/attention uses the same Project Workspace review DTO
  semantics and does not reimplement visibility rules in the browser.
- Today continuation prioritizes server-visible personal Library/Reader/Notebook
  facts, visible Project Workspace review, and governed job state without leaking
  private content across actors.
- Empty states and next-action copy are deterministic and truthful.
- Browser pages render the DTOs and do not reclassify local activity into
  authoritative recommendation state.

**Verification commands**

```bash
npm test -- --run tests/integration/http-server-home-cockpit.test.ts tests/integration/http-server-today-continuation.test.ts tests/ui/home-page.test.tsx tests/ui/workbench-navigation.test.tsx
npm run typecheck
npm run build
```

Run full `npm test` if the ranking/classification logic touches shared project,
library, reading, jobs, or workspace services.

**Stop conditions**

- The work requires product-ranking judgment that is not implied by the active
  plans.
- The UI needs a major temperament or layout decision beyond existing `静水流深`
  guidance.

---

### Task 7 — Project Docs block/reference editor hardening

**Purpose**

Strengthen the Notion-like document foundation without changing ownership
semantics. The same Jixia block grammar should support private Notebook and
shared Project Docs while preserving distinct authority boundaries.

**Likely files / areas touched**

- `src/shared/contracts/document-content.ts`
- `src/web/components/document-block-editor.tsx`
- `src/web/components/document-block-renderer.tsx`
- `src/web/pages/notebook-page.tsx`
- `src/web/pages/writing-page.tsx`
- `src/web/presenters/project-doc-presenter.ts`
- `src/server/services/notebooks.service.ts`
- `src/server/services/project-docs.service.ts`
- Notebook and Project Writer UI/integration tests

**Acceptance criteria**

- Structured blocks round-trip through Notebook and Project Doc saves without raw
  rich-editor runtime JSON.
- `citation`, `sourceExcerpt`, `paperReference`, and `aiSuggestion` blocks
  preserve `paperAssetId`, `libraryEntryId`, `readerExcerptId`, locator, and
  evidence metadata where authorized.
- Viewer Project Doc routes render structured blocks read-only and omit edit/save
  controls.
- Notebook remains private; no whole-Notebook push action appears in foreground
  Project Docs or Notebook UI.
- Document blocks reject actor/owner/project/scope/space/visibility authority
  fields before persistence.

**Verification commands**

```bash
npm test -- --run tests/ui/notebook-page.test.tsx tests/ui/project-writer-flow.test.tsx tests/integration/writing-versioning.test.ts tests/contracts/core-contracts.test.ts
npm run typecheck
npm run build
```

Run full `npm test` if shared document-content contracts or save/read service
normalization changes.

**Stop conditions**

- The task requires choosing a third-party editor runtime as durable schema.
- The task requires new collaborative editing, comments, or realtime behavior.
- The task changes Notebook/Project Docs ownership semantics.

---

### Task 8 — Operator current-host verification gate

**Purpose**

Keep the lab-hosted runtime reproducible as product behavior hardens. The current
host path should verify startup, health, durable SQLite/storage behavior,
credential key expectations, and persisted research loop state across restart.

**Likely files / areas touched**

- `docs/runbooks/native-demo-showcase.md`
- `README.md` and operator runtime docs if facts drift
- `.env.example`
- package scripts only if needed for a deterministic operator check
- Existing smoke/integration tests for runtime health and Trellis guardrails

**Acceptance criteria**

- Native Node startup path remains the required current-host gate.
- `/health` and `/api/health` contracts are documented and verified.
- Durable `JIXIA_DATABASE_URL`, `JIXIA_STORAGE_ROOT`, paper files, and
  `credentials.key` backup expectations are explicit.
- Restart verification confirms users, projects, library entries, Reader state,
  Notebook/Project Docs, jobs, audit, and file bytes remain consistent.
- Demo-only reset/showcase packaging remains downstream and is not confused with
  product truth on `main`.

**Verification commands**

```bash
npm run typecheck
npm run build
npm test -- --run tests/smoke/guardrails.test.ts
```

Run targeted runtime/manual checks described by the runbook. Run full `npm test`
if scripts, app startup, environment parsing, or runtime health behavior changes.

**Stop conditions**

- The task requires deployment choices beyond lab-hosted server-first operation.
- The task introduces public SaaS, multi-tenant billing, Kubernetes, offline sync,
  or alternate desktop-first packaging assumptions.

---

## 7. Recommended first next Trellis task

**Recommended task name:** `Project research loop invariant smoke test`

**Why this is next**

This is the highest-leverage low-risk task after this documentation task because
it proves the architecture that already exists instead of expanding surface area.
The active recovery plan defines the acceptance path as a real server-owned loop:
login, project, scoped library, Reader, private Notebook, shared Project Doc,
governed job, audit, and non-member denial. The README says most of those pieces
exist now. A focused invariant harness will either confirm the beta is coherent
or expose the narrowest next implementation gap.

It is also safe for autonomous Trellis execution because it should primarily add
tests. If it reveals bugs, fixes can be scoped to direct invariant repairs. If it
reveals missing product semantics, the stop policy requires asking the user
before proceeding.

**Suggested PRD one-liner**

Add a server-owned minimal research loop invariant test that verifies session
authority, ProjectMember-gated project access, scoped library adoption,
Reader-to-private-Notebook capture, Project Doc citation trace, governed project
jobs/audit, non-member denial, and absence of browser-unsafe storage/credential
fields.

---

## 8. Verification policy for future Trellis loops

Every Trellis implementation loop should select verification by impact.

### Default verification

Run targeted tests for the files/contracts changed, plus:

```bash
npm run typecheck
npm run build
```

### Run full `npm test` when any of these are true

- The task changes shared contracts used across browser/server boundaries.
- The task changes actor/session parsing, access control, or authorization.
- The task touches Prisma schema, migrations, repositories, app wiring, or
  runtime initializers.
- The task touches a cross-layer loop such as Search-to-Library, Project Library
  adoption, Reader-to-Notebook, Project Docs save/citation trace, jobs/audit, or
  Home/Today aggregate read models.
- The task changes UI flow and server API contracts in the same PR.
- Targeted failures indicate possible regression outside the immediate file set.

### Suggested verification mapping

- Contracts: `tests/contracts/core-contracts.test.ts`
- Schema/repository static guards: `tests/integration/prisma-schema.test.ts`
- Actor boundary: `tests/integration/http-server-actor-boundary.test.ts`
- Project API/workspace: `tests/integration/http-server-projects.test.ts`,
  `tests/integration/project-workspace-service.test.ts`
- Library/file/adoption: `tests/integration/library-import.test.ts`
- Reader evidence: `tests/integration/reading-evidence.test.ts`
- Notebook/Project Docs: `tests/integration/writing-versioning.test.ts`,
  `tests/integration/http-server-writing-docs.test.ts`
- Jobs/audit: `tests/integration/job-governance.test.ts`,
  `tests/integration/governance-audit.test.ts`
- Home/Today: `tests/integration/http-server-home-cockpit.test.ts`,
  `tests/integration/http-server-today-continuation.test.ts`
- Workbench UI: route/page tests under `tests/ui/`

### PR review and merge expectations

- Each loop creates one focused Trellis task and one draft PR.
- PR descriptions should name the invariant being hardened, affected boundaries,
  verification commands, and any stop-condition findings.
- Review should confirm that the implementation does not weaken server-first
  authority, privacy, or auditability.
- Merge only after required checks pass and the working tree contains no
  unrelated edits.
- All git operations in the PR phase must run with `GIT_MASTER=1`; Implement
  agents do not run manual commits or pushes.

---

## 9. Anti-patterns to avoid

- Fake project ids, document ids, entry ids, or governance spaces in production
  URLs or authenticated UI state.
- Treating `visibility`, legacy `spaceId`, route params, or browser presenter
  state as ownership truth.
- Using `SpaceMembership` as a substitute for `ProjectMember`.
- Browser/demo fallback data that hides server failure or empty states.
- Whole-Notebook push, send, promote, or one-click transfer into Project Docs as
  foreground product behavior.
- Project Docs citing a bare `PaperAsset` or personal Library source before
  target-project `LibraryEntry` adoption exists.
- AI suggestions/results automatically mutating Notebook or Project Doc versions.
- Raw provider keys, credential refs/secrets, job payloads, storage keys,
  checksums, `papers/...` paths, absolute paths, or `JIXIA_STORAGE_ROOT` in
  browser DTOs or business payloads.
- Building full global search, full AI Workspace, realtime collaborative editing,
  standalone discussion/chat, or object discussion before the server-owned
  recovery loop is hard.
- Reintroducing JSON state arrays as collaborative runtime authority.
- Persisting raw rich-editor runtime JSON as the public durable document contract
  instead of the Jixia-owned document block grammar.

---

## 10. How to use this plan in Trellis

For each loop:

1. Create exactly one Trellis task from the next roadmap item.
2. Copy the task-specific purpose, likely files, acceptance criteria,
   verification commands, and stop conditions into the task PRD/info.
3. Run implement, check, debug, and finish agents against that one task.
4. Create a draft PR through Trellis automation, using `GIT_MASTER=1` for git
   operations.
5. Review the PR against the invariants in this plan and the executable specs in
   `.trellis/spec/`.
6. Merge only if checks pass, the change is scoped, and no stop condition is
   open.
7. Continue to the next task unless user judgment is required.

This plan should be updated only when `docs/plans/design.md`, the active recovery
plan, or executable specs intentionally change the development baseline.
