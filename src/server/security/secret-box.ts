import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  resolveStorageRoot,
  type StorageRootEnv,
} from '../storage/storage-root';

const SECRET_BOX_KEY_FILE = 'credentials.key';

export interface EncryptedSecretPayload {
  encryptedSecret: string;
  encryptionIv: string;
  encryptionTag: string;
}

export interface SecretBox {
  decrypt(input: EncryptedSecretPayload): string;
  encrypt(rawSecret: string): EncryptedSecretPayload;
}

export interface CreateSecretBoxOptions {
  allowKeyCreation?: boolean;
}

function resolveSecretBoxKeyPath(env: StorageRootEnv): string {
  return join(resolveStorageRoot(env), SECRET_BOX_KEY_FILE);
}

export function hasSecretBoxKey(env: StorageRootEnv = process.env): boolean {
  return existsSync(resolveSecretBoxKeyPath(env));
}

function resolveSecretBoxKey(
  env: StorageRootEnv,
  options: CreateSecretBoxOptions = {},
): Buffer {
  const rootDirectory = resolveStorageRoot(env);
  const keyPath = resolveSecretBoxKeyPath(env);
  const allowKeyCreation = options.allowKeyCreation ?? true;

  mkdirSync(rootDirectory, { recursive: true });

  if (existsSync(keyPath)) {
    return Buffer.from(readFileSync(keyPath, 'utf8'), 'base64');
  }

  if (!allowKeyCreation) {
    throw new Error(
      'Credential encryption key is missing from the storage root. Existing credential rows cannot be used until credentials.key is restored.',
    );
  }

  const key = randomBytes(32);
  writeFileSync(keyPath, key.toString('base64'));

  return key;
}

export function createSecretBox(
  env: StorageRootEnv = process.env,
  options: CreateSecretBoxOptions = {},
): SecretBox {
  const key = resolveSecretBoxKey(env, options);

  return {
    decrypt(input: EncryptedSecretPayload): string {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(input.encryptionIv, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(input.encryptionTag, 'base64'));

      return Buffer.concat([
        decipher.update(Buffer.from(input.encryptedSecret, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    },
    encrypt(rawSecret: string): EncryptedSecretPayload {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const encryptedSecret = Buffer.concat([
        cipher.update(rawSecret, 'utf8'),
        cipher.final(),
      ]);

      return {
        encryptedSecret: encryptedSecret.toString('base64'),
        encryptionIv: iv.toString('base64'),
        encryptionTag: cipher.getAuthTag().toString('base64'),
      };
    },
  };
}
