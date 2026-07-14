import type {
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  ReactNode
} from "react";

import { localeCatalog, type Locale } from "../i18n/locale";
type WorkbenchSurfaceProps = HTMLAttributes<HTMLElement> & {
  readonly children: ReactNode;
  readonly width?: "normal" | "wide" | "full";
};

export function WorkbenchSurface({ children, className, width = "normal", ...props }: WorkbenchSurfaceProps) {
  return (
    <section className={classNames("jixia-workbench-surface", `jixia-workbench-surface--${width}`, className)} {...props}>
      {children}
    </section>
  );
}

type WorkspaceFrameProps = HTMLAttributes<HTMLElement> & {
  readonly children: ReactNode;
};

export function WorkspaceFrame({ children, className, ...props }: WorkspaceFrameProps) {
  return (
    <section className={classNames("jixia-workspace-frame", className)} {...props}>
      {children}
    </section>
  );
}

type WorkspaceMainSplitProps = HTMLAttributes<HTMLDivElement> & {
  readonly children: ReactNode;
};

export function WorkspaceMainSplit({ children, className, ...props }: WorkspaceMainSplitProps) {
  return (
    <div className={classNames("jixia-workspace-main-split", className)} {...props}>
      {children}
    </div>
  );
}

type ArtifactCanvasProps = HTMLAttributes<HTMLElement> & {
  readonly children: ReactNode;
};

export function ArtifactCanvas({ children, className, ...props }: ArtifactCanvasProps) {
  return (
    <section className={classNames("jixia-artifact-canvas", className)} {...props}>
      {children}
    </section>
  );
}

type InspectorProps = HTMLAttributes<HTMLElement> & {
  readonly activeMode?: "copilot" | "metadata" | "versions" | "attachments";
  readonly children: ReactNode;
  readonly locale?: Locale;
};

const inspectorModes = ["copilot", "metadata", "versions", "attachments"] as const;

export function Inspector({ activeMode = "copilot", children, className, locale = "en", ...props }: InspectorProps) {
  const copy = localeCatalog(locale).inspector;

  return (
    <aside className={classNames("jixia-inspector", className)} {...props}>
      <nav aria-label={copy.modes} className="jixia-inspector__tabs">
        {inspectorModes.map((mode) => (
          <button
            aria-current={activeMode === mode ? "page" : undefined}
            className="jixia-inspector__tab"
            disabled={mode !== activeMode}
            key={mode}
            type="button"
          >
            {copy[mode]}
          </button>
        ))}
      </nav>
      <div className="jixia-inspector__content">{children}</div>
    </aside>
  );
}

type SurfaceHeaderProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  readonly actions?: ReactNode;
  readonly breadcrumbs?: ReactNode;
  readonly description?: ReactNode;
  readonly eyebrow?: string;
  readonly meta?: ReactNode;
  readonly title: ReactNode;
  readonly titleId?: string;
};

export function SurfaceHeader({
  actions,
  breadcrumbs,
  className,
  description,
  eyebrow,
  meta,
  title,
  titleId,
  ...props
}: SurfaceHeaderProps) {
  return (
    <header className={classNames("jixia-surface-header", className)} {...props}>
      {breadcrumbs ? <div className="jixia-surface-header__breadcrumbs">{breadcrumbs}</div> : null}
      <div className="jixia-surface-header__topline">
        <div>
          {eyebrow ? <p className="jixia-eyebrow">{eyebrow}</p> : null}
          <h1 id={titleId}>{title}</h1>
          {description ? <p className="jixia-description">{description}</p> : null}
        </div>
        {actions ? <div className="jixia-list-row__actions">{actions}</div> : null}
      </div>
      {meta ? <div>{meta}</div> : null}
    </header>
  );
}

type ToolbarProps = HTMLAttributes<HTMLDivElement> & {
  readonly children: ReactNode;
  readonly muted?: boolean;
};

export function Toolbar({ children, className, muted = false, ...props }: ToolbarProps) {
  return (
    <div className={classNames("jixia-toolbar", muted ? "jixia-toolbar--muted" : undefined, className)} {...props}>
      {children}
    </div>
  );
}

type PaneProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly eyebrow?: string;
  readonly flush?: boolean;
  readonly muted?: boolean;
  readonly title?: ReactNode;
  readonly titleId?: string;
};

