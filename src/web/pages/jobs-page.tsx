import { useJobsPresenter } from "../presenters/jobs-presenter";

export function JobsPage() {
  const {
    activeJob,
    audits,
    availableScopes,
    cancelActiveJob,
    canCreateJob,
    canCancelActiveJob,
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

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">
          Governed runtime · status recovery · observable execution
        </p>
        <h1 className="page-title">Jobs</h1>
        <p className="page-description">
          Jobs now run in an explicit personal or project scope. The browser no
          longer fabricates demo spaces, sample jobs, or placeholder
          credentials—the server remains the source of truth for scope,
          execution history, audit records, and live updates.
        </p>
      </header>

      <section aria-label="context bar" className="context-bar">
        <span>
          Execution scope · {selectedScope?.label ?? "No job scope available"}
        </span>
        <span className="status-badge">{activeJob?.status ?? "idle"}</span>
        <span className="status-badge">governed AI</span>
        <span className="status-badge">server-authorized streams</span>
      </section>

      <section aria-label="jobs actions" className="context-bar">
        <span>Governance spaces · {spaces.length}</span>
        <span>Project scopes · {projectScopeCount}</span>
        <span>Credentials · {credentials.length}</span>
        <span>Tracked jobs · {jobs.length}</span>
        <label>
          Scope
          <select
            aria-label="Jobs scope"
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
              aria-label="Jobs governance space"
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
            aria-label="Jobs credential"
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
          {isRunningJob
            ? "Running scoped job…"
            : "Create and run scoped job"}
        </button>
        <button
          className="panel-link"
          type="button"
          onClick={() => void cancelActiveJob()}
          disabled={isRunningJob || isLoading || !canCancelActiveJob}
        >
          Cancel active job
        </button>
        <button
          className="panel-link"
          type="button"
          onClick={() => void refresh()}
          disabled={isLoading}
        >
          {isLoading ? "Refreshing…" : "Refresh"}
        </button>
      </section>

      {setupRequired === "credential" ? (
        <section className="panel-grid" aria-label="jobs setup state">
          <article className="panel">
            <h2 className="panel-title">Credential setup required</h2>
            <p className="quiet-copy">
              Configure a real provider credential in Settings before you create
              a governed job. The product path no longer creates placeholder
              credentials in the browser.
            </p>
          </article>
        </section>
      ) : null}

      {setupRequired === "space" ? (
        <section className="panel-grid" aria-label="jobs governance state">
          <article className="panel">
            <h2 className="panel-title">Governance space required</h2>
            <p className="quiet-copy">
              Personal jobs need a real server-visible governance space selected
              in the workbench before a job can be created. The browser no
              longer chooses one implicitly or falls back to a fabricated lane.
            </p>
          </article>
        </section>
      ) : null}

      {setupRequired === "project" ? (
        <section className="panel-grid" aria-label="jobs unavailable project state">
          <article className="panel">
            <h2 className="panel-title">Project scope unavailable</h2>
            <p className="quiet-copy">
              The selected project scope is no longer visible to the current
              actor. Choose a visible project or return to your personal scope.
            </p>
          </article>
        </section>
      ) : null}

      {projects.length === 0 ? (
        <section className="panel-grid" aria-label="jobs project state">
          <article className="panel">
            <h2 className="panel-title">No visible project scopes</h2>
            <p className="quiet-copy">
              Project jobs only appear when the server returns a visible project
              membership. The workbench no longer invents a fake project job
              context.
            </p>
          </article>
        </section>
      ) : null}

      {error ? (
        <section className="panel-grid" aria-label="jobs errors">
          <article className="panel">
            <h2 className="panel-title">Runtime error</h2>
            <p className="quiet-copy">{error}</p>
          </article>
        </section>
      ) : null}

      <section className="panel-grid" aria-label="jobs layout">
        <article className="panel">
          <h2 className="panel-title">Tracked jobs</h2>
          <p className="quiet-copy">
            Selected credential · {selectedCredential?.credentialRef ?? "No credential selected"}
          </p>
          {jobs.length === 0 ? (
            <p className="quiet-copy">
              No jobs exist yet for this scope. Create and run a real scoped job
              to populate server-authorized events, audit history, and live SSE
              updates.
            </p>
          ) : (
            <div className="shell-grid">
              {jobs.map((job) => (
                <button
                  key={job.id}
                  className="hero-card"
                  type="button"
                  aria-pressed={job.id === selectedJobId}
                  onClick={() => setSelectedJobId(job.id)}
                >
                  <h3 className="panel-title">{job.kind}</h3>
                  <p className="quiet-copy">Job id · {job.id}</p>
                  <p className="quiet-copy">
                    Scope · {job.scope.type} / {job.scope.id}
                  </p>
                  <p className="quiet-copy">Credential · {job.credentialRef}</p>
                  <p className="quiet-copy">Created · {job.createdAt}</p>
                  <span className="status-badge">{job.status}</span>
                </button>
              ))}
            </div>
          )}
        </article>

        <article className="panel">
          <h2 className="panel-title">Active event stream</h2>
          {activeJob ? (
            <>
              <p className="quiet-copy">Focused job · {activeJob.id}</p>
              <p className="quiet-copy">
                Scope · {activeJob.scope.type} / {activeJob.scope.id}
              </p>
              <div className="shell-grid">
                {events.length === 0 ? (
                  <p className="quiet-copy">
                    Waiting for replay/live events. Refresh to recover persisted
                    history.
                  </p>
                ) : (
                  events.map((event) => (
                    <div key={event.id} className="hero-card">
                      <h3 className="panel-title">{event.status}</h3>
                      <p className="quiet-copy">{event.message}</p>
                      <p className="quiet-copy">{event.recordedAt}</p>
                    </div>
                  ))
                )}
              </div>
              <h3 className="panel-title">Audit trail</h3>
              <div className="shell-grid">
                {audits.length === 0 ? (
                  <p className="quiet-copy">
                    Audit records will appear once the server persists job
                    creation or execution activity for this job.
                  </p>
                ) : (
                  audits.map((audit) => (
                    <div key={audit.id} className="hero-card">
                      <h4 className="panel-title">{audit.action}</h4>
                      <p className="quiet-copy">Actor · {audit.actorUserId}</p>
                      <p className="quiet-copy">{audit.detail}</p>
                      <p className="quiet-copy">{audit.recordedAt}</p>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <p className="quiet-copy">
              Once a job exists, this panel replays stored events and audit
              history first and then keeps listening on the server-authorized
              live SSE channel.
            </p>
          )}
        </article>
      </section>
    </main>
  );
}
