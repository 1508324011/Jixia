import { useSettingsPresenter } from "../presenters/settings-presenter";

export function SettingsPage() {
  const { createSampleCredential, credentials, error, isMutating, refresh } =
    useSettingsPresenter();

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">
          Credentials · governance · future operator controls
        </p>
        <h1 className="page-title">Settings</h1>
        <p className="page-description">
          This shell page reserves the donor-style settings surface for provider
          credentials, governance policy, and later server/operator controls.
        </p>
      </header>

      <section aria-label="context bar" className="context-bar">
        <span>Configuration scope · lab-hosted runtime</span>
        <span className="status-badge">credentials</span>
        <span className="status-badge">audit-aware</span>
      </section>

      <section aria-label="settings actions" className="context-bar">
        <span>Known credentials · {credentials.length}</span>
        <button
          className="panel-link"
          type="button"
          onClick={() => void createSampleCredential()}
          disabled={isMutating}
        >
          {isMutating ? "Creating credential…" : "Create sample credential"}
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
        <section className="panel-grid" aria-label="settings errors">
          <article className="panel">
            <h2 className="panel-title">Credential error</h2>
            <p className="quiet-copy">{error}</p>
          </article>
        </section>
      ) : null}

      <section className="panel-grid" aria-label="settings layout">
        <article className="panel">
          <h2 className="panel-title">Provider credentials</h2>
          {credentials.length === 0 ? (
            <p className="quiet-copy">
              No credentials are configured yet. Create a sample credential to
              exercise the typed client and server-backed settings presenter.
            </p>
          ) : (
            <div className="shell-grid">
              {credentials.map((credential) => (
                <div key={credential.credentialRef} className="hero-card">
                  <h3 className="panel-title">{credential.provider}</h3>
                  <p className="quiet-copy">
                    Reference · {credential.credentialRef}
                  </p>
                  <p className="quiet-copy">Owner · {credential.userId}</p>
                  <p className="quiet-copy">Created · {credential.createdAt}</p>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="panel">
          <h2 className="panel-title">Operator controls</h2>
          <p className="quiet-copy">
            Phase 1 focuses on page chrome. Operator-specific runtime controls
            will attach here once the shell integration is stable.
          </p>
        </article>
      </section>
    </main>
  );
}
