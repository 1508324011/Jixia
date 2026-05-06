import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '@prisma/client';

export interface DatabaseConfig {
  url: string;
}

export interface CreatePrismaClientOptions {
  url?: string;
}

export type JixiaPrismaClient = PrismaClient;

export function createDatabaseConfig(url: string): DatabaseConfig {
  return { url };
}

export function readDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.JIXIA_DATABASE_URL ?? 'file:./prisma/dev.db';
}

export function createPrismaClient(
  options: CreatePrismaClientOptions = {},
): JixiaPrismaClient {
  const url = options.url ?? readDatabaseUrl();

  if (url.startsWith('file:')) {
    const databasePath = url.slice('file:'.length);
    const databaseDirectory = dirname(databasePath);

    if (databaseDirectory !== '.') {
      mkdirSync(databaseDirectory, { recursive: true });
    }
  }

  return new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url }),
  });
}

export const databaseConfig = createDatabaseConfig(readDatabaseUrl());
