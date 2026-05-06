import { type FormEvent, useEffect, useMemo, useState } from "react";

import type { DefaultImportTarget } from "@shared";

import { createDemoApi } from "../lib/demo-api";
import { useSettingsPresenter } from "../presenters/settings-presenter";

const demoApi = createDemoApi();

export function SettingsPage() {
  const { createSampleCredential, credentials, error, isMutating, refresh } =
    useSettingsPresenter();
  const [apiKey, setApiKey] = useState("");
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [defaultImportTarget, setDefaultImportTarget] =
    useState<DefaultImportTarget>("personal-library");
  const [loadingState, setLoadingState] = useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  useEffect(() => {
    let cancelled = false;

    setLoadingState("loading");

    void demoApi
      .getWorkbenchSettings()
      .then((settings) => {
        if (cancelled) {
          return;
        }

        setApiKeyConfigured(settings.apiKeyConfigured);
        setDefaultImportTarget(settings.defaultImportTarget);
        setLoadingState("loaded");
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setLoadingState("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const statusMessage = useMemo(() => {
    if (loadingState === "loading") {
      return "Loading settings...";
    }

    if (loadingState === "error") {
      return "Unable to load settings";
    }

    return apiKeyConfigured ? "API key configured" : "API key not configured";
  }, [apiKeyConfigured, loadingState]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveState("saving");

    try {
      const savedSettings = await demoApi.saveWorkbenchSettings({
        apiKey: apiKey.trim().length > 0 ? apiKey.trim() : undefined,
        defaultImportTarget,
      });

      setApiKey("");
      setApiKeyConfigured(savedSettings.apiKeyConfigured);
      setDefaultImportTarget(savedSettings.defaultImportTarget);
      setLoadingState("loaded");
      setSaveState("saved");
    } catch {
      setSaveState("error");
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
          <span className="field-label">API Key</span>
          <input
            aria-label="API Key"
            name="apiKey"
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-..."
            value={apiKey}
          />
        </label>
        <label className="field-stack">
          <span className="field-label">默认导入目标</span>
          <select
            aria-label="默认导入目标"
            name="defaultImportTarget"
            onChange={(event) =>
              setDefaultImportTarget(event.target.value as DefaultImportTarget)
            }
            value={defaultImportTarget}
          >
            <option value="personal-library">Personal Library</option>
            <option value="project-workspace">Project Workspace</option>
          </select>
        </label>
        <button type="submit">保存设置</button>
        {saveState === "saved" ? <p className="quiet-copy">Settings saved</p> : null}
        {saveState === "error" ? (
          <p className="quiet-copy">Unable to save settings</p>
        ) : null}
      </form>

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
                  <p className="quiet-copy">Reference · {credential.credentialRef}</p>
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
