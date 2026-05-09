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

const DEFAULT_DEMO_ACTOR_USER_ID = 'user-alice';

function resolveApiUrl(baseUrl: string, pathname: string): string {
  return baseUrl ? new URL(pathname, baseUrl).toString() : pathname;
}

export function createDemoApi(
  baseUrl = '',
  actorUserId = DEFAULT_DEMO_ACTOR_USER_ID,
) {
  function actorHeaders(): Record<string, string> {
    return actorUserId ? { 'x-jixia-actor': actorUserId } : {};
  }

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
        { headers: actorHeaders() },
      );
    },
    searchDiscovery(query: string): Promise<DiscoverySearchResponse> {
      return requestJson<DiscoverySearchResponse>(
        buildSearchUrl('/api/discovery/search', query),
        { headers: actorHeaders() },
      );
    },
    getPersonalLibraryEntries(): Promise<LibraryListResponse> {
      return requestJson<LibraryListResponse>(
        resolvePath('/api/library/personal'),
        { headers: actorHeaders() },
      );
    },
    importToPersonalLibrary(input: {
      sourceLocator: string;
      sourceType: Exclude<ImportSourceType, 'upload'>;
    }): Promise<unknown> {
      return requestJson(resolvePath('/api/library/personal/import'), {
        body: JSON.stringify(input),
        headers: actorHeaders(),
        method: 'POST',
      });
    },
    getReadingDetail(entryId: string): Promise<ReadingDetailView> {
      return requestJson<ReadingDetailView>(resolvePath(`/api/reading/${entryId}`), {
        headers: actorHeaders(),
      });
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
          headers: actorHeaders(),
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
          headers: actorHeaders(),
          method: 'POST',
        },
      );
    },
    getWritingDocument(
      spaceId: string,
      projectId: string,
    ): Promise<WritingDocumentResponse> {
      void spaceId;

      return requestJson<WritingDocumentResponse>(
        resolvePath(`/api/projects/${projectId}/writing/document`),
        { headers: actorHeaders() },
      );
    },
    saveWritingDocument(input: {
      citations?: Array<{ evidenceSpan?: string; paperAssetId: string }>;
      content: string;
      projectId: string;
      spaceId: string;
      title: string;
    }): Promise<WritingDocumentResponse> {
      void input.spaceId;

      return requestJson<WritingDocumentResponse>(
        resolvePath(`/api/projects/${input.projectId}/writing/document`),
        {
          body: JSON.stringify({
            citations: input.citations ?? [],
            content: input.content,
            title: input.title,
          }),
          headers: actorHeaders(),
          method: 'POST',
        },
      );
    },
    getWorkbenchSettings(): Promise<WorkbenchSettingsResponse> {
      return requestJson<WorkbenchSettingsResponse>(
        resolvePath('/api/settings/me'),
        { headers: actorHeaders() },
      );
    },
    saveWorkbenchSettings(
      input: UpdateWorkbenchSettingsRequest,
    ): Promise<WorkbenchSettingsResponse> {
      return requestJson<WorkbenchSettingsResponse>(
        resolvePath('/api/settings/me'),
        {
          body: JSON.stringify(input),
          headers: actorHeaders(),
          method: 'POST',
        },
      );
    },
  };
}
