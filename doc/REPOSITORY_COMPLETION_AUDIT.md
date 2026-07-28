# Jixia Repository Completion Audit

**Audit date:** 2026-07-28
**Audited branch:** `task/mature-streaming-ai-chat-provider-settings`
**Committed baseline:** `1b80c66f46aa4dae7772e936fc8ec9f00fd0eecb`
**Product baselines:** `doc/MVP_rule.md`, `doc/Design.md`,
`doc/Jixia_Implementation_Program.md`, Trellis task records, committed source,
and committed verification records

## Executive Verdict

Task25 Phase 1 and Phase 2 are complete at the audited baseline. The repository
implements the fourth target-state delivery step: server-owned external
literature Search, DOI/import, personal and Project Library, provenance,
authorization, and responsive browser journeys. The Task25 delivery was
validated before this audit and pushed as 26 dependency-ordered commits.

The repository is not complete against the full target state in
`doc/Design.md`. Delivery steps 5-8 remain partial, placeholder, or
unimplemented. This is expected after Task25 because its locked scope explicitly
excluded Reader, evidence authoring, citations, Notebook synthesis, and later
collaboration surfaces.

The original MVP is also not fully release-compliant despite broad feature and
test coverage. Source inspection found two release-significant contract gaps:

1. Document hard delete removes database records but does not delete the
   associated object-storage files.
2. Required governance audit events and hard-delete audit metadata are
   incomplete, and AI configuration audit persistence is best-effort.

These are pre-existing repository gaps, not regressions introduced by Task25.

## Scope and Method

The audit reconciled five evidence layers:

1. Locked product rules in `doc/MVP_rule.md`.
2. Target-state responsibilities in `doc/Design.md` and the eight-step sequence
   in `doc/Jixia_Implementation_Program.md:32`.
3. Trellis task status, PRD, acceptance, and manual-review records.
4. Committed routes, services, schemas, UI surfaces, and tests.
5. Verification evidence recorded in committed task files and the completed
   Task25 delivery session.

The audit did not treat unchecked boxes in `doc/MVP_implement.md` as proof of
missing behavior. That document is a historical implementation plan and
contains stale unchecked review items after later Trellis tasks implemented or
superseded the work.

The audit also excludes four protected, unrelated worktree modifications from
all committed-HEAD conclusions:

- `apps/web/e2e/attachment-upload.spec.ts`
- `apps/web/e2e/responsive-workbench.spec.ts`
- `apps/web/src/features/documents/editor/JixiaEditor.tsx`
- `apps/web/src/features/layout/workbench.css`

Untracked `.omo/` and `.playwright-mcp/` runtime artifacts are not product
source or durable committed evidence.

## Status Vocabulary

| Status | Meaning |
| --- | --- |
| **Complete** | The committed implementation satisfies the stated slice and has relevant verification evidence. |
| **Partial** | Material behavior exists, but a required contract, surface, or operational property is missing. |
| **Foundation only** | Contracts or persistence exist without the user-facing or API workflow that makes them usable. |
| **Placeholder** | A deliberate routed shell communicates that the capability is deferred. |
| **Unimplemented** | No usable route, API, model, or surface was found for the promised capability. |
| **Missing evidence** | Behavior may exist, but committed or reproducible verification is insufficient. |
| **Superseded** | A failed or partial historical task was replaced by a later accepted implementation. |

## Original MVP Compliance

| Capability | Status | Source-backed assessment |
| --- | --- | --- |
| Authentication and sessions | **Complete, with audit gap** | Password/session and invitation workflows are implemented and covered by focused tests. Invitation creation and acceptance in `apps/api/src/modules/auth/service.ts:187` have no required governance audit write. |
| Projects and membership authorization | **Complete for MVP** | Project and membership services enforce authenticated role-based access. Member-management UI belongs to target-state step 7 rather than the original MVP. |
| Documents, drafts, and revisions | **Partial** | Draft/revision and authorized document workflows are implemented. Hard delete at `apps/api/src/modules/documents/document.service.ts:814` removes relational records but never calls the existing `deleteObject` capability in `apps/api/src/modules/attachments/object-storage.ts:44`, violating `doc/MVP_rule.md:207`. |
| Attachment upload and private download | **Partial** | Server-issued intent, direct credentialless upload, confirmation, signed download, and cleanup jobs exist. Upload confirmation at `apps/api/src/modules/attachments/attachment.service.ts:587` has no required audit event; its tests currently expect zero attachment audit events. Hard-deleted document attachments can remain in object storage. |
| Private AI configuration and conversation | **Partial** | Credentials remain server-owned and encrypted; provider discovery, SSE chat, cancellation, bounded document context, aggregate usage, and no-writeback behavior exist. Configuration audit failures are suppressed at `apps/api/src/modules/ai/ai-config.service.ts:1585`. Conversation run registries are process-local Maps at `apps/api/src/modules/ai/ai-conversation.service.ts:99`, so cancellation/completed lookup is not restart- or replica-safe. |
| Governance audit | **Partial** | Metadata-only audit storage, authorization, filtering, and pagination exist. Required invitation and attachment-confirmation events are absent. Hard-delete metadata at `apps/api/src/modules/documents/document.service.ts:848` omits locked fields `title`, `type`, `deletedBy`, and `deletedAt` required by `doc/MVP_rule.md:209`. Generic listing at `apps/api/src/modules/audit/audit.service.ts:178` has no `spaceId` predicate; this is latent under the one-space-per-deployment MVP. |
| Worker cleanup and retention | **Complete behavior, missing deployment evidence** | `apps/worker/src/index.ts:264` wires cleanup jobs and shutdown handling, with scheduler and cleanup tests. No committed deployed-worker/process/database smoke record was found. |

