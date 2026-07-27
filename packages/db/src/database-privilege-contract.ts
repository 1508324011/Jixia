import { type QueryResultRow } from "pg";

import { DatabaseDeploymentContractError } from "./database-deployment-errors.js";
import { type DatabaseQuery } from "./database-role-contract.js";

export const databaseApplicationTables = [
  "AIConversation",
  "AIModelProfile",
  "AIProviderConfig",
  "AIUsageAggregate",
  "Annotation",
  "Assertion",
  "AssertionAuthor",
  "AssertionIdentifier",
  "AssertionOpenAccess",
  "AssertionPublisher",
  "AuditEvent",
  "CitationOccurrence",
  "Document",
  "DocumentAttachment",
  "DocumentDraft",
  "DocumentRevision",
  "Evidence",
  "Excerpt",
  "ImportOperation",
  "Invitation",
  "Literature",
  "LiteratureIdentity",
  "NotebookProjection",
  "Project",
  "ProjectMember",
  "ProviderRecord",
  "RelationAssertion",
  "Session",
  "SourceRevision",
  "Space",
  "SpaceMember",
  "UploadIntent",
  "User"
] as const;

export const literatureCleanupTables = [
  "Annotation",
  "Assertion",
  "AssertionAuthor",
  "AssertionIdentifier",
  "AssertionOpenAccess",
  "AssertionPublisher",
  "CitationOccurrence",
  "Evidence",
  "Excerpt",
  "ImportOperation",
  "Literature",
  "LiteratureIdentity",
  "ProviderRecord",
  "RelationAssertion",
  "SourceRevision"
] as const;

const cleanupTableNames = new Set<string>(literatureCleanupTables);
export const runtimeDeletableTables = databaseApplicationTables.filter(
  (tableName) => !cleanupTableNames.has(tableName)
);

export const databaseFunctions = [
  "delete_literature_aggregate(text)",
  "enforce_annotation_anchor_immutable()",
  "enforce_assertion_structured_value()",
  "enforce_citation_occurrence_same_scope()",
  "enforce_document_scope_immutable()",
  "enforce_import_operation_result_scope()",
  "enforce_import_operation_scope_immutable()",
  "enforce_import_operation_transition()",
  "enforce_literature_identity_scope()",
  "enforce_literature_ownership_immutable()",
  "enforce_provider_record_identity_immutable()",
  "enforce_relation_assertion_same_scope()",
  "reject_append_only_change()",
  "reject_immutable_update()"
] as const;

type RuntimePrivilegeConfig = {
  readonly migrationRole: string;
  readonly runtimeRole: string;
};

type SqlRow = QueryResultRow & { readonly sql: string };

export async function provisionDatabaseRuntimePrivileges(
  query: DatabaseQuery,
  config: RuntimePrivilegeConfig
): Promise<void> {
  const formatted = await query<SqlRow>(
    `SELECT format(
       $contract$
       ALTER DATABASE %1$I OWNER TO %2$I;
       REVOKE ALL ON DATABASE %1$I FROM PUBLIC, "jixia_literature_application",
         "jixia_literature_cleanup_owner", %3$I;
       GRANT CONNECT ON DATABASE %1$I TO %3$I;

       ALTER SCHEMA public OWNER TO %2$I;
       REVOKE ALL ON SCHEMA public FROM PUBLIC, "jixia_literature_application",
         "jixia_literature_cleanup_owner", %3$I;
       GRANT USAGE ON SCHEMA public TO "jixia_literature_application",
         "jixia_literature_cleanup_owner", %3$I;

       REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC,
         "jixia_literature_application", "jixia_literature_cleanup_owner", %3$I;
       GRANT SELECT, INSERT, UPDATE ON TABLE %4$s TO %3$I;
       GRANT DELETE ON TABLE %5$s TO %3$I;
       GRANT SELECT, DELETE ON TABLE %6$s TO "jixia_literature_cleanup_owner";

       REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC,
         "jixia_literature_application", "jixia_literature_cleanup_owner", %3$I;

       REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC,
         "jixia_literature_application", "jixia_literature_cleanup_owner", %3$I;
       GRANT EXECUTE ON FUNCTION public.delete_literature_aggregate(text)
         TO "jixia_literature_application";

       ALTER DEFAULT PRIVILEGES FOR ROLE %2$I IN SCHEMA public
         REVOKE ALL ON TABLES FROM PUBLIC, "jixia_literature_application",
           "jixia_literature_cleanup_owner", %3$I;
       ALTER DEFAULT PRIVILEGES FOR ROLE %2$I IN SCHEMA public
         GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %3$I;
       ALTER DEFAULT PRIVILEGES FOR ROLE %2$I IN SCHEMA public
         REVOKE ALL ON SEQUENCES FROM PUBLIC, "jixia_literature_application",
           "jixia_literature_cleanup_owner", %3$I;
       ALTER DEFAULT PRIVILEGES FOR ROLE %2$I IN SCHEMA public
         GRANT USAGE ON SEQUENCES TO %3$I;
       ALTER DEFAULT PRIVILEGES FOR ROLE %2$I
         REVOKE ALL ON FUNCTIONS FROM PUBLIC, "jixia_literature_application",
           "jixia_literature_cleanup_owner", %3$I;
       $contract$,
       current_database(),
       $1::text,
       $2::text,
       (SELECT string_agg(format('%I', table_name), ', ' ORDER BY table_name)
          FROM unnest($3::text[]) AS table_name),
       (SELECT string_agg(format('%I', table_name), ', ' ORDER BY table_name)
          FROM unnest($4::text[]) AS table_name),
       (SELECT string_agg(format('%I', table_name), ', ' ORDER BY table_name)
          FROM unnest($5::text[]) AS table_name)
     ) AS sql`,
    [
      config.migrationRole,
      config.runtimeRole,
      [...databaseApplicationTables],
      [...runtimeDeletableTables],
      [...literatureCleanupTables]
    ]
  );
  const sql = formatted.rows[0]?.sql;
  if (!sql) {
    throw new DatabaseDeploymentContractError("database_catalog_contract_invalid");
  }

  await query("BEGIN");
  try {
    await query(sql);
    await query("COMMIT");
  } catch (error) {
    await query("ROLLBACK");
    throw error;
  }
}
