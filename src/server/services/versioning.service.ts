import type {
  CitationLinkRecord,
  WritingDocSnapshot,
  WritingDocRecord,
} from '@shared/contracts/writing';

import type { PersistedLibraryEntryView } from '../../db';

import type { LibraryService } from './library.service';

export interface StoredDocVersion {
  content: string;
  createdAt: string;
  id: string;
  versionNumber: number;
  writingDocId: string;
}

export interface SaveVersionRequest {
  citations: Array<Pick<CitationLinkRecord, 'evidenceSpan' | 'paperAssetId'>>;
  content: string;
  writingDoc: WritingDocRecord;
  actorSpaceId: string;
  actorUserId: string;
}

export interface VersioningStore {
  citationLinks: CitationLinkRecord[];
  docVersions: StoredDocVersion[];
  libraryService: LibraryService;
  nextId(prefix: string): string;
  persist(): void;
}

export interface VersioningService {
  saveVersion(input: SaveVersionRequest): Promise<WritingDocSnapshot>;
}

function citationMatchesAuthorizedEntry(
  citation: Pick<CitationLinkRecord, 'evidenceSpan' | 'paperAssetId'>,
  view: PersistedLibraryEntryView,
): boolean {
  if (view.asset.id === citation.paperAssetId) {
    return true;
  }

  return view.entry.id === citation.paperAssetId;
}

export function createVersioningService(
  store: VersioningStore,
): VersioningService {
  return {
    async saveVersion(input: SaveVersionRequest): Promise<WritingDocSnapshot> {
      for (const citation of input.citations) {
        const authorizedEntry = await store.libraryService
          .assertCanAccessEntry(
            citation.paperAssetId,
            input.actorUserId,
            input.actorSpaceId,
          )
          .catch((error) => {
            if (
              error instanceof Error &&
              new RegExp(
                `^Library entry ${citation.paperAssetId} does not exist\\.$`,
              ).test(error.message)
            ) {
              return store.libraryService.assertCanAccessPaperAsset(
                citation.paperAssetId,
                input.actorUserId,
                input.actorSpaceId,
              );
            }

            throw error;
          });

        if (!citationMatchesAuthorizedEntry(citation, authorizedEntry)) {
          throw new Error(
            `Citation ${citation.paperAssetId} does not match an authorized library entry.`,
          );
        }
      }

      const priorVersions = store.docVersions.filter(
        (version) => version.writingDocId === input.writingDoc.id,
      );
      const versionNumber = priorVersions.length + 1;
      const createdAt = new Date().toISOString();
      const docVersion: StoredDocVersion = {
        content: input.content,
        createdAt,
        id: store.nextId('doc-version'),
        versionNumber,
        writingDocId: input.writingDoc.id,
      };
      const citations = input.citations.map((citation) => ({
        docVersionId: docVersion.id,
        evidenceSpan: citation.evidenceSpan,
        id: store.nextId('citation'),
        paperAssetId: citation.paperAssetId,
      }));

      store.docVersions.push(docVersion);
      store.citationLinks.push(...citations);
      store.persist();

      return {
        capturedAt: createdAt,
        citations,
        content: input.content,
        doc: input.writingDoc,
        docVersionId: docVersion.id,
      };
    },
  };
}
