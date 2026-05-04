import type {
  CreateCredentialRequest,
  CredentialRecord,
  ListCredentialsQuery,
} from "@shared/contracts/credentials";

import type { CredentialsService } from "../services/credentials.service";

export interface CredentialsRoutes {
  createCredential(
    input: CreateCredentialRequest,
    actorUserId?: string,
  ): Promise<CredentialRecord>;
  listCredentials(
    query: ListCredentialsQuery,
    actorUserId?: string,
  ): Promise<CredentialRecord[]>;
}

export function createCredentialsRoutes(
  service: CredentialsService,
): CredentialsRoutes {
  return {
    createCredential(
      input: CreateCredentialRequest,
      actorUserId?: string,
    ): Promise<CredentialRecord> {
      return service.createCredential(input, actorUserId);
    },
    listCredentials(
      query: ListCredentialsQuery,
      actorUserId?: string,
    ): Promise<CredentialRecord[]> {
      return service.listCredentials(query, actorUserId);
    },
  };
}
