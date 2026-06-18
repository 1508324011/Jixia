import type {
  AIProviderConfigListResponse,
  AIProviderConfigResponse,
  AIProviderConfigView,
  CreateAIProviderConfigRequest,
  ProviderHealthCheck,
  TestAIProviderConfigResponse,
  UpdateAIProviderConfigRequest
} from "@jixia/shared";
import { useEffect, useMemo, useState } from "react";

import { apiFetch } from "../../lib/api";
import { Button, EmptyState, Field, MetaGrid, Notice, Pane, Pill, SplitPane, SurfaceHeader, WorkbenchSurface } from "../layout/workbench";

type AISettingsPageProps = {
  readonly embedded?: boolean;
  readonly onBackToWorkspace?: () => void;
  readonly onOpenChat?: () => void;
  readonly onOpenUsage?: () => void;
};

type FormState = {
  readonly presetId: ProviderPresetId;
  readonly name: string;
  readonly provider: string;
  readonly baseURL: string;
  readonly model: string;
  readonly temperature: string;
  readonly maxTokens: string;
  readonly apiKey: string;
  readonly isDefault: boolean;
};

type ProviderPresetId = "openai" | "openrouter" | "self-hosted" | "custom";

type ProviderPreset = {
  readonly id: ProviderPresetId;
  readonly label: string;
  readonly name: string;
  readonly provider: string;
  readonly baseURL: string;
  readonly model: string;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly description: string;
  readonly keyInstruction: string;
};

type HealthCheckState = {
  readonly status: "idle" | "testing" | "passed" | "failed";
  readonly result: ProviderHealthCheck | null;
};

const providerPresets = [
  {
    id: "openai",
    label: "OpenAI",
    name: "OpenAI GPT-4o mini",
    provider: "openai",
    baseURL: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    temperature: 0.2,
    maxTokens: 4096,
    description: "Direct OpenAI billing with the standard OpenAI-compatible /v1 endpoint.",
    keyInstruction: "Paste an OpenAI project key only when creating or replacing the saved key."
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    name: "OpenRouter GPT-4o mini",
    provider: "openrouter",
    baseURL: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini",
    temperature: 0.2,
    maxTokens: 4096,
    description: "One hosted gateway for many vendor models, using OpenRouter model IDs.",
    keyInstruction: "Paste an OpenRouter key; the UI still sends it write-only to Jixia."
  },
  {
    id: "self-hosted",
    label: "Self-hosted HTTPS",
    name: "Self-hosted OpenAI-compatible model",
    provider: "self-hosted",
    baseURL: "https://your-ai-gateway.example.com/v1",
    model: "llama3.1",
    temperature: 0.2,
    maxTokens: 4096,
    description: "For vLLM, Ollama, LM Studio, or an enterprise proxy exposed through HTTPS.",
    keyInstruction: "Use an HTTPS gateway reachable by the Jixia API server; localhost and private-network URLs are blocked for safety."
  },
  {
    id: "custom",
    label: "Custom gateway",
    name: "Custom OpenAI-compatible provider",
    provider: "custom",
    baseURL: "",
    model: "",
    temperature: 0.2,
    maxTokens: 4096,
    description: "Use an enterprise proxy, private gateway, or any compatible provider endpoint.",
    keyInstruction: "Enter the gateway token only if this provider requires one."
  }
] as const satisfies readonly ProviderPreset[];

const defaultProviderPreset = providerPresets[0];
const customProviderPreset = providerPresets[3];
const emptyForm: FormState = formFromPreset(defaultProviderPreset);

