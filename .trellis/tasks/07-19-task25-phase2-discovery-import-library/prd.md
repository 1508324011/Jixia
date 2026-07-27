# Task25 Phase 2 Discovery Import Library

## Goal

Deliver the approved Task 25 Phase 2 literature workflow end to end: authenticated users can search OpenAlex, Crossref, and PubMed; import a server-refetched canonical record into a personal or project Library; explicitly retry failed imports; inspect typed provenance and conflicts; and browse the same Literature records from Search, Library, Notebook, and Project surfaces.

## Requirements

- Treat `.omo/plans/task25-phase2-discovery-library.md` as the decision-complete implementation plan and source of truth for todo dependencies, acceptance checks, evidence paths, and F1-F4 review.
- Keep discovery structurally read-only. Search may depend on provider adapters and a cursor codec, but never on a Literature repository, audit writer, or persistence collaborator.
- Use OpenAlex, Crossref, and PubMed as search and import-seed providers. Use Unpaywall and PMC OA only for DOI/PMCID metadata enrichment.
- Keep all provider endpoints, authentication, headers, redirect policy, retry policy, deadlines, public-address validation, response-size limits, and schemas server-owned. Missing provider configuration disables that adapter without blocking unrelated API startup.
- Accept imports only as a provider seed identity, target personal/project scope, and actor-scoped UUID `Idempotency-Key`. Refetch provider metadata server-side and never trust client-supplied canonical metadata.
- Exact-deduplicate and route by canonical DOI first, then exact provider identity. Apply deduplication only inside the target scope. Never fuzzy-match, auto-merge, or silently choose between contradictory identities.
- Persist provider observations only as typed, provenance-linked scalar or relational Assertions. Do not persist provider-native payloads, full text, source files, rendered citations, or generic JSON assertion values.
- Make import admission/finalization durable and race-safe through operation leases, attempt compare-and-set, explicit retry, exact identity claims, one final transaction, and metadata-only audit events.
- Preserve Phase 1 append behavior and the intentionally dirty Phase 1/2 worktree. Phase 2 changes are additive; do not rewrite the Phase 1 migration or revert unrelated changes.
- Enforce personal ownership and explicit project membership in the API. ProjectOwner and ProjectEditor may import/retry; ProjectViewer may read but receives 403 for mutation; inaccessible resources return 404.
- Implement signed bounded cursors, deterministic exact merge/ranking, partial-provider status, an accepted per-page limit of 3-20 with default 20, and the locked five-page/100-identity discovery limits.
- Implement authorized personal/project Library listing and typed detail with current values, complete assertion history, provenance, repeated-equal corroboration, and conflicts.
- Replace Search and Library placeholders and compose independent Literature panels into Notebook and Project detail without merging document and Literature state or adding browser-side permission logic.
- Cover provider behavior with fixtures only. Do not contact live providers from automated tests or follow OA resource pointers.
- Provider-native response fragments, credentials, request headers, signed URLs, prompt-like provider metadata, and full text are forbidden from DTOs and browser state. Normalized query text, canonical DOI, and exact provider source identities are permitted only in authenticated transport DTOs and transient in-memory UI state required to render discovery and submit a server-refetched import seed; they must never enter logs, audit metadata, browser persistence, or untyped database payload columns. Durable DOI/provider identities may exist only in their typed canonical assertion and identity columns.
- Update `doc/MVP_rule.md`, `doc/MVP_implement.md`, and `doc/Jixia_Implementation_Program.md` to match shipped behavior and explicit non-goals.

## Acceptance Criteria

- [x] Closed shared contracts cover discovery, imports, structured assertions, libraries, and provider statuses without widening the Phase 1 manual append input or exposing raw provider data.
- [x] PostgreSQL schema, migration, rollback, triggers, structured child tables, exact identity claims, and ImportOperation constraints pass unit and live PostgreSQL invariant/race tests.
- [x] Provider transport/config/cursor infrastructure enforces fixed origins, bounded retries/deadlines/rates/body size, redirect and private-address rejection, strict JSON/XML parsing, and sanitized failures.
- [x] OpenAlex, Crossref, PubMed/PMC, and Unpaywall provider adapters pass independent adversarial fixture review and return normalized typed records only.
- [x] Discovery route calls every configured search provider on a new search, exact-merges duplicates, ranks deterministically, returns partial status, paginates with authenticated bounded cursors, and performs no persistence/audit writes.
- [x] Import create/get/retry routes refetch seeds, apply optional enrichment, converge same-scope races, separate cross-scope records, reject identity conflicts, preserve complete assertion batches, and expose durable terminal operation state.
- [x] Library list/detail routes enforce personal/project authorization, signed keyset pagination, transport-safe summaries, typed provenance/conflicts, and fail-closed malformed-state handling.
- [x] Search, Library, Notebook, and Project UI cover loading, partial, empty, import progress, failure, explicit retry, inaccessible, provenance, and conflict states at desktop and 375px without overlap or console errors.
- [x] Cross-provider API/PostgreSQL fixture tests and Playwright journeys prove the complete personal and project workflow without live provider traffic or raw payload persistence.
- [x] Required documentation agrees on provider roles, server credentials, exact dedupe/import guarantees, authorization/audit exclusions, migration behavior, UI ownership, and non-goals.
- [x] Final F1 plan-compliance, F2 code/security, F3 real HTTP/browser manual QA, and F4 scope/full-gate reviews all approve with evidence under `.omo/evidence/task25-phase2-discovery-library/`.
- [x] `pnpm db:validate`, `pnpm db:generate`, `pnpm type-check`, `pnpm test`, `pnpm test:postgres`, `pnpm build`, and `pnpm --filter @jixia/web e2e` exit 0, or any proven pre-existing external failure is isolated and resolved by its owning planned todo before final approval.

## Technical Notes

- The controlling product rules are `doc/MVP_rule.md` and the approved `.omo` plan. Shared DTOs are transport-only; API code owns authorization and business decisions; PostgreSQL owns durable aggregate and race invariants.
- Search cursor state is HMAC-authenticated and bounded. Import operations require a 30-second lease and explicit retry; there is no worker or automatic persisted retry.
- Literature provider configuration is server-only: `OPENALEX_API_KEY`, `CROSSREF_MAILTO`, `NCBI_API_KEY`, `NCBI_TOOL`, `NCBI_EMAIL`, `UNPAYWALL_EMAIL`, and a minimum-32-byte `LITERATURE_CURSOR_SECRET`. Missing or invalid provider configuration disables that discovery adapter with status `unconfigured`; import operations use the distinct `provider_unconfigured` terminal failure code. Missing cursor configuration makes discovery unavailable without preventing unrelated API domains from starting.
- Canonical DOI is the primary exact identity. Provider-specific record keys are canonicalized only by their adapter. Exact routing claims are monotonic and scope-local.
- Structured values use relational author, identifier, open-access, and publisher tables with dense positions/singletons and SHA-256 integrity fingerprints; fingerprints are never equality proof or dedupe keys.
- UI reuses existing workbench primitives and Lucide icons with literature-local responsive CSS. Browser state submits intent and renders server responses only.
- Current execution resumes the approved plan rather than restarting it. Implementation Todos 1-15 have evidence; the active closure pass hardens PostgreSQL orchestration, bounded Library summaries, import race classification, warning navigation, fixture authorization parity, workbench copy, final gates, and F1-F4 review without discarding prior evidence.
- Do not commit, amend, rebase, push, reset, stash, checkout, or revert during execution unless the user explicitly requests git work.
