import type {
  AICapabilityFactState,
  AIModelProfileResponse,
  AIModelProfileView,
  AIProviderConfigListResponse,
  AIProviderConfigResponse,
  AIProviderConfigView,
  AIProviderKind,
  CreateAIModelProfileRequest,
  CreateAIProviderConfigRequest,
  DeleteAIModelProfileResponse,
  SyncAIProviderCapabilitiesResponse,
  TestAIProviderConfigResponse,
  UpdateAIModelProfileRequest,
  UpdateAIProviderConfigRequest
} from "@jixia/shared";
import {
  Bot,
  Cable,
  CheckCircle2,
  Cloud,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  RotateCw,
  Settings,
  Trash2
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { apiFetch } from "../../lib/api";
import { localeCatalog, type Locale } from "../i18n/locale";
import {
  Button,
  EmptyState,
  Field,
  Notice,
  Pane,
  Pill,
  SplitPane,
  SurfaceHeader,
  WorkbenchSurface
} from "../layout/workbench";
import { availabilityState, authorizedModelsForProvider } from "./modelOptions";

type AISettingsPageProps = {
  readonly embedded?: boolean;
  readonly locale?: Locale;
  readonly onBackToWorkspace?: () => void;
  readonly onOpenChat?: () => void;
  readonly onOpenUsage?: () => void;
};

type ProviderKind = AIProviderKind;
type AISettingsCopy = ReturnType<typeof localeCatalog>["aiSettings"];

type ConnectionDraft = {
  readonly kind: ProviderKind;
  readonly name: string;
  readonly baseURL: string;
  readonly customBaseURL: string;
  readonly apiKey: string;
  readonly isDefault: boolean;
};

type ManualModelDraft = {
  readonly displayName: string;
  readonly maxTokens: string;
  readonly model: string;
  readonly temperature: string;
};

type ActiveAction = "save" | "verify" | "sync" | "save-model" | "toggle-model" | "default-model" | "delete";
type NoticeState = { readonly content: string; readonly tone: "info" | "success" | "warning" | "danger" } | null;

const providerKinds = ["openai", "openrouter", "anthropic", "openai_compatible"] as const satisfies readonly ProviderKind[];

const managedProviderOrigins: Readonly<Partial<Record<ProviderKind, string>>> = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  anthropic: "https://api.anthropic.com/v1"
};

const emptyManualModelDraft: ManualModelDraft = {
  displayName: "",
  maxTokens: "4096",
  model: "",
  temperature: "0.2"
};

