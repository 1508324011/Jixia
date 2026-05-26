import { Link } from "react-router-dom";

import type { JobRecord } from "@shared/contracts/jobs";

import {
  GovernedJobListPanel,
  JobLifecyclePanel,
} from "../components/job-runtime-panels";
import { type JobsWorkbenchScope, useJobsPresenter } from "../presenters/jobs-presenter";

function createJobRuntimeHref(
  job: JobRecord | null,
  selectedScope: JobsWorkbenchScope | null,
): string {
  const params = new URLSearchParams();

  if (job) {
    params.set("jobId", job.id);
    params.set("scopeId", job.scope.id);
    params.set("scopeType", job.scope.type);
  } else if (selectedScope) {
    params.set("scopeId", selectedScope.id);
    params.set("scopeType", selectedScope.type);
  }

  const query = params.toString();

  return query ? `/jobs?${query}` : "/jobs";
}

export function AiWorkspacePage() {
  const {
    activeJob,
    audits,
    availableScopes,
    cancelActiveJob,
    canCancelActiveJob,
    canCreateJob,
    credentials,
    error,
    events,
    isLoading,
    isRunningJob,
    jobs,
    projects,
    refresh,
    runSelectedJob,
    selectedCredentialRef,
    selectedJobId,
    selectedScope,
    selectedScopeKey,
    selectedUserSpaceId,
    setSelectedCredentialRef,
    setSelectedJobId,
    setSelectedScopeKey,
    setSelectedUserSpaceId,
    setupRequired,
    spaces,
  } = useJobsPresenter();

  const selectedCredential = credentials.find((credential) =>
    credential.credentialRef === selectedCredentialRef
  ) ?? null;
  const projectScopeCount = availableScopes.filter((scope) => scope.type === "project").length;
  const scopeOptions = selectedScopeKey.startsWith("project:") && !selectedScope
    ? [
        { label: "Unavailable project scope", value: selectedScopeKey },
        ...availableScopes.map((scope) => ({
          label: scope.label,
          value: `${scope.type}:${scope.id}`,
        })),
      ]
    : availableScopes.map((scope) => ({
        label: scope.label,
        value: `${scope.type}:${scope.id}`,
      }));
  const jobRuntimeHref = createJobRuntimeHref(activeJob, selectedScope);

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">
          AI Workspace · governed runs · explicit confirmation boundary
        </p>
        <h1 className="page-title">AI Workspace</h1>
        <p className="page-description">
          Use this secondary workspace for long-context review, cross-material
          aggregation, repeated follow-up, outlines, and planning. Work starts as
          server-authorized jobs with status, event replay, audit history, and
          cancellation; generated material remains a preview, draft, or
          suggestion until an explicit confirmation path saves it elsewhere.
        </p>
      </header>

      <section aria-label="AI Workspace boundary" className="context-bar">
        <span>Scope · {selectedScope?.label ?? "No server-visible AI scope"}</span>
        <span className="status-badge">{activeJob?.status ?? "idle"}</span>
        <span className="status-badge">not standalone chat</span>
        <span className="status-badge">no direct durable writes</span>
      </section>

      <section aria-label="AI Workspace controls" className="context-bar">
        <span>Governance spaces · {spaces.length}</span>
        <span>Project scopes · {projectScopeCount}</span>
        <span>Credentials · {credentials.length}</span>
        <span>Governed runs · {jobs.length}</span>
        <label>
          Scope
          <select
            aria-label="AI Workspace scope"
            value={selectedScopeKey}
            onChange={(event) => setSelectedScopeKey(event.target.value)}
          >
            {scopeOptions.map((scope) => (
              <option key={scope.value} value={scope.value}>
                {scope.label}
              </option>
            ))}
          </select>
        </label>
        {selectedScope?.type === "user" ? (
          <label>
            Governance space
            <select
              aria-label="AI Workspace governance space"
              value={selectedUserSpaceId}
              onChange={(event) => setSelectedUserSpaceId(event.target.value)}
              disabled={spaces.length === 0}
            >
              <option value="">Select a visible space</option>
              {spaces.map((space) => (
                <option key={space.id} value={space.id}>
                  {space.name} · {space.kind}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          Credential
          <select
            aria-label="AI Workspace credential"
            value={selectedCredentialRef}
            onChange={(event) => setSelectedCredentialRef(event.target.value)}
            disabled={credentials.length === 0}
          >
            {credentials.length === 0 ? (
              <option value="">No credential configured</option>
            ) : (
              credentials.map((credential) => (
                <option key={credential.credentialRef} value={credential.credentialRef}>
                  {credential.provider} · {credential.credentialRef}
                </option>
              ))
            )}
          </select>
        </label>
        <button
          className="panel-link"
          type="button"
          onClick={() => void runSelectedJob()}
          disabled={isRunningJob || isLoading || !canCreateJob || setupRequired !== null}
        >
          {isRunningJob ? "Launching governed AI run…" : "Launch governed AI run"}
        </button>
        <button
          className="panel-link"
          type="button"
          onClick={() => void cancelActiveJob()}
          disabled={isRunningJob || isLoading || !canCancelActiveJob}
        >
          Cancel active run
        </button>
        <button
          className="panel-link"
          type="button"
          onClick={() => void refresh()}
          disabled={isLoading}
        >
          {isLoading ? "Refreshing…" : "Refresh"}
        </button>
        <Link className="panel-link" to="/settings">
          Open Settings
        </Link>
        <Link className="panel-link" to={jobRuntimeHref}>
          Open Jobs runtime
        </Link>
      </section>

      {setupRequired === "credential" ? (
        <section className="panel-grid" aria-label="AI Workspace credential setup state">
          <article className="panel">
            <h2 className="panel-title">Credential setup required</h2>
            <p className="quiet-copy">
              Configure a provider credential in Settings before launching a
              governed AI run. AI Workspace uses credential references only and
              never asks for or displays raw provider keys.
            </p>
            <Link className="panel-link" to="/settings">
              Configure credentials in Settings
            </Link>
          </article>
        </section>
      ) : null}

      {setupRequired === "space" ? (
        <section className="panel-grid" aria-label="AI Workspace governance state">
          <article className="panel">
            <h2 className="panel-title">Governance space required</h2>
            <p className="quiet-copy">
              Personal AI Workspace runs require a real server-visible governance
              space selected by the user. The browser does not choose a fallback
              space or create one implicitly.
            </p>
          </article>
        </section>
      ) : null}

      {setupRequired === "project" ? (
        <section className="panel-grid" aria-label="AI Workspace unavailable project state">
          <article className="panel">
            <h2 className="panel-title">Project scope unavailable</h2>
            <p className="quiet-copy">
              The requested project scope is not visible to the current session.
              Choose a server-visible project scope or return to the personal
              lane before launching another governed run.
            </p>
          </article>
        </section>
      ) : null}

      {projects.length === 0 ? (
        <section className="panel-grid" aria-label="AI Workspace project state">
          <article className="panel">
            <h2 className="panel-title">No visible project scopes</h2>
            <p className="quiet-copy">
              Project-scoped AI work appears only when the server returns a
              project membership. AI Workspace does not fabricate project access
              from routes, spaces, or local fixtures.
            </p>
            <Link className="panel-link" to="/projects">
              Open Projects
            </Link>
          </article>
        </section>
      ) : null}

      {error ? (
        <section className="panel-grid" aria-label="AI Workspace errors">
          <article className="panel">
            <h2 className="panel-title">AI Workspace runtime error</h2>
            <p className="quiet-copy">{error}</p>
          </article>
        </section>
      ) : null}

      <section className="panel-grid" aria-label="AI Workspace layout">
        <GovernedJobListPanel
          emptyCopy="No governed AI runs exist yet for this scope. Launch a scoped run to populate server-authorized status, events, audits, and live recovery state."
          idLabel="Run id"
          jobs={jobs}
          selectedCredentialLabel="Selected credential reference"
          selectedCredentialRef={selectedCredential?.credentialRef ?? null}
          selectedJobId={selectedJobId}
          setSelectedJobId={setSelectedJobId}
          title="Governed AI runs"
        >
          <p className="quiet-copy">
            Run output shown here is treated as preview, draft, or suggestion
            material. Saving into Notebook, Project Docs, Library, projects, or
            settings must happen through a separate confirmed product flow.
          </p>
        </GovernedJobListPanel>

        <JobLifecyclePanel
          activeDescription="Status recovery and audit history come from the existing jobs runtime, not browser-owned transcript state."
          activeJob={activeJob}
          activeJobLabel="Focused run"
          audits={audits}
          auditEmptyCopy="Audit records appear after the server persists job creation, execution, cancellation, or failure activity."
          emptyCopy="Select or launch a governed AI run to inspect status, event replay, audit history, and cancellation availability."
          events={events}
          eventEmptyCopy="Waiting for replayed or live events. Refresh to recover persisted history for this run."
          title="Lifecycle, events, and audit trail"
        >
          <Link className="panel-link" to={jobRuntimeHref}>
            Open this run in Jobs
          </Link>
        </JobLifecyclePanel>
      </section>
    </main>
  );
}
