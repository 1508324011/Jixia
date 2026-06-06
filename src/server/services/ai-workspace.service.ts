import {
  AI_WORKSPACE_JOB_KIND,
  aiWorkspaceContract,
  type AiContextItemRecord,
  type AiContextPackDetail,
  type AiContextPackRecord,
  type AiContextSourceRef,
  type AiWorkspaceSessionRecord,
  type CreateAiWorkspaceJobResponse,
  type ListAiContextPacksResponse,
  type ListAiWorkspaceSessionsResponse,
} from '@shared/contracts/ai-workspace';
import type { JobRecord } from '@shared/contracts/jobs';
import type { ScopeRef } from '@shared/contracts/projects';

import type {
  AiWorkspaceRepository,
  PersistedAiContextItemRecord,
  PersistedAiContextPackDetail,
  PersistedAiContextPackRecord,
  PersistedAiContextPackWithSession,
  PersistedAiSessionRecord,
  ProjectDocRepository,
  ProjectRepository,
  SpaceRepository,
} from '../../db';
import type { JobsRoutes } from '../routes/jobs.routes';

import type { LibraryService } from './library.service';
import type { ReadingService } from './reading.service';

export interface AiWorkspaceServiceStore {
  aiWorkspaceRepository: AiWorkspaceRepository;
  jobs: JobsRoutes;
  libraryService: LibraryService;
  projectDocRepository: ProjectDocRepository;
  projectRepository: ProjectRepository;
  readingService: ReadingService;
  spaceRepository: SpaceRepository;
}

export interface CreateAiWorkspaceSessionInput {
  actorUserId: string;
  scope: ScopeRef;
  title?: string;
}

export interface CreateAiContextPackInput {
  actorUserId: string;
  sessionId: string;
  title?: string;
}

export interface AddAiContextItemInput {
  actorUserId: string;
  contextPackId: string;
  source: AiContextSourceRef;
}

export interface CreateAiWorkspaceJobInput {
  actorUserId: string;
  contextPackId: string;
  credentialRef: string;
  instruction?: string;
}

export interface AiWorkspaceService {
  addContextItem(input: AddAiContextItemInput): Promise<AiContextItemRecord>;
  createContextPack(input: CreateAiContextPackInput): Promise<AiContextPackRecord>;
  createJob(input: CreateAiWorkspaceJobInput): Promise<CreateAiWorkspaceJobResponse>;
  createSession(input: CreateAiWorkspaceSessionInput): Promise<AiWorkspaceSessionRecord>;
  getContextPack(
    contextPackId: string,
    actorUserId: string,
  ): Promise<AiContextPackDetail>;
  listContextPacks(
    sessionId: string,
    actorUserId: string,
  ): Promise<ListAiContextPacksResponse>;
  listSessions(
    scope: ScopeRef,
    actorUserId: string,
  ): Promise<ListAiWorkspaceSessionsResponse>;
}

