# Jixia Long-Term MVP Development Plan

Date: 2026-06-10  
Status: Active long-term MVP closure plan  
Scope: Product, architecture, implementation sequencing, and verification strategy

## Purpose

This document turns the current design and codebase review into an executable long-term plan for taking Jixia from the integrated workbench beta to a complete MVP.

It sits between the product baseline and the Trellis task roadmap:

- `docs/plans/design.md` remains the target-state product baseline.
- `docs/plans/2026-05-03-jixia-project-first-recovery-plan.md` remains the recovery decision record that moved the scaffold back to a server-first, project-centered system.
- `docs/plans/2026-06-09-jixia-development-loop-plan.md` remains the near-term Trellis execution roadmap for the current recovery line.

This plan does not replace those documents. It states the long-term closure path: which invariants must remain fixed, which product loops must be completed, which implementation slices should happen first, and what evidence is required before calling the result an MVP.

## Core Judgment

Jixia is no longer an empty shell. The repository already contains a meaningful server-first workbench beta: real session boundaries, Prisma-backed domains, server-owned services, browser routes, shared transport contracts, personal and project research surfaces, Project Docs, Notebook capture, Reader evidence, governed AI result concepts, Home/Today surfaces, command search, and broad test coverage.

That is not the same as a complete MVP.

The missing work is not another pile of disconnected features. The missing work is closure: make the core research loop authoritative, permission-safe, persistent, traceable, and honest from browser to server to storage to audit trail.

The product kernel is:

```text
Discover literature
  -> keep personal sources
  -> read and capture evidence
  -> form private notes and Notebook judgment
  -> explicitly adopt sources into a Project
  -> collaborate in Project Docs with citation trace
  -> use AI only as governed draft/suggestion
  -> persist only after explicit user action
```

The architectural kernel is:

```text
Server authority first.
Space is governance.
Project is collaboration.
ScopeRef owns personal vs project boundaries.
ProjectMember gates shared work.
Notebook is private.
ProjectDoc is shared.
AI produces suggestions, not silent persistent truth.
```

## Current Implementation Baseline

The current codebase has enough real scaffolding to build from rather than restart:

- The server composes domain services through `JixiaApp` and same-origin `/api/*` routes.
- Authentication uses a real `jixia_session` boundary and server-derived actor context.
- Prisma schema coverage includes users, sessions, spaces, projects, memberships, library entries, paper assets, reading state, notebooks, project documents, AI/jobs, audit, and credential-related domains.
- Shared contracts include transport-safe primitives such as `ScopeRef`, `SessionUser`, `DocumentBlockDocument`, Reader annotation visibility, AI result status, library records, Notebook records, Project Docs records, and project records.
- Browser routes exist for Login, Home, Today, Search, Library, Reader, Notebook, Projects, project workspace, Writing/Project Docs, AI Workspace, and Settings/Spaces.
- Personal research flow exists in embryo: Search/import/upload to personal Library, Reader state, private notes, excerpts, Notebook capture.
- Project collaboration flow exists in embryo: Projects, project Library adoption, project Reader context, project comments, Project Docs writing, citation trace.
- Governed AI exists in embryo: AI workspace/session/context/result concepts, draft/apply/discard semantics, jobs, audit, credentials separation.
- Tests already cover contracts, integration, UI, smoke, and MVP-style routes.

The current weakness is not lack of object names. The weakness is ensuring the names are authoritative everywhere and that compatibility mirrors never become hidden permission inputs.

## MVP Definition

The MVP is complete when one lab team can use Jixia for a real project-centered literature-to-writing workflow without relying on fake browser state, undocumented fallback behavior, or manual database intervention.

A successful MVP walk should support this path:

1. A user logs in through the server-managed session boundary.
2. The user searches or imports a paper into a personal Library scope.
3. The user opens the Reader through a server-authorized file route.
4. The user creates private reading notes, generated insights, and excerpts.
5. The user captures selected evidence into a private Notebook.
6. The user creates or joins a Project through server-backed membership.
7. The user explicitly adopts a source into the Project Library scope.
8. Project members can read project-visible sources and project Reader context.
9. Project members can create, save, reopen, and view Project Docs.
10. Project Docs can cite project-visible sources and selected Reader evidence with browser-safe citation trace.
11. Non-members cannot access project Library entries, files, Reader context, Project Docs, AI jobs, or audit records.
12. AI can build a server-owned context pack and produce draft results.
13. AI results remain drafts until an authorized user explicitly applies or discards them.
14. Applied AI output carries source/provenance/audit information and never silently overwrites user-owned writing.
15. Home, Today, and Command Search help users find authorized work without inventing hidden authority.
16. Restarting the app preserves the same server-owned state.
17. Verification commands and targeted route tests pass cleanly.