export function AISettingsPage({ embedded = false, onBackToWorkspace, onOpenChat, onOpenUsage }: AISettingsPageProps) {
  const [configs, setConfigs] = useState<readonly AIProviderConfigView[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "error" | "saved">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [formMessageTone, setFormMessageTone] = useState<"info" | "success" | "warning" | "danger">("info");
  const [healthChecks, setHealthChecks] = useState<Readonly<Record<string, HealthCheckState>>>({});

  const selectedConfig = useMemo(
    () => configs.find((config) => config.id === selectedConfigId) ?? null,
    [configs, selectedConfigId]
  );
  const activePreset = useMemo(() => presetById(form.presetId), [form.presetId]);
  const activeHealthKey = selectedConfig?.id ?? "draft";
  const activeHealthCheck = healthChecks[activeHealthKey] ?? { status: "idle", result: null };

  useEffect(() => {
    let isCancelled = false;

    async function loadConfigs(): Promise<void> {
      setLoadState("loading");
      setErrorMessage(null);

      try {
        const response = await apiFetch<AIProviderConfigListResponse>("/ai/configs");
        if (isCancelled) {
          return;
        }

        setConfigs(response.configs);
        setLoadState("ready");
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setLoadState("error");
        setErrorMessage(error instanceof Error ? error.message : "Unable to load AI settings.");
      }
    }

    void loadConfigs();

    return () => {
      isCancelled = true;
    };
  }, []);

  function startCreate(): void {
    setSelectedConfigId(null);
    setForm(emptyForm);
    setSubmitState("idle");
    setFormMessage(null);
    setFormMessageTone("info");
    clearDraftHealthCheck();
  }

  function startEdit(config: AIProviderConfigView): void {
    setSelectedConfigId(config.id);
    setForm({
      presetId: inferPresetId(config.provider, config.baseURL),
      name: config.name,
      provider: config.provider,
      baseURL: config.baseURL,
      model: config.model,
      temperature: String(config.temperature),
      maxTokens: String(config.maxTokens),
      apiKey: "",
      isDefault: config.isDefault
    });
    setSubmitState("idle");
    setFormMessage(null);
    setFormMessageTone("info");
  }

  async function reloadConfigs(): Promise<void> {
    const response = await apiFetch<AIProviderConfigListResponse>("/ai/configs");
    setConfigs(response.configs);
  }

  async function handleSubmit(event: { readonly preventDefault: () => void }): Promise<void> {
    event.preventDefault();
    setSubmitState("submitting");
    setFormMessage(null);

    const parsed = parseForm(form);
    if (!parsed.ok) {
      setSubmitState("error");
      setFormMessage(parsed.message);
      setFormMessageTone("danger");
      return;
    }

    try {
      if (selectedConfig) {
        const payload = updatePayloadFromForm(parsed.payload, form.apiKey);
        const response = await apiFetch<AIProviderConfigResponse>(
          `/ai/configs/${encodeURIComponent(selectedConfig.id)}`,
          {
            method: "PATCH",
            json: payload
          }
        );
        upsertConfig(response.config);
        setForm((currentForm) => ({
          ...currentForm,
          apiKey: "",
          presetId: inferPresetId(response.config.provider, response.config.baseURL),
          isDefault: response.config.isDefault
        }));
        setSubmitState("saved");
        setFormMessage("AI provider config saved. Existing server-side key was preserved unless you typed a replacement.");
        setFormMessageTone("success");
        clearDraftHealthCheck();
        return;
      }

      const payload: CreateAIProviderConfigRequest = createPayloadFromForm(parsed.payload, form.apiKey);
      const response = await apiFetch<AIProviderConfigResponse>("/ai/configs", {
        method: "POST",
        json: payload
      });
      upsertConfig(response.config);
      setSelectedConfigId(response.config.id);
      setForm({
        presetId: inferPresetId(response.config.provider, response.config.baseURL),
        name: response.config.name,
        provider: response.config.provider,
        baseURL: response.config.baseURL,
        model: response.config.model,
        temperature: String(response.config.temperature),
        maxTokens: String(response.config.maxTokens),
        apiKey: "",
        isDefault: response.config.isDefault
      });
      setSubmitState("saved");
      setFormMessage("AI provider config created. The API key field has been cleared after submission.");
      setFormMessageTone("success");
      moveDraftHealthCheckToConfig(response.config.id);
    } catch (error) {
      setSubmitState("error");
      setFormMessage(error instanceof Error ? error.message : "Unable to save AI provider config.");
      setFormMessageTone("danger");
    }
  }

  async function handleTestDraft(): Promise<void> {
    const parsed = parseForm(form);
    if (!parsed.ok) {
      setFormMessage(parsed.message);
      setFormMessageTone("danger");
      return;
    }

    setHealthCheck("draft", { status: "testing", result: null });
    setFormMessage(null);

    try {
      const response = await apiFetch<TestAIProviderConfigResponse>("/ai/configs/test", {
        method: "POST",
        json: createPayloadFromForm(parsed.payload, form.apiKey)
      });
      setHealthCheck("draft", stateFromHealthCheck(response.healthCheck));
      setSubmitState(response.healthCheck.ok ? "idle" : "error");
      setFormMessage(response.healthCheck.ok ? "Draft connection verified. Save this provider or go back to chat if it is already saved elsewhere." : response.healthCheck.message);
      setFormMessageTone(response.healthCheck.ok ? "success" : "danger");
    } catch (error) {
      setHealthCheck("draft", { status: "failed", result: null });
      setSubmitState("error");
      setFormMessage(error instanceof Error ? error.message : "Unable to test draft provider config.");
      setFormMessageTone("danger");
    }
  }

  async function handleTestSaved(config: AIProviderConfigView, includeFormOverrides = false): Promise<void> {
    const key = config.id;
    setHealthCheck(key, { status: "testing", result: null });
    setFormMessage(null);

    try {
      const payload = includeFormOverrides ? savedTestPayloadFromForm(form) : {};
      const response = await apiFetch<TestAIProviderConfigResponse>(`/ai/configs/${encodeURIComponent(config.id)}/test`, {
        method: "POST",
        json: payload
      });
      setHealthCheck(key, stateFromHealthCheck(response.healthCheck));
      setSubmitState(response.healthCheck.ok ? "idle" : "error");
      setFormMessage(response.healthCheck.ok ? `${config.name} connection verified. Chat is ready to use this provider.` : response.healthCheck.message);
      setFormMessageTone(response.healthCheck.ok ? "success" : "danger");
    } catch (error) {
      setHealthCheck(key, { status: "failed", result: null });
      setSubmitState("error");
      setFormMessage(error instanceof Error ? error.message : "Unable to test saved provider config.");
      setFormMessageTone("danger");
    }
  }

  async function handleSetDefault(config: AIProviderConfigView): Promise<void> {
    setFormMessage(null);

    try {
      const response = await apiFetch<AIProviderConfigResponse>(
        `/ai/configs/${encodeURIComponent(config.id)}/default`,
        {
          method: "POST"
        }
      );
      setConfigs((currentConfigs) =>
        currentConfigs.map((currentConfig) => ({
          ...currentConfig,
          isDefault: currentConfig.id === response.config.id
        }))
      );
      if (selectedConfigId === response.config.id) {
        setForm((currentForm) => ({ ...currentForm, isDefault: true }));
      }
      setFormMessage("Default AI provider config updated through the API.");
      setFormMessageTone("success");
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Unable to set default AI provider config.");
      setFormMessageTone("danger");
    }
  }

  async function handleDelete(config: AIProviderConfigView): Promise<void> {
    if (!window.confirm(`Delete ${config.name}? This removes provider metadata and its encrypted server-side key.`)) {
      return;
    }

    setFormMessage(null);

    try {
      await apiFetch<{ readonly ok: true }>(`/ai/configs/${encodeURIComponent(config.id)}`, {
        method: "DELETE"
      });
      setConfigs((currentConfigs) => currentConfigs.filter((currentConfig) => currentConfig.id !== config.id));
      if (selectedConfigId === config.id) {
        startCreate();
      }
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Unable to delete AI provider config.");
      setFormMessageTone("danger");
    }
  }

  function upsertConfig(config: AIProviderConfigView): void {
    setConfigs((currentConfigs) => {
      const withoutSaved = currentConfigs.filter((currentConfig) => currentConfig.id !== config.id);
      const normalized = config.isDefault
        ? withoutSaved.map((currentConfig) => ({ ...currentConfig, isDefault: false }))
        : withoutSaved;
      return [config, ...normalized].sort(compareConfigs);
    });
  }

  function applyPreset(preset: ProviderPreset): void {
    setForm((currentForm) => ({
      ...currentForm,
      presetId: preset.id,
      name: selectedConfig && currentForm.name.trim() ? currentForm.name : preset.name,
      provider: preset.provider,
      baseURL: preset.baseURL,
      model: preset.model,
      temperature: String(preset.temperature),
      maxTokens: String(preset.maxTokens)
    }));
    setSubmitState("idle");
    setFormMessage(null);
    setFormMessageTone("info");
    clearDraftHealthCheck();
  }

  function updateFormText(field: keyof Omit<FormState, "isDefault" | "presetId">, value: string): void {
    setForm((currentForm) => withInferredPreset({ ...currentForm, [field]: value }));
    if (!selectedConfigId) {
      clearDraftHealthCheck();
    }
  }

  function setHealthCheck(key: string, value: HealthCheckState): void {
    setHealthChecks((current) => ({ ...current, [key]: value }));
  }

  function clearDraftHealthCheck(): void {
    setHealthChecks((current) => {
      const { draft: _draft, ...rest } = current;
      return rest;
    });
  }

  function moveDraftHealthCheckToConfig(configId: string): void {
    setHealthChecks((current) => {
      const draft = current.draft;
      const { draft: _draft, ...rest } = current;
      return draft ? { ...rest, [configId]: draft } : rest;
    });
  }

  const settingsContent = (
    <>
      {loadState === "loading" ? <p className="jixia-description">Loading AI provider configs…</p> : null}
      {loadState === "error" && errorMessage ? (
        <Notice role="alert" tone="danger">
          {errorMessage}
        </Notice>
      ) : null}

      <SplitPane className="jixia-ai-settings-layout" sideWidth="360px">
        <div className="jixia-ai-settings-sidebar">
          <Pane
            actions={
              <>
                <Button onClick={() => void reloadConfigs()}>Refresh</Button>
                <Button onClick={startCreate} variant="primary">New provider</Button>
              </>
            }
            aria-labelledby="ai-config-list-title"
            eyebrow="Provider cards"
            title="Configured providers"
            titleId="ai-config-list-title"
          >
            <p className="jixia-description">Configure, test, set default, then chat. Cards show only server-safe metadata and write-only key status.</p>
            {loadState === "ready" && configs.length === 0 ? (
              <EmptyState
                description="Create one from a preset. The server stores encrypted keys and returns only safe previews."
                title="No providers configured yet"
              />
            ) : null}

            {configs.length > 0 ? (
              <div className="jixia-ai-provider-card-list">
                {configs.map((config) => {
                  const cardProps: ProviderConfigCardProps = {
                    config,
                    healthCheck: healthChecks[config.id] ?? { status: "idle", result: null },
                    isSelected: selectedConfigId === config.id,
                    onDelete: () => void handleDelete(config),
                    onEdit: () => startEdit(config),
                    onSetDefault: () => void handleSetDefault(config),
                    onTest: () => void handleTestSaved(config),
                    ...(onOpenChat ? { onOpenChat } : {})
                  };

                  return <ProviderConfigCard key={config.id} {...cardProps} />;
                })}
              </div>
            ) : null}
          </Pane>

          <details className="jixia-ai-preset-drawer" open={configs.length === 0}>
            <summary>Provider presets</summary>
            <p>Use a preset to seed the editor, then test through the Jixia API before saving.</p>
            <div className="jixia-ai-preset-list">
              {providerPresets.map((preset) => (
                <button
                  aria-pressed={form.presetId === preset.id}
                  className="jixia-ai-preset-card"
                  key={preset.id}
                  onClick={() => applyPreset(preset)}
                  type="button"
                >
                  <span className="jixia-ai-preset-card__topline">
                    <strong>{preset.label}</strong>
                    {form.presetId === preset.id ? <Pill tone="accent">Selected</Pill> : null}
                  </span>
                  <span>{preset.description}</span>
                  <small>{preset.baseURL || "Bring your own base URL"}</small>
                </button>
              ))}
            </div>
          </details>
        </div>

        <Pane
          aria-labelledby="ai-config-form-title"
          eyebrow={selectedConfig ? "Edit provider" : "Create provider"}
          muted
          title={selectedConfig ? selectedConfig.name : "Review and save provider"}
          titleId="ai-config-form-title"
        >
          <form className="jixia-ai-settings-form" onSubmit={handleSubmit}>
            <Notice>
              {activePreset.keyInstruction} The API key field is write-only: saved keys are never rendered, and editing without typing a replacement omits apiKey from PATCH.
            </Notice>

            <div className="jixia-ai-settings-summary">
              <Pill tone="accent">{activePreset.label}</Pill>
              <span>{activePreset.description}</span>
            </div>

            <details className="jixia-ai-settings-field-guide">
              <summary>Field guide</summary>
              <MetaGrid
                className="jixia-ai-settings-guide"
                items={[
                  { label: "Name", value: "Human label shown in settings and model pickers." },
                  { label: "Provider", value: "Adapter id sent to the API, such as openai, openrouter, local, or custom." },
                  { label: "Base URL", value: "OpenAI-compatible endpoint; Jixia validates and normalizes it server-side." },
                  { label: "Model", value: "Provider model id used for requests, for example gpt-4o-mini or openai/gpt-4o-mini." },
                  { label: "API key", value: "Write-only secret. Blank on edit means keep the encrypted server-side key." },
                  { label: "Default", value: "Personal fallback provider for chat when no provider is selected." }
                ]}
              />
            </details>

            {selectedConfig ? (
              <Notice>
                Saved key: {selectedConfig.hasKey ? "present" : "none"}.
                Leave replacement API key blank to preserve the encrypted server-side key.
              </Notice>
            ) : null}

            <div className="jixia-ai-settings-form-grid">
              <TextField label="Config name" onChange={(value) => updateFormText("name", value)} placeholder="e.g. OpenAI production" required value={form.name} />
              <TextField label="Provider" list="ai-provider-options" onChange={(value) => updateFormText("provider", value)} placeholder="openai" required value={form.provider} />
              <TextField label="Base URL" onChange={(value) => updateFormText("baseURL", value)} placeholder="https://api.openai.com/v1" required value={form.baseURL} />
              <TextField label="Model" onChange={(value) => updateFormText("model", value)} placeholder="gpt-4o-mini" required value={form.model} />
              <TextField
                inputMode="decimal"
                label="Temperature"
                onChange={(value) => updateFormText("temperature", value)}
                placeholder="0.2"
                required
                value={form.temperature}
              />
              <TextField
                inputMode="numeric"
                label="Max tokens"
                onChange={(value) => updateFormText("maxTokens", value)}
                placeholder="4096"
                required
                value={form.maxTokens}
              />
            </div>

            <datalist id="ai-provider-options">
              <option value="openai" />
              <option value="openrouter" />
              <option value="self-hosted" />
              <option value="custom" />
            </datalist>

            <Field label={selectedConfig ? "Replacement API key" : "API key"}>
              <input
                autoComplete="new-password"
                onChange={(event) => updateFormText("apiKey", event.currentTarget.value)}
                placeholder={selectedConfig ? "Leave blank to keep current server key" : "Optional; sent once if entered"}
                type="password"
                value={form.apiKey}
              />
            </Field>

            <label className="jixia-ai-settings-default-toggle">
              <input
                checked={form.isDefault}
                onChange={(event) => setForm({ ...form, isDefault: event.currentTarget.checked })}
                type="checkbox"
              />
              <span>Set this as my personal default config</span>
            </label>

            {formMessage ? (
              <Notice role={formMessageTone === "danger" ? "alert" : "status"} tone={formMessageTone}>
                {formMessage}
              </Notice>
            ) : null}

            <HealthCheckCard healthCheck={activeHealthCheck} />

            <div className="jixia-ai-settings-actions">
              <Button
                disabled={activeHealthCheck.status === "testing"}
                onClick={() => selectedConfig ? void handleTestSaved(selectedConfig, true) : void handleTestDraft()}
              >
                {activeHealthCheck.status === "testing" ? "Testing…" : selectedConfig ? "Test edited config" : "Test draft config"}
              </Button>
              <Button disabled={submitState === "submitting"} type="submit" variant="primary">
                {submitState === "submitting" ? "Saving…" : selectedConfig ? "Save config" : "Create config"}
              </Button>
              {onOpenChat && (submitState === "saved" || activeHealthCheck.status === "passed") ? <Button onClick={onOpenChat}>Back to chat</Button> : null}
            </div>
          </form>
        </Pane>
      </SplitPane>
    </>
  );

  if (embedded) {
    return settingsContent;
  }

  return (
    <WorkbenchSurface aria-labelledby="ai-settings-title" width="full">
      <SurfaceHeader
        actions={
          <>
            {onBackToWorkspace ? <Button onClick={onBackToWorkspace}>← Projects</Button> : null}
            {onOpenUsage ? <Button onClick={onOpenUsage}>Open usage summary</Button> : null}
          </>
        }
        description="The API returns only your provider metadata plus safe key status. Full API keys are accepted only as write-only replacement values and are never re-rendered by this UI."
        eyebrow="Personal AI settings"
        title="Configure AI providers from safe presets."
        titleId="ai-settings-title"
      />

      {settingsContent}
    </WorkbenchSurface>
  );
}

type TextFieldProps = {
  readonly inputMode?: "decimal" | "numeric";
  readonly label: string;
  readonly list?: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly value: string;
};

function TextField({ inputMode, label, list, onChange, placeholder, required = false, value }: TextFieldProps) {
  return (
    <Field label={label}>
      <input
        inputMode={inputMode}
        list={list}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder={placeholder}
        required={required}
        type="text"
        value={value}
      />
    </Field>
  );
}

type ProviderConfigCardProps = {
  readonly config: AIProviderConfigView;
  readonly healthCheck: HealthCheckState;
  readonly isSelected: boolean;
  readonly onDelete: () => void;
  readonly onEdit: () => void;
  readonly onOpenChat?: () => void;
  readonly onSetDefault: () => void;
  readonly onTest: () => void;
};

function ProviderConfigCard({
  config,
  healthCheck,
  isSelected,
  onDelete,
  onEdit,
  onOpenChat,
  onSetDefault,
  onTest
}: ProviderConfigCardProps) {
  return (
    <article aria-current={isSelected ? "true" : undefined} className="jixia-ai-provider-card">
      <div className="jixia-ai-provider-card__header">
        <div>
          <strong>{config.name}</strong>
          <span>{config.provider} · {config.model}</span>
        </div>
        <div className="jixia-ai-provider-card__pills">
          {config.isDefault ? <Pill tone="accent">Default</Pill> : null}
          <Pill tone={config.hasKey ? "success" : "warning"}>{config.hasKey ? "Key saved" : "No key"}</Pill>
          <Pill tone={healthCheck.status === "passed" ? "success" : healthCheck.status === "failed" ? "danger" : "neutral"}>
            {healthLabel(healthCheck)}
          </Pill>
        </div>
      </div>
      <div className="jixia-ai-provider-card__meta">
        <span>{config.baseURL}</span>
        <span>temp {config.temperature} · {config.maxTokens} tokens · {config.hasKey ? "server key present" : "missing key"}</span>
      </div>
      <HealthCheckCard healthCheck={healthCheck} compact />
      <div className="jixia-ai-provider-card__actions">
        <Button onClick={onTest}>{healthCheck.status === "testing" ? `Testing ${config.name}…` : `Test ${config.name}`}</Button>
        <Button onClick={onEdit}>Edit {config.name}</Button>
        <Button disabled={config.isDefault} onClick={onSetDefault}>Set default</Button>
        {onOpenChat && healthCheck.status === "passed" && !isSelected ? <Button onClick={onOpenChat} variant="primary">Back to chat</Button> : null}
        <Button onClick={onDelete} variant="danger">Delete {config.name}</Button>
      </div>
    </article>
  );
}

function HealthCheckCard({ healthCheck, compact = false }: { readonly compact?: boolean; readonly healthCheck: HealthCheckState }) {
  if (healthCheck.status === "idle") {
    return compact ? null : (
      <div className="jixia-ai-health-card">
        <strong>Provider test not run</strong>
        <span>Test the draft or saved config before starting a conversation.</span>
      </div>
    );
  }

  if (healthCheck.status === "testing") {
    return (
      <div className="jixia-ai-health-card jixia-ai-health-card--testing" role="status">
        <strong>Testing provider through Jixia API…</strong>
        <span>Keys stay server-side; the browser receives only safe health metadata.</span>
      </div>
    );
  }

  const result = healthCheck.result;
  return (
    <div className={`jixia-ai-health-card jixia-ai-health-card--${healthCheck.status}`} role={healthCheck.status === "failed" ? "alert" : "status"}>
      <strong>{healthCheck.status === "passed" ? "Connection verified" : "Connection failed"}</strong>
      <span>{result?.message ?? "The provider test did not return details."}</span>
      {result ? (
        <small>
          {result.provider} · {result.model} · {result.baseURL} · {result.latencyMs}ms · {result.category ?? "ok"}
        </small>
      ) : null}
    </div>
  );
}

function formFromPreset(preset: ProviderPreset): FormState {
  return {
    presetId: preset.id,
    name: preset.name,
    provider: preset.provider,
    baseURL: preset.baseURL,
    model: preset.model,
    temperature: String(preset.temperature),
    maxTokens: String(preset.maxTokens),
    apiKey: "",
    isDefault: false
  };
}

function presetById(presetId: ProviderPresetId): ProviderPreset {
  return providerPresets.find((preset) => preset.id === presetId) ?? customProviderPreset;
}

function withInferredPreset(form: FormState): FormState {
  return {
    ...form,
    presetId: inferPresetId(form.provider, form.baseURL)
  };
}

function inferPresetId(provider: string, baseURL: string): ProviderPresetId {
  const normalizedProvider = provider.trim().toLowerCase();
  const normalizedBaseURL = normalizePresetBaseURL(baseURL);
  const match = providerPresets.find(
    (preset) =>
      preset.id !== "custom" &&
      preset.provider === normalizedProvider &&
      normalizePresetBaseURL(preset.baseURL) === normalizedBaseURL
  );
  return match?.id ?? "custom";
}

function normalizePresetBaseURL(baseURL: string): string {
  return baseURL.trim().replace(/\/+$/, "").toLowerCase();
}

type ParsedForm =
  | {
      readonly ok: true;
      readonly payload: Omit<CreateAIProviderConfigRequest, "apiKey">;
    }
  | { readonly ok: false; readonly message: string };

function parseForm(form: FormState): ParsedForm {
  const temperature = Number(form.temperature);
  const maxTokens = Number(form.maxTokens);

  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    return { ok: false, message: "Temperature must be a number between 0 and 2." };
  }

  if (!Number.isInteger(maxTokens) || maxTokens <= 0) {
    return { ok: false, message: "Max tokens must be a positive integer." };
  }

  return {
    ok: true,
    payload: {
      name: form.name.trim(),
      provider: form.provider.trim(),
      baseURL: form.baseURL.trim(),
      model: form.model.trim(),
      temperature,
      maxTokens,
      isDefault: form.isDefault
    }
  };
}

