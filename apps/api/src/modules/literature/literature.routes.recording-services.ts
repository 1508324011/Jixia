import type {
  ListLiteratureRequest,
  ListLiteratureResponse,
  LiteratureProjectionDTO
} from "@jixia/shared";

import type { LiteratureDiscoveryService } from "./discovery/discovery.service.js";
import type { LiteratureActor, LiteratureService } from "./literature.service.js";

const now = new Date("2026-07-17T08:00:00.000Z");

const emptyProjection: LiteratureProjectionDTO = {
  title: { current: null, history: [], conflicts: [] },
  abstract: { current: null, history: [], conflicts: [] },
  publicationYear: { current: null, history: [], conflicts: [] },
  doi: { current: null, history: [], conflicts: [] },
  publicationDate: { current: null, history: [], conflicts: [] },
  venue: { current: null, history: [], conflicts: [] },
  publicationType: { current: null, history: [], conflicts: [] },
  authors: { current: null, history: [], conflicts: [] },
  identifiers: { current: null, history: [], conflicts: [] },
  openAccess: { current: null, history: [], conflicts: [] },
  publisher: { current: null, history: [], conflicts: [] }
};

export class RecordingLiteratureService implements LiteratureService {
  readonly createCalls: Parameters<LiteratureService["createLiterature"]>[0][] = [];
  readonly appendCalls: Parameters<LiteratureService["appendAssertions"]>[0][] = [];
  readonly getCalls: Parameters<LiteratureService["getLiterature"]>[0][] = [];
  readonly listCalls: {
    readonly actor: LiteratureActor;
    readonly request: ListLiteratureRequest;
  }[] = [];
  getError: Error | null = null;
  listError: Error | null = null;
  listResponse: ListLiteratureResponse = {
    literature: [{
      id: "literature-1",
      scope: { kind: "personal", ownerUserId: "user-1" },
      title: "A paper",
      authors: [{ displayName: "Ada Lovelace" }],
      publicationYear: 2026,
      publicationDate: "2026-07-20",
      venue: "Jixia Journal",
      doi: "10.1000/jixia",
      openAccess: { isOpenAccess: true },
      publisher: { name: "Jixia Press" },
      provenanceCount: 1,
      conflictKinds: [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    }],
    nextCursor: null
  };

  async createLiterature(input: Parameters<LiteratureService["createLiterature"]>[0]) {
    this.createCalls.push(input);
    return {
      literature: {
        id: "literature-1",
        scope: { kind: "personal" as const, ownerUserId: input.actor.userId },
        createdByUserId: input.actor.userId,
        createdAt: now.toISOString()
      }
    };
  }

  async appendAssertions(input: Parameters<LiteratureService["appendAssertions"]>[0]) {
    this.appendCalls.push(input);
    return {
      literatureId: input.literatureId,
      providerRecord: {
        id: "provider-record-1",
        literatureId: input.literatureId,
        providerKey: input.request.provider.providerKey,
        recordKey: input.request.provider.recordKey,
        createdByUserId: input.actor.userId,
        createdAt: now.toISOString()
      },
      assertions: [{
        assertionId: "assertion-1",
        providerRecordId: "provider-record-1",
        ordinal: 1,
        kind: "title" as const,
        value: "A paper"
      }]
    };
  }

  async getLiterature(input: Parameters<LiteratureService["getLiterature"]>[0]) {
    this.getCalls.push(input);
    if (this.getError) throw this.getError;
    return {
      literature: {
        id: input.literatureId,
        scope: { kind: "personal" as const, ownerUserId: input.actor.userId },
        createdByUserId: input.actor.userId,
        createdAt: now.toISOString()
      },
      providerRecords: [],
      projection: emptyProjection,
      conflictKinds: []
    };
  }

  async listLiterature(input: {
    readonly actor: LiteratureActor;
    readonly request: ListLiteratureRequest;
  }): Promise<ListLiteratureResponse> {
    this.listCalls.push(input);
    if (this.listError !== null) throw this.listError;
    return this.listResponse;
  }
}

export class RecordingDiscoveryService implements LiteratureDiscoveryService {
  readonly calls: Parameters<LiteratureDiscoveryService["search"]>[0][] = [];
  response: Awaited<ReturnType<LiteratureDiscoveryService["search"]>> = {
    candidates: [],
    providerStatuses: [
      { providerKey: "openalex", status: "succeeded", resultCount: 0 },
      { providerKey: "crossref", status: "succeeded", resultCount: 0 },
      { providerKey: "pubmed", status: "succeeded", resultCount: 0 }
    ],
    nextCursor: null
  };
  error: Error | null = null;

  async search(input: Parameters<LiteratureDiscoveryService["search"]>[0]) {
    this.calls.push(input);
    if (this.error !== null) throw this.error;
    return this.response;
  }
}
