import type {
  DiscoverySearchRequest,
  TodayRecommendation,
} from '@shared/contracts/discovery';

import type {
  ImportDiscoveryCandidateRequest,
  ImportedLibraryRecord,
  ImportedDiscoveryCandidateRecord,
  ImportPaperRequest,
  ImportToPersonalLibraryRequest,
  ImportService,
  UploadPdfRequest,
} from '../services/import.service';
import type { PaginatedDiscoverySearchResult } from '../services/discovery.service';

export interface ImportRoutes {
  importDiscoveryCandidate(
    input: ImportDiscoveryCandidateRequest,
  ): Promise<ImportedDiscoveryCandidateRecord>;
  importToPersonalLibrary(
    input: ImportToPersonalLibraryRequest,
  ): Promise<ImportedLibraryRecord>;
  importPaper(input: ImportPaperRequest): Promise<ImportedLibraryRecord>;
  listTodayDiscovery(): Promise<TodayRecommendation[]>;
  searchDiscovery(query: string): Promise<TodayRecommendation[]>;
  searchDiscoveryPage(
    input: DiscoverySearchRequest,
  ): Promise<PaginatedDiscoverySearchResult>;
  uploadPdf(input: UploadPdfRequest): Promise<ImportedLibraryRecord>;
}

export function createImportRoutes(service: ImportService): ImportRoutes {
  return {
    importDiscoveryCandidate(
      input: ImportDiscoveryCandidateRequest,
    ): Promise<ImportedDiscoveryCandidateRecord> {
      return service.importDiscoveryCandidate(input);
    },
    importToPersonalLibrary(
      input: ImportToPersonalLibraryRequest,
    ): Promise<ImportedLibraryRecord> {
      return service.importToPersonalLibrary(input);
    },
    importPaper(input: ImportPaperRequest): Promise<ImportedLibraryRecord> {
      return service.importPaper(input);
    },
    listTodayDiscovery(): Promise<TodayRecommendation[]> {
      return service.listTodayDiscovery();
    },
    searchDiscovery(query: string): Promise<TodayRecommendation[]> {
      return service.searchDiscovery(query);
    },
    searchDiscoveryPage(
      input: DiscoverySearchRequest,
    ): Promise<PaginatedDiscoverySearchResult> {
      return service.searchDiscoveryPage(input);
    },
    uploadPdf(input: UploadPdfRequest): Promise<ImportedLibraryRecord> {
      return service.uploadPdf(input);
    },
  };
}
