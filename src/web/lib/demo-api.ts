import type { EvidenceSpanRecord } from '@shared/contracts/evidence';
import type {
  LibraryEntryVisibility,
  LibraryListResponse,
} from '@shared/contracts/library';
import type {
  ReadingDetailView,
  ReadingInsightResponse,
  ReadingNoteResponse,
  NoteVisibility,
} from '@shared/contracts/reading';
import type { GovernedJobResponse } from '@shared/contracts/jobs';
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
  visibility?: NoteVisibility;
}

export interface SaveReadingInsightInput {
  entryId: string;
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

export async function getReadingDetail(entryId: string): Promise<ReadingDetailView> {
  return requestJson<ReadingDetailView>(`/api/reading/${entryId}`);
}

export async function getGovernedSummary(
  spaceId: string,
): Promise<GovernedJobResponse> {
  return requestJson<GovernedJobResponse>(`/api/spaces/${spaceId}/governed-summary`);
}

export async function getLibraryEntries(
  spaceId: string,
  projectId: string,
): Promise<LibraryListResponse> {
  return requestJson<LibraryListResponse>(
    `/api/spaces/${spaceId}/projects/${projectId}/library`,
  );
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

export async function createReadingNote(
  input: CreateReadingNoteInput,
): Promise<ReadingNoteResponse> {
  return requestJson<ReadingNoteResponse>(`/api/reading/${input.entryId}/notes`, {
    body: JSON.stringify({
      body: input.body,
      visibility: input.visibility ?? 'space_shared',
    }),
    method: 'POST',
  });
}

export async function saveReadingInsight(
  input: SaveReadingInsightInput,
): Promise<ReadingInsightResponse> {
  return requestJson<ReadingInsightResponse>(`/api/reading/${input.entryId}/insights`, {
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
  });
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
  documentId: string,
  publishState: PublishState = 'published',
): Promise<WritingDocumentResponse> {
  return requestJson<WritingDocumentResponse>(`/api/writing/${documentId}/publish`, {
    body: JSON.stringify({ publishState }),
    method: 'POST',
  });
}

export async function runGovernedSummary(
  spaceId: string,
): Promise<GovernedJobResponse> {
  return requestJson<GovernedJobResponse>(`/api/spaces/${spaceId}/governed-summary`, {
    method: 'POST',
  });
}
