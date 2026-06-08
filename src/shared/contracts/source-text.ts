/**
 * Transport-safe source text artifact contract.
 *
 * The server owns artifact bytes and any derived text/page maps. Browser-facing
 * DTOs expose only artifact identity, availability/degraded state, and bounded
 * locator metadata so exact-first attachment can fail explicitly instead of
 * silently pretending whole-paper text is available.
 */

export type SourceTextArtifactKind =
  | 'extracted_text'
  | 'ocr_text'
  | 'page_map';

export type SourceTextAvailabilityState =
  | 'available'
  | 'pdf_unavailable'
  | 'text_unavailable'
  | 'ocr_required'
  | 'processing'
  | 'failed'
  | 'archived';

export interface SourceTextArtifactRecord {
  availabilityState: SourceTextAvailabilityState;
  characterCount?: number;
  createdAt: string;
  id: string;
  kind: SourceTextArtifactKind;
  language?: string;
  pageCount?: number;
  paperAssetId: string;
  statusDetail?: string;
  textFormat?: string;
  updatedAt: string;
}

export interface SourceTextPageLocator {
  endOffset?: number;
  label?: string;
  pageNumber: number;
  startOffset?: number;
}

export interface SourceTextRangeLocator {
  endOffset: number;
  locator?: string;
  page?: SourceTextPageLocator;
  quote?: string;
  sourceTextArtifactId: string;
  startOffset: number;
}

export interface SourceTextAttachmentState {
  availabilityState: SourceTextAvailabilityState;
  reason?: string;
  sourceTextArtifactId?: string;
}

export const sourceTextContract = 'jixia-source-text-artifact-contract-v1';
