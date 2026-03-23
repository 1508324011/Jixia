import type {
  DiscoveryTodayResponse,
  WorkbenchSettingsResponse,
} from '@shared';

import { requestJson } from './http-client';

function resolveApiUrl(baseUrl: string, pathname: string): string {
  return baseUrl ? new URL(pathname, baseUrl).toString() : pathname;
}

export function createDemoApi(baseUrl = '') {
  return {
    getTodayRecommendations(): Promise<DiscoveryTodayResponse> {
      return requestJson<DiscoveryTodayResponse>(
        resolveApiUrl(baseUrl, '/api/discovery/today'),
      );
    },
    getWorkbenchSettings(): Promise<WorkbenchSettingsResponse> {
      return requestJson<WorkbenchSettingsResponse>(
        resolveApiUrl(baseUrl, '/api/settings/me'),
      );
    },
  };
}