### MVP Release Decision

The repository should not be labeled fully compliant with the locked MVP rules
until object-storage hard deletion and required governance audit behavior are
fixed and tested. Other original-MVP capabilities are substantially present.

## Target-State Delivery Matrix

The authoritative delivery sequence is defined in
`doc/Jixia_Implementation_Program.md:32`.

| Step | Delivery slice | Status | Assessment |
| --- | --- | --- | --- |
| 1 | Workbench foundation, bilingual chrome, responsive geometry | **Complete** | Task24a records accepted responsive workbench behavior, bilingual navigation, document/Copilot geometry, and browser checks. Root `DESIGN.md` remains the Task25 visual contract. |
| 2 | Provider connection and capability-discovery UX | **Complete; Task21f superseded** | Task21f's rejected presentation remains historical. Task24b records the accepted connection-first replacement. Server-owned provider validation, discovery, reconciliation, secret-safe DTOs, and the settings UI are implemented. |
| 3 | Literature/source/evidence/citation domain contracts | **Complete as foundation** | Shared contracts and PostgreSQL models cover literature, source revisions, annotations, excerpts, evidence, Notebook projections, and citation occurrences. Foundation completion does not imply Reader or evidence-authoring completion. |
| 4 | External Search, DOI/import, and Library | **Complete** | Task25 implements server-owned OpenAlex/Crossref/PubMed discovery, enrichment, deterministic pagination, idempotent import/retry, personal/Project Library, provenance/conflicts, authorization, localization, and responsive browser flows. The program explicitly records this boundary at `doc/Jixia_Implementation_Program.md:45`. |
| 5 | Reader and evidence-to-Project-Doc | **Unimplemented; foundation only** | No Reader route exists in `apps/web/src/app/app-route.ts`. Evidence/annotation/excerpt/citation contracts and models exist, but no Reader authoring API/UI, stable source-selection workflow, document insertion flow, or citation-anchor workflow exists. Task25 excludes these at `doc/MVP_rule.md:402`. |
| 6 | Notebook synthesis and source-grounded Copilot | **Partial** | Notebook combines private documents with personal Literature. It has no evidence reconciliation, synthesis generation, or citation workflow. Copilot context is a bounded current-document snapshot; selected-block context is explicitly absent at `apps/web/src/features/documents/documentCopilotContext.ts:79`, and Literature/Evidence context is not implemented. |
| 7 | Project collaboration, members, discussions, activity, audit | **Partial** | Project metadata, Project Docs, Project Literature, member APIs, and audit-listing API exist. No member-management UI, Discussion model/API/UI, object-attached discussion flow, project activity feed, or user-facing audit surface was found. The activity rail remains placeholder copy. |
| 8 | Home, global command search, operational polish, full verification | **Placeholder / unimplemented / missing evidence** | Home renders `DeferredSurface` in `apps/web/src/app/App.tsx:244`. `/search` is external literature discovery, not internal command/object search. No complete target-state verification exists for steps 5-8. |

## Prioritized Gaps

### P0: Required Before Claiming Locked-MVP Compliance

#### P0.1 Delete object-storage data during document hard delete

- **Contract:** `doc/MVP_rule.md:207` requires database and object-storage
  deletion.
- **Current behavior:** `document.service.ts:814` deletes attachment rows and
  document records inside a transaction but does not call
  `ObjectStorage.deleteObject`.
- **Risk:** private user files become orphaned, retention behavior diverges from
  product claims, and tests provide false confidence by checking only database
  deletion.
- **Required closure:** define failure semantics, delete every associated
  storage key, and add storage-aware service plus PostgreSQL/integration tests.

#### P0.2 Complete mandatory governance audit coverage

- Add invitation-created and invitation-accepted events to auth workflows.
- Add attachment-upload-confirmed and applicable attachment-deleted events.
- Make hard-delete metadata match the locked allowlist: `documentId`, `title`,
  `type`, owner/project identity, `deletedBy`, and `deletedAt`.
- Decide and implement durable semantics for important AI configuration audits.
  A required governance event must not silently disappear after the mutation is
  reported successful.

### P1: Required for Operational Confidence

#### P1.1 Make AI runs replica- and restart-safe

`activeConversationRuns` and `completedConversationRuns` are module-level Maps.
There is no durable run/event model in `packages/db/prisma/schema.prisma`, no
cross-replica cancellation coordination, and no completed-run eviction. Either
implement the stronger Task18.8 durable run contract or explicitly lock the
single-process limitation and add bounded TTL cleanup.

