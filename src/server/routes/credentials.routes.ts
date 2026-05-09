import type {
  CreateCredentialRequest,
  CredentialRecord,
  ListCredentialsQuery,
} from "@shared/contracts/credentials";
import type { WorkbenchSettingsResponse } from "@shared/contracts/settings";

import type {
  CredentialsService,
  SaveWorkbenchSettingsRequest,
  StoredCredential,
} from "../services/credentials.service";

export interface CredentialsRoutes {
  createCredential(
    input: CreateCredentialRequest,
    actorUserId: string,
  ): Promise<CredentialRecord>;
  getWorkbenchSettings(actorUserId: string): Promise<WorkbenchSettingsResponse>;
  getStoredCredential(
    credentialRef: string,
    actorUserId: string,
  ): Promise<StoredCredential | null>;
  listCredentials(
    query: ListCredentialsQuery,
    actorUserId: string,
  ): Promise<CredentialRecord[]>;
  saveWorkbenchSettings(
    input: SaveWorkbenchSettingsRequest,
    actorUserId: string,
  ): Promise<WorkbenchSettingsResponse>;
}

export function createCredentialsRoutes(
  service: CredentialsService,
): CredentialsRoutes {
  return {
    createCredential(
      input: CreateCredentialRequest,
      actorUserId: string,
    ): Promise<CredentialRecord> {
      return service.createCredential(input, actorUserId);
    },
    getWorkbenchSettings(actorUserId: string): Promise<WorkbenchSettingsResponse> {
      return service.getWorkbenchSettings(actorUserId);
    },
    getStoredCredential(
      credentialRef: string,
      actorUserId: string,
    ): Promise<StoredCredential | null> {
      return service.getStoredCredential(credentialRef, actorUserId);
    },
    listCredentials(
      query: ListCredentialsQuery,
      actorUserId: string,
    ): Promise<CredentialRecord[]> {
      return service.listCredentials(query, actorUserId);
    },
    saveWorkbenchSettings(
      input: SaveWorkbenchSettingsRequest,
      actorUserId: string,
    ): Promise<WorkbenchSettingsResponse> {
      return service.saveWorkbenchSettings(input, actorUserId);
    },
  };
}
