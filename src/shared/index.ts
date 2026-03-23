export const sharedEntrypoint = 'jixia-shared-entry';

export type {
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
  WritingDocumentResponse,
  WritingDocumentView,
} from './contracts/writing';
export { writingContract } from './contracts/writing';
