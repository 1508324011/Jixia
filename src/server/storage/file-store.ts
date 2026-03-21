import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { toAssetStorageKey } from './asset-key';
import {
  type StorageRootEnv,
  resolveStoragePath,
  resolveStorageRoot,
} from './storage-root';

export interface FileStore {
  readonly rootDirectory: string;
  resolveAbsolutePath(storageKey: string): string;
  writeText(storageKey: string, contents: string): Promise<string>;
  readText(storageKey: string): Promise<string>;
}

export function createFileStore(env: StorageRootEnv = process.env): FileStore {
  return {
    rootDirectory: resolveStorageRoot(env),
    resolveAbsolutePath(storageKey: string): string {
      return resolveStoragePath(storageKey, env);
    },
    async writeText(storageKey: string, contents: string): Promise<string> {
      const key = toAssetStorageKey(storageKey);
      const absolutePath = resolveStoragePath(key, env);

      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, contents, 'utf8');

      return key;
    },
    async readText(storageKey: string): Promise<string> {
      const absolutePath = resolveStoragePath(storageKey, env);

      return readFile(absolutePath, 'utf8');
    },
  };
}
