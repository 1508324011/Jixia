import type {
  EncryptedSecretPayload,
  SecretBox,
} from '../security/secret-box';

export interface CredentialRecord {
  createdAt: string;
  credentialRef: string;
  provider: string;
  userId: string;
}

export interface StoredCredential extends CredentialRecord, EncryptedSecretPayload {}

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
}

export interface CredentialsService {
  createCredential(input: CreateCredentialRequest): Promise<CredentialRecord>;
  getStoredCredential(credentialRef: string): StoredCredential | null;
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
        credentialRef: store.nextId('cred'),
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
  };
}
