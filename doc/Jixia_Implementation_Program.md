# Jixia Implementation Program

## Purpose

This document records the product and architecture decisions that govern the staged implementation of the target state in `doc/Design.md`. The target is a complete research workbench delivered through independently usable, automated-testable milestones rather than one big-bang release.

## Confirmed Program Decisions

- **Release target:** invited beta for real research teams. Billing, enterprise SSO, formal SLAs, and certification work are not part of the first release program.
- **Deployment model:** one organization or lab per deployment. Spaces and Projects remain authorization and governance scopes inside that deployment; public multi-tenant SaaS isolation is deferred.
- **Data residency:** infrastructure must remain region-configurable. No product contract may hard-code a US, EU, or Mainland China deployment.
- **External egress:** controlled and auditable. Literature and AI calls may leave the deployment only through server-owned adapters, with bounded user-selected context and no whole-library or implicit document export.
- **Literature scope:** broad scholarly discovery first. OpenAlex, Crossref, and PubMed metadata, DOI/import seeds, lawful open-access locations, and user-owned uploads form the first evidence loop. Biomedical providers remain adapters and do not replace the core model.
- **AI providers:** OpenAI-compatible, OpenRouter, Anthropic, and arbitrary third-party providers must fit one capability-based server registry. Credentials remain server-owned. Provider connection and capability discovery are primary; manual model-profile administration is an advanced fallback only.
- **Localization:** Simplified Chinese and English UI chrome are first-class from the workbench foundation onward. Source titles, abstracts, quotations, and citations remain in their original language unless a later explicit translation action is added.
- **Licensing:** Jixia is a proprietary commercial product. Do not copy non-commercial source code. Track dependency licenses and prefer permissive runtime dependencies.

## Locked Product Boundaries

The following decisions come from `doc/Design.md` and `doc/MVP_rule.md` and are not reopened by individual tasks:

- Jixia is a server-first, browser-based research workbench.
- Home is the daily cockpit; Project is the formal collaboration unit; Project Overview is an entry and overview surface, not a project-management cockpit.
- Search is external discovery; Library is the personal literature warehouse; Reader is the deep-reading and evidence-selection surface.
- Notebook is private thinking and synthesis; Project Docs are durable shared knowledge. They share one editor grammar but retain different ownership and purpose.
- Embedded Copilot is the primary AI surface. AI Workspace is secondary and intended for longer or more complex context.
- AI is advisory and cannot persist document changes without explicit user confirmation. Existing no-writeback guarantees remain mandatory.
- Discussion is attached to objects rather than becoming a standalone team-chat product.
- Space is a governance container, not the foreground work surface.
- New objects are personal by default; sharing is explicit and project-scoped.

## Delivery Sequence

1. Workbench foundation, bilingual chrome, and responsive geometry.
2. Provider connection and capability-discovery UX replacing the rejected Task 21f presentation.
3. Literature, source, annotation, excerpt, evidence, and citation domain contracts.
4. External Search, DOI/import flow, and Library.
5. Reader and the evidence-to-Project-Doc vertical slice.
6. Notebook synthesis integration and source-grounded embedded Copilot.
7. Project Overview, Project Docs collaboration, members, discussions, activity, and audit surfaces.
8. Home, global command search, operational polish, and complete target-state verification.

Each milestone must preserve server authorization, safe storage, explicit permissions, draft/revision separation, and bounded AI context. Every release gate must be executable through automated package tests and Playwright checks.

## Task25 Phase 2 Literature Delivery

Task25 Phase 2 completes the fourth delivery step, External Search, DOI/import
flow, and Library, on top of the Phase 1 Literature persistence foundation.
The implementation keeps the program's server-first and controlled-egress
decisions intact:

- OpenAlex, Crossref, and PubMed are server-owned discovery providers. Unpaywall
  and PMC are enrichment-only; the browser never calls a provider directly and
  provider credentials remain server-side. Exact configuration keys are
  `OPENALEX_API_KEY`, `CROSSREF_MAILTO`, `NCBI_API_KEY`, `NCBI_TOOL`,
  `NCBI_EMAIL`, `UNPAYWALL_EMAIL`, and a minimum-32-byte
  `LITERATURE_CURSOR_SECRET`. Missing or invalid provider config disables that
  adapter; NCBI controls PubMed/PMC together. Missing cursor config makes only
  discovery unavailable and does not block unrelated API startup.
- Search is read-only and returns normalized candidates, source matches,
  deterministic cursors, and provider status. Import accepts only a scope and a
  seed, refetches the seed on the server, uses UUID idempotency, and exposes an
  explicit operation with retry semantics. Search defaults to 20 results and
  accepts 3-20; signed cursor state is capped at five pages and 100 exact seen
  identities.
- Personal and Project Literature use exact scope authorization. Library detail
  is rendered from server projection, typed assertions, provider records,
  provenance, and conflicts; raw provider bodies, full text, and fuzzy merge are
  outside this milestone. Metadata-only audit records exclude content and
  secrets. Normalized query, DOI, and exact source identities are limited to
  authenticated transport and transient in-memory UI state; logs, audit,
  browser persistence, and untyped database payloads may not contain them.
- `/search` and `/library` are real workbench routes. Notebook and Project detail
  compose independent personal/project Literature panels without changing
  document ownership or request state. English and Simplified Chinese are
  supported, including responsive 375/768/1280 browser checks.
- Phase 2 database changes deploy only through `pnpm db:deploy` with separate
  privileged migration and restricted runtime identities. Direct Prisma deploy
  is unsupported, and guarded rollback refuses populated structured assertion,
  identity, or import-operation state.

The assembled PostgreSQL fixture and deterministic Playwright fixture are the
verification boundary for this delivery. They prove read-only search,
normalized eleven-kind provenance, idempotent replay, failed-operation retry,
project authorization, conflict/provenance rendering, and responsive console-
clean workflows without live provider network access.
