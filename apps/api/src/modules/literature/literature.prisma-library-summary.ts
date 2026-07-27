import type { Prisma } from "@jixia/db";
import { Prisma as PrismaRuntime } from "@jixia/db/generated";
import type { CanonicalAssertionKind } from "@jixia/shared";

import { decodeStoredLiteratureAssertion } from "./literature.history-value.js";
import { LiteratureProjectionError } from "./literature.projection.js";
import type {
  LiteratureLibraryCurrentValues,
  LiteratureLibraryRecord,
  LiteratureRecord
} from "./literature.repository.js";
import { storedAssertionSelect } from "./literature.prisma-selects.js";
import type { StoredCanonicalLiteratureAssertion } from "./literature.stored-assertion.js";

type LiteratureLibraryRollupRow = {
  readonly literatureId: string;
  readonly providerRecordCount: number;
  readonly latestAssertionCreatedAt: Date | null;
  readonly currentAssertionIds: readonly string[];
  readonly conflictKinds: readonly CanonicalAssertionKind[];
};

export async function summarizeLiteratureLibraryPage(
  transaction: Prisma.TransactionClient,
  literature: readonly LiteratureRecord[]
): Promise<readonly LiteratureLibraryRecord[]> {
  if (literature.length === 0) {
    return [];
  }
  const rollups = await loadRollups(transaction, literature.map((record) => record.id));
  const rollupByLiteratureId = new Map<string, LiteratureLibraryRollupRow>();
  for (const rollup of rollups) {
    if (rollupByLiteratureId.has(rollup.literatureId)) {
      throw new LiteratureProjectionError(rollup.literatureId);
    }
    rollupByLiteratureId.set(rollup.literatureId, rollup);
  }
  const currentAssertionIds = rollups.flatMap((rollup) => rollup.currentAssertionIds);
  const currentAssertions = currentAssertionIds.length === 0
    ? []
    : await transaction.assertion.findMany({
        where: { id: { in: currentAssertionIds } },
        select: storedAssertionSelect
      });
  const assertionById = new Map(
    currentAssertions.map((assertion) => [assertion.id, assertion] as const)
  );

  return literature.map((record) => {
    const rollup = rollupByLiteratureId.get(record.id);
    if (rollup === undefined) {
      throw new LiteratureProjectionError(record.id);
    }
    const assertions = rollup.currentAssertionIds.map((assertionId) => {
      const assertion = assertionById.get(assertionId);
      if (assertion === undefined || assertion.literatureId !== record.id) {
        throw new LiteratureProjectionError(assertionId);
      }
      return assertion;
    });
    return {
      literature: record,
      current: currentSummaryValues(record.id, assertions),
      providerRecordCount: rollup.providerRecordCount,
      latestAssertionCreatedAt: rollup.latestAssertionCreatedAt,
      conflictKinds: rollup.conflictKinds
    };
  });
}

