import { join } from 'node:path';

import { resolveStorageRoot, type StorageRootEnv } from './storage/storage-root';

const DEFAULT_DATABASE_URL = 'file:./prisma/dev.db';
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3000;
const DECIMAL_PORT_PATTERN = /^\d+$/;
const MAX_PORT = 65535;

export interface RuntimeConfigEnv extends StorageRootEnv {
  JIXIA_ALLOW_LEGACY_ACTOR_OVERRIDE?: string;
  JIXIA_DATABASE_URL?: string;
  JIXIA_HOST?: string;
  JIXIA_PORT?: string;
  NODE_ENV?: string;
}

export interface RuntimeConfig {
  databaseUrl: string;
  host: string;
  port: number;
  storageRoot: string;
}

function readTrimmedValue(value: string | undefined, fallback: string): string {
  const normalized = value?.trim();

  return normalized && normalized.length > 0 ? normalized : fallback;
}

function readPort(value: string | undefined): number {
  const normalized = value?.trim();

  if (!normalized) {
    return DEFAULT_PORT;
  }

  if (!DECIMAL_PORT_PATTERN.test(normalized)) {
    return DEFAULT_PORT;
  }

  const parsedPort = Number(normalized);

  if (
    !Number.isSafeInteger(parsedPort) ||
    parsedPort <= 0 ||
    parsedPort > MAX_PORT
  ) {
    return DEFAULT_PORT;
  }

  return parsedPort;
}

function readDatabaseUrl(env: RuntimeConfigEnv, storageRoot: string): string {
  const configuredDatabaseUrl = env.JIXIA_DATABASE_URL?.trim();

  if (configuredDatabaseUrl) {
    return configuredDatabaseUrl;
  }

  if (env.JIXIA_STORAGE_ROOT?.trim()) {
    return `file:${join(storageRoot, 'jixia.db')}`;
  }

  return DEFAULT_DATABASE_URL;
}

export function readRuntimeConfig(
  env: RuntimeConfigEnv = process.env,
): RuntimeConfig {
  const storageRoot = resolveStorageRoot(env);

  return {
    databaseUrl: readDatabaseUrl(env, storageRoot),
    host: readTrimmedValue(env.JIXIA_HOST, DEFAULT_HOST),
    port: readPort(env.JIXIA_PORT),
    storageRoot,
  };
}
