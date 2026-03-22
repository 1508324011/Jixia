import type { SpaceMembership } from '@shared/contracts/spaces';

import type { StoredSpace } from '../services/spaces.service';
import type { StoredJob } from './job-runner';

export interface JobAccessRequest {
  actorSpaceId: string;
  actorUserId: string;
  jobId: string;
}

export interface SpaceJobAccessRequest {
  actorSpaceId: string;
  actorUserId: string;
  kind?: string;
  spaceId: string;
}

export interface JobGovernanceStore {
  jobs: StoredJob[];
  memberships: SpaceMembership[];
  spaces: StoredSpace[];
}

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

export function findAuthorizedJob(
  store: JobGovernanceStore,
  input: JobAccessRequest,
): StoredJob {
  const job = store.jobs.find((candidate) => candidate.id === input.jobId);

  if (!job) {
    throw new Error(`Job ${input.jobId} does not exist.`);
  }

  const space = store.spaces.find((candidate) => candidate.id === job.spaceId);

  if (!space) {
    throw new Error(`Space ${job.spaceId} does not exist.`);
  }

  const actorHasMembership = store.memberships.some(
    (membership) =>
      membership.spaceId === job.spaceId &&
      membership.userId === input.actorUserId,
  );

  if (
    input.actorSpaceId !== job.spaceId ||
    input.actorUserId !== job.requestedByUserId ||
    !actorHasMembership
  ) {
    throw new Error('Access denied for the requested space resource.');
  }

  return job;
}

function assertAuthorizedSpaceAccess(
  store: JobGovernanceStore,
  input: SpaceJobAccessRequest,
): void {
  const space = store.spaces.find((candidate) => candidate.id === input.spaceId);

  if (!space) {
    throw new Error(`Space ${input.spaceId} does not exist.`);
  }

  const actorHasMembership = store.memberships.some(
    (membership) =>
      membership.spaceId === input.spaceId && membership.userId === input.actorUserId,
  );

  if (input.actorSpaceId !== input.spaceId || !actorHasMembership) {
    throw new Error('Access denied for the requested space resource.');
  }
}

export function findLatestAuthorizedJob(
  store: JobGovernanceStore,
  input: SpaceJobAccessRequest,
): StoredJob | null {
  assertAuthorizedSpaceAccess(store, input);

  for (let index = store.jobs.length - 1; index >= 0; index -= 1) {
    const job = store.jobs[index];

    if (job.spaceId !== input.spaceId || job.requestedByUserId !== input.actorUserId) {
      continue;
    }

    if (input.kind && job.kind !== input.kind) {
      continue;
    }

    return job;
  }

  return null;
}
