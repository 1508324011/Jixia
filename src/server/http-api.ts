import type { DiscoveryTodayResponse } from '@shared/contracts/discovery';
import type { WorkbenchSettingsResponse } from '@shared/contracts/settings';

export interface HttpApiResponse {
  payload: DiscoveryTodayResponse | WorkbenchSettingsResponse;
  statusCode: number;
}

const todayRecommendations: DiscoveryTodayResponse = {
  items: [
    {
      id: 'today-1',
      imported: true,
      reason: 'Shared tumor-board review needs a first-pass summary today.',
      title: 'Signal pathways in shared tumor boards',
    },
  ],
};

const workbenchSettings: WorkbenchSettingsResponse = {
  apiKeyConfigured: false,
  defaultImportTarget: 'personal-library',
};

export function resolveHttpApi(
  pathname: string,
  method: string,
): HttpApiResponse | null {
  if ((method === 'GET' || method === 'HEAD') && pathname === '/api/discovery/today') {
    return {
      payload: todayRecommendations,
      statusCode: 200,
    };
  }

  if ((method === 'GET' || method === 'HEAD') && pathname === '/api/settings/me') {
    return {
      payload: workbenchSettings,
      statusCode: 200,
    };
  }

  return null;
}
