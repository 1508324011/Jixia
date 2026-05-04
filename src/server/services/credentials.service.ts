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
  createCredential(
    input: CreateCredentialRequest,
    actorUserId?: string,
  ): Promise<CredentialRecord>;
  getStoredCredential(credentialRef: string): StoredCredential | null;
  listCredentials(
    query: ListCredentialsQuery,
    actorUserId?: string,
  ): Promise<CredentialRecord[]>;
}

export function createCredentialsService(
  store: CredentialsStore,
): CredentialsService {
  return {
    async createCredential(
      input: CreateCredentialRequest,
      actorUserId?: string,
    ): Promise<CredentialRecord> {
      const effectiveUserId = actorUserId ?? input.userId;

      if (!effectiveUserId) {
        throw new Error("Credentials require an actor user id.");
      }

      if (actorUserId && input.userId && input.userId !== actorUserId) {
        throw new Error(
          "Request body actor does not match the server-derived actor.",
        );
      }

      const credential: StoredCredential = {
        createdAt: new Date().toISOString(),
        credentialRef: store.nextId("cred"),
        ...store.secretBox.encrypt(input.rawSecret),
        provider: input.provider,
        userId: effectiveUserId,
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
      actorUserId?: string,
    ): Promise<CredentialRecord[]> {
      const effectiveUserId = actorUserId ?? query.userId;

      if (!effectiveUserId) {
        throw new Error("Credentials require an actor user id.");
      }

      if (actorUserId && query.userId && query.userId !== actorUserId) {
        throw new Error(
          "Request actor does not match the server-derived actor.",
        );
      }

      return store.credentials
        .filter((credential) => credential.userId === effectiveUserId)
        .map((credential) => ({
          createdAt: credential.createdAt,
          credentialRef: credential.credentialRef,
          provider: credential.provider,
          userId: credential.userId,
        }));
    },
  };
}
