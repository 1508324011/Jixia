import type {
  ReadingDocumentSectionView,
  ReadingDocumentView,
  ReadingRetrievalStateView,
} from '@shared/contracts/reading';

interface ReaderDocumentCanvasProps {
  canonicalId: string;
  document: ReadingDocumentView;
  retrieval: ReadingRetrievalStateView;
}

function splitSectionBody(body: string): string[] {
  return body
    .split(/\n\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

function ReaderDocumentSection({
  documentTitle,
  section,
}: {
  documentTitle: string;
  section: ReadingDocumentSectionView;
}) {
  const paragraphs = splitSectionBody(section.body).filter(
    (paragraph, index) => !(index === 0 && paragraph === documentTitle),
  );

  return (
    <section className="reader-document-canvas__section" aria-labelledby={section.id}>
      <div className="reader-document-canvas__section-header stack-xs">
        <span className="reader-document-canvas__section-rule" aria-hidden="true" />
        <h3 id={section.id} className="reader-document-canvas__section-title">
          {section.title}
        </h3>
      </div>

      <div className="reader-document-canvas__section-body stack-sm">
        {paragraphs.map((paragraph, index) => (
          <p key={`${section.id}-${index}`} className="reader-document-canvas__paragraph">
            {paragraph}
          </p>
        ))}
      </div>
    </section>
  );
}

export function ReaderDocumentCanvas({ canonicalId, document, retrieval }: ReaderDocumentCanvasProps) {
  return (
    <section
      aria-label="Reader document canvas"
      className="reader-document-canvas"
      data-testid="reader-document-canvas"
    >
      <header className="reader-document-canvas__header">
        <p className="reader-document-canvas__eyebrow">Document surface</p>
        <h2 className="reader-document-canvas__title">{`${document.title}\u200B`}</h2>
        <div className="reader-document-canvas__meta" aria-label="Reader document metadata">
          <span>Canonical source · {canonicalId}</span>
          <span>{retrieval.summary}</span>
        </div>
      </header>

      <div className="reader-document-canvas__sections">
        {document.sections.map((section) => (
          <ReaderDocumentSection key={section.id} documentTitle={document.title} section={section} />
        ))}
      </div>
    </section>
  );
}
