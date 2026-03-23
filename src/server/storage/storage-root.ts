import { resolve } from 'node:path';

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
  return resolve(resolveStorageRoot(env), toAssetStorageKey(storageKey));
}
