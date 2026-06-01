import { Buffer } from 'node:buffer';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { createHttpServer } from '../../src/server/http-server';
import { createPrismaClient } from '../../src/db';
import { createSecretBox } from '../../src/server/security/secret-box';
import { createJixiaApp } from '../../src/server/app';
import type { PubmedConnector } from '../../src/server/connectors/pubmed.connector';
import { loginAs, withSessionCookie } from './http-session-test-helpers';

const workbenchDiscoveryFixture = {
  abstractText: 'Biomarker-driven tumor board reviews need fast evidence triage before project handoff.',
  canonicalId: 'pmid:654321',
  reason: 'PubMed result for today\'s tumor-board queue.',
  sourceLabel: 'PubMed',
  sourceLocator: '654321',
  sourceType: 'pmid' as const,
  title: 'Tumor board biomarkers for rapid review',
};

function createWorkbenchPubmedConnector(): PubmedConnector {
  return {
    async lookup(locator, sourceType) {
      if (sourceType === 'pmid' && locator === workbenchDiscoveryFixture.sourceLocator) {
        return {
          abstractText: workbenchDiscoveryFixture.abstractText,
          canonicalId: workbenchDiscoveryFixture.canonicalId,
          title: workbenchDiscoveryFixture.title,
        };
      }

      return {
        abstractText: `Fixture ${sourceType.toUpperCase()} metadata for ${locator}`,
        canonicalId: `${sourceType}:${locator}`,
        title: `Fixture ${sourceType.toUpperCase()} paper ${locator}`,
      };
    },
    async search() {
      return [workbenchDiscoveryFixture];
    },
  };
}

function createUnavailablePubmedConnector(): PubmedConnector {
  return {
    async lookup(): Promise<never> {
      throw new Error('PubMed fixture unavailable.');
    },
    async search(): Promise<never> {
      throw new Error('PubMed fixture unavailable.');
    },
  };
}

