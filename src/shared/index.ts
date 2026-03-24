export const sharedEntrypoint = 'jixia-shared-entry';

export type {
  DiscoveryBoard,
  DiscoveryItemState,
  DiscoverySearchResponse,
  DiscoveryTodayResponse,
  TodayRecommendation,
} from './contracts/discovery';
export { discoveryContract } from './contracts/discovery';
export type {
  DefaultImportTarget,
  UpdateWorkbenchSettingsRequest,
  WorkbenchSettingsResponse,
} from './contracts/settings';
export { settingsContract } from './contracts/settings';
export type {
  ReadingDetailView,
  ReadingInsightResponse,
  ReadingNoteResponse,
} from './contracts/reading';
export { readingContract } from './contracts/reading';
export type {
  ImportMappingRecord,
  LibraryEntryRecord,
  LibraryEntryVisibility,
} from './contracts/library';
export { libraryContract } from './contracts/library';
export type {
  ProjectDocumentPresenceRecord,
  ProjectReferenceRecord,
  ProjectReferenceSourceType,
  WritingDocumentResponse,
  WritingDocumentView,
} from './contracts/writing';
export { writingContract } from './contracts/writing';
export type { EvidenceCardRecord, EvidenceScope } from './contracts/evidence';
export { evidenceContract } from './contracts/evidence';
export type {
  NotebookNoteRecord,
  NotebookQuestionRecord,
  NotebookRecord,
} from './contracts/notebook';
export { notebookContract } from './contracts/notebook';
