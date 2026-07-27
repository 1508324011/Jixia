import {
  assertionKindOrder,
  providerKeyMaxLength,
  providerRecordKeyMaxLength,
  type AppendLiteratureAssertionsRequest,
  type AppendLiteratureAssertionsResponse,
  type CreateLiteratureRequest,
  type CreateLiteratureResponse,
  type GetLiteratureResponse,
  type ListLiteratureRequest,
  type ListLiteratureResponse,
  type LiteratureAssertionInput,
  type LiteratureDTO,
  type ProviderIdentity,
  type ProviderRecordDTO
} from "@jixia/shared";

import {
  isCanonicalLiteratureDoi,
  normalizeLiteratureDoi,
  normalizeLiteratureText
} from "./literature.normalization.js";
import { LiteratureError } from "./literature.errors.js";
import { projectLiteratureHistory } from "./literature.history-projection.js";
import { listLiteratureLibrary } from "./literature.library-service.js";
import type { LiteratureLibraryCursorCodec } from "./literature.library-cursor.js";
import type {
  LiteratureActor,
  LiteratureRecord,
  LiteratureRepository,
  ProviderRecord
} from "./literature.repository.js";

export type {
  AppendLiteratureRepositoryInput,
  AppendLiteratureRepositoryResult,
  CreateLiteratureRepositoryInput,
  LiteratureActor,
  LiteratureRecord,
  LiteratureRepository,
  LiteratureSnapshot
} from "./literature.repository.js";

export { LiteratureError } from "./literature.errors.js";

export type LiteratureService = {
  createLiterature(input: {
    readonly actor: LiteratureActor;
    readonly request: CreateLiteratureRequest;
  }): Promise<CreateLiteratureResponse>;
  appendAssertions(input: {
    readonly actor: LiteratureActor;
    readonly literatureId: string;
    readonly request: AppendLiteratureAssertionsRequest;
  }): Promise<AppendLiteratureAssertionsResponse>;
  getLiterature(input: {
    readonly actor: LiteratureActor;
    readonly literatureId: string;
  }): Promise<GetLiteratureResponse>;
  listLiterature(input: {
    readonly actor: LiteratureActor;
    readonly request: ListLiteratureRequest;
  }): Promise<ListLiteratureResponse>;
};

export function createLiteratureService(
  repository: LiteratureRepository,
  options: { readonly libraryCursorCodec?: LiteratureLibraryCursorCodec } = {}
): LiteratureService {
  return {
    async createLiterature(input): Promise<CreateLiteratureResponse> {
      const scope =
        input.request.scope === "personal"
          ? { kind: "personal" as const }
          : {
              kind: "project" as const,
              projectId: normalizeIdentifier(input.request.projectId, 64, "projectId")
            };
      const literature = await repository.createLiterature({ actor: input.actor, scope });
      return { literature: toLiteratureDTO(literature) };
    },

    async appendAssertions(input): Promise<AppendLiteratureAssertionsResponse> {
      const literatureId = normalizeIdentifier(input.literatureId, 64, "literatureId");
      const provider = normalizeProvider(input.request.provider);
      const assertions = normalizeAssertions(input.request.assertions);
      const result = await repository.appendLiteratureAssertions({
        actor: input.actor,
        literatureId,
        provider,
        assertions
      });

      return {
        literatureId: result.literatureId,
        providerRecord: toProviderRecordDTO(result.providerRecord),
        assertions: result.assertions
      };
    },

    async getLiterature(input): Promise<GetLiteratureResponse> {
      const snapshot = await repository.getLiteratureSnapshot({
        actor: input.actor,
        literatureId: normalizeIdentifier(input.literatureId, 64, "literatureId")
      });

      const history = projectLiteratureHistory({
        literatureId: snapshot.literature.id,
        providerRecords: snapshot.providerRecords,
        assertions: snapshot.assertions
      });
      return {
        literature: toLiteratureDTO(snapshot.literature),
        providerRecords: snapshot.providerRecords.map(toProviderRecordDTO),
        projection: history.projection,
        assertions: history.assertions,
        conflictKinds: history.conflictKinds
      };
    },

    async listLiterature(input): Promise<ListLiteratureResponse> {
      return listLiteratureLibrary({
        repository,
        cursorCodec: options.libraryCursorCodec,
        actor: input.actor,
        request: input.request
      });
    }
  };
}

function normalizeProvider(provider: ProviderIdentity): ProviderIdentity {
  return {
    providerKey: normalizeIdentifier(
      provider.providerKey,
      providerKeyMaxLength,
      "providerKey"
    ).toLowerCase(),
    recordKey: normalizeIdentifier(provider.recordKey, providerRecordKeyMaxLength, "recordKey")
  };
}

function normalizeAssertions(
  assertions: readonly LiteratureAssertionInput[]
): readonly LiteratureAssertionInput[] {
  if (assertions.length < 1 || assertions.length > 4) {
    throw badRequest("Assertion batches must contain between one and four assertions");
  }

  const seenKinds = new Set<string>();
  const normalized = assertions.map((assertion) => {
    if (seenKinds.has(assertion.kind)) {
      throw badRequest("Assertion batches cannot repeat a kind");
    }
    seenKinds.add(assertion.kind);
    return normalizeAssertion(assertion);
  });

  return normalized.sort(
    (left, right) => assertionKindOrder[left.kind] - assertionKindOrder[right.kind]
  );
}

function normalizeAssertion(assertion: LiteratureAssertionInput): LiteratureAssertionInput {
  switch (assertion.kind) {
    case "title":
    case "abstract":
      return {
        kind: assertion.kind,
        value: normalizeText(assertion.value, assertion.kind)
      };
    case "publicationYear":
      if (!Number.isInteger(assertion.value) || assertion.value < 1000 || assertion.value > 9999) {
        throw badRequest("publicationYear must be an integer between 1000 and 9999");
      }
      return assertion;
    case "doi": {
      const value = normalizeLiteratureDoi(assertion.value);
      if (!isCanonicalLiteratureDoi(value)) {
        throw badRequest("doi must be a canonical DOI identifier");
      }
      return { kind: assertion.kind, value };
    }
    default: {
      const unreachable: never = assertion;
      throw unreachable;
    }
  }
}

function normalizeText(value: string, field: string): string {
  const normalized = normalizeLiteratureText(value);
  if (normalized.length === 0) {
    throw badRequest(`${field} must not be empty`);
  }
  return normalized;
}

function normalizeIdentifier(value: string, maximumLength: number, field: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximumLength) {
    throw badRequest(`${field} is invalid`);
  }
  return normalized;
}

function toLiteratureDTO(record: LiteratureRecord): LiteratureDTO {
  const common = {
    id: record.id,
    createdByUserId: record.createdByUserId,
    createdAt: record.createdAt.toISOString()
  };

  if (record.ownerUserId !== null && record.projectId === null) {
    return {
      ...common,
      scope: { kind: "personal", ownerUserId: record.ownerUserId }
    };
  }
  if (record.ownerUserId === null && record.projectId !== null) {
    return {
      ...common,
      scope: { kind: "project", projectId: record.projectId }
    };
  }
  throw new LiteratureError("Invalid persisted literature ownership", 500);
}

function toProviderRecordDTO(record: ProviderRecord): ProviderRecordDTO {
  return {
    ...record,
    createdAt: record.createdAt.toISOString()
  };
}

function badRequest(message: string): LiteratureError {
  return new LiteratureError(message, 400);
}
