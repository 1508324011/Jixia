import type {
  DiscoverySearchResponse,
  DiscoveryTodayResponse,
} from '@shared/contracts/discovery';
import type { EvidenceSpanRecord } from '@shared/contracts/evidence';
import type { GovernedJobResponse } from '@shared/contracts/jobs';
import type {
  ImportSourceType,
  LibraryEntryVisibility,
  LibraryListResponse,
} from '@shared/contracts/library';
import type {
  NoteVisibility,
  ReadingDetailView,
  ReadingInsightResponse,
  ReadingNoteResponse,
} from '@shared/contracts/reading';
import type {
  UpdateWorkbenchSettingsRequest,
  WorkbenchSettingsResponse,
} from '@shared/contracts/settings';
import type {
  CreateSpaceRequest,
  DemoSpaceListResponse,
  DemoSpaceResponse,
} from '@shared/contracts/spaces';
import type {
  PublishState,
  WritingDocumentResponse,
} from '@shared/contracts/writing';

import { requestJson } from './http-client';

export interface ImportLibraryPaperInput {
  sourceLocator: string;
  sourceType: 'arxiv' | 'doi' | 'pmid';
  spaceId: string;
  visibility?: LibraryEntryVisibility;
}

export interface ImportedLibraryRecordResponse {
  asset: {
    canonicalId: string;
    id: string;
    title: string;
  };
  entry: {
    id: string;
    paperAssetId: string;
    spaceId: string;
    visibility: LibraryEntryVisibility;
  };
}

export interface CreateReadingNoteInput {
  body: string;
  entryId: string;
  spaceId: string;
  visibility?: NoteVisibility;
}

export interface SaveReadingInsightInput {
  entryId: string;
  spaceId: string;
  evidenceSpans?: Array<Omit<EvidenceSpanRecord, 'paperAssetId'>>;
  summary: string;
  title?: string;
}

export interface SaveWritingDocumentInput {
  citations?: Array<{ evidenceSpan?: string; paperAssetId: string }>;
  content: string;
  projectId: string;
  spaceId: string;
  title: string;
}

function resolveApiUrl(baseUrl: string, pathname: string): string {
  return baseUrl ? new URL(pathname, baseUrl).toString() : pathname;
}

function requestDemoJson<T>(baseUrl: string, pathname: string, init?: RequestInit): Promise<T> {
  return requestJson<T>(resolveApiUrl(baseUrl, pathname), init);
}

export function createDemoApi(baseUrl = '') {
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
      return requestDemoJson<DiscoveryTodayResponse>(baseUrl, '/api/discovery/today');
    },
    searchDiscovery(query: string): Promise<DiscoverySearchResponse> {
      return requestJson<DiscoverySearchResponse>(buildSearchUrl('/api/discovery/search', query));
    },
    getPersonalLibraryEntries(): Promise<LibraryListResponse> {
      return requestJson<LibraryListResponse>(resolvePath('/api/library/personal'));
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
      return requestJson<ReadingNoteResponse>(resolvePath(`/api/reading/${input.entryId}/notes`), {
        body: JSON.stringify({
          body: input.body,
          visibility: input.visibility,
        }),
        method: 'POST',
      });
    },
    saveReadingInsight(input: {
      entryId: string;
      evidenceSpans?: Array<Omit<EvidenceSpanRecord, 'paperAssetId'>>;
      summary: string;
      title?: string;
    }): Promise<ReadingInsightResponse> {
      return requestJson<ReadingInsightResponse>(resolvePath(`/api/reading/${input.entryId}/insights`), {
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
      });
    },
    getWritingDocument(spaceId: string, projectId: string): Promise<WritingDocumentResponse> {
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
      return requestJson<WorkbenchSettingsResponse>(resolvePath('/api/settings/me'));
    },
    saveWorkbenchSettings(
      input: UpdateWorkbenchSettingsRequest,
    ): Promise<WorkbenchSettingsResponse> {
      return requestJson<WorkbenchSettingsResponse>(resolvePath('/api/settings/me'), {
        body: JSON.stringify(input),
        method: 'POST',
      });
    },
  };
}