function createPayloadFromForm(
  formPayload: Omit<CreateAIProviderConfigRequest, "apiKey">,
  apiKey: string
): CreateAIProviderConfigRequest {
  const trimmedApiKey = apiKey.trim();
  return trimmedApiKey ? { ...formPayload, apiKey: trimmedApiKey } : formPayload;
}

function savedTestPayloadFromForm(form: FormState): UpdateAIProviderConfigRequest {
  const parsed = parseForm(form);
  if (!parsed.ok) {
    return {};
  }

  return createPayloadFromForm(parsed.payload, form.apiKey);
}

function stateFromHealthCheck(result: ProviderHealthCheck): HealthCheckState {
  return { status: result.ok ? "passed" : "failed", result };
}

function healthLabel(healthCheck: HealthCheckState): string {
  switch (healthCheck.status) {
    case "testing":
      return "Testing";
    case "passed":
      return "Test passed";
    case "failed":
      return "Test failed";
    case "idle":
      return "Untested";
  }
}

function updatePayloadFromForm(
  formPayload: Omit<CreateAIProviderConfigRequest, "apiKey">,
  apiKey: string
): UpdateAIProviderConfigRequest {
  const trimmedApiKey = apiKey.trim();
  return trimmedApiKey ? { ...formPayload, apiKey: trimmedApiKey } : formPayload;
}

function compareConfigs(left: AIProviderConfigView, right: AIProviderConfigView): number {
  if (left.isDefault !== right.isDefault) {
    return left.isDefault ? -1 : 1;
  }

  return left.name.localeCompare(right.name);
}
