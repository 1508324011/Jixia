import type {
  CitationLinkRecord,
  WritingDocSnapshot,
  WritingDocRecord,
} from '@shared/contracts/writing';

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
}

export interface VersioningStore {
  citationLinks: CitationLinkRecord[];
  docVersions: StoredDocVersion[];
  nextId(prefix: string): string;
}

export interface VersioningService {
  saveVersion(input: SaveVersionRequest): Promise<WritingDocSnapshot>;
}

export function createVersioningService(
  store: VersioningStore,
): VersioningService {
  return {
    async saveVersion(input: SaveVersionRequest): Promise<WritingDocSnapshot> {
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
