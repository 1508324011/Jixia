import type { LiteratureDiscoveryCandidateDTO, LiteratureTargetScope, ProjectDTO } from "@jixia/shared";
import { Download, RefreshCw } from "lucide-react";

import type { LiteratureSearchCopy } from "./literature-search.copy";
import type { LiteratureImportState } from "./useLiteratureImport";
import { Button, Field, Notice, Pane } from "../layout/workbench";

type LiteratureImportPanelProps = {
  readonly copy: LiteratureSearchCopy;
  readonly importState: LiteratureImportState;
  readonly onImport: () => void;
  readonly onProjectChange: (projectId: string) => void;
  readonly onProjectRetry: () => void;
  readonly onRetry: () => void;
  readonly onScopeChange: (scope: "personal" | "project") => void;
  readonly projectState: "idle" | "loading" | "ready" | "error";
  readonly projects: readonly ProjectDTO[];
  readonly selectedCandidate: LiteratureDiscoveryCandidateDTO | null;
  readonly target: LiteratureTargetScope;
};

export function LiteratureImportPanel({
  copy,
  importState,
  onImport,
  onProjectChange,
  onProjectRetry,
  onRetry,
  onScopeChange,
  projectState,
  projects,
  selectedCandidate,
  target
}: LiteratureImportPanelProps) {
  const canImport = selectedCandidate?.sourceMatches[0] !== undefined && !(target.scope === "project" && !target.projectId) && importState.status !== "submitting" && importState.operation === null;
  return (
    <Pane className="literature-search__import" title={copy.importTitle}>
      <fieldset className="literature-search__target"><legend>{copy.target}</legend>
        <label><input checked={target.scope === "personal"} data-testid="literature-target-personal" name="literature-target" onChange={() => onScopeChange("personal")} type="radio" value="personal" /> {copy.personal}</label>
        <label><input checked={target.scope === "project"} data-testid="literature-target-project" name="literature-target" onChange={() => onScopeChange("project")} type="radio" value="project" /> {copy.project}</label>
      </fieldset>
      {target.scope === "project" ? <ProjectSelector copy={copy} onChange={onProjectChange} onRetry={onProjectRetry} projectState={projectState} projects={projects} selectedProjectId={target.projectId} /> : null}
      <SelectedSource copy={copy} selectedCandidate={selectedCandidate} />
      <ImportStatus copy={copy} importState={importState} onRetry={onRetry} />
      <Button data-testid="literature-import-submit" disabled={!canImport} onClick={onImport} variant="primary"><Download aria-hidden="true" size={16} /> {copy.import}</Button>
    </Pane>
  );
}

function ProjectSelector({ copy, onChange, onRetry, projectState, projects, selectedProjectId }: Pick<LiteratureImportPanelProps, "copy" | "projectState" | "projects"> & { readonly onChange: (projectId: string) => void; readonly onRetry: () => void; readonly selectedProjectId: string }) {
  if (projectState === "loading") return <p className="jixia-description" role="status">{copy.projectsLoading}</p>;
  if (projectState === "error") return <Notice role="alert" tone="danger">{copy.projectsUnavailable} <Button data-testid="literature-project-retry" onClick={onRetry} variant="link"><RefreshCw aria-hidden="true" size={16} /> {copy.retryProjects}</Button></Notice>;
  return <Field label={copy.projectLabel}><select data-testid="literature-project-selector" onChange={(event) => onChange(event.target.value)} value={selectedProjectId}><option value="">{copy.selectProject}</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field>;
}

function SelectedSource({ copy, selectedCandidate }: Pick<LiteratureImportPanelProps, "copy" | "selectedCandidate">) {
  if (!selectedCandidate) return <p className="jixia-description">{copy.selectResult}</p>;
  const source = selectedCandidate.sourceMatches[0];
  return <div className="literature-search__selection"><strong>{selectedCandidate.title ?? copy.unknownTitle}</strong>{source ? <span>{source.providerKey}: {source.recordKey}</span> : <Notice tone="warning">{copy.noImportableSource}</Notice>}</div>;
}

function ImportStatus({ copy, importState, onRetry }: Pick<LiteratureImportPanelProps, "copy" | "importState" | "onRetry">) {
  if (importState.status === "submitting") return <p className="jixia-description" role="status">{copy.importing}</p>;
  if (importState.operation?.status === "running" && importState.canRetry) return <><Notice role="alert" tone="warning">{copy.importExpired}</Notice><Button data-testid="literature-import-retry" onClick={onRetry}><RefreshCw aria-hidden="true" size={16} /> {copy.retry}</Button></>;
  if (importState.operation?.status === "running") return <>{importState.error ? <Notice role="alert" tone="danger">{importState.error}</Notice> : null}<p className="jixia-description" role="status">{copy.importing}</p></>;
  if (importState.operation?.status === "failed") return <><Notice role="alert" tone="danger">{copy.importFailed(importState.operation.failureCode)}</Notice><Button data-testid="literature-import-retry" onClick={onRetry}><RefreshCw aria-hidden="true" size={16} /> {copy.retry}</Button></>;
  if (importState.operation?.status === "succeeded") return <Notice role="status" tone="success">{copy.imported}</Notice>;
  return importState.error ? <Notice role="alert" tone="danger">{importState.error}</Notice> : null;
}
