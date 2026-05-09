import type {
  DiscoverySearchResponse,
  DiscoveryTodayResponse,
  ReadingDetailView,
  ReadingInsightResponse,
  ReadingNoteResponse,
  UpdateWorkbenchSettingsRequest,
  WorkbenchSettingsResponse,
  WritingDocumentResponse,
} from '@shared';
import type { EvidenceSpanRecord } from '@shared/contracts/evidence';
import type { ImportSourceType, LibraryListResponse } from '@shared/contracts/library';
import type { NoteVisibility } from '@shared/contracts/reading';

import { requestJson } from './http-client';

const DEFAULT_WORKBENCH_ACTOR_USER_ID = 'user-alice';

function resolveApiUrl(baseUrl: string, pathname: string): string {
  return baseUrl ? new URL(pathname, baseUrl).toString() : pathname;
}

export function createDemoApi(
  baseUrl = '',
  actorUserId = DEFAULT_WORKBENCH_ACTOR_USER_ID,
) {
  function buildSearchUrl(pathname: string, query: string): string {
    const requestUrl = new URL(resolveApiUrl(baseUrl, pathname), 'http://localhost');
    requestUrl.searchParams.set('query', query);

    return baseUrl
      ? requestUrl.toString().replace('http://localhost', '')
      : `${requestUrl.pathname}${requestUrl.search}`;
  }

  function resolvePath(pathname: string): string {
    return resolveApiUrl(baseUrl, pathname);
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
        resolvePath('/api/library/personal'),
      );
    },
    importToPersonalLibrary(input: {
      sourceLocator: string;
      sourceType: Exclude<ImportSourceType, 'upload'>;
    }): Promise<unknown> {
      return requestJson(resolvePath('/api/library/personal/import'), {
        body: JSON.stringify(input),
        method: 'POST',
      });
    },
    getReadingDetail(entryId: string): Promise<ReadingDetailView> {
      return requestJson<ReadingDetailView>(resolvePath(`/api/reading/${entryId}`));
    },
    createReadingNote(input: {
      body: string;
      entryId: string;
      visibility: NoteVisibility;
    }): Promise<ReadingNoteResponse> {
      return requestJson<ReadingNoteResponse>(
        resolvePath(`/api/reading/${input.entryId}/notes`),
        {
          body: JSON.stringify({
            body: input.body,
            visibility: input.visibility,
          }),
          method: 'POST',
        },
      );
    },
    saveReadingInsight(input: {
      entryId: string;
      evidenceSpans?: Array<Omit<EvidenceSpanRecord, 'paperAssetId'>>;
      summary: string;
      title?: string;
    }): Promise<ReadingInsightResponse> {
      return requestJson<ReadingInsightResponse>(
        resolvePath(`/api/reading/${input.entryId}/insights`),
        {
          body: JSON.stringify({
            evidenceSpans: input.evidenceSpans ?? [
              {
                endOffset: 24,
                quote: 'Tumor board evidence',
                startOffset: 0,
              },
            ],
            summary: input.summary,
            title: input.title ?? 'Tumor board governed insight',
          }),
          method: 'POST',
        },
      );
    },
    getWritingDocument(
      spaceId: string,
      projectId: string,
    ): Promise<WritingDocumentResponse> {
      return requestJson<WritingDocumentResponse>(
        resolvePath(`/api/writing/${spaceId}/projects/${projectId}/document`),
      );
    },
    saveWritingDocument(input: {
      citations?: Array<{ evidenceSpan?: string; paperAssetId: string }>;
      content: string;
      projectId: string;
      spaceId: string;
      title: string;
    }): Promise<WritingDocumentResponse> {
      return requestJson<WritingDocumentResponse>(
        resolvePath(`/api/writing/${input.spaceId}/projects/${input.projectId}/document`),
        {
          body: JSON.stringify({
            citations: input.citations ?? [],
            content: input.content,
            title: input.title,
          }),
          method: 'POST',
        },
      );
    },
    getWorkbenchSettings(): Promise<WorkbenchSettingsResponse> {
      return requestJson<WorkbenchSettingsResponse>(
        resolvePath('/api/settings/me'),
        {
          headers: {
            'x-jixia-actor': actorUserId,
          },
        },
      );
    },
    saveWorkbenchSettings(
      input: UpdateWorkbenchSettingsRequest,
    ): Promise<WorkbenchSettingsResponse> {
      return requestJson<WorkbenchSettingsResponse>(
        resolvePath('/api/settings/me'),
        {
          body: JSON.stringify(input),
          headers: {
            'x-jixia-actor': actorUserId,
          },
          method: 'POST',
        },
      );
    },
  };
}