#### P1.2 Make Task25 browser evidence self-contained

`apps/web/e2e/literature.spec.ts:13` hard-codes screenshot output under the
untracked `.omo/evidence/task25-phase2-discovery-library/task-15-browser/`
directory. A fresh clone does not contain that parent. The test must create its
output directory or use a tracked/test-runner-managed output path.

#### P1.3 Close real-input editor evidence gaps

Committed Playwright coverage constructs synthetic clipboard and drag events.
It does not prove real OS clipboard paste or file-manager drag/drop in Notebook
and Project documents. Record a targeted real-origin manual gate before using
those interactions as release claims. The uncommitted `useResolveUrl` attachment
renderer repair is excluded from this baseline.

#### P1.4 Add runtime smoke evidence

Fixture Playwright uses the local fixture API and Vite, so it does not prove the
real API/PostgreSQL path. Add bounded smoke checks for API + restricted runtime
database identity, worker startup/cleanup, and at least one complete real-origin
user journey.

#### P1.5 Triage dependency alerts

The Task25 push reported 29 default-branch dependency alerts: 1 critical,
8 high, 17 moderate, and 3 low. Known transitive advisories include
`fast-uri@3.1.2` and `find-my-way@9.6.0`. This audit does not claim
exploitability; ownership, reachability, upgrade path, and accepted-risk records
are still required.

### P2: Target-State Roadmap

1. Build Reader around a selected Literature/source revision with stable
   annotations, excerpts, and evidence authorization.
2. Deliver the evidence-to-Project-Doc insertion and citation-occurrence slice.
3. Extend Notebook and Copilot to explicitly selected evidence and literature
   context while preserving bounded server-owned context.
4. Add Project Overview collaboration summaries, member management UI,
   object-attached discussions, activity, and audit surfaces.
5. Build Home's daily cockpit and a separate internal global command/object
   search.
6. Add milestone-specific package and Playwright gates, then run full
   target-state verification.

## Trellis Status Interpretation

The repository contains historical failed and partial tasks that should not be
read as a flat list of current defects:

- The Task20 editor sequence records repeated failed manual reviews while the
  team moved from custom editor behavior to BlockNote. Task20l and Task20m are
  the accepted attachment-chrome and document visual baselines; Task20r records
  the engine decision. Earlier failures remain useful history, while real OS
  paste/drop evidence remains open.
- Task21f is archived as a failed provider presentation. Task24b is its accepted
  connection-first successor and is the current implementation baseline.
- Task25 Phase 1 and Phase 2 are marked finished. Phase 1's PRD retains stale
  unchecked verification boxes; Phase 2's strongest F1-F4 command logs and
  screenshots are local `.omo/evidence` artifacts rather than committed
  records.
- `doc/MVP_implement.md` is historical planning context, not the authoritative
  status dashboard. Its unchecked items must be reconciled against later
  Trellis records and source before classification.

## Verification and Confidence

| Evidence | Result | Confidence boundary |
| --- | --- | --- |
| Task25 type check | Passed | Full workspace type surface at delivery time. |
| Task25 unit/package tests | Shared 15, DB 45, API 630, web 126, worker 15 passed | Broad deterministic coverage; some original-MVP services use in-memory repositories or mocked adapters. |
| Task25 PostgreSQL suites | DB 119 and API 46 passed | Real PostgreSQL literature/deployment boundary; not a full live product journey. |
| Task25 build | Passed | Production compilation/bundling; Vite reported a main chunk over 500 kB. |
| Task25 Playwright | Fixture policy 3/3 and Chromium 20/20 passed | Fixture API + Vite only; no live providers and no real API/PostgreSQL browser path. |
| Focused provider/discovery boundaries | 24 passed | Server adapter and boundary behavior. |
| Task25 review lanes | Five independent reviews passed | Goal, quality, security, QA, and context review at delivery time. |
| Focused original-MVP audit tests | API 57 and worker 15 passed | Confirms tested behavior but does not cover the hard-delete storage omission or missing audit events. |
| Committed Task24a/24b records | Passed manual/browser/package reviews | Strong committed records for workbench and provider slices. |
| Steps 5-8 | Missing comprehensive evidence | Capabilities are partial, placeholder, or unimplemented. |

No large suite was rerun solely for this documentation audit. Task25's delivery
checks were already green before the audited baseline was pushed, and this audit
changes no runtime source. The source findings above require new regression
tests when they are fixed.

## Release Recommendations

1. Treat `1b80c66f` as the completed Task25 / delivery-step-4 baseline.
2. Do not advertise full locked-MVP compliance until both P0 groups are fixed
   and tested.
3. Close P1 reproducibility and runtime gaps before an invited-beta readiness
   declaration.
4. Start target-state work at step 5 Reader/evidence selection because steps
   6-8 depend on stable evidence and citation semantics.
5. Preserve server authorization, private-by-default ownership, bounded AI
   context, controlled egress, and explicit user confirmation at every later
   milestone, as required by `doc/Jixia_Implementation_Program.md:43`.
