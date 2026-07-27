import type {
  LiteratureAuthorValue,
  LiteratureOpenAccessValue,
  LiteraturePublisherValue,
  LiteratureScope
} from "./literature.core";
import type { CanonicalAssertionKind, RelationKind } from "./literature.vocabulary";

export type RelationAssertionDTO = {
  readonly id: string;
  readonly subjectLiteratureId: string;
  readonly objectLiteratureId: string;
  readonly sourceRevisionId: string;
  readonly kind: RelationKind;
  readonly createdByUserId: string;
  readonly createdAt: string;
};

export type LiteratureSummaryDTO = {
  readonly id: string;
  readonly scope: LiteratureScope;
  readonly title: string | null;
  readonly authors: readonly LiteratureAuthorValue[];
  readonly publicationYear: number | null;
  readonly publicationDate: string | null;
  readonly venue: string | null;
  readonly doi: string | null;
  readonly openAccess: LiteratureOpenAccessValue | null;
  readonly publisher: LiteraturePublisherValue | null;
  readonly provenanceCount: number;
  readonly conflictKinds: readonly CanonicalAssertionKind[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ListLiteratureRequest =
  | {
      readonly scope: "personal";
      readonly limit?: number;
      readonly cursor?: string;
    }
  | {
      readonly scope: "project";
      readonly projectId: string;
      readonly limit?: number;
      readonly cursor?: string;
    };

export type ListLiteratureResponse = {
  readonly literature: readonly LiteratureSummaryDTO[];
  readonly nextCursor: string | null;
};

export type SourceRevisionDTO = {
  readonly id: string;
  readonly literatureId: string;
  readonly providerRecordId: string;
  readonly revisionNumber: number;
  readonly sha256: string;
  readonly mediaType: string;
  readonly byteLength: string;
  readonly capturedAt: string;
  readonly createdByUserId: string;
  readonly createdAt: string;
};

export type ExcerptDTO = {
  readonly id: string;
  readonly literatureId: string;
  readonly sourceRevisionId: string;
  readonly startByte: number;
  readonly endByte: number;
  readonly quote: string;
  readonly createdByUserId: string;
  readonly createdAt: string;
};

export type AnnotationDTO = {
  readonly id: string;
  readonly literatureId: string;
  readonly excerptId: string;
  readonly authorUserId: string;
  readonly body: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type EvidenceDTO = {
  readonly id: string;
  readonly literatureId: string;
  readonly excerptId: string;
  readonly createdByUserId: string;
  readonly createdAt: string;
};

export type NotebookProjectionDTO = {
  readonly id: string;
  readonly documentId: string;
  readonly documentRevisionId: string;
  readonly projectionVersion: number;
  readonly schemaVersion: number;
  readonly createdByUserId: string;
  readonly createdAt: string;
};

export type CitationOccurrenceDTO = {
  readonly id: string;
  readonly notebookProjectionId: string;
  readonly evidenceId: string;
  readonly literatureId: string;
  readonly semanticKey: string;
  readonly sourceOrder: number;
  readonly createdAt: string;
};
