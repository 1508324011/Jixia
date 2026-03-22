import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function loadProjectEnvFile() {
  try {
    process.loadEnvFile();
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return;
    }

    throw error;
  }
}

function resolveStorageRoot() {
  const configuredRoot = process.env.JIXIA_STORAGE_ROOT?.trim();

  if (configuredRoot) {
    return resolve(configuredRoot);
  }

  return resolve(process.cwd(), '.jixia-storage');
}

function resolveDatabaseFilePath() {
  const databaseUrl = process.env.JIXIA_DATABASE_URL?.trim();

  if (!databaseUrl?.startsWith('file:')) {
    return null;
  }

  return fileURLToPath(new URL(databaseUrl));
}

loadProjectEnvFile();

const storageRoot = resolveStorageRoot();
const databaseFilePath = resolveDatabaseFilePath();

if (existsSync(storageRoot)) {
  rmSync(storageRoot, { force: true, recursive: true });
}

mkdirSync(storageRoot, { recursive: true });

if (databaseFilePath && existsSync(databaseFilePath)) {
  rmSync(databaseFilePath, { force: true });
  mkdirSync(dirname(databaseFilePath), { recursive: true });
}

console.log(`Reset native demo storage at ${storageRoot}`);

if (databaseFilePath) {
  console.log(`Cleared native demo database file at ${databaseFilePath}`);
}
