import type {
  AIModelProfileResponse,
  AIModelProfileView,
  CreateAIModelProfileRequest,
  DeleteAIModelProfileResponse,
  DiscoverAIModelsResponse,
  AIProviderConfigListResponse,
  AIProviderConfigResponse,
  AIProviderConfigView,
  CreateAIProviderConfigRequest,
  ProviderHealthCheck,
  TestAIProviderSavedRequest,
  TestAIProviderConfigResponse,
  UpdateAIModelProfileRequest,
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
  readonly modelDisplayName: string;
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
  readonly modelDisplayName: string;
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

type DiscoveryState = {
  readonly status: "idle" | "discovering" | "discovered" | "empty" | "error";
  readonly result: DiscoverAIModelsResponse | null;
  readonly message: string | null;
};

const idleDiscoveryState: DiscoveryState = { status: "idle", result: null, message: null };

const providerPresets = [
  {
    id: "openai",
    label: "OpenAI",
    name: "OpenAI GPT-4o mini",
    provider: "openai",
    baseURL: "https://api.openai.com/v1",
    modelDisplayName: "GPT-4o mini",
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
    modelDisplayName: "OpenAI GPT-4o mini",
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
    modelDisplayName: "Llama 3.1",
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
    modelDisplayName: "Default model",
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
  const [editingModelProfileId, setEditingModelProfileId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "error" | "saved">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [formMessageTone, setFormMessageTone] = useState<"info" | "success" | "warning" | "danger">("info");
  const [healthChecks, setHealthChecks] = useState<Readonly<Record<string, HealthCheckState>>>({});
  const [discoveries, setDiscoveries] = useState<Readonly<Record<string, DiscoveryState>>>({});

  const selectedConfig = useMemo(
    () => configs.find((config) => config.id === selectedConfigId) ?? null,
    [configs, selectedConfigId]
  );
  const editingModelProfile = selectedConfig?.modelProfiles.find((profile) => profile.id === editingModelProfileId) ?? null;
  const activePreset = useMemo(() => presetById(form.presetId), [form.presetId]);
  const activeHealthKey = selectedConfig?.id ?? "draft";
  const activeHealthCheck = healthChecks[activeHealthKey] ?? { status: "idle", result: null };
  const activeDiscovery = selectedConfig ? discoveries[selectedConfig.id] ?? idleDiscoveryState : idleDiscoveryState;

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
    setEditingModelProfileId(null);
    setForm(emptyForm);
    setSubmitState("idle");
    setFormMessage(null);
    setFormMessageTone("info");
    clearDraftHealthCheck();
  }

  function startEdit(config: AIProviderConfigView): void {
    const modelProfile = defaultModelProfile(config);
    setSelectedConfigId(config.id);
    setEditingModelProfileId(null);
    setForm({
      presetId: inferPresetId(config.provider, config.baseURL),
      name: config.name,
      provider: config.provider,
      baseURL: config.baseURL,
      modelDisplayName: modelProfile?.displayName ?? "Default model",
      model: modelProfile?.model ?? "",
      temperature: String(modelProfile?.temperature ?? 0.2),
      maxTokens: String(modelProfile?.maxTokens ?? 4096),
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

    const parsedAccount = parseProviderAccountForm(form);
    if (!parsedAccount.ok) {
      setSubmitState("error");
      setFormMessage(parsedAccount.message);
      setFormMessageTone("danger");
      return;
    }

    try {
      if (selectedConfig) {
        const payload = updatePayloadFromForm(parsedAccount.payload, form.apiKey);
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

      const payload: CreateAIProviderConfigRequest = createPayloadFromForm(parsedAccount.payload, form.apiKey);
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
        modelDisplayName: defaultModelProfile(response.config)?.displayName ?? form.modelDisplayName,
        model: defaultModelProfile(response.config)?.model ?? form.model,
        temperature: String(defaultModelProfile(response.config)?.temperature ?? form.temperature),
        maxTokens: String(defaultModelProfile(response.config)?.maxTokens ?? form.maxTokens),
        apiKey: "",
        isDefault: response.config.isDefault
      });
      setSubmitState("saved");
      setFormMessage(response.config.hasKey
        ? "AI provider account created. Discover models from the saved server-owned connection next."
        : "AI provider account created. Add a write-only key before discovering models.");
      setFormMessageTone("success");
      moveDraftHealthCheckToConfig(response.config.id);
      if (response.config.hasKey) {
        await handleDiscoverModels(response.config);
      }
    } catch (error) {
      setSubmitState("error");
      setFormMessage(error instanceof Error ? error.message : "Unable to save AI provider config.");
      setFormMessageTone("danger");
    }
  }

  async function handleDiscoverModels(config: AIProviderConfigView): Promise<void> {
    if (!config.hasKey) {
      setDiscovery(config.id, {
        status: "error",
        result: null,
        message: "Add a saved provider key before discovering models."
      });
      setFormMessage("Add a write-only provider key before discovering models.");
      setFormMessageTone("warning");
      return;
    }

    setDiscovery(config.id, { status: "discovering", result: null, message: null });
    setFormMessage(null);

    try {
      const response = await apiFetch<DiscoverAIModelsResponse>(
        `/ai/configs/${encodeURIComponent(config.id)}/discover-models`,
        { method: "POST" }
      );
      upsertConfig(response.config);
      const status = response.discovered === 0 ? "empty" : "discovered";
      const summary = response.discovered === 0
        ? response.warnings?.[0] ?? "Provider returned no models."
        : `Discovered ${response.discovered} models: ${response.created} new, ${response.skipped} already present.`;
      setDiscovery(config.id, { status, result: response, message: summary });
      setFormMessage(summary);
      setFormMessageTone(status === "empty" ? "warning" : "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to discover provider models.";
      setDiscovery(config.id, { status: "error", result: null, message });
      setFormMessage(message);
      setFormMessageTone("danger");
    }
  }

  async function handleTestDraft(): Promise<void> {
    const parsedAccount = parseProviderAccountForm(form);
    const parsedProfile = parseModelProfileForm(form);
    if (!parsedAccount.ok) {
      setFormMessage(parsedAccount.message);
      setFormMessageTone("danger");
      return;
    }

    if (!parsedProfile.ok) {
      setFormMessage(parsedProfile.message);
      setFormMessageTone("danger");
      return;
    }

    setHealthCheck("draft", { status: "testing", result: null });
    setFormMessage(null);

    try {
      const response = await apiFetch<TestAIProviderConfigResponse>("/ai/configs/test", {
        method: "POST",
        json: draftTestPayloadFromForm(parsedAccount.payload, parsedProfile.payload, form.apiKey)
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

  async function handleTestSaved(
    config: AIProviderConfigView,
    includeFormOverrides = false,
    modelProfile?: AIModelProfileView
  ): Promise<void> {
    const key = config.id;
    setHealthCheck(key, { status: "testing", result: null });
    setFormMessage(null);

    try {
      const payload = includeFormOverrides
        ? savedTestPayloadFromForm(form)
        : modelProfile ? { modelProfileId: modelProfile.id } : {};
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

  async function handleAddModelProfile(config: AIProviderConfigView): Promise<void> {
    const parsed = parseModelProfileForm(form, { isDefault: false });
    if (!parsed.ok) {
      setFormMessage(parsed.message);
      setFormMessageTone("danger");
      return;
    }

    setFormMessage(null);

    try {
      const response = await apiFetch<AIModelProfileResponse>(
        `/ai/configs/${encodeURIComponent(config.id)}/model-profiles`,
        {
          method: "POST",
          json: parsed.payload
        }
      );
      upsertConfig(response.config);
      setFormMessage(`Model profile ${response.modelProfile.displayName} added under ${config.name}.`);
      setFormMessageTone("success");
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Unable to add model profile.");
      setFormMessageTone("danger");
    }
  }

  async function handleSaveModelProfile(config: AIProviderConfigView, profile: AIModelProfileView): Promise<void> {
    const parsed = parseModelProfileForm(form);
    if (!parsed.ok) {
      setFormMessage(parsed.message);
      setFormMessageTone("danger");
      return;
    }

    const payload: UpdateAIModelProfileRequest = {
      displayName: parsed.payload.displayName,
      model: parsed.payload.model,
      temperature: parsed.payload.temperature,
      maxTokens: parsed.payload.maxTokens
    };
    setFormMessage(null);

    try {
      const response = await apiFetch<AIModelProfileResponse>(
        `/ai/configs/${encodeURIComponent(config.id)}/model-profiles/${encodeURIComponent(profile.id)}`,
        {
          method: "PATCH",
          json: payload
        }
      );
      upsertConfig(response.config);
      setEditingModelProfileId(null);
      setFormMessage(`Model profile ${response.modelProfile.displayName} updated under ${config.name}.`);
      setFormMessageTone("success");
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Unable to update model profile.");
      setFormMessageTone("danger");
    }
  }

  async function handleToggleModelProfileEnabled(config: AIProviderConfigView, profile: AIModelProfileView): Promise<void> {
    setFormMessage(null);

    try {
      const response = await apiFetch<AIModelProfileResponse>(
        `/ai/configs/${encodeURIComponent(config.id)}/model-profiles/${encodeURIComponent(profile.id)}`,
        {
          method: "PATCH",
          json: { enabled: !profile.enabled }
        }
      );
      upsertConfig(response.config);
      setFormMessage(`${response.modelProfile.displayName} is now ${response.modelProfile.enabled ? "enabled" : "disabled"}.`);
      setFormMessageTone("success");
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Unable to update model profile status.");
      setFormMessageTone("danger");
    }
  }

  function handleStartEditModelProfile(profile: AIModelProfileView): void {
    setEditingModelProfileId(profile.id);
    setForm((currentForm) => ({
      ...currentForm,
      modelDisplayName: profile.displayName,
      model: profile.model,
      temperature: String(profile.temperature),
      maxTokens: String(profile.maxTokens)
    }));
    setFormMessage(null);
    setFormMessageTone("info");
  }

  function handleCancelModelProfileEdit(): void {
    setEditingModelProfileId(null);
    setFormMessage(null);
    setFormMessageTone("info");
  }

  async function handleSetDefaultModelProfile(config: AIProviderConfigView, profile: AIModelProfileView): Promise<void> {
    setFormMessage(null);

    try {
      const response = await apiFetch<AIModelProfileResponse>(
        `/ai/configs/${encodeURIComponent(config.id)}/model-profiles/${encodeURIComponent(profile.id)}/default`,
        { method: "POST" }
      );
      upsertConfig(response.config);
      setFormMessage(`${response.modelProfile.displayName} is now the default model for ${config.name}.`);
      setFormMessageTone("success");
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Unable to set default model profile.");
      setFormMessageTone("danger");
    }
  }

  async function handleDeleteModelProfile(config: AIProviderConfigView, profile: AIModelProfileView): Promise<void> {
    if (!window.confirm(`Delete model profile ${profile.displayName}? Provider credentials remain saved.`)) {
      return;
    }

    setFormMessage(null);

    try {
      const response = await apiFetch<DeleteAIModelProfileResponse>(
        `/ai/configs/${encodeURIComponent(config.id)}/model-profiles/${encodeURIComponent(profile.id)}`,
        { method: "DELETE" }
      );
      upsertConfig(response.config);
      setFormMessage(`${profile.displayName} removed from ${config.name}.`);
      setFormMessageTone("success");
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Unable to delete model profile.");
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
      modelDisplayName: preset.modelDisplayName,
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

  function setDiscovery(key: string, value: DiscoveryState): void {
    setDiscoveries((current) => ({ ...current, [key]: value }));
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
                    discovery: discoveries[config.id] ?? idleDiscoveryState,
                    healthCheck: healthChecks[config.id] ?? { status: "idle", result: null },
                    isSelected: selectedConfigId === config.id,
                    onDelete: () => void handleDelete(config),
                    onDiscover: () => void handleDiscoverModels(config),
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
              {activePreset.keyInstruction} Connect the provider account first, then discover models through the Jixia API. The API key field is write-only: saved keys are never rendered, and editing without typing a replacement omits apiKey from PATCH.
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
                  { label: "Provider account", value: "Name, provider id, base URL, key status, and personal default live on the account." },
                  { label: "Base URL", value: "OpenAI-compatible endpoint; Jixia validates and normalizes it server-side." },
                  { label: "Model discovery", value: "Jixia uses the saved server-side key to discover model ids and normalize them into selectable profiles." },
                  { label: "API key", value: "Write-only secret. Blank on edit means keep the encrypted server-side key." },
                  { label: "Provider default", value: "Personal fallback provider account for chat setup." },
                  { label: "Manual fallback", value: "Advanced model entry remains available when a compatible provider cannot list models." }
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
              <TextField label="Provider account name" onChange={(value) => updateFormText("name", value)} placeholder="e.g. OpenAI production" required value={form.name} />
              <TextField label="Provider" list="ai-provider-options" onChange={(value) => updateFormText("provider", value)} placeholder="openai" required value={form.provider} />
              <TextField label="Base URL" onChange={(value) => updateFormText("baseURL", value)} placeholder="https://api.openai.com/v1" required value={form.baseURL} />
            </div>

            <section className="jixia-ai-model-profile-editor" aria-label="Model profile editor">
              <div>
                <strong>{selectedConfig ? editingModelProfile ? "Edit model profile" : "Advanced manual model fallback" : "Advanced manual model fallback"}</strong>
                <span>
                  {selectedConfig && editingModelProfile
                    ? `Update ${editingModelProfile.displayName}; provider credentials remain account-level.`
                    : selectedConfig
                    ? "Use this only when discovery returns no usable models or the provider cannot list models."
                    : "Save the provider connection first; discovery is the primary way to create selectable model profiles."}
                </span>
              </div>
              <div className="jixia-ai-settings-form-grid">
                <TextField label="Model profile name" onChange={(value) => updateFormText("modelDisplayName", value)} placeholder="e.g. Fast draft model" value={form.modelDisplayName} />
                <TextField label="Model" onChange={(value) => updateFormText("model", value)} placeholder="gpt-4o-mini" value={form.model} />
                <TextField
                  inputMode="decimal"
                  label="Temperature"
                  onChange={(value) => updateFormText("temperature", value)}
                  placeholder="0.2"
                  value={form.temperature}
                />
                <TextField
                  inputMode="numeric"
                  label="Max tokens"
                  onChange={(value) => updateFormText("maxTokens", value)}
                  placeholder="4096"
                  value={form.maxTokens}
                />
              </div>
              {selectedConfig ? (
                <div className="jixia-ai-provider-card__actions">
                  {editingModelProfile ? (
                    <>
                      <Button onClick={() => void handleSaveModelProfile(selectedConfig, editingModelProfile)} type="button">
                        Save model profile
                      </Button>
                      <Button onClick={handleCancelModelProfileEdit} type="button" variant="ghost">Cancel model edit</Button>
                    </>
                  ) : (
                    <Button onClick={() => void handleAddModelProfile(selectedConfig)} type="button">
                      Add model profile
                    </Button>
                  )}
                </div>
              ) : null}
            </section>

            {selectedConfig ? (
              <ModelProfileList
                config={selectedConfig}
                onDelete={(profile) => void handleDeleteModelProfile(selectedConfig, profile)}
                onEdit={handleStartEditModelProfile}
                onSetDefault={(profile) => void handleSetDefaultModelProfile(selectedConfig, profile)}
                onTest={(profile) => void handleTestSaved(selectedConfig, false, profile)}
                onToggleEnabled={(profile) => void handleToggleModelProfileEnabled(selectedConfig, profile)}
              />
            ) : null}

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
              <span>Set this as my personal default provider account</span>
            </label>

            {formMessage ? (
              <Notice role={formMessageTone === "danger" ? "alert" : "status"} tone={formMessageTone}>
                {formMessage}
              </Notice>
            ) : null}

            <HealthCheckCard healthCheck={activeHealthCheck} />
            {selectedConfig ? <DiscoveryCard discovery={activeDiscovery} /> : null}

            <div className="jixia-ai-settings-actions">
              <Button
                disabled={activeHealthCheck.status === "testing"}
                onClick={() => selectedConfig ? void handleTestSaved(selectedConfig, true) : void handleTestDraft()}
              >
                {activeHealthCheck.status === "testing" ? "Testing…" : selectedConfig ? "Test provider with profile draft" : "Test draft provider and model"}
              </Button>
              {selectedConfig ? (
                <Button
                  disabled={!selectedConfig.hasKey || activeDiscovery.status === "discovering"}
                  onClick={() => void handleDiscoverModels(selectedConfig)}
                  type="button"
                  variant="primary"
                >
                  {activeDiscovery.status === "discovering" ? "Discovering models…" : "Discover models"}
                </Button>
              ) : null}
              <Button disabled={submitState === "submitting"} type="submit" variant="primary">
                {submitState === "submitting" ? "Saving…" : selectedConfig ? "Save provider account" : "Create provider account"}
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
  readonly discovery: DiscoveryState;
  readonly healthCheck: HealthCheckState;
  readonly isSelected: boolean;
  readonly onDelete: () => void;
  readonly onDiscover: () => void;
  readonly onEdit: () => void;
  readonly onOpenChat?: () => void;
  readonly onSetDefault: () => void;
  readonly onTest: () => void;
};

function ProviderConfigCard({
  config,
  discovery,
  healthCheck,
  isSelected,
  onDelete,
  onDiscover,
  onEdit,
  onOpenChat,
  onSetDefault,
  onTest
}: ProviderConfigCardProps) {
  const profile = defaultModelProfile(config);
  return (
    <article aria-current={isSelected ? "true" : undefined} className="jixia-ai-provider-card">
      <div className="jixia-ai-provider-card__header">
        <div>
          <strong>{config.name}</strong>
          <span>{config.provider} · {config.modelProfiles.length} model {config.modelProfiles.length === 1 ? "profile" : "profiles"}</span>
        </div>
        <div className="jixia-ai-provider-card__pills">
          {config.isDefault ? <Pill tone="accent">Default</Pill> : null}
          <Pill tone={config.hasKey ? "success" : "warning"}>{config.hasKey ? "Key saved" : "No key"}</Pill>
          <Pill tone={healthCheck.status === "passed" ? "success" : healthCheck.status === "failed" ? "danger" : "neutral"}>
            {healthLabel(healthCheck)}
          </Pill>
          <Pill tone={discovery.status === "discovered" ? "success" : discovery.status === "error" ? "danger" : discovery.status === "empty" ? "warning" : "neutral"}>
            {discoveryLabel(discovery, config)}
          </Pill>
        </div>
      </div>
      <div className="jixia-ai-provider-card__meta">
        <span>{config.baseURL}</span>
        <span>{profile ? `default ${profile.displayName} · ${profile.model}` : "no model profiles"} · {config.hasKey ? "server key present" : "missing key"}</span>
      </div>
      <HealthCheckCard healthCheck={healthCheck} compact />
      <DiscoveryCard compact discovery={discovery} />
      <div className="jixia-ai-provider-card__actions">
        <Button onClick={onTest}>{healthCheck.status === "testing" ? `Testing ${config.name}…` : `Test ${config.name}`}</Button>
        <Button disabled={!config.hasKey || discovery.status === "discovering"} onClick={onDiscover} variant="primary">
          {discovery.status === "discovering" ? "Discovering…" : "Discover models"}
        </Button>
        <Button onClick={onEdit}>Edit {config.name}</Button>
        <Button disabled={config.isDefault} onClick={onSetDefault}>Set default</Button>
        {onOpenChat && healthCheck.status === "passed" && !isSelected ? <Button onClick={onOpenChat} variant="primary">Back to chat</Button> : null}
        <Button onClick={onDelete} variant="danger">Delete {config.name}</Button>
      </div>
    </article>
  );
}

type ModelProfileListProps = {
  readonly config: AIProviderConfigView;
  readonly onDelete: (profile: AIModelProfileView) => void;
  readonly onEdit: (profile: AIModelProfileView) => void;
  readonly onSetDefault: (profile: AIModelProfileView) => void;
  readonly onTest: (profile: AIModelProfileView) => void;
  readonly onToggleEnabled: (profile: AIModelProfileView) => void;
};

function ModelProfileList({ config, onDelete, onEdit, onSetDefault, onTest, onToggleEnabled }: ModelProfileListProps) {
  return (
    <section aria-label="Saved model profiles" className="jixia-ai-model-profile-list">
      <div>
        <strong>Saved model profiles</strong>
        <span>Selectable models under {config.name}. Provider key and base URL remain account-level.</span>
      </div>
      {config.modelProfiles.length === 0 ? (
        <div className="jixia-ai-model-profile-row">
          <span>No model profiles saved for this provider account.</span>
        </div>
      ) : config.modelProfiles.map((profile) => (
        <article className="jixia-ai-model-profile-row" key={profile.id}>
          <div>
            <strong>{profile.displayName}</strong>
            <span>{profile.model} · temp {profile.temperature} · {profile.maxTokens} tokens</span>
          </div>
          <div className="jixia-ai-provider-card__pills">
            {profile.isDefault ? <Pill tone="accent">Default model</Pill> : null}
            <Pill tone={profile.enabled ? "success" : "warning"}>{profile.enabled ? "Enabled" : "Disabled"}</Pill>
          </div>
          <div className="jixia-ai-provider-card__actions">
            <Button onClick={() => onTest(profile)} type="button">Test model</Button>
            <Button onClick={() => onEdit(profile)} type="button">Edit model</Button>
            <Button onClick={() => onToggleEnabled(profile)} type="button" variant={profile.enabled ? "ghost" : "secondary"}>
              {profile.enabled ? "Disable model" : "Enable model"}
            </Button>
            <Button disabled={profile.isDefault} onClick={() => onSetDefault(profile)} type="button">Set model default</Button>
            <Button onClick={() => onDelete(profile)} type="button" variant="danger">Delete model</Button>
          </div>
        </article>
      ))}
    </section>
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

function DiscoveryCard({ discovery, compact = false }: { readonly compact?: boolean; readonly discovery: DiscoveryState }) {
  if (discovery.status === "idle") {
    return compact ? null : (
      <div className="jixia-ai-health-card">
        <strong>Model discovery not run</strong>
        <span>Discover models after the provider connection has a saved server-side key.</span>
      </div>
    );
  }

  if (discovery.status === "discovering") {
    return (
      <div className="jixia-ai-health-card jixia-ai-health-card--testing" role="status">
        <strong>Discovering models through Jixia API…</strong>
        <span>The browser does not call provider /models endpoints or receive key material.</span>
      </div>
    );
  }

  return (
    <div className={`jixia-ai-health-card jixia-ai-health-card--${discovery.status === "error" ? "failed" : discovery.status === "empty" ? "failed" : "passed"}`} role={discovery.status === "error" ? "alert" : "status"}>
      <strong>{discovery.status === "discovered" ? "Models discovered" : discovery.status === "empty" ? "No provider models returned" : "Model discovery failed"}</strong>
      <span>{discovery.message ?? "Discovery did not return details."}</span>
      {discovery.result ? (
        <small>
          {discovery.result.discovered} discovered · {discovery.result.created} created · {discovery.result.skipped} already present · {discovery.result.updated} defaults updated
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
    modelDisplayName: preset.modelDisplayName,
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
      readonly payload: Omit<CreateAIProviderConfigRequest, "apiKey" | "defaultModelProfile">;
    }
  | { readonly ok: false; readonly message: string };

type ParsedModelProfileForm =
  | {
      readonly ok: true;
      readonly payload: CreateAIModelProfileRequest;
    }
  | { readonly ok: false; readonly message: string };

function parseProviderAccountForm(form: FormState): ParsedForm {
  if (!form.name.trim()) {
    return { ok: false, message: "Provider account name is required." };
  }

  if (!form.provider.trim()) {
    return { ok: false, message: "Provider is required." };
  }

  if (!form.baseURL.trim()) {
    return { ok: false, message: "Base URL is required." };
  }

  return {
    ok: true,
    payload: {
      name: form.name.trim(),
      provider: form.provider.trim(),
      baseURL: form.baseURL.trim(),
      isDefault: form.isDefault
    }
  };
}

function parseModelProfileForm(
  form: FormState,
  options: { readonly enabled?: boolean; readonly isDefault?: boolean } = {}
): ParsedModelProfileForm {
  const temperature = Number(form.temperature);
  const maxTokens = Number(form.maxTokens);

  if (!form.modelDisplayName.trim()) {
    return { ok: false, message: "Model profile name is required." };
  }

  if (!form.model.trim()) {
    return { ok: false, message: "Model is required." };
  }

  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    return { ok: false, message: "Temperature must be a number between 0 and 2." };
  }

  if (!Number.isInteger(maxTokens) || maxTokens <= 0) {
    return { ok: false, message: "Max tokens must be a positive integer." };
  }

  return {
    ok: true,
    payload: {
      displayName: form.modelDisplayName.trim(),
      model: form.model.trim(),
      temperature,
      maxTokens,
      ...(options.enabled === undefined ? {} : { enabled: options.enabled }),
      ...(options.isDefault === undefined ? {} : { isDefault: options.isDefault })
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

function draftTestPayloadFromForm(
  providerPayload: Omit<CreateAIProviderConfigRequest, "apiKey" | "defaultModelProfile">,
  profilePayload: CreateAIModelProfileRequest,
  apiKey: string
): CreateAIProviderConfigRequest & CreateAIModelProfileRequest {
  const trimmedApiKey = apiKey.trim();
  return {
    ...providerPayload,
    ...profilePayload,
    ...(trimmedApiKey ? { apiKey: trimmedApiKey } : {})
  };
}

function savedTestPayloadFromForm(form: FormState): TestAIProviderSavedRequest {
  const parsed = parseModelProfileForm(form);
  if (!parsed.ok) {
    return {};
  }

  const trimmedApiKey = form.apiKey.trim();
  return {
    model: parsed.payload.model,
    temperature: parsed.payload.temperature,
    maxTokens: parsed.payload.maxTokens,
    ...(trimmedApiKey ? { apiKey: trimmedApiKey } : {})
  };
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

function discoveryLabel(discovery: DiscoveryState, config: AIProviderConfigView): string {
  switch (discovery.status) {
    case "discovering":
      return "Discovering";
    case "discovered":
      return `${discovery.result?.discovered ?? config.modelProfiles.length} discovered`;
    case "empty":
      return "No models";
    case "error":
      return "Discovery failed";
    case "idle":
      return config.modelProfiles.length > 0 ? `${config.modelProfiles.length} saved models` : "Not discovered";
  }
}


function updatePayloadFromForm(
  formPayload: Omit<CreateAIProviderConfigRequest, "apiKey" | "defaultModelProfile">,
  apiKey: string
): UpdateAIProviderConfigRequest {
  const trimmedApiKey = apiKey.trim();
  return trimmedApiKey ? { ...formPayload, apiKey: trimmedApiKey } : formPayload;
}

function defaultModelProfile(config: AIProviderConfigView): AIModelProfileView | null {
  return config.modelProfiles.find((profile) => profile.isDefault && profile.enabled)
    ?? config.modelProfiles.find((profile) => profile.enabled)
    ?? config.modelProfiles[0]
    ?? null;
}

function compareConfigs(left: AIProviderConfigView, right: AIProviderConfigView): number {
  if (left.isDefault !== right.isDefault) {
    return left.isDefault ? -1 : 1;
  }

  return left.name.localeCompare(right.name);
}
