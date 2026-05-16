import type {
  CaptureNotebookEvidenceRequest,
  CaptureNotebookEvidenceResponse,
  DiscoverySearchResponse,
  DiscoveryTodayResponse,
  ReadingDetailView,
  ReadingInsightResponse,
  ReadingNoteResponse,
  UpdateWorkbenchSettingsRequest,
  WorkbenchSettingsResponse,
  WritingDocumentResponse,
} from '@shared';
import type { DocumentBlockDocument } from '@shared/contracts/document-content';
import type { EvidenceSpanRecord } from '@shared/contracts/evidence';
import type { ImportSourceType, LibraryListResponse } from '@shared/contracts/library';

import { requestJson } from './http-client';

interface DemoApiOptions {
  cookie?: string;
}

function resolveApiUrl(baseUrl: string, pathname: string): string {
  return baseUrl ? new URL(pathname, baseUrl).toString() : pathname;
}

export function createDemoApi(baseUrl = '', options: DemoApiOptions = {}) {
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

  function requestHeaders(): Record<string, string> | undefined {
    return options.cookie ? { Cookie: options.cookie } : undefined;
  }

  return {
    getTodayRecommendations(): Promise<DiscoveryTodayResponse> {
      return requestJson<DiscoveryTodayResponse>(
        resolveApiUrl(baseUrl, '/api/discovery/today'),
        { headers: requestHeaders() },
      );
    },
    searchDiscovery(query: string): Promise<DiscoverySearchResponse> {
      return requestJson<DiscoverySearchResponse>(
        buildSearchUrl('/api/discovery/search', query),
        { headers: requestHeaders() },
      );
    },
    getPersonalLibraryEntries(): Promise<LibraryListResponse> {
      return requestJson<LibraryListResponse>(resolvePath('/api/library/personal'), {
        headers: requestHeaders(),
      });
    },
    importToPersonalLibrary(input: {
      sourceLocator: string;
      sourceType: Exclude<ImportSourceType, 'upload'>;
    }): Promise<unknown> {
      return requestJson(resolvePath('/api/library/personal/import'), {
        body: JSON.stringify(input),
        headers: requestHeaders(),
        method: 'POST',
      });
    },
    getReadingDetail(entryId: string): Promise<ReadingDetailView> {
      return requestJson<ReadingDetailView>(resolvePath(`/api/reading/${entryId}`), {
        headers: requestHeaders(),
      });
    },
    createReadingNote(input: {
      body: string;
      entryId: string;
    }): Promise<ReadingNoteResponse> {
      return requestJson<ReadingNoteResponse>(
        resolvePath(`/api/reading/${input.entryId}/notes`),
        {
          body: JSON.stringify({
            body: input.body,
          }),
          headers: requestHeaders(),
          method: 'POST',
        },
      );
    },
    createProjectReadingComment(input: {
      body: string;
      entryId: string;
      projectId?: string;
    }): Promise<import('@shared').ProjectReadingCommentResponse> {
      return requestJson<import('@shared').ProjectReadingCommentResponse>(
        resolvePath(`/api/reading/${input.entryId}/project-comments`),
        {
          body: JSON.stringify({
            body: input.body,
            projectId: input.projectId,
          }),
          headers: requestHeaders(),
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
          headers: requestHeaders(),
          method: 'POST',
        },
      );
    },
    captureNotebookEvidence(
      input: CaptureNotebookEvidenceRequest,
    ): Promise<CaptureNotebookEvidenceResponse> {
      return requestJson<CaptureNotebookEvidenceResponse>(
        resolvePath('/api/notebooks/capture'),
        {
          body: JSON.stringify(input),
          headers: requestHeaders(),
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
        { headers: requestHeaders() },
      );
    },
    saveWritingDocument(input: {
      citations?: Array<{
        evidenceSpan?: string;
        libraryEntryId?: string;
        paperAssetId: string;
      }>;
      content?: string;
      documentContent?: DocumentBlockDocument;
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
            documentContent: input.documentContent,
            title: input.title,
          }),
          headers: requestHeaders(),
          method: 'POST',
        },
      );
    },
    getWorkbenchSettings(): Promise<WorkbenchSettingsResponse> {
      return requestJson<WorkbenchSettingsResponse>(resolvePath('/api/settings/me'), {
        headers: requestHeaders(),
      });
    },
    saveWorkbenchSettings(
      input: UpdateWorkbenchSettingsRequest,
    ): Promise<WorkbenchSettingsResponse> {
      return requestJson<WorkbenchSettingsResponse>(
        resolvePath('/api/settings/me'),
        {
          body: JSON.stringify(input),
          headers: requestHeaders(),
          method: 'POST',
        },
      );
    },
  };
}
