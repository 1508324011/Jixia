import type { Prisma } from "@jixia/db";
import type {
  AssertionKind,
  CanonicalAssertionKind,
  LiteratureAssertionInput
} from "@jixia/shared";

import { LiteratureProjectionError } from "./literature.projection.js";
import type { StoredLiteratureAssertion } from "./literature.projection.js";
type CreateLiteratureAuditInput = {
  readonly literatureId: string;
  readonly scope:
    | {
        readonly kind: "personal";
        readonly ownerUserId: string;
      }
    | {
        readonly kind: "project";
        readonly projectId: string;
      };
};

type AppendAssertionsAuditInput = {
  readonly literatureId: string;
  readonly providerRecordId: string;
  readonly assertionKinds: readonly AssertionKind[];
  readonly firstOrdinal: number;
};

type AssertionCreateDataInput = {
  readonly literatureId: string;
  readonly providerRecordId: string;
  readonly createdByUserId: string;
  readonly ordinal: number;
  readonly assertion: LiteratureAssertionInput;
};

type SelectedStoredAssertion = Omit<StoredLiteratureAssertion, "kind"> & {
  readonly kind: CanonicalAssertionKind;
};

export function createLiteratureAuditMetadata(input: CreateLiteratureAuditInput) {
  switch (input.scope.kind) {
    case "personal":
      return {
        literatureId: input.literatureId,
        scopeKind: input.scope.kind,
        ownerUserId: input.scope.ownerUserId
      };
    case "project":
      return {
        literatureId: input.literatureId,
        scopeKind: input.scope.kind,
        projectId: input.scope.projectId
      };
    default: {
      const unreachable: never = input.scope;
      throw unreachable;
    }
  }
}

export function appendAssertionsAuditMetadata(input: AppendAssertionsAuditInput) {
  return {
    literatureId: input.literatureId,
    providerRecordId: input.providerRecordId,
    assertionCount: input.assertionKinds.length,
    assertionKinds: [...input.assertionKinds],
    firstOrdinal: input.firstOrdinal,
    lastOrdinal: input.firstOrdinal + input.assertionKinds.length - 1
  };
}

export function toAssertionCreateData(
  input: AssertionCreateDataInput
): Prisma.AssertionUncheckedCreateInput {
  const common = {
    literatureId: input.literatureId,
    providerRecordId: input.providerRecordId,
    createdByUserId: input.createdByUserId,
    ordinal: input.ordinal,
    kind: input.assertion.kind
  };

  switch (input.assertion.kind) {
    case "title":
    case "abstract":
    case "doi":
      return {
        ...common,
        textValue: input.assertion.value,
        integerValue: null
      };
    case "publicationYear":
      return {
        ...common,
        textValue: null,
        integerValue: input.assertion.value
      };
    default: {
      const unreachable: never = input.assertion;
      throw unreachable;
    }
  }
}

export function toPhaseOneStoredAssertion(
  assertion: SelectedStoredAssertion
): StoredLiteratureAssertion {
  switch (assertion.kind) {
    case "title":
    case "abstract":
    case "publicationYear":
    case "doi":
      return { ...assertion, kind: assertion.kind };
    case "publicationDate":
    case "venue":
    case "publicationType":
    case "authors":
    case "identifiers":
    case "openAccess":
    case "publisher":
      throw new LiteratureProjectionError(assertion.id);
    default: {
      const unreachable: never = assertion.kind;
      throw unreachable;
    }
  }
}
