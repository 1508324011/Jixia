import type { CredentialRecord } from '../services/credentials.service';
import type {
  CreateCredentialRequest,
  CredentialsService,
} from '../services/credentials.service';

export interface CredentialsRoutes {
  createCredential(input: CreateCredentialRequest): Promise<CredentialRecord>;
}

export function createCredentialsRoutes(
  service: CredentialsService,
): CredentialsRoutes {
  return {
    createCredential(input: CreateCredentialRequest): Promise<CredentialRecord> {
      return service.createCredential(input);
    },
  };
}
