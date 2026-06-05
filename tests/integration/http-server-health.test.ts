import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createHealthRoutes } from '../../src/server/routes/health.routes';
import { startTestServer } from './http-session-test-helpers';

const expectedHealthPayload = createHealthRoutes().getHealth();

describe('http server health endpoints', () => {
  it('answers GET and HEAD health checks through the real HTTP listener', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-health-'));

    try {
      const server = await startTestServer({
        JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-health.db')}`,
        JIXIA_STORAGE_ROOT: storageRoot,
      });

      try {
        expect(expectedHealthPayload).toEqual({
          service: 'jixia-server',
          status: 'ok',
        });

        for (const endpointPath of ['/health', '/api/health']) {
          const getResponse = await fetch(`${server.url}${endpointPath}`);

          expect(getResponse.status).toBe(200);
          expect(await getResponse.json()).toEqual(expectedHealthPayload);

          const headResponse = await fetch(`${server.url}${endpointPath}`, {
            method: 'HEAD',
          });

          expect(headResponse.status).toBe(200);
          expect(await headResponse.text()).toBe('');
        }
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});
