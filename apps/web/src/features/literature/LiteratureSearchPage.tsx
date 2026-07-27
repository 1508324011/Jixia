import type {
  LiteratureDiscoveryCandidateDTO,
  LiteratureImportWarningCode,
  LiteratureTargetScope,
  ProjectDTO
} from "@jixia/shared";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";

import { apiFetch } from "../../lib/api";
import type { Locale } from "../i18n/locale";
import { Button, Field, Notice, SplitPane, SurfaceHeader, WorkbenchSurface } from "../layout/workbench";
import { LiteratureImportPanel } from "./LiteratureImportPanel";
import { literatureSearchCopy } from "./literature-search.copy";
import { LiteratureSearchResults } from "./LiteratureSearchResults";
import { useLiteratureImport } from "./useLiteratureImport";
import { useLiteratureSearch } from "./useLiteratureSearch";

import "./literature-search.css";

type LiteratureSearchPageProps = {
  readonly locale?: Locale;
  readonly onOpenLiterature: (
    literatureId: string,
    target: LiteratureTargetScope,
    warnings?: readonly LiteratureImportWarningCode[]
  ) => void;
};

type ProjectState = "idle" | "loading" | "ready" | "error";

export function LiteratureSearchPage({ locale = "en", onOpenLiterature }: LiteratureSearchPageProps) {
  const copy = literatureSearchCopy(locale);
  const { search, state: searchState } = useLiteratureSearch({ unavailableMessage: copy.searchUnavailable });
  const { reset: resetImport, retry, start, state: importState } = useLiteratureImport({
    messages: {
      importUnavailable: copy.importUnavailable,
      progressUnavailable: copy.progressUnavailable,
      retryUnavailable: copy.retryUnavailable
    },
    onSucceeded: onOpenLiterature
  });
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [selectedCandidate, setSelectedCandidate] = useState<LiteratureDiscoveryCandidateDTO | null>(null);
  const [target, setTarget] = useState<LiteratureTargetScope>({ scope: "personal" });
  const [projects, setProjects] = useState<readonly ProjectDTO[]>([]);
  const [projectState, setProjectState] = useState<ProjectState>("idle");
  const [projectRequestVersion, setProjectRequestVersion] = useState(0);

  useEffect(() => {
    if (target.scope !== "project") return;
    const controller = new AbortController();
    setProjectState("loading");
    void apiFetch<{ readonly projects: readonly ProjectDTO[] }>("/projects", { signal: controller.signal }).then((response) => {
      if (!controller.signal.aborted) {
        setProjects(response.projects);
        setProjectState("ready");
      }
    }).catch(() => {
      if (!controller.signal.aborted) {
        setProjects([]);
        setProjectState("error");
      }
    });
    return () => controller.abort();
  }, [projectRequestVersion, target.scope]);

  function submitSearch(): void {
    const nextQuery = query.trim();
    if (!nextQuery) return;
    setSubmittedQuery(nextQuery);
    setSelectedCandidate(null);
    resetImport();
    void search(nextQuery);
  }

  function selectCandidate(candidate: LiteratureDiscoveryCandidateDTO): void {
    setSelectedCandidate(candidate);
    resetImport();
  }

  function updateScope(scope: "personal" | "project"): void {
    resetImport();
    setTarget(scope === "personal" ? { scope } : { scope, projectId: "" });
  }

  function updateProject(projectId: string): void {
    resetImport();
    setTarget({ scope: "project", projectId });
  }

  function importSelected(): void {
    const source = selectedCandidate?.sourceMatches[0];
    if (!source || (target.scope === "project" && !target.projectId)) return;
    void start(target, { providerKey: source.providerKey, recordKey: source.recordKey });
  }

  const response = searchState.response;
  return (
    <WorkbenchSurface aria-labelledby="literature-search-title" className="literature-search" width="wide">
      <SurfaceHeader description={copy.description} eyebrow={copy.eyebrow} title={copy.title} titleId="literature-search-title" />
      <form className="literature-search__form" onSubmit={(event) => { event.preventDefault(); submitSearch(); }}>
        <Field hint={copy.questionHint} label={copy.question}><input data-testid="literature-search-query" onChange={(event) => setQuery(event.target.value)} value={query} /></Field>
        <Button data-testid="literature-search-submit" disabled={searchState.status === "loading"} type="submit" variant="primary"><Search aria-hidden="true" size={16} /> {copy.search}</Button>
      </form>
      {searchState.status === "error" && searchState.error ? <Notice role="alert" tone="danger">{searchState.error}</Notice> : null}
      <SplitPane sideWidth="360px">
        <LiteratureSearchResults candidates={response?.candidates ?? []} copy={copy} hasNextPage={response?.nextCursor !== null && response?.nextCursor !== undefined} isLoading={searchState.status === "loading"} onNextPage={() => response?.nextCursor && void search(submittedQuery, response.nextCursor)} onSelect={selectCandidate} providerStatuses={response?.providerStatuses ?? []} selectedCandidate={selectedCandidate} state={searchState.status} />
        <LiteratureImportPanel copy={copy} importState={importState} onImport={importSelected} onProjectChange={updateProject} onProjectRetry={() => setProjectRequestVersion((version) => version + 1)} onRetry={() => void retry()} onScopeChange={updateScope} projectState={projectState} projects={projects} selectedCandidate={selectedCandidate} target={target} />
      </SplitPane>
    </WorkbenchSurface>
  );
}
