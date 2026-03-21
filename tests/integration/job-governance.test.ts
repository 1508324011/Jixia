import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

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
        rawSecret: 'sk-test-secret',
        userId: 'user-alice',
      });

      expect(credential.credentialRef).toMatch(/^cred-/);
      expect(JSON.stringify(credential)).not.toContain('sk-test-secret');

      const job = await app.jobs.createJob({
        credentialRef: credential.credentialRef,
        kind: 'ai.summary',
        payload: { prompt: 'Summarize shared findings.' },
        requestedByUserId: 'user-alice',
        spaceId: sharedSpace.id,
      });

      expect(job.status).toBe('queued');
      expect(JSON.stringify(job)).not.toContain('sk-test-secret');

      const completed = await app.jobs.runJob({
        actorSpaceId: sharedSpace.id,
        actorUserId: 'user-alice',
        jobId: job.id,
      });
      expect(completed.status).toBe('succeeded');

      const stream = app.jobStream.toSse({
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
});
