import { Buffer } from 'node:buffer';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { createJixiaApp } from '../../src/server/app';
import type { PubmedConnector } from '../../src/server/connectors/pubmed.connector';

function createStorageRoot(): string {
  return mkdtempSync(join(tmpdir(), 'jixia-governance-hardening-'));
}

function createStubPubmedConnector(): PubmedConnector {
  return {
    async lookup(locator, sourceType) {
      return {
        abstractText: `Governance ${sourceType.toUpperCase()} abstract for ${locator}`,
        canonicalId: `${sourceType}:${locator}`,
        title: `Governance ${sourceType.toUpperCase()} paper ${locator}`,
      };
    },
    async search(query) {
      return [
        {
          abstractText: `Governance search result for ${query}`,
          canonicalId: 'pmid:654321',
          reason: 'Governance hardening local PubMed stub.',
          sourceLabel: 'PubMed',
          sourceLocator: '654321',
          sourceType: 'pmid',
          title: 'Governance hardening paper',
        },
      ];
    },
  };
}

function createGovernanceApp(storageRoot: string) {
  return createJixiaApp({
    connectors: {
      pubmed: createStubPubmedConnector(),
    },
    env: { JIXIA_STORAGE_ROOT: storageRoot },
  });
}

describe('server governance hardening', () => {
  it('blocks cross-scope library, reading, notebook, and project-doc access', async () => {
    const storageRoot = createStorageRoot();

    try {
      const app = createGovernanceApp(storageRoot);
      const aliceShared = await app.spaces.createSpace(
        { kind: 'shared', name: 'Alice Shared' },
        'user-alice',
      );
      const project = await app.projects.createProject(
        { name: 'Alice Hardening Project', spaceId: aliceShared.id },
        'user-alice',
      );
      const bobPersonal = await app.spaces.createSpace(
        { kind: 'personal', name: 'Bob Personal' },
        'user-bob',
      );
      const imported = await app.imports.importPaper({
        scope: { id: project.project.id, type: 'project' },
        requestedByUserId: 'user-alice',
        sourceLocator: '10.1000/hardening-demo',
        sourceType: 'doi',
        spaceId: aliceShared.id,
        visibility: 'private',
      }, 'user-alice');
      const notebook = await app.notebooks.createDocument(
        { title: 'Alice Private Notebook' },
        'user-alice',
      );
      const projectDoc = await app.projectDocs.createDocument(
        {
          projectId: project.project.id,
          title: 'Alice Shared Project Draft',
        },
        'user-alice',
      );

      await expect(
        app.library.getEntry({
          actorSpaceId: bobPersonal.id,
          actorUserId: 'user-bob',
          entryId: imported.entry.id,
        }),
      ).rejects.toThrow(/access denied/i);
      await expect(
        app.reading.getDetail({
          actorSpaceId: bobPersonal.id,
          actorUserId: 'user-bob',
          libraryEntryId: imported.entry.id,
        }),
      ).rejects.toThrow(/access denied/i);
      await expect(
        app.notebooks.saveDocument(
          {
            citations: [],
            content: 'Intrusion attempt',
            documentId: notebook.id,
          },
          'user-bob',
        ),
      ).rejects.toThrow(/access denied/i);
      await expect(
        app.projectDocs.saveDocument(
          {
            citations: [],
            content: 'Cross-project write attempt',
            documentId: projectDoc.id,
          },
          'user-bob',
        ),
      ).rejects.toThrow(/access denied/i);
      await expect(
        app.projectDocs.getDocument({ documentId: projectDoc.id }, 'user-bob'),
      ).rejects.toThrow(/access denied/i);
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('rejects orphan imports, citations, and jobs', async () => {
    const storageRoot = createStorageRoot();

    try {
      const app = createGovernanceApp(storageRoot);
      const sharedSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Validated Shared' },
        'user-alice',
      );
      const credential = await app.credentials.createCredential({
        provider: 'openai',
        rawSecret: 'validator-credential-placeholder',
        userId: 'user-alice',
      }, 'user-alice');
      const notebook = await app.notebooks.createDocument(
        { title: 'Validated Notebook' },
        'user-alice',
      );
      const project = await app.projects.createProject(
        { name: 'Validated Project', spaceId: sharedSpace.id },
        'user-alice',
      );
      const projectDoc = await app.projectDocs.createDocument(
        { projectId: project.project.id, title: 'Validated Project Draft' },
        'user-alice',
      );

      await expect(
        app.imports.importPaper({
          scope: { id: 'project-missing', type: 'project' },
          requestedByUserId: 'user-alice',
          sourceLocator: '10.1000/missing-space',
          sourceType: 'doi',
          spaceId: 'space-missing',
          visibility: 'space_shared',
        }, 'user-alice'),
      ).rejects.toThrow(/project project-missing does not exist/i);
      await expect(
        app.notebooks.saveDocument(
          {
            citations: [{ evidenceSpan: 'section 1', paperAssetId: 'asset-missing' }],
            content: 'Version with missing citation asset',
            documentId: notebook.id,
          },
          'user-alice',
        ),
      ).rejects.toThrow(/paper asset asset-missing does not exist/i);
      await expect(
        app.projectDocs.saveDocument(
          {
            citations: [{ evidenceSpan: 'section 1', paperAssetId: 'asset-missing' }],
            content: 'Project doc version with missing citation asset',
            documentId: projectDoc.id,
          },
          'user-alice',
        ),
      ).rejects.toThrow(/paper asset asset-missing does not exist/i);
      await expect(
        app.jobs.createJob({
          credentialRef: credential.credentialRef,
          kind: 'ai.summary',
          payload: { prompt: 'Summarize.' },
          requestedByUserId: 'user-alice',
          spaceId: 'space-missing',
        }, 'user-alice'),
      ).rejects.toThrow(/space space-missing does not exist/i);
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('persists governed state across app restarts without storing raw or base64 secrets', async () => {
    const storageRoot = createStorageRoot();

    try {
      const firstApp = createGovernanceApp(storageRoot);
      const sharedSpace = await firstApp.spaces.createSpace(
        { kind: 'shared', name: 'Persistent Governance' },
        'user-alice',
      );
      const credential = await firstApp.credentials.createCredential({
        provider: 'openai',
        rawSecret: 'persisted-credential-placeholder',
        userId: 'user-alice',
      }, 'user-alice');
      const job = await firstApp.jobs.createJob({
        credentialRef: credential.credentialRef,
        kind: 'ai.summary',
        payload: { prompt: 'Persist me.' },
        requestedByUserId: 'user-alice',
        spaceId: sharedSpace.id,
      }, 'user-alice');

      const secondApp = createGovernanceApp(storageRoot);
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
      const stream = await secondApp.jobStream.toSse({
        actorSpaceId: sharedSpace.id,
        actorUserId: 'user-alice',
        jobId: job.id,
      });
      const persistedStatePath = join(storageRoot, 'server-state.json');

      expect(completed.status).toBe('succeeded');
      expect(audits.map((audit) => audit.action)).toEqual([
        'job.created',
        'job.started',
        'job.completed',
      ]);
      expect(stream).toContain('"status":"queued"');
      expect(stream).toContain('"status":"succeeded"');
      if (existsSync(persistedStatePath)) {
        const persistedState = readFileSync(persistedStatePath, 'utf8');

        expect(persistedState).not.toContain('persisted-credential-placeholder');
        expect(persistedState).not.toContain(
          Buffer.from('persisted-credential-placeholder', 'utf8').toString('base64'),
        );
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('blocks unauthorized job execution, audit reads, and event stream access', async () => {
    const storageRoot = createStorageRoot();

    try {
      const app = createGovernanceApp(storageRoot);
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
      }, 'user-alice');
      const job = await app.jobs.createJob({
        credentialRef: credential.credentialRef,
        kind: 'ai.summary',
        payload: { prompt: 'Protect this job.' },
        requestedByUserId: 'user-alice',
        spaceId: aliceShared.id,
      }, 'user-alice');

      await expect(
        app.jobs.runJob({
          actorSpaceId: bobPersonal.id,
          actorUserId: 'user-bob',
          jobId: job.id,
        }),
      ).rejects.toThrow(/access denied/i);
      await expect(
        app.jobs.listAuditRecords({
          actorSpaceId: bobPersonal.id,
          actorUserId: 'user-bob',
          jobId: job.id,
        }),
      ).rejects.toThrow(/access denied/i);
      await expect(
        app.jobStream.listEvents({
          actorSpaceId: bobPersonal.id,
          actorUserId: 'user-bob',
          jobId: job.id,
        }),
      ).rejects.toThrow(/access denied/i);
      await expect(
        app.jobStream.toSse({
          actorSpaceId: bobPersonal.id,
          actorUserId: 'user-bob',
          jobId: job.id,
        }),
      ).rejects.toThrow(/access denied/i);
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('rejects secret-bearing job payloads before they reach persisted state', async () => {
    const storageRoot = createStorageRoot();

    try {
      const app = createGovernanceApp(storageRoot);
      const sharedSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Payload Validation' },
        'user-alice',
      );
      const credential = await app.credentials.createCredential({
        provider: 'openai',
        rawSecret: 'payload-guard-credential-placeholder',
        userId: 'user-alice',
      }, 'user-alice');
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
        }, 'user-alice'),
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