function normalizeTitle(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

function assertValidScope(scope: ScopeRef): void {
  if (
    (scope.type !== 'user' && scope.type !== 'project') ||
    typeof scope.id !== 'string' ||
    scope.id.trim() === ''
  ) {
    throw new Error('AI Workspace scope requires type user/project and a scope id.');
  }
}

function mapSession(session: PersistedAiSessionRecord): AiWorkspaceSessionRecord {
  return {
    createdAt: session.createdAt,
    id: session.id,
    scope: session.scope,
    title: session.title,
    updatedAt: session.updatedAt,
  };
}

function mapPack(pack: PersistedAiContextPackRecord): AiContextPackRecord {
  return {
    createdAt: pack.createdAt,
    id: pack.id,
    itemCount: pack.itemCount,
    sessionId: pack.sessionId,
    title: pack.title,
    updatedAt: pack.updatedAt,
  };
}

function sourceRefFromPersistedItem(
  item: PersistedAiContextItemRecord,
): AiContextSourceRef {
  switch (item.sourceType) {
    case 'projectDocVersion': {
      const projectDocId = item.sourceDocumentId ?? item.sourceId;
      const projectDocVersionId = item.sourceVersionId;

      if (!projectDocVersionId) {
        throw new Error('Project Doc version context item is missing a version reference.');
      }

      return {
        projectDocId,
        projectDocVersionId,
        sourceType: 'projectDocVersion',
      };
    }
    case 'projectLibraryEntry':
      return {
        libraryEntryId: item.sourceLibraryEntryId ?? item.sourceId,
        sourceType: 'projectLibraryEntry',
      };
    case 'readerExcerpt':
      return {
        readerExcerptId: item.sourceId,
        sourceType: 'readerExcerpt',
      };
    case 'projectDocCitation':
      if (!item.sourceDocumentId) {
        throw new Error('Project Doc citation context item is missing a document reference.');
      }

      return {
        citationId: item.sourceId,
        projectDocId: item.sourceDocumentId,
        projectDocVersionId: item.sourceVersionId,
        sourceType: 'projectDocCitation',
      };
    case 'generatedInsight':
      if (!item.sourceLibraryEntryId) {
        throw new Error('Generated insight context item is missing a library entry reference.');
      }

      return {
        generatedInsightId: item.sourceId,
        libraryEntryId: item.sourceLibraryEntryId,
        sourceType: 'generatedInsight',
      };
  }
}

function mapItem(item: PersistedAiContextItemRecord): AiContextItemRecord {
  return {
    contextPackId: item.contextPackId,
    createdAt: item.createdAt,
    id: item.id,
    source: sourceRefFromPersistedItem(item),
  };
}

function mapPackDetail(
  detail: PersistedAiContextPackDetail,
): AiContextPackDetail {
  return {
    contract: aiWorkspaceContract,
    items: detail.items.map(mapItem),
    pack: mapPack(detail.pack),
    session: mapSession(detail.session),
  };
}

function assertCanMutateSession(session: PersistedAiSessionRecord, actorUserId: string): void {
  if (session.scope.type === 'user' && session.scope.id !== actorUserId) {
    throw new Error('Access denied for the requested personal AI Workspace session.');
  }
}

async function authorizeScope(
  store: AiWorkspaceServiceStore,
  input: {
    actorUserId: string;
    requireMutationAccess: boolean;
    scope: ScopeRef;
  },
): Promise<{ projectSpaceId?: string; scope: ScopeRef }> {
  assertValidScope(input.scope);

  if (input.scope.type === 'user') {
    if (input.scope.id !== input.actorUserId) {
      throw new Error('Access denied for the requested personal AI Workspace session.');
    }

    return { scope: input.scope };
  }

  const project = await store.projectRepository.findProject(input.scope.id);

  if (!project) {
    throw new Error(`Project ${input.scope.id} does not exist.`);
  }

  const membership = await store.projectRepository.getProjectMember(
    input.scope.id,
    input.actorUserId,
  );

  if (!membership) {
    throw new Error('Access denied for the requested project AI Workspace session.');
  }

  if (input.requireMutationAccess && membership.role === 'viewer') {
    throw new Error('Access denied for the requested project AI Workspace mutation.');
  }

  return {
    projectSpaceId: project.spaceId,
    scope: input.scope,
  };
}

async function authorizeSession(
  store: AiWorkspaceServiceStore,
  sessionId: string,
  actorUserId: string,
  requireMutationAccess: boolean,
): Promise<PersistedAiSessionRecord> {
  const session = await store.aiWorkspaceRepository.getSession(sessionId);

  if (!session) {
    throw new Error(`AI Workspace session ${sessionId} does not exist.`);
  }

  await authorizeScope(store, {
    actorUserId,
    requireMutationAccess,
    scope: session.scope,
  });
  assertCanMutateSession(session, actorUserId);

  return session;
}

async function authorizePack(
  store: AiWorkspaceServiceStore,
  contextPackId: string,
  actorUserId: string,
  requireMutationAccess: boolean,
): Promise<PersistedAiContextPackWithSession> {
  const pack = await store.aiWorkspaceRepository.getContextPack(contextPackId);

  if (!pack) {
    throw new Error(`AI Workspace context pack ${contextPackId} does not exist.`);
  }

  await authorizeScope(store, {
    actorUserId,
    requireMutationAccess,
    scope: pack.session.scope,
  });
  assertCanMutateSession(pack.session, actorUserId);

  return pack;
}

async function assertProjectDocVersionSource(
  store: AiWorkspaceServiceStore,
  input: {
    actorUserId: string;
    session: PersistedAiSessionRecord;
    source: Extract<AiContextSourceRef, { sourceType: 'projectDocVersion' }>;
  },
): Promise<void> {
  const snapshot = await store.projectDocRepository.getSnapshotByVersionId(
    input.source.projectDocVersionId,
  );

  if (!snapshot || snapshot.document.id !== input.source.projectDocId) {
    throw new Error('Project Doc version context source does not exist.');
  }

  await authorizeScope(store, {
    actorUserId: input.actorUserId,
    requireMutationAccess: false,
    scope: { id: snapshot.document.projectId, type: 'project' },
  });

  if (
    input.session.scope.type === 'project' &&
    snapshot.document.projectId !== input.session.scope.id
  ) {
    throw new Error('Project context items must belong to the AI Workspace project.');
  }
}

async function assertProjectDocCitationSource(
  store: AiWorkspaceServiceStore,
  input: {
    actorUserId: string;
    session: PersistedAiSessionRecord;
    source: Extract<AiContextSourceRef, { sourceType: 'projectDocCitation' }>;
  },
): Promise<string> {
  const citation = await store.projectDocRepository.getCitation(input.source.citationId);

  if (!citation) {
    throw new Error('Project Doc citation context source does not exist.');
  }

  if (
    input.source.projectDocVersionId &&
    citation.projectDocVersionId !== input.source.projectDocVersionId
  ) {
    throw new Error('Project Doc citation source version does not match the citation.');
  }

  const snapshot = await store.projectDocRepository.getSnapshotByVersionId(
    citation.projectDocVersionId,
  );

  if (!snapshot || snapshot.document.id !== input.source.projectDocId) {
    throw new Error('Project Doc citation source does not match its document.');
  }

  await authorizeScope(store, {
    actorUserId: input.actorUserId,
    requireMutationAccess: false,
    scope: { id: snapshot.document.projectId, type: 'project' },
  });

  if (
    input.session.scope.type === 'project' &&
    snapshot.document.projectId !== input.session.scope.id
  ) {
    throw new Error('Project context items must belong to the AI Workspace project.');
  }

  return citation.projectDocVersionId;
}

async function assertLibraryEntrySource(
  store: AiWorkspaceServiceStore,
  input: {
    actorUserId: string;
    session: PersistedAiSessionRecord;
    source: Extract<AiContextSourceRef, { sourceType: 'projectLibraryEntry' }>;
  },
): Promise<void> {
  const view = await store.libraryService.assertCanAccessEntry(
    input.source.libraryEntryId,
    input.actorUserId,
  );

  if (
    input.session.scope.type === 'project' &&
    (view.entry.scope.type !== 'project' || view.entry.scope.id !== input.session.scope.id)
  ) {
    throw new Error('Project context items must already be visible in project AI Workspace scope.');
  }
}

async function assertReaderExcerptSource(
  store: AiWorkspaceServiceStore,
  input: {
    actorUserId: string;
    session: PersistedAiSessionRecord;
    source: Extract<AiContextSourceRef, { sourceType: 'readerExcerpt' }>;
  },
): Promise<string> {
  const source = await store.readingService.getReaderExcerptSource({
    actorUserId: input.actorUserId,
    readerExcerptId: input.source.readerExcerptId,
  });

  if (
    input.session.scope.type === 'project' &&
    (source.sourceEntry.entry.scope.type !== 'project' ||
      source.sourceEntry.entry.scope.id !== input.session.scope.id)
  ) {
    throw new Error('Project context items must already be visible in project AI Workspace scope.');
  }

  return source.sourceEntry.entry.id;
}

async function assertGeneratedInsightSource(
  store: AiWorkspaceServiceStore,
  input: {
    actorUserId: string;
    session: PersistedAiSessionRecord;
    source: Extract<AiContextSourceRef, { sourceType: 'generatedInsight' }>;
  },
): Promise<void> {
  const view = await store.libraryService.assertCanAccessEntry(
    input.source.libraryEntryId,
    input.actorUserId,
  );
  await store.readingService.getGeneratedInsightSource({
    actorUserId: input.actorUserId,
    generatedInsightId: input.source.generatedInsightId,
    libraryEntryId: input.source.libraryEntryId,
  });

  if (
    input.session.scope.type === 'project' &&
    (view.entry.scope.type !== 'project' || view.entry.scope.id !== input.session.scope.id)
  ) {
    throw new Error('Project context items must already be visible in project AI Workspace scope.');
  }
}

async function authorizeSourceRef(
  store: AiWorkspaceServiceStore,
  input: {
    actorUserId: string;
    session: PersistedAiSessionRecord;
    source: AiContextSourceRef;
  },
): Promise<{
  sourceDocumentId?: string;
  sourceId: string;
  sourceLibraryEntryId?: string;
  sourceType: AiContextSourceRef['sourceType'];
  sourceVersionId?: string;
}> {
  switch (input.source.sourceType) {
    case 'projectDocVersion':
      await assertProjectDocVersionSource(store, {
        actorUserId: input.actorUserId,
        session: input.session,
        source: input.source,
      });
      return {
        sourceDocumentId: input.source.projectDocId,
        sourceId: input.source.projectDocId,
        sourceType: 'projectDocVersion',
        sourceVersionId: input.source.projectDocVersionId,
      };
    case 'projectLibraryEntry':
      await assertLibraryEntrySource(store, {
        actorUserId: input.actorUserId,
        session: input.session,
        source: input.source,
      });
      return {
        sourceId: input.source.libraryEntryId,
        sourceLibraryEntryId: input.source.libraryEntryId,
        sourceType: 'projectLibraryEntry',
      };
    case 'readerExcerpt': {
      const sourceLibraryEntryId = await assertReaderExcerptSource(store, {
        actorUserId: input.actorUserId,
        session: input.session,
        source: input.source,
      });
      return {
        sourceId: input.source.readerExcerptId,
        sourceLibraryEntryId,
        sourceType: 'readerExcerpt',
      };
    }
    case 'projectDocCitation': {
      const sourceVersionId = await assertProjectDocCitationSource(store, {
        actorUserId: input.actorUserId,
        session: input.session,
        source: input.source,
      });
      return {
        sourceDocumentId: input.source.projectDocId,
        sourceId: input.source.citationId,
        sourceType: 'projectDocCitation',
        sourceVersionId,
      };
    }
    case 'generatedInsight':
      await assertGeneratedInsightSource(store, {
        actorUserId: input.actorUserId,
        session: input.session,
        source: input.source,
      });
      return {
        sourceId: input.source.generatedInsightId,
        sourceLibraryEntryId: input.source.libraryEntryId,
        sourceType: 'generatedInsight',
      };
  }
}

async function reauthorizePackItems(
  store: AiWorkspaceServiceStore,
  input: {
    actorUserId: string;
    detail: PersistedAiContextPackDetail;
  },
): Promise<AiContextSourceRef[]> {
  const refs: AiContextSourceRef[] = [];

  for (const item of input.detail.items) {
    const source = sourceRefFromPersistedItem(item);
    await authorizeSourceRef(store, {
      actorUserId: input.actorUserId,
      session: input.detail.session,
      source,
    });
    refs.push(source);
  }

  return refs;
}

async function resolveJobSpaceId(
  store: AiWorkspaceServiceStore,
  scope: ScopeRef,
  actorUserId: string,
): Promise<string> {
  if (scope.type === 'project') {
    const project = await store.projectRepository.findProject(scope.id);

    if (!project) {
      throw new Error(`Project ${scope.id} does not exist.`);
    }

    return project.spaceId;
  }

  const spaces = await store.spaceRepository.listSpacesForActor(actorUserId);
  const space = spaces.find((candidate) => candidate.kind === 'personal') ?? spaces[0];

  if (!space) {
    throw new Error('Personal AI Workspace jobs require a server-visible governance space.');
  }

  return space.id;
}

export function createAiWorkspaceService(
  store: AiWorkspaceServiceStore,
): AiWorkspaceService {
  return {
    async addContextItem(
      input: AddAiContextItemInput,
    ): Promise<AiContextItemRecord> {
      const pack = await authorizePack(
        store,
        input.contextPackId,
        input.actorUserId,
        true,
      );
      const source = await authorizeSourceRef(store, {
        actorUserId: input.actorUserId,
        session: pack.session,
        source: input.source,
      });

      return mapItem(
        await store.aiWorkspaceRepository.createContextItem({
          contextPackId: pack.pack.id,
          createdByUserId: input.actorUserId,
          ...source,
        }),
      );
    },
    async createContextPack(
      input: CreateAiContextPackInput,
    ): Promise<AiContextPackRecord> {
      await authorizeSession(store, input.sessionId, input.actorUserId, true);

      return mapPack(
        await store.aiWorkspaceRepository.createContextPack({
          createdByUserId: input.actorUserId,
          sessionId: input.sessionId,
          title: normalizeTitle(input.title, 'Untitled context pack'),
        }),
      );
    },
    async createJob(
      input: CreateAiWorkspaceJobInput,
    ): Promise<CreateAiWorkspaceJobResponse> {
      await authorizePack(store, input.contextPackId, input.actorUserId, true);
      const detail = await store.aiWorkspaceRepository.getContextPackDetail(
        input.contextPackId,
      );

      if (!detail) {
        throw new Error(`AI Workspace context pack ${input.contextPackId} does not exist.`);
      }

      const itemRefs = await reauthorizePackItems(store, {
        actorUserId: input.actorUserId,
        detail,
      });
      const spaceId = await resolveJobSpaceId(
        store,
        detail.session.scope,
        input.actorUserId,
      );
      const payload: Record<string, unknown> = {
        contextPackId: detail.pack.id,
        contextRefs: itemRefs,
        session: {
          id: detail.session.id,
          scope: detail.session.scope,
        },
      };
      const instruction = input.instruction?.trim();

      if (instruction) {
        payload.instruction = instruction;
      }

      const job: JobRecord = await store.jobs.createJob(
        {
          credentialRef: input.credentialRef,
          kind: AI_WORKSPACE_JOB_KIND,
          payload,
          scope: detail.session.scope,
          spaceId,
        },
        input.actorUserId,
      );

      return {
        contextPack: mapPack(detail.pack),
        itemRefs,
        job,
        session: mapSession(detail.session),
      };
    },
    async createSession(
      input: CreateAiWorkspaceSessionInput,
    ): Promise<AiWorkspaceSessionRecord> {
      await authorizeScope(store, {
        actorUserId: input.actorUserId,
        requireMutationAccess: true,
        scope: input.scope,
      });

      return mapSession(
        await store.aiWorkspaceRepository.createSession({
          createdByUserId: input.actorUserId,
          scope: input.scope,
          title: normalizeTitle(input.title, 'Untitled AI Workspace session'),
        }),
      );
    },
    async getContextPack(
      contextPackId: string,
      actorUserId: string,
    ): Promise<AiContextPackDetail> {
      await authorizePack(store, contextPackId, actorUserId, false);
      const detail = await store.aiWorkspaceRepository.getContextPackDetail(contextPackId);

      if (!detail) {
        throw new Error(`AI Workspace context pack ${contextPackId} does not exist.`);
      }

      return mapPackDetail(detail);
    },
    async listContextPacks(
      sessionId: string,
      actorUserId: string,
    ): Promise<ListAiContextPacksResponse> {
      const session = await authorizeSession(store, sessionId, actorUserId, false);

      return {
        contract: aiWorkspaceContract,
        packs: (await store.aiWorkspaceRepository.listContextPacks(sessionId)).map(mapPack),
        session: mapSession(session),
      };
    },
    async listSessions(
      scope: ScopeRef,
      actorUserId: string,
    ): Promise<ListAiWorkspaceSessionsResponse> {
      const context = await authorizeScope(store, {
        actorUserId,
        requireMutationAccess: false,
        scope,
      });

      return {
        contract: aiWorkspaceContract,
        sessions: (await store.aiWorkspaceRepository.listSessionsForScope(
          context.scope,
        )).map(mapSession),
      };
    },
  };
}