export function Pane({
  actions,
  children,
  className,
  eyebrow,
  flush = false,
  muted = false,
  title,
  titleId,
  ...props
}: PaneProps) {
  return (
    <section
      className={classNames(
        "jixia-pane",
        muted ? "jixia-pane--muted" : undefined,
        flush ? "jixia-pane--flush" : undefined,
        className
      )}
      {...props}
    >
      {title || eyebrow || actions ? (
        <div className="jixia-pane__header">
          <div>
            {eyebrow ? <p className="jixia-eyebrow">{eyebrow}</p> : null}
            {title ? <h2 id={titleId}>{title}</h2> : null}
          </div>
          {actions ? <div className="jixia-list-row__actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

type PanelProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly eyebrow?: string;
  readonly flush?: boolean;
  readonly muted?: boolean;
  readonly title?: ReactNode;
  readonly titleId?: string;
};

export function Panel({
  actions,
  children,
  className,
  eyebrow,
  flush = false,
  muted = false,
  title,
  titleId,
  ...props
}: PanelProps) {
  return (
    <section
      className={classNames(
        "jixia-panel",
        muted ? "jixia-panel--muted" : undefined,
        flush ? "jixia-panel--flush" : undefined,
        className
      )}
      {...props}
    >
      {title || eyebrow || actions ? (
        <div className="jixia-panel__header">
          <div>
            {eyebrow ? <p className="jixia-eyebrow">{eyebrow}</p> : null}
            {title ? <h2 id={titleId}>{title}</h2> : null}
          </div>
          {actions ? <div className="jixia-list-row__actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

type SplitPaneProps = HTMLAttributes<HTMLDivElement> & {
  readonly children: ReactNode;
  readonly reverse?: boolean;
  readonly sideWidth?: string;
};

export function SplitPane({ children, className, reverse = false, sideWidth = "380px", style, ...props }: SplitPaneProps) {
  const splitStyle: CSSProperties = {
    ...style,
    "--jixia-side-width": sideWidth
  } as CSSProperties;

  return (
    <div className={classNames("jixia-split-pane", reverse ? "jixia-split-pane--reverse" : undefined, className)} style={splitStyle} {...props}>
      {children}
    </div>
  );
}

type ListRowProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  readonly actions?: ReactNode;
  readonly description?: ReactNode;
  readonly meta?: ReactNode;
  readonly onOpen?: () => void;
  readonly selected?: boolean;
  readonly title: ReactNode;
};

export function ListRow({ actions, className, description, meta, onOpen, selected = false, title, ...props }: ListRowProps) {
  const content = (
    <>
      <span className="jixia-list-row__title">{title}</span>
      {meta ? <span className="jixia-list-row__meta">{meta}</span> : null}
      {description ? <span className="jixia-list-row__description">{description}</span> : null}
    </>
  );

  return (
    <article className={classNames("jixia-list-row", selected ? "jixia-list-row--selected" : undefined, className)} {...props}>
      <div className="jixia-list-row__main">
        {onOpen ? (
          <button className="jixia-list-row__button" onClick={onOpen} type="button">
            {content}
          </button>
        ) : (
          <div className="jixia-list-row__button">{content}</div>
        )}
      </div>
      {actions ? <div className="jixia-list-row__actions">{actions}</div> : null}
    </article>
  );
}

type MetaGridItem = {
  readonly label: ReactNode;
  readonly value: ReactNode;
};

type MetaGridProps = HTMLAttributes<HTMLDListElement> & {
  readonly items: readonly MetaGridItem[];
};

export function MetaGrid({ className, items, ...props }: MetaGridProps) {
  return (
    <dl className={classNames("jixia-meta-grid", className)} {...props}>
      {items.map((item, index) => (
        <div className="jixia-meta-grid__item" key={metaGridKey(item, index)}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

type FieldProps = LabelHTMLAttributes<HTMLLabelElement> & {
  readonly children: ReactNode;
  readonly hint?: ReactNode;
  readonly label: ReactNode;
};

export function Field({ children, className, hint, label, ...props }: FieldProps) {
  return (
    <label className={classNames("jixia-field", className)} {...props}>
      <span>{label}</span>
      {children}
      {hint ? <span className="jixia-field__hint">{hint}</span> : null}
    </label>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: "primary" | "secondary" | "danger" | "ghost" | "link";
};

export function Button({ children, className, variant = "secondary", ...props }: ButtonProps) {
  return (
    <button className={classNames("jixia-button", `jixia-button--${variant}`, className)} type="button" {...props}>
      {children}
    </button>
  );
}

type PillProps = HTMLAttributes<HTMLSpanElement> & {
  readonly children: ReactNode;
  readonly tone?: "neutral" | "accent" | "success" | "warning" | "danger";
};

export function Pill({ children, className, tone = "neutral", ...props }: PillProps) {
  return (
    <span className={classNames("jixia-pill", tone === "neutral" ? undefined : `jixia-pill--${tone}`, className)} {...props}>
      {children}
    </span>
  );
}

type NoticeProps = HTMLAttributes<HTMLParagraphElement> & {
  readonly children: ReactNode;
  readonly tone?: "info" | "success" | "warning" | "danger";
};

export function Notice({ children, className, tone = "info", ...props }: NoticeProps) {
  return (
    <p className={classNames("jixia-notice", tone === "info" ? undefined : `jixia-notice--${tone}`, className)} {...props}>
      {children}
    </p>
  );
}

type EmptyStateProps = Omit<HTMLAttributes<HTMLElement>, "title"> & {
  readonly actions?: ReactNode;
  readonly description?: ReactNode;
  readonly title: ReactNode;
  readonly titleId?: string;
};

export function EmptyState({ actions, className, description, title, titleId, ...props }: EmptyStateProps) {
  return (
    <section className={classNames("jixia-empty-state", className)} {...props}>
      <h2 id={titleId}>{title}</h2>
      {description ? <p>{description}</p> : null}
      {actions ? <div className="jixia-list-row__actions">{actions}</div> : null}
    </section>
  );
}

type StatusStripProps = HTMLAttributes<HTMLDivElement> & {
  readonly children?: ReactNode;
  readonly items?: readonly ReactNode[];
};

export function StatusStrip({ children, className, items, ...props }: StatusStripProps) {
  return (
    <div className={classNames("jixia-status-strip", className)} role="status" {...props}>
      {items?.map((item, index) => <span key={statusItemKey(item, index)}>{item}</span>)}
      {children}
    </div>
  );
}

export type WorkbenchControlProps = InputHTMLAttributes<HTMLInputElement>;

function classNames(...names: readonly (string | undefined)[]): string {
  return names.filter((name): name is string => Boolean(name)).join(" ");
}

function metaGridKey(item: MetaGridItem, index: number): string {
  return `${String(item.label)}-${index}`;
}

function statusItemKey(item: ReactNode, index: number): string {
  return `${String(item)}-${index}`;
}
