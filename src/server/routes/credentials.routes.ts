import type {
  CreateCredentialRequest,
  CredentialRecord,
  ListCredentialsQuery,
} from "@shared/contracts/credentials";

import type { CredentialsService } from "../services/credentials.service";

export interface CredentialsRoutes {
  createCredential(input: CreateCredentialRequest): Promise<CredentialRecord>;
  listCredentials(query: ListCredentialsQuery): Promise<CredentialRecord[]>;
}

export function createCredentialsRoutes(
  service: CredentialsService,
): CredentialsRoutes {
  return {
    createCredential(
      input: CreateCredentialRequest,
    ): Promise<CredentialRecord> {
      return service.createCredential(input);
    },
    listCredentials(query: ListCredentialsQuery): Promise<CredentialRecord[]> {
      return service.listCredentials(query);
    },
  };
}
