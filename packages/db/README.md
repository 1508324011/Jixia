# Database deployment

Production deployment requires two explicit PostgreSQL identities that target the same host, port,
and database:

- `MIGRATION_DATABASE_URL` connects as a dedicated, named `LOGIN SUPERUSER` role. Phase 2 needs this
  authority to create the fixed capability roles and transfer the cleanup function to its memberless
  owner. Store this URL as a deployment-only secret and do not expose it to application processes.
- `DATABASE_URL` connects as the distinct application runtime role. It must be a `LOGIN INHERIT`
  non-superuser without `CREATEDB`, `CREATEROLE`, `REPLICATION`, or `BYPASSRLS`, and it must not
  inherit unrelated roles. Because PostgreSQL role membership is cluster-wide, the wrapper rejects
  any other member of `jixia_literature_application`; use one explicit runtime role for databases
  sharing that cluster.

Run deployment from the repository root:

```sh
pnpm db:deploy
```

The wrapper validates both connected identities, provisions the fixed `NOLOGIN` roles, applies Prisma
migrations with the deployment contract marker, grants `jixia_literature_application` to the runtime
role without `ADMIN OPTION`, installs the ordinary runtime privilege matrix below, and verifies the
complete catalog contract. Direct `prisma migrate deploy` invocation is unsupported because it bypasses
those preflight and post-deploy checks.

## Runtime privilege matrix

The database and `public` schema are owned by the migration role. The runtime role receives direct
database `CONNECT` and schema `USAGE`, but no database or schema `CREATE`, database `TEMPORARY`, object
ownership, or fixed-role administration.

The runtime role receives direct `SELECT`, `INSERT`, and `UPDATE` on all 33 current Prisma application
tables. It receives direct `DELETE` on the 18 ordinary application tables outside the protected
literature aggregate:

`AIConversation`, `AIModelProfile`, `AIProviderConfig`, `AIUsageAggregate`, `AuditEvent`, `Document`,
`DocumentAttachment`, `DocumentDraft`, `DocumentRevision`, `Invitation`, `NotebookProjection`, `Project`,
`ProjectMember`, `Session`, `Space`, `SpaceMember`, `UploadIntent`, and `User`.

Direct runtime `DELETE` remains absent from these 15 aggregate tables:

`Annotation`, `Assertion`, `AssertionAuthor`, `AssertionIdentifier`, `AssertionOpenAccess`,
`AssertionPublisher`, `CitationOccurrence`, `Evidence`, `Excerpt`, `ImportOperation`, `Literature`,
`LiteratureIdentity`, `ProviderRecord`, `RelationAssertion`, and `SourceRevision`.

The memberless cleanup owner has exactly `SELECT, DELETE` on those 15 tables. The
`jixia_literature_application` capability role has no table DML and only `EXECUTE` on
`public.delete_literature_aggregate(text)`. PUBLIC and the runtime role have no direct function
execution grants. The runtime invokes cleanup through its one capability membership; append-only
triggers and the cleanup owner remain the history-mutation boundary.

The current schema has no sequences, so it has no current sequence grants. Deployer-scoped defaults
grant future application tables `SELECT, INSERT, UPDATE, DELETE` and future sequences `USAGE` directly
to the runtime role. Deployer defaults revoke PUBLIC function execution. Existing and future privileges
do not include table `TRUNCATE`, `REFERENCES`, or `TRIGGER`, sequence `SELECT` or `UPDATE`, schema/database
`CREATE`, or any access to `_prisma_migrations`.

Verification compares exact database, schema, table, sequence, function, and default ACL rows; object
owners; function security settings; and both directions of every membership touching the runtime or
fixed roles. Any missing grant, additional grant, grant option, unexpected object, owner change, or
additional membership causes verification to fail.

To verify an existing deployment without applying migrations:

```sh
pnpm db:deploy:verify
```
