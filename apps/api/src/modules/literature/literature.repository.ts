import type {
  LiteratureAssertionDTO,
  LiteratureAssertionInput,
  LiteratureSummaryDTO,
  ProjectRole,
  ProviderIdentity,
  SpaceRole
} from "@jixia/shared";

import type { StoredCanonicalLiteratureAssertion } from "./literature.stored-assertion.js";

export type LiteratureActor = {
  readonly userId: string;
  readonly spaceId: string;
  readonly spaceRole: SpaceRole;
};

export type LiteratureListScope =
  | { readonly kind: "personal" }
  | { readonly kind: "project"; readonly projectId: string };

export type LiteratureListAnchor = {
  readonly createdAt: Date;
  readonly id: string;
};

export type LiteratureAccessDecision = "allow" | "not-found" | "forbidden";

type PersonalLiteratureAccessInput = {
  readonly operation: "read" | "append";
  readonly actor: LiteratureActor;
  readonly scope: {
    readonly kind: "personal";
    readonly ownerUserId: string;
  };
};

type ProjectLiteratureAccessInput = {
  readonly operation: "create" | "read" | "append";
  readonly actor: LiteratureActor;
  readonly scope: {
    readonly kind: "project";
    readonly projectId: string;
    readonly projectSpaceId: string;
    readonly activeSpaceMember: boolean;
    readonly projectRole: ProjectRole | null;
  };
};

export type LiteratureAccessInput =
  | PersonalLiteratureAccessInput
  | ProjectLiteratureAccessInput;

function assertNever(value: never): never {
  throw new Error(`Unhandled literature access variant: ${String(value)}`);
}

export function authorizeLiteratureAccess(
  input: LiteratureAccessInput
): LiteratureAccessDecision {
  switch (input.scope.kind) {
    case "personal":
      return input.scope.ownerUserId === input.actor.userId ? "allow" : "not-found";
    case "project": {
      if (
        input.scope.projectSpaceId !== input.actor.spaceId ||
        !input.scope.activeSpaceMember ||
        input.scope.projectRole === null
      ) {
        return "not-found";
      }

      if (input.operation === "read") {
        return "allow";
      }

      switch (input.scope.projectRole) {
        case "ProjectOwner":
        case "ProjectEditor":
          return "allow";
        case "ProjectViewer":
          return "forbidden";
        default:
          return assertNever(input.scope.projectRole);
      }
    }
    default:
      return assertNever(input.scope);
  }
}

export type LiteratureRecord = {
  readonly id: string;
  readonly ownerUserId: string | null;
  readonly projectId: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
};

export type ProviderRecord = {
  readonly id: string;
  readonly literatureId: string;
  readonly providerKey: string;
  readonly recordKey: string;
  readonly createdByUserId: string;
  readonly createdAt: Date;
};

export type LiteratureProjectRecord = {
  readonly id: string;
  readonly spaceId: string;
};

export type LiteratureProjectMembershipRecord = {
  readonly role: ProjectRole;
};

export type CreateLiteratureRepositoryInput = {
  readonly actor: LiteratureActor;
  readonly scope:
    | {
        readonly kind: "personal";
      }
    | {
        readonly kind: "project";
        readonly projectId: string;
      };
};

export type AppendLiteratureRepositoryInput = {
  readonly actor: LiteratureActor;
  readonly literatureId: string;
  readonly provider: ProviderIdentity;
  readonly assertions: readonly LiteratureAssertionInput[];
};

export type AppendLiteratureRepositoryResult = {
  readonly literatureId: string;
  readonly providerRecord: ProviderRecord;
  readonly assertions: readonly LiteratureAssertionDTO[];
};

export type LiteratureSnapshot = {
  readonly literature: LiteratureRecord;
  readonly providerRecords: readonly ProviderRecord[];
  readonly assertions: readonly StoredCanonicalLiteratureAssertion[];
};

export type LiteratureLibraryCurrentValues = Pick<
  LiteratureSummaryDTO,
  "title" | "authors" | "publicationYear" | "publicationDate" |
  "venue" | "doi" | "openAccess" | "publisher"
>;

export type LiteratureLibraryRecord = {
  readonly literature: LiteratureRecord;
  readonly current: LiteratureLibraryCurrentValues;
  readonly providerRecordCount: number;
  readonly latestAssertionCreatedAt: Date | null;
  readonly conflictKinds: LiteratureSummaryDTO["conflictKinds"];
};

export interface LiteratureRepository {
  createLiterature(input: CreateLiteratureRepositoryInput): Promise<LiteratureRecord>;
  appendLiteratureAssertions(
    input: AppendLiteratureRepositoryInput
  ): Promise<AppendLiteratureRepositoryResult>;
  getLiteratureSnapshot(input: {
    readonly actor: LiteratureActor;
    readonly literatureId: string;
  }): Promise<LiteratureSnapshot>;
  listLiteraturePage(input: {
    readonly actor: LiteratureActor;
    readonly scope: LiteratureListScope;
    readonly limit: number;
    readonly anchor: LiteratureListAnchor | null;
  }): Promise<readonly LiteratureLibraryRecord[]>;
}
