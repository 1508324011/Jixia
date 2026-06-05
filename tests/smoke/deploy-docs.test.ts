import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { readRuntimeConfig } from '../../src/server/runtime-config';

function read(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

describe('deployment and operator scaffolding', () => {
  it('declares a runnable server build path', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.['build:server']).toBeTruthy();
    expect(packageJson.scripts?.['start:server']).toBeTruthy();
  });

  it('normalizes runtime config for the lab server process', () => {
    expect(
      readRuntimeConfig({
        JIXIA_DATABASE_URL: 'file:/var/lib/jixia/data/jixia.db',
        JIXIA_HOST: '0.0.0.0',
        JIXIA_PORT: '3000',
        JIXIA_STORAGE_ROOT: '/var/lib/jixia/storage',
      }),
    ).toMatchObject({
      databaseUrl: 'file:/var/lib/jixia/data/jixia.db',
      host: '0.0.0.0',
      port: 3000,
      storageRoot: '/var/lib/jixia/storage',
    });

    expect(
      readRuntimeConfig({
        JIXIA_PORT: 'not-a-port',
        JIXIA_HOST: '   ',
      }),
    ).toMatchObject({
      databaseUrl: 'file:./prisma/dev.db',
      host: '127.0.0.1',
      port: 3000,
    });

    for (const invalidPort of [
      '',
      '-1',
      '0',
      '3000.5',
      '3000abc',
      '+3000',
      '0x10',
      '3e3',
      '65536',
      '9007199254740992',
    ]) {
      expect(readRuntimeConfig({ JIXIA_PORT: invalidPort })).toMatchObject({
        port: 3000,
      });
    }

    expect(readRuntimeConfig({ JIXIA_PORT: '65535' })).toMatchObject({
      port: 65535,
    });

    expect(
      readRuntimeConfig({
        JIXIA_STORAGE_ROOT: '/tmp/jixia-operator-storage',
      }),
    ).toMatchObject({
      databaseUrl: 'file:/tmp/jixia-operator-storage/jixia.db',
      storageRoot: '/tmp/jixia-operator-storage',
    });
  });

  it('exposes native and API-scoped health endpoints from the HTTP runtime', () => {
    const httpServer = read('src/server/http-server.ts');
    const healthRoutes = read('src/server/routes/health.routes.ts');

    expect(httpServer).toContain('pathname === "/api/health"');
    expect(httpServer).toContain('requestUrl.pathname === "/health"');
    expect(healthRoutes).toContain("service: 'jixia-server'");
    expect(healthRoutes).toContain("status: 'ok'");
  });

  it('includes Docker deployment artifacts', () => {
    expect(existsSync('Dockerfile')).toBe(true);
    expect(existsSync('.dockerignore')).toBe(true);
    expect(existsSync('docker-compose.yml')).toBe(true);
  });

  it('keeps docker build context secret-safe for local operator files', () => {
    const dockerignore = read('.dockerignore');

    expect(dockerignore).toContain('.trellis/');
    expect(dockerignore).toContain('.claude/');
    expect(dockerignore).toContain('.cursor/');
    expect(dockerignore).toContain('*.pem');
    expect(dockerignore).toContain('*.key');
    expect(dockerignore).toContain('credentials.key');
  });

  it('defines a dockerized operator path', () => {
    const dockerfile = read('Dockerfile');
    const compose = read('docker-compose.yml');

    expect(dockerfile).toContain('FROM node:22');
    expect(dockerfile).toContain('HEALTHCHECK');
    expect(dockerfile).toContain('/health');
    expect(dockerfile).toContain('COPY prisma ./prisma');
    expect(dockerfile).toContain('COPY prisma.config.ts ./prisma.config.ts');
    expect(dockerfile).toContain('npm run build');
    expect(dockerfile).toContain('COPY --from=build /app/node_modules ./node_modules');
    expect(compose).toContain('JIXIA_STORAGE_ROOT');
    expect(compose).toContain('JIXIA_DATABASE_URL');
    expect(compose).toContain('/var/lib/jixia/storage');
    expect(compose).toContain('/var/lib/jixia/data');
    expect(compose).not.toContain('${JIXIA_STORAGE_ROOT');
    expect(compose).not.toContain('${JIXIA_DATABASE_URL');
  });

  it('includes operator-facing environment guidance', () => {
    const envExample = read('.env.example');

    expect(envExample).toContain('JIXIA_STORAGE_ROOT=YOUR_STORAGE_ROOT');
    expect(envExample).toContain('JIXIA_DATABASE_URL=YOUR_DATABASE_URL');
    expect(envExample).toContain('JIXIA_HOST=YOUR_SERVER_HOST');
    expect(envExample).toContain('JIXIA_PORT=YOUR_SERVER_PORT');
    expect(envExample).toContain('/health');
    expect(envExample).toContain('/api/health');
    expect(envExample).toContain('/var/lib/jixia/storage');
    expect(envExample).toContain('file:/var/lib/jixia/data/jixia.db');
    expect(envExample).toContain('Prisma/SQLite');
    expect(envExample).toContain('server-state.json is legacy compatibility/bootstrap state only');
  });

  it('documents the english startup path', () => {
    const readme = read('README.md');

    expect(readme).toContain('docker compose up --build');
    expect(readme).toContain('npm run build');
    expect(readme).toContain('npm run start:server');
    expect(readme).toContain('optional packaging verification path');
    expect(readme).toContain('required current-host gate');
    expect(readme).toContain('Optional Docker Compose packaging path');
    expect(readme).toContain('/health');
    expect(readme).toContain('/api/health');
    expect(readme).toContain('JIXIA_STORAGE_ROOT');
    expect(readme).toContain('JIXIA_DATABASE_URL');
    expect(readme).toContain('/var/lib/jixia/storage');
    expect(readme).toContain('POST /api/import/pdf');
    expect(readme).toContain('GET|HEAD /api/library/:entryId/file');
    expect(readme).toContain('server-state.json');
    expect(readme).toContain('explicit one-time compatibility bootstrap path');
    expect(readme).toContain('rather than normal runtime persistence');
    expect(readme).toContain('Prisma-backed project collaboration');
  });

  it('documents the chinese startup path and keeps build in CI', () => {
    const readmeCn = read('README_CN.md');
    const ciWorkflow = read('.github/workflows/ci.yml');

    expect(readmeCn).toContain('docker compose up --build');
    expect(readmeCn).toContain('npm run start:server');
    expect(readmeCn).toContain('可选打包验证路径');
    expect(readmeCn).toContain('当前主机必需的 gate');
    expect(readmeCn).toContain('可选 Docker Compose 打包路径');
    expect(readmeCn).toContain('/health');
    expect(readmeCn).toContain('/api/health');
    expect(readmeCn).toContain('JIXIA_STORAGE_ROOT');
    expect(readmeCn).toContain('JIXIA_DATABASE_URL');
    expect(readmeCn).toContain('POST /api/import/pdf');
    expect(readmeCn).toContain('GET|HEAD /api/library/:entryId/file');
    expect(readmeCn).toContain('server-state.json');
    expect(readmeCn).toContain('显式的一次性兼容 bootstrap 路径');
    expect(readmeCn).toContain('而不是正常运行时持久化');
    expect(readmeCn).toContain('Prisma-backed Project 协作数据');
    expect(ciWorkflow).toContain('npm run build');
  });

  it('keeps the Task 11 deployment plan aligned with the current runtime contract', () => {
    const plan = read('docs/plans/2026-03-22-jixia-task-11-deployment-implementation.md');

    expect(plan).toContain('src/server/http-server.ts');
    expect(plan).toContain('src/server/runtime-config.ts');
    expect(plan).toContain('/health');
    expect(plan).toContain('/api/health');
    expect(plan).toContain('Dockerfile');
    expect(plan).toContain('docker-compose.yml');
    expect(plan).toContain('.dockerignore');
    expect(plan).toContain('docs/runbooks/native-demo-showcase.md');
    expect(plan).toContain('integrated workbench shell');
    expect(plan).toContain('native Node start/health verification pass');
    expect(plan).toContain('Docker packaging verification is recorded as passed only on Docker-capable hosts');
  });
});
