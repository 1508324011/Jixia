import type {
  CreateCredentialRequest,
  CredentialRecord,
  ListCredentialsQuery,
} from "@shared/contracts/credentials";
import type {
  DefaultImportTarget,
  WorkbenchSettingsResponse,
} from "@shared/contracts/settings";

import type {
  CredentialsRepository,
  PersistedCredentialWithSecretRecord,
} from "../../db";

import type { EncryptedSecretPayload, SecretBox } from "../security/secret-box";

const DEFAULT_IMPORT_TARGET: DefaultImportTarget = "personal-library";
const WORKBENCH_API_KEY_PROVIDER = "workbench-api-key";

export interface StoredCredential
  extends CredentialRecord,
    EncryptedSecretPayload {}

export interface WorkbenchSettingsRecord {
  credentialRef: string | null;
  defaultImportTarget: DefaultImportTarget;
  updatedAt: string;
  userId: string;
}

export interface SaveWorkbenchSettingsRequest {
  defaultImportTarget: DefaultImportTarget;
}

export interface CredentialsStore {
  nextId(prefix: string): string;
  repository: CredentialsRepository;
  resolveSecretBox(): Promise<SecretBox>;
}

export interface CredentialsService {
  createCredential(
    input: CreateCredentialRequest,
    actorUserId: string,
  ): Promise<CredentialRecord>;
  getStoredCredential(
    credentialRef: string,
    actorUserId: string,
  ): Promise<StoredCredential | null>;
  getWorkbenchSettings(actorUserId: string): Promise<WorkbenchSettingsResponse>;
  listCredentials(
    query: ListCredentialsQuery,
    actorUserId: string,
  ): Promise<CredentialRecord[]>;
  saveWorkbenchSettings(
    input: SaveWorkbenchSettingsRequest,
    actorUserId: string,
  ): Promise<WorkbenchSettingsResponse>;
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

function readLegacyClaimedUserId(value: { userId?: string }): string | undefined {
  return value.userId;
}

function toCredentialRecord(record: {
  createdAt: string;
  credentialRef: string;
  provider: string;
  userId: string;
}): CredentialRecord {
  return {
    createdAt: record.createdAt,
    credentialRef: record.credentialRef,
    provider: record.provider,
    userId: record.userId,
  };
}

async function toWorkbenchSettingsResponse(
  store: CredentialsStore,
  actorUserId: string,
): Promise<WorkbenchSettingsResponse> {
  const settings = await store.repository.getWorkbenchSettings(actorUserId);

  if (!settings) {
    return {
      apiKeyConfigured: false,
      defaultImportTarget: DEFAULT_IMPORT_TARGET,
    };
  }

  let hasUsableCredential = false;

  if (settings.credentialRef) {
    const credential = await store.repository.getCredentialForUser({
      credentialRef: settings.credentialRef,
      userId: actorUserId,
    });

    if (credential) {
      try {
        const secretBox = await store.resolveSecretBox();

        secretBox.decrypt(credential);
        hasUsableCredential = true;
      } catch {
        hasUsableCredential = false;
      }
    }
  }

  return {
    apiKeyConfigured: hasUsableCredential,
    defaultImportTarget: DEFAULT_IMPORT_TARGET,
  };
}

function assertExistingCredentialSecretUsable(
  secretBox: SecretBox,
  credential: PersistedCredentialWithSecretRecord | null,
  credentialRef: string,
): asserts credential is PersistedCredentialWithSecretRecord {
  if (!credential) {
    throw new Error(
      `Workbench credential ${credentialRef} is missing encrypted secret material and cannot be replaced until the persisted authority is repaired.`,
    );
  }

  try {
    secretBox.decrypt(credential);
  } catch {
    throw new Error(
      `Workbench credential ${credentialRef} cannot be decrypted with the current credentials.key and must not be overwritten until the original key is restored.`,
    );
  }
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

      assertNoCredentialActorMismatch(
        effectiveUserId,
        readLegacyClaimedUserId(input),
      );
      const secretBox = await store.resolveSecretBox();
      const encryptedSecret = secretBox.encrypt(input.rawSecret);

      if (input.provider === WORKBENCH_API_KEY_PROVIDER) {
        const existingSettings = await store.repository.getWorkbenchSettings(effectiveUserId);
        const existingCredential = existingSettings?.credentialRef
          ? await store.repository.getCredentialForUser({
              credentialRef: existingSettings.credentialRef,
              userId: effectiveUserId,
            })
          : null;

        if (existingSettings?.credentialRef) {
          assertExistingCredentialSecretUsable(
            secretBox,
            existingCredential,
            existingSettings.credentialRef,
          );
        }

        if (existingCredential?.provider === WORKBENCH_API_KEY_PROVIDER) {
          const replacedCredential = await store.repository.replaceCredentialSecret({
            credentialRef: existingCredential.credentialRef,
            encryptedSecret,
            userId: effectiveUserId,
          });

          await store.repository.upsertWorkbenchSettings({
            credentialRef: replacedCredential.credentialRef,
            defaultImportTarget: DEFAULT_IMPORT_TARGET,
            userId: effectiveUserId,
          });

          return toCredentialRecord(replacedCredential);
        }

        const credential = await store.repository.createCredential({
          credentialRef: store.nextId("cred"),
          encryptedSecret,
          provider: WORKBENCH_API_KEY_PROVIDER,
          userId: effectiveUserId,
        });

        await store.repository.upsertWorkbenchSettings({
          credentialRef: credential.credentialRef,
          defaultImportTarget: DEFAULT_IMPORT_TARGET,
          userId: effectiveUserId,
        });

        return toCredentialRecord(credential);
      }

      const credential = await store.repository.createCredential({
        credentialRef: store.nextId("cred"),
        encryptedSecret,
        provider: input.provider,
        userId: effectiveUserId,
      });

      return toCredentialRecord(credential);
    },
    async getStoredCredential(
      credentialRef: string,
      actorUserId: string,
    ): Promise<StoredCredential | null> {
      const effectiveUserId = requireActorUserId(actorUserId);
      const credential = await store.repository.getCredentialForUser({
        credentialRef,
        userId: effectiveUserId,
      });

      if (!credential) {
        return null;
      }

      try {
        const secretBox = await store.resolveSecretBox();

        secretBox.decrypt(credential);
      } catch {
        return null;
      }

      return { ...toCredentialRecord(credential), ...credential };
    },
    async getWorkbenchSettings(
      actorUserId: string,
    ): Promise<WorkbenchSettingsResponse> {
      const effectiveUserId = requireActorUserId(actorUserId);

      return toWorkbenchSettingsResponse(store, effectiveUserId);
    },
    async listCredentials(
      query: ListCredentialsQuery,
      actorUserId: string,
    ): Promise<CredentialRecord[]> {
      const effectiveUserId = requireActorUserId(actorUserId);

      assertNoCredentialActorMismatch(
        effectiveUserId,
        readLegacyClaimedUserId(query),
      );

      return (await store.repository.listCredentialsForUser(effectiveUserId)).map(
        toCredentialRecord,
      );
    },
    async saveWorkbenchSettings(
      input: SaveWorkbenchSettingsRequest,
      actorUserId: string,
    ): Promise<WorkbenchSettingsResponse> {
      const effectiveUserId = requireActorUserId(actorUserId);

      const credentialRef =
        (await store.repository.getWorkbenchSettings(effectiveUserId))
          ?.credentialRef ?? null;

      await store.repository.upsertWorkbenchSettings({
        credentialRef,
        defaultImportTarget: input.defaultImportTarget,
        userId: effectiveUserId,
      });

      return toWorkbenchSettingsResponse(store, effectiveUserId);
    },
  };
}