## Non-Negotiable Invariants

### 1. Server authority is the source of truth

The browser is a terminal over server-owned state. It can request actions, but it does not own identity, permissions, files, jobs, credentials, audit records, source adoption, or persistent writing authority.

### 2. Space is governance, Project is collaboration

A `Space` can organize governance, settings, credentials, and audit context. A `Project` owns collaboration. Do not move collaboration semantics back into Space membership or Space-first navigation.

### 3. ScopeRef owns personal vs project boundaries

`ScopeRef = { type: "user"; id } | { type: "project"; id }` must remain the central ownership boundary for scoped resources. Legacy `spaceId` and `visibility` fields may remain compatibility mirrors, but they must not decide authority.

### 4. ProjectMember gates shared work

Project collaboration requires `ProjectMember`. Member roles can stay simple for the MVP, but member vs non-member must be unambiguous and enforced server-side.

### 5. PaperAsset is not ownership

`PaperAsset` is deduplicated source material. Ownership and access are expressed by scoped `LibraryEntry` adoption. Reusing a paper asset must not leak personal or project access across scopes.

### 6. Notebook and ProjectDoc share grammar, not semantics

`NotebookDocument` is private personal thinking. `ProjectDoc` is shared project writing. They may share `DocumentBlockDocument` grammar, but they do not share permission rules or persistence semantics.

### 7. AI is suggestion-first and explicit-apply only

AI may propose, summarize, rank, draft, and transform. It must not silently persist into Notebook or Project Docs. Every persistent AI write must be explicit, authorized at apply time, and auditable.

### 8. External discovery and internal command search are separate

External literature discovery finds papers. Command Search finds internal authorized Jixia objects. Mixing those concepts creates confusing authority and bad product behavior.

### 9. Runtime must be truthful

Empty states, failures, and missing setup must be visible. Browser fallback data must not hide server failures or create a fake demo path that contradicts production behavior.

## Long-Term Development Phases

### Phase 0 — Freeze MVP invariants

**Goal:** Make the MVP contract explicit so future work does not keep re-litigating product boundaries.

**Primary work:**

- Keep `docs/plans/design.md` as product baseline.
- Treat this document as the long-term MVP closure plan.
- Treat the 2026-06-09 Trellis plan as near-term execution.
- Document the invariants above in contributor-facing docs when implementation touches the related boundary.
- Avoid starting feature work that weakens server authority, `ScopeRef`, ProjectMember, Notebook privacy, ProjectDoc sharing, AI explicit apply, or citation trace.

**Acceptance criteria:**

- New implementation tasks can point to one clear invariant when reviewing permission, persistence, or AI behavior.
- Existing compatibility fields are documented as compatibility mirrors, not authority.
- Product loop definitions distinguish personal research from project collaboration.

**Verification:**

- Documentation review against `design.md`, the recovery plan, the Trellis execution roadmap, and README.
- No runtime test is required for documentation-only invariant clarification, but any code changes made alongside it must run the smallest relevant verification.

### Phase 1 — Harden authority, scope, and permissions

**Goal:** Eliminate ad-hoc access checks before building more surface area.

**Primary work:**

- Centralize permission helpers around actor, scope, resource, and action.
- Make all service writes derive actor context server-side.
- Ensure Library, Reader, Notebook, Project Docs, AI Results, files, jobs, audit, and credentials all pass through consistent authorization checks.
- Make `ScopeRef` and `ProjectMember` the dominant access path for project resources.
- Keep `LibraryEntryVisibility` and legacy `spaceId` as compatibility outputs only.

**Candidate policy helpers:**

```text
resolveResourceScope(resource)
resolveActorPermission(actor, scope)
canReadLibraryEntry(actor, entry)
canAdoptLibraryEntryToProject(actor, entry, project)
canReadProjectReaderContext(actor, project)
canWriteProjectDoc(actor, projectDoc)
canApplyAiResult(actor, result, target)
canReadPaperFile(actor, libraryEntry)
```

The exact names can differ. The important part is the data flow: resolve scope first, resolve actor permission second, then authorize the action.

**Acceptance criteria:**

