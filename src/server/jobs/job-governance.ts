import type { JobRepository, PersistedJobRecord, SpaceRepository } from '../../db';

export interface JobAccessRequest {
  actorUserId: string;
  actorSpaceId?: string;
  jobId: string;
}

export interface JobGovernanceStore {
  jobRepository: JobRepository;
  spaceRepository: SpaceRepository;
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

export async function findAuthorizedJob(
  store: JobGovernanceStore,
  input: JobAccessRequest,
): Promise<PersistedJobRecord> {
  const job = await store.jobRepository.getJob({ jobId: input.jobId });

  if (!job) {
    throw new Error(`Job ${input.jobId} does not exist.`);
  }

  const space = await store.spaceRepository.findSpace(job.spaceId);

  if (!space) {
    throw new Error(`Space ${job.spaceId} does not exist.`);
  }

  if (input.actorSpaceId && input.actorSpaceId !== job.spaceId) {
    throw new Error(
      'Request space context does not match the requested resource space.',
    );
  }

  await store.spaceRepository.denyNonMember(job.spaceId, input.actorUserId);

  if (input.actorUserId !== job.requestedByUserId) {
    throw new Error('Access denied for the requested space resource.');
  }

  return job;
}
