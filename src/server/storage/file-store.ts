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
  writeBuffer(storageKey: string, contents: Buffer): Promise<string>;
  readBuffer(storageKey: string): Promise<Buffer>;
  writeText(storageKey: string, contents: string): Promise<string>;
  readText(storageKey: string): Promise<string>;
}

export function createFileStore(env: StorageRootEnv = process.env): FileStore {
  return {
    rootDirectory: resolveStorageRoot(env),
    resolveAbsolutePath(storageKey: string): string {
      return resolveStoragePath(storageKey, env);
    },
    async writeBuffer(storageKey: string, contents: Buffer): Promise<string> {
      const key = toAssetStorageKey(storageKey);
      const absolutePath = resolveStoragePath(key, env);

      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, contents);

      return key;
    },
    async readBuffer(storageKey: string): Promise<Buffer> {
      const absolutePath = resolveStoragePath(storageKey, env);

      return readFile(absolutePath);
    },
    async writeText(storageKey: string, contents: string): Promise<string> {
      return this.writeBuffer(storageKey, Buffer.from(contents, 'utf8'));
    },
    async readText(storageKey: string): Promise<string> {
      const buffer = await this.readBuffer(storageKey);

      return buffer.toString('utf8');
    },
  };
}
