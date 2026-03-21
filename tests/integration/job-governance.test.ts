import { describe, expect, it } from 'vitest';

import { createJixiaApp } from '../../src/server/app';

describe('job governance', () => {
  it('persists jobs and audits credential-backed runs', async () => {
    const app = createJixiaApp();
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

    const completed = await app.jobs.runJob(job.id);
    expect(completed.status).toBe('succeeded');

    const stream = app.jobStream.toSse(job.id);
    expect(stream).toContain('event: job');
    expect(stream).toContain('"status":"queued"');
    expect(stream).toContain('"status":"succeeded"');

    const audits = await app.jobs.listAuditRecords(job.id);
    expect(audits.map((audit) => audit.action)).toEqual([
      'job.created',
      'job.completed',
    ]);
  });
});
