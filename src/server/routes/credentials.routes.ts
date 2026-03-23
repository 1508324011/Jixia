import type {
  CreateCredentialRequest,
  CredentialRecord,
  CredentialsService,
  SaveWorkbenchSettingsRequest,
} from '../services/credentials.service';
import type { WorkbenchSettingsResponse } from '@shared/contracts/settings';

export interface CredentialsRoutes {
  createCredential(input: CreateCredentialRequest): Promise<CredentialRecord>;
  getWorkbenchSettings(userId: string): WorkbenchSettingsResponse;
  saveWorkbenchSettings(
    input: SaveWorkbenchSettingsRequest,
  ): Promise<WorkbenchSettingsResponse>;
}

export function createCredentialsRoutes(
  service: CredentialsService,
): CredentialsRoutes {
  return {
    createCredential(input: CreateCredentialRequest): Promise<CredentialRecord> {
      return service.createCredential(input);
    },
    getWorkbenchSettings(userId: string): WorkbenchSettingsResponse {
      return service.getWorkbenchSettings(userId);
    },
    saveWorkbenchSettings(
      input: SaveWorkbenchSettingsRequest,
    ): Promise<WorkbenchSettingsResponse> {
      return service.saveWorkbenchSettings(input);
    },
  };
}
