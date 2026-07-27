import type {
  LiteratureAssertionDTO,
  LiteratureAssertionInput,
  ProjectRole,
  ProviderIdentity
} from "@jixia/shared";

import type {
  appendAssertionsAuditMetadata,
  createLiteratureAuditMetadata
} from "./literature.prisma-mappers.js";
import type { StoredCanonicalLiteratureAssertion } from "./literature.stored-assertion.js";
import type {
  LiteratureLibraryRecord,
  LiteratureListAnchor,
  LiteratureListScope,
  LiteratureRecord,
  ProviderRecord
} from "./literature.repository.js";

export type PersonalAccessScope = {
  readonly kind: "personal";
  readonly ownerUserId: string;
};

export type ProjectAccessScope = {
  readonly kind: "project";
  readonly projectId: string;
  readonly projectSpaceId: string;
  readonly activeSpaceMember: boolean;
  readonly projectRole: ProjectRole | null;
};

export type LiteratureAccessContext = {
  readonly literature: LiteratureRecord;
  readonly scope: PersonalAccessScope | ProjectAccessScope;
};

export type LiteratureAuditEventInput = {
  readonly actorUserId: string;
  readonly action: "literature.created" | "literature.assertions_appended";
  readonly targetType: "Literature";
  readonly targetId: string;
  readonly payload:
    | ReturnType<typeof createLiteratureAuditMetadata>
    | ReturnType<typeof appendAssertionsAuditMetadata>;
};

type CreateAssertionInput = {
  readonly literatureId: string;
  readonly providerRecordId: string;
  readonly createdByUserId: string;
  readonly ordinal: number;
  readonly assertion: LiteratureAssertionInput;
};

export interface LiteratureTransaction {
  findProjectAccess(input: {
    readonly projectId: string;
    readonly userId: string;
    readonly mode: "read" | "mutation";
  }): Promise<ProjectAccessScope | null>;
  findLiteratureAccess(input: {
    readonly literatureId: string;
    readonly userId: string;
    readonly mode: "read" | "mutation";
  }): Promise<LiteratureAccessContext | null>;
  createLiterature(input: {
    readonly ownerUserId: string | null;
    readonly projectId: string | null;
    readonly createdByUserId: string;
  }): Promise<LiteratureRecord>;
  allocateAssertionOrdinals(input: {
    readonly literatureId: string;
    readonly count: number;
  }): Promise<number>;
  findProviderRecord(input: {
    readonly literatureId: string;
    readonly provider: ProviderIdentity;
  }): Promise<ProviderRecord | null>;
  createProviderRecord(input: {
    readonly literatureId: string;
    readonly provider: ProviderIdentity;
    readonly createdByUserId: string;
  }): Promise<ProviderRecord>;
  createAssertion(input: CreateAssertionInput): Promise<LiteratureAssertionDTO>;
  listProviderRecords(input: {
    readonly literatureId: string;
  }): Promise<readonly ProviderRecord[]>;
  listAssertions(input: {
    readonly literatureId: string;
  }): Promise<readonly StoredCanonicalLiteratureAssertion[]>;
  listLiteraturePage(input: {
    readonly userId: string;
    readonly scope: LiteratureListScope;
    readonly limit: number;
    readonly anchor: LiteratureListAnchor | null;
  }): Promise<readonly LiteratureLibraryRecord[]>;
  writeAuditEvent(input: LiteratureAuditEventInput): Promise<void>;
}

export interface LiteratureTransactionRunner {
  run<T>(
    work: (transaction: LiteratureTransaction) => Promise<T>,
    options?: { readonly isolationLevel?: "RepeatableRead" }
  ): Promise<T>;
}
