import type {
  DiscoverySearchResponse,
  DiscoveryTodayResponse,
  TodayRecommendation,
} from '@shared/contracts/discovery';
import type { LibraryListResponse } from '@shared/contracts/library';
import type {
  DefaultImportTarget,
  UpdateWorkbenchSettingsRequest,
  WorkbenchSettingsResponse,
} from '@shared/contracts/settings';

import type { JixiaApp } from './app';

export interface HttpApiResponse {
  payload: unknown;
  statusCode: number;
}

const DEFAULT_WORKBENCH_USER_ID = 'user-alice';
const TODAY_DISCOVERY_QUERY = 'tumor board biomarkers';

interface ImportToPersonalLibraryRequestBody {
  sourceLocator?: string;
  sourceType?: 'doi' | 'pmid' | 'arxiv';
}

function isDefaultImportTarget(value: unknown): value is DefaultImportTarget {
  return value === 'personal-library' || value === 'project-workspace';
}

function isImportSourceType(
  value: unknown,
): value is ImportToPersonalLibraryRequestBody['sourceType'] {
  return value === 'doi' || value === 'pmid' || value === 'arxiv';
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

function parseImportToPersonalLibraryRequest(
  requestBody: unknown,
): Required<ImportToPersonalLibraryRequestBody> {
  if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
    throw new Error('Import payload must be a JSON object.');
  }

  const { sourceLocator, sourceType } = requestBody as Record<string, unknown>;

  if (typeof sourceLocator !== 'string' || !sourceLocator.trim()) {
    throw new Error('sourceLocator is required.');
  }

  if (!isImportSourceType(sourceType)) {
    throw new Error('sourceType is required.');
  }

  return {
    sourceLocator: sourceLocator.trim(),
    sourceType: sourceType as 'doi' | 'pmid' | 'arxiv',
  };
}

function toLibraryListResponse(
  entries: Awaited<ReturnType<JixiaApp['library']['listPersonalEntries']>>,
): LibraryListResponse {
  return {
    entries: entries.map(({ asset, entry }) => ({
      addedAt: entry.addedAt,
      canonicalId: asset.canonicalId,
      entryId: entry.id,
      paperAssetId: entry.paperAssetId,
      spaceId: entry.spaceId,
      title: asset.title,
      visibility: entry.visibility,
    })),
  };
}

async function markImportedDiscoveryItems(
  app: JixiaApp,
  items: TodayRecommendation[],
): Promise<TodayRecommendation[]> {
  const personalEntries = await app.library.listPersonalEntries(DEFAULT_WORKBENCH_USER_ID);
  const importedCanonicalIds = new Set(
    personalEntries.map(({ asset }) => asset.canonicalId),
  );

  return items.map((item) => ({
    ...item,
    imported: importedCanonicalIds.has(item.canonicalId),
  }));
}

export async function resolveHttpApi(
  app: JixiaApp,
  requestUrl: URL,
  method: string,
  requestBody?: unknown,
): Promise<HttpApiResponse | null> {
  const pathname = requestUrl.pathname;

  if ((method === 'GET' || method === 'HEAD') && pathname === '/api/discovery/today') {
    const payload: DiscoveryTodayResponse = {
      items: await markImportedDiscoveryItems(
        app,
        await app.imports.searchDiscovery(TODAY_DISCOVERY_QUERY),
      ),
    };

    return {
      payload,
      statusCode: 200,
    };
  }

  if ((method === 'GET' || method === 'HEAD') && pathname === '/api/discovery/search') {
    const query = requestUrl.searchParams.get('query')?.trim() ?? '';
    const payload: DiscoverySearchResponse = {
      items: query
        ? await markImportedDiscoveryItems(app, await app.imports.searchDiscovery(query))
        : [],
      query,
    };

    return {
      payload,
      statusCode: 200,
    };
  }

  if ((method === 'GET' || method === 'HEAD') && pathname === '/api/library/personal') {
    return {
      payload: toLibraryListResponse(
        await app.library.listPersonalEntries(DEFAULT_WORKBENCH_USER_ID),
      ),
      statusCode: 200,
    };
  }

  if (method === 'POST' && pathname === '/api/library/personal/import') {
    const payload = parseImportToPersonalLibraryRequest(requestBody);

    return {
      payload: await app.imports.importToPersonalLibrary({
        requestedByUserId: DEFAULT_WORKBENCH_USER_ID,
        sourceLocator: payload.sourceLocator,
        sourceType: payload.sourceType,
      }),
      statusCode: 201,
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
