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
      expect(discovery.boards).toBeDefined();
      expect(discovery.boards[0].items[0]).toMatchObject({
        imported: expect.any(Boolean),
        objectType: 'external-candidate',
        state: expect.any(String),
      });
      expect(discovery.items[0]).toMatchObject({
        canonicalId: expect.any(String),
        objectType: 'external-candidate',
        sourceLocator: expect.any(String),
        sourceType: 'pmid',
        state: expect.any(String),
        title: expect.any(String),
      });

      const searchResponse = await fetch(
        `${baseUrl}/api/discovery/search?query=${encodeURIComponent('tumor board')}`,
      );
      expect(searchResponse.status).toBe(200);

      const search = await searchResponse.json();
      expect(search.query).toBe('tumor board');
      expect(search.items.length).toBeGreaterThan(0);
      expect(search.boards[0].items.length).toBeGreaterThan(0);
      expect(search.items[0]).toMatchObject({
        canonicalId: expect.any(String),
        objectType: 'external-candidate',
        sourceLocator: expect.any(String),
        sourceType: 'pmid',
        state: expect.any(String),
        title: expect.any(String),
      });

      const emptyPersonalLibraryResponse = await fetch(`${baseUrl}/api/library/personal`);
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
        },
        method: 'POST',
      });
      expect(importPersonalLibraryResponse.status).toBe(201);

      const importedPersonalRecord = await importPersonalLibraryResponse.json();
      expect(importedPersonalRecord.asset.canonicalId).toBe(search.items[0].canonicalId);

      const settingsResponse = await fetch(`${baseUrl}/api/settings/me`);
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

      const persistedSettingsResponse = await fetch(`${baseUrl}/api/settings/me`);
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

      const personalLibraryResponse = await fetch(`${baseUrl}/api/library/personal`);
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
      const demoApi = createDemoApi(baseUrl);
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

    expect(readme).toContain('Research workbench');
    expect(readme).toContain('Search intake boards');
    expect(readme).toContain('AI Workspace');
    expect(readme).toContain('Notebook');
    expect(readme).toContain('Projects');
    expect(readmeCn).toContain('Research workbench');
    expect(readmeCn).toContain('AI Workspace');
    expect(readmeCn).toContain('Notebook');
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
