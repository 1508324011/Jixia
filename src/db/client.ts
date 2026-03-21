export interface DatabaseConfig {
  url: string;
}

export function createDatabaseConfig(url: string): DatabaseConfig {
  return { url };
}

export function readDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.JIXIA_DATABASE_URL ?? 'file:./prisma/dev.db';
}

export const databaseConfig = createDatabaseConfig(readDatabaseUrl());
