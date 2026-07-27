import type { LiteratureImportWarningCode, LiteratureTargetScope } from "@jixia/shared";

import type { Locale } from "../i18n/locale";
import { Notice, SurfaceHeader, WorkbenchSurface } from "../layout/workbench";
import { LiteratureLibraryPanel } from "./LiteratureLibraryPanel";
import { literatureLibraryCopy } from "./literature-library.copy";
import { LiteratureSearchPage } from "./LiteratureSearchPage";
import type { LiteratureLibraryScope } from "./useLiteratureLibrary";

type LiteratureRouteSurfaceProps = {
  readonly initialLiteratureId?: string;
  readonly importWarnings?: readonly LiteratureImportWarningCode[];
  readonly locale: Locale;
  readonly onOpenLiterature: (
    literatureId: string,
    target: LiteratureTargetScope,
    warnings?: readonly LiteratureImportWarningCode[]
  ) => void;
  readonly surface: "search" | "library";
  readonly target?: LiteratureTargetScope;
};

export function LiteratureRouteSurface({
  initialLiteratureId,
  importWarnings,
  locale,
  onOpenLiterature,
  surface,
  target
}: LiteratureRouteSurfaceProps) {
  if (surface === "search") {
    return <LiteratureSearchPage locale={locale} onOpenLiterature={onOpenLiterature} />;
  }

  const copy = literatureLibraryCopy(locale);
  const scope: LiteratureLibraryScope = target ?? { scope: "personal" };
  const isProject = scope.scope === "project";
  const titleId = isProject ? "project-literature-title" : "personal-literature-title";
  const initialSelection = initialLiteratureId === undefined ? {} : { initialLiteratureId };

  return (
    <WorkbenchSurface aria-labelledby={titleId} width="wide">
      <SurfaceHeader
        description={copy.selectLiteratureDescription}
        eyebrow={isProject ? copy.scopeProject : copy.scopePersonal}
        title={isProject ? copy.projectLibrary : copy.personalLibrary}
        titleId={titleId}
      />
      {importWarnings === undefined || importWarnings.length === 0 ? null : (
        <Notice aria-label={copy.importCompletedWithWarnings} role="status" tone="warning">
          {copy.importCompletedWithWarnings}: {importWarnings.map(copy.importWarning).join("; ")}
        </Notice>
      )}
      <LiteratureLibraryPanel locale={locale} {...scope} {...initialSelection} />
    </WorkbenchSurface>
  );
}