- Non-members cannot read, write, adopt, cite, apply, or download project resources.
- Users cannot forge access by sending `spaceId`, `visibility`, route params, or client-side actor fields.
- Personal Library entries do not become project-visible until explicit adoption.
- Project Library entries do not leak to users outside membership.
- AI apply rechecks permissions at apply time, not only when the draft was created.

**Verification:**

- Targeted integration tests for unauthenticated, authenticated non-member, member, and owner/editor paths.
- Tests for forged `spaceId` and `visibility` inputs.
- Tests for file access through `GET|HEAD /api/library/:entryId/file`.
- Tests for AI result apply/discard authorization.
- Run `npm run typecheck` and the smallest relevant integration/UI test set; run `npm test` before claiming the phase complete.

### Phase 2 — Close the personal research loop

**Goal:** Make personal research useful and persistent before forcing collaboration on top of it.

**Primary work:**

- Stabilize external discovery/search to personal Library import.
- Preserve upload/import behavior through server-owned files and deduplicated `PaperAsset` records.
- Make Reader state, private notes, generated insights, excerpts, and key information durable across restart.
- Make Notebook capture from Reader evidence explicit, stable, and reloadable.
- Preserve evidence references in Notebook blocks as structured data, not only rendered text.
- Ensure personal routes are shorthand over authenticated server-owned scope, not browser-owned state.

**Acceptance criteria:**

- A user can import or upload a paper, open Reader, add notes/excerpts, capture selected evidence into Notebook, refresh/restart, and see the same state.
- Another user cannot read the private Notebook or private notes.
- Reader file access remains server-authorized and does not expose storage paths or checksums.
- External discovery failures are truthful and do not become internal command-search results.

**Verification:**

- Integration tests for import/upload, `PaperAsset` reuse, scoped Library entries, Reader persistence, Notebook capture, and privacy denial.
- UI tests for Search/Library/Reader/Notebook path.
- `npm run typecheck`, targeted tests, and `npm test` before phase completion.

### Phase 3 — Close the project collaboration loop

**Goal:** Make Project the foreground collaboration unit promised by the design.

**Primary work:**

- Stabilize Project create/list/open membership behavior.
- Make source adoption from personal Library into Project Library explicit and auditable.
- Make project Reader context show only project-visible sources and project-visible collaboration artifacts.
- Keep personal private notes distinct from project comments or project evidence.
- Make Project Docs create/save/reopen durable and ProjectMember-gated.
- Ensure project writing can cite adopted sources and selected Reader evidence.

**Acceptance criteria:**

- Alice can create a Project and adopt a personal source into it.
- Bob as ProjectMember can see the project source and shared Project Doc.
- Charlie as non-member is denied project source, file, Reader project context, Project Doc, AI job, and audit access.
- Personal notes remain private even when the same paper asset is adopted into a Project.
- Project Docs preserve citation/source references across save/reopen.

**Verification:**

- Multi-actor integration tests for owner/member/non-member flows.
- UI tests for Project Library adoption, project Reader context, Project Docs create/reopen/save, and citation trace visibility.
- `npm run typecheck`, targeted integration/UI tests, `npm test`, and `npm run build` before calling the phase complete.

### Phase 4 — Harden document blocks, references, and citation trace

**Goal:** Keep the editor small but make the research-writing data model strong.

**Primary work:**

- Stabilize the MVP `DocumentBlockDocument` grammar used by Notebook and Project Docs.
- Represent citations, source references, excerpts, and applied AI provenance as structured block metadata.
- Keep rendering browser-safe: no storage paths, raw credential references, or private source leakage.
- Enforce read-only viewer behavior server-side as well as in UI.
- Keep Notebook save semantics and ProjectDoc save semantics separate even when they share block grammar.

**Acceptance criteria:**

- A Project Doc can contain paragraphs, headings, evidence-linked blocks, citation references, and applied-AI provenance without losing structure on save/reopen.
- A Notebook can contain private evidence-linked blocks without becoming project-visible.
- A read-only user or non-member cannot mutate Project Docs through direct API calls.
- Citation trace renders only authorized and browser-safe metadata.

**Verification:**

- Contract tests for document block parsing/serialization.
- Integration tests for Project Doc save/reopen/citation trace/read-only mutation denial.
- UI tests for editor/viewer behavior and reference preservation.
- `npm run typecheck` and targeted tests for every grammar/contract change.

### Phase 5 — Harden AI Workspace and AI Results explicit apply

**Goal:** Make AI useful without making it the author of record.

**Primary work:**

