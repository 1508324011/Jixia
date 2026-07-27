import type {
  LiteratureAssertionDTO,
  LiteratureAssertionInput
} from "@jixia/shared";

import type { LiteratureRecord, ProviderRecord } from "./literature.repository.js";
import type { StoredCanonicalLiteratureAssertion } from "./literature.stored-assertion.js";
import type {
  LiteratureAuditEventInput,
  LiteratureTransaction,
  LiteratureTransactionRunner,
  ProjectAccessScope
} from "./literature.transaction.js";

type FakeState = {
  literatures: LiteratureRecord[];
  nextOrdinals: Map<string, number>;
  providerRecords: ProviderRecord[];
  assertions: StoredCanonicalLiteratureAssertion[];
  audits: LiteratureAuditEventInput[];
};

export const actor = {
  userId: "user-owner",
  spaceId: "space-1",
  spaceRole: "SpaceMember"
} as const;

export class FakeTransactionRunner implements LiteratureTransactionRunner {
  readonly state: FakeState = {
    literatures: [],
    nextOrdinals: new Map(),
    providerRecords: [],
    assertions: [],
    audits: []
  };
  failAudit = false;
  lastIsolationLevel: "RepeatableRead" | undefined;
  lastProjectAccessMode: "read" | "mutation" | undefined;
  lastLiteratureAccessMode: "read" | "mutation" | undefined;
  projectAccess: ProjectAccessScope | null = null;

  async run<T>(
    work: (transaction: LiteratureTransaction) => Promise<T>,
    options?: { readonly isolationLevel?: "RepeatableRead" }
  ): Promise<T> {
    this.lastIsolationLevel = options?.isolationLevel;
    const working = structuredClone(this.state);
    const result = await work(this.createTransaction(working));
    this.state.literatures = working.literatures;
    this.state.nextOrdinals = working.nextOrdinals;
    this.state.providerRecords = working.providerRecords;
    this.state.assertions = working.assertions;
    this.state.audits = working.audits;
    return result;
  }

  private createTransaction(state: FakeState): LiteratureTransaction {
    return {
      findProjectAccess: async ({ mode }) => {
        this.lastProjectAccessMode = mode;
        return this.projectAccess;
      },
      findLiteratureAccess: async ({ literatureId, mode }) => {
        this.lastLiteratureAccessMode = mode;
        const literature = state.literatures.find((item) => item.id === literatureId);
        if (literature === undefined) {
          return null;
        }
        if (literature.ownerUserId !== null) {
          return { literature, scope: { kind: "personal", ownerUserId: literature.ownerUserId } };
        }
        return {
          literature,
          scope: {
            kind: "project",
            projectId: literature.projectId ?? "missing-project",
            projectSpaceId: actor.spaceId,
            activeSpaceMember: true,
            projectRole: "ProjectOwner"
          }
        };
      },
      createLiterature: async (input) => {
        const literature = {
          id: `literature-${state.literatures.length + 1}`,
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
          createdByUserId: input.createdByUserId,
          createdAt: new Date("2026-07-17T00:00:00.000Z")
        };
        state.literatures.push(literature);
        state.nextOrdinals.set(literature.id, 1);
        return literature;
      },
      allocateAssertionOrdinals: async ({ literatureId, count }) => {
        const firstOrdinal = state.nextOrdinals.get(literatureId) ?? 1;
        state.nextOrdinals.set(literatureId, firstOrdinal + count);
        return firstOrdinal;
      },
      findProviderRecord: async (input) =>
        state.providerRecords.find(
          (record) =>
            record.literatureId === input.literatureId &&
            record.providerKey === input.provider.providerKey &&
            record.recordKey === input.provider.recordKey
        ) ?? null,
      createProviderRecord: async (input) => {
        const record = {
          id: `provider-${state.providerRecords.length + 1}`,
          literatureId: input.literatureId,
          providerKey: input.provider.providerKey,
          recordKey: input.provider.recordKey,
          createdByUserId: input.createdByUserId,
          createdAt: new Date("2026-07-17T00:01:00.000Z")
        };
        state.providerRecords.push(record);
        return record;
      },
      createAssertion: async (input) => {
        const created = createAssertion(input, state.assertions.length + 1);
        state.assertions.push(created.stored);
        return created.dto;
      },
      listProviderRecords: async ({ literatureId }) =>
        state.providerRecords.filter((record) => record.literatureId === literatureId),
      listAssertions: async ({ literatureId }) =>
        state.assertions.filter((assertion) => assertion.literatureId === literatureId),
      listLiteraturePage: async (input) => {
        const records = state.literatures
          .filter((literature) => input.scope.kind === "personal"
            ? literature.ownerUserId === input.userId && literature.projectId === null
            : literature.ownerUserId === null && literature.projectId === input.scope.projectId)
          .filter((literature) => input.anchor === null ||
            literature.createdAt < input.anchor.createdAt ||
            (literature.createdAt.getTime() === input.anchor.createdAt.getTime() &&
              literature.id < input.anchor.id))
          .sort((left, right) =>
            right.createdAt.getTime() - left.createdAt.getTime() ||
            right.id.localeCompare(left.id)
          )
          .slice(0, input.limit);
        return records.map((literature) => {
          const providerRecords = state.providerRecords.filter(
            (record) => record.literatureId === literature.id
          );
          const assertions = state.assertions.filter(
            (assertion) => assertion.literatureId === literature.id
          );
          const latestAssertionCreatedAt = assertions.reduce<Date | null>(
            (latest, assertion) => latest === null || assertion.createdAt > latest
              ? assertion.createdAt
              : latest,
            null
          );
          return {
            literature,
            current: {
              title: null,
              authors: [],
              publicationYear: null,
              publicationDate: null,
              venue: null,
              doi: null,
              openAccess: null,
              publisher: null
            },
            providerRecordCount: providerRecords.length,
            latestAssertionCreatedAt,
            conflictKinds: []
          };
        });
      },
      writeAuditEvent: async (input) => {
        if (this.failAudit) {
          throw new Error("audit unavailable");
        }
        state.audits.push(input);
      }
    };
  }
}

function createAssertion(
  input: {
    readonly literatureId: string;
    readonly providerRecordId: string;
    readonly createdByUserId: string;
    readonly ordinal: number;
    readonly assertion: LiteratureAssertionInput;
  },
  sequence: number
): { readonly dto: LiteratureAssertionDTO; readonly stored: StoredCanonicalLiteratureAssertion } {
  const common = {
    assertionId: `assertion-${sequence}`,
    providerRecordId: input.providerRecordId,
    ordinal: input.ordinal
  };
  const storedCommon = {
    id: common.assertionId,
    literatureId: input.literatureId,
    providerRecordId: input.providerRecordId,
    ordinal: input.ordinal,
    structuredItemCount: null,
    valueFingerprint: null,
    createdAt: new Date("2026-07-17T00:02:00.000Z"),
    authors: [],
    identifiers: [],
    openAccess: null,
    publisher: null
  };

  switch (input.assertion.kind) {
    case "title":
    case "abstract":
    case "doi":
      return {
        dto: { ...common, kind: input.assertion.kind, value: input.assertion.value },
        stored: {
          ...storedCommon,
          kind: input.assertion.kind,
          textValue: input.assertion.value,
          integerValue: null
        }
      };
    case "publicationYear":
      return {
        dto: { ...common, kind: input.assertion.kind, value: input.assertion.value },
        stored: {
          ...storedCommon,
          kind: input.assertion.kind,
          textValue: null,
          integerValue: input.assertion.value
        }
      };
    default: {
      const unreachable: never = input.assertion;
      throw unreachable;
    }
  }
}
