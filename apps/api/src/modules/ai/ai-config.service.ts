import { randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@jixia/db/generated";
import type {
  AICapabilityFactState,
  AIInventoryFreshnessState,
  DiscoverAIModelsResponse,
  AIModelAvailabilityState,
  AIModelProfileView,
  AIModelProfileOrigin,
  AIProviderAuthState,
  AIProviderConfigView,
  AIProviderDiscoveryState,
  AIProviderErrorCategory,
  AIProviderKind,
  AIProviderTransportState,
  ProviderHealthCheck,
  SpaceRole
} from "@jixia/shared";

import {
  AIProviderExecutionError,
  createAIProviderAdapter,
  normalizeAIProviderBaseURL,
  normalizeAIProviderKind,
  providerOrigins,
  providerErrorFromUnknown,
  safeProviderErrorMessage,
  type AIProviderAdapter,
  type AIProviderDiscoveredModel,
  type AIProviderCapabilityFacts,
  type AIProviderConnectionConfig
} from "./ai-provider-adapter.js";
import { AICryptoError, createAIKeyCipher, createKeyPreview, type AIKeyCipher } from "./crypto.js";
import { getDefaultAuditService, type AuditService } from "../audit/audit.service.js";

export class AIConfigError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = "AIConfigError";
  }
}

export type AIActor = {
  readonly userId: string;
  readonly spaceId: string;
  readonly spaceRole: SpaceRole;
};

