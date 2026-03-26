import type { AiWorkspaceAttachmentView } from '@shared/contracts/ai-workspace';

interface AiContextAttachmentsProps {
  attachments: AiWorkspaceAttachmentView[];
  variant?: 'default' | 'docked';
}

export function AiContextAttachments({ attachments, variant = 'default' }: AiContextAttachmentsProps) {
  const rootClassName =
    variant === 'docked' ? 'ai-context-attachments ai-context-attachments--docked stack-sm' : 'panel stack-sm';
  const gridClassName = variant === 'docked' ? 'ai-context-attachments__grid' : 'panel-grid';
  const itemClassName =
    variant === 'docked' ? 'ai-context-attachments__item ai-context-attachments__item--docked stack-xs' : 'panel stack-xs';

  return (
    <section className={rootClassName} aria-label="AI context attachments">
      <div className="stack-xs">
        <h3 className="panel-title">AI context attachments</h3>
        <p className="quiet-copy">
          Imported paper attachments keep the active AI session anchored to explicit evidence.
        </p>
      </div>

      {attachments.length > 0 ? (
        <div className={gridClassName}>
          {attachments.map((attachment) => (
            <article key={attachment.entryId} className={itemClassName}>
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