export function getTodayRecommendations(): Promise<DiscoveryTodayResponse> {
  return createDemoApi().getTodayRecommendations();
}

export function getWorkbenchSettings(): Promise<WorkbenchSettingsResponse> {
  return createDemoApi().getWorkbenchSettings();
}

export async function getGovernedSummary(spaceId: string): Promise<GovernedJobResponse> {
  return requestJson<GovernedJobResponse>(`/api/spaces/${spaceId}/governed-summary`);
}

export async function getSpaces(): Promise<DemoSpaceListResponse> {
  return requestJson<DemoSpaceListResponse>('/api/spaces');
}

export async function createSpace(input: CreateSpaceRequest): Promise<DemoSpaceResponse> {
  return requestJson<DemoSpaceResponse>('/api/spaces', {
    body: JSON.stringify(input),
    method: 'POST',
  });
}

export async function getLibraryEntries(
  spaceId: string,
  projectId: string,
): Promise<LibraryListResponse> {
  return requestJson<LibraryListResponse>(`/api/spaces/${spaceId}/projects/${projectId}/library`);
}

export async function importLibraryPaper(
  input: ImportLibraryPaperInput,
): Promise<ImportedLibraryRecordResponse> {
  return requestJson<ImportedLibraryRecordResponse>(`/api/spaces/${input.spaceId}/import`, {
    body: JSON.stringify({
      sourceLocator: input.sourceLocator,
      sourceType: input.sourceType,
      visibility: input.visibility ?? 'space_shared',
    }),
    method: 'POST',
  });
}

export async function getReadingDetail(
  entryId: string,
  spaceId: string,
): Promise<ReadingDetailView> {
  return requestJson<ReadingDetailView>(
    `/api/reading/${entryId}?spaceId=${encodeURIComponent(spaceId)}`,
  );
}

export async function createReadingNote(
  input: CreateReadingNoteInput,
): Promise<ReadingNoteResponse> {
  return requestJson<ReadingNoteResponse>(
    `/api/reading/${input.entryId}/notes?spaceId=${encodeURIComponent(input.spaceId)}`,
    {
      body: JSON.stringify({
        body: input.body,
        visibility: input.visibility ?? 'space_shared',
      }),
      method: 'POST',
    },
  );
}

export async function saveReadingInsight(
  input: SaveReadingInsightInput,
): Promise<ReadingInsightResponse> {
  return requestJson<ReadingInsightResponse>(
    `/api/reading/${input.entryId}/insights?spaceId=${encodeURIComponent(input.spaceId)}`,
    {
      body: JSON.stringify({
        evidenceSpans: input.evidenceSpans ?? [
          {
            endOffset: 24,
            quote: 'Key mutation evidence',
            startOffset: 0,
          },
        ],
        summary: input.summary,
        title: input.title ?? 'Tumor board summary',
      }),
      method: 'POST',
    },
  );
}

export async function getWritingDocument(
  spaceId: string,
  projectId: string,
): Promise<WritingDocumentResponse> {
  return requestJson<WritingDocumentResponse>(
    `/api/writing/${spaceId}/projects/${projectId}/document`,
  );
}

export async function saveWritingDocument(
  input: SaveWritingDocumentInput,
): Promise<WritingDocumentResponse> {
  return requestJson<WritingDocumentResponse>(
    `/api/writing/${input.spaceId}/projects/${input.projectId}/document`,
    {
      body: JSON.stringify({
        citations: input.citations ?? [],
        content: input.content,
        title: input.title,
      }),
      method: 'POST',
    },
  );
}

export async function publishWritingDocument(
  spaceId: string,
  documentId: string,
  publishState: PublishState = 'published',
): Promise<WritingDocumentResponse> {
  return requestJson<WritingDocumentResponse>(
    `/api/writing/${documentId}/publish?spaceId=${encodeURIComponent(spaceId)}`,
    {
      body: JSON.stringify({ publishState }),
      method: 'POST',
    },
  );
}

export async function runGovernedSummary(
  spaceId: string,
): Promise<GovernedJobResponse> {
  return requestJson<GovernedJobResponse>(`/api/spaces/${spaceId}/governed-summary`, {
    method: 'POST',
  });
}
