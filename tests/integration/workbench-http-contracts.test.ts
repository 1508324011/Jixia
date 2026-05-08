import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { createHttpServer } from '../../src/server/http-server';

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
  it('exposes discovery and settings endpoints for the workbench shell', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-workbench-http-'));
    const httpServer = createHttpServer({
      env: {
        JIXIA_HOST: '127.0.0.1',
        JIXIA_STORAGE_ROOT: storageRoot,
      },
    });

    try {
      const baseUrl = await listenOnEphemeralPort(httpServer.server);
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

      const search = await searchResponse.json();
      expect(search.query).toBe('tumor board');
      expect(search.items.length).toBeGreaterThan(0);
      expect(search.items[0]).toMatchObject({
        canonicalId: expect.any(String),
        sourceLocator: expect.any(String),
        sourceType: 'pmid',
        title: expect.any(String),
      });

      const unauthenticatedPersonalLibraryResponse = await fetch(
        `${baseUrl}/api/library/personal`,
      );
      expect(unauthenticatedPersonalLibraryResponse.status).toBe(401);

      const emptyPersonalLibraryResponse = await fetch(`${baseUrl}/api/library/personal`, {
        headers: { 'x-jixia-actor': 'user-alice' },
      });
      expect(emptyPersonalLibraryResponse.status).toBe(200);

      const emptyPersonalLibrary = await emptyPersonalLibraryResponse.json();
      expect(emptyPersonalLibrary).toEqual({ entries: [] });

      const importPersonalLibraryResponse = await fetch(`${baseUrl}/api/library/personal/import`, {
        body: JSON.stringify({
          sourceLocator: search.items[0].sourceLocator,
          sourceType: search.items[0].sourceType,
        }),
        headers: {
          'Content-Type': 'application/json',
          'x-jixia-actor': 'user-alice',
        },
        method: 'POST',
      });
      expect(importPersonalLibraryResponse.status).toBe(201);

      const importedPersonalRecord = await importPersonalLibraryResponse.json();
      expect(importedPersonalRecord.asset.canonicalId).toBe(search.items[0].canonicalId);

      const unauthenticatedSettingsResponse = await fetch(`${baseUrl}/api/settings/me`);
      expect(unauthenticatedSettingsResponse.status).toBe(401);

      const spoofedSettingsResponse = await fetch(
        `${baseUrl}/api/settings/me?userId=user-bob`,
        { headers: { 'x-jixia-actor': 'user-alice' } },
      );
      expect(spoofedSettingsResponse.status).toBe(400);

      const settingsResponse = await fetch(`${baseUrl}/api/settings/me`, {
        headers: { 'x-jixia-actor': 'user-alice' },
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
        headers: {
          'Content-Type': 'application/json',
          'x-jixia-actor': 'user-alice',
        },
        method: 'POST',
      });
      expect(savedResponse.status).toBe(200);

      const savedSettings = await savedResponse.json();
      expect(savedSettings).toMatchObject({
        apiKeyConfigured: true,
        defaultImportTarget: 'project-workspace',
      });
      expect(savedSettings.apiKey).toBeUndefined();

      const spoofedSettingsSaveResponse = await fetch(`${baseUrl}/api/settings/me`, {
        body: JSON.stringify({
          defaultImportTarget: 'personal-library',
          userId: 'user-bob',
        }),
        headers: {
          'Content-Type': 'application/json',
          'x-jixia-actor': 'user-alice',
        },
        method: 'POST',
      });
      expect(spoofedSettingsSaveResponse.status).toBe(400);

      const persistedSettingsResponse = await fetch(`${baseUrl}/api/settings/me`, {
        headers: { 'x-jixia-actor': 'user-alice' },
      });
      expect(persistedSettingsResponse.status).toBe(200);

      const persistedSettings = await persistedSettingsResponse.json();
      expect(persistedSettings).toMatchObject({
        apiKeyConfigured: true,
        defaultImportTarget: 'project-workspace',
      });
      expect(persistedSettings.apiKey).toBeUndefined();

      const persistedState = JSON.parse(
        readFileSync(join(storageRoot, 'server-state.json'), 'utf8'),
      ) as {
        credentials?: Array<{ encryptedSecret?: string }>;
        workbenchSettings?: Array<{ credentialRef?: string; defaultImportTarget?: string }>;
      };
      const persistedStateText = readFileSync(join(storageRoot, 'server-state.json'), 'utf8');

      expect(persistedState.credentials).toHaveLength(1);
      expect(persistedState.credentials?.[0]?.encryptedSecret).toBeDefined();
      expect(persistedState.workbenchSettings).toMatchObject([
        {
          credentialRef: expect.any(String),
          defaultImportTarget: 'project-workspace',
        },
      ]);
      expect(persistedStateText).not.toContain('sk-test-secret');

      const personalLibraryResponse = await fetch(`${baseUrl}/api/library/personal`, {
        headers: { 'x-jixia-actor': 'user-alice' },
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
      const demoApi = createDemoApi(baseUrl, 'user-alice');
      const todayFromClient = await demoApi.getTodayRecommendations();
      const searchFromClient = await demoApi.searchDiscovery('tumor board');
      const settingsFromClient = await demoApi.getWorkbenchSettings();
      const personalLibraryFromClient = await demoApi.getPersonalLibraryEntries();
      const writingReadWithoutActor = await fetch(
        `${baseUrl}/api/writing/space-alpha/projects/project-alpha/document`,
      );
      const sharedSpace = await fetch(`${baseUrl}/api/spaces`, {
        body: JSON.stringify({ kind: 'shared', name: 'Writer Space' }),
        headers: {
          'Content-Type': 'application/json',
          'x-jixia-actor': 'user-alice',
        },
        method: 'POST',
      }).then((response) => response.json() as Promise<{ id: string }>);
      const project = await fetch(`${baseUrl}/api/projects`, {
        body: JSON.stringify({ name: 'Writer Project', spaceId: sharedSpace.id }),
        headers: {
          'Content-Type': 'application/json',
          'x-jixia-actor': 'user-alice',
        },
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
        headers: {
          'Content-Type': 'application/json',
          'x-jixia-actor': 'user-alice',
        },
        method: 'POST',
      }).then(
        (response) => response.json() as Promise<{ asset: { id: string } }>,
      );
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
      const reloadedWritingDocument = await demoApi.getWritingDocument(
        sharedSpace.id,
        project.project.id,
      );
      const compatibilityWritingDocument = await fetch(
        `${baseUrl}/api/writing/${sharedSpace.id}/projects/${project.project.id}/document`,
        {
          headers: { 'x-jixia-actor': 'user-alice' },
        },
      ).then((response) => response.json());
      const bobSearchFromClient = await createDemoApi(baseUrl, 'user-bob').searchDiscovery(
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
      expect(reloadedWritingDocument.document).toMatchObject({
        documentId: writingSaveFromClient.document.documentId,
        projectId: project.project.id,
        spaceId: sharedSpace.id,
      });
      expect(compatibilityWritingDocument.document).toMatchObject({
        documentId: writingSaveFromClient.document.documentId,
        projectId: project.project.id,
        spaceId: sharedSpace.id,
      });
    } finally {
      await closeServer(httpServer.server);
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('documents the new workbench surfaces in the README and handoff notes', () => {
    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8');
    const readmeCn = readFileSync(join(process.cwd(), 'README_CN.md'), 'utf8');
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
    expect(readmeCn).toContain('个人工作台首页');
    expect(readmeCn).toContain('共享评论');
    expect(handoffNotes).toContain('Personal vs Project 上下文');
    expect(handoffNotes).toContain('Writer 文档区');
    expect(
      existsSync(join(process.cwd(), 'docs/plans/2026-03-23-jixia-web-interaction-design.md')),
    ).toBe(true);
    expect(
      existsSync(
        join(process.cwd(), 'docs/plans/2026-03-23-jixia-web-interaction-implementation.md'),
      ),
    ).toBe(true);
  });
});
