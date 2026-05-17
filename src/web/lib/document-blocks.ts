import type { DocumentBlockDocument } from "@shared/contracts/document-content";
import {
  createEmptyDocumentBlockDocument,
  documentBlockDocumentToLegacyText,
  legacyTextToDocumentBlockDocument,
  normalizeDocumentBlockDocument,
} from "@shared/contracts/document-content";

interface SnapshotDocumentContentSource {
  content?: string;
  documentContent?: DocumentBlockDocument | null;
}

export function createEditableDocumentContent(
  source?: SnapshotDocumentContentSource | null,
): DocumentBlockDocument {
  if (!source) {
    return createEmptyDocumentBlockDocument();
  }

  if (source.documentContent) {
    try {
      return normalizeDocumentBlockDocument(source.documentContent);
    } catch {
      // A malformed structured payload must not become editor-runtime JSON.
      // Fall back to the server's deterministic legacy text projection instead.
    }
  }

  return legacyTextToDocumentBlockDocument(source.content ?? "");
}

export function createLegacyTextProjection(
  documentContent: DocumentBlockDocument,
): string {
  return documentBlockDocumentToLegacyText(
    normalizeDocumentBlockDocument(documentContent),
  );
}
