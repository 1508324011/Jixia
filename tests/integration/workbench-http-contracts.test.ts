import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import type { PubmedConnector } from '../../src/server/connectors/pubmed.connector';
import { createHttpServer } from '../../src/server/http-server';

function createStubPubmedConnector(): PubmedConnector {
  return {
    async lookup(locator, sourceType) {
      return {
        abstractText: `External ${sourceType.toUpperCase()} abstract for ${locator}`,
        canonicalId: `${sourceType}:${locator}`,
        title: `Imported ${sourceType.toUpperCase()} paper ${locator}`,
      };
    },
    async search(query) {
      return [
        {
          abstractText: `PubMed search result for ${query}`,
          canonicalId: 'pmid:654321',
          reason: 'PubMed query matched tumor-board biomarker curation work.',
          sourceLabel: 'PubMed',
          sourceLocator: '654321',
          sourceType: 'pmid' as const,
          title: 'Tumor board biomarkers for rapid review',
        },
      ];
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
      connectors: {
        pubmed: createStubPubmedConnector(),
      },
      env: {
        JIXIA_HOST: '127.0.0.1',
        JIXIA_STORAGE_ROOT: storageRoot,
      },
    });

    try {
      const baseUrl = await listenOnEphemeralPort(httpServer.server);
      const actorHeaders = { 'x-jixia-actor': 'user-alice' };
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

      const unauthorizedPersonalLibraryResponse = await fetch(`${baseUrl}/api/library/personal`);
      expect(unauthorizedPersonalLibraryResponse.status).toBe(401);

      const emptyPersonalLibraryResponse = await fetch(`${baseUrl}/api/library/personal`, {
        headers: actorHeaders,
      });
      expect(emptyPersonalLibraryResponse.status).toBe(200);

      const emptyPersonalLibrary = await emptyPersonalLibraryResponse.json();
      expect(emptyPersonalLibrary).toEqual({ entries: [] });

      const unauthorizedImportPersonalLibraryResponse = await fetch(
        `${baseUrl}/api/library/personal/import`,
        {
          body: JSON.stringify({
            sourceLocator: search.items[0].sourceLocator,
            sourceType: search.items[0].sourceType,
          }),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
        },
      );
      expect(unauthorizedImportPersonalLibraryResponse.status).toBe(401);

      const importPersonalLibraryResponse = await fetch(`${baseUrl}/api/library/personal/import`, {
        body: JSON.stringify({
          sourceLocator: search.items[0].sourceLocator,
          sourceType: search.items[0].sourceType,
        }),
        headers: {
          'Content-Type': 'application/json',
          ...actorHeaders,
        },
        method: 'POST',
      });
      expect(importPersonalLibraryResponse.status).toBe(201);

      const importedPersonalRecord = await importPersonalLibraryResponse.json();
      expect(importedPersonalRecord.asset.canonicalId).toBe(search.items[0].canonicalId);

      const missingActorSettingsResponse = await fetch(`${baseUrl}/api/settings/me`);
      expect(missingActorSettingsResponse.status).toBe(401);

      const spoofedSettingsReadResponse = await fetch(
        `${baseUrl}/api/settings/me?actorUserId=user-bob`,
        {
          headers: actorHeaders,
        },
      );
      expect(spoofedSettingsReadResponse.status).toBe(400);

      const spoofedSettingsWriteResponse = await fetch(`${baseUrl}/api/settings/me`, {
        body: JSON.stringify({
          actorUserId: 'user-bob',
          defaultImportTarget: 'project-workspace',
        }),
        headers: {
          'Content-Type': 'application/json',
          ...actorHeaders,
        },
        method: 'POST',
      });
      expect(spoofedSettingsWriteResponse.status).toBe(400);

      const settingsResponse = await fetch(`${baseUrl}/api/settings/me`, {
        headers: actorHeaders,
      });
      expect(settingsResponse.status).toBe(200);

      const settings = await settingsResponse.json();
      expect(settings).toMatchObject({
        apiKeyConfigured: false,
        defaultImportTarget: 'personal-library',
      });
      expect(settings.apiKey).toBeUndefined();

      const unauthorizedSavedResponse = await fetch(`${baseUrl}/api/settings/me`, {
        body: JSON.stringify({
          apiKey: 'sk-test-secret',
          defaultImportTarget: 'project-workspace',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
      expect(unauthorizedSavedResponse.status).toBe(401);

      const savedResponse = await fetch(`${baseUrl}/api/settings/me`, {
        body: JSON.stringify({
          apiKey: 'sk-test-secret',
          defaultImportTarget: 'project-workspace',
        }),
        headers: {
          'Content-Type': 'application/json',
          ...actorHeaders,
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

      const persistedSettingsResponse = await fetch(`${baseUrl}/api/settings/me`, {
        headers: actorHeaders,
      });
      expect(persistedSettingsResponse.status).toBe(200);

      const persistedSettings = await persistedSettingsResponse.json();
      expect(persistedSettings).toMatchObject({
        apiKeyConfigured: true,
        defaultImportTarget: 'project-workspace',
      });
      expect(persistedSettings.apiKey).toBeUndefined();

      const bearerSettingsResponse = await fetch(`${baseUrl}/api/settings/me`, {
        headers: {
          Authorization: 'Bearer user-alice',
        },
      });
      expect(bearerSettingsResponse.status).toBe(200);
      await expect(bearerSettingsResponse.json()).resolves.toMatchObject({
        apiKeyConfigured: true,
        defaultImportTarget: 'project-workspace',
      });

      const bobSettingsResponse = await fetch(`${baseUrl}/api/settings/me`, {
        headers: {
          'x-jixia-actor': 'user-bob',
        },
      });
      expect(bobSettingsResponse.status).toBe(200);

      const bobSettings = await bobSettingsResponse.json();
      expect(bobSettings).toMatchObject({
        apiKeyConfigured: false,
        defaultImportTarget: 'personal-library',
      });
      expect(bobSettings.apiKey).toBeUndefined();

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
        headers: actorHeaders,
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

      const unauthorizedWorkbenchNoteResponse = await fetch(
        `${baseUrl}/api/reading/${importedPersonalRecord.entry.id}/notes`,
        {
          body: JSON.stringify({
            body: 'Unauthorized compatibility note',
            visibility: 'private',
          }),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
        },
      );
      expect(unauthorizedWorkbenchNoteResponse.status).toBe(401);

      const noteResponse = await fetch(
        `${baseUrl}/api/reading/${importedPersonalRecord.entry.id}/notes`,
        {
          body: JSON.stringify({
            body: 'Workbench compatibility note',
            visibility: 'private',
          }),
          headers: {
            'Content-Type': 'application/json',
            ...actorHeaders,
          },
          method: 'POST',
        },
      );
      expect(noteResponse.status).toBe(201);

      const unauthorizedWorkbenchInsightResponse = await fetch(
        `${baseUrl}/api/reading/${importedPersonalRecord.entry.id}/insights`,
        {
          body: JSON.stringify({
            summary: 'Unauthorized compatibility insight',
            title: 'Unauthorized insight',
          }),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
        },
      );
      expect(unauthorizedWorkbenchInsightResponse.status).toBe(401);

      const insightResponse = await fetch(
        `${baseUrl}/api/reading/${importedPersonalRecord.entry.id}/insights`,
        {
          body: JSON.stringify({
            summary: 'Workbench compatibility insight',
            title: 'Workbench insight',
          }),
          headers: {
            'Content-Type': 'application/json',
            ...actorHeaders,
          },
          method: 'POST',
        },
      );
      expect(insightResponse.status).toBe(201);

      const aliceDiscoveryResponse = await fetch(
        `${baseUrl}/api/discovery/search?query=${encodeURIComponent('tumor board')}`,
        { headers: actorHeaders },
      );
      expect(aliceDiscoveryResponse.status).toBe(200);
      const aliceDiscovery = await aliceDiscoveryResponse.json();

      const bobDiscoveryResponse = await fetch(
        `${baseUrl}/api/discovery/search?query=${encodeURIComponent('tumor board')}`,
        { headers: { 'x-jixia-actor': 'user-bob' } },
      );
      expect(bobDiscoveryResponse.status).toBe(200);
      const bobDiscovery = await bobDiscoveryResponse.json();

      expect(
        aliceDiscovery.items.find(
          (item: { canonicalId: string }) =>
            item.canonicalId === search.items[0].canonicalId,
        ),
      ).toMatchObject({ imported: true });
      expect(
        bobDiscovery.items.find(
          (item: { canonicalId: string }) =>
            item.canonicalId === search.items[0].canonicalId,
        ),
      ).toMatchObject({ imported: false });

      const { createDemoApi } = await import('../../src/web/lib/demo-api');
      const demoApi = createDemoApi(baseUrl, 'user-alice');
      const todayFromClient = await demoApi.getTodayRecommendations();
      const searchFromClient = await demoApi.searchDiscovery('tumor board');
      const settingsFromClient = await demoApi.getWorkbenchSettings();
      const personalLibraryFromClient = await demoApi.getPersonalLibraryEntries();

      expect(todayFromClient.items).toBeDefined();
      expect(searchFromClient.items.length).toBeGreaterThan(0);
      expect(settingsFromClient.apiKeyConfigured).toBeDefined();
      expect(personalLibraryFromClient.entries).toContainEqual(
        expect.objectContaining({
          canonicalId: search.items[0].canonicalId,
        }),
      );

      const readerDetailFromClient = await demoApi.getReadingDetail(
        importedPersonalRecord.entry.id,
      );
      expect(readerDetailFromClient.notes).toContainEqual(
        expect.objectContaining({
          body: 'Workbench compatibility note',
          visibility: 'private',
        }),
      );
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
