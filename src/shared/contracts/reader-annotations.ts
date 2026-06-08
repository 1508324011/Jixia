import type { SourceTextRangeLocator } from './source-text';

export type ReferenceLifecycleStatus = 'active' | 'archived' | 'removed';

export type ReaderAnnotationVisibility = 'private' | 'project';

export type SourceContextType =
  | 'libraryEntry'
  | 'notebookDocumentVersion'
  | 'projectDocVersion'
  | 'sourceTextArtifact';

export interface SourceContextRef {
  id: string;
  type: SourceContextType;
  versionId?: string;
}

export interface ReaderTextQuoteSelector {
  exact: string;
  prefix?: string;
  suffix?: string;
  type: 'textQuote';
}

export interface ReaderTextPositionSelector {
  endOffset: number;
  startOffset: number;
  type: 'textPosition';
}

export type ReaderAnnotationSelector =
  | ReaderTextPositionSelector
  | ReaderTextQuoteSelector;

export interface ReaderAnnotationLocator {
  label?: string;
  pageNumber?: number;
  range?: SourceTextRangeLocator;
}

export interface ReaderAnnotationCopyState {
  copiedAt?: string;
  state: 'private_original' | 'project_copy';
}

export interface ReaderAnnotationRecord {
  copyState: ReaderAnnotationCopyState;
  createdAt: string;
  id: string;
  libraryEntryId: string;
  lifecycleStatus: ReferenceLifecycleStatus;
  locator?: ReaderAnnotationLocator;
  note?: string;
  paperAssetId: string;
  projectId?: string;
  quote: string;
  selector: ReaderAnnotationSelector;
  sourceContext: SourceContextRef;
  sourceTextArtifactId?: string;
  updatedAt: string;
  visibility: ReaderAnnotationVisibility;
}

export interface CreateReaderAnnotationRequest {
  libraryEntryId: string;
  locator?: ReaderAnnotationLocator;
  note?: string;
  quote: string;
  selector: ReaderAnnotationSelector;
  sourceContext: SourceContextRef;
  sourceTextArtifactId?: string;
}

export interface PublishReaderAnnotationToProjectRequest {
  sourceAnnotationId: string;
  targetLibraryEntryId: string;
}

export interface ReaderAnnotationResponse {
  annotation: ReaderAnnotationRecord;
}

export interface ListReaderAnnotationsResponse {
  annotations: ReaderAnnotationRecord[];
}

export const readerAnnotationsContract = 'jixia-reader-annotations-contract-v1';
