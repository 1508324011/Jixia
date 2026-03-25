import type { AiWorkspaceAttachmentView } from '@shared/contracts/ai-workspace';

interface AiContextAttachmentsProps {
  attachments: AiWorkspaceAttachmentView[];
}

export function AiContextAttachments({ attachments }: AiContextAttachmentsProps) {
  return (
    <section className="panel stack-sm" aria-label="AI context attachments">
      <div className="stack-xs">
        <h3 className="panel-title">AI context attachments</h3>
        <p className="quiet-copy">
          Imported paper attachments keep the active AI session anchored to explicit evidence.
        </p>
      </div>

      {attachments.length > 0 ? (
        <div className="panel-grid">
          {attachments.map((attachment) => (
            <article key={attachment.entryId} className="panel stack-xs">
              <h4 className="panel-title">{attachment.title}</h4>
              <p className="quiet-copy">Canonical source</p>
              <p className="quiet-copy">{attachment.canonicalId}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="quiet-copy">No paper attachments are linked to the active AI session yet.</p>
      )}
    </section>
  );
}
