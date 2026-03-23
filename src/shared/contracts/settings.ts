export type DefaultImportTarget = 'personal-library' | 'project-workspace';

export interface WorkbenchSettingsResponse {
  apiKeyConfigured: boolean;
  defaultImportTarget: DefaultImportTarget;
}

export const settingsContract = 'jixia-settings-contract';
