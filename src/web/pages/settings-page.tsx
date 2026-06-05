import { type FormEvent, useEffect, useMemo, useState } from "react";

import type { DefaultImportTarget } from "@shared";

import { useSettingsPresenter } from "../presenters/settings-presenter";

export function SettingsPage() {
  const {
    apiKeyConfigured,
    createCredential,
    credentialError,
    credentialSaveState,
    credentials,
    defaultImportTarget,
    error,
    loadingState,
    refresh,
    saveSettings,
    saveState,
    settingsError,
  } = useSettingsPresenter();
  const [credentialProvider, setCredentialProvider] = useState("workbench-api-key");
  const [credentialSecret, setCredentialSecret] = useState("");
  const [selectedDefaultImportTarget, setSelectedDefaultImportTarget] =
    useState<DefaultImportTarget>("personal-library");

  useEffect(() => {
    setSelectedDefaultImportTarget(defaultImportTarget);
  }, [defaultImportTarget]);

  const statusMessage = useMemo(() => {
    if (loadingState === "loading") {
      return "Loading settings...";
    }

    if (loadingState === "error") {
      return "Unable to load settings";
    }

    return apiKeyConfigured
      ? "Provider credential configured"
      : "Provider credential not configured";
  }, [apiKeyConfigured, loadingState]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await saveSettings({
      defaultImportTarget: selectedDefaultImportTarget,
    });
  }

  async function handleCreateCredential(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const didSave = await createCredential({
      provider: credentialProvider.trim() || "workbench-api-key",
      rawSecret: credentialSecret,
    });

    if (didSave) {
      setCredentialSecret("");
    }
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Workspace settings</p>
        <h1 className="page-title">设置</h1>
        <p className="page-description">管理个人导入偏好、AI 连接与阅读工作台默认行为。</p>
      </header>

      <form className="panel settings-surface" onSubmit={handleSave}>
        <p aria-live="polite" className="quiet-copy">
          {statusMessage}
        </p>
        <label className="field-stack">
          <span className="field-label">默认导入目标</span>
          <select
            aria-label="默认导入目标"
            name="defaultImportTarget"
            onChange={(event) =>
              setSelectedDefaultImportTarget(event.target.value as DefaultImportTarget)
            }
            value={selectedDefaultImportTarget}
          >
            <option value="personal-library">Personal Library</option>
          </select>
        </label>
        <p className="quiet-copy">
          External discovery imports start in Personal Library. Project Library visibility is created later through explicit source adoption from a readable Library entry.
        </p>
        <button type="submit">保存设置</button>
        {saveState === "saved" ? <p className="quiet-copy">Settings saved</p> : null}
        {saveState === "error" ? (
          <p className="quiet-copy">{settingsError ?? "Unable to save settings"}</p>
        ) : null}
      </form>

      <section aria-label="context bar" className="context-bar">
        <span>Configuration scope · lab-hosted runtime</span>
        <span className="status-badge">credentials</span>
        <span className="status-badge">audit-aware</span>
      </section>

      <section aria-label="settings actions" className="context-bar">
        <span>Known credentials · {credentials.length}</span>
        <button className="panel-link" type="button" onClick={() => void refresh()}>
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
          <form className="stack-sm" onSubmit={handleCreateCredential}>
            <p className="quiet-copy">
              Credential plaintext is accepted only by the dedicated credential mutation route and is never included in workbench preference payloads.
            </p>
            <label className="field-stack">
              <span className="field-label">Provider</span>
              <input
                aria-label="Provider"
                name="credentialProvider"
                onChange={(event) => setCredentialProvider(event.target.value)}
                value={credentialProvider}
              />
            </label>
            <label className="field-stack">
              <span className="field-label">Provider credential secret</span>
              <input
                aria-label="Provider credential secret"
                name="credentialSecret"
                onChange={(event) => setCredentialSecret(event.target.value)}
                placeholder="Paste provider secret once"
                type="password"
                value={credentialSecret}
              />
            </label>
            <button type="submit" disabled={!credentialSecret.trim() || credentialSaveState === "saving"}>
              {credentialSaveState === "saving" ? "Saving credential…" : "Save credential"}
            </button>
            {credentialSaveState === "saved" ? <p className="quiet-copy">Credential reference saved</p> : null}
            {credentialSaveState === "error" ? (
              <p className="quiet-copy">{credentialError ?? "Unable to save credential"}</p>
            ) : null}
          </form>
          {credentials.length === 0 ? (
            <p className="quiet-copy">
              No provider credentials are configured for the current session actor.
              Save a credential above to create a server-owned credential reference.
            </p>
          ) : (
            <div className="shell-grid">
              {credentials.map((credential) => (
                <div key={credential.credentialRef} className="hero-card">
                  <h3 className="panel-title">{credential.provider}</h3>
                  <p className="quiet-copy">Reference · {credential.credentialRef}</p>
                  <p className="quiet-copy">Created · {credential.createdAt}</p>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="panel">
          <h2 className="panel-title">Operator controls</h2>
          <p className="quiet-copy">
            Runtime controls are loaded from the server-backed settings and credential
            authority. Credential plaintext is accepted only through the dedicated
            credential form and is never rendered back to the browser.
          </p>
        </article>
      </section>
    </main>
  );
}
