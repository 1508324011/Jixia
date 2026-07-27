import {
  literatureLibraryDefaultLimit,
  literatureLibraryMaxLimit,
  type ListLiteratureRequest,
  type ListLiteratureResponse,
  type LiteratureSummaryDTO
} from "@jixia/shared";

import { LiteratureError } from "./literature.errors.js";
import {
  fingerprintLiteratureLibraryRequest,
  LiteratureLibraryCursorError,
  type LiteratureLibraryCursorCodec
} from "./literature.library-cursor.js";
import type {
  LiteratureActor,
  LiteratureLibraryRecord,
  LiteratureListScope,
  LiteratureRepository
} from "./literature.repository.js";

export async function listLiteratureLibrary(input: {
  readonly repository: LiteratureRepository;
  readonly cursorCodec: LiteratureLibraryCursorCodec | undefined;
  readonly actor: LiteratureActor;
  readonly request: ListLiteratureRequest;
}): Promise<ListLiteratureResponse> {
  if (input.cursorCodec === undefined) {
    throw new LiteratureError("Literature library unavailable", 503);
  }
  const limit = input.request.limit ?? literatureLibraryDefaultLimit;
  if (!Number.isInteger(limit) || limit < 1 || limit > literatureLibraryMaxLimit) {
    throw new LiteratureError("Invalid request", 400);
  }
  const scope = normalizeScope(input.request);
  const requestFingerprint = fingerprintLiteratureLibraryRequest({
    actor: input.actor,
    scope,
    limit
  });
  const anchor = decodeAnchor(input.cursorCodec, input.request.cursor, {
    requestFingerprint,
    limit
  });
  const records = await input.repository.listLiteraturePage({
    actor: input.actor,
    scope,
    limit: limit + 1,
    anchor
  });
  const page = records.slice(0, limit);
  const last = page[page.length - 1];
  return {
    literature: page.map(toLiteratureSummary),
    nextCursor: records.length > limit && last !== undefined
      ? input.cursorCodec.encode({
          requestFingerprint,
          limit,
          anchor: { createdAt: last.literature.createdAt, id: last.literature.id }
        })
      : null
  };
}

function normalizeScope(request: ListLiteratureRequest): LiteratureListScope {
  if (request.scope === "personal") {
    return { kind: "personal" };
  }
  const projectId = request.projectId.trim();
  if (projectId.length === 0 || projectId.length > 64) {
    throw new LiteratureError("Invalid request", 400);
  }
  return { kind: "project", projectId };
}

function decodeAnchor(
  codec: LiteratureLibraryCursorCodec,
  cursor: string | undefined,
  expected: { readonly requestFingerprint: string; readonly limit: number }
) {
  if (cursor === undefined) {
    return null;
  }
  try {
    return codec.decode(cursor, expected);
  } catch (error) {
    if (error instanceof LiteratureLibraryCursorError) {
      throw new LiteratureError("invalid_cursor", 400);
    }
    throw error;
  }
}

function toLiteratureSummary(record: LiteratureLibraryRecord): LiteratureSummaryDTO {
  const scope = record.literature.ownerUserId !== null && record.literature.projectId === null
    ? { kind: "personal" as const, ownerUserId: record.literature.ownerUserId }
    : record.literature.ownerUserId === null && record.literature.projectId !== null
      ? { kind: "project" as const, projectId: record.literature.projectId }
      : null;
  if (
    scope === null || !Number.isInteger(record.providerRecordCount) ||
    record.providerRecordCount < 0
  ) {
    throw new LiteratureError("Invalid persisted literature aggregate", 500);
  }
  const updatedAt = record.latestAssertionCreatedAt !== null &&
    record.latestAssertionCreatedAt > record.literature.createdAt
    ? record.latestAssertionCreatedAt
    : record.literature.createdAt;
  return {
    id: record.literature.id,
    scope,
    ...record.current,
    provenanceCount: record.providerRecordCount,
    conflictKinds: record.conflictKinds,
    createdAt: record.literature.createdAt.toISOString(),
    updatedAt: updatedAt.toISOString()
  };
}
