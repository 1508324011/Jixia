import type {
  CreateCredentialRequest,
  CredentialRecord,
  ListCredentialsQuery,
} from "@shared/contracts/credentials";

import type { EncryptedSecretPayload, SecretBox } from "../security/secret-box";

export interface StoredCredential
  extends CredentialRecord, EncryptedSecretPayload {}

export interface CredentialsStore {
  credentials: StoredCredential[];
  nextId(prefix: string): string;
  persist(): void;
  secretBox: SecretBox;
}

export interface CredentialsService {
  createCredential(input: CreateCredentialRequest): Promise<CredentialRecord>;
  getStoredCredential(credentialRef: string): StoredCredential | null;
  listCredentials(query: ListCredentialsQuery): Promise<CredentialRecord[]>;
}

export function createCredentialsService(
  store: CredentialsStore,
): CredentialsService {
  return {
    async createCredential(
      input: CreateCredentialRequest,
    ): Promise<CredentialRecord> {
      const credential: StoredCredential = {
        createdAt: new Date().toISOString(),
        credentialRef: store.nextId("cred"),
        ...store.secretBox.encrypt(input.rawSecret),
        provider: input.provider,
        userId: input.userId,
      };

      store.credentials.push(credential);
      store.persist();

      return {
        createdAt: credential.createdAt,
        credentialRef: credential.credentialRef,
        provider: credential.provider,
        userId: credential.userId,
      };
    },
    getStoredCredential(credentialRef: string): StoredCredential | null {
      return (
        store.credentials.find(
          (credential) => credential.credentialRef === credentialRef,
        ) ?? null
      );
    },
    async listCredentials(
      query: ListCredentialsQuery,
    ): Promise<CredentialRecord[]> {
      return store.credentials
        .filter((credential) => credential.userId === query.userId)
        .map((credential) => ({
          createdAt: credential.createdAt,
          credentialRef: credential.credentialRef,
          provider: credential.provider,
          userId: credential.userId,
        }));
    },
  };
}
