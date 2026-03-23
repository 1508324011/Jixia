export const sharedEntrypoint = 'jixia-shared-entry';

export type {
  DiscoverySearchResponse,
  DiscoveryTodayResponse,
  TodayRecommendation,
} from './contracts/discovery';
export { discoveryContract } from './contracts/discovery';
export type {
  DefaultImportTarget,
  UpdateWorkbenchSettingsRequest,
  WorkbenchSettingsResponse,
} from './contracts/settings';
export { settingsContract } from './contracts/settings';
