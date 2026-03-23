import type {
  DiscoverySearchResponse,
  DiscoveryTodayResponse,
  UpdateWorkbenchSettingsRequest,
  WorkbenchSettingsResponse,
} from '@shared';
import type { ImportSourceType, LibraryListResponse } from '@shared/contracts/library';

import { requestJson } from './http-client';

function resolveApiUrl(baseUrl: string, pathname: string): string {
  return baseUrl ? new URL(pathname, baseUrl).toString() : pathname;
}

export function createDemoApi(baseUrl = '') {
  function buildSearchUrl(pathname: string, query: string): string {
    const requestUrl = new URL(resolveApiUrl(baseUrl, pathname), 'http://localhost');
    requestUrl.searchParams.set('query', query);

    return baseUrl
      ? requestUrl.toString().replace('http://localhost', '')
      : `${requestUrl.pathname}${requestUrl.search}`;
  }

  return {
    getTodayRecommendations(): Promise<DiscoveryTodayResponse> {
      return requestJson<DiscoveryTodayResponse>(
        resolveApiUrl(baseUrl, '/api/discovery/today'),
      );
    },
    searchDiscovery(query: string): Promise<DiscoverySearchResponse> {
      return requestJson<DiscoverySearchResponse>(
        buildSearchUrl('/api/discovery/search', query),
      );
    },
    getPersonalLibraryEntries(): Promise<LibraryListResponse> {
      return requestJson<LibraryListResponse>(
        resolveApiUrl(baseUrl, '/api/library/personal'),
      );
    },
    importToPersonalLibrary(input: {
      sourceLocator: string;
      sourceType: Exclude<ImportSourceType, 'upload'>;
    }): Promise<unknown> {
      return requestJson(resolveApiUrl(baseUrl, '/api/library/personal/import'), {
        body: JSON.stringify(input),
        method: 'POST',
      });
    },
    getWorkbenchSettings(): Promise<WorkbenchSettingsResponse> {
      return requestJson<WorkbenchSettingsResponse>(
        resolveApiUrl(baseUrl, '/api/settings/me'),
      );
    },
    saveWorkbenchSettings(
      input: UpdateWorkbenchSettingsRequest,
    ): Promise<WorkbenchSettingsResponse> {
      return requestJson<WorkbenchSettingsResponse>(
        resolveApiUrl(baseUrl, '/api/settings/me'),
        {
          body: JSON.stringify(input),
          method: 'POST',
        },
      );
    },
  };
}