export function AISettingsPage({
  embedded = false,
  locale = "en",
  onBackToWorkspace,
  onOpenChat,
  onOpenUsage
}: AISettingsPageProps) {
  const copy = localeCatalog(locale).aiSettings;
  const [configs, setConfigs] = useState<readonly AIProviderConfigView[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ConnectionDraft>(() => connectionDraftForKind("openai", copy));
  const [manualModelDraft, setManualModelDraft] = useState<ManualModelDraft>(emptyManualModelDraft);
  const [editingManualModelId, setEditingManualModelId] = useState<string | null>(null);
  const [selectedModelProfileId, setSelectedModelProfileId] = useState("");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [activeAction, setActiveAction] = useState<ActiveAction | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);
  const actionLockRef = useRef(false);
  const refreshLockRef = useRef(false);

  const selectedConfig = useMemo(
    () => configs.find((config) => config.id === selectedConfigId) ?? null,
    [configs, selectedConfigId]
  );
  const selectableModels = useMemo(
    () => selectedConfig ? authorizedModelsForProvider(selectedConfig) : [],
    [selectedConfig]
  );
  const chosenModelProfileId = useMemo(
    () => selectModelProfileId(selectedModelProfileId, selectableModels),
    [selectedModelProfileId, selectableModels]
  );
  const chosenModel = selectableModels.find((option) => option.profile.id === chosenModelProfileId)?.profile ?? null;
  const editingManualModel = selectedConfig?.modelProfiles.find((profile) => profile.id === editingManualModelId) ?? null;
  const isMutating = activeAction !== null;
  const providerIdentityChanged = selectedConfig !== null && (
    draft.kind !== providerKindForConfig(selectedConfig)
    || (draft.kind === "openai_compatible" && draft.baseURL.trim() !== selectedConfig.baseURL)
  );
  const providerIdentityLocked = Boolean(selectedConfig?.hasKey && !draft.apiKey.trim());

  useEffect(() => {
    let cancelled = false;

    async function loadConfigs(): Promise<void> {
      setLoadState("loading");

      try {
        const response = await apiFetch<AIProviderConfigListResponse>("/ai/configs");
        if (cancelled) {
          return;
        }

        setConfigs(response.configs);
        setSelectedConfigId((current) => response.configs.some((config) => config.id === current) ? current : null);
        setLoadState("ready");
      } catch (error) {
        if (cancelled) {
          return;
        }

        setLoadState("error");
        setNotice({ content: safeErrorMessage(error, copy.errors.loadConnections), tone: "danger" });
      }
    }

    void loadConfigs();

    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshConfigs(): Promise<boolean> {
    if (refreshLockRef.current) {
      return false;
    }

    refreshLockRef.current = true;
    setLoadState("loading");

    try {
      const response = await apiFetch<AIProviderConfigListResponse>("/ai/configs");
      setConfigs(response.configs);
      setSelectedConfigId((current) => response.configs.some((config) => config.id === current) ? current : null);
      setLoadState("ready");
      return true;
    } catch (error) {
      setLoadState("error");
      setNotice({ content: safeErrorMessage(error, copy.errors.refresh), tone: "danger" });
      return false;
    } finally {
      refreshLockRef.current = false;
    }
  }

  function beginNewConnection(): void {
    setSelectedConfigId(null);
    setDraft(connectionDraftForKind("openai", copy));
    setManualModelDraft(emptyManualModelDraft);
    setEditingManualModelId(null);
    setSelectedModelProfileId("");
    setNotice(null);
  }

  function beginEditConnection(config: AIProviderConfigView): void {
    setSelectedConfigId(config.id);
    setDraft(connectionDraftFromConfig(config));
    setManualModelDraft(emptyManualModelDraft);
    setEditingManualModelId(null);
    setSelectedModelProfileId(defaultModelProfile(config)?.id ?? "");
    setNotice(null);
  }

  function selectProviderKind(kind: ProviderKind): void {
    if (providerIdentityLocked) {
      return;
    }

    setDraft((current) => ({
      ...current,
      kind,
      customBaseURL: current.kind === "openai_compatible" ? current.baseURL : current.customBaseURL,
      baseURL: managedProviderOrigins[kind] ?? current.customBaseURL
    }));
    setNotice(null);
  }

  function beginAction(action: ActiveAction): boolean {
    if (actionLockRef.current) {
      return false;
    }

    actionLockRef.current = true;
    setActiveAction(action);
    return true;
  }

  function completeAction(): void {
    actionLockRef.current = false;
    setActiveAction(null);
  }

  async function saveConnection(event: { readonly preventDefault: () => void }): Promise<void> {
    event.preventDefault();
    if (selectedConfig?.hasKey && !draft.apiKey.trim() && providerIdentityChanged) {
      setNotice({ content: copy.replacementKeyRequired, tone: "warning" });
      return;
    }

    const parsed = parseConnectionDraft(draft, copy);
    if (!parsed.ok) {
      setNotice({ content: parsed.message, tone: "danger" });
      return;
    }

    if (!beginAction("save")) {
      return;
    }
    setNotice(null);

    try {
      const response = selectedConfig
        ? await apiFetch<AIProviderConfigResponse>(`/ai/configs/${encodeURIComponent(selectedConfig.id)}`, {
          method: "PATCH",
          json: updateConnectionPayload(parsed.payload, draft.apiKey)
        })
        : await apiFetch<AIProviderConfigResponse>("/ai/configs", {
          method: "POST",
          json: createConnectionPayload(parsed.payload, draft.apiKey)
        });
      upsertConfig(response.config);
      setSelectedConfigId(response.config.id);
      setDraft(connectionDraftFromConfig(response.config));
      setSelectedModelProfileId(defaultModelProfile(response.config)?.id ?? "");
      setNotice({ content: copy.savedConnection, tone: "success" });
    } catch (error) {
      setNotice({ content: safeErrorMessage(error, copy.errors.saveConnection), tone: "danger" });
    } finally {
      completeAction();
    }
  }

  async function verifyConnection(config: AIProviderConfigView): Promise<void> {
    if (!beginAction("verify")) {
      return;
    }
    setNotice(null);

    try {
      const response = await apiFetch<TestAIProviderConfigResponse>(`/ai/configs/${encodeURIComponent(config.id)}/test`, {
        method: "POST",
        json: {}
      });
      const refreshed = await refreshConfigs();
      if (!refreshed) {
        return;
      }
      const result = response.healthCheck.connection;
      setNotice({
        content: result?.message ?? response.healthCheck.message,
        tone: result?.authentication === "verified" ? "success" : "warning"
      });
    } catch (error) {
      setNotice({ content: safeErrorMessage(error, copy.errors.verifyConnection), tone: "danger" });
    } finally {
      completeAction();
    }
  }

  async function synchronizeCapabilities(config: AIProviderConfigView): Promise<void> {
    if (!config.hasKey) {
      setNotice({ content: copy.syncRequiresKey, tone: "warning" });
      return;
    }

    if (!beginAction("sync")) {
      return;
    }
    setNotice(null);

    try {
      const response = await apiFetch<SyncAIProviderCapabilitiesResponse>(
        `/ai/configs/${encodeURIComponent(config.id)}/capabilities/sync`,
        { method: "POST" }
      );
      upsertConfig(response.config);
      setSelectedModelProfileId(defaultModelProfile(response.config)?.id ?? "");
      setNotice({ content: syncMessage(response, copy), tone: syncTone(response.discovery) });
    } catch (error) {
      setNotice({ content: safeErrorMessage(error, copy.errors.syncCapabilities), tone: "danger" });
    } finally {
      completeAction();
    }
  }

  async function setDefaultModel(config: AIProviderConfigView, modelProfileId: string): Promise<void> {
    if (!modelProfileId) {
      return;
    }

    if (!beginAction("default-model")) {
      return;
    }
    setNotice(null);

    try {
      const response = await apiFetch<AIModelProfileResponse>(
        `/ai/configs/${encodeURIComponent(config.id)}/model-profiles/${encodeURIComponent(modelProfileId)}/default`,
        { method: "POST" }
      );
      upsertConfig(response.config);
      setSelectedModelProfileId(response.modelProfile.id);
      setNotice({ content: copy.defaultModelSaved, tone: "success" });
    } catch (error) {
      setNotice({ content: safeErrorMessage(error, copy.errors.defaultModel), tone: "danger" });
    } finally {
      completeAction();
    }
  }

  async function saveManualModel(config: AIProviderConfigView): Promise<void> {
    const parsed = parseManualModelDraft(manualModelDraft, copy);
    if (!parsed.ok) {
      setNotice({ content: parsed.message, tone: "danger" });
      return;
    }

    if (!beginAction("save-model")) {
      return;
    }
    setNotice(null);

    try {
      const response = editingManualModel
        ? await apiFetch<AIModelProfileResponse>(
          `/ai/configs/${encodeURIComponent(config.id)}/model-profiles/${encodeURIComponent(editingManualModel.id)}`,
          { method: "PATCH", json: updateManualModelPayload(parsed.payload) }
        )
        : await apiFetch<AIModelProfileResponse>(`/ai/configs/${encodeURIComponent(config.id)}/model-profiles`, {
          method: "POST",
          json: parsed.payload
        });
      upsertConfig(response.config);
      setSelectedModelProfileId(response.modelProfile.id);
      setManualModelDraft(emptyManualModelDraft);
      setEditingManualModelId(null);
      setNotice({ content: editingManualModel ? copy.modelUpdated : copy.manualModelSaved, tone: "success" });
    } catch (error) {
      setNotice({ content: safeErrorMessage(error, copy.errors.saveManualModel), tone: "danger" });
    } finally {
      completeAction();
    }
  }

  function beginManualModelEdit(profile: AIModelProfileView): void {
    setEditingManualModelId(profile.id);
    setManualModelDraft({
      displayName: profile.displayName,
      maxTokens: String(profile.maxTokens),
      model: profile.model,
      temperature: String(profile.temperature)
    });
    setNotice(null);
  }

  async function toggleModel(config: AIProviderConfigView, profile: AIModelProfileView): Promise<void> {
    if (!beginAction("toggle-model")) {
      return;
    }
    setNotice(null);

    try {
      const response = await apiFetch<AIModelProfileResponse>(
        `/ai/configs/${encodeURIComponent(config.id)}/model-profiles/${encodeURIComponent(profile.id)}`,
        { method: "PATCH", json: { enabled: !profile.enabled } }
      );
      upsertConfig(response.config);
      setNotice({ content: response.modelProfile.enabled ? copy.modelEnabled : copy.modelDisabled, tone: "success" });
    } catch (error) {
      setNotice({ content: safeErrorMessage(error, copy.errors.updateModel), tone: "danger" });
    } finally {
      completeAction();
    }
  }

  async function deleteManualModel(config: AIProviderConfigView, profile: AIModelProfileView): Promise<void> {
    if (!window.confirm(interpolate(copy.deleteModelConfirm, { name: profile.displayName }))) {
      return;
    }

    if (!beginAction("delete")) {
      return;
    }
    setNotice(null);

    try {
      const response = await apiFetch<DeleteAIModelProfileResponse>(
        `/ai/configs/${encodeURIComponent(config.id)}/model-profiles/${encodeURIComponent(profile.id)}`,
        { method: "DELETE" }
      );
      upsertConfig(response.config);
      if (editingManualModelId === profile.id) {
        setEditingManualModelId(null);
        setManualModelDraft(emptyManualModelDraft);
      }
    } catch (error) {
      setNotice({ content: safeErrorMessage(error, copy.errors.deleteModel), tone: "danger" });
    } finally {
      completeAction();
    }
  }

  async function deleteConnection(config: AIProviderConfigView): Promise<void> {
    if (!window.confirm(interpolate(copy.deleteConnectionConfirm, { name: config.name }))) {
      return;
    }

    if (!beginAction("delete")) {
      return;
    }
    setNotice(null);

    try {
      await apiFetch<{ readonly ok: true }>(`/ai/configs/${encodeURIComponent(config.id)}`, { method: "DELETE" });
      setConfigs((current) => current.filter((item) => item.id !== config.id));
      if (selectedConfigId === config.id) {
        beginNewConnection();
      }
    } catch (error) {
      setNotice({ content: safeErrorMessage(error, copy.errors.deleteConnection), tone: "danger" });
    } finally {
      completeAction();
    }
  }

  function upsertConfig(config: AIProviderConfigView): void {
    setConfigs((current) => {
      const remaining = current.filter((item) => item.id !== config.id);
      const normalized = config.isDefault ? remaining.map((item) => ({ ...item, isDefault: false })) : remaining;
      return [config, ...normalized].sort(compareConfigs);
    });
  }

  const detailTitle = selectedConfig ? copy.editConnection : copy.createConnection;
  const content = (
    <div className="jixia-provider-settings">
      {notice ? <Notice role={notice.tone === "danger" ? "alert" : "status"} tone={notice.tone}>{notice.content}</Notice> : null}
      {loadState === "error" && !notice ? <Notice role="alert" tone="danger">{copy.errors.loadConnections}</Notice> : null}

      <SplitPane className="jixia-provider-settings__layout" sideWidth="344px">
        <Pane
          actions={
            <>
              <Button aria-label={copy.refresh} disabled={loadState === "loading" || isMutating} onClick={() => void refreshConfigs()} title={copy.refresh}>
                <RefreshCw aria-hidden="true" className="jixia-button__icon" size={15} />
              </Button>
              <Button disabled={isMutating} onClick={beginNewConnection} variant="primary">
                <Plus aria-hidden="true" className="jixia-button__icon" size={15} />
                {copy.newConnection}
              </Button>
            </>
          }
          aria-labelledby="provider-connections-title"
          eyebrow={copy.connections}
          title={copy.configuredConnections}
          titleId="provider-connections-title"
        >
          {loadState === "loading" ? <p className="jixia-description">{copy.loading}</p> : null}
          {loadState === "ready" && configs.length === 0 ? (
            <EmptyState description={copy.noConnectionsDescription} title={copy.noConnections} />
          ) : null}
          {configs.length > 0 ? (
            <div className="jixia-provider-connection-list">
              {configs.map((config) => (
                <ProviderConnectionRow
                  config={config}
                  copy={copy}
                  disabled={isMutating}
                  isSelected={config.id === selectedConfigId}
                  key={config.id}
                  onDelete={() => void deleteConnection(config)}
                  onOpen={() => beginEditConnection(config)}
                />
              ))}
            </div>
          ) : null}
        </Pane>

        <Pane aria-labelledby="provider-connection-detail-title" eyebrow={selectedConfig ? copy.connections : copy.newConnection} muted title={detailTitle} titleId="provider-connection-detail-title">
          <form className="jixia-provider-settings__form" onSubmit={(event) => void saveConnection(event)}>
            <ProviderPhase title={copy.chooseProvider}>
              <div className="jixia-provider-kind-grid" role="group" aria-label={copy.chooseProvider}>
                {providerKinds.map((kind) => (
                  <ProviderKindButton
                    copy={copy}
                    disabled={isMutating || providerIdentityLocked}
                    isSelected={draft.kind === kind}
                    key={kind}
                    kind={kind}
                    onSelect={() => selectProviderKind(kind)}
                  />
                ))}
              </div>
            </ProviderPhase>

            <ProviderPhase title={copy.connectionDetails}>
              <div className="jixia-provider-settings__field-grid">
                <Field label={copy.providerName}>
                  <input
                    disabled={isMutating}
                    onChange={(event) => {
                      const name = event.currentTarget.value;
                      setDraft((current) => ({ ...current, name }));
                    }}
                    required
                    value={draft.name}
                  />
                </Field>
                {draft.kind === "openai_compatible" ? (
                  <Field hint={copy.customBaseUrlHint} label={copy.customBaseUrl}>
                    <input
                      disabled={isMutating || providerIdentityLocked}
                      inputMode="url"
                      onChange={(event) => {
                        const baseURL = event.currentTarget.value;
                        setDraft((current) => ({ ...current, baseURL, customBaseURL: baseURL }));
                      }}
                      placeholder="https://provider.example/v1"
                      required
                      value={draft.baseURL}
                    />
                  </Field>
                ) : (
                  <div className="jixia-provider-managed-endpoint">
                    <span>{copy.endpointManaged}</span>
                    <strong>{managedProviderOrigins[draft.kind]}</strong>
                  </div>
                )}
                <Field hint={copy.secretHint} label={selectedConfig ? copy.replacementApiKey : copy.apiKey}>
                  <input
                    autoComplete="new-password"
                    disabled={isMutating}
                    onChange={(event) => {
                      const apiKey = event.currentTarget.value;
                      setDraft((current) => ({ ...current, apiKey }));
                    }}
                    placeholder={selectedConfig ? copy.secretHint : undefined}
                    type="password"
                    value={draft.apiKey}
                  />
                </Field>
              </div>
              {providerIdentityLocked ? <Notice tone="warning">{copy.replacementKeyRequired}</Notice> : null}
              <label className="jixia-provider-default-toggle">
                <input
                  checked={draft.isDefault}
                  disabled={isMutating}
                  onChange={(event) => {
                    const isDefault = event.currentTarget.checked;
                    setDraft((current) => ({ ...current, isDefault }));
                  }}
                  type="checkbox"
                />
                <span>{copy.defaultConnection}</span>
              </label>
              <div className="jixia-provider-settings__actions">
                <Button disabled={isMutating} type="submit" variant="primary">
                  <KeyRound aria-hidden="true" className="jixia-button__icon" size={15} />
                  {activeAction === "save" ? copy.savingConnection : copy.saveConnection}
                </Button>
                {selectedConfig && onOpenChat ? <Button disabled={isMutating} onClick={onOpenChat}>{copy.modelChoice}</Button> : null}
              </div>
            </ProviderPhase>
          </form>

          {selectedConfig ? (
            <div className="jixia-provider-settings__lifecycle">
              <ProviderPhase title={copy.verification}>
                <ConnectionStatus config={selectedConfig} copy={copy} locale={locale} />
                <p className="jixia-provider-phase__hint">{copy.connectionHint}</p>
                <div className="jixia-provider-settings__actions">
                  <Button disabled={isMutating} onClick={() => void verifyConnection(selectedConfig)}>
                    <RotateCw aria-hidden="true" className="jixia-button__icon" size={15} />
                    {activeAction === "verify"
                      ? copy.actions.verifying
                      : selectedConfig.connection?.lastAttemptAt ? copy.actions.retryVerification : copy.actions.verify}
                  </Button>
                </div>
              </ProviderPhase>

              <ProviderPhase title={copy.synchronization}>
                <SyncStatus config={selectedConfig} copy={copy} locale={locale} />
                <p className="jixia-provider-phase__hint">{copy.syncHint}</p>
                <div className="jixia-provider-settings__actions">
                  <Button disabled={isMutating || !selectedConfig.hasKey} onClick={() => void synchronizeCapabilities(selectedConfig)} variant="primary">
                    <Cloud aria-hidden="true" className="jixia-button__icon" size={15} />
                    {activeAction === "sync"
                      ? copy.actions.syncing
                      : selectedConfig.sync?.lastAttemptAt ? copy.actions.retrySync : copy.actions.sync}
                  </Button>
                </div>
              </ProviderPhase>

              <ProviderPhase title={copy.modelChoice}>
                <ModelInventory
                  chosenModel={chosenModel}
                  chosenModelProfileId={chosenModelProfileId}
                  config={selectedConfig}
                  copy={copy}
                  disabled={isMutating}
                  isSavingDefault={activeAction === "default-model"}
                  locale={locale}
                  onChoose={setSelectedModelProfileId}
                  onSetDefault={() => void setDefaultModel(selectedConfig, chosenModelProfileId)}
                  selectableModels={selectableModels}
                />
              </ProviderPhase>

              <details className="jixia-provider-settings__advanced">
                <summary>
                  <Settings aria-hidden="true" className="jixia-provider-settings__summary-icon" size={15} />
                  {copy.advanced}
                </summary>
                <p>{copy.advancedDescription}</p>
                <ManualModelEditor
                  copy={copy}
                  draft={manualModelDraft}
                  editingModel={editingManualModel}
                  onChange={setManualModelDraft}
                  onCancel={() => {
                    setEditingManualModelId(null);
                    setManualModelDraft(emptyManualModelDraft);
                  }}
                  onSave={() => void saveManualModel(selectedConfig)}
                  disabled={isMutating}
                  saving={activeAction === "save-model"}
                />
                <ManualModelList
                  config={selectedConfig}
                  copy={copy}
                  locale={locale}
                  onDelete={(profile) => void deleteManualModel(selectedConfig, profile)}
                  onEdit={beginManualModelEdit}
                  onToggle={(profile) => void toggleModel(selectedConfig, profile)}
                  updating={isMutating}
                />
              </details>
            </div>
          ) : null}
        </Pane>
      </SplitPane>
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <WorkbenchSurface aria-labelledby="ai-settings-title" width="full">
      <SurfaceHeader
        actions={
          <>
            {onBackToWorkspace ? <Button disabled={isMutating} onClick={onBackToWorkspace}>{copy.projects}</Button> : null}
            {onOpenUsage ? <Button disabled={isMutating} onClick={onOpenUsage}>{copy.usage}</Button> : null}
          </>
        }
        description={copy.description}
        eyebrow={copy.eyebrow}
        title={copy.title}
        titleId="ai-settings-title"
      />
      {content}
    </WorkbenchSurface>
  );
}

function ProviderConnectionRow({
  config,
  copy,
  disabled,
  isSelected,
  onDelete,
  onOpen
}: {
  readonly config: AIProviderConfigView;
  readonly copy: AISettingsCopy;
  readonly disabled: boolean;
  readonly isSelected: boolean;
  readonly onDelete: () => void;
  readonly onOpen: () => void;
}) {
  const kind = providerKindForConfig(config);
  const connectionTone = connectionToneFor(config);
  const syncToneValue = syncToneForConfig(config);

  return (
    <article aria-current={isSelected ? "true" : undefined} className="jixia-provider-connection-row">
      <button className="jixia-provider-connection-row__main" disabled={disabled} onClick={onOpen} type="button">
        <ProviderGlyph kind={kind} />
        <span>
          <strong>{config.name}</strong>
          <small>{copy.providerKinds[kind]} · {config.modelProfiles.length} {copy.inventory.toLowerCase()}</small>
        </span>
      </button>
      <div className="jixia-provider-connection-row__status">
        {config.isDefault ? <Pill tone="accent">{copy.defaultConnection}</Pill> : null}
        <Pill tone={connectionTone}>{connectionLabel(config, copy)}</Pill>
        <Pill tone={syncToneValue}>{syncLabel(config, copy)}</Pill>
      </div>
      <div className="jixia-provider-connection-row__actions">
        <Button aria-label={`${copy.actions.edit} ${config.name}`} disabled={disabled} onClick={onOpen} title={`${copy.actions.edit} ${config.name}`}>
          <Pencil aria-hidden="true" className="jixia-button__icon" size={15} />
        </Button>
        <Button aria-label={`${copy.actions.delete} ${config.name}`} disabled={disabled} onClick={onDelete} title={`${copy.actions.delete} ${config.name}`} variant="danger">
          <Trash2 aria-hidden="true" className="jixia-button__icon" size={15} />
        </Button>
      </div>
    </article>
  );
}

function ProviderKindButton({
  copy,
  disabled,
  isSelected,
  kind,
  onSelect
}: {
  readonly copy: AISettingsCopy;
  readonly disabled: boolean;
  readonly isSelected: boolean;
  readonly kind: ProviderKind;
  readonly onSelect: () => void;
}) {
  return (
    <button aria-pressed={isSelected} className="jixia-provider-kind-button" disabled={disabled} onClick={onSelect} type="button">
      <ProviderGlyph kind={kind} />
      <span>
        <strong>{copy.providerKinds[kind]}</strong>
        <small>{copy.providerDescriptions[kind]}</small>
      </span>
      {isSelected ? <CheckCircle2 aria-label={copy.providerKinds[kind]} className="jixia-provider-kind-button__selected" size={16} /> : null}
    </button>
  );
}

function ProviderGlyph({ kind }: { readonly kind: ProviderKind }) {
  const Icon = kind === "anthropic" ? Bot : kind === "openai_compatible" ? Cable : Cloud;
  return <Icon aria-hidden="true" className="jixia-provider-glyph" size={18} strokeWidth={1.8} />;
}

function ProviderPhase({ children, title }: { readonly children: ReactNode; readonly title: string }) {
  return (
    <section className="jixia-provider-phase">
      <h3 className="jixia-provider-phase__title">{title}</h3>
      {children}
    </section>
  );
}

function ConnectionStatus({ config, copy, locale }: { readonly config: AIProviderConfigView; readonly copy: AISettingsCopy; readonly locale: Locale }) {
  const connection = config.connection;
  const transport = connection?.transport ?? "not_checked";
  const authentication = connection?.authentication ?? "not_checked";

  return (
    <div className="jixia-provider-status-band" data-tone={connectionToneFor(config)}>
      <div>
        <strong>{connectionLabel(config, copy)}</strong>
        <span>{connection?.message ?? connectionMessage(config, copy)}</span>
      </div>
      <div className="jixia-provider-status-band__meta">
        <Pill tone={transport === "reachable" ? "success" : transport === "unreachable" ? "danger" : "neutral"}>{transportLabel(transport, copy)}</Pill>
        <Pill tone={authentication === "verified" ? "success" : authentication === "rejected" ? "danger" : "warning"}>{authLabel(authentication, copy)}</Pill>
        {connection?.lastAttemptAt ? <small>{copy.updatedAt} {formatTimestamp(connection.lastAttemptAt, locale)}</small> : null}
      </div>
    </div>
  );
}

function SyncStatus({ config, copy, locale }: { readonly config: AIProviderConfigView; readonly copy: AISettingsCopy; readonly locale: Locale }) {
  const sync = config.sync;
  const discovery = sync?.discovery ?? "not_attempted";
  const freshness = sync?.freshness ?? "never";

  return (
    <div className="jixia-provider-sync-state">
      <div className="jixia-provider-status-band" data-tone={syncToneForConfig(config)}>
        <div>
          <strong>{syncLabel(config, copy)}</strong>
          <span>{sync?.message ?? syncMessageForConfig(config, copy)}</span>
        </div>
        <div className="jixia-provider-status-band__meta">
          <Pill tone={syncToneForConfig(config)}>{freshnessLabel(freshness, copy)}</Pill>
          {sync?.lastSuccessfulSyncAt ? <small>{copy.updatedAt} {formatTimestamp(sync.lastSuccessfulSyncAt, locale)}</small> : null}
        </div>
      </div>
      {discovery === "unsupported" ? <Notice tone="warning">{copy.unsupportedDiscoveryHint}</Notice> : null}
      {discovery === "empty" ? <Notice tone="warning">{copy.emptyInventoryHint}</Notice> : null}
    </div>
  );
}

function ModelInventory({
  chosenModel,
  chosenModelProfileId,
  config,
  copy,
  disabled,
  isSavingDefault,
  locale,
  onChoose,
  onSetDefault,
  selectableModels
}: {
  readonly chosenModel: AIModelProfileView | null;
  readonly chosenModelProfileId: string;
  readonly config: AIProviderConfigView;
  readonly copy: AISettingsCopy;
  readonly disabled: boolean;
  readonly isSavingDefault: boolean;
  readonly locale: Locale;
  readonly onChoose: (modelProfileId: string) => void;
  readonly onSetDefault: () => void;
  readonly selectableModels: readonly { readonly profile: AIModelProfileView }[];
}) {
  return (
    <div className="jixia-provider-inventory">
      {selectableModels.length === 0 ? (
        <Notice tone="warning">{copy.noSelectableModel}</Notice>
      ) : (
        <div className="jixia-provider-default-model-control">
          <Field label={copy.selectModel}>
            <select aria-label={copy.selectModel} disabled={disabled} onChange={(event) => onChoose(event.currentTarget.value)} value={chosenModelProfileId}>
              {selectableModels.map(({ profile }) => (
                <option key={profile.id} value={profile.id}>{modelOptionLabel(profile, copy)}</option>
              ))}
            </select>
          </Field>
          <Button disabled={disabled || isSavingDefault || !chosenModel || chosenModel.isDefault} onClick={onSetDefault} variant="primary">
            {copy.actions.setDefault}
          </Button>
        </div>
      )}

      {config.modelProfiles.length > 0 ? (
        <div className="jixia-provider-model-list" aria-label={copy.inventory}>
          {config.modelProfiles.map((profile) => (
            <ModelInventoryRow copy={copy} key={profile.id} locale={locale} profile={profile} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ModelInventoryRow({ copy, locale, profile }: { readonly copy: AISettingsCopy; readonly locale: Locale; readonly profile: AIModelProfileView }) {
  const availability = availabilityState(profile);

  return (
    <article className="jixia-provider-model-row">
      <div className="jixia-provider-model-row__title">
        <strong>{profile.displayName}</strong>
        <span>{profile.model}</span>
      </div>
      <div className="jixia-provider-model-row__pills">
        {profile.isDefault ? <Pill tone="accent">{copy.defaultModel}</Pill> : null}
        <Pill tone={availability === "available" ? "success" : availability === "unavailable" ? "danger" : "warning"}>{copy.availability[availability]}</Pill>
        <Pill>{profile.origin === "manual" ? copy.origins.manual : copy.origins.discovered}</Pill>
      </div>
      <CapabilityFacts copy={copy} profile={profile} />
      {profile.provenance?.observedAt ? <small>{copy.updatedAt} {formatTimestamp(profile.provenance.observedAt, locale)}</small> : null}
    </article>
  );
}

function CapabilityFacts({ copy, profile }: { readonly copy: AISettingsCopy; readonly profile: AIModelProfileView }) {
  const capabilities = profile.capabilities;
  if (!capabilities) {
    return <div className="jixia-provider-capability-facts"><CapabilityFact copy={copy} label={copy.capabilities.context} state="unknown" /></div>;
  }

  return (
    <div className="jixia-provider-capability-facts">
      <CapabilityFact copy={copy} label={copy.capabilities.context} state={capabilities.contextWindowTokens.state} value={capabilities.contextWindowTokens.value} />
      <CapabilityFact copy={copy} label={copy.capabilities.output} state={capabilities.maxOutputTokens.state} value={capabilities.maxOutputTokens.value} />
      <CapabilityFact copy={copy} label={copy.capabilities.input} state={capabilities.inputModalities.state} values={capabilities.inputModalities.values} />
      <CapabilityFact copy={copy} label={copy.capabilities.outputModalities} state={capabilities.outputModalities.state} values={capabilities.outputModalities.values} />
      <CapabilityFact copy={copy} label={copy.capabilities.parameters} state={capabilities.supportedParameters.state} values={capabilities.supportedParameters.values} />
    </div>
  );
}

function CapabilityFact({
  copy,
  label,
  state,
  value,
  values
}: {
  readonly copy: AISettingsCopy;
  readonly label: string;
  readonly state: AICapabilityFactState;
  readonly value?: number | null;
  readonly values?: readonly string[];
}) {
  const factValue = state === "observed"
    ? value !== undefined && value !== null
      ? value.toLocaleString()
      : values && values.length > 0
        ? compactValues(values)
        : copy.capabilities.observed
    : copy.capabilities[state];
  return <span>{label}: {factValue}</span>;
}

function ManualModelEditor({
  copy,
  disabled,
  draft,
  editingModel,
  onCancel,
  onChange,
  onSave,
  saving
}: {
  readonly copy: AISettingsCopy;
  readonly disabled: boolean;
  readonly draft: ManualModelDraft;
  readonly editingModel: AIModelProfileView | null;
  readonly onCancel: () => void;
  readonly onChange: (draft: ManualModelDraft) => void;
  readonly onSave: () => void;
  readonly saving: boolean;
}) {
  return (
    <div className="jixia-provider-manual-editor">
      <p>{copy.manualModelHint}</p>
      <div className="jixia-provider-settings__field-grid">
        <Field label={copy.displayName}>
          <input disabled={disabled} onChange={(event) => onChange({ ...draft, displayName: event.currentTarget.value })} value={draft.displayName} />
        </Field>
        <Field label={copy.modelIdentifier}>
          <input disabled={disabled} onChange={(event) => onChange({ ...draft, model: event.currentTarget.value })} value={draft.model} />
        </Field>
        <Field label={copy.temperature}>
          <input disabled={disabled} inputMode="decimal" onChange={(event) => onChange({ ...draft, temperature: event.currentTarget.value })} value={draft.temperature} />
        </Field>
        <Field label={copy.maxTokens}>
          <input disabled={disabled} inputMode="numeric" onChange={(event) => onChange({ ...draft, maxTokens: event.currentTarget.value })} value={draft.maxTokens} />
        </Field>
      </div>
      <div className="jixia-provider-settings__actions">
        <Button disabled={disabled || saving} onClick={onSave} variant="primary">
          <Plus aria-hidden="true" className="jixia-button__icon" size={15} />
          {saving ? copy.savingConnection : editingModel ? copy.actions.saveModel : copy.actions.addModel}
        </Button>
        {editingModel ? <Button disabled={disabled} onClick={onCancel}>{copy.actions.cancel}</Button> : null}
      </div>
    </div>
  );
}

function ManualModelList({
  config,
  copy,
  locale,
  onDelete,
  onEdit,
  onToggle,
  updating
}: {
  readonly config: AIProviderConfigView;
  readonly copy: AISettingsCopy;
  readonly locale: Locale;
  readonly onDelete: (profile: AIModelProfileView) => void;
  readonly onEdit: (profile: AIModelProfileView) => void;
  readonly onToggle: (profile: AIModelProfileView) => void;
  readonly updating: boolean;
}) {
  const manualProfiles = config.modelProfiles.filter((profile) => profile.origin !== "discovered");

  return (
    <div className="jixia-provider-manual-list">
      {manualProfiles.map((profile) => (
        <article className="jixia-provider-manual-row" key={profile.id}>
          <div>
            <strong>{profile.displayName}</strong>
            <span>{profile.model} · {profile.enabled ? copy.actions.disable : copy.actions.enable}</span>
            <small>{copy.updatedAt} {formatTimestamp(profile.updatedAt, locale)}</small>
          </div>
          <div className="jixia-provider-manual-row__actions">
            <Button aria-label={`${copy.actions.edit} ${profile.displayName}`} onClick={() => onEdit(profile)} title={`${copy.actions.edit} ${profile.displayName}`}>
              <Pencil aria-hidden="true" className="jixia-button__icon" size={15} />
            </Button>
            <Button disabled={updating} onClick={() => onToggle(profile)}>{profile.enabled ? copy.actions.disable : copy.actions.enable}</Button>
            <Button aria-label={`${copy.actions.delete} ${profile.displayName}`} disabled={updating} onClick={() => onDelete(profile)} title={`${copy.actions.delete} ${profile.displayName}`} variant="danger">
              <Trash2 aria-hidden="true" className="jixia-button__icon" size={15} />
            </Button>
          </div>
        </article>
      ))}
    </div>
  );
}

function connectionDraftForKind(kind: ProviderKind, copy: AISettingsCopy): ConnectionDraft {
  return {
    kind,
    name: copy.providerKinds[kind],
    baseURL: managedProviderOrigins[kind] ?? "",
    customBaseURL: "",
    apiKey: "",
    isDefault: false
  };
}

function connectionDraftFromConfig(config: AIProviderConfigView): ConnectionDraft {
  const kind = providerKindForConfig(config);

  return {
    kind,
    name: config.name,
    baseURL: config.baseURL,
    customBaseURL: kind === "openai_compatible" ? config.baseURL : "",
    apiKey: "",
    isDefault: config.isDefault
  };
}

type ParsedConnectionDraft =
  | { readonly ok: true; readonly payload: Omit<CreateAIProviderConfigRequest, "apiKey" | "defaultModelProfile"> }
  | { readonly ok: false; readonly message: string };

function parseConnectionDraft(draft: ConnectionDraft, copy: AISettingsCopy): ParsedConnectionDraft {
  if (!draft.name.trim()) {
    return { ok: false, message: copy.providerName };
  }

  if (draft.kind === "openai_compatible" && !draft.baseURL.trim()) {
    return { ok: false, message: copy.customBaseUrl };
  }

  return {
    ok: true,
    payload: {
      name: draft.name.trim(),
      provider: providerIdentifier(draft.kind),
      providerKind: draft.kind,
      baseURL: managedProviderOrigins[draft.kind] ?? draft.baseURL.trim(),
      isDefault: draft.isDefault
    }
  };
}

function createConnectionPayload(
  payload: Omit<CreateAIProviderConfigRequest, "apiKey" | "defaultModelProfile">,
  apiKey: string
): CreateAIProviderConfigRequest {
  const normalizedApiKey = apiKey.trim();
  return normalizedApiKey ? { ...payload, apiKey: normalizedApiKey } : payload;
}

function updateConnectionPayload(
  payload: Omit<CreateAIProviderConfigRequest, "apiKey" | "defaultModelProfile">,
  apiKey: string
): UpdateAIProviderConfigRequest {
  const normalizedApiKey = apiKey.trim();
  return normalizedApiKey ? { ...payload, apiKey: normalizedApiKey } : payload;
}

type ParsedManualModelDraft =
  | { readonly ok: true; readonly payload: CreateAIModelProfileRequest }
  | { readonly ok: false; readonly message: string };

function parseManualModelDraft(draft: ManualModelDraft, copy: AISettingsCopy): ParsedManualModelDraft {
  const temperature = Number(draft.temperature);
  const maxTokens = Number(draft.maxTokens);

  if (!draft.displayName.trim()) {
    return { ok: false, message: copy.displayName };
  }
  if (!draft.model.trim()) {
    return { ok: false, message: copy.modelIdentifier };
  }
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    return { ok: false, message: copy.temperature };
  }
  if (!Number.isInteger(maxTokens) || maxTokens <= 0) {
    return { ok: false, message: copy.maxTokens };
  }

  return {
    ok: true,
    payload: {
      displayName: draft.displayName.trim(),
      model: draft.model.trim(),
      temperature,
      maxTokens,
      enabled: true
    }
  };
}

function updateManualModelPayload(payload: CreateAIModelProfileRequest): UpdateAIModelProfileRequest {
  return {
    displayName: payload.displayName,
    model: payload.model,
    temperature: payload.temperature,
    maxTokens: payload.maxTokens
  };
}

function providerIdentifier(kind: ProviderKind): string {
  return kind === "openai_compatible" ? "openai-compatible" : kind;
}

function providerKindForConfig(config: AIProviderConfigView): ProviderKind {
  if (config.providerKind) {
    return config.providerKind;
  }
  if (config.provider === "openai" || config.provider === "openrouter" || config.provider === "anthropic") {
    return config.provider;
  }
  return "openai_compatible";
}

function defaultModelProfile(config: AIProviderConfigView): AIModelProfileView | null {
  return config.modelProfiles.find((profile) => profile.isDefault && profile.enabled && profile.availability !== "unavailable")
    ?? config.modelProfiles.find((profile) => profile.enabled && profile.availability !== "unavailable")
    ?? null;
}

function selectModelProfileId(
  currentModelProfileId: string,
  options: readonly { readonly profile: AIModelProfileView }[]
): string {
  if (options.some((option) => option.profile.id === currentModelProfileId)) {
    return currentModelProfileId;
  }
  return options.find((option) => option.profile.isDefault)?.profile.id ?? options[0]?.profile.id ?? "";
}

function modelOptionLabel(profile: AIModelProfileView, copy: AISettingsCopy): string {
  const availability = availabilityState(profile);
  return `${profile.displayName} · ${profile.model} · ${copy.availability[availability]}`;
}

function connectionLabel(config: AIProviderConfigView, copy: AISettingsCopy): string {
  if (!config.hasKey) {
    return copy.connectionStates.missingKey;
  }
  return authLabel(config.connection?.authentication ?? "not_checked", copy);
}

function connectionMessage(config: AIProviderConfigView, copy: AISettingsCopy): string {
  if (!config.hasKey) {
    return copy.connectionStates.missingKey;
  }
  return config.connection?.authentication === "verified" ? copy.connectionStates.verified : copy.connectionStates.notChecked;
}

function transportLabel(transport: "not_checked" | "reachable" | "unreachable", copy: AISettingsCopy): string {
  return transport === "reachable"
    ? copy.connectionStates.reachable
    : transport === "unreachable"
      ? copy.connectionStates.unreachable
      : copy.connectionStates.notChecked;
}

function authLabel(authentication: "not_checked" | "verified" | "rejected" | "unverified", copy: AISettingsCopy): string {
  return authentication === "verified"
    ? copy.connectionStates.verified
    : authentication === "rejected"
      ? copy.connectionStates.rejected
      : authentication === "unverified"
        ? copy.connectionStates.unverified
        : copy.connectionStates.notChecked;
}

function syncLabel(config: AIProviderConfigView, copy: AISettingsCopy): string {
  const discovery = config.sync?.discovery ?? "not_attempted";
  return discovery === "available"
    ? copy.syncStates.available
    : discovery === "unsupported"
      ? copy.syncStates.unsupported
      : discovery === "empty"
        ? copy.syncStates.empty
        : discovery === "rate_limited"
          ? copy.syncStates.rateLimited
          : discovery === "unavailable"
            ? copy.syncStates.unavailable
            : discovery === "malformed"
              ? copy.syncStates.malformed
              : copy.syncStates.notAttempted;
}

function syncMessageForConfig(config: AIProviderConfigView, copy: AISettingsCopy): string {
  const discovery = config.sync?.discovery ?? "not_attempted";
  if (discovery === "unsupported") {
    return copy.unsupportedDiscoveryHint;
  }
  if (discovery === "empty") {
    return copy.emptyInventoryHint;
  }
  return syncLabel(config, copy);
}

function freshnessLabel(freshness: "never" | "fresh" | "stale", copy: AISettingsCopy): string {
  return freshness === "fresh" ? copy.syncStates.fresh : freshness === "stale" ? copy.syncStates.stale : copy.syncStates.never;
}

function connectionToneFor(config: AIProviderConfigView): "neutral" | "success" | "warning" | "danger" {
  if (!config.hasKey) {
    return "warning";
  }
  if (config.connection?.authentication === "verified") {
    return "success";
  }
  if (config.connection?.authentication === "rejected" || config.connection?.transport === "unreachable") {
    return "danger";
  }
  return "warning";
}

function syncToneForConfig(config: AIProviderConfigView): "neutral" | "success" | "warning" | "danger" {
  const discovery = config.sync?.discovery ?? "not_attempted";
  if (discovery === "available" && config.sync?.freshness === "fresh") {
    return "success";
  }
  if (discovery === "unsupported" || discovery === "empty" || discovery === "rate_limited" || discovery === "not_attempted") {
    return "warning";
  }
  if (discovery === "unavailable" || discovery === "malformed") {
    return "danger";
  }
  return "neutral";
}

function syncTone(discovery: SyncAIProviderCapabilitiesResponse["discovery"]): "success" | "warning" | "danger" {
  return discovery === "available" ? "success" : discovery === "unavailable" || discovery === "malformed" ? "danger" : "warning";
}

function syncMessage(response: SyncAIProviderCapabilitiesResponse, copy: AISettingsCopy): string {
  if (response.discovery === "unsupported") {
    return copy.unsupportedDiscoveryHint;
  }
  if (response.discovery === "empty") {
    return copy.emptyInventoryHint;
  }
  return response.config.sync?.message ?? syncLabel(response.config, copy);
}

function compactValues(values: readonly string[]): string {
  const visibleValues = values.slice(0, 3);
  const suffix = values.length > visibleValues.length ? ` +${values.length - visibleValues.length}` : "";
  return `${visibleValues.join(", ")}${suffix}`;
}

function formatTimestamp(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function safeErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function interpolate(template: string, values: Readonly<Record<string, string>>): string {
  return Object.entries(values).reduce((result, [key, value]) => result.replace(`{${key}}`, value), template);
}

function compareConfigs(left: AIProviderConfigView, right: AIProviderConfigView): number {
  if (left.isDefault !== right.isDefault) {
    return left.isDefault ? -1 : 1;
  }
  return left.name.localeCompare(right.name);
}
