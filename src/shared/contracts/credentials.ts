export interface CredentialRecord {
  createdAt: string;
  credentialRef: string;
  provider: string;
  userId: string;
}

export interface CreateCredentialRequest {
  provider: string;
  rawSecret: string;
  /** @deprecated Protected HTTP routes derive the actor from session transport headers. */
  userId?: string;
}

export interface ListCredentialsQuery {
  /** @deprecated Protected HTTP routes derive the actor from session transport headers. */
  userId?: string;
}

export const credentialsContract = "jixia-credentials-contract";
