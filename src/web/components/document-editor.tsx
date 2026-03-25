import type { ReactNode } from 'react';

interface DocumentEditorProps {
  actions?: ReactNode;
  description?: string;
  label: string;
  lastSavedLabel?: string;
  onChange: (value: string) => void;
  rows?: number;
  textareaId: string;
  title: string;
  value: string;
}

export function DocumentEditor({
  actions,
  description,
  label,
  lastSavedLabel,
  onChange,
  rows = 12,
  textareaId,
  title,
  value,
}: DocumentEditorProps) {
  return (
    <div className="stack-sm" data-testid="document-editor">
      <h2 className="panel-title">{title}</h2>
      {lastSavedLabel ? <p className="quiet-copy">{lastSavedLabel}</p> : null}
      {description ? <p className="quiet-copy">{description}</p> : null}
      <label className="quiet-copy" htmlFor={textareaId}>
        {label}
      </label>
      <textarea
        id={textareaId}
        className="draft-editor"
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {actions ? <div className="button-row">{actions}</div> : null}
    </div>
  );
}
