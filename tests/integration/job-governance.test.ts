import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { createPrismaClient, createSpaceRepository } from '../../src/db';
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
});
