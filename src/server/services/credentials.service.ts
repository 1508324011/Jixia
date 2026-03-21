export interface CredentialRecord {
  createdAt: string;
  credentialRef: string;
  provider: string;
  userId: string;
}

export interface StoredCredential extends CredentialRecord {
  sealedSecret: string;
}

export interface CreateCredentialRequest {
  provider: string;
  rawSecret: string;
  userId: string;
}

export interface CredentialsStore {
  credentials: StoredCredential[];
  nextId(prefix: string): string;
}

export interface CredentialsService {
  createCredential(input: CreateCredentialRequest): Promise<CredentialRecord>;
  getStoredCredential(credentialRef: string): StoredCredential | null;
}

function sealSecret(rawSecret: string): string {
  return Buffer.from(rawSecret, 'utf8').toString('base64');
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
        provider: input.provider,
        sealedSecret: sealSecret(input.rawSecret),
        userId: input.userId,
      };

      store.credentials.push(credential);

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