async function loadRollups(
  transaction: Prisma.TransactionClient,
  literatureIds: readonly string[]
): Promise<readonly LiteratureLibraryRollupRow[]> {
  return transaction.$queryRaw<readonly LiteratureLibraryRollupRow[]>(PrismaRuntime.sql`
    WITH scoped_literature AS (
      SELECT unnest(ARRAY[${PrismaRuntime.join(literatureIds)}]::text[]) AS "literatureId"
    ),
    assertion_values AS (
      SELECT
        assertion."id",
        assertion."literatureId",
        assertion."ordinal",
        assertion."kind",
        CASE assertion."kind"
          WHEN 'publicationYear' THEN
            jsonb_build_array(assertion."kind"::text, assertion."integerValue")
          WHEN 'authors' THEN
            jsonb_build_array(
              assertion."kind"::text,
              COALESCE((
                SELECT jsonb_agg(
                  jsonb_build_array(author."displayName", author."orcid")
                  ORDER BY author."position"
                )
                FROM "AssertionAuthor" author
                WHERE author."assertionId" = assertion."id"
                  AND author."literatureId" = assertion."literatureId"
              ), '[]'::jsonb)
            )
          WHEN 'identifiers' THEN
            jsonb_build_array(
              assertion."kind"::text,
              COALESCE((
                SELECT jsonb_agg(
                  jsonb_build_array(identifier."scheme", identifier."value")
                  ORDER BY identifier."position"
                )
                FROM "AssertionIdentifier" identifier
                WHERE identifier."assertionId" = assertion."id"
                  AND identifier."literatureId" = assertion."literatureId"
              ), '[]'::jsonb)
            )
          WHEN 'openAccess' THEN
            jsonb_build_array(
              assertion."kind"::text,
              open_access."isOpenAccess",
              open_access."bestUrl",
              open_access."license",
              open_access."version",
              open_access."hostType"
            )
          WHEN 'publisher' THEN
            jsonb_build_array(
              assertion."kind"::text,
              publisher."name",
              publisher."landingPageUrl"
            )
          ELSE jsonb_build_array(assertion."kind"::text, assertion."textValue")
        END AS "canonicalValue"
      FROM "Assertion" assertion
      JOIN scoped_literature scoped
        ON scoped."literatureId" = assertion."literatureId"
      LEFT JOIN "AssertionOpenAccess" open_access
        ON open_access."assertionId" = assertion."id"
        AND open_access."literatureId" = assertion."literatureId"
      LEFT JOIN "AssertionPublisher" publisher
        ON publisher."assertionId" = assertion."id"
        AND publisher."literatureId" = assertion."literatureId"
    ),
    current_assertions AS (
      SELECT DISTINCT ON (value."literatureId", value."kind")
        value."literatureId",
        value."kind",
        value."id",
        value."ordinal",
        value."canonicalValue"
      FROM assertion_values value
      ORDER BY value."literatureId", value."kind", value."ordinal" DESC, value."id" DESC
    ),
    conflict_kinds AS (
      SELECT
        historical."literatureId",
        historical."kind",
        MIN(historical."ordinal") AS "firstOrdinal"
      FROM assertion_values historical
      JOIN current_assertions current
        ON current."literatureId" = historical."literatureId"
        AND current."kind" = historical."kind"
      GROUP BY historical."literatureId", historical."kind"
      HAVING BOOL_OR(
        historical."canonicalValue" IS DISTINCT FROM current."canonicalValue"
      )
    )
    SELECT
      scoped."literatureId",
      (
        SELECT COUNT(*)::integer
        FROM "ProviderRecord" provider
        WHERE provider."literatureId" = scoped."literatureId"
      ) AS "providerRecordCount",
      (
        SELECT MAX(assertion."createdAt")
        FROM "Assertion" assertion
        WHERE assertion."literatureId" = scoped."literatureId"
      ) AS "latestAssertionCreatedAt",
      COALESCE((
        SELECT array_agg(current."id" ORDER BY current."ordinal", current."id")
        FROM current_assertions current
        WHERE current."literatureId" = scoped."literatureId"
      ), ARRAY[]::text[]) AS "currentAssertionIds",
      COALESCE((
        SELECT array_agg(
          conflict."kind"::text
          ORDER BY conflict."firstOrdinal", conflict."kind"::text
        )
        FROM conflict_kinds conflict
        WHERE conflict."literatureId" = scoped."literatureId"
      ), ARRAY[]::text[]) AS "conflictKinds"
    FROM scoped_literature scoped
  `);
}

function currentSummaryValues(
  literatureId: string,
  assertions: readonly StoredCanonicalLiteratureAssertion[]
): LiteratureLibraryCurrentValues {
  let title: LiteratureLibraryCurrentValues["title"] = null;
  let authors: LiteratureLibraryCurrentValues["authors"] = [];
  let publicationYear: LiteratureLibraryCurrentValues["publicationYear"] = null;
  let publicationDate: LiteratureLibraryCurrentValues["publicationDate"] = null;
  let venue: LiteratureLibraryCurrentValues["venue"] = null;
  let doi: LiteratureLibraryCurrentValues["doi"] = null;
  let openAccess: LiteratureLibraryCurrentValues["openAccess"] = null;
  let publisher: LiteratureLibraryCurrentValues["publisher"] = null;
  const providerRecordIds = new Set(assertions.map((assertion) => assertion.providerRecordId));
  const kinds = new Set<CanonicalAssertionKind>();
  for (const stored of assertions) {
    const assertion = decodeStoredLiteratureAssertion(stored, literatureId, providerRecordIds).canonical;
    if (kinds.has(assertion.kind)) {
      throw new LiteratureProjectionError(stored.id);
    }
    kinds.add(assertion.kind);
    switch (assertion.kind) {
      case "title": title = assertion.value; break;
      case "authors": authors = assertion.value; break;
      case "publicationYear": publicationYear = assertion.value; break;
      case "publicationDate": publicationDate = assertion.value; break;
      case "venue": venue = assertion.value; break;
      case "doi": doi = assertion.value; break;
      case "openAccess": openAccess = assertion.value; break;
      case "publisher": publisher = assertion.value; break;
      case "abstract":
      case "identifiers":
      case "publicationType":
        break;
      default: {
        const unreachable: never = assertion;
        throw unreachable;
      }
    }
  }
  return { title, authors, publicationYear, publicationDate, venue, doi, openAccess, publisher };
}