- Build AI context packs server-side from authorized personal/project sources.
- Store AI runs as jobs/events/results with explicit scope and audit trail.
- Keep AI results in `draft` until an authorized user applies or discards them.
- Apply only to authorized targets: private Notebook or ProjectMember-gated Project Doc.
- Preserve source/provenance and generated/applied markers.
- Ensure provider credentials are referenced securely and never appear in business payloads or browser output.

**Acceptance criteria:**

- AI can generate a draft from authorized context without mutating persistent writing.
- Applying a draft requires explicit user action and rechecks target permissions.
- Discarding a draft leaves no writing mutation.
- Applied AI text is distinguishable from ordinary user-authored content when needed for provenance.
- Audit/job records capture critical side effects without exposing credentials.

**Verification:**

- Integration tests for context-pack authorization, draft creation, apply/discard paths, permission recheck, and audit events.
- UI tests for explicit apply affordance and no silent mutation.
- Secret-safety review for browser payloads and persisted records.
- `npm run typecheck`, targeted tests, `npm test`.

### Phase 6 — Productize Home, Today, and Command Search

**Goal:** Make navigation and continuation useful only after the authoritative loops are reliable.

**Primary work:**

- Make Home a server-backed summary of authorized personal and project work.
- Make Today restore real research context rather than demo state.
- Make Command Search permission-filtered over internal Jixia objects.
- Keep Command Search separate from external literature discovery.
- Make empty/error states truthful and actionable.

**Acceptance criteria:**

- Home shows current work without leaking other users' project data.
- Today can return users to recent Library, Reader, Notebook, Project, Project Doc, or AI result contexts that they are authorized to access.
- Command Search never returns unauthorized objects and never masquerades as PubMed or external search.
- The UI does not show shell affordances that imply unsupported server behavior.

**Verification:**

- Read-model integration tests for Home/Today/Command Search.
- Permission-filtering tests for internal search results.
- UI tests for empty/error/loading states and navigation correctness.

### Phase 7 — Harden operator, deployment, storage, audit, and runtime safety

**Goal:** Make the MVP operable by a lab team on the current-host path.

**Primary work:**

- Keep native/server deployment path documented and truthful.
- Ensure `JIXIA_STORAGE_ROOT`, database URL handling, file storage, and static frontend serving remain explicit.
- Keep credential authority bootstrapping separate from business payloads.
- Audit critical side effects: login/session-sensitive actions, source adoption, Project Doc writes, AI run/apply/discard, file access where appropriate, settings/credential changes.
- Keep runbooks aligned with real commands and failure modes.

**Acceptance criteria:**

- A clean checkout can follow documented setup/runbook steps to reach the current-host MVP path.
- Restart preserves database-backed state and server-owned files.
- No secret, raw provider key, storage path, or private checksum appears in source, browser payloads, screenshots, tests, or docs.
- Audit records exist for security-relevant actions and can be reviewed by authorized operators.

**Verification:**

- `npm run typecheck`
- `npm test`
- `npm run build`
- Manual current-host runbook pass when runtime/operator behavior changes.
- Secret scan by review for changed files and browser-visible payloads.

### Phase 8 — Beta-to-MVP cleanup and compatibility retirement

**Goal:** Remove or isolate the scaffolding that can confuse users or future contributors.

**Primary work:**

- Remove fake UI state and fallback data that hide server failures.
- Keep legacy `/spaces/...` or writing compatibility routes only where needed and clearly mapped to project-first semantics.
- Delete compatibility paths that no longer have tests or product value.
- Ensure deprecated `LibraryEntryVisibility` and legacy `spaceId` cannot become hidden write or read authority.
- Align README, runbooks, design docs, and tests with the MVP behavior.

**Acceptance criteria:**

- Every foreground route has an authoritative server-backed reason to exist.
- Compatibility routes are documented, tested, or removed.
- Users cannot complete a demo path that would fail after restart or with a second browser.
- README and runbooks no longer describe placeholder behavior as product behavior.

**Verification:**

- Route-level UI tests for foreground MVP paths.
- Integration tests for compatibility route mapping where retained.
- `npm run typecheck`, `npm test`, `npm run build` before MVP release labeling.

## Recommended First Implementation Slices

The next implementation work should not start with more editor chrome or larger AI features. It should start with the authority layer.

### Slice 1 — ScopeRef and ProjectMember access assertions

**Why first:** If this boundary is wrong, every feature built on top leaks data or forces special-case patches later.

**Primary files likely involved:**

