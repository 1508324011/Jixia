import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  createJobRepository,
  createPrismaClient,
  createSpaceRepository,
} from '../../src/db';
import { createJixiaApp } from '../../src/server/app';

describe('job governance', () => {
  it('persists jobs and audits credential-backed runs', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-job-governance-'));

    try {
      const app = createJixiaApp({ env: { JIXIA_STORAGE_ROOT: storageRoot } });
      const sharedSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Governance Space' },
        'user-alice',
      );
      const credential = await app.credentials.createCredential({
        provider: 'openai',
        rawSecret: 'test-credential-placeholder',
        userId: 'user-alice',
      }, 'user-alice');

      expect(credential.credentialRef).toMatch(/^cred-/);
      expect(JSON.stringify(credential)).not.toContain('test-credential-placeholder');

      const job = await app.jobs.createJob({
        credentialRef: credential.credentialRef,
        kind: 'ai.summary',
        payload: { prompt: 'Summarize shared findings.' },
        requestedByUserId: 'user-alice',
        spaceId: sharedSpace.id,
      }, 'user-alice');

      expect(job.status).toBe('queued');
      expect(JSON.stringify(job)).not.toContain('test-credential-placeholder');

      const completed = await app.jobs.runJob({
        actorSpaceId: sharedSpace.id,
        actorUserId: 'user-alice',
        jobId: job.id,
      });
      expect(completed.status).toBe('succeeded');

      const stream = await app.jobStream.toSse({
        actorSpaceId: sharedSpace.id,
        actorUserId: 'user-alice',
        jobId: job.id,
      });
      expect(stream).toContain('event: job');
      expect(stream).toContain('"status":"queued"');
      expect(stream).toContain('"status":"succeeded"');

      const audits = await app.jobs.listAuditRecords({
        actorSpaceId: sharedSpace.id,
        actorUserId: 'user-alice',
        jobId: job.id,
      });
      expect(audits.map((audit) => audit.action)).toEqual([
        'job.created',
        'job.completed',
      ]);
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('stores job, event, audit, and credential references in Prisma instead of runtime json', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-job-prisma-persist-'));
    const databaseUrl = `file:${join(storageRoot, 'jixia-job-prisma.db')}`;
    const env = {
      JIXIA_DATABASE_URL: databaseUrl,
      JIXIA_STORAGE_ROOT: storageRoot,
    };
    const prisma = createPrismaClient({ url: databaseUrl });
    const jobRepository = createJobRepository(prisma);

    try {
      const app = createJixiaApp({ env });
      const sharedSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Prisma Job Persistence' },
        'user-alice',
      );
      const credential = await app.credentials.createCredential({
        provider: 'openai',
        rawSecret: 'prisma-job-secret-placeholder',
        userId: 'user-alice',
      }, 'user-alice');
      const job = await app.jobs.createJob(
        {
          credentialRef: credential.credentialRef,
          kind: 'ai.summary',
          payload: { prompt: 'Persist through Prisma.' },
          spaceId: sharedSpace.id,
        },
        'user-alice',
      );
      const completed = await app.jobs.runJob({
        actorSpaceId: sharedSpace.id,
        actorUserId: 'user-alice',
        jobId: job.id,
      });
      const persistedJob = await jobRepository.getJob({ jobId: job.id });
      const persistedEvents = await jobRepository.listJobEvents(job.id);
      const persistedAudits = await jobRepository.listAuditRecordsByJob(job.id);
      const persistedCredential = await jobRepository.getProviderCredentialReference(
        credential.credentialRef,
      );

      expect(completed.status).toBe('succeeded');
      expect(persistedJob).toMatchObject({
        credentialRef: credential.credentialRef,
        id: job.id,
        requestedByUserId: 'user-alice',
        spaceId: sharedSpace.id,
        status: 'succeeded',
      });
      expect(persistedJob?.payload).toBe(JSON.stringify({ prompt: 'Persist through Prisma.' }));
      expect(persistedEvents.map((event) => event.status)).toEqual([
        'queued',
        'running',
        'succeeded',
      ]);
      expect(persistedAudits.map((audit) => audit.action)).toEqual([
        'job.created',
        'job.completed',
      ]);
      expect(persistedCredential).toMatchObject({
        credentialRef: credential.credentialRef,
        provider: 'openai',
        secretRef: credential.credentialRef,
        userId: 'user-alice',
      });
    } finally {
      await prisma.$disconnect();
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('authorizes jobs through persisted memberships even without legacy space mirrors', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-job-prisma-space-'));
    const databaseUrl = `file:${join(storageRoot, 'jixia-job-space.db')}`;
    const env = {
      JIXIA_DATABASE_URL: databaseUrl,
      JIXIA_STORAGE_ROOT: storageRoot,
    };
    const prisma = createPrismaClient({ url: databaseUrl });
    const repository = createSpaceRepository(prisma);

    try {
      const persistedSpace = await repository.createSpace(
        { id: 'space-jobs', kind: 'shared', name: 'Persisted Job Space' },
        'user-alice',
      );
      const app = createJixiaApp({ env });
      const credential = await app.credentials.createCredential({
        provider: 'openai',
        rawSecret: 'repository-backed-job-credential',
        userId: 'user-alice',
      }, 'user-alice');
      const job = await app.jobs.createJob(
        {
          credentialRef: credential.credentialRef,
          kind: 'ai.summary',
          payload: { prompt: 'Persisted membership job.' },
          requestedByUserId: 'user-alice',
          spaceId: persistedSpace.id,
        },
        'user-alice',
      );

      expect(job.id).toMatch(/^job-/);

      await expect(
        app.jobs.getJob({
          actorSpaceId: persistedSpace.id,
          actorUserId: 'user-charlie',
          jobId: job.id,
        }),
      ).rejects.toThrow(/access denied/i);
    } finally {
      await prisma.$disconnect();
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('ignores stale legacy memberships for job event audit and stream authorization', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-job-stale-membership-'));
    const databaseUrl = `file:${join(storageRoot, 'jixia-job-stale.db')}`;
    const env = {
      JIXIA_DATABASE_URL: databaseUrl,
      JIXIA_STORAGE_ROOT: storageRoot,
    };
    const prisma = createPrismaClient({ url: databaseUrl });
    const repository = createSpaceRepository(prisma);

    try {
      const persistedSpace = await repository.createSpace(
        { id: 'space-job-authoritative', kind: 'shared', name: 'Job Authority' },
        'user-alice',
      );
      const now = new Date().toISOString();

      writeFileSync(
        join(storageRoot, 'server-state.json'),
        JSON.stringify(
          {
            memberships: [
              {
                joinedAt: now,
                role: 'viewer',
                spaceId: persistedSpace.id,
                userId: 'user-charlie',
              },
            ],
            spaces: [
              {
                createdAt: now,
                id: persistedSpace.id,
                kind: 'shared',
                name: 'Legacy Job Mirror',
                ownerUserId: 'user-alice',
              },
            ],
          },
          null,
          2,
        ),
      );

      const app = createJixiaApp({ env });
      const credential = await app.credentials.createCredential({
        provider: 'openai',
        rawSecret: 'stale-job-credential-placeholder',
        userId: 'user-alice',
      }, 'user-alice');
      const job = await app.jobs.createJob(
        {
          credentialRef: credential.credentialRef,
          kind: 'ai.summary',
          payload: { prompt: 'Protect stale mirror job access.' },
          requestedByUserId: 'user-alice',
          spaceId: persistedSpace.id,
        },
        'user-alice',
      );

      for (const operation of [
        () =>
          app.jobs.getJob({
            actorSpaceId: persistedSpace.id,
            actorUserId: 'user-charlie',
            jobId: job.id,
          }),
        () =>
          app.jobs.runJob({
            actorSpaceId: persistedSpace.id,
            actorUserId: 'user-charlie',
            jobId: job.id,
          }),
        () =>
          app.jobs.listAuditRecords({
            actorSpaceId: persistedSpace.id,
            actorUserId: 'user-charlie',
            jobId: job.id,
          }),
        () =>
          app.jobStream.listEvents({
            actorSpaceId: persistedSpace.id,
            actorUserId: 'user-charlie',
            jobId: job.id,
          }),
        () =>
          app.jobStream.toSse({
            actorSpaceId: persistedSpace.id,
            actorUserId: 'user-charlie',
            jobId: job.id,
          }),
      ]) {
        await expect(operation()).rejects.toThrow(/access denied/i);
      }
    } finally {
      await prisma.$disconnect();
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('ignores stale legacy json job event and audit rows absent from Prisma', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-job-stale-json-'));
    const databaseUrl = `file:${join(storageRoot, 'jixia-job-stale-json.db')}`;
    const env = {
      JIXIA_DATABASE_URL: databaseUrl,
      JIXIA_STORAGE_ROOT: storageRoot,
    };
    const now = new Date().toISOString();

    writeFileSync(
      join(storageRoot, 'server-state.json'),
      JSON.stringify(
        {
          auditLogs: [
            {
              action: 'job.created',
              actorUserId: 'user-alice',
              detail: 'Legacy audit row must be ignored.',
              id: 'audit-stale',
              jobId: 'job-stale',
              recordedAt: now,
              spaceId: 'space-stale',
            },
          ],
          jobEvents: [
            {
              id: 'event-stale',
              jobId: 'job-stale',
              message: 'Legacy event row must be ignored.',
              recordedAt: now,
              status: 'queued',
            },
          ],
          jobs: [
            {
              createdAt: now,
              credentialRef: 'cred-stale',
              id: 'job-stale',
              kind: 'ai.summary',
              payload: JSON.stringify({ prompt: 'stale' }),
              requestedByUserId: 'user-alice',
              spaceId: 'space-stale',
              status: 'queued',
            },
          ],
          memberships: [
            {
              joinedAt: now,
              role: 'owner',
              spaceId: 'space-stale',
              userId: 'user-alice',
            },
          ],
          spaces: [
            {
              createdAt: now,
              id: 'space-stale',
              kind: 'shared',
              name: 'Legacy Stale Space',
              ownerUserId: 'user-alice',
            },
          ],
        },
        null,
        2,
      ),
    );

    try {
      const app = createJixiaApp({ env });

      expect(await app.jobs.listJobs({ actorUserId: 'user-alice' })).toEqual([]);
      await expect(
        app.jobs.getJob({ actorUserId: 'user-alice', jobId: 'job-stale' }),
      ).rejects.toThrow(/job job-stale does not exist/i);
      await expect(
        app.jobStream.listEvents({ actorUserId: 'user-alice', jobId: 'job-stale' }),
      ).rejects.toThrow(/job job-stale does not exist/i);
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('rejects missing and cross-owner credential references before job persistence', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-job-credential-owner-'));
    const databaseUrl = `file:${join(storageRoot, 'jixia-job-credential-owner.db')}`;
    const env = {
      JIXIA_DATABASE_URL: databaseUrl,
      JIXIA_STORAGE_ROOT: storageRoot,
    };
    const prisma = createPrismaClient({ url: databaseUrl });
    const jobRepository = createJobRepository(prisma);

    try {
      const app = createJixiaApp({ env });
      const sharedSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Credential Ownership' },
        'user-alice',
      );
      await app.credentials.createCredential({
        provider: 'openai',
        rawSecret: 'alice-owned-credential-placeholder',
        userId: 'user-alice',
      }, 'user-alice');
      const bobCredential = await app.credentials.createCredential({
        provider: 'openai',
        rawSecret: 'bob-owned-credential-placeholder',
        userId: 'user-bob',
      }, 'user-bob');

      await expect(
        app.jobs.createJob(
          {
            credentialRef: 'cred-missing',
            kind: 'ai.summary',
            payload: { prompt: 'Missing credential must not persist.' },
            spaceId: sharedSpace.id,
          },
          'user-alice',
        ),
      ).rejects.toThrow(/credential cred-missing does not exist/i);
      await expect(
        app.jobs.createJob(
          {
            credentialRef: bobCredential.credentialRef,
            kind: 'ai.summary',
            payload: { prompt: 'Cross-owner credential must not persist.' },
            spaceId: sharedSpace.id,
          },
          'user-alice',
        ),
      ).rejects.toThrow(/credentials may only be used by their owner/i);

      expect(await jobRepository.listJobsForActor({ actorUserId: 'user-alice' })).toEqual([]);
      expect(await jobRepository.listJobsForActor({ actorUserId: 'user-bob' })).toEqual([]);
    } finally {
      await prisma.$disconnect();
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('does not reassign existing ProviderCredential references to another user', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-provider-ref-owner-'));
    const databaseUrl = `file:${join(storageRoot, 'jixia-provider-ref-owner.db')}`;
    const prisma = createPrismaClient({ url: databaseUrl });
    const jobRepository = createJobRepository(prisma);

    try {
      await jobRepository.createProviderCredentialReference({
        credentialRef: 'cred-stable',
        provider: 'openai',
        secretRef: 'cred-stable',
        userId: 'user-alice',
      });

      await expect(
        jobRepository.createProviderCredentialReference({
          credentialRef: 'cred-stable',
          provider: 'openai',
          secretRef: 'cred-stable',
          userId: 'user-bob',
        }),
      ).rejects.toThrow(/already belongs to another user/i);

      await expect(
        jobRepository.getProviderCredentialReference('cred-stable'),
      ).resolves.toMatchObject({
        credentialRef: 'cred-stable',
        userId: 'user-alice',
      });
    } finally {
      await prisma.$disconnect();
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});
