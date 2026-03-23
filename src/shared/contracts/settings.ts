export type DefaultImportTarget = 'personal-library' | 'project-workspace';

export interface WorkbenchSettingsResponse {
  apiKeyConfigured: boolean;
  defaultImportTarget: DefaultImportTarget;
}

export interface UpdateWorkbenchSettingsRequest {
  apiKey?: string;
  defaultImportTarget: DefaultImportTarget;
}

export const settingsContract = 'jixia-settings-contract';