export type AIModelProfileRecord = {
  readonly id: string;
  readonly providerConfigId: string;
  readonly model: string;
  readonly displayName: string;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly enabled: boolean;
  readonly isDefault: boolean;
  readonly origin?: AIModelProfileOrigin;
  readonly availability?: AIModelAvailabilityState;
  readonly lastSeenAt?: Date | null;
  readonly contextWindowState?: AICapabilityFactState;
  readonly contextWindowTokens?: number | null;
  readonly maxOutputState?: AICapabilityFactState;
  readonly maxOutputTokens?: number | null;
  readonly inputModalitiesState?: AICapabilityFactState;
  readonly inputModalities?: unknown;
  readonly outputModalitiesState?: AICapabilityFactState;
  readonly outputModalities?: unknown;
  readonly supportedParametersState?: AICapabilityFactState;
  readonly supportedParameters?: unknown;
  readonly capabilitySource?: AIProviderKind | null | undefined;
  readonly capabilitiesObservedAt?: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type AIProviderConfigRecord = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly name: string;
  readonly provider: string;
  readonly providerKind?: AIProviderKind | undefined;
  readonly baseURL: string;
  readonly encryptedApiKey: string | null;
  readonly keyPreview: string | null;
  readonly isDefault: boolean;
  readonly transportState?: AIProviderTransportState;
  readonly authState?: AIProviderAuthState;
  readonly discoveryState?: AIProviderDiscoveryState;
  readonly inventoryFreshness?: AIInventoryFreshnessState;
  readonly lastConnectionAttemptAt?: Date | null;
  readonly lastVerifiedAt?: Date | null;
  readonly verificationAttemptToken?: string | null;
  readonly lastSyncAttemptAt?: Date | null;
  readonly syncAttemptToken?: string | null;
  readonly lastSuccessfulSyncAt?: Date | null;
  readonly connectionErrorCode?: string | null;
  readonly discoveryErrorCode?: string | null;
  readonly modelProfiles: readonly AIModelProfileRecord[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type AIModelProfileInput = {
  readonly model: string;
  readonly displayName: string;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly enabled?: boolean;
  readonly isDefault?: boolean;
};

export type AIProviderSyncCompletionInput = {
  readonly configId: string;
  readonly ownerUserId: string;
  readonly attemptToken: string;
  readonly transportState: AIProviderTransportState;
  readonly authState: AIProviderAuthState;
  readonly discoveryState: AIProviderDiscoveryState;
  readonly discoveryErrorCode: string | null;
  readonly observedAt: Date;
  readonly models: readonly AIProviderDiscoveredModel[];
};

export type AIProviderSyncCompletionResult = {
  readonly status: "applied" | "superseded";
  readonly config: AIProviderConfigRecord | null;
  readonly discovered: number;
  readonly created: number;
  readonly updated: number;
  readonly skipped: number;
};

export type AIProviderVerificationCompletionInput = {
  readonly configId: string;
  readonly ownerUserId: string;
  readonly attemptToken: string;
  readonly expectedRuntimeIdentity: {
    readonly provider: string;
    readonly providerKind?: AIProviderKind;
    readonly baseURL: string;
    readonly encryptedApiKey: string | null;
  };
  readonly transportState: AIProviderTransportState;
  readonly authState: AIProviderAuthState;
  readonly checkedAt: Date;
  readonly connectionErrorCode: string | null;
};

export type AIProviderVerificationCompletionResult = {
  readonly status: "applied" | "superseded";
  readonly config: AIProviderConfigRecord | null;
};

export type CreateAIProviderConfigInput = {
  readonly actor: AIActor;
  readonly name: string;
  readonly provider: string;
  readonly providerKind?: AIProviderKind;
  readonly baseURL: string;
  readonly defaultModelProfile?: AIModelProfileInput;
  readonly isDefault?: boolean;
  readonly apiKey?: string;
};

export type UpdateAIProviderConfigInput = {
  readonly actor: AIActor;
  readonly configId: string;
  readonly name?: string;
  readonly provider?: string;
  readonly providerKind?: AIProviderKind;
  readonly baseURL?: string;
  readonly isDefault?: boolean;
  readonly apiKey?: string;
};

export type CreateAIModelProfileInput = AIModelProfileInput & {
  readonly actor: AIActor;
  readonly configId: string;
};

export type UpdateAIModelProfileInput = Partial<AIModelProfileInput> & {
  readonly actor: AIActor;
  readonly configId: string;
  readonly modelProfileId: string;
};

export type TestAIProviderDraftConfigInput = {
  readonly actor: AIActor;
  readonly provider: string;
  readonly providerKind?: AIProviderKind;
  readonly baseURL: string;
  readonly model?: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly apiKey?: string;
};

export type TestAIProviderSavedConfigInput = {
  readonly actor: AIActor;
  readonly configId: string;
  readonly modelProfileId?: string;
};

export type AIProviderConfigRepository = {
  readonly listConfigs: (ownerUserId: string) => Promise<readonly AIProviderConfigRecord[]>;
  readonly findConfigById: (configId: string) => Promise<AIProviderConfigRecord | null>;
  readonly findModelProfileById: (modelProfileId: string) => Promise<AIModelProfileRecord | null>;
  readonly createConfig: (input: {
    readonly ownerUserId: string;
    readonly name: string;
    readonly provider: string;
    readonly providerKind: AIProviderKind;
    readonly baseURL: string;
    readonly defaultModelProfile?: AIModelProfileInput;
    readonly encryptedApiKey: string | null;
    readonly keyPreview: string | null;
    readonly isDefault: boolean;
  }) => Promise<AIProviderConfigRecord>;
  readonly updateConfig: (input: {
    readonly configId: string;
    readonly ownerUserId: string;
    readonly expectedRuntimeIdentity?: {
      readonly provider: string;
      readonly providerKind?: AIProviderKind;
      readonly baseURL: string;
      readonly encryptedApiKey: string | null;
    };
    readonly name?: string;
    readonly provider?: string;
    readonly providerKind?: AIProviderKind;
    readonly baseURL?: string;
    readonly encryptedApiKey?: string | null;
    readonly keyPreview?: string | null;
    readonly isDefault?: boolean;
    readonly transportState?: AIProviderTransportState;
    readonly authState?: AIProviderAuthState;
    readonly discoveryState?: AIProviderDiscoveryState;
    readonly inventoryFreshness?: AIInventoryFreshnessState;
    readonly lastConnectionAttemptAt?: Date | null;
    readonly lastVerifiedAt?: Date | null;
    readonly verificationAttemptToken?: string | null;
    readonly lastSyncAttemptAt?: Date | null;
    readonly syncAttemptToken?: string | null;
    readonly lastSuccessfulSyncAt?: Date | null;
    readonly connectionErrorCode?: string | null;
    readonly discoveryErrorCode?: string | null;
  }) => Promise<AIProviderConfigRecord | null>;
  readonly beginSavedVerification: (input: {
    readonly configId: string;
    readonly ownerUserId: string;
    readonly attemptedAt: Date;
    readonly attemptToken: string;
  }) => Promise<AIProviderConfigRecord | null>;
  readonly completeSavedVerification: (
    input: AIProviderVerificationCompletionInput
  ) => Promise<AIProviderVerificationCompletionResult>;
  readonly beginModelDiscovery: (input: {
    readonly configId: string;
    readonly ownerUserId: string;
    readonly attemptedAt: Date;
    readonly attemptToken: string;
  }) => Promise<AIProviderConfigRecord | null>;
  readonly completeModelDiscovery: (
    input: AIProviderSyncCompletionInput
  ) => Promise<AIProviderSyncCompletionResult>;
  readonly createModelProfile: (input: {
    readonly providerConfigId: string;
    readonly ownerUserId: string;
    readonly model: string;
    readonly displayName: string;
    readonly temperature: number;
    readonly maxTokens: number;
    readonly enabled: boolean;
    readonly isDefault: boolean;
    readonly origin?: AIModelProfileOrigin;
    readonly availability?: AIModelAvailabilityState;
    readonly lastSeenAt?: Date | null;
    readonly capabilities?: AIProviderCapabilityFacts;
    readonly capabilitySource?: AIProviderKind | null;
    readonly capabilitiesObservedAt?: Date | null;
  }) => Promise<AIModelProfileRecord | null>;
  readonly updateModelProfile: (input: {
    readonly providerConfigId: string;
    readonly modelProfileId: string;
    readonly ownerUserId: string;
    readonly model?: string;
    readonly displayName?: string;
    readonly temperature?: number;
    readonly maxTokens?: number;
    readonly enabled?: boolean;
    readonly isDefault?: boolean;
    readonly origin?: AIModelProfileOrigin;
    readonly availability?: AIModelAvailabilityState;
    readonly lastSeenAt?: Date | null;
    readonly capabilities?: AIProviderCapabilityFacts;
    readonly capabilitySource?: AIProviderKind | null;
    readonly capabilitiesObservedAt?: Date | null;
  }) => Promise<AIModelProfileRecord | null>;
  readonly deleteModelProfile: (input: {
    readonly providerConfigId: string;
    readonly modelProfileId: string;
    readonly ownerUserId: string;
  }) => Promise<boolean>;
  readonly setDefaultModelProfile: (input: {
    readonly providerConfigId: string;
    readonly modelProfileId: string;
    readonly ownerUserId: string;
  }) => Promise<AIModelProfileRecord | null>;
  readonly deleteConfig: (input: {
    readonly configId: string;
    readonly ownerUserId: string;
  }) => Promise<boolean>;
  readonly setDefaultConfig: (input: {
    readonly configId: string;
    readonly ownerUserId: string;
  }) => Promise<AIProviderConfigRecord | null>;
};

function badRequest(message = "Invalid request"): AIConfigError {
  return new AIConfigError(message, 400);
}

function notFound(message = "Not found"): AIConfigError {
  return new AIConfigError(message, 404);
}

function conflict(message = "Resource conflict"): AIConfigError {
  return new AIConfigError(message, 409);
}

function unavailable(message = "AI credential encryption is unavailable"): AIConfigError {
  return new AIConfigError(message, 503);
}

function toIsoString(date: Date): string {
  return date.toISOString();
}

function ensureNonEmptyText(value: string, fieldName: string, maxLength = 256): string {
  const trimmed = value.trim();

  if (!trimmed || trimmed.length > maxLength) {
    throw badRequest(`Invalid ${fieldName}`);
  }

  return trimmed;
}

function ensureProviderBaseURL(value: string): string {
  const trimmed = ensureNonEmptyText(value, "base URL", 2_000);

  try {
    return normalizeAIProviderBaseURL(trimmed);
  } catch (error) {
    if (error instanceof AIProviderExecutionError) {
      throw badRequest("Invalid provider base URL");
    }

    throw error;
  }
}

function normalizeProviderConnection(input: {
  readonly provider: string;
  readonly providerKind?: AIProviderKind | undefined;
  readonly baseURL: string;
}): { readonly provider: string; readonly providerKind: AIProviderKind; readonly baseURL: string } {
  const provider = ensureNonEmptyText(input.provider, "provider");
  const providerKind = normalizeAIProviderKind(provider, input.providerKind);
  return {
    provider,
    providerKind,
    baseURL: providerKind === "openai_compatible" ? ensureProviderBaseURL(input.baseURL) : providerOrigins[providerKind]
  };
}

function ensureTemperature(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 2) {
    throw badRequest("Invalid temperature");
  }

  return value;
}

function ensureMaxTokens(value: number): number {
  if (!Number.isInteger(value) || value <= 0 || value > 1_000_000) {
    throw badRequest("Invalid max tokens");
  }

  return value;
}

function normalizeOptionalApiKey(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();

  if (!trimmed || trimmed.length > 20_000) {
    throw badRequest("Invalid API key");
  }

  return trimmed;
}

function normalizeRequiredApiKey(value: string | undefined): string {
  const normalized = normalizeOptionalApiKey(value);

  if (!normalized) {
    throw new AIProviderExecutionError("missing_key");
  }

  return normalized;
}

function decryptApiKey(cipher: AIKeyCipher, encryptedApiKey: string | null): string {
  if (!encryptedApiKey) {
    throw new AIProviderExecutionError("missing_key");
  }

  try {
    return cipher.decrypt(encryptedApiKey);
  } catch (error) {
    if (error instanceof AICryptoError) {
      throw unavailable();
    }

    throw error;
  }
}

function encryptApiKey(cipher: AIKeyCipher, apiKey: string): { encryptedApiKey: string; keyPreview: string } {
  try {
    return {
      encryptedApiKey: cipher.encrypt(apiKey),
      keyPreview: createKeyPreview(apiKey)
    };
  } catch (error) {
    if (error instanceof AICryptoError) {
      throw unavailable();
    }

    throw error;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === "P2002"
  );
}

function ensureOwnedConfig(record: AIProviderConfigRecord | null, ownerUserId: string): AIProviderConfigRecord {
  if (!record || record.ownerUserId !== ownerUserId) {
    throw notFound();
  }

  return record;
}

function ensureOwnedModelProfile(
  record: AIModelProfileRecord | null,
  providerConfigId: string
): AIModelProfileRecord {
  if (!record || record.providerConfigId !== providerConfigId) {
    throw notFound();
  }

  return record;
}

function normalizeModelProfileInput(input: AIModelProfileInput): Required<AIModelProfileInput> {
  return {
    model: ensureNonEmptyText(input.model, "model"),
    displayName: ensureNonEmptyText(input.displayName, "model display name", 200),
    temperature: ensureTemperature(input.temperature),
    maxTokens: ensureMaxTokens(input.maxTokens),
    enabled: input.enabled ?? true,
    isDefault: input.isDefault ?? false
  };
}

function normalizeDiscoveredModels(models: readonly AIProviderDiscoveredModel[]): readonly AIProviderDiscoveredModel[] {
  if (models.length > 500) {
    throw new AIProviderExecutionError("response_parse_failure");
  }
  const seenIds = new Set<string>();
  const normalizedModels: AIProviderDiscoveredModel[] = [];

  for (const model of models) {
    const id = ensureNonEmptyText(model.id, "discovered model");
    if (seenIds.has(id)) {
      continue;
    }

    seenIds.add(id);
    normalizedModels.push({
      id,
      ...(model.displayName === undefined
        ? {}
        : { displayName: ensureNonEmptyText(model.displayName, "discovered model display name", 200) }),
      capabilities: normalizeObservedCapabilities(model.capabilities ?? {})
    });
  }

  return normalizedModels;
}

function normalizeObservedCapabilities(capabilities: AIProviderCapabilityFacts): AIProviderCapabilityFacts {
  const capabilityNames = new Set<NonNullable<AIProviderCapabilityFacts["unsupported"]>[number]>([
    "contextWindowTokens",
    "maxOutputTokens",
    "inputModalities",
    "outputModalities",
    "supportedParameters"
  ]);
  const unsupported = new Set(
    (capabilities.unsupported ?? []).filter((name) => capabilityNames.has(name))
  );
  const stringValues = (values: readonly string[] | undefined): readonly string[] | undefined => values === undefined
    ? undefined
    : Array.from(new Set(values.map((value) => ensureNonEmptyText(value, "capability value", 200))));
  return {
    ...(capabilities.contextWindowTokens === undefined
      ? {}
      : { contextWindowTokens: ensureMaxTokens(capabilities.contextWindowTokens) }),
    ...(capabilities.maxOutputTokens === undefined
      ? {}
      : { maxOutputTokens: ensureMaxTokens(capabilities.maxOutputTokens) }),
    ...(stringValues(capabilities.inputModalities) === undefined ? {} : { inputModalities: stringValues(capabilities.inputModalities)! }),
    ...(stringValues(capabilities.outputModalities) === undefined ? {} : { outputModalities: stringValues(capabilities.outputModalities)! }),
    ...(stringValues(capabilities.supportedParameters) === undefined
      ? {}
      : { supportedParameters: stringValues(capabilities.supportedParameters)! }),
    ...(unsupported.size === 0 ? {} : { unsupported: Array.from(unsupported) })
  };
}

function discoveryConnectionTelemetry(input: AIProviderSyncCompletionInput) {
  const verified = input.transportState === "reachable" && input.authState === "verified";
  return {
    lastConnectionAttemptAt: input.observedAt,
    ...(verified ? { lastVerifiedAt: input.observedAt, connectionErrorCode: null } : {
      connectionErrorCode: input.discoveryErrorCode
    })
  };
}

function capabilityPersistenceData(capabilities: AIProviderCapabilityFacts | undefined) {
  const values = capabilities ?? {};
  const unsupported = new Set(values.unsupported ?? []);
  const state = (
    name: NonNullable<AIProviderCapabilityFacts["unsupported"]>[number],
    value: unknown
  ): AICapabilityFactState => unsupported.has(name) ? "unsupported" : value === undefined ? "unknown" : "observed";

  return {
    contextWindowState: state("contextWindowTokens", values.contextWindowTokens),
    contextWindowTokens: values.contextWindowTokens ?? null,
    maxOutputState: state("maxOutputTokens", values.maxOutputTokens),
    maxOutputTokens: values.maxOutputTokens ?? null,
    inputModalitiesState: state("inputModalities", values.inputModalities),
    inputModalities: values.inputModalities === undefined ? Prisma.JsonNull : Array.from(values.inputModalities),
    outputModalitiesState: state("outputModalities", values.outputModalities),
    outputModalities: values.outputModalities === undefined ? Prisma.JsonNull : Array.from(values.outputModalities),
    supportedParametersState: state("supportedParameters", values.supportedParameters),
    supportedParameters: values.supportedParameters === undefined ? Prisma.JsonNull : Array.from(values.supportedParameters)
  };
}

function discoveredModelDisplayName(
  model: AIProviderDiscoveredModel,
  usedDisplayNames: ReadonlySet<string>
): string {
  const baseName = (model.displayName?.trim() || humanizeModelId(model.id)).slice(0, 200).trim() || model.id;

  if (!usedDisplayNames.has(baseName)) {
    return baseName;
  }

  const withModelId = `${baseName} (${model.id})`.slice(0, 200).trim();
  if (withModelId && !usedDisplayNames.has(withModelId)) {
    return withModelId;
  }

  for (let suffix = 2; ; suffix += 1) {
    const suffixText = ` ${suffix}`;
    const candidate = `${baseName.slice(0, 200 - suffixText.length)}${suffixText}`.trim();
    if (candidate && !usedDisplayNames.has(candidate)) {
      return candidate;
    }
  }

}

function humanizeModelId(modelId: string): string {
  const lastSegment = modelId.split("/").filter(Boolean).pop() ?? modelId;
  return lastSegment
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function defaultEnabledModelProfile(config: AIProviderConfigRecord): AIModelProfileRecord | null {
  return config.modelProfiles.find((profile) => profile.enabled && profile.isDefault)
    ?? config.modelProfiles.find((profile) => profile.enabled)
    ?? null;
}

function toModelProfileView(record: AIModelProfileRecord): AIModelProfileView {
  const stringList = (value: unknown): readonly string[] => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
  return {
    id: record.id,
    providerConfigId: record.providerConfigId,
    model: record.model,
    displayName: record.displayName,
    temperature: record.temperature,
    maxTokens: record.maxTokens,
    enabled: record.enabled,
    isDefault: record.isDefault,
    origin: record.origin ?? "manual",
    availability: record.availability ?? "unknown",
    lastSeenAt: record.lastSeenAt ? toIsoString(record.lastSeenAt) : null,
    capabilities: {
      contextWindowTokens: { state: record.contextWindowState ?? "unknown", value: record.contextWindowTokens ?? null },
      maxOutputTokens: { state: record.maxOutputState ?? "unknown", value: record.maxOutputTokens ?? null },
      inputModalities: { state: record.inputModalitiesState ?? "unknown", values: stringList(record.inputModalities) },
      outputModalities: { state: record.outputModalitiesState ?? "unknown", values: stringList(record.outputModalities) },
      supportedParameters: { state: record.supportedParametersState ?? "unknown", values: stringList(record.supportedParameters) }
    },
    provenance: {
      source: record.capabilitySource ?? null,
      observedAt: record.capabilitiesObservedAt ? toIsoString(record.capabilitiesObservedAt) : null
    },
    createdAt: toIsoString(record.createdAt),
    updatedAt: toIsoString(record.updatedAt)
  };
}

function toConfigView(record: AIProviderConfigRecord): AIProviderConfigView {
  return {
    id: record.id,
    ownerUserId: record.ownerUserId,
    name: record.name,
    provider: record.provider,
    providerKind: record.providerKind ?? normalizeAIProviderKind(record.provider),
    baseURL: record.baseURL,
    endpointDisplay: record.baseURL,
    hasKey: Boolean(record.encryptedApiKey),
    isDefault: record.isDefault,
    connection: {
      transport: record.transportState ?? "not_checked",
      authentication: record.authState ?? "not_checked",
      lastAttemptAt: record.lastConnectionAttemptAt ? toIsoString(record.lastConnectionAttemptAt) : null,
      lastVerifiedAt: record.lastVerifiedAt ? toIsoString(record.lastVerifiedAt) : null,
      errorCode: providerErrorCode(record.connectionErrorCode),
      message: record.connectionErrorCode ? safeProviderErrorMessage(providerErrorCode(record.connectionErrorCode) ?? "unknown") : null
    },
    sync: {
      discovery: record.discoveryState ?? "not_attempted",
      freshness: record.inventoryFreshness ?? "never",
      lastAttemptAt: record.lastSyncAttemptAt ? toIsoString(record.lastSyncAttemptAt) : null,
      lastSuccessfulSyncAt: record.lastSuccessfulSyncAt ? toIsoString(record.lastSuccessfulSyncAt) : null,
      errorCode: providerErrorCode(record.discoveryErrorCode),
      message: record.discoveryErrorCode ? safeProviderErrorMessage(providerErrorCode(record.discoveryErrorCode) ?? "unknown") : null
    },
    modelProfiles: record.modelProfiles.map(toModelProfileView),
    createdAt: toIsoString(record.createdAt),
    updatedAt: toIsoString(record.updatedAt)
  };
}

function providerErrorCode(value: string | null | undefined): AIProviderErrorCategory | null {
  const values: readonly AIProviderErrorCategory[] = [
    "invalid_base_url", "missing_key", "invalid_key", "model_not_found", "rate_limit", "timeout",
    "provider_unavailable", "response_parse_failure", "cancelled", "unknown"
  ];
  return value !== null && values.includes(value as AIProviderErrorCategory) ? value as AIProviderErrorCategory : null;
}

function providerHealthMessage(ok: boolean): string {
  return ok ? "Connection verified through the server adapter." : "Provider test failed.";
}

function healthCheck(input: {
  readonly ok: boolean;
  readonly category: ProviderHealthCheck["category"];
  readonly message: string;
  readonly latencyMs: number;
  readonly provider: string;
  readonly model: string;
  readonly baseURL: string;
  readonly checkedAt: Date;
  readonly connection?: ProviderHealthCheck["connection"];
}): ProviderHealthCheck {
  return {
    ok: input.ok,
    category: input.category,
    message: input.message,
    latencyMs: input.latencyMs,
    provider: input.provider,
    model: input.model,
    baseURL: input.baseURL,
    checkedAt: toIsoString(input.checkedAt),
    ...(input.connection === undefined ? {} : { connection: input.connection })
  };
}

function failedHealthCheckForError(input: {
  readonly error: unknown;
  readonly provider: string;
  readonly model: string;
  readonly baseURL: string;
  readonly checkedAt: Date;
}): ProviderHealthCheck {
  const category = input.error instanceof AIConfigError && /base URL/i.test(input.error.message)
    ? "invalid_base_url"
    : providerErrorFromUnknown(input.error).category;

  return healthCheck({
    ok: false,
    category,
    message: safeProviderErrorMessage(category),
    latencyMs: 0,
    provider: input.provider.trim(),
    model: input.model.trim(),
    baseURL: category === "invalid_base_url" ? "" : input.baseURL.trim(),
    checkedAt: input.checkedAt
  });
}

async function runProviderHealthCheck(input: {
  readonly providerAdapter: AIProviderAdapter;
  readonly now: () => Date;
  readonly config: AIProviderConnectionConfig;
  readonly model: string;
}): Promise<ProviderHealthCheck> {
  const startedAt = input.now();

  try {
    const result = await input.providerAdapter.verifyConnection({ config: input.config });
    const checkedAt = input.now();
    const ok = result.transport === "reachable" && result.authentication === "verified";
    const message = ok
      ? providerHealthMessage(true)
      : result.authentication === "unverified" && result.errorCode === null
        ? "Connection reachable, but credentials could not be verified without running a model."
        : safeProviderErrorMessage(result.errorCode ?? "unknown");

    return healthCheck({
      ok,
      category: result.errorCode,
      message,
      latencyMs: Math.max(0, checkedAt.getTime() - startedAt.getTime()),
      provider: input.config.provider,
      model: input.model,
      baseURL: input.config.baseURL,
      checkedAt,
      connection: {
        providerKind: result.providerKind,
        endpointDisplay: result.endpointDisplay,
        transport: result.transport,
        authentication: result.authentication,
        errorCode: result.errorCode,
        message,
        latencyMs: Math.max(0, checkedAt.getTime() - startedAt.getTime()),
        checkedAt: toIsoString(checkedAt)
      }
    });
  } catch (error) {
    const checkedAt = input.now();
    const providerError = providerErrorFromUnknown(error);

    return healthCheck({
      ok: false,
      category: providerError.category,
      message: safeProviderErrorMessage(providerError.category) || providerHealthMessage(false),
      latencyMs: Math.max(0, checkedAt.getTime() - startedAt.getTime()),
      provider: input.config.provider,
       model: input.model,
      baseURL: input.config.baseURL,
      checkedAt
    });
  }
}

const aiProviderConfigSelect = {
  id: true,
  ownerUserId: true,
  name: true,
  provider: true,
  providerKind: true,
  baseURL: true,
  encryptedApiKey: true,
  keyPreview: true,
  isDefault: true,
  transportState: true,
  authState: true,
  discoveryState: true,
  inventoryFreshness: true,
  lastConnectionAttemptAt: true,
  lastVerifiedAt: true,
  verificationAttemptToken: true,
  lastSyncAttemptAt: true,
  syncAttemptToken: true,
  lastSuccessfulSyncAt: true,
  connectionErrorCode: true,
  discoveryErrorCode: true,
  modelProfiles: {
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      providerConfigId: true,
      model: true,
      displayName: true,
      temperature: true,
      maxTokens: true,
      enabled: true,
      isDefault: true,
      origin: true,
      availability: true,
      lastSeenAt: true,
      contextWindowState: true,
      contextWindowTokens: true,
      maxOutputState: true,
      maxOutputTokens: true,
      inputModalitiesState: true,
      inputModalities: true,
      outputModalitiesState: true,
      outputModalities: true,
      supportedParametersState: true,
      supportedParameters: true,
      capabilitySource: true,
      capabilitiesObservedAt: true,
      createdAt: true,
      updatedAt: true
    }
  },
  createdAt: true,
  updatedAt: true
} satisfies Prisma.AIProviderConfigSelect;

const aiModelProfileSelect = {
  id: true,
  providerConfigId: true,
  model: true,
  displayName: true,
  temperature: true,
  maxTokens: true,
  enabled: true,
  isDefault: true,
  origin: true,
  availability: true,
  lastSeenAt: true,
  contextWindowState: true,
  contextWindowTokens: true,
  maxOutputState: true,
  maxOutputTokens: true,
  inputModalitiesState: true,
  inputModalities: true,
  outputModalitiesState: true,
  outputModalities: true,
  supportedParametersState: true,
  supportedParameters: true,
  capabilitySource: true,
  capabilitiesObservedAt: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.AIModelProfileSelect;

function toConfigRecord(record: AIProviderConfigRecord): AIProviderConfigRecord {
  return record;
}

type PrismaTransaction = Prisma.TransactionClient;

export class PrismaAIProviderConfigRepository implements AIProviderConfigRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listConfigs(ownerUserId: string): Promise<readonly AIProviderConfigRecord[]> {
    const configs = await this.prisma.aIProviderConfig.findMany({
      where: { ownerUserId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: aiProviderConfigSelect
    });

    return configs.map((config) => toConfigRecord(config));
  }

  async findConfigById(configId: string): Promise<AIProviderConfigRecord | null> {
    const config = await this.prisma.aIProviderConfig.findUnique({
      where: { id: configId },
      select: aiProviderConfigSelect
    });

    return config ? toConfigRecord(config) : null;
  }

  async findModelProfileById(modelProfileId: string): Promise<AIModelProfileRecord | null> {
    const modelProfile = await this.prisma.aIModelProfile.findUnique({
      where: { id: modelProfileId },
      select: aiModelProfileSelect
    });

    return modelProfile;
  }

  async createConfig(input: {
    readonly ownerUserId: string;
    readonly name: string;
    readonly provider: string;
    readonly providerKind: AIProviderKind;
    readonly baseURL: string;
    readonly defaultModelProfile?: AIModelProfileInput;
    readonly encryptedApiKey: string | null;
    readonly keyPreview: string | null;
    readonly isDefault: boolean;
  }): Promise<AIProviderConfigRecord> {
    return this.prisma.$transaction(async (transaction) => {
      if (input.isDefault) {
        await this.clearOwnerDefaults(transaction, input.ownerUserId);
      }

      const config = await transaction.aIProviderConfig.create({
        data: {
          ownerUserId: input.ownerUserId,
          name: input.name,
          provider: input.provider,
          providerKind: input.providerKind,
          baseURL: input.baseURL,
          encryptedApiKey: input.encryptedApiKey,
          keyPreview: input.keyPreview,
          isDefault: input.isDefault,
          ...(input.defaultModelProfile === undefined
            ? {}
            : {
                modelProfiles: {
                  create: {
                    model: input.defaultModelProfile.model,
                    displayName: input.defaultModelProfile.displayName,
                    temperature: input.defaultModelProfile.temperature,
                    maxTokens: input.defaultModelProfile.maxTokens,
                    enabled: input.defaultModelProfile.enabled ?? true,
                    isDefault: true
                  }
                }
              })
        },
        select: aiProviderConfigSelect
      });

      return toConfigRecord(config);
    });
  }

  async updateConfig(input: {
    readonly configId: string;
    readonly ownerUserId: string;
    readonly expectedRuntimeIdentity?: {
      readonly provider: string;
      readonly providerKind?: AIProviderKind;
      readonly baseURL: string;
      readonly encryptedApiKey: string | null;
    };
    readonly name?: string;
    readonly provider?: string;
    readonly providerKind?: AIProviderKind;
    readonly baseURL?: string;
    readonly encryptedApiKey?: string | null;
    readonly keyPreview?: string | null;
    readonly isDefault?: boolean;
    readonly transportState?: AIProviderTransportState;
    readonly authState?: AIProviderAuthState;
    readonly discoveryState?: AIProviderDiscoveryState;
    readonly inventoryFreshness?: AIInventoryFreshnessState;
    readonly lastConnectionAttemptAt?: Date | null;
    readonly lastVerifiedAt?: Date | null;
    readonly verificationAttemptToken?: string | null;
    readonly lastSyncAttemptAt?: Date | null;
    readonly syncAttemptToken?: string | null;
    readonly lastSuccessfulSyncAt?: Date | null;
    readonly connectionErrorCode?: string | null;
    readonly discoveryErrorCode?: string | null;
  }): Promise<AIProviderConfigRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw<readonly { readonly id: string }[]>`
        SELECT "id"
        FROM "AIProviderConfig"
        WHERE "id" = ${input.configId} AND "ownerUserId" = ${input.ownerUserId}
        FOR UPDATE
      `;
      const current = await transaction.aIProviderConfig.findUnique({
        where: { id: input.configId },
        select: {
          id: true,
          ownerUserId: true,
          provider: true,
          providerKind: true,
          baseURL: true,
          encryptedApiKey: true
        }
      });

      if (!current || current.ownerUserId !== input.ownerUserId) {
        return null;
      }

      if (input.expectedRuntimeIdentity && (
        current.provider !== input.expectedRuntimeIdentity.provider
        || current.providerKind !== input.expectedRuntimeIdentity.providerKind
        || current.baseURL !== input.expectedRuntimeIdentity.baseURL
        || current.encryptedApiKey !== input.expectedRuntimeIdentity.encryptedApiKey
      )) {
        throw conflict("AI provider connection changed; retry update");
      }

      const changesConnectionIdentity = (
        input.provider !== undefined && input.provider !== current.provider
      ) || (
        input.providerKind !== undefined && input.providerKind !== current.providerKind
      ) || (
        input.baseURL !== undefined && input.baseURL !== current.baseURL
      );
      if (changesConnectionIdentity && current.encryptedApiKey && input.encryptedApiKey === undefined) {
        throw badRequest("Changing provider connection requires a replacement API key");
      }

      if (input.isDefault === true) {
        await this.clearOwnerDefaults(transaction, input.ownerUserId);
      }

      const data: Prisma.AIProviderConfigUncheckedUpdateInput = {};

      if (input.name !== undefined) data.name = input.name;
      if (input.provider !== undefined) data.provider = input.provider;
      if (input.providerKind !== undefined) data.providerKind = input.providerKind;
      if (input.baseURL !== undefined) data.baseURL = input.baseURL;
      if (input.encryptedApiKey !== undefined) data.encryptedApiKey = input.encryptedApiKey;
      if (input.keyPreview !== undefined) data.keyPreview = input.keyPreview;
      if (input.isDefault !== undefined) data.isDefault = input.isDefault;
      if (input.transportState !== undefined) data.transportState = input.transportState;
      if (input.authState !== undefined) data.authState = input.authState;
      if (input.discoveryState !== undefined) data.discoveryState = input.discoveryState;
      if (input.inventoryFreshness !== undefined) data.inventoryFreshness = input.inventoryFreshness;
      if (input.lastConnectionAttemptAt !== undefined) data.lastConnectionAttemptAt = input.lastConnectionAttemptAt;
      if (input.lastVerifiedAt !== undefined) data.lastVerifiedAt = input.lastVerifiedAt;
      if (input.verificationAttemptToken !== undefined) data.verificationAttemptToken = input.verificationAttemptToken;
      if (input.lastSyncAttemptAt !== undefined) data.lastSyncAttemptAt = input.lastSyncAttemptAt;
      if (input.syncAttemptToken !== undefined) data.syncAttemptToken = input.syncAttemptToken;
      if (input.lastSuccessfulSyncAt !== undefined) data.lastSuccessfulSyncAt = input.lastSuccessfulSyncAt;
      if (input.connectionErrorCode !== undefined) data.connectionErrorCode = input.connectionErrorCode;
      if (input.discoveryErrorCode !== undefined) data.discoveryErrorCode = input.discoveryErrorCode;

      const config = await transaction.aIProviderConfig.update({
        where: { id: input.configId },
        data,
        select: aiProviderConfigSelect
      });

      return toConfigRecord(config);
    });
  }

  async beginSavedVerification(input: {
    readonly configId: string;
    readonly ownerUserId: string;
    readonly attemptedAt: Date;
    readonly attemptToken: string;
  }): Promise<AIProviderConfigRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      const lockedRows = await transaction.$queryRaw<readonly { readonly id: string }[]>`
        SELECT "id"
        FROM "AIProviderConfig"
        WHERE "id" = ${input.configId} AND "ownerUserId" = ${input.ownerUserId}
        FOR UPDATE
      `;
      if (lockedRows.length === 0) return null;

      const config = await transaction.aIProviderConfig.update({
        where: { id: input.configId },
        data: {
          lastConnectionAttemptAt: input.attemptedAt,
          verificationAttemptToken: input.attemptToken
        },
        select: aiProviderConfigSelect
      });
      return toConfigRecord(config);
    });
  }

  async completeSavedVerification(
    input: AIProviderVerificationCompletionInput
  ): Promise<AIProviderVerificationCompletionResult> {
    return this.prisma.$transaction(async (transaction) => {
      const lockedRows = await transaction.$queryRaw<readonly { readonly id: string }[]>`
        SELECT "id"
        FROM "AIProviderConfig"
        WHERE "id" = ${input.configId} AND "ownerUserId" = ${input.ownerUserId}
        FOR UPDATE
      `;
      if (lockedRows.length === 0) return { status: "applied", config: null };

      const current = await transaction.aIProviderConfig.findUnique({
        where: { id: input.configId },
        select: aiProviderConfigSelect
      });
      if (!current) return { status: "applied", config: null };

      if (
        current.verificationAttemptToken !== input.attemptToken
        || current.provider !== input.expectedRuntimeIdentity.provider
        || current.providerKind !== input.expectedRuntimeIdentity.providerKind
        || current.baseURL !== input.expectedRuntimeIdentity.baseURL
        || current.encryptedApiKey !== input.expectedRuntimeIdentity.encryptedApiKey
      ) {
        return { status: "superseded", config: toConfigRecord(current) };
      }

      const config = await transaction.aIProviderConfig.update({
        where: { id: input.configId },
        data: {
          transportState: input.transportState,
          authState: input.authState,
          lastConnectionAttemptAt: input.checkedAt,
          ...(input.authState === "verified" ? { lastVerifiedAt: input.checkedAt } : {}),
          verificationAttemptToken: null,
          connectionErrorCode: input.connectionErrorCode
        },
        select: aiProviderConfigSelect
      });
      return { status: "applied", config: toConfigRecord(config) };
    });
  }

  async beginModelDiscovery(input: {
    readonly configId: string;
    readonly ownerUserId: string;
    readonly attemptedAt: Date;
    readonly attemptToken: string;
  }): Promise<AIProviderConfigRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      const lockedRows = await transaction.$queryRaw<readonly { readonly id: string }[]>`
        SELECT "id"
        FROM "AIProviderConfig"
        WHERE "id" = ${input.configId} AND "ownerUserId" = ${input.ownerUserId}
        FOR UPDATE
      `;
      if (lockedRows.length === 0) return null;

      const config = await transaction.aIProviderConfig.update({
        where: { id: input.configId },
        data: {
          lastSyncAttemptAt: input.attemptedAt,
          syncAttemptToken: input.attemptToken,
          discoveryState: "not_attempted",
          discoveryErrorCode: null
        },
        select: aiProviderConfigSelect
      });
      return toConfigRecord(config);
    });
  }

  async completeModelDiscovery(
    input: AIProviderSyncCompletionInput
  ): Promise<AIProviderSyncCompletionResult> {
    return this.prisma.$transaction(async (transaction) => {
      const lockedRows = await transaction.$queryRaw<readonly { readonly id: string }[]>`
        SELECT "id"
        FROM "AIProviderConfig"
        WHERE "id" = ${input.configId} AND "ownerUserId" = ${input.ownerUserId}
        FOR UPDATE
      `;

      if (lockedRows.length === 0) {
        return {
          status: "applied",
          config: null,
          discovered: 0,
          created: 0,
          updated: 0,
          skipped: 0
        };
      }

      const current = await transaction.aIProviderConfig.findUnique({
        where: { id: input.configId },
        select: aiProviderConfigSelect
      });
      if (!current) {
        return {
          status: "applied",
          config: null,
          discovered: 0,
          created: 0,
          updated: 0,
          skipped: 0
        };
      }

      if (current.syncAttemptToken !== input.attemptToken) {
        return {
          status: "superseded",
          config: toConfigRecord(current),
          discovered: 0,
          created: 0,
          updated: 0,
          skipped: 0
        };
      }

      const authoritative = input.discoveryState === "available" || input.discoveryState === "empty";
      if (!authoritative) {
        const config = await transaction.aIProviderConfig.update({
          where: { id: input.configId },
          data: {
            transportState: input.transportState,
            authState: input.authState,
            ...discoveryConnectionTelemetry(input),
            discoveryState: input.discoveryState,
            inventoryFreshness: "stale",
            syncAttemptToken: null,
            discoveryErrorCode: input.discoveryErrorCode
          },
          select: aiProviderConfigSelect
        });
        return {
          status: "applied",
          config: toConfigRecord(config),
          discovered: 0,
          created: 0,
          updated: 0,
          skipped: 0
        };
      }

      const profilesByModel = new Map(current.modelProfiles.map((profile) => [profile.model, profile]));
      const usedDisplayNames = new Set(current.modelProfiles.map((profile) => profile.displayName));
      const discoveredIds = new Set(input.models.map((model) => model.id));
      let hasEnabledDefault = current.modelProfiles.some((profile) =>
        profile.enabled
        && profile.isDefault
        && (profile.availability ?? "unknown") !== "unavailable"
        && ((profile.origin ?? "manual") === "manual" || discoveredIds.has(profile.model))
      );
      let canAssignNewDefault = !current.modelProfiles.some((profile) => profile.isDefault);
      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const model of input.models) {
        const existing = profilesByModel.get(model.id);
        if (existing) {
          await transaction.aIModelProfile.update({
            where: { id: existing.id },
            data: {
              availability: "available",
              lastSeenAt: input.observedAt,
              ...capabilityPersistenceData(model.capabilities),
              capabilitySource: current.providerKind,
              capabilitiesObservedAt: input.observedAt
            }
          });
          updated += 1;
          continue;
        }

        const displayName = discoveredModelDisplayName(model, usedDisplayNames);
        usedDisplayNames.add(displayName);
        const makeDefault = !hasEnabledDefault && canAssignNewDefault;
        const profile = await transaction.aIModelProfile.create({
          data: {
            providerConfigId: input.configId,
            model: model.id,
            displayName,
            temperature: 0.2,
            maxTokens: 4096,
            enabled: true,
            isDefault: makeDefault,
            origin: "discovered",
            availability: "available",
            lastSeenAt: input.observedAt,
            ...capabilityPersistenceData(model.capabilities),
            capabilitySource: current.providerKind,
            capabilitiesObservedAt: input.observedAt
          },
          select: aiModelProfileSelect
        });
        profilesByModel.set(profile.model, profile);
        hasEnabledDefault = hasEnabledDefault || profile.isDefault;
        canAssignNewDefault = canAssignNewDefault && !profile.isDefault;
        created += 1;
      }

      const unavailableProfiles = await transaction.aIModelProfile.updateMany({
        where: {
          providerConfigId: input.configId,
          origin: "discovered",
          availability: { not: "unavailable" },
          ...(discoveredIds.size === 0 ? {} : { model: { notIn: Array.from(discoveredIds) } })
        },
        data: { availability: "unavailable" }
      });
      updated += unavailableProfiles.count;

      const config = await transaction.aIProviderConfig.update({
        where: { id: input.configId },
        data: {
          transportState: input.transportState,
          authState: input.authState,
          ...discoveryConnectionTelemetry(input),
          discoveryState: input.discoveryState,
          inventoryFreshness: "fresh",
          syncAttemptToken: null,
          lastSuccessfulSyncAt: input.observedAt,
          discoveryErrorCode: input.discoveryErrorCode
        },
        select: aiProviderConfigSelect
      });
      return {
        status: "applied",
        config: toConfigRecord(config),
        discovered: input.models.length,
        created,
        updated,
        skipped
      };
    });
  }

  async createModelProfile(input: {
    readonly providerConfigId: string;
    readonly ownerUserId: string;
    readonly model: string;
    readonly displayName: string;
    readonly temperature: number;
    readonly maxTokens: number;
    readonly enabled: boolean;
    readonly isDefault: boolean;
    readonly origin?: AIModelProfileOrigin;
    readonly availability?: AIModelAvailabilityState;
    readonly lastSeenAt?: Date | null;
    readonly capabilities?: AIProviderCapabilityFacts;
    readonly capabilitySource?: AIProviderKind | null;
    readonly capabilitiesObservedAt?: Date | null;
  }): Promise<AIModelProfileRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      const config = await transaction.aIProviderConfig.findUnique({
        where: { id: input.providerConfigId },
        select: { id: true, ownerUserId: true }
      });

      if (!config || config.ownerUserId !== input.ownerUserId) {
        return null;
      }

      if (input.isDefault) {
        await this.clearModelDefaults(transaction, input.providerConfigId);
      }

      return transaction.aIModelProfile.create({
        data: {
          providerConfigId: input.providerConfigId,
          model: input.model,
          displayName: input.displayName,
          temperature: input.temperature,
          maxTokens: input.maxTokens,
          enabled: input.enabled,
          isDefault: input.isDefault,
          origin: input.origin ?? "manual",
          availability: input.availability ?? "unknown",
          lastSeenAt: input.lastSeenAt ?? null,
          ...capabilityPersistenceData(input.capabilities),
          capabilitySource: input.capabilitySource ?? null,
          capabilitiesObservedAt: input.capabilitiesObservedAt ?? null
        },
        select: aiModelProfileSelect
      });
    });
  }

  async updateModelProfile(input: {
    readonly providerConfigId: string;
    readonly modelProfileId: string;
    readonly ownerUserId: string;
    readonly model?: string;
    readonly displayName?: string;
    readonly temperature?: number;
    readonly maxTokens?: number;
    readonly enabled?: boolean;
    readonly isDefault?: boolean;
    readonly origin?: AIModelProfileOrigin;
    readonly availability?: AIModelAvailabilityState;
    readonly lastSeenAt?: Date | null;
    readonly capabilities?: AIProviderCapabilityFacts;
    readonly capabilitySource?: AIProviderKind | null;
    readonly capabilitiesObservedAt?: Date | null;
  }): Promise<AIModelProfileRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      const modelProfile = await transaction.aIModelProfile.findUnique({
        where: { id: input.modelProfileId },
        select: {
          id: true,
          providerConfigId: true,
          providerConfig: { select: { ownerUserId: true } }
        }
      });

      if (
        !modelProfile ||
        modelProfile.providerConfigId !== input.providerConfigId ||
        modelProfile.providerConfig.ownerUserId !== input.ownerUserId
      ) {
        return null;
      }

      if (input.isDefault === true) {
        await this.clearModelDefaults(transaction, input.providerConfigId);
      }

      const data: Prisma.AIModelProfileUncheckedUpdateInput = {};
      if (input.model !== undefined) data.model = input.model;
      if (input.displayName !== undefined) data.displayName = input.displayName;
      if (input.temperature !== undefined) data.temperature = input.temperature;
      if (input.maxTokens !== undefined) data.maxTokens = input.maxTokens;
      if (input.enabled !== undefined) data.enabled = input.enabled;
      if (input.isDefault !== undefined) data.isDefault = input.isDefault;
      if (input.origin !== undefined) data.origin = input.origin;
      if (input.availability !== undefined) data.availability = input.availability;
      if (input.lastSeenAt !== undefined) data.lastSeenAt = input.lastSeenAt;
      if (input.capabilities !== undefined) {
        Object.assign(data, capabilityPersistenceData(input.capabilities));
        data.capabilitySource = input.capabilitySource ?? null;
        data.capabilitiesObservedAt = input.capabilitiesObservedAt ?? null;
      }

      return transaction.aIModelProfile.update({
        where: { id: input.modelProfileId },
        data,
        select: aiModelProfileSelect
      });
    });
  }

  async deleteModelProfile(input: {
    readonly providerConfigId: string;
    readonly modelProfileId: string;
    readonly ownerUserId: string;
  }): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const modelProfile = await transaction.aIModelProfile.findUnique({
        where: { id: input.modelProfileId },
        select: {
          id: true,
          providerConfigId: true,
          providerConfig: { select: { ownerUserId: true } }
        }
      });

      if (
        !modelProfile ||
        modelProfile.providerConfigId !== input.providerConfigId ||
        modelProfile.providerConfig.ownerUserId !== input.ownerUserId
      ) {
        return false;
      }

      await transaction.aIModelProfile.delete({ where: { id: input.modelProfileId } });
      return true;
    });
  }

  async setDefaultModelProfile(input: {
    readonly providerConfigId: string;
    readonly modelProfileId: string;
    readonly ownerUserId: string;
  }): Promise<AIModelProfileRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      const modelProfile = await transaction.aIModelProfile.findUnique({
        where: { id: input.modelProfileId },
        select: {
          id: true,
          providerConfigId: true,
          providerConfig: { select: { ownerUserId: true } }
        }
      });

      if (
        !modelProfile ||
        modelProfile.providerConfigId !== input.providerConfigId ||
        modelProfile.providerConfig.ownerUserId !== input.ownerUserId
      ) {
        return null;
      }

      await this.clearModelDefaults(transaction, input.providerConfigId);
      return transaction.aIModelProfile.update({
        where: { id: input.modelProfileId },
        data: { isDefault: true, enabled: true },
        select: aiModelProfileSelect
      });
    });
  }

  async deleteConfig(input: {
    readonly configId: string;
    readonly ownerUserId: string;
  }): Promise<boolean> {
    const result = await this.prisma.aIProviderConfig.deleteMany({
      where: {
        id: input.configId,
        ownerUserId: input.ownerUserId
      }
    });

    return result.count === 1;
  }

  async setDefaultConfig(input: {
    readonly configId: string;
    readonly ownerUserId: string;
  }): Promise<AIProviderConfigRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.aIProviderConfig.findUnique({
        where: { id: input.configId },
        select: { id: true, ownerUserId: true }
      });

      if (!current || current.ownerUserId !== input.ownerUserId) {
        return null;
      }

      await this.clearOwnerDefaults(transaction, input.ownerUserId);
      const config = await transaction.aIProviderConfig.update({
        where: { id: input.configId },
        data: { isDefault: true },
        select: aiProviderConfigSelect
      });

      return toConfigRecord(config);
    });
  }

  private async clearOwnerDefaults(transaction: PrismaTransaction, ownerUserId: string): Promise<void> {
    await transaction.aIProviderConfig.updateMany({
      where: { ownerUserId, isDefault: true },
      data: { isDefault: false }
    });
  }

  private async clearModelDefaults(transaction: PrismaTransaction, providerConfigId: string): Promise<void> {
    await transaction.aIModelProfile.updateMany({
      where: { providerConfigId, isDefault: true },
      data: { isDefault: false }
    });
  }
}

