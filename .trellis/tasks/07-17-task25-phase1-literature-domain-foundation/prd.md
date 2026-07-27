# Task25 Phase 1 literature domain foundation

## Goal

Establish the server-owned literature foundation required before Search, Reader,
Notebook reconciliation, or citation rendering can be built. Phase 1 defines
transport-safe semantic contracts, owner-scoped PostgreSQL persistence,
fail-closed API authorization, mutation-coupled audit events, and deterministic
replay of append-only assertions.

## Requirements

### Scope

- Add minimal shared contracts and persistence for `Literature`,
  `ProviderRecord`, `Assertion`, `RelationAssertion`, `ImportOperation`,
  `SourceRevision`, `Annotation`, `Excerpt`, `Evidence`,
  `NotebookProjection`, and `CitationOccurrence`.
- Treat `Literature` as the ownership root. A Literature is either personal
  (`ownerUserId`) or project-scoped (`projectId`), never both or neither.
- Keep every provenance link mandatory and aggregate-qualified. No optional,
  polymorphic, or provider-native payload references are allowed.
- Keep `RelationAssertion`, `ImportOperation`, `SourceRevision`, `Annotation`,
  `Excerpt`, `Evidence`, `NotebookProjection`, and `CitationOccurrence`
  contract-and-persistence only in this phase.

### API Surface

Implement exactly these authenticated routes:

- `POST /literature`: create personal Literature for the authenticated actor or
  project Literature for an authorized project member. The request accepts a
  discriminated scope and never accepts an owner user ID.
- `POST /literature/:id/assertions`: resolve or create one normalized
  `ProviderRecord`, append one to four distinct typed assertions, allocate a
  contiguous ordinal range atomically, and write one audit event in the same
  transaction.
- `GET /literature/:id`: return one authorized, consistent snapshot containing
  the Literature identity, provider records, complete assertion history,
  current values with provenance, and conflicts.

Do not add list, search, update, delete, merge, source, relation, annotation,
excerpt, evidence, projection, citation, or import-operation routes.

### Authorization

- Personal create assigns the authenticated actor as owner.
- Personal read and assertion append require that exact owner.
- Project create and assertion append require active space membership plus an
  explicit `ProjectOwner` or `ProjectEditor` membership.
- Project read requires active space membership plus any explicit project
  membership, including `ProjectViewer`.
- `SpaceAdmin` grants no implicit research-content access.
- Missing records, wrong-space actors, removed space members, missing project
  members, and cross-owner access fail closed without disclosing existence.
  An authenticated Viewer attempting mutation receives `403`; inaccessible or
  absent Literature receives `404`.
- Every repository operation requires the actor. Mutation authorization occurs
  inside the same database transaction as all writes.

### Assertions And Replay

- Use a closed typed assertion union: `title`, `abstract`, `publicationYear`,
  and `doi`.
- Store text and integer values in typed columns with a database check tying
  the populated column to the assertion kind. Do not store assertion values as
  JSON.
- Normalize text, require publication years in `1000..9999`, and canonicalize
  DOI values to lowercase without `doi:` or resolver URL prefixes.
- Reject empty batches, batches larger than four, duplicate kinds, unknown
  fields or kinds, invalid value types, invalid years, and malformed DOI input
  before writing.
- Sort each accepted batch by `title`, `abstract`, `publicationYear`, `doi`
  before ordinal allocation so request array order has no semantic effect.
- Allocate ordinals from `Literature.nextAssertionOrdinal`; never use
  `MAX(ordinal) + 1`.
- Replay always sorts by ordinal. The highest ordinal is current, every
  assertion remains in ascending history, and earlier normalized values that
  differ from current are conflicts. Repeated equal values remain corroborating
  history but are not conflicts.
- Current values and conflicts retain assertion ID, provider record ID, and
  ordinal. Malformed persisted variants fail the whole projection.

### Persistence And Migration