- `src/shared/contracts/projects.ts`
- `src/server/auth/actor.ts`
- `src/server/policies/access-policy.ts`
- `src/server/services/library.service.ts`
- `src/server/services/reading.service.ts`
- `src/server/services/notebooks.service.ts`
- `src/server/services/project-docs.service.ts`
- `src/server/services/ai-results.service.ts`
- `tests/integration/`

**Expected result:** A focused PR proving that server-side actor, scope, membership, and resource permission logic dominates legacy compatibility fields.

### Slice 2 — Personal research loop end-to-end

**Why second:** Personal reading and note capture are the foundation for project knowledge.

**Expected result:** A single repeatable test path for import/upload -> personal Library -> Reader -> notes/excerpts -> Notebook capture -> restart-safe reload.

### Slice 3 — Project source adoption and Project Doc citation trace

**Why third:** This closes the product's core collaboration promise.

**Expected result:** A multi-actor path for explicit source adoption -> project Reader context -> Project Doc citation/reference preservation -> member allowed/non-member denied.

### Slice 4 — Governed AI explicit apply

**Why fourth:** AI should operate on a stable permission and citation substrate, not define it.

**Expected result:** Draft-only AI result creation with explicit authorized apply/discard, audit, and source/provenance preservation.

## Anti-Patterns to Avoid

Do not build these before the MVP boundary is solid:

- A large Notion clone editor.
- ELN/LIMS experiment execution.
- Automated research agents that persist work without user confirmation.
- Enterprise governance fantasy beyond simple, correct ProjectMember authorization.
- Browser-side permission authority.
- Space-first collaboration resurfacing under new names.
- Mixed external literature discovery and internal command search.
- Hidden use of `spaceId` or `visibility` as authority.
- Demo fallback paths that survive only in one browser session.
- Raw provider keys, storage paths, or private file metadata in browser-facing payloads.

## Stop-and-Ask Conditions

Stop and update the relevant design/plan before continuing if a change would:

- Alter the meaning of Space, Project, ScopeRef, ProjectMember, Notebook, ProjectDoc, PaperAsset, LibraryEntry, or AI Result.
- Let AI write persistent Notebook or ProjectDoc content without explicit user confirmation.
- Make browser state authoritative over server state.
- Make `visibility`, `spaceId`, route params, or client actor IDs decide permission.
- Expose raw storage keys, file paths, provider keys, or secret-bearing payloads.
- Collapse personal and project scopes for convenience.
- Contradict `docs/plans/design.md`, the recovery plan, this plan, or the Trellis execution roadmap.

## MVP Release Gate

Jixia can be called MVP-ready when all of the following are true:

- The login/session boundary is server-owned and tested.
- Personal Library import/upload, Reader, private notes, excerpts, and Notebook capture persist across restart.
- Project creation, membership, source adoption, project Reader context, Project Docs, and citation trace persist across restart.
- Member/non-member authorization is tested across project Library, files, Reader context, Project Docs, AI jobs/results, and audit-sensitive routes.
- AI outputs are draft-first, explicit-apply only, permission-rechecked, and auditable.
- Home, Today, and Command Search show only authorized server-backed objects.
- Compatibility routes and fields are either isolated with tests or removed.
- Runtime/operator docs describe the real current-host path.
- `npm run typecheck`, `npm test`, and `npm run build` pass on the MVP branch.

## Verification Discipline

Every meaningful implementation phase must carry verification evidence. The default chain is:

```bash
npm run typecheck
npm test
npm run build
```

Use smaller targeted commands during development, but do not claim a phase is complete until the relevant targeted tests and broader verification are clean.

Minimum targeted coverage for MVP closure should include:

- Unauthenticated and non-member denial tests.
- Forged `spaceId` / `visibility` / actor input tests.
- Personal import/upload -> Library -> Reader -> Notebook capture tests.
- Project source adoption -> project Reader -> Project Docs citation trace tests.
- ProjectMember owner/editor/viewer/non-member tests.
- AI draft -> explicit apply/discard -> audit/source trace tests.
- Server-owned file access tests.
- Home/Today/Command Search permission-filtering tests.
- Browser UI tests for truthful empty/error/loading states.

## Final Direction

The correct next move is boring and important: harden authority first, then close loops, then polish surfaces.

If the data structures are right, the code gets simpler. If the data structures are wrong, every new feature becomes another conditional branch around a bad boundary.

For Jixia, the data structures are already visible:

```text
Actor -> Session -> ScopeRef -> ProjectMember -> Resource -> Audit
```

Build around that. Do not build around UI convenience, legacy visibility strings, or demo routes.
