import type {
  DefaultImportTarget,
  WorkbenchSettingsResponse,
} from '@shared/contracts/settings';

import type {
  EncryptedSecretPayload,
  SecretBox,
} from '../security/secret-box';

const DEFAULT_IMPORT_TARGET: DefaultImportTarget = 'personal-library';
const WORKBENCH_API_KEY_PROVIDER = 'workbench-api-key';

export interface CredentialRecord {
  createdAt: string;
  credentialRef: string;
  provider: string;
  userId: string;
}

export interface StoredCredential extends CredentialRecord, EncryptedSecretPayload {}

export interface WorkbenchSettingsRecord {
  credentialRef: string | null;
  defaultImportTarget: DefaultImportTarget;
  updatedAt: string;
  userId: string;
}

export interface CreateCredentialRequest {
  provider: string;
  rawSecret: string;
  userId: string;
}

export interface CredentialsStore {
  credentials: StoredCredential[];
  nextId(prefix: string): string;
  persist(): void;
  secretBox: SecretBox;
  workbenchSettings: WorkbenchSettingsRecord[];
}

export interface SaveWorkbenchSettingsRequest {
  apiKey?: string;
  defaultImportTarget: DefaultImportTarget;
  userId: string;
}

export interface CredentialsService {
  createCredential(input: CreateCredentialRequest): Promise<CredentialRecord>;
  getWorkbenchSettings(userId: string): WorkbenchSettingsResponse;
  saveWorkbenchSettings(
    input: SaveWorkbenchSettingsRequest,
  ): Promise<WorkbenchSettingsResponse>;
  getStoredCredential(credentialRef: string): StoredCredential | null;
}

function buildCredentialRecord(
  store: CredentialsStore,
  input: CreateCredentialRequest,
): StoredCredential {
  return {
    createdAt: new Date().toISOString(),
    credentialRef: store.nextId('cred'),
    ...store.secretBox.encrypt(input.rawSecret),
    provider: input.provider,
    userId: input.userId,
  };
}

function toWorkbenchSettingsResponse(
  settings: WorkbenchSettingsRecord | null,
): WorkbenchSettingsResponse {
  return {
    apiKeyConfigured: Boolean(settings?.credentialRef),
    defaultImportTarget: settings?.defaultImportTarget ?? DEFAULT_IMPORT_TARGET,
  };
}

function findWorkbenchSettings(
  store: CredentialsStore,
  userId: string,
): WorkbenchSettingsRecord | null {
  return store.workbenchSettings.find((settings) => settings.userId === userId) ?? null;
}

export function createCredentialsService(
  store: CredentialsStore,
): CredentialsService {
  return {
    async createCredential(
      input: CreateCredentialRequest,
    ): Promise<CredentialRecord> {
      const credential = buildCredentialRecord(store, input);

      store.credentials.push(credential);
      store.persist();

      return {
        createdAt: credential.createdAt,
        credentialRef: credential.credentialRef,
        provider: credential.provider,
        userId: credential.userId,
      };
    },
    getWorkbenchSettings(userId: string): WorkbenchSettingsResponse {
      return toWorkbenchSettingsResponse(findWorkbenchSettings(store, userId));
    },
    getStoredCredential(credentialRef: string): StoredCredential | null {
      return (
        store.credentials.find(
          (credential) => credential.credentialRef === credentialRef,
        ) ?? null
      );
    },
    async saveWorkbenchSettings(
      input: SaveWorkbenchSettingsRequest,
    ): Promise<WorkbenchSettingsResponse> {
      let settings = findWorkbenchSettings(store, input.userId);

      if (!settings) {
        settings = {
          credentialRef: null,
          defaultImportTarget: DEFAULT_IMPORT_TARGET,
          updatedAt: new Date().toISOString(),
          userId: input.userId,
        };
        store.workbenchSettings.push(settings);
      }

      const normalizedApiKey = input.apiKey?.trim();

      if (normalizedApiKey) {
        const credential = buildCredentialRecord(store, {
          provider: WORKBENCH_API_KEY_PROVIDER,
          rawSecret: normalizedApiKey,
          userId: input.userId,
        });

        store.credentials.push(credential);
        settings.credentialRef = credential.credentialRef;
      }

      settings.defaultImportTarget = input.defaultImportTarget;
      settings.updatedAt = new Date().toISOString();
      store.persist();

      return toWorkbenchSettingsResponse(settings);
    },
  };
}
