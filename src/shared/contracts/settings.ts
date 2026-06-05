export type DefaultImportTarget = 'personal-library';

/** @deprecated Project workspace is not a normal external-import default. */
export type DeprecatedDefaultImportTarget = 'project-workspace';

export interface WorkbenchSettingsResponse {
  /**
   * Browser-safe availability only. Raw credential material is accepted by
   * dedicated credential mutation routes, not by workbench settings payloads.
   */
  apiKeyConfigured: boolean;
  defaultImportTarget: DefaultImportTarget;
}

export interface UpdateWorkbenchSettingsRequest {
  defaultImportTarget: DefaultImportTarget;
}

export const settingsContract = 'jixia-settings-contract';
