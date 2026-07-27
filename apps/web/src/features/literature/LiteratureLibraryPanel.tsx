import type { LiteratureSummaryDTO } from "@jixia/shared";
import { useEffect, useMemo, useState } from "react";

import type { Locale } from "../i18n/locale";
import { Button, EmptyState, ListRow, Notice, Panel, Pill, SplitPane, StatusStrip } from "../layout/workbench";
import { LiteratureDetailPane } from "./LiteratureDetailPane";
import { literatureLibraryCopy } from "./literature-library.copy";
import { literatureScopeKey, type LiteratureLibraryScope, useLiteratureLibrary } from "./useLiteratureLibrary";
import "./literature.css";

export type LiteratureLibraryPanelProps = LiteratureLibraryScope & {
  readonly initialLiteratureId?: string;
  readonly limit?: number;
  readonly locale?: Locale;
};

type LiteratureSelection = {
  readonly literatureId: string;
  readonly scopeKey: string;
};

const defaultLimit = 25;

export function LiteratureLibraryPanel(props: LiteratureLibraryPanelProps) {
  const { initialLiteratureId, limit = defaultLimit, locale = "en" } = props;
  const projectId = projectIdForScope(props);
  const source = useMemo(() => scopeSource(props), [projectId, props.scope]);
  const scopeKey = literatureScopeKey(source);
  const copy = literatureLibraryCopy(locale);
  const library = useLiteratureLibrary({ errorFallback: copy.libraryErrorFallback, limit, source });
  const [selection, setSelection] = useState<LiteratureSelection | null>(() => initialSelection(initialLiteratureId, scopeKey));
  useEffect(() => {
    setSelection(initialSelection(initialLiteratureId, scopeKey));
  }, [initialLiteratureId, scopeKey]);
  const selectedLiteratureId = selection?.scopeKey === scopeKey ? selection.literatureId : null;
  const libraryTitle = source.scope === "personal" ? copy.personalLibrary : copy.projectLibrary;
  const emptyTitle = source.scope === "personal" ? copy.emptyPersonal : copy.emptyProject;

  return (
    <section aria-label={libraryTitle} className="jixia-literature-library">
      <StatusStrip items={[source.scope === "personal" ? copy.scopePersonal : copy.scopeProject, `${library.literature.length}`]} />
      <SplitPane className="jixia-literature-library__split" sideWidth="380px">
        <Panel title={libraryTitle}>
          <LibraryList
            copy={copy}
            emptyTitle={emptyTitle}
            library={library}
            listTestId={source.scope === "personal" ? "personal-library-list" : "project-library-list"}
            onSelect={(literatureId) => setSelection({ literatureId, scopeKey })}
            selectedLiteratureId={selectedLiteratureId}
          />
        </Panel>
        <section aria-label={selectedLiteratureId === null ? copy.selectLiterature : copy.literatureDetails} className="jixia-literature-library__detail">
          <h2 className="jixia-literature-library__detail-title">{copy.literatureDetails}</h2>
          <LiteratureDetailPane copy={copy} literatureId={selectedLiteratureId} scopeKey={scopeKey} />
        </section>
      </SplitPane>
    </section>
  );
}

function LibraryList({
  copy,
  emptyTitle,
  library,
  listTestId,
  onSelect,
  selectedLiteratureId
}: {
  readonly copy: ReturnType<typeof literatureLibraryCopy>;
  readonly emptyTitle: string;
  readonly library: ReturnType<typeof useLiteratureLibrary>;
  readonly listTestId: "personal-library-list" | "project-library-list";
  readonly onSelect: (literatureId: string) => void;
  readonly selectedLiteratureId: string | null;
}) {
  if (library.state === "loading") return <StatusStrip>{copy.listLoading}</StatusStrip>;
  if (library.state === "error") {
    return (
      <Notice role="alert" tone="danger">
        {library.error ?? copy.libraryErrorFallback} <Button onClick={library.reload} variant="link">{copy.retryLibrary}</Button>
      </Notice>
    );
  }
  if (library.literature.length === 0) {
    return <EmptyState description={copy.selectLiteratureDescription} title={emptyTitle} />;
  }

  return (
    <div className="jixia-literature-library__list" data-testid={listTestId}>
      {library.literature.map((literature) => (
        <ListRow
           actions={<LiteratureRowMeta copy={copy} literature={literature} />}
          key={literature.id}
          onOpen={() => onSelect(literature.id)}
          selected={selectedLiteratureId === literature.id}
          title={literature.title ?? copy.untitled}
        />
      ))}
      {library.hasMore ? <Button disabled={library.isLoadingMore} onClick={library.loadMore}>{library.isLoadingMore ? copy.loadingMore : copy.loadMore}</Button> : null}
      {library.error && library.state === "ready" ? <Notice role="alert" tone="danger">{library.error}</Notice> : null}
    </div>
  );
}

function LiteratureRowMeta({ copy, literature }: { readonly copy: ReturnType<typeof literatureLibraryCopy>; readonly literature: LiteratureSummaryDTO }) {
  const metadata = [
    literature.authors.map((author) => author.displayName).join(", "),
    literature.publicationYear ? String(literature.publicationYear) : null,
    literature.venue
  ].filter((value): value is string => Boolean(value)).join(" · ");

  return (
    <div className="jixia-literature-library__row-meta">
      {metadata ? <span>{metadata}</span> : null}
      {literature.conflictKinds.length > 0 ? <Pill tone="warning">{copy.conflictCount(literature.conflictKinds.length)}</Pill> : null}
    </div>
  );
}

function initialSelection(initialLiteratureId: string | undefined, scopeKey: string): LiteratureSelection | null {
  return initialLiteratureId === undefined ? null : { literatureId: initialLiteratureId, scopeKey };
}

function scopeSource(props: LiteratureLibraryPanelProps): LiteratureLibraryScope {
  switch (props.scope) {
    case "personal":
      return { scope: "personal" };
    case "project":
      return { scope: "project", projectId: props.projectId };
  }
}

function projectIdForScope(props: LiteratureLibraryPanelProps): string {
  switch (props.scope) {
    case "personal":
      return "";
    case "project":
      return props.projectId;
  }
}
