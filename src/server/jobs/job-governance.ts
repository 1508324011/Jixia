import type { ScopeRef } from '@shared/contracts/projects';

import type {
  JobRepository,
  PersistedJobRecord,
  PersistedJobScopeRef,
  ProjectRepository,
  SpaceRepository,
} from '../../db';

export interface JobAccessRequest {
  actorUserId: string;
  actorSpaceId?: string;
  jobId: string;
}

export interface JobScopeQuery {
  actorSpaceId?: string;
  actorUserId: string;
  scope?: ScopeRef;
  scopeId?: string;
  scopeType?: ScopeRef['type'];
  spaceId?: string;
}

export interface JobGovernanceStore {
  jobRepository: JobRepository;
  projectRepository: ProjectRepository;
  spaceRepository: SpaceRepository;
}

export interface AuthorizedJobCreateScopeContext {
  scope: PersistedJobScopeRef;
  spaceId: string;
}

export interface AuthorizedJobListScopeContext {
  scope: PersistedJobScopeRef;
  spaceIdFilter?: string;
}

export type JobAccessOperation = 'read' | 'run';

const SAFE_JOB_PAYLOAD_KEYS = new Set(['credentialref']);
const SENSITIVE_JOB_PAYLOAD_SUFFIXES = [
  'apikey',
  'secret',
  'token',
  'password',
  'privatekey',
];

function normalizeKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function isSensitivePayloadKey(key: string): boolean {
  const normalized = normalizeKey(key);

  if (SAFE_JOB_PAYLOAD_KEYS.has(normalized)) {
    return false;
  }

  return SENSITIVE_JOB_PAYLOAD_SUFFIXES.some((suffix) =>
    normalized.endsWith(suffix),
  );
}

function assertValidScopeRef(scope: ScopeRef): PersistedJobScopeRef {
  if (
    (scope.type !== 'user' && scope.type !== 'project') ||
    typeof scope.id !== 'string' ||
    scope.id.trim() === ''
  ) {
    throw new Error('Job scope requires type user/project and a scope id.');
  }

  return {
    id: scope.id,
    type: scope.type,
  };
}

function assertSpaceContextMatches(
  expectedSpaceId: string | undefined,
  claimedSpaceId: string | undefined,
): void {
  if (expectedSpaceId && claimedSpaceId && expectedSpaceId !== claimedSpaceId) {
    throw new Error(
      'Request space context does not match the requested resource space.',
    );
  }
}

function assertAllSpaceContextsMatch(
  expectedSpaceId: string,
  ...claimedSpaceIds: Array<string | undefined>
): void {
  for (const claimedSpaceId of claimedSpaceIds) {
    assertSpaceContextMatches(expectedSpaceId, claimedSpaceId);
  }
}

async function resolveProjectScopeContext(
  store: JobGovernanceStore,
  scope: PersistedJobScopeRef,
  actorUserId: string,
  compatibilitySpaceIds: Array<string | undefined>,
  requireMutationAccess: boolean,
): Promise<AuthorizedJobCreateScopeContext> {
  const project = await store.projectRepository.findProject(scope.id);

  if (!project) {
    throw new Error(`Project ${scope.id} does not exist.`);
  }

  const membership = await store.projectRepository.getProjectMember(
    scope.id,
    actorUserId,
  );

  if (!membership) {
    throw new Error('Access denied for the requested project job.');
  }

  if (requireMutationAccess && membership.role === 'viewer') {
    throw new Error('Access denied for the requested project job mutation.');
  }

  assertAllSpaceContextsMatch(project.spaceId, ...compatibilitySpaceIds);

  return {
    scope,
    spaceId: project.spaceId,
  };
}

async function resolveUserCreateScopeContext(
  store: JobGovernanceStore,
  scope: PersistedJobScopeRef,
  actorUserId: string,
  spaceId: string | undefined,
): Promise<AuthorizedJobCreateScopeContext> {
  if (scope.id !== actorUserId) {
    throw new Error('Access denied for the requested personal job scope.');
  }

  if (!spaceId?.trim()) {
    throw new Error('User-scoped jobs require a governance space context.');
  }

  const space = await store.spaceRepository.findSpace(spaceId);

  if (!space) {
    throw new Error(`Space ${spaceId} does not exist.`);
  }

  await store.spaceRepository.denyNonMember(spaceId, actorUserId);

  return {
    scope,
    spaceId,
  };
}

