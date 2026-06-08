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

interface ReaderAnnotationRecordBase {
  copyState: ReaderAnnotationCopyState;
  createdAt: string;
  id: string;
  libraryEntryId: string;
  lifecycleStatus: ReferenceLifecycleStatus;
  locator?: ReaderAnnotationLocator;
  paperAssetId: string;
  quote: string;
  selector: ReaderAnnotationSelector;
  sourceContext: SourceContextRef;
  sourceTextArtifactId?: string;
  updatedAt: string;
}

export interface PrivateReaderAnnotationRecord extends ReaderAnnotationRecordBase {
  copyState: ReaderAnnotationCopyState & { state: 'private_original' };
  note?: string;
  projectId?: never;
  visibility: 'private';
}

export interface ProjectReaderAnnotationRecord extends ReaderAnnotationRecordBase {
  copyState: ReaderAnnotationCopyState & { state: 'project_copy' };
  /**
   * Project-visible annotation copies do not inherit the owner's private note.
   * Add an explicit project-public field in a future contract if shared
   * interpretation text becomes part of the foreground collaboration model.
   */
  note?: never;
  projectId: string;
  visibility: 'project';
}

export type ReaderAnnotationRecord =
  | PrivateReaderAnnotationRecord
  | ProjectReaderAnnotationRecord;

export interface CreateReaderAnnotationRequest {
  libraryEntryId: string;
  locator?: ReaderAnnotationLocator;
  /** Private owner-only annotation note. Not copied into project-visible records. */
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
