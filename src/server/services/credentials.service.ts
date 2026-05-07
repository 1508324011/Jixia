import type {
  CreateCredentialRequest,
  CredentialRecord,
  ListCredentialsQuery,
} from "@shared/contracts/credentials";
import type {
  DefaultImportTarget,
  WorkbenchSettingsResponse,
} from "@shared/contracts/settings";

import type { JobRepository } from '../../db';

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
  actorUserId?: string;
  defaultImportTarget: DefaultImportTarget;
  userId?: string;
}

export interface CredentialsStore {
  credentials: StoredCredential[];
  jobRepository: JobRepository;
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
  getWorkbenchSettings(actorUserId: string): WorkbenchSettingsResponse;
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

async function persistCredentialReference(
  store: CredentialsStore,
  credential: StoredCredential,
): Promise<void> {
  await store.jobRepository.createProviderCredentialReference({
    createdAt: credential.createdAt,
    credentialRef: credential.credentialRef,
    provider: credential.provider,
    secretRef: credential.credentialRef,
    userId: credential.userId,
  });
}

function findWorkbenchSettings(
  store: CredentialsStore,
  userId: string,
): WorkbenchSettingsRecord | null {
  return store.workbenchSettings.find((settings) => settings.userId === userId) ?? null;
}

function requireActorUserId(actorUserId: string): string {
  if (!actorUserId) {
    throw new Error("Credentials require a server-derived actor user id.");
  }

  return actorUserId;
}

function assertNoCredentialActorMismatch(
  actorUserId: string,
  claimedUserId: string | undefined,
): void {
  if (claimedUserId && claimedUserId !== actorUserId) {
    throw new Error(
      "Request body actor does not match the server-derived actor.",
    );
  }
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
      const effectiveUserId = requireActorUserId(actorUserId);

      assertNoCredentialActorMismatch(effectiveUserId, input.userId);

      const credential = createStoredCredential(store, {
        provider: input.provider,
        rawSecret: input.rawSecret,
        userId: effectiveUserId,
      });

      await persistCredentialReference(store, credential);

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
    getWorkbenchSettings(actorUserId: string): WorkbenchSettingsResponse {
      const effectiveUserId = requireActorUserId(actorUserId);

      return toWorkbenchSettingsResponse(findWorkbenchSettings(store, effectiveUserId));
    },
    async listCredentials(
      query: ListCredentialsQuery,
      actorUserId: string,
    ): Promise<CredentialRecord[]> {
      const effectiveUserId = requireActorUserId(actorUserId);

      assertNoCredentialActorMismatch(effectiveUserId, query.userId);

      return store.credentials
        .filter((credential) => credential.userId === effectiveUserId)
        .map(toCredentialRecord);
    },
    async saveWorkbenchSettings(
      input: SaveWorkbenchSettingsRequest,
      actorUserId: string,
    ): Promise<WorkbenchSettingsResponse> {
      const effectiveUserId = requireActorUserId(actorUserId);

      assertNoCredentialActorMismatch(effectiveUserId, input.userId);
      assertNoCredentialActorMismatch(effectiveUserId, input.actorUserId);

      let credentialRef = findWorkbenchSettings(store, effectiveUserId)?.credentialRef ?? null;

      if (typeof input.apiKey === "string" && input.apiKey.trim()) {
        const credential = createStoredCredential(store, {
          provider: WORKBENCH_API_KEY_PROVIDER,
          rawSecret: input.apiKey,
          userId: effectiveUserId,
        });

        await persistCredentialReference(store, credential);

        store.credentials.push(credential);
        credentialRef = credential.credentialRef;
      }

      const existingIndex = store.workbenchSettings.findIndex(
        (settings) => settings.userId === effectiveUserId,
      );
      const record: WorkbenchSettingsRecord = {
        credentialRef,
        defaultImportTarget: input.defaultImportTarget,
        updatedAt: new Date().toISOString(),
        userId: effectiveUserId,
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
