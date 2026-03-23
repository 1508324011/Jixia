import type { DiscoveryTodayResponse } from '@shared/contracts/discovery';
import type {
  DefaultImportTarget,
  UpdateWorkbenchSettingsRequest,
  WorkbenchSettingsResponse,
} from '@shared/contracts/settings';

import type { JixiaApp } from './app';

export interface HttpApiResponse {
  payload: DiscoveryTodayResponse | WorkbenchSettingsResponse;
  statusCode: number;
}

const DEFAULT_WORKBENCH_USER_ID = 'user-alice';

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

function isDefaultImportTarget(value: unknown): value is DefaultImportTarget {
  return value === 'personal-library' || value === 'project-workspace';
}

function parseWorkbenchSettingsUpdate(
  requestBody: unknown,
): UpdateWorkbenchSettingsRequest {
  if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
    throw new Error('Settings payload must be a JSON object.');
  }

  const { apiKey, defaultImportTarget } = requestBody as Record<string, unknown>;

  if (typeof apiKey !== 'undefined' && typeof apiKey !== 'string') {
    throw new Error('apiKey must be a string when provided.');
  }

  if (!isDefaultImportTarget(defaultImportTarget)) {
    throw new Error('defaultImportTarget must be provided.');
  }

  return {
    apiKey,
    defaultImportTarget,
  };
}

export async function resolveHttpApi(
  app: JixiaApp,
  pathname: string,
  method: string,
  requestBody?: unknown,
): Promise<HttpApiResponse | null> {
  if ((method === 'GET' || method === 'HEAD') && pathname === '/api/discovery/today') {
    return {
      payload: todayRecommendations,
      statusCode: 200,
    };
  }

  if ((method === 'GET' || method === 'HEAD') && pathname === '/api/settings/me') {
    return {
      payload: app.credentials.getWorkbenchSettings(DEFAULT_WORKBENCH_USER_ID),
      statusCode: 200,
    };
  }

  if (method === 'POST' && pathname === '/api/settings/me') {
    const payload = parseWorkbenchSettingsUpdate(requestBody);

    return {
      payload: await app.credentials.saveWorkbenchSettings({
        apiKey: payload.apiKey,
        defaultImportTarget: payload.defaultImportTarget,
        userId: DEFAULT_WORKBENCH_USER_ID,
      }),
      statusCode: 200,
    };
  }

  return null;
}