async function listenOnEphemeralPort(server: ReturnType<typeof createHttpServer>['server']) {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Expected server to listen on a TCP address');
  }

  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server: ReturnType<typeof createHttpServer>['server']) {
  server.closeIdleConnections?.();
  server.closeAllConnections?.();

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

describe('workbench http contracts', () => {
  it('exposes discovery publicly and protects personal/settings workbench APIs behind session cookies', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-workbench-http-'));
    const httpServer = createHttpServer({
      connectors: {
        pubmed: createWorkbenchPubmedConnector(),
      },
      env: {
        JIXIA_HOST: '127.0.0.1',
        JIXIA_STORAGE_ROOT: storageRoot,
      },
    });

    try {
      const baseUrl = await listenOnEphemeralPort(httpServer.server);
      const aliceCookie = await loginAs(baseUrl, 'user-alice');
      const bobCookie = await loginAs(baseUrl, 'user-bob');

      const response = await fetch(`${baseUrl}/api/discovery/today`);
      expect(response.status).toBe(200);

      const discovery = await response.json();
      expect(discovery.items).toBeDefined();
      expect(discovery.items[0]).toMatchObject({
        canonicalId: expect.any(String),
        sourceLocator: expect.any(String),
        sourceType: 'pmid',
        title: expect.any(String),
      });

      const searchResponse = await fetch(
        `${baseUrl}/api/discovery/search?query=${encodeURIComponent('tumor board')}`,
      );
      expect(searchResponse.status).toBe(200);

      const unauthenticatedDiscoveryActorQueryResponse = await fetch(
        `${baseUrl}/api/discovery/today?actorUserId=user-alice`,
      );
      expect(unauthenticatedDiscoveryActorQueryResponse.status).toBe(400);
      await expect(
        unauthenticatedDiscoveryActorQueryResponse.json(),
      ).resolves.toMatchObject({
        error: expect.stringMatching(/not accepted for protected routes/i),
      });

      const unauthenticatedDiscoveryLegacyIdentityResponse = await fetch(
        `${baseUrl}/api/discovery/search?query=tumor&requestedByUserId=user-alice`,
      );
      expect(unauthenticatedDiscoveryLegacyIdentityResponse.status).toBe(400);
      await expect(
        unauthenticatedDiscoveryLegacyIdentityResponse.json(),
      ).resolves.toMatchObject({
        error: expect.stringMatching(/not accepted for protected routes/i),
      });

      const search = await searchResponse.json();
      expect(search.query).toBe('tumor board');
      expect(search.items.length).toBeGreaterThan(0);

      const unauthenticatedPersonalLibraryResponse = await fetch(
        `${baseUrl}/api/library/personal`,
      );
      expect(unauthenticatedPersonalLibraryResponse.status).toBe(401);

      const emptyPersonalLibraryResponse = await fetch(`${baseUrl}/api/library/personal`, {
        headers: withSessionCookie(aliceCookie),
      });
      expect(emptyPersonalLibraryResponse.status).toBe(200);
      await expect(emptyPersonalLibraryResponse.json()).resolves.toEqual({ entries: [] });

      const importPersonalLibraryResponse = await fetch(`${baseUrl}/api/library/personal/import`, {
        body: JSON.stringify({
          sourceLocator: search.items[0].sourceLocator,
          sourceType: search.items[0].sourceType,
        }),
        headers: withSessionCookie(aliceCookie, {
          'Content-Type': 'application/json',
        }),
        method: 'POST',
      });
      expect(importPersonalLibraryResponse.status).toBe(201);

      const importedPersonalRecord = await importPersonalLibraryResponse.json();
      expect(importedPersonalRecord.asset.canonicalId).toBe(search.items[0].canonicalId);
      expect(importedPersonalRecord.asset.storageKey).toBeUndefined();

      const unauthenticatedSettingsResponse = await fetch(`${baseUrl}/api/settings/me`);
      expect(unauthenticatedSettingsResponse.status).toBe(401);

      const spoofedSettingsResponse = await fetch(
        `${baseUrl}/api/settings/me?userId=user-bob`,
        { headers: withSessionCookie(aliceCookie) },
      );
      expect(spoofedSettingsResponse.status).toBe(400);

      const settingsResponse = await fetch(`${baseUrl}/api/settings/me`, {
        headers: withSessionCookie(aliceCookie),
      });
      expect(settingsResponse.status).toBe(200);

      const settings = await settingsResponse.json();
      expect(settings).toMatchObject({
        apiKeyConfigured: false,
        defaultImportTarget: 'personal-library',
      });
      expect(settings.apiKey).toBeUndefined();

      const savedResponse = await fetch(`${baseUrl}/api/settings/me`, {
        body: JSON.stringify({
          apiKey: 'sk-test-secret',
          defaultImportTarget: 'project-workspace',
        }),
        headers: withSessionCookie(aliceCookie, {
          'Content-Type': 'application/json',
        }),
        method: 'POST',
      });
      expect(savedResponse.status).toBe(200);

      const savedSettings = await savedResponse.json();
      expect(savedSettings).toMatchObject({
        apiKeyConfigured: true,
        defaultImportTarget: 'project-workspace',
      });

      const spoofedSettingsSaveResponse = await fetch(`${baseUrl}/api/settings/me`, {
        body: JSON.stringify({
          defaultImportTarget: 'personal-library',
          userId: 'user-bob',
        }),
        headers: withSessionCookie(aliceCookie, {
          'Content-Type': 'application/json',
        }),
        method: 'POST',
      });
      expect(spoofedSettingsSaveResponse.status).toBe(400);

      const persistedSettingsResponse = await fetch(`${baseUrl}/api/settings/me`, {
        headers: withSessionCookie(aliceCookie),
      });
      expect(persistedSettingsResponse.status).toBe(200);

      const persistedSettings = await persistedSettingsResponse.json();
      expect(persistedSettings).toMatchObject({
        apiKeyConfigured: true,
        defaultImportTarget: 'project-workspace',
      });

      const persistedStatePath = join(storageRoot, 'server-state.json');
      const persistedStateText = existsSync(persistedStatePath)
        ? readFileSync(persistedStatePath, 'utf8')
        : '';
      const prisma = createPrismaClient({
        url: `file:${join(storageRoot, 'jixia.db')}`,
      });

      try {
        await expect(prisma.providerCredential.findMany()).resolves.toHaveLength(1);
        await expect(prisma.providerCredentialSecret.findMany()).resolves.toHaveLength(1);
        await expect(prisma.workbenchSettings.findUnique({
          where: { userId: 'user-alice' },
        })).resolves.toMatchObject({
          credentialRef: expect.any(String),
          defaultImportTarget: 'project-workspace',
        });
      } finally {
        await prisma.$disconnect();
      }

      expect(persistedStateText).not.toContain('sk-test-secret');
      expect(persistedStateText).not.toContain(
        Buffer.from('sk-test-secret', 'utf8').toString('base64'),
      );
      expect(persistedStateText).not.toContain('encryptedSecret');
      expect(persistedStateText).not.toContain('workbenchSettings');

      const personalLibraryResponse = await fetch(`${baseUrl}/api/library/personal`, {
        headers: withSessionCookie(aliceCookie),
      });
      expect(personalLibraryResponse.status).toBe(200);

      const personalLibrary = await personalLibraryResponse.json();
      expect(personalLibrary.entries).toContainEqual(
        expect.objectContaining({
          canonicalId: search.items[0].canonicalId,
          title: importedPersonalRecord.asset.title,
          visibility: 'private',
        }),
      );

      const { createDemoApi } = await import('../../src/web/lib/demo-api');
      const demoApi = createDemoApi(baseUrl, { cookie: aliceCookie });
      const todayFromClient = await demoApi.getTodayRecommendations();
      const searchFromClient = await demoApi.searchDiscovery('tumor board');
      const settingsFromClient = await demoApi.getWorkbenchSettings();
      const personalLibraryFromClient = await demoApi.getPersonalLibraryEntries();
      const writingReadWithoutActor = await fetch(
        `${baseUrl}/api/writing/space-alpha/projects/project-alpha/document`,
      );
      const sharedSpace = await fetch(`${baseUrl}/api/spaces`, {
        body: JSON.stringify({ kind: 'shared', name: 'Writer Space' }),
        headers: withSessionCookie(aliceCookie, {
          'Content-Type': 'application/json',
        }),
        method: 'POST',
      }).then((response) => response.json() as Promise<{ id: string }>);
      const project = await fetch(`${baseUrl}/api/projects`, {
        body: JSON.stringify({ name: 'Writer Project', spaceId: sharedSpace.id }),
        headers: withSessionCookie(aliceCookie, {
          'Content-Type': 'application/json',
        }),
        method: 'POST',
      }).then((response) => response.json() as Promise<{ project: { id: string } }>);
      const importedProjectRecord = await fetch(`${baseUrl}/api/import/paper`, {
        body: JSON.stringify({
          scope: { id: project.project.id, type: 'project' },
          sourceLocator: search.items[0].sourceLocator,
          sourceType: search.items[0].sourceType,
          spaceId: sharedSpace.id,
          visibility: 'published_to_project',
        }),
        headers: withSessionCookie(aliceCookie, {
          'Content-Type': 'application/json',
        }),
        method: 'POST',
      }).then(
        (response) => response.json() as Promise<{
          asset: { id: string; storageKey?: string };
          entry: { id: string };
        }>,
      );
      expect(importedProjectRecord.asset.storageKey).toBeUndefined();
      const rejectedVisibilityComment = await fetch(`${baseUrl}/api/reading/${importedProjectRecord.entry.id}/notes`, {
        body: JSON.stringify({
          body: 'Rejected project comment through note visibility.',
          visibility: 'space_shared',
        }),
        headers: withSessionCookie(aliceCookie, {
          'Content-Type': 'application/json',
        }),
        method: 'POST',
      });
      const projectCommentFromClient = await demoApi.createProjectReadingComment({
        body: 'Workbench project comment through explicit route.',
        entryId: importedProjectRecord.entry.id,
      });
      const projectReaderDetail = await demoApi.getReadingDetail(importedProjectRecord.entry.id);
      const writingDocumentFromClient = await demoApi.getWritingDocument(
        sharedSpace.id,
        project.project.id,
      ).catch((error) => error);
      const writingSaveFromClient = await demoApi.saveWritingDocument({
        citations: [{ paperAssetId: importedProjectRecord.asset.id }],
        content: 'Writer draft content',
        projectId: project.project.id,
        spaceId: sharedSpace.id,
        title: 'Writer draft title',
      });
      const structuredWorkbenchSave = await demoApi.saveWritingDocument({
        citations: [],
        documentContent: {
          blocks: [
            {
              level: 2,
              text: 'Structured Writer draft',
              type: 'heading',
            },
            {
              text: 'Structured workbench paragraph.',
              type: 'paragraph',
            },
            {
              evidenceSpan: 'structured project quote',
              libraryEntryId: importedProjectRecord.entry.id,
              paperAssetId: importedProjectRecord.asset.id,
              text: 'structured project quote',
              type: 'quote',
            },
            {
              evidenceSpan: 'structured suggestion evidence',
              libraryEntryId: importedProjectRecord.entry.id,
              paperAssetId: importedProjectRecord.asset.id,
              status: 'proposed',
              text: 'Use this project-scoped evidence in the synthesis.',
              type: 'aiSuggestion',
            },
          ],
          schemaVersion: 1,
        },
        projectId: project.project.id,
        spaceId: sharedSpace.id,
        title: 'Structured Writer draft title',
      });
      const reloadedWritingDocument = await demoApi.getWritingDocument(
        sharedSpace.id,
        project.project.id,
      );
      const compatibilityWritingDocument = await fetch(
        `${baseUrl}/api/writing/${sharedSpace.id}/projects/${project.project.id}/document`,
        {
          headers: withSessionCookie(aliceCookie),
        },
      ).then((response) => response.json());
      const wrongSpaceWritingSaveResponse = await fetch(
        `${baseUrl}/api/writing/space-wrong/projects/${project.project.id}/document`,
        {
            body: JSON.stringify({
              citations: [{ paperAssetId: importedProjectRecord.asset.id }],
              content: 'Wrong-space write attempt',
              title: 'Wrong-space title',
            }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        },
      );
      const writingAfterWrongSpaceSave = await demoApi.getWritingDocument(
        sharedSpace.id,
        project.project.id,
      );
      const bobSearchFromClient = await createDemoApi(baseUrl, { cookie: bobCookie }).searchDiscovery(
        'tumor board',
      );

      expect(todayFromClient.items).toBeDefined();
      expect(searchFromClient.items.length).toBeGreaterThan(0);
      expect(
        searchFromClient.items.some(
          (item) =>
            item.canonicalId === search.items[0].canonicalId &&
            item.imported === true,
        ),
      ).toBe(true);
      expect(
        bobSearchFromClient.items.some(
          (item) =>
            item.canonicalId === search.items[0].canonicalId &&
            item.imported === false,
        ),
      ).toBe(true);
      expect(settingsFromClient.apiKeyConfigured).toBeDefined();
      expect(personalLibraryFromClient.entries).toContainEqual(
        expect.objectContaining({
          canonicalId: search.items[0].canonicalId,
        }),
      );
      expect(rejectedVisibilityComment.status).toBe(400);
      await expect(rejectedVisibilityComment.json()).resolves.toMatchObject({
        error: expect.stringMatching(/project-comments endpoint/i),
      });
      expect(projectCommentFromClient.comment).toMatchObject({
        body: 'Workbench project comment through explicit route.',
        kind: 'project_comment',
        projectId: project.project.id,
      });
      expect(projectReaderDetail.projectComments).toContainEqual(
        expect.objectContaining({
          body: 'Workbench project comment through explicit route.',
        }),
      );
      expect(writingReadWithoutActor.status).toBe(401);
      expect(writingDocumentFromClient).toBeInstanceOf(Error);
      expect((writingDocumentFromClient as Error).message).toContain('No Writer document exists');
      expect(writingSaveFromClient.document).toMatchObject({
        projectId: project.project.id,
        spaceId: sharedSpace.id,
      });
      expect(writingSaveFromClient.document.latestSnapshot).toMatchObject({
        content: 'Writer draft content',
        doc: expect.objectContaining({
          projectId: project.project.id,
          spaceId: sharedSpace.id,
          title: 'Writer draft title',
        }),
      });
      expect(structuredWorkbenchSave.document.latestSnapshot).toMatchObject({
        content:
          '## Structured Writer draft\n\nStructured workbench paragraph.\n\n> structured project quote\n\nAI suggestion: Use this project-scoped evidence in the synthesis.',
        documentContent: {
          blocks: [
            {
              level: 2,
              text: 'Structured Writer draft',
              type: 'heading',
            },
            {
              text: 'Structured workbench paragraph.',
              type: 'paragraph',
            },
            {
              evidenceSpan: 'structured project quote',
              libraryEntryId: importedProjectRecord.entry.id,
              paperAssetId: importedProjectRecord.asset.id,
              text: 'structured project quote',
              type: 'quote',
            },
            {
              evidenceSpan: 'structured suggestion evidence',
              libraryEntryId: importedProjectRecord.entry.id,
              paperAssetId: importedProjectRecord.asset.id,
              status: 'proposed',
              text: 'Use this project-scoped evidence in the synthesis.',
              type: 'aiSuggestion',
            },
          ],
          schemaVersion: 1,
        },
      });
      expect(structuredWorkbenchSave.document.latestSnapshot?.citations).toEqual([
        expect.objectContaining({
          evidenceSpan: [
            'structured project quote',
            'structured suggestion evidence',
          ].join('\n\n'),
          paperAssetId: importedProjectRecord.asset.id,
        }),
      ]);
      expect(reloadedWritingDocument.document).toMatchObject({
        documentId: writingSaveFromClient.document.documentId,
        latestSnapshot: expect.objectContaining({
          content:
            '## Structured Writer draft\n\nStructured workbench paragraph.\n\n> structured project quote\n\nAI suggestion: Use this project-scoped evidence in the synthesis.',
          documentContent: structuredWorkbenchSave.document.latestSnapshot?.documentContent,
        }),
        projectId: project.project.id,
        spaceId: sharedSpace.id,
      });
      expect(compatibilityWritingDocument.document).toMatchObject({
        documentId: writingSaveFromClient.document.documentId,
        latestSnapshot: expect.objectContaining({
          content:
            '## Structured Writer draft\n\nStructured workbench paragraph.\n\n> structured project quote\n\nAI suggestion: Use this project-scoped evidence in the synthesis.',
          documentContent: structuredWorkbenchSave.document.latestSnapshot?.documentContent,
        }),
        projectId: project.project.id,
        spaceId: sharedSpace.id,
      });
      expect(wrongSpaceWritingSaveResponse.status).toBe(400);
      await expect(wrongSpaceWritingSaveResponse.json()).resolves.toMatchObject({
        error: expect.stringMatching(/belongs to governance space/i),
      });
      expect(writingAfterWrongSpaceSave.document).toMatchObject({
        documentId: writingSaveFromClient.document.documentId,
        latestSnapshot: expect.objectContaining({
          content:
            '## Structured Writer draft\n\nStructured workbench paragraph.\n\n> structured project quote\n\nAI suggestion: Use this project-scoped evidence in the synthesis.',
          documentContent: structuredWorkbenchSave.document.latestSnapshot?.documentContent,
        }),
      });
    } finally {
      await closeServer(httpServer.server);
      rmSync(storageRoot, { force: true, recursive: true });
    }
  }, 15_000);

  it('surfaces PubMed provider failure without synthetic discovery records', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-workbench-discovery-failure-'));
    const httpServer = createHttpServer({
      connectors: {
        pubmed: createUnavailablePubmedConnector(),
      },
      env: {
        JIXIA_HOST: '127.0.0.1',
        JIXIA_STORAGE_ROOT: storageRoot,
      },
    });

    try {
      const baseUrl = await listenOnEphemeralPort(httpServer.server);
      const searchResponse = await fetch(`${baseUrl}/api/discovery/search?query=oncology`);

      expect(searchResponse.status).toBe(400);
      await expect(searchResponse.json()).resolves.toMatchObject({
        error: expect.stringMatching(/PubMed fixture unavailable/i),
      });
    } finally {
      await closeServer(httpServer.server);
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('rejects matching legacy identity fields on workbench compatibility APIs', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-workbench-identity-'));
    const httpServer = createHttpServer({
      env: {
        JIXIA_HOST: '127.0.0.1',
        JIXIA_STORAGE_ROOT: storageRoot,
      },
    });

    try {
      const baseUrl = await listenOnEphemeralPort(httpServer.server);
      const aliceCookie = await loginAs(baseUrl, 'user-alice');

      const rejectionResponses = await Promise.all([
        fetch(`${baseUrl}/api/discovery/today?actorUserId=user-alice`, {
          headers: withSessionCookie(aliceCookie),
        }),
        fetch(`${baseUrl}/api/discovery/search?query=tumor&userId=user-alice`, {
          headers: withSessionCookie(aliceCookie),
        }),
        fetch(`${baseUrl}/api/library/personal?actorUserId=user-alice`, {
          headers: withSessionCookie(aliceCookie),
        }),
        fetch(`${baseUrl}/api/library/personal/import?actorUserId=user-alice`, {
          body: JSON.stringify({
            sourceLocator: '10.1000/workbench-query-import',
            sourceType: 'doi',
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }),
        fetch(`${baseUrl}/api/library/personal/import?requestedByUserId=user-alice`, {
          body: JSON.stringify({
            sourceLocator: '10.1000/workbench-requested-query-import',
            sourceType: 'doi',
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }),
        fetch(`${baseUrl}/api/library/personal/import`, {
          body: JSON.stringify({
            requestedByUserId: 'user-alice',
            sourceLocator: '10.1000/workbench-matching-import',
            sourceType: 'doi',
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }),
        fetch(`${baseUrl}/api/settings/me?userId=user-alice`, {
          headers: withSessionCookie(aliceCookie),
        }),
        fetch(`${baseUrl}/api/settings/me?actorUserId=user-alice`, {
          body: JSON.stringify({
            defaultImportTarget: 'personal-library',
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }),
        fetch(`${baseUrl}/api/settings/me`, {
          body: JSON.stringify({
            defaultImportTarget: 'personal-library',
            userId: 'user-alice',
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }),
        fetch(`${baseUrl}/api/reading/entry-matching/notes?actorUserId=user-alice`, {
          body: JSON.stringify({
            body: 'Legacy query actor should be rejected.',
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }),
        fetch(`${baseUrl}/api/reading/entry-matching/notes?authorUserId=user-alice`, {
          body: JSON.stringify({
            body: 'Legacy query author should be rejected.',
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }),
        fetch(`${baseUrl}/api/reading/entry-matching/notes`, {
          body: JSON.stringify({
            authorUserId: 'user-alice',
            body: 'Legacy matching author should be rejected.',
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }),
        fetch(`${baseUrl}/api/reading/entry-matching/notes`, {
          body: JSON.stringify({
            actorSpaceId: 'space-alpha',
            body: 'Legacy actor space should be rejected.',
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }),
        fetch(`${baseUrl}/api/reading/entry-matching/insights?userId=user-alice`, {
          body: JSON.stringify({
            evidenceSpans: [],
            summary: 'Legacy query insight actor should be rejected.',
            title: 'Legacy Query Insight',
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }),
        fetch(`${baseUrl}/api/reading/entry-matching/insights?startedByUserId=user-alice`, {
          body: JSON.stringify({
            evidenceSpans: [],
            summary: 'Legacy query insight starter should be rejected.',
            title: 'Legacy Query Insight Starter',
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }),
        fetch(`${baseUrl}/api/reading/entry-matching/insights`, {
          body: JSON.stringify({
            evidenceSpans: [],
            startedByUserId: 'user-alice',
            summary: 'Legacy matching insight starter should be rejected.',
            title: 'Legacy Insight',
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }),
        fetch(`${baseUrl}/api/writing/space-alpha/projects/project-alpha/document?actorUserId=user-alice`, {
          headers: withSessionCookie(aliceCookie),
        }),
        fetch(`${baseUrl}/api/writing/space-alpha/projects/project-alpha/document?userId=user-alice`, {
          body: JSON.stringify({
            citations: [],
            content: 'Legacy query writer actor should be rejected.',
            title: 'Legacy Query Writer',
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }),
        fetch(`${baseUrl}/api/writing/space-alpha/projects/project-alpha/document`, {
          body: JSON.stringify({
            actorUserId: 'user-alice',
            citations: [],
            content: 'Legacy matching writer actor should be rejected.',
            title: 'Legacy Writer',
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }),
      ]);

      for (const response of rejectionResponses) {
        const payload = (await response.json()) as { error: string };

        expect(response.status).toBe(400);
        expect(payload.error).toMatch(/not accepted for protected routes/i);
      }
    } finally {
      await closeServer(httpServer.server);
      rmSync(storageRoot, { force: true, recursive: true });
    }
  }, 10_000);

  it('documents the new workbench surfaces in the README and handoff notes', () => {
    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8');
    const readmeCn = readFileSync(join(process.cwd(), 'README_CN.md'), 'utf8');
    const loginPage = readFileSync(join(process.cwd(), 'src/web/pages/login-page.tsx'), 'utf8');
    const sessionContract = readFileSync(
      join(process.cwd(), 'src/shared/contracts/session.ts'),
      'utf8',
    );
    const handoffNotes = readFileSync(
      join(
        process.cwd(),
        'docs/plans/2026-03-21-jixia-task-10-ui-direction-notes.md',
      ),
      'utf8',
    );

    expect(readme).toContain('个人工作台首页');
    expect(readme).toContain('今日推荐');
    expect(readme).toContain('Projects');
    expect(readme).toContain('loginProfileKey');
    expect(readme).toContain('raw identity fields such as `userId`, `email`, `actorUserId`');
    expect(readmeCn).toContain('个人工作台首页');
    expect(readmeCn).toContain('共享评论');
    expect(readmeCn).toContain('/login` 是真实的 session 入口页');
    expect(readmeCn).toContain('loginProfileKey');
    expect(readmeCn).toContain('`userId`、`email`、`actorUserId`');
    expect(sessionContract).toContain('loginProfileKey: LoginProfileKey');
    expect(sessionContract).not.toContain('userId?: string');
    expect(sessionContract).not.toContain('email?: string');
    expect(loginPage).toContain('loginProfileKey');
    expect(loginPage).not.toContain('await login({ userId:');
    expect(handoffNotes).toContain('Personal vs Project 上下文');
    expect(handoffNotes).toContain('Project Docs 共享知识中心');
    expect(
      existsSync(join(process.cwd(), 'docs/plans/2026-03-23-jixia-web-interaction-design.md')),
    ).toBe(true);
    expect(
      existsSync(
        join(process.cwd(), 'docs/plans/2026-03-23-jixia-web-interaction-implementation.md'),
      ),
    ).toBe(true);
  });

  it('bootstraps legacy credential settings once and lets Prisma win over stale json', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-workbench-legacy-'));
    const databaseUrl = `file:${join(storageRoot, 'jixia-workbench-legacy.db')}`;
    const env = {
      JIXIA_DATABASE_URL: databaseUrl,
      JIXIA_STORAGE_ROOT: storageRoot,
    };
    const now = new Date().toISOString();
    const legacySecret = createSecretBox(env).encrypt('legacy-api-key');

    writeFileSync(
      join(storageRoot, 'server-state.json'),
      JSON.stringify(
        {
          credentials: [
            {
              ...legacySecret,
              createdAt: now,
              credentialRef: 'cred-legacy',
              provider: 'workbench-api-key',
              userId: 'user-alice',
            },
          ],
          nextSequence: 10,
          workbenchSettings: [
            {
              credentialRef: 'cred-legacy',
              defaultImportTarget: 'project-workspace',
              updatedAt: now,
              userId: 'user-alice',
            },
          ],
        },
        null,
        2,
      ),
    );

    const prisma = createPrismaClient({ url: databaseUrl });

    try {
      const firstApp = createJixiaApp({ env });
      const preBootstrapState = readFileSync(join(storageRoot, 'server-state.json'), 'utf8');

      expect(preBootstrapState).toContain('cred-legacy');
      expect(preBootstrapState).not.toContain('nextSequence');

      await expect(
        firstApp.credentials.getWorkbenchSettings('user-alice'),
      ).resolves.toEqual({
        apiKeyConfigured: true,
        defaultImportTarget: 'project-workspace',
      });
      await firstApp.close();

      await expect(prisma.providerCredential.findMany()).resolves.toHaveLength(1);
      await expect(prisma.providerCredentialSecret.findMany()).resolves.toHaveLength(1);
      await expect(
        prisma.workbenchSettings.findUnique({ where: { userId: 'user-alice' } }),
      ).resolves.toMatchObject({
        credentialRef: 'cred-legacy',
        defaultImportTarget: 'project-workspace',
      });

      const cleanedState = readFileSync(join(storageRoot, 'server-state.json'), 'utf8');
      expect(cleanedState).not.toContain('credentials');
      expect(cleanedState).not.toContain('workbenchSettings');

      const staleSecret = createSecretBox(env).encrypt('stale-api-key');
      writeFileSync(
        join(storageRoot, 'server-state.json'),
        JSON.stringify(
          {
            credentials: [
              {
                ...staleSecret,
                createdAt: now,
                credentialRef: 'cred-stale',
                provider: 'workbench-api-key',
                userId: 'user-alice',
              },
            ],
            nextSequence: 11,
            workbenchSettings: [
              {
                credentialRef: 'cred-stale',
                defaultImportTarget: 'personal-library',
                updatedAt: now,
                userId: 'user-alice',
              },
            ],
          },
          null,
          2,
        ),
      );

      const secondApp = createJixiaApp({ env });

      await expect(
        secondApp.credentials.getWorkbenchSettings('user-alice'),
      ).resolves.toEqual({
        apiKeyConfigured: true,
        defaultImportTarget: 'project-workspace',
      });
      await secondApp.close();

      await expect(prisma.providerCredential.findMany()).resolves.toHaveLength(1);
      await expect(prisma.providerCredentialSecret.findMany()).resolves.toHaveLength(1);
      await expect(
        prisma.workbenchSettings.findUnique({ where: { userId: 'user-alice' } }),
      ).resolves.toMatchObject({
        credentialRef: 'cred-legacy',
        defaultImportTarget: 'project-workspace',
      });
    } finally {
      await prisma.$disconnect();
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('keeps settings durable through Prisma and fails closed when credential rows cannot be decrypted', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-workbench-key-'));
    const databaseUrl = `file:${join(storageRoot, 'jixia-workbench-key.db')}`;
    const env = {
      JIXIA_DATABASE_URL: databaseUrl,
      JIXIA_STORAGE_ROOT: storageRoot,
    };
    const prisma = createPrismaClient({ url: databaseUrl });

    try {
      const firstApp = createJixiaApp({ env });

      await expect(
        firstApp.credentials.saveWorkbenchSettings(
          {
            apiKey: 'durable-api-key',
            defaultImportTarget: 'project-workspace',
          },
          'user-alice',
        ),
      ).resolves.toEqual({
        apiKeyConfigured: true,
        defaultImportTarget: 'project-workspace',
      });
      await firstApp.close();

      const secondApp = createJixiaApp({ env });

      await expect(
        secondApp.credentials.getWorkbenchSettings('user-alice'),
      ).resolves.toEqual({
        apiKeyConfigured: true,
        defaultImportTarget: 'project-workspace',
      });
      await secondApp.close();

      writeFileSync(join(storageRoot, 'credentials.key'), Buffer.alloc(32, 7).toString('base64'));

      const wrongKeyApp = createJixiaApp({ env });

      await expect(
        wrongKeyApp.credentials.getWorkbenchSettings('user-alice'),
      ).resolves.toEqual({
        apiKeyConfigured: false,
        defaultImportTarget: 'project-workspace',
      });
      const savedWorkbenchSettings = await prisma.workbenchSettings.findUniqueOrThrow({
        where: { userId: 'user-alice' },
      });
      const savedCredentialRef = savedWorkbenchSettings.credentialRef;

      expect(savedCredentialRef).toEqual(expect.stringMatching(/^cred-/));
      if (!savedCredentialRef) {
        throw new Error('Expected durable workbench settings to reference a credential.');
      }

      await expect(
        wrongKeyApp.credentials.getStoredCredential(savedCredentialRef, 'user-alice'),
      ).resolves.toBeNull();
      await expect(
        wrongKeyApp.credentials.saveWorkbenchSettings(
          {
            apiKey: 'must-not-overwrite-with-wrong-key',
            defaultImportTarget: 'personal-library',
          },
          'user-alice',
        ),
      ).rejects.toThrow(/cannot be decrypted/i);
      await wrongKeyApp.close();

      await expect(prisma.providerCredential.findMany()).resolves.toHaveLength(1);
      await expect(prisma.providerCredentialSecret.findMany()).resolves.toHaveLength(1);

      await prisma.providerCredentialSecret.deleteMany();

      const danglingCredentialApp = createJixiaApp({ env });

      await expect(
        danglingCredentialApp.credentials.getWorkbenchSettings('user-alice'),
      ).resolves.toEqual({
        apiKeyConfigured: false,
        defaultImportTarget: 'project-workspace',
      });
      await expect(
        danglingCredentialApp.credentials.saveWorkbenchSettings(
          {
            apiKey: 'must-not-recreate-dangling-secret',
            defaultImportTarget: 'personal-library',
          },
          'user-alice',
        ),
      ).rejects.toThrow(/missing encrypted secret material/i);
      await danglingCredentialApp.close();

      await expect(prisma.providerCredential.findMany()).resolves.toHaveLength(1);
      await expect(prisma.providerCredentialSecret.findMany()).resolves.toHaveLength(0);
    } finally {
      await prisma.$disconnect();
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('rotates the persisted workbench credential secret without creating duplicate credential rows', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-workbench-rotation-'));
    const databaseUrl = `file:${join(storageRoot, 'jixia-workbench-rotation.db')}`;
    const env = {
      JIXIA_DATABASE_URL: databaseUrl,
      JIXIA_STORAGE_ROOT: storageRoot,
    };
    const prisma = createPrismaClient({ url: databaseUrl });

    try {
      const app = createJixiaApp({ env });

      await expect(
        app.credentials.saveWorkbenchSettings(
          {
            apiKey: 'first-api-key',
            defaultImportTarget: 'personal-library',
          },
          'user-alice',
        ),
      ).resolves.toEqual({
        apiKeyConfigured: true,
        defaultImportTarget: 'personal-library',
      });

      const firstSettings = await prisma.workbenchSettings.findUnique({
        where: { userId: 'user-alice' },
      });
      const firstSettingsCredentialRef = firstSettings?.credentialRef;

      expect(firstSettingsCredentialRef).toEqual(expect.any(String));
      if (!firstSettingsCredentialRef) {
        throw new Error('Expected first settings save to bind a credential ref.');
      }

      await expect(prisma.providerCredential.findMany()).resolves.toHaveLength(1);
      await expect(prisma.providerCredentialSecret.findMany()).resolves.toHaveLength(1);

      const firstCredentialRow = await prisma.providerCredential.findUniqueOrThrow({
        include: { secret: true },
        where: { id: firstSettingsCredentialRef },
      });

      await expect(
        app.credentials.saveWorkbenchSettings(
          {
            apiKey: 'second-api-key',
            defaultImportTarget: 'project-workspace',
          },
          'user-alice',
        ),
      ).resolves.toEqual({
        apiKeyConfigured: true,
        defaultImportTarget: 'project-workspace',
      });

      const secondSettings = await prisma.workbenchSettings.findUniqueOrThrow({
        where: { userId: 'user-alice' },
      });
      const credentialRows = await prisma.providerCredential.findMany({
        include: { secret: true },
      });
      const secretRows = await prisma.providerCredentialSecret.findMany();

      expect(secondSettings.credentialRef).toBe(firstSettingsCredentialRef);
      expect(secondSettings.defaultImportTarget).toBe('project-workspace');
      expect(credentialRows).toHaveLength(1);
      expect(secretRows).toHaveLength(1);
      expect(credentialRows[0]?.id).toBe(firstSettingsCredentialRef);
      expect(credentialRows[0]?.provider).toBe('workbench-api-key');
      expect(credentialRows[0]?.secret?.encryptedSecret).not.toBe(
        firstCredentialRow.secret?.encryptedSecret,
      );

      await app.close();
    } finally {
      await prisma.$disconnect();
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('persists credential ids across restart and scopes stored credential access to the owner', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-credential-uuid-'));
    const databaseUrl = `file:${join(storageRoot, 'jixia-credential-uuid.db')}`;
    const env = {
      JIXIA_DATABASE_URL: databaseUrl,
      JIXIA_STORAGE_ROOT: storageRoot,
    };
    const prisma = createPrismaClient({ url: databaseUrl });

    try {
      const firstApp = createJixiaApp({ env });
      const firstCredential = await firstApp.credentials.createCredential(
        {
          provider: 'openai',
          rawSecret: 'first-secret',
        },
        'user-alice',
      );

      expect(firstCredential.credentialRef).toMatch(/^cred-[0-9a-f-]{36}$/);
      await firstApp.close();

      const persistedStatePath = join(storageRoot, 'server-state.json');
      const persistedStateText = existsSync(persistedStatePath)
        ? readFileSync(persistedStatePath, 'utf8')
        : '';

      expect(persistedStateText).not.toContain('nextSequence');

      const secondApp = createJixiaApp({ env });
      const secondCredential = await secondApp.credentials.createCredential(
        {
          provider: 'anthropic',
          rawSecret: 'second-secret',
        },
        'user-alice',
      );

      expect(secondCredential.credentialRef).toMatch(/^cred-[0-9a-f-]{36}$/);
      expect(secondCredential.credentialRef).not.toBe(firstCredential.credentialRef);
      await expect(
        secondApp.credentials.getStoredCredential(firstCredential.credentialRef, 'user-bob'),
      ).resolves.toBeNull();
      await expect(
        secondApp.credentials.getStoredCredential(firstCredential.credentialRef, 'user-alice'),
      ).resolves.toMatchObject({
        credentialRef: firstCredential.credentialRef,
        provider: 'openai',
        userId: 'user-alice',
      });
      await secondApp.close();

      const persistedCredentials = await prisma.providerCredential.findMany({
        orderBy: [{ id: 'asc' }],
      });

      expect(persistedCredentials.map((credential) => credential.id)).toEqual(
        expect.arrayContaining([
          firstCredential.credentialRef,
          secondCredential.credentialRef,
        ]),
      );
    } finally {
      await prisma.$disconnect();
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('shares one credential bootstrap across concurrent settings and jobs access', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-credential-bootstrap-race-'));
    const databaseUrl = `file:${join(storageRoot, 'jixia-credential-bootstrap-race.db')}`;
    const env = {
      JIXIA_DATABASE_URL: databaseUrl,
      JIXIA_STORAGE_ROOT: storageRoot,
    };
    const now = new Date().toISOString();
    const legacySecret = createSecretBox(env).encrypt('legacy-api-key');

    writeFileSync(
      join(storageRoot, 'server-state.json'),
      JSON.stringify(
        {
          credentials: [
            {
              ...legacySecret,
              createdAt: now,
              credentialRef: 'cred-legacy',
              provider: 'workbench-api-key',
              userId: 'user-alice',
            },
          ],
          nextSequence: 4,
          workbenchSettings: [
            {
              credentialRef: 'cred-legacy',
              defaultImportTarget: 'project-workspace',
              updatedAt: now,
              userId: 'user-alice',
            },
          ],
        },
        null,
        2,
      ),
    );

    const prisma = createPrismaClient({ url: databaseUrl });

    try {
      const app = createJixiaApp({ env });
      const [settings, jobs] = await Promise.all([
        app.credentials.getWorkbenchSettings('user-alice'),
        app.jobs.listJobs({ actorUserId: 'user-alice' }),
      ]);

      expect(settings).toEqual({
        apiKeyConfigured: true,
        defaultImportTarget: 'project-workspace',
      });
      expect(jobs).toEqual([]);

      await expect(prisma.providerCredential.findMany()).resolves.toHaveLength(1);
      await expect(prisma.providerCredentialSecret.findMany()).resolves.toHaveLength(1);
      await expect(
        prisma.workbenchSettings.findUnique({ where: { userId: 'user-alice' } }),
      ).resolves.toMatchObject({
        credentialRef: 'cred-legacy',
        defaultImportTarget: 'project-workspace',
      });

      await app.close();
    } finally {
      await prisma.$disconnect();
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});
