import type {
  CreateCredentialRequest,
  CredentialRecord,
  ListCredentialsQuery,
} from "@shared/contracts/credentials";
import type {
  DefaultImportTarget,
  WorkbenchSettingsResponse,
} from "@shared/contracts/settings";

import type { EncryptedSecretPayload, SecretBox } from "../security/secret-box";

const DEFAULT_IMPORT_TARGET: DefaultImportTarget = "personal-library";
const WORKBENCH_API_KEY_PROVIDER = "workbench-api-key";

export interface StoredCredential
  extends CredentialRecord, EncryptedSecretPayload {}

export interface WorkbenchSettingsRecord {
  credentialRef: string | null;
  defaultImportTarget: DefaultImportTarget;
  updatedAt: string;
  userId: string;
}

export interface SaveWorkbenchSettingsRequest {
  apiKey?: string;
  defaultImportTarget: DefaultImportTarget;
  /** @deprecated Protected HTTP routes derive the actor from session transport headers. */
  userId?: string;
}

export interface CredentialsStore {
  credentials: StoredCredential[];
  nextId(prefix: string): string;
  persist(): void;
  secretBox: SecretBox;
  workbenchSettings: WorkbenchSettingsRecord[];
}

export interface CredentialsService {
  createCredential(
    input: CreateCredentialRequest,
    actorUserId: string,
  ): Promise<CredentialRecord>;
  getStoredCredential(credentialRef: string): StoredCredential | null;
  getWorkbenchSettings(userId: string): WorkbenchSettingsResponse;
  listCredentials(
    query: ListCredentialsQuery,
    actorUserId: string,
  ): Promise<CredentialRecord[]>;
  saveWorkbenchSettings(
    input: SaveWorkbenchSettingsRequest,
    actorUserId: string,
  ): Promise<WorkbenchSettingsResponse>;
}

function toCredentialRecord(credential: StoredCredential): CredentialRecord {
  return {
    createdAt: credential.createdAt,
    credentialRef: credential.credentialRef,
    provider: credential.provider,
    userId: credential.userId,
  };
}

function createStoredCredential(
  store: CredentialsStore,
  input: {
    provider: string;
    rawSecret: string;
    userId: string;
  },
): StoredCredential {
  return {
    createdAt: new Date().toISOString(),
    credentialRef: store.nextId("cred"),
    ...store.secretBox.encrypt(input.rawSecret),
    provider: input.provider,
    userId: input.userId,
  };
}

function findWorkbenchSettings(
  store: CredentialsStore,
  userId: string,
): WorkbenchSettingsRecord | null {
  return store.workbenchSettings.find((settings) => settings.userId === userId) ?? null;
}

function toWorkbenchSettingsResponse(
  settings: WorkbenchSettingsRecord | null,
): WorkbenchSettingsResponse {
  return {
    apiKeyConfigured: Boolean(settings?.credentialRef),
    defaultImportTarget: settings?.defaultImportTarget ?? DEFAULT_IMPORT_TARGET,
  };
}

export function createCredentialsService(
  store: CredentialsStore,
): CredentialsService {
  return {
    async createCredential(
      input: CreateCredentialRequest,
      actorUserId: string,
    ): Promise<CredentialRecord> {
      if (!actorUserId) {
        throw new Error("Credentials require an actor user id.");
      }

      if (input.userId && input.userId !== actorUserId) {
        throw new Error(
          "Request body actor does not match the server-derived actor.",
        );
      }

      const credential = createStoredCredential(store, {
        provider: input.provider,
        rawSecret: input.rawSecret,
        userId: actorUserId,
      });

      store.credentials.push(credential);
      store.persist();

      return toCredentialRecord(credential);
    },
    getStoredCredential(credentialRef: string): StoredCredential | null {
      return (
        store.credentials.find(
          (credential) => credential.credentialRef === credentialRef,
        ) ?? null
      );
    },
    getWorkbenchSettings(userId: string): WorkbenchSettingsResponse {
      return toWorkbenchSettingsResponse(findWorkbenchSettings(store, userId));
    },
    async listCredentials(
      query: ListCredentialsQuery,
      actorUserId: string,
    ): Promise<CredentialRecord[]> {
      if (!actorUserId) {
        throw new Error("Credentials require an actor user id.");
      }

      if (query.userId && query.userId !== actorUserId) {
        throw new Error(
          "Request actor does not match the server-derived actor.",
        );
      }

      return store.credentials
        .filter((credential) => credential.userId === actorUserId)
        .map(toCredentialRecord);
    },
    async saveWorkbenchSettings(
      input: SaveWorkbenchSettingsRequest,
      actorUserId: string,
    ): Promise<WorkbenchSettingsResponse> {
      if (!actorUserId) {
        throw new Error("Workbench settings require an actor user id.");
      }

      if (input.userId && input.userId !== actorUserId) {
        throw new Error(
          "Request body actor does not match the server-derived actor.",
        );
      }

      let credentialRef = findWorkbenchSettings(store, actorUserId)?.credentialRef ?? null;

      if (typeof input.apiKey === "string" && input.apiKey.trim()) {
        const credential = createStoredCredential(store, {
          provider: WORKBENCH_API_KEY_PROVIDER,
          rawSecret: input.apiKey,
          userId: actorUserId,
        });

        store.credentials.push(credential);
        credentialRef = credential.credentialRef;
      }

      const existingIndex = store.workbenchSettings.findIndex(
        (settings) => settings.userId === actorUserId,
      );
      const record: WorkbenchSettingsRecord = {
        credentialRef,
        defaultImportTarget: input.defaultImportTarget,
        updatedAt: new Date().toISOString(),
        userId: actorUserId,
      };

      if (existingIndex === -1) {
        store.workbenchSettings.push(record);
      } else {
        store.workbenchSettings[existingIndex] = record;
      }

      store.persist();

      return toWorkbenchSettingsResponse(record);
    },
  };
}
