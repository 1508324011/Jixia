import type { WritingDocumentView } from '@shared/contracts/writing';

interface ProjectDocumentTreeProps {
  document: WritingDocumentView | null;
  projectId: string;
}

export function ProjectDocumentTree({ document, projectId }: ProjectDocumentTreeProps) {
  const references = document?.references ?? [];

  return (
    <section className="panel" aria-label="project document tree">
      <p className="page-kicker">Project-owned structure</p>
      <h2 className="panel-title">Document tree</h2>
      <p className="quiet-copy">
        Project docs stay shared under {projectId}. References and publish state are reviewed here,
        not inside Reader.
      </p>

      {document ? (
        <div className="stack-sm">
          <div className="recent-opened-panel__meta">
            <span className="status-badge">active doc</span>
            <strong>{document.title}</strong>
          </div>
          <p className="quiet-copy">State · {document.publishState}</p>
          <p className="quiet-copy">
            Citations · {document.latestSnapshot?.citations.length ?? 0}
          </p>
          <div className="stack-xs">
            <h3 className="panel-title">Reference rail</h3>
            {references.length > 0 ? (
              references.map((reference) => (
                <div key={reference.id} className="stack-xs">
                  <span className="status-badge">{reference.sourceType}</span>
                  <p className="quiet-copy">{reference.selectedText}</p>
                </div>
              ))
            ) : (
              <p className="quiet-copy">No projected references yet.</p>
            )}
          </div>
        </div>
      ) : (
        <p className="quiet-copy">No shared project document has been saved yet.</p>
      )}
    </section>
  );
}
