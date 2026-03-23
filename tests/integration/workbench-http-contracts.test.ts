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

      const settingsResponse = await fetch(`${baseUrl}/api/settings/me`);
      expect(settingsResponse.status).toBe(200);

      const settings = await settingsResponse.json();
      expect(settings.apiKeyConfigured).toBeDefined();

      const { createDemoApi } = await import('../../src/web/lib/demo-api');
      const demoApi = createDemoApi(baseUrl);
      const todayFromClient = await demoApi.getTodayRecommendations();
      const settingsFromClient = await demoApi.getWorkbenchSettings();

      expect(todayFromClient.items).toBeDefined();
      expect(settingsFromClient.apiKeyConfigured).toBeDefined();
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
