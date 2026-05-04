import { Buffer } from 'node:buffer';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { createJixiaApp } from '../../src/server/app';

function createStorageRoot(): string {
  return mkdtempSync(join(tmpdir(), 'jixia-governance-hardening-'));
}

describe('server governance hardening', () => {
  it('blocks cross-space library, reading, and writing access', async () => {
    const storageRoot = createStorageRoot();

    try {
      const app = createJixiaApp({ env: { JIXIA_STORAGE_ROOT: storageRoot } });
      const aliceShared = await app.spaces.createSpace(
        { kind: 'shared', name: 'Alice Shared' },
        'user-alice',
      );
      const bobPersonal = await app.spaces.createSpace(
        { kind: 'personal', name: 'Bob Personal' },
        'user-bob',
      );
      const imported = await app.imports.importPaper({
        requestedByUserId: 'user-alice',
        sourceLocator: '10.1000/hardening-demo',
        sourceType: 'doi',
        spaceId: aliceShared.id,
        visibility: 'private',
      });
      const doc = await app.writing.createDocument({
        actorSpaceId: aliceShared.id,
        actorUserId: 'user-alice',
        ownerUserId: 'user-alice',
        spaceId: aliceShared.id,
        title: 'Shared Draft',
      });

      await expect(
        app.library.getEntry({
          actorSpaceId: bobPersonal.id,
          actorUserId: 'user-bob',
          entryId: imported.entry.id,
        }),
      ).rejects.toThrow(/space context/i);
      await expect(
        app.reading.getDetail({
          actorSpaceId: bobPersonal.id,
          actorUserId: 'user-bob',
          libraryEntryId: imported.entry.id,
        }),
      ).rejects.toThrow(/space context/i);
      await expect(
        app.writing.saveDocument({
          actorSpaceId: bobPersonal.id,
          actorUserId: 'user-bob',
          citations: [],
          content: 'Intrusion attempt',
          docId: doc.id,
        }),
      ).rejects.toThrow(/access denied/i);
      await expect(
        app.writing.transitionPublishState({
          actorSpaceId: bobPersonal.id,
          actorUserId: 'user-bob',
          docId: doc.id,
          publishState: 'review',
        }),
      ).rejects.toThrow(/access denied/i);
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('rejects orphan imports, citations, and jobs', async () => {
    const storageRoot = createStorageRoot();

    try {
      const app = createJixiaApp({ env: { JIXIA_STORAGE_ROOT: storageRoot } });
      const sharedSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Validated Shared' },
        'user-alice',
      );
      const credential = await app.credentials.createCredential({
        provider: 'openai',
        rawSecret: 'validator-credential-placeholder',
        userId: 'user-alice',
      });
      const doc = await app.writing.createDocument({
        actorSpaceId: sharedSpace.id,
        actorUserId: 'user-alice',
        ownerUserId: 'user-alice',
        spaceId: sharedSpace.id,
        title: 'Validated Draft',
      });

      await expect(
        app.imports.importPaper({
          requestedByUserId: 'user-alice',
          sourceLocator: '10.1000/missing-space',
          sourceType: 'doi',
          spaceId: 'space-missing',
          visibility: 'space_shared',
        }),
      ).rejects.toThrow(/space space-missing does not exist/i);
      await expect(
        app.writing.saveDocument({
          actorSpaceId: sharedSpace.id,
          actorUserId: 'user-alice',
          citations: [{ evidenceSpan: 'section 1', paperAssetId: 'asset-missing' }],
          content: 'Version with missing citation asset',
          docId: doc.id,
        }),
      ).rejects.toThrow(/paper asset asset-missing does not exist/i);
      await expect(
        app.jobs.createJob({
          credentialRef: credential.credentialRef,
          kind: 'ai.summary',
          payload: { prompt: 'Summarize.' },
          requestedByUserId: 'user-alice',
          spaceId: 'space-missing',
        }),
      ).rejects.toThrow(/space space-missing does not exist/i);
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('persists governed state across app restarts without storing raw or base64 secrets', async () => {
    const storageRoot = createStorageRoot();

    try {
      const firstApp = createJixiaApp({ env: { JIXIA_STORAGE_ROOT: storageRoot } });
      const sharedSpace = await firstApp.spaces.createSpace(
        { kind: 'shared', name: 'Persistent Governance' },
        'user-alice',
      );
      const credential = await firstApp.credentials.createCredential({
        provider: 'openai',
        rawSecret: 'persisted-credential-placeholder',
        userId: 'user-alice',
      });
      const job = await firstApp.jobs.createJob({
        credentialRef: credential.credentialRef,
        kind: 'ai.summary',
        payload: { prompt: 'Persist me.' },
        requestedByUserId: 'user-alice',
        spaceId: sharedSpace.id,
      });

      const secondApp = createJixiaApp({ env: { JIXIA_STORAGE_ROOT: storageRoot } });
      const completed = await secondApp.jobs.runJob({
        actorSpaceId: sharedSpace.id,
        actorUserId: 'user-alice',
        jobId: job.id,
      });
      const audits = await secondApp.jobs.listAuditRecords({
        actorSpaceId: sharedSpace.id,
        actorUserId: 'user-alice',
        jobId: job.id,
      });
      const stream = secondApp.jobStream.toSse({
        actorSpaceId: sharedSpace.id,
        actorUserId: 'user-alice',
        jobId: job.id,
      });
      const persistedState = readFileSync(
        join(storageRoot, 'server-state.json'),
        'utf8',
      );

      expect(completed.status).toBe('succeeded');
      expect(audits.map((audit) => audit.action)).toEqual([
        'job.created',
        'job.completed',
      ]);
      expect(stream).toContain('"status":"queued"');
      expect(stream).toContain('"status":"succeeded"');
      expect(persistedState).not.toContain('persisted-credential-placeholder');
      expect(persistedState).not.toContain(
        Buffer.from('persisted-credential-placeholder', 'utf8').toString('base64'),
      );
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('blocks unauthorized job execution, audit reads, and event stream access', async () => {
    const storageRoot = createStorageRoot();

    try {
      const app = createJixiaApp({ env: { JIXIA_STORAGE_ROOT: storageRoot } });
      const aliceShared = await app.spaces.createSpace(
        { kind: 'shared', name: 'Alice Jobs' },
        'user-alice',
      );
      const bobPersonal = await app.spaces.createSpace(
        { kind: 'personal', name: 'Bob Jobs' },
        'user-bob',
      );
      const credential = await app.credentials.createCredential({
        provider: 'openai',
        rawSecret: 'job-guard-credential-placeholder',
        userId: 'user-alice',
      });
      const job = await app.jobs.createJob({
        credentialRef: credential.credentialRef,
        kind: 'ai.summary',
        payload: { prompt: 'Protect this job.' },
        requestedByUserId: 'user-alice',
        spaceId: aliceShared.id,
      });

      await expect(
        app.jobs.runJob({
          actorSpaceId: bobPersonal.id,
          actorUserId: 'user-bob',
          jobId: job.id,
        }),
      ).rejects.toThrow(/space context/i);
      await expect(
        app.jobs.listAuditRecords({
          actorSpaceId: bobPersonal.id,
          actorUserId: 'user-bob',
          jobId: job.id,
        }),
      ).rejects.toThrow(/space context/i);
      expect(() =>
        app.jobStream.listEvents({
          actorSpaceId: bobPersonal.id,
          actorUserId: 'user-bob',
          jobId: job.id,
        }),
      ).toThrow(/space context/i);
      expect(() =>
        app.jobStream.toSse({
          actorSpaceId: bobPersonal.id,
          actorUserId: 'user-bob',
          jobId: job.id,
        }),
      ).toThrow(/space context/i);
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('rejects secret-bearing job payloads before they reach persisted state', async () => {
    const storageRoot = createStorageRoot();

    try {
      const app = createJixiaApp({ env: { JIXIA_STORAGE_ROOT: storageRoot } });
      const sharedSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Payload Validation' },
        'user-alice',
      );
      const credential = await app.credentials.createCredential({
        provider: 'openai',
        rawSecret: 'payload-guard-credential-placeholder',
        userId: 'user-alice',
      });
      const persistedStatePath = join(storageRoot, 'server-state.json');

      await expect(
        app.jobs.createJob({
          credentialRef: credential.credentialRef,
          kind: 'ai.summary',
          payload: {
            apiKey: 'do-not-persist-this-placeholder',
            prompt: 'Refuse unsafe payloads.',
          },
          requestedByUserId: 'user-alice',
          spaceId: sharedSpace.id,
        }),
      ).rejects.toThrow(/payload must not contain raw secrets/i);

      if (existsSync(persistedStatePath)) {
        const persistedState = readFileSync(persistedStatePath, 'utf8');

        expect(persistedState).not.toContain('do-not-persist-this-placeholder');
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});
