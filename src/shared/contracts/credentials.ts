export interface CredentialRecord {
  createdAt: string;
  credentialRef: string;
  provider: string;
  userId: string;
}

export interface CreateCredentialRequest {
  provider: string;
  rawSecret: string;
  userId: string;
}

export interface ListCredentialsQuery {
  userId: string;
}

export const credentialsContract = "jixia-credentials-contract";
