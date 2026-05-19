import { isAbsolute, relative, resolve, sep } from 'node:path';

import { toAssetStorageKey } from './asset-key';

export interface StorageRootEnv {
  JIXIA_STORAGE_ROOT?: string;
}

export function resolveStorageRoot(env: StorageRootEnv = process.env): string {
  const configuredRoot = env.JIXIA_STORAGE_ROOT?.trim();

  if (configuredRoot) {
    return resolve(configuredRoot);
  }

  return resolve(process.cwd(), '.jixia-storage');
}

export function resolveStoragePath(
  storageKey: string,
  env: StorageRootEnv = process.env,
): string {
  const storageRoot = resolveStorageRoot(env);
  const storagePath = resolve(storageRoot, toAssetStorageKey(storageKey));
  const relativePath = relative(storageRoot, storagePath);

  if (
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error('Asset storage key must resolve under the storage root.');
  }

  return storagePath;
}
