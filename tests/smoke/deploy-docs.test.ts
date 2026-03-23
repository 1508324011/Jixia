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
  });

  it('includes Docker deployment artifacts', () => {
    expect(existsSync('Dockerfile')).toBe(true);
    expect(existsSync('.dockerignore')).toBe(true);
    expect(existsSync('docker-compose.yml')).toBe(true);
  });

  it('defines a dockerized operator path', () => {
    const dockerfile = read('Dockerfile');
    const compose = read('docker-compose.yml');
    const packageJson = JSON.parse(read('package.json')) as {
      scripts?: Record<string, string>;
    };

    expect(dockerfile).toContain('FROM node:22');
    expect(packageJson.scripts?.['package:native-demo']).toBeTruthy();
    expect(dockerfile).toContain('npm run package:native-demo');
    expect(dockerfile).toContain('.native-demo-package/native-demo');
    expect(dockerfile).toContain('run-native-demo.sh');
    expect(compose).toContain('JIXIA_STORAGE_ROOT');
    expect(compose).toContain('JIXIA_DATABASE_URL');
    expect(compose).toContain('/var/lib/jixia/storage');
    expect(compose).toContain('/var/lib/jixia/data');
    expect(compose).toContain('/app/.native-demo-package/native-demo');
    expect(compose).not.toContain('${JIXIA_STORAGE_ROOT');
    expect(compose).not.toContain('${JIXIA_DATABASE_URL');
  });

  it('includes operator-facing environment guidance', () => {
    const envExample = read('.env.example');

    expect(envExample).toContain('JIXIA_STORAGE_ROOT=/home/zhurui/.local/share/jixia-demo/storage');
    expect(envExample).toContain('JIXIA_DATABASE_URL=file:/home/zhurui/.local/share/jixia-demo/data/jixia-demo.db');
    expect(envExample).toContain('JIXIA_HOST=127.0.0.1');
    expect(envExample).toContain('JIXIA_PORT=3000');
    expect(envExample).not.toContain('YOUR_STORAGE_ROOT');
    expect(envExample).not.toContain('YOUR_DATABASE_URL');
    expect(envExample).not.toContain('YOUR_SERVER_HOST');
    expect(envExample).not.toContain('YOUR_SERVER_PORT');
  });

  it('documents the english startup path', () => {
    const readme = read('README.md');

    expect(readme).toContain('docker compose up --build');
    expect(readme).toContain('npm run package:native-demo');
    expect(readme).toContain('npm run start:server');
    expect(readme).toContain('.native-demo-package/native-demo');
    expect(readme).toContain('JIXIA_STORAGE_ROOT');
    expect(readme).toContain('JIXIA_DATABASE_URL');
    expect(readme).toContain('/var/lib/jixia/storage');
    expect(readme).toContain('server-state.json');
    expect(readme).toContain('reserved runtime boundary');
  });

  it('documents the chinese startup path and keeps build in CI', () => {
    const readmeCn = read('README_CN.md');
    const ciWorkflow = read('.github/workflows/ci.yml');

    expect(readmeCn).toContain('docker compose up --build');
    expect(readmeCn).toContain('npm run package:native-demo');
    expect(readmeCn).toContain('.native-demo-package/native-demo');
    expect(readmeCn).toContain('npm run start:server');
    expect(readmeCn).toContain('JIXIA_STORAGE_ROOT');
    expect(readmeCn).toContain('JIXIA_DATABASE_URL');
    expect(readmeCn).toContain('server-state.json');
    expect(readmeCn).toContain('保留运行时边界');
    expect(ciWorkflow).toContain('npm run build');
  });
});