- Add an additive Prisma migration with SQL-enforced XOR ownership, bounded
  non-empty provider keys, typed assertion values, positive ordinals and
  versions, unique constraints, aggregate-qualified composite foreign keys,
  and same-scope integrity triggers for relations and citations.
- `Literature` stores `nextAssertionOrdinal` with default `1`; ownership and
  creator are immutable while the ordinal counter remains updateable.
- `ProviderRecord` is unique by `(literatureId, providerKey, recordKey)` and
  stores no provider payload or metadata JSON.
- `Assertion` and `RelationAssertion` are append-only; update, delete, and
  truncate operations must fail.
- `SourceRevision`, `Excerpt`, `Evidence`, `NotebookProjection`, and
  `CitationOccurrence` are immutable according to their semantic contract.
- Literature provenance uses `ON DELETE RESTRICT`. Derived
  `NotebookProjection` and `CitationOccurrence` may cascade with hard Document
  deletion.
- Add ownership immutability for the existing Document scope tuple so citation
  scope cannot become invalid after insertion.
- Add executable `rollback.sql` beside the forward migration. It must refuse to
  run when any Phase 1 table contains data, remove explicit dependencies in
  reverse order without broad `CASCADE`, and support empty-schema
  forward/rollback/forward testing.

### Transactional Audit

- Validate server-created metadata with `ensureMetadataOnlyAuditPayload` and
  insert the audit row through the active Prisma transaction.
- `literature.created` metadata contains only Literature ID, scope kind, and the
  applicable owner or project ID.
- `literature.assertions_appended` metadata contains only Literature ID,
  ProviderRecord ID, assertion count, assertion kinds, and first/last ordinal.
- Audit metadata never contains asserted values, title, abstract, DOI,
  provider-native record keys or payloads, source or excerpt content, request
  payloads, credentials, headers, signed URLs, or storage identifiers.
- Audit failure rolls back the complete domain mutation and ordinal update.

## Acceptance Criteria

- [ ] Shared contracts are readonly, transport-safe, and have no Prisma,
      Fastify, React, environment, or provider-runtime dependencies.
- [ ] Personal and project authorization follows the matrix above and all
      cross-owner/wrong-space paths fail closed through the live HTTP surface.
- [ ] Concurrent assertion batches receive disjoint contiguous ordinal ranges
      with no duplicate or missing ordinal.
- [ ] Replaying every permutation of the same stored rows yields byte-identical
      projection DTOs with complete provenance and deterministic conflicts.
- [ ] Database constraints reject aggregate splicing, cross-scope relations and
      citations, duplicate semantic ordinals/versions, invalid typed values,
      and forbidden append-only mutations.
- [ ] Literature creation and assertion append are atomic with their exact,
      metadata-only audit events; forced audit failure leaves no domain writes.
- [ ] Existing Document hard delete still removes derived projections and
      citation occurrences while protected Literature provenance remains
      restricted.
- [ ] The migration passes empty-database forward, guarded rollback,
      forward-again, and non-empty rollback-refusal checks.
- [ ] `pnpm db:validate`, `pnpm db:generate`, targeted DB/API tests, workspace
      lint, typecheck, build, and test pass.
- [ ] Manual HTTP QA proves create, append, replayed read, unauthorized read,
      and Viewer mutation denial against a running API.

## Technical Notes

- Follow the existing repository-owned Prisma transaction pattern used by
  projects and documents. Do not perform a service-layer authorization lookup
  followed by an unscoped mutation.
- Use one SQL statement or a `REPEATABLE READ` transaction for the GET snapshot.
- Composite aggregate IDs are deliberate database evidence, not denormalization
  to remove.
- API repository isolation is the Phase 1 owner-enforcement boundary. Do not
  claim PostgreSQL RLS without session-level database identity.
- Provider adapters, provider calls, search, file acquisition/download,
  storage, Reader UI, Notebook reconciliation or generation, citation parsing
  or rendering, bibliography generation, merge/ranking, worker execution,
  import progress, ownership transfer, and all frontend changes are out of
  scope.
