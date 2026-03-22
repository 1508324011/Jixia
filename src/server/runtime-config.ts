import { resolveStorageRoot, type StorageRootEnv } from './storage/storage-root';

const DEFAULT_DATABASE_URL = 'file:./prisma/dev.db';
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3000;

export interface RuntimeConfigEnv extends StorageRootEnv {
  JIXIA_DATABASE_URL?: string;
  JIXIA_HOST?: string;
  JIXIA_PORT?: string;
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

  const parsedPort = Number.parseInt(normalized, 10);

  if (!Number.isSafeInteger(parsedPort) || parsedPort <= 0) {
    return DEFAULT_PORT;
  }

  return parsedPort;
}

export function readRuntimeConfig(
  env: RuntimeConfigEnv = process.env,
): RuntimeConfig {
  return {
    databaseUrl: readTrimmedValue(env.JIXIA_DATABASE_URL, DEFAULT_DATABASE_URL),
    host: readTrimmedValue(env.JIXIA_HOST, DEFAULT_HOST),
    port: readPort(env.JIXIA_PORT),
    storageRoot: resolveStorageRoot(env),
  };
}