async function resolveUserListScopeContext(
  store: JobGovernanceStore,
  scope: PersistedJobScopeRef,
  actorUserId: string,
  actorSpaceId: string | undefined,
  spaceIdFilter: string | undefined,
): Promise<AuthorizedJobListScopeContext> {
  if (scope.id !== actorUserId) {
    throw new Error('Access denied for the requested personal job scope.');
  }

  if (!spaceIdFilter) {
    return { scope };
  }

  const space = await store.spaceRepository.findSpace(spaceIdFilter);

  if (!space) {
    throw new Error(`Space ${spaceIdFilter} does not exist.`);
  }

  assertSpaceContextMatches(spaceIdFilter, actorSpaceId);
  await store.spaceRepository.denyNonMember(spaceIdFilter, actorUserId);

  return {
    scope,
    spaceIdFilter,
  };
}

export function assertSafeJobPayload(
  payload: Record<string, unknown>,
  path = 'payload',
): void {
  for (const [key, value] of Object.entries(payload)) {
    const currentPath = `${path}.${key}`;

    if (isSensitivePayloadKey(key)) {
      throw new Error(
        `Job payload must not contain raw secrets. Found disallowed key at ${currentPath}.`,
      );
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (item && typeof item === 'object') {
          assertSafeJobPayload(
            item as Record<string, unknown>,
            `${currentPath}[${index}]`,
          );
        }
      });
      continue;
    }

    if (value && typeof value === 'object') {
      assertSafeJobPayload(value as Record<string, unknown>, currentPath);
    }
  }
}

export function normalizeJobScope(
  input: Pick<JobScopeQuery, 'scope' | 'scopeId' | 'scopeType'>,
  actorUserId: string,
): PersistedJobScopeRef {
  if (input.scope) {
    return assertValidScopeRef(input.scope);
  }

  if (input.scopeType || input.scopeId) {
    return assertValidScopeRef({
      id: input.scopeId ?? '',
      type: (input.scopeType ?? 'user') as ScopeRef['type'],
    });
  }

  return {
    id: actorUserId,
    type: 'user',
  };
}

export async function resolveAuthorizedCreateJobScopeContext(
  store: JobGovernanceStore,
  input: Pick<JobScopeQuery, 'actorUserId' | 'scope' | 'spaceId'>,
): Promise<AuthorizedJobCreateScopeContext> {
  const scope = normalizeJobScope(input, input.actorUserId);

  if (scope.type === 'project') {
    return resolveProjectScopeContext(
      store,
      scope,
      input.actorUserId,
      [input.spaceId],
      true,
    );
  }

  return resolveUserCreateScopeContext(
    store,
    scope,
    input.actorUserId,
    input.spaceId,
  );
}

export async function resolveAuthorizedListJobScopeContext(
  store: JobGovernanceStore,
  input: JobScopeQuery,
): Promise<AuthorizedJobListScopeContext> {
  const scope = normalizeJobScope(input, input.actorUserId);

  if (scope.type === 'project') {
    const context = await resolveProjectScopeContext(
      store,
      scope,
      input.actorUserId,
      [input.actorSpaceId, input.spaceId],
      false,
    );

    return {
      scope: context.scope,
    };
  }

  return resolveUserListScopeContext(
    store,
    scope,
    input.actorUserId,
    input.actorSpaceId,
    input.spaceId,
  );
}

export async function findAuthorizedJob(
  store: JobGovernanceStore,
  input: JobAccessRequest,
  operation: JobAccessOperation = 'read',
): Promise<PersistedJobRecord> {
  const job = await store.jobRepository.getJob({ jobId: input.jobId });

  if (!job) {
    throw new Error(`Job ${input.jobId} does not exist.`);
  }

  if (job.scope.type === 'project') {
    const context = await resolveProjectScopeContext(
      store,
      job.scope,
      input.actorUserId,
      [input.actorSpaceId],
      operation === 'run',
    );

    if (job.spaceId !== context.spaceId) {
      throw new Error(
        'Persisted job space context does not match the requested resource space.',
      );
    }

    if (operation === 'run' && input.actorUserId !== job.requestedByUserId) {
      throw new Error(
        'Access denied for the requested project job mutation.',
      );
    }

    return job;
  }

  if (job.scope.id !== input.actorUserId) {
    throw new Error('Access denied for the requested job.');
  }

  assertSpaceContextMatches(job.spaceId, input.actorSpaceId);

  return job;
}