export function createAIConfigService(
  repository: AIProviderConfigRepository,
  cipher: AIKeyCipher = createAIKeyCipher(),
  options: {
    readonly now?: () => Date;
    readonly providerAdapter?: AIProviderAdapter;
    readonly auditService?: Pick<AuditService, "writeAuditEvent">;
    readonly onAuditError?: (error: unknown, context: { readonly action: string; readonly targetId: string }) => void;
  } = {}
) {
  const now = options.now ?? (() => new Date());
  const providerAdapter = options.providerAdapter ?? createAIProviderAdapter();
  const auditService = options.auditService;

  async function writeConfigAudit(input: {
    readonly actor: AIActor;
    readonly action: string;
    readonly config: AIProviderConfigRecord;
    readonly payload: Record<string, unknown>;
  }): Promise<void> {
    if (!auditService) return;
    try {
      await auditService.writeAuditEvent({
        actorUserId: input.actor.userId,
        action: input.action,
        targetType: "AIProviderConfig",
        targetId: input.config.id,
        payload: input.payload
      });
    } catch (error) {
      try {
        options.onAuditError?.(error, { action: input.action, targetId: input.config.id });
      } catch (reportingError) {
        void reportingError;
      }
      throw error;
    }
  }

  return {
    async listConfigs(actor: AIActor): Promise<{ readonly configs: readonly AIProviderConfigView[] }> {
      const configs = await repository.listConfigs(actor.userId);
      return { configs: configs.map(toConfigView) };
    },

    async getConfig(
      actor: AIActor,
      configId: string
    ): Promise<{ readonly config: AIProviderConfigView }> {
      const config = ensureOwnedConfig(await repository.findConfigById(configId), actor.userId);
      return { config: toConfigView(config) };
    },

    async createConfig(input: CreateAIProviderConfigInput): Promise<{ readonly config: AIProviderConfigView }> {
      const apiKey = normalizeOptionalApiKey(input.apiKey);
      const encryptedKey = apiKey ? encryptApiKey(cipher, apiKey) : null;
      const connection = normalizeProviderConnection(input);
      const defaultModelProfile = input.defaultModelProfile === undefined
        ? undefined
        : normalizeModelProfileInput(input.defaultModelProfile);

      try {
        const config = await repository.createConfig({
          ownerUserId: input.actor.userId,
          name: ensureNonEmptyText(input.name, "config name", 200),
           provider: connection.provider,
           providerKind: connection.providerKind,
           baseURL: connection.baseURL,
          ...(defaultModelProfile === undefined ? {} : { defaultModelProfile }),
          encryptedApiKey: encryptedKey?.encryptedApiKey ?? null,
          keyPreview: encryptedKey?.keyPreview ?? null,
          isDefault: input.isDefault ?? false
        });

        await writeConfigAudit({
          actor: input.actor,
          action: "ai_provider_config.created",
          config,
          payload: {
            providerKind: config.providerKind ?? "custom",
            outcome: "succeeded",
            recordedAt: now().toISOString()
          }
        });

        return { config: toConfigView(config) };
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw conflict("AI provider config name already exists");
        }

        throw error;
      }
    },

    async updateConfig(input: UpdateAIProviderConfigInput): Promise<{ readonly config: AIProviderConfigView }> {
      const apiKey = normalizeOptionalApiKey(input.apiKey);
      const encryptedKey = apiKey ? encryptApiKey(cipher, apiKey) : undefined;
      const current = ensureOwnedConfig(await repository.findConfigById(input.configId), input.actor.userId);
      const connection = input.provider === undefined && input.providerKind === undefined && input.baseURL === undefined
        ? null
        : normalizeProviderConnection({
            provider: input.provider ?? current.provider,
            providerKind: input.providerKind ?? current.providerKind,
             baseURL: input.baseURL ?? current.baseURL
           });
      const connectionChanged = connection !== null && (
        connection.provider !== current.provider
        || connection.providerKind !== current.providerKind
        || connection.baseURL !== current.baseURL
      );

      if (connectionChanged && current.encryptedApiKey && encryptedKey === undefined) {
        throw badRequest("Changing provider connection requires a replacement API key");
      }

      const runtimeIdentityChanged = connectionChanged || encryptedKey !== undefined;

      try {
        const config = await repository.updateConfig({
          configId: input.configId,
          ownerUserId: input.actor.userId,
          ...(runtimeIdentityChanged
            ? {
                expectedRuntimeIdentity: {
                  provider: current.provider,
                  ...(current.providerKind === undefined ? {} : { providerKind: current.providerKind }),
                  baseURL: current.baseURL,
                  encryptedApiKey: current.encryptedApiKey
                }
              }
            : {}),
          ...(input.name === undefined ? {} : { name: ensureNonEmptyText(input.name, "config name", 200) }),
           ...(connection === null ? {} : { provider: connection.provider, providerKind: connection.providerKind, baseURL: connection.baseURL }),
          ...(input.isDefault === undefined ? {} : { isDefault: input.isDefault }),
          ...(runtimeIdentityChanged
            ? {
                transportState: "not_checked",
                authState: "unverified",
                discoveryState: "not_attempted",
                 inventoryFreshness: "stale",
                 verificationAttemptToken: null,
                 syncAttemptToken: null,
                 lastVerifiedAt: null,
                 connectionErrorCode: null,
                discoveryErrorCode: null
              }
            : {}),
          ...(encryptedKey === undefined
            ? {}
            : {
                encryptedApiKey: encryptedKey.encryptedApiKey,
                keyPreview: encryptedKey.keyPreview
              })
        });
        const ownedConfig = ensureOwnedConfig(config, input.actor.userId);
        await writeConfigAudit({
          actor: input.actor,
          action: "ai_provider_config.updated",
          config: ownedConfig,
          payload: {
            providerKind: ownedConfig.providerKind ?? "custom",
            outcome: "succeeded",
            connectionChanged,
            keyChanged: encryptedKey !== undefined,
            recordedAt: now().toISOString()
          }
        });

        return { config: toConfigView(ownedConfig) };
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw conflict("AI provider config name already exists");
        }

        throw error;
      }
    },

    async createModelProfile(input: CreateAIModelProfileInput): Promise<{
      readonly config: AIProviderConfigView;
      readonly modelProfile: AIModelProfileView;
    }> {
      ensureOwnedConfig(await repository.findConfigById(input.configId), input.actor.userId);
      const normalized = normalizeModelProfileInput(input);

      try {
        const modelProfile = ensureOwnedModelProfile(
          await repository.createModelProfile({
            providerConfigId: input.configId,
            ownerUserId: input.actor.userId,
            model: normalized.model,
            displayName: normalized.displayName,
            temperature: normalized.temperature,
            maxTokens: normalized.maxTokens,
            enabled: normalized.enabled,
            isDefault: normalized.isDefault
          }),
          input.configId
        );
        const config = ensureOwnedConfig(await repository.findConfigById(input.configId), input.actor.userId);

        return { config: toConfigView(config), modelProfile: toModelProfileView(modelProfile) };
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw conflict("AI model profile model or display name already exists");
        }

        throw error;
      }
    },

    async updateModelProfile(input: UpdateAIModelProfileInput): Promise<{
      readonly config: AIProviderConfigView;
      readonly modelProfile: AIModelProfileView;
    }> {
      ensureOwnedConfig(await repository.findConfigById(input.configId), input.actor.userId);
      if (input.enabled === false && input.isDefault === true) {
        throw badRequest("Default AI model profile must be enabled");
      }

      try {
        const modelProfile = ensureOwnedModelProfile(
          await repository.updateModelProfile({
            providerConfigId: input.configId,
            modelProfileId: input.modelProfileId,
            ownerUserId: input.actor.userId,
            ...(input.model === undefined ? {} : { model: ensureNonEmptyText(input.model, "model") }),
            ...(input.displayName === undefined
              ? {}
              : { displayName: ensureNonEmptyText(input.displayName, "model display name", 200) }),
            ...(input.temperature === undefined ? {} : { temperature: ensureTemperature(input.temperature) }),
            ...(input.maxTokens === undefined ? {} : { maxTokens: ensureMaxTokens(input.maxTokens) }),
            ...(input.isDefault === true ? { enabled: true } : input.enabled === undefined ? {} : { enabled: input.enabled }),
            ...(input.enabled === false && input.isDefault === undefined
              ? { isDefault: false }
              : input.isDefault === undefined ? {} : { isDefault: input.isDefault })
          }),
          input.configId
        );
        const config = ensureOwnedConfig(await repository.findConfigById(input.configId), input.actor.userId);

        return { config: toConfigView(config), modelProfile: toModelProfileView(modelProfile) };
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          throw conflict("AI model profile model or display name already exists");
        }

        throw error;
      }
    },

    async deleteModelProfile(input: {
      readonly actor: AIActor;
      readonly configId: string;
      readonly modelProfileId: string;
    }): Promise<{ readonly ok: true; readonly config: AIProviderConfigView }> {
      ensureOwnedConfig(await repository.findConfigById(input.configId), input.actor.userId);
      if (!(await repository.deleteModelProfile({
        providerConfigId: input.configId,
        modelProfileId: input.modelProfileId,
        ownerUserId: input.actor.userId
      }))) {
        throw notFound();
      }

      return {
        ok: true,
        config: toConfigView(ensureOwnedConfig(await repository.findConfigById(input.configId), input.actor.userId))
      };
    },

    async setDefaultModelProfile(input: {
      readonly actor: AIActor;
      readonly configId: string;
      readonly modelProfileId: string;
    }): Promise<{ readonly config: AIProviderConfigView; readonly modelProfile: AIModelProfileView }> {
      ensureOwnedConfig(await repository.findConfigById(input.configId), input.actor.userId);
      const modelProfile = ensureOwnedModelProfile(
        await repository.setDefaultModelProfile({
          providerConfigId: input.configId,
          modelProfileId: input.modelProfileId,
          ownerUserId: input.actor.userId
        }),
        input.configId
      );
      const config = ensureOwnedConfig(await repository.findConfigById(input.configId), input.actor.userId);

      return { config: toConfigView(config), modelProfile: toModelProfileView(modelProfile) };
    },

    async deleteConfig(input: {
      readonly actor: AIActor;
      readonly configId: string;
    }): Promise<{ readonly ok: true }> {
      const current = ensureOwnedConfig(await repository.findConfigById(input.configId), input.actor.userId);
      if (!(await repository.deleteConfig({ configId: input.configId, ownerUserId: input.actor.userId }))) {
        throw notFound();
      }
      await writeConfigAudit({
        actor: input.actor,
        action: "ai_provider_config.deleted",
        config: current,
        payload: {
          providerKind: current.providerKind ?? "custom",
          outcome: "succeeded",
          recordedAt: now().toISOString()
        }
      });

      return { ok: true };
    },

    async setDefaultConfig(input: {
      readonly actor: AIActor;
      readonly configId: string;
    }): Promise<{ readonly config: AIProviderConfigView }> {
      const config = await repository.setDefaultConfig({
        configId: input.configId,
        ownerUserId: input.actor.userId
      });

      return { config: toConfigView(ensureOwnedConfig(config, input.actor.userId)) };
    },

    async discoverModels(input: {
      readonly actor: AIActor;
      readonly configId: string;
    }): Promise<DiscoverAIModelsResponse> {
      const attemptedAt = now();
      const attemptToken = randomUUID();
      const current = ensureOwnedConfig(await repository.beginModelDiscovery({
        configId: input.configId,
        ownerUserId: input.actor.userId,
        attemptedAt,
        attemptToken
      }), input.actor.userId);

      let discoveryResult: Awaited<ReturnType<AIProviderAdapter["discoverModels"]>>;
      try {
        const connectionConfig: AIProviderConnectionConfig = {
          id: current.id,
          ownerUserId: input.actor.userId,
          provider: current.provider,
          providerKind: current.providerKind,
          baseURL: current.baseURL,
          apiKey: decryptApiKey(cipher, current.encryptedApiKey)
        };
        discoveryResult = await providerAdapter.discoverModels({ config: connectionConfig });
      } catch (error) {
        const providerError = providerErrorFromUnknown(error);
        const preflightFailure = error instanceof AIConfigError
          || providerError.category === "missing_key"
          || providerError.category === "invalid_base_url";
        const failureDiscovery = error instanceof AIProviderExecutionError && error.message === "Discovery is unsupported for this endpoint"
          ? "unsupported"
          : "unavailable";
        const completion = await repository.completeModelDiscovery({
          configId: current.id,
          ownerUserId: input.actor.userId,
          attemptToken,
          transportState: preflightFailure ? "not_checked" : "unreachable",
          authState: "not_checked",
          discoveryState: failureDiscovery,
          discoveryErrorCode: providerError.category,
          observedAt: now(),
          models: []
        });
        const finalConfig = ensureOwnedConfig(completion.config, input.actor.userId);
        await writeConfigAudit({
          actor: input.actor,
          action: "ai_provider_config.models_discovered",
          config: finalConfig,
          payload: {
            providerKind: finalConfig.providerKind ?? "custom",
            outcome: completion.status === "superseded" ? "superseded" : "failed",
            transport: finalConfig.transportState ?? "not_checked",
            authentication: finalConfig.authState ?? "unverified",
            discovery: finalConfig.discoveryState ?? "not_attempted",
            freshness: finalConfig.inventoryFreshness ?? "never",
            discoveredCount: 0,
            createdCount: 0,
            updatedCount: 0,
            skippedCount: 0,
            recordedAt: now().toISOString()
          }
        });
        if (completion.status === "superseded") {
          return {
            config: toConfigView(finalConfig),
            discovered: 0,
            created: 0,
            updated: 0,
            skipped: 0,
            discovery: finalConfig.discoveryState ?? "not_attempted",
            freshness: finalConfig.inventoryFreshness ?? "never",
            syncedAt: toIsoString(finalConfig.lastSuccessfulSyncAt ?? finalConfig.lastSyncAttemptAt ?? attemptedAt),
            warnings: ["A newer synchronization result was kept."]
          };
        }
        throw new AIConfigError(
          safeProviderErrorMessage(providerError.category),
          providerError.category === "missing_key" || providerError.category === "invalid_base_url" ? 400 : 502
        );
      }

      let discoveredModels: readonly AIProviderDiscoveredModel[];
      try {
        discoveredModels = normalizeDiscoveredModels(discoveryResult.models);
      } catch {
        const completion = await repository.completeModelDiscovery({
          configId: current.id,
          ownerUserId: input.actor.userId,
          attemptToken,
          transportState: discoveryResult.transport,
          authState: discoveryResult.authentication,
          discoveryState: "malformed",
          discoveryErrorCode: "response_parse_failure",
          observedAt: now(),
          models: []
        });
        const finalConfig = ensureOwnedConfig(completion.config, input.actor.userId);
        await writeConfigAudit({
          actor: input.actor,
          action: "ai_provider_config.models_discovered",
          config: finalConfig,
          payload: {
            providerKind: finalConfig.providerKind ?? "custom",
            outcome: completion.status === "superseded" ? "superseded" : "malformed",
            transport: finalConfig.transportState ?? "not_checked",
            authentication: finalConfig.authState ?? "unverified",
            discovery: finalConfig.discoveryState ?? "not_attempted",
            freshness: finalConfig.inventoryFreshness ?? "never",
            discoveredCount: 0,
            createdCount: 0,
            updatedCount: 0,
            skippedCount: 0,
            recordedAt: now().toISOString()
          }
        });
        return {
          config: toConfigView(finalConfig),
          discovered: 0,
          created: 0,
          updated: 0,
          skipped: 0,
          discovery: finalConfig.discoveryState ?? "not_attempted",
          freshness: finalConfig.inventoryFreshness ?? "never",
          syncedAt: toIsoString(finalConfig.lastSuccessfulSyncAt ?? finalConfig.lastSyncAttemptAt ?? attemptedAt),
          warnings: completion.status === "superseded"
            ? ["A newer synchronization result was kept."]
            : ["Provider model discovery returned malformed data. Use advanced manual model entry or retry later."]
        };
      }

      const completion = await repository.completeModelDiscovery({
        configId: current.id,
        ownerUserId: input.actor.userId,
        attemptToken,
        transportState: discoveryResult.transport,
        authState: discoveryResult.authentication,
        discoveryState: discoveryResult.discovery,
        discoveryErrorCode: discoveryResult.errorCode,
        observedAt: now(),
        models: discoveredModels
      });
      const finalConfig = ensureOwnedConfig(completion.config, input.actor.userId);
      const warnings = completion.status === "superseded"
        ? ["A newer synchronization result was kept."]
        : discoveryResult.discovery === "unsupported"
          ? ["This endpoint does not expose model discovery. Use advanced manual model entry."]
          : discoveryResult.discovery === "empty"
            ? ["Provider returned no models. Use advanced manual model entry if this provider cannot list models."]
            : [];
      await writeConfigAudit({
        actor: input.actor,
        action: "ai_provider_config.models_discovered",
        config: finalConfig,
        payload: {
          providerKind: finalConfig.providerKind ?? "custom",
          outcome: completion.status === "superseded" ? "superseded" : "succeeded",
          transport: finalConfig.transportState ?? "not_checked",
          authentication: finalConfig.authState ?? "unverified",
          discovery: finalConfig.discoveryState ?? "not_attempted",
          freshness: finalConfig.inventoryFreshness ?? "never",
          discoveredCount: completion.discovered,
          createdCount: completion.created,
          updatedCount: completion.updated,
          skippedCount: completion.skipped,
          recordedAt: now().toISOString()
        }
      });

      return {
        config: toConfigView(finalConfig),
        discovered: completion.discovered,
        created: completion.created,
        updated: completion.updated,
        skipped: completion.skipped,
        discovery: finalConfig.discoveryState ?? "not_attempted",
        freshness: finalConfig.inventoryFreshness ?? "never",
        syncedAt: toIsoString(finalConfig.lastSuccessfulSyncAt ?? finalConfig.lastSyncAttemptAt ?? attemptedAt),
        ...(warnings.length === 0 ? {} : { warnings })
      };
    },

    async testDraftConfig(input: TestAIProviderDraftConfigInput): Promise<{ readonly healthCheck: ProviderHealthCheck }> {
      try {
        const connection = normalizeProviderConnection(input);
        const model = input.model === undefined ? "" : ensureNonEmptyText(input.model, "model");
        const config: AIProviderConnectionConfig = {
          id: "draft-provider-config",
          ownerUserId: input.actor.userId,
          provider: connection.provider,
          providerKind: connection.providerKind,
          baseURL: connection.baseURL,
          apiKey: normalizeRequiredApiKey(input.apiKey)
        };

        return {
          healthCheck: await runProviderHealthCheck({
            providerAdapter,
            now,
            config,
            model
          })
        };
      } catch (error) {
        return {
          healthCheck: failedHealthCheckForError({
            error,
            provider: input.provider,
            model: input.model ?? "",
            baseURL: input.baseURL,
            checkedAt: now()
          })
        };
      }
    },

    async testSavedConfig(input: TestAIProviderSavedConfigInput): Promise<{ readonly healthCheck: ProviderHealthCheck }> {
      const attemptedAt = now();
      const attemptToken = randomUUID();
      const current = ensureOwnedConfig(await repository.beginSavedVerification({
        configId: input.configId,
        ownerUserId: input.actor.userId,
        attemptedAt,
        attemptToken
      }), input.actor.userId);
      const currentProfile = input.modelProfileId
        ? ensureOwnedModelProfile(
            current.modelProfiles.find((profile) => profile.id === input.modelProfileId) ?? null,
            current.id
          )
        : defaultEnabledModelProfile(current);
      const rawModel = currentProfile?.model ?? "";

      let healthCheckResult: ProviderHealthCheck;
      try {
        const connection = normalizeProviderConnection({
          provider: current.provider,
          providerKind: current.providerKind,
          baseURL: current.baseURL
        });
        const config: AIProviderConnectionConfig = {
          id: current.id,
          ownerUserId: input.actor.userId,
          provider: connection.provider,
          providerKind: connection.providerKind,
          baseURL: connection.baseURL,
          apiKey: decryptApiKey(cipher, current.encryptedApiKey)
        };

        healthCheckResult = await runProviderHealthCheck({
          providerAdapter,
          now,
          config,
          model: rawModel
        });
      } catch (error) {
        healthCheckResult = failedHealthCheckForError({
          error,
          provider: current.provider,
          model: rawModel,
          baseURL: current.baseURL,
          checkedAt: now()
        });
      }

      const completion = await repository.completeSavedVerification({
        configId: current.id,
        ownerUserId: input.actor.userId,
        attemptToken,
        expectedRuntimeIdentity: {
          provider: current.provider,
          ...(current.providerKind === undefined ? {} : { providerKind: current.providerKind }),
          baseURL: current.baseURL,
          encryptedApiKey: current.encryptedApiKey
        },
        transportState: healthCheckResult.connection?.transport ?? "not_checked",
        authState: healthCheckResult.connection?.authentication ?? "not_checked",
        checkedAt: new Date(healthCheckResult.checkedAt),
        connectionErrorCode: healthCheckResult.category
      });
      const finalConfig = ensureOwnedConfig(completion.config, input.actor.userId);
      await writeConfigAudit({
        actor: input.actor,
        action: "ai_provider_config.verified",
        config: finalConfig,
        payload: {
          providerKind: finalConfig.providerKind ?? "custom",
          outcome: completion.status === "superseded" ? "superseded" : healthCheckResult.ok ? "succeeded" : "failed",
          transport: healthCheckResult.connection?.transport ?? "not_checked",
          authentication: healthCheckResult.connection?.authentication ?? "not_checked",
          recordedAt: now().toISOString()
        }
      });
      if (completion.status === "superseded") {
        return {
          healthCheck: healthCheck({
            ok: false,
            category: "unknown",
            message: "A newer connection verification result was kept.",
            latencyMs: healthCheckResult.latencyMs,
            provider: current.provider,
            model: rawModel,
            baseURL: current.baseURL,
            checkedAt: new Date(healthCheckResult.checkedAt)
          })
        };
      }

      return { healthCheck: healthCheckResult };
    }
  };
}

export type AIConfigService = ReturnType<typeof createAIConfigService>;

let cachedService: AIConfigService | undefined;

export async function getDefaultAIConfigService(): Promise<AIConfigService> {
  if (!cachedService) {
    const [{ prisma }, auditService] = await Promise.all([import("@jixia/db"), getDefaultAuditService()]);
    cachedService = createAIConfigService(new PrismaAIProviderConfigRepository(prisma), createAIKeyCipher(), { auditService });
  }

  return cachedService;
}
