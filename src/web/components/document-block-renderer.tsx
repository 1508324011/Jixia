import type {
  DocumentBlock,
  DocumentBlockDocument,
  DocumentQuoteBlock,
} from "@shared/contracts/document-content";
import { normalizeDocumentBlockDocument } from "@shared/contracts/document-content";

interface DocumentReferenceMetadataValue {
  evidenceSpan?: string;
  libraryEntryId?: string;
  locator?: string;
  paperAssetId?: string;
  readerExcerptId?: string;
}

interface DocumentReferenceMetadataProps {
  emptyLabel?: string;
  reference: DocumentReferenceMetadataValue;
}

export interface DocumentBlockRendererProps {
  emptyState?: string;
  label: string;
  value: DocumentBlockDocument;
}

function hasReferenceMetadata(reference: DocumentReferenceMetadataValue): boolean {
  return Boolean(
    reference.paperAssetId ||
      reference.libraryEntryId ||
      reference.readerExcerptId ||
      reference.locator ||
      reference.evidenceSpan,
  );
}

function referenceMetadataItems(reference: DocumentReferenceMetadataValue) {
  return [
    reference.paperAssetId
      ? { label: "Paper asset", value: reference.paperAssetId }
      : undefined,
    reference.libraryEntryId
      ? { label: "Library entry", value: reference.libraryEntryId }
      : undefined,
    reference.readerExcerptId
      ? { label: "Reader excerpt", value: reference.readerExcerptId }
      : undefined,
    reference.locator ? { label: "Locator", value: reference.locator } : undefined,
    reference.evidenceSpan
      ? { label: "Evidence span", value: reference.evidenceSpan }
      : undefined,
  ].filter(
    (item): item is { label: string; value: string } => Boolean(item),
  );
}

export function DocumentReferenceMetadata({
  emptyLabel = "Reference metadata unavailable.",
  reference,
}: DocumentReferenceMetadataProps) {
  const metadata = referenceMetadataItems(reference);

  if (metadata.length === 0) {
    return <p className="quiet-copy">{emptyLabel}</p>;
  }

  return (
    <dl className="document-block-editor__metadata" aria-label="reference metadata">
      {metadata.map((item) => (
        <div key={`${item.label}:${item.value}`}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DocumentQuoteReferenceMetadata({
  block,
}: {
  block: DocumentQuoteBlock;
}) {
  if (!hasReferenceMetadata(block)) {
    return null;
  }

  return (
    <div className="document-block-editor__readonly-body">
      <DocumentReferenceMetadata reference={block} />
    </div>
  );
}

export function DocumentReadonlyBlockContent({ block }: { block: DocumentBlock }) {
  switch (block.type) {
    case "paragraph":
      return (
        <div className="document-block-editor__readonly-body">
          <p>{block.text || "Empty paragraph block."}</p>
        </div>
      );
    case "heading":
      return (
        <div className="document-block-editor__readonly-body">
          {block.level === 1 ? <h1>{block.text || "Untitled heading"}</h1> : null}
          {block.level === 2 ? <h2>{block.text || "Untitled heading"}</h2> : null}
          {block.level === 3 ? <h3>{block.text || "Untitled heading"}</h3> : null}
        </div>
      );
    case "quote":
      return (
        <div className="document-block-editor__readonly-body">
          <blockquote>{block.text || "Empty quote block."}</blockquote>
          {block.attribution ? (
            <p className="quiet-copy">Attribution · {block.attribution}</p>
          ) : null}
          {hasReferenceMetadata(block) ? (
            <DocumentReferenceMetadata reference={block} />
          ) : null}
        </div>
      );
    case "todo":
      return (
        <div className="document-block-editor__readonly-body">
          <p>
            Todo · {block.checked ? "complete" : "open"} · {block.text || "Untitled todo"}
          </p>
        </div>
      );
    case "citation":
      return (
        <div className="document-block-editor__readonly-body">
          <p>Citation · {block.label ?? block.paperAssetId}</p>
          <DocumentReferenceMetadata reference={block} />
        </div>
      );
    case "sourceExcerpt":
      return (
        <div className="document-block-editor__readonly-body">
          {block.title ? <p>{block.title}</p> : null}
          <blockquote>{block.quote}</blockquote>
          {block.note ? (
            <p className="quiet-copy">Capture note · {block.note}</p>
          ) : null}
          {block.capturedAt ? (
            <p className="quiet-copy">Captured · {block.capturedAt}</p>
          ) : null}
          <DocumentReferenceMetadata reference={block} />
        </div>
      );
    case "paperReference":
      return (
        <div className="document-block-editor__readonly-body">
          <p>Paper reference · {block.title ?? block.paperAssetId}</p>
          <DocumentReferenceMetadata reference={block} />
        </div>
      );
    case "aiSuggestion":
      return (
        <div className="document-block-editor__readonly-body">
          <p>{block.text || "Empty AI suggestion."}</p>
          {block.rationale ? (
            <p className="quiet-copy">Rationale · {block.rationale}</p>
          ) : null}
          {block.targetBlockId ? (
            <p className="quiet-copy">Target block · {block.targetBlockId}</p>
          ) : null}
          <p className="quiet-copy">Status · {block.status}</p>
          {hasReferenceMetadata(block) ? (
            <DocumentReferenceMetadata reference={block} />
          ) : null}
        </div>
      );
  }
}

export function DocumentBlockRenderer({
  emptyState = "No document blocks yet.",
  label,
  value,
}: DocumentBlockRendererProps) {
  const documentContent = normalizeDocumentBlockDocument(value);

  return (
    <section
      className="document-block-editor document-block-renderer"
      aria-label={label}
    >
      <h3 className="document-block-editor__legend">{label}</h3>
      {documentContent.blocks.length === 0 ? (
        <p className="quiet-copy">{emptyState}</p>
      ) : (
        <div className="document-block-editor__blocks">
          {documentContent.blocks.map((block, index) => {
            const blockNumber = index + 1;
            const blockKey = block.id ?? `${block.type}-${index}`;

            return (
              <section
                className="document-block-editor__block"
                key={blockKey}
                aria-label={`${block.type} block ${blockNumber}`}
              >
                <header className="document-block-editor__block-header">
                  <span className="status-badge">{block.type}</span>
                  <span className="quiet-copy">Block {blockNumber}</span>
                </header>
                <DocumentReadonlyBlockContent block={block} />
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
