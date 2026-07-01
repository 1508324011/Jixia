import type { Prisma, PrismaClient } from "@jixia/db/generated";
import type {
  AIConversationMessageDTO,
  AIModelProfileView,
  AIProviderConfigView,
  ProviderHealthCheck,
  SpaceRole
} from "@jixia/shared";

import {
  AIProviderExecutionError,
  createOpenAICompatibleProviderAdapter,
  normalizeAIProviderBaseURL,
  providerErrorFromUnknown,
  safeProviderErrorMessage,
  type AIProviderAdapter,
  type AIProviderExecutionConfig
} from "./ai-provider-adapter.js";
import { AICryptoError, createAIKeyCipher, createKeyPreview, type AIKeyCipher } from "./crypto.js";

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
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type AIProviderConfigRecord = {
  readonly id: string;
  readonly ownerUserId: string;
  readonly name: string;
  readonly provider: string;
  readonly baseURL: string;
  readonly encryptedApiKey: string | null;
  readonly keyPreview: string | null;
  readonly isDefault: boolean;
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

export type CreateAIProviderConfigInput = {
  readonly actor: AIActor;
  readonly name: string;
  readonly provider: string;
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
  readonly baseURL: string;
  readonly model: string;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly apiKey?: string;
};

export type TestAIProviderSavedConfigInput = {
  readonly actor: AIActor;
  readonly configId: string;
  readonly modelProfileId?: string;
  readonly provider?: string;
  readonly baseURL?: string;
  readonly model?: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly apiKey?: string;
};

export type AIProviderConfigRepository = {
  readonly listConfigs: (ownerUserId: string) => Promise<readonly AIProviderConfigRecord[]>;
  readonly findConfigById: (configId: string) => Promise<AIProviderConfigRecord | null>;
  readonly findModelProfileById: (modelProfileId: string) => Promise<AIModelProfileRecord | null>;
  readonly createConfig: (input: {
    readonly ownerUserId: string;
    readonly name: string;
    readonly provider: string;
    readonly baseURL: string;
    readonly defaultModelProfile?: AIModelProfileInput;
    readonly encryptedApiKey: string | null;
    readonly keyPreview: string | null;
    readonly isDefault: boolean;
  }) => Promise<AIProviderConfigRecord>;
  readonly updateConfig: (input: {
    readonly configId: string;
    readonly ownerUserId: string;
    readonly name?: string;
    readonly provider?: string;
    readonly baseURL?: string;
    readonly encryptedApiKey?: string | null;
    readonly keyPreview?: string | null;
    readonly isDefault?: boolean;
  }) => Promise<AIProviderConfigRecord | null>;
  readonly createModelProfile: (input: {
    readonly providerConfigId: string;
    readonly ownerUserId: string;
    readonly model: string;
    readonly displayName: string;
    readonly temperature: number;
    readonly maxTokens: number;
    readonly enabled: boolean;
    readonly isDefault: boolean;
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

function defaultEnabledModelProfile(config: AIProviderConfigRecord): AIModelProfileRecord | null {
  return config.modelProfiles.find((profile) => profile.enabled && profile.isDefault)
    ?? config.modelProfiles.find((profile) => profile.enabled)
    ?? null;
}

function toModelProfileView(record: AIModelProfileRecord): AIModelProfileView {
  return {
    id: record.id,
    providerConfigId: record.providerConfigId,
    model: record.model,
    displayName: record.displayName,
    temperature: record.temperature,
    maxTokens: record.maxTokens,
    enabled: record.enabled,
    isDefault: record.isDefault,
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
    baseURL: record.baseURL,
    hasKey: Boolean(record.encryptedApiKey),
    isDefault: record.isDefault,
    modelProfiles: record.modelProfiles.map(toModelProfileView),
    createdAt: toIsoString(record.createdAt),
    updatedAt: toIsoString(record.updatedAt)
  };
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
}): ProviderHealthCheck {
  return {
    ok: input.ok,
    category: input.category,
    message: input.message,
    latencyMs: input.latencyMs,
    provider: input.provider,
    model: input.model,
    baseURL: input.baseURL,
    checkedAt: toIsoString(input.checkedAt)
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
    baseURL: input.baseURL.trim(),
    checkedAt: input.checkedAt
  });
}

function emptyHealthContext(checkedAt: Date) {
  return {
    currentDocumentId: null,
    capturedAt: toIsoString(checkedAt),
    items: []
  };
}

function healthUserMessage(checkedAt: Date): AIConversationMessageDTO {
  return {
    id: "provider-health-check",
    role: "user",
    content: "Reply with exactly: Jixia provider health check ok",
    createdAt: toIsoString(checkedAt)
  };
}

async function runProviderHealthCheck(input: {
  readonly providerAdapter: AIProviderAdapter;
  readonly now: () => Date;
  readonly config: AIProviderExecutionConfig;
}): Promise<ProviderHealthCheck> {
  const startedAt = input.now();

  try {
    await input.providerAdapter.runConversation({
      config: input.config,
      messages: [],
      userMessage: healthUserMessage(startedAt),
      selectedContextSnapshot: emptyHealthContext(startedAt)
    });
    const checkedAt = input.now();

    return healthCheck({
      ok: true,
      category: null,
      message: providerHealthMessage(true),
      latencyMs: Math.max(0, checkedAt.getTime() - startedAt.getTime()),
      provider: input.config.provider,
      model: input.config.model,
      baseURL: input.config.baseURL,
      checkedAt
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
      model: input.config.model,
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
  baseURL: true,
  encryptedApiKey: true,
  keyPreview: true,
  isDefault: true,
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
    readonly name?: string;
    readonly provider?: string;
    readonly baseURL?: string;
    readonly encryptedApiKey?: string | null;
    readonly keyPreview?: string | null;
    readonly isDefault?: boolean;
  }): Promise<AIProviderConfigRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.aIProviderConfig.findUnique({
        where: { id: input.configId },
        select: { id: true, ownerUserId: true }
      });

      if (!current || current.ownerUserId !== input.ownerUserId) {
        return null;
      }

      if (input.isDefault === true) {
        await this.clearOwnerDefaults(transaction, input.ownerUserId);
      }

      const data: Prisma.AIProviderConfigUncheckedUpdateInput = {};

      if (input.name !== undefined) data.name = input.name;
      if (input.provider !== undefined) data.provider = input.provider;
      if (input.baseURL !== undefined) data.baseURL = input.baseURL;
      if (input.encryptedApiKey !== undefined) data.encryptedApiKey = input.encryptedApiKey;
      if (input.keyPreview !== undefined) data.keyPreview = input.keyPreview;
      if (input.isDefault !== undefined) data.isDefault = input.isDefault;

      const config = await transaction.aIProviderConfig.update({
        where: { id: input.configId },
        data,
        select: aiProviderConfigSelect
      });

      return toConfigRecord(config);
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
          isDefault: input.isDefault
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
  } = {}
) {
  const now = options.now ?? (() => new Date());
  const providerAdapter = options.providerAdapter ?? createOpenAICompatibleProviderAdapter();

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
      const defaultModelProfile = input.defaultModelProfile === undefined
        ? undefined
        : normalizeModelProfileInput(input.defaultModelProfile);

      try {
        const config = await repository.createConfig({
          ownerUserId: input.actor.userId,
          name: ensureNonEmptyText(input.name, "config name", 200),
          provider: ensureNonEmptyText(input.provider, "provider"),
          baseURL: ensureProviderBaseURL(input.baseURL),
          ...(defaultModelProfile === undefined ? {} : { defaultModelProfile }),
          encryptedApiKey: encryptedKey?.encryptedApiKey ?? null,
          keyPreview: encryptedKey?.keyPreview ?? null,
          isDefault: input.isDefault ?? false
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
      ensureOwnedConfig(await repository.findConfigById(input.configId), input.actor.userId);
      const apiKey = normalizeOptionalApiKey(input.apiKey);
      const encryptedKey = apiKey ? encryptApiKey(cipher, apiKey) : undefined;

      try {
        const config = await repository.updateConfig({
          configId: input.configId,
          ownerUserId: input.actor.userId,
          ...(input.name === undefined ? {} : { name: ensureNonEmptyText(input.name, "config name", 200) }),
          ...(input.provider === undefined ? {} : { provider: ensureNonEmptyText(input.provider, "provider") }),
          ...(input.baseURL === undefined ? {} : { baseURL: ensureProviderBaseURL(input.baseURL) }),
          ...(input.isDefault === undefined ? {} : { isDefault: input.isDefault }),
          ...(encryptedKey === undefined
            ? {}
            : {
                encryptedApiKey: encryptedKey.encryptedApiKey,
                keyPreview: encryptedKey.keyPreview
              })
        });

        return { config: toConfigView(ensureOwnedConfig(config, input.actor.userId)) };
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
          throw conflict("AI model profile display name already exists");
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
          throw conflict("AI model profile display name already exists");
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
      if (!(await repository.deleteConfig({ configId: input.configId, ownerUserId: input.actor.userId }))) {
        throw notFound();
      }

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

    async testDraftConfig(input: TestAIProviderDraftConfigInput): Promise<{ readonly healthCheck: ProviderHealthCheck }> {
      try {
        const provider = ensureNonEmptyText(input.provider, "provider");
        const baseURL = ensureProviderBaseURL(input.baseURL);
        const model = ensureNonEmptyText(input.model, "model");
        const config: AIProviderExecutionConfig = {
          id: "draft-provider-config",
          ownerUserId: input.actor.userId,
          provider,
          baseURL,
          model,
          temperature: ensureTemperature(input.temperature),
          maxTokens: ensureMaxTokens(input.maxTokens),
          apiKey: normalizeRequiredApiKey(input.apiKey)
        };

        return { healthCheck: await runProviderHealthCheck({ providerAdapter, now, config }) };
      } catch (error) {
        return {
          healthCheck: failedHealthCheckForError({
            error,
            provider: input.provider,
            model: input.model,
            baseURL: input.baseURL,
            checkedAt: now()
          })
        };
      }
    },

    async testSavedConfig(input: TestAIProviderSavedConfigInput): Promise<{ readonly healthCheck: ProviderHealthCheck }> {
      const current = ensureOwnedConfig(await repository.findConfigById(input.configId), input.actor.userId);
      const currentProfile = input.modelProfileId
        ? ensureOwnedModelProfile(await repository.findModelProfileById(input.modelProfileId), current.id)
        : defaultEnabledModelProfile(current);
      if (!currentProfile) {
        throw badRequest("No enabled AI model profile is available for this provider");
      }
      const rawProvider = input.provider ?? current.provider;
      const rawBaseURL = input.baseURL ?? current.baseURL;
      const rawModel = input.model ?? currentProfile.model;

      try {
        const provider = input.provider === undefined ? current.provider : ensureNonEmptyText(input.provider, "provider");
        const baseURL = input.baseURL === undefined ? current.baseURL : ensureProviderBaseURL(input.baseURL);
        const model = input.model === undefined ? currentProfile.model : ensureNonEmptyText(input.model, "model");
        const config: AIProviderExecutionConfig = {
          id: currentProfile.id,
          ownerUserId: input.actor.userId,
          provider,
          baseURL,
          model,
          temperature: input.temperature === undefined ? currentProfile.temperature : ensureTemperature(input.temperature),
          maxTokens: input.maxTokens === undefined ? currentProfile.maxTokens : ensureMaxTokens(input.maxTokens),
          apiKey: input.apiKey === undefined ? decryptApiKey(cipher, current.encryptedApiKey) : normalizeRequiredApiKey(input.apiKey)
        };

        return { healthCheck: await runProviderHealthCheck({ providerAdapter, now, config }) };
      } catch (error) {
        return {
          healthCheck: failedHealthCheckForError({
            error,
            provider: rawProvider,
            model: rawModel,
            baseURL: rawBaseURL,
            checkedAt: now()
          })
        };
      }
    }
  };
}

export type AIConfigService = ReturnType<typeof createAIConfigService>;

let cachedService: AIConfigService | undefined;

export async function getDefaultAIConfigService(): Promise<AIConfigService> {
  if (!cachedService) {
    const [{ prisma }] = await Promise.all([import("@jixia/db")]);
    cachedService = createAIConfigService(new PrismaAIProviderConfigRepository(prisma));
  }

  return cachedService;
}
