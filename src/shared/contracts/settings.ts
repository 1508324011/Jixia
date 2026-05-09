export type DefaultImportTarget = 'personal-library' | 'project-workspace';

export interface WorkbenchSettingsResponse {
  apiKeyConfigured: boolean;
  defaultImportTarget: DefaultImportTarget;
}

export interface UpdateWorkbenchSettingsRequest {
  apiKey?: string;
  /** @deprecated Protected HTTP routes derive the actor from session transport headers. */
  actorUserId?: string;
  defaultImportTarget: DefaultImportTarget;
  /** @deprecated Protected HTTP routes derive the actor from session transport headers. */
  userId?: string;
}

export const settingsContract = 'jixia-settings-contract';
