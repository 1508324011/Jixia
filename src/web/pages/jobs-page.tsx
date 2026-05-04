import { useJobsPresenter } from "../presenters/jobs-presenter";

export function JobsPage() {
  const {
    activeJob,
    credentials,
    error,
    events,
    isRunningSample,
    jobs,
    refresh,
    runSampleJob,
    spaces,
  } = useJobsPresenter();

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">
          Governed runtime · status recovery · observable execution
        </p>
        <h1 className="page-title">Jobs</h1>
        <p className="page-description">
          This phase introduces the shell and navigation for donor-style job
          visibility. Persistent recovery and SSE-backed updates arrive in the
          next runtime phase.
        </p>
      </header>

      <section aria-label="context bar" className="context-bar">
        <span>
          Execution scope · {spaces[0]?.id ?? "No governance space"} / server-owned jobs
        </span>
        <span className="status-badge">queued</span>
        <span className="status-badge">governed AI</span>
      </section>

      <section aria-label="jobs actions" className="context-bar">
        <span>Spaces · {spaces.length}</span>
        <span>Credentials · {credentials.length}</span>
        <span>Tracked jobs · {jobs.length}</span>
        <button
          className="panel-link"
          type="button"
          onClick={() => void runSampleJob()}
          disabled={isRunningSample}
        >
          {isRunningSample
            ? "Running sample job…"
            : "Create and run sample job"}
        </button>
        <button
          className="panel-link"
          type="button"
          onClick={() => void refresh()}
        >
          Refresh
        </button>
      </section>

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
          {jobs.length === 0 ? (
            <p className="quiet-copy">
              No jobs exist yet. Use the sample action above to exercise the
              typed client, browser-facing API, and replay/live stream wiring.
            </p>
          ) : (
            <div className="shell-grid">
              {jobs.map((job) => (
                <div key={job.id} className="hero-card">
                  <h3 className="panel-title">{job.kind}</h3>
                  <p className="quiet-copy">Job id · {job.id}</p>
                  <p className="quiet-copy">Credential · {job.credentialRef}</p>
                  <p className="quiet-copy">Created · {job.createdAt}</p>
                  <span className="status-badge">{job.status}</span>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="panel">
          <h2 className="panel-title">Active event stream</h2>
          {activeJob ? (
            <>
              <p className="quiet-copy">Focused job · {activeJob.id}</p>
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
            </>
          ) : (
            <p className="quiet-copy">
              Once a job exists, this panel replays stored events first and then
              keeps listening on the live SSE channel.
            </p>
          )}
        </article>
      </section>
    </main>
  );
}
