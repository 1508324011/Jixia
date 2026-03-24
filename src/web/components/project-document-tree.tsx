import type { WritingDocumentView } from '@shared/contracts/writing';

interface ProjectDocumentTreeProps {
  document: WritingDocumentView | null;
  projectId: string;
}

export function ProjectDocumentTree({ document, projectId }: ProjectDocumentTreeProps) {
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
        </div>
      ) : (
        <p className="quiet-copy">No shared project document has been saved yet.</p>
      )}
    </section>
  );
}
