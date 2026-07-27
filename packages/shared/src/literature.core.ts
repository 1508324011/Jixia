import type {
  CanonicalAssertionKind,
  LiteratureIdentifierScheme,
  LiteratureOpenAccessHostType,
  LiteratureOpenAccessVersion,
  LiteratureProviderKey
} from "./literature.vocabulary";

export type LiteratureScope =
  | {
      readonly kind: "personal";
      readonly ownerUserId: string;
    }
  | {
      readonly kind: "project";
      readonly projectId: string;
    };

export type CreateLiteratureRequest =
  | {
      readonly scope: "personal";
    }
  | {
      readonly scope: "project";
      readonly projectId: string;
    };

export type LiteratureTargetScope =
  | {
      readonly scope: "personal";
    }
  | {
      readonly scope: "project";
      readonly projectId: string;
    };

export type LiteratureDTO = {
  readonly id: string;
  readonly scope: LiteratureScope;
  readonly createdByUserId: string;
  readonly createdAt: string;
};

export type ProviderIdentity = {
  readonly providerKey: string;
  readonly recordKey: string;
};

export type LiteratureSourceIdentity = {
  readonly providerKey: LiteratureProviderKey;
  readonly recordKey: string;
};

export type LiteratureAuthorValue = {
  readonly displayName: string;
  readonly orcid?: string;
};

export type LiteratureIdentifierValue = {
  readonly scheme: LiteratureIdentifierScheme;
  readonly value: string;
};

export type LiteratureOpenAccessValue = {
  readonly isOpenAccess: boolean;
  readonly bestUrl?: string;
  readonly license?: string;
  readonly version?: LiteratureOpenAccessVersion;
  readonly hostType?: LiteratureOpenAccessHostType;
};

export type LiteraturePublisherValue =
  | {
      readonly name: string;
      readonly landingPageUrl?: string;
    }
  | {
      readonly name?: string;
      readonly landingPageUrl: string;
    };

export type ProviderRecordDTO = ProviderIdentity & {
  readonly id: string;
  readonly literatureId: string;
  readonly createdByUserId: string;
  readonly createdAt: string;
};

export type LiteratureAssertionInput =
  | {
      readonly kind: "title" | "abstract" | "doi";
      readonly value: string;
    }
  | {
      readonly kind: "publicationYear";
      readonly value: number;
    };

export type AppendLiteratureAssertionsRequest = {
  readonly provider: ProviderIdentity;
  readonly assertions: readonly LiteratureAssertionInput[];
};

export type AssertionProvenanceDTO = {
  readonly assertionId: string;
  readonly providerRecordId: string;
  readonly ordinal: number;
};

export type LiteratureAssertionDTO = AssertionProvenanceDTO &
  (
    | {
        readonly kind: "title" | "abstract" | "doi";
        readonly value: string;
      }
    | {
        readonly kind: "publicationYear";
        readonly value: number;
      }
  );

export type LiteratureAssertionHistoryDTO = AssertionProvenanceDTO &
  (
    | {
        readonly kind:
          | "title"
          | "abstract"
          | "doi"
          | "publicationDate"
          | "venue"
          | "publicationType";
        readonly value: string;
      }
    | {
        readonly kind: "publicationYear";
        readonly value: number;
      }
    | {
        readonly kind: "authors";
        readonly value: readonly LiteratureAuthorValue[];
      }
    | {
        readonly kind: "identifiers";
        readonly value: readonly LiteratureIdentifierValue[];
      }
    | {
        readonly kind: "openAccess";
        readonly value: LiteratureOpenAccessValue;
      }
    | {
        readonly kind: "publisher";
        readonly value: LiteraturePublisherValue;
      }
  );

export type ProjectedAssertionValueDTO<TValue> = AssertionProvenanceDTO & {
    readonly value: TValue;
  };

export type LiteratureFieldProjectionDTO<TValue> = {
  readonly current: ProjectedAssertionValueDTO<TValue> | null;
  readonly history: readonly ProjectedAssertionValueDTO<TValue>[];
  readonly conflicts: readonly ProjectedAssertionValueDTO<TValue>[];
};

export type LiteratureProjectionDTO = {
  readonly title: LiteratureFieldProjectionDTO<string>;
  readonly abstract: LiteratureFieldProjectionDTO<string>;
  readonly publicationYear: LiteratureFieldProjectionDTO<number>;
  readonly doi: LiteratureFieldProjectionDTO<string>;
  readonly publicationDate: LiteratureFieldProjectionDTO<string>;
  readonly venue: LiteratureFieldProjectionDTO<string>;
  readonly publicationType: LiteratureFieldProjectionDTO<string>;
  readonly authors: LiteratureFieldProjectionDTO<readonly LiteratureAuthorValue[]>;
  readonly identifiers: LiteratureFieldProjectionDTO<readonly LiteratureIdentifierValue[]>;
  readonly openAccess: LiteratureFieldProjectionDTO<LiteratureOpenAccessValue>;
  readonly publisher: LiteratureFieldProjectionDTO<LiteraturePublisherValue>;
};

export type CreateLiteratureResponse = {
  readonly literature: LiteratureDTO;
};

export type AppendLiteratureAssertionsResponse = {
  readonly literatureId: string;
  readonly providerRecord: ProviderRecordDTO;
  readonly assertions: readonly LiteratureAssertionDTO[];
};

export type GetLiteratureResponse = {
  readonly literature: LiteratureDTO;
  readonly providerRecords: readonly ProviderRecordDTO[];
  readonly projection: LiteratureProjectionDTO;
  readonly assertions?: readonly LiteratureAssertionHistoryDTO[];
  readonly conflictKinds: readonly CanonicalAssertionKind[];
};
