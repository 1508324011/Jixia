import type {
  AIConversationDTO,
  AIConversationRunStreamEvent,
  CurrentSessionView,
  SpaceRole
} from "@jixia/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { unauthorized } from "../auth/errors.js";
import type { AuthSessionRecord, AuthUserRecord } from "../auth/repository.js";
import type { AuthService, CurrentSessionResult } from "../auth/service.js";
import { createTestApiApp } from "../../test-utils/app.js";
import {
  AIConfigError,
  createAIConfigService,
  type AIActor,
  type AIConfigService,
  type AIModelProfileInput,
  type AIModelProfileRecord,
  type AIProviderConfigRecord,
  type AIProviderConfigRepository
} from "./ai-config.service.js";
import { AIProviderExecutionError } from "./ai-provider-adapter.js";
import type { AIProviderAdapter, AIProviderRunInput } from "./ai-provider-adapter.js";
import type { AIConversationService } from "./ai-conversation.service.js";
import type { AIKeyCipher } from "./crypto.js";

const baseNow = new Date("2026-06-15T12:00:00.000Z");
const cookieName = "jixia_ai_config_test_session";

class InMemoryAIConfigRepository implements AIProviderConfigRepository {
  readonly configs = new Map<string, AIProviderConfigRecord>();
  readonly modelProfiles = new Map<string, AIModelProfileRecord>();
  private nextId = 1;
  private nextProfileId = 1;

  async listConfigs(ownerUserId: string): Promise<readonly AIProviderConfigRecord[]> {
    return Array.from(this.configs.values())
      .filter((config) => config.ownerUserId === ownerUserId)
      .sort((left, right) => Number(right.isDefault) - Number(left.isDefault))
      .map((config) => this.withProfiles(config));
  }

  async findConfigById(configId: string): Promise<AIProviderConfigRecord | null> {
    const config = this.configs.get(configId);
    return config ? this.withProfiles(config) : null;
  }

  async findModelProfileById(modelProfileId: string): Promise<AIModelProfileRecord | null> {
    return this.modelProfiles.get(modelProfileId) ?? null;
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
    this.ensureUniqueName(input.ownerUserId, input.name);

    if (input.isDefault) {
      this.clearDefaults(input.ownerUserId);
    }

    const timestamp = new Date(baseNow.getTime() + this.nextId * 1_000);
    const config: AIProviderConfigRecord = {
      id: `config-${this.nextId++}`,
      ownerUserId: input.ownerUserId,
      name: input.name,
      provider: input.provider,
      baseURL: input.baseURL,
      encryptedApiKey: input.encryptedApiKey,
      keyPreview: input.keyPreview,
      isDefault: input.isDefault,
      modelProfiles: [],
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.configs.set(config.id, config);
    if (input.defaultModelProfile) {
      this.createProfileRecord(config.id, input.defaultModelProfile, true, timestamp);
    }
    return this.withProfiles(config);
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
    const current = this.configs.get(input.configId);

    if (!current || current.ownerUserId !== input.ownerUserId) {
      return null;
    }

    if (input.name !== undefined && input.name !== current.name) {
      this.ensureUniqueName(input.ownerUserId, input.name);
    }

    if (input.isDefault === true) {
      this.clearDefaults(input.ownerUserId);
    }

    const updated: AIProviderConfigRecord = {
      ...current,
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.provider === undefined ? {} : { provider: input.provider }),
      ...(input.baseURL === undefined ? {} : { baseURL: input.baseURL }),
      ...(input.encryptedApiKey === undefined ? {} : { encryptedApiKey: input.encryptedApiKey }),
      ...(input.keyPreview === undefined ? {} : { keyPreview: input.keyPreview }),
      ...(input.isDefault === undefined ? {} : { isDefault: input.isDefault }),
      updatedAt: new Date(current.updatedAt.getTime() + 1_000)
    };
    this.configs.set(updated.id, updated);
    return this.withProfiles(updated);
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
    const config = this.configs.get(input.providerConfigId);
    if (!config || config.ownerUserId !== input.ownerUserId) {
      return null;
    }
    if (input.isDefault) {
      this.clearModelDefaults(input.providerConfigId);
    }
    return this.createProfileRecord(input.providerConfigId, input, input.isDefault, new Date(config.updatedAt.getTime() + 1_000));
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
    const config = this.configs.get(input.providerConfigId);
    const profile = this.modelProfiles.get(input.modelProfileId);
    if (!config || config.ownerUserId !== input.ownerUserId || !profile || profile.providerConfigId !== input.providerConfigId) {
      return null;
    }
    if (input.isDefault === true) {
      this.clearModelDefaults(input.providerConfigId);
    }
    const updated: AIModelProfileRecord = {
      ...profile,
      ...(input.model === undefined ? {} : { model: input.model }),
      ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
      ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
      ...(input.maxTokens === undefined ? {} : { maxTokens: input.maxTokens }),
      ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
      ...(input.isDefault === undefined ? {} : { isDefault: input.isDefault }),
      updatedAt: new Date(profile.updatedAt.getTime() + 1_000)
    };
    this.modelProfiles.set(updated.id, updated);
    return updated;
  }

  async deleteModelProfile(input: {
    readonly providerConfigId: string;
    readonly modelProfileId: string;
    readonly ownerUserId: string;
  }): Promise<boolean> {
    const config = this.configs.get(input.providerConfigId);
    const profile = this.modelProfiles.get(input.modelProfileId);
    if (!config || config.ownerUserId !== input.ownerUserId || !profile || profile.providerConfigId !== input.providerConfigId) {
      return false;
    }
    this.modelProfiles.delete(input.modelProfileId);
    return true;
  }

  async setDefaultModelProfile(input: {
    readonly providerConfigId: string;
    readonly modelProfileId: string;
    readonly ownerUserId: string;
  }): Promise<AIModelProfileRecord | null> {
    const config = this.configs.get(input.providerConfigId);
    const profile = this.modelProfiles.get(input.modelProfileId);
    if (!config || config.ownerUserId !== input.ownerUserId || !profile || profile.providerConfigId !== input.providerConfigId) {
      return null;
    }
    this.clearModelDefaults(input.providerConfigId);
    const updated = { ...profile, enabled: true, isDefault: true, updatedAt: new Date(profile.updatedAt.getTime() + 1_000) };
    this.modelProfiles.set(updated.id, updated);
    return updated;
  }

  async deleteConfig(input: { readonly configId: string; readonly ownerUserId: string }): Promise<boolean> {
    const config = this.configs.get(input.configId);

    if (!config || config.ownerUserId !== input.ownerUserId) {
      return false;
    }

    this.configs.delete(input.configId);
    for (const profile of this.modelProfiles.values()) {
      if (profile.providerConfigId === input.configId) {
        this.modelProfiles.delete(profile.id);
      }
    }
    return true;
  }

  async setDefaultConfig(input: {
    readonly configId: string;
    readonly ownerUserId: string;
  }): Promise<AIProviderConfigRecord | null> {
    const config = this.configs.get(input.configId);

    if (!config || config.ownerUserId !== input.ownerUserId) {
      return null;
    }

    this.clearDefaults(input.ownerUserId);
    const updated = { ...config, isDefault: true, updatedAt: new Date(config.updatedAt.getTime() + 1_000) };
    this.configs.set(config.id, updated);
    return this.withProfiles(updated);
  }

  private clearDefaults(ownerUserId: string): void {
    for (const config of this.configs.values()) {
      if (config.ownerUserId === ownerUserId && config.isDefault) {
        this.configs.set(config.id, { ...config, isDefault: false });
      }
    }
  }

  private ensureUniqueName(ownerUserId: string, name: string): void {
    if (Array.from(this.configs.values()).some((config) => config.ownerUserId === ownerUserId && config.name === name)) {
      throw Object.assign(new Error("duplicate config"), { code: "P2002" });
    }
  }

  private createProfileRecord(
    providerConfigId: string,
    input: AIModelProfileInput,
    isDefault: boolean,
    timestamp: Date
  ): AIModelProfileRecord {
    const profile: AIModelProfileRecord = {
      id: `model-profile-${this.nextProfileId++}`,
      providerConfigId,
      model: input.model,
      displayName: input.displayName,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      enabled: input.enabled ?? true,
      isDefault,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.modelProfiles.set(profile.id, profile);
    return profile;
  }

  private withProfiles(config: AIProviderConfigRecord): AIProviderConfigRecord {
    return {
      ...config,
      modelProfiles: Array.from(this.modelProfiles.values())
        .filter((profile) => profile.providerConfigId === config.id)
        .sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || left.createdAt.getTime() - right.createdAt.getTime())
    };
  }

  private clearModelDefaults(providerConfigId: string): void {
    for (const profile of this.modelProfiles.values()) {
      if (profile.providerConfigId === providerConfigId && profile.isDefault) {
        this.modelProfiles.set(profile.id, { ...profile, isDefault: false });
      }
    }
  }
}

const cipher: AIKeyCipher = {
  encrypt: (plaintext) => `encrypted:${plaintext}`,
  decrypt: (ciphertext) => ciphertext.replace(/^encrypted:/, "")
};

class RecordingProviderAdapter implements AIProviderAdapter {
  readonly inputs: AIProviderRunInput[] = [];
  failWith: Error | null = null;

  async runConversation(input: AIProviderRunInput) {
    this.inputs.push(input);

    if (this.failWith) {
      throw this.failWith;
    }

    return { assistantText: "Jixia provider health check ok" };
  }

  async *streamConversation() {
    yield { type: "final" as const, assistantText: "Jixia provider health check ok" };
  }
}

function actor(userId: string, spaceRole: SpaceRole = "SpaceMember"): AIActor {
  return { userId, spaceId: "space-1", spaceRole };
}

function modelProfile(model: string, temperature = 0.2, maxTokens = 4096): AIModelProfileInput {
  return {
    model,
    displayName: model,
    temperature,
    maxTokens,
    enabled: true,
    isDefault: true
  };
}

async function expectAIConfigError(promise: Promise<unknown>, statusCode: number): Promise<void> {
  await expect(promise).rejects.toSatisfy((error: unknown) => {
    expect(error).toBeInstanceOf(AIConfigError);
    expect((error as AIConfigError).statusCode).toBe(statusCode);
    return true;
  });
}

function currentSessionFor(input: {
  readonly sessionId: string;
  readonly userId: string;
  readonly spaceRole: SpaceRole;
}): CurrentSessionResult {
  const user: AuthUserRecord = {
    id: input.userId,
    email: `${input.userId}@example.test`,
    displayName: input.userId,
    passwordHash: "not-used",
    spaceMembers: [
      {
        id: `${input.userId}-space-member`,
        role: input.spaceRole,
        createdAt: baseNow,
        space: { id: "space-1", name: "Jixia Lab" }
      }
    ],
    projectMembers: []
  };
  const session: AuthSessionRecord = {
    id: input.sessionId,
    userId: input.userId,
    expiresAt: new Date(baseNow.getTime() + 60_000),
    revokedAt: null,
    user
  };
  const currentSession: CurrentSessionView = {
    user: {
      id: input.userId,
      email: user.email,
      displayName: user.displayName,
      space: { id: "space-1", name: "Jixia Lab", role: input.spaceRole },
      projectMemberships: []
    },
    expiresAt: session.expiresAt.toISOString()
  };

  return { session, currentSession, renewed: false };
}

function createRouteAuthService(sessions: ReadonlyMap<string, CurrentSessionResult>): AuthService {
  return {
    async login() {
      throw new Error("not used");
    },
    async getCurrentSession(sessionId: string) {
      const session = sessions.get(sessionId);

      if (!session) {
        throw unauthorized();
      }

      return session;
    },
    async logout() {},
    async logoutAll() {},
    async createInvitation() {
      throw new Error("not used");
    },
    async acceptInvitation() {
      throw new Error("not used");
    }
  } satisfies AuthService;
}

function routeConversation(): AIConversationDTO {
  return {
    id: "route-conversation",
    ownerUserId: "route-user",
    title: "Route conversation",
    currentDocumentId: null,
    selectedContextSnapshot: { currentDocumentId: null, items: [], capturedAt: baseNow.toISOString() },
    contextAttachments: [],
    messages: [],
    createdAt: baseNow.toISOString(),
    updatedAt: baseNow.toISOString()
  };
}

function createRouteConversationService(events: readonly AIConversationRunStreamEvent[]): AIConversationService {
  return {
    async listConversations() {
      return { conversations: [] };
    },
    async listConversationsForDocument() {
      return { conversations: [] };
    },
    async getConversation() {
      return { conversation: routeConversation() };
    },
    async createConversation() {
      return { conversation: routeConversation() };
    },
    async appendMessage() {
      return {
        conversation: routeConversation(),
        run: {
          id: "route-run",
          status: "succeeded",
          errorMessage: null,
          createdAt: baseNow.toISOString(),
          startedAt: baseNow.toISOString(),
          completedAt: baseNow.toISOString()
        }
      };
    },
    async *streamMessage() {
      for (const event of events) {
        yield event;
      }
    },
    async cancelRun() {
      return {
        run: {
          id: "route-run",
          status: "cancelled",
          errorCategory: "cancelled",
          errorMessage: "The AI run was cancelled.",
          createdAt: baseNow.toISOString(),
          startedAt: baseNow.toISOString(),
          completedAt: baseNow.toISOString()
        }
      };
    },
    async deleteConversation() {
      return { conversationId: "route-conversation" };
    }
  } satisfies AIConversationService;
}

describe("AI config service", () => {
  let repository: InMemoryAIConfigRepository;
  let service: AIConfigService;
  let providerAdapter: RecordingProviderAdapter;

  beforeEach(() => {
    repository = new InMemoryAIConfigRepository();
    providerAdapter = new RecordingProviderAdapter();
    service = createAIConfigService(repository, cipher, {
      now: () => baseNow,
      providerAdapter
    });
  });

  it("encrypts full API keys at rest and never returns raw or encrypted key material", async () => {
    const response = await service.createConfig({
      actor: actor("owner-user"),
      name: "OpenAI",
      provider: "openai",
      baseURL: "https://api.openai.example/v1",
      defaultModelProfile: modelProfile("gpt-test"),
      isDefault: true,
      apiKey: "sk-secret-123456"
    });

    expect(response.config).toMatchObject({ hasKey: true, isDefault: true });
    expect(response.config.modelProfiles).toEqual([
      expect.objectContaining({ model: "gpt-test", displayName: "gpt-test", isDefault: true })
    ]);
    expect(response.config).not.toHaveProperty("keyPreview");
    expect(JSON.stringify(response)).not.toContain("sk-secret-123456");
    expect(JSON.stringify(response)).not.toContain("encrypted:sk-secret-123456");
    expect(repository.configs.get(response.config.id)).toMatchObject({
      encryptedApiKey: "encrypted:sk-secret-123456",
      keyPreview: "sk-s…3456"
    });
  });

  it("preserves encrypted key material when updating non-secret fields", async () => {
    const created = await service.createConfig({
      actor: actor("owner-user"),
      name: "Config",
      provider: "openai",
      baseURL: "https://api.example/v1",
      defaultModelProfile: modelProfile("old-model", 0.1, 1000),
      apiKey: "sk-preserve-1234"
    });

    const updated = await service.updateConfig({
      actor: actor("owner-user"),
      configId: created.config.id,
      name: "Config renamed",
      baseURL: "https://api-renamed.example/v1"
    });

    expect(updated.config).toMatchObject({ name: "Config renamed", baseURL: "https://api-renamed.example/v1", hasKey: true });
    expect(updated.config.modelProfiles[0]).toMatchObject({ model: "old-model", maxTokens: 1000 });
    expect(updated.config).not.toHaveProperty("keyPreview");
    expect(repository.configs.get(created.config.id)).toMatchObject({
      encryptedApiKey: "encrypted:sk-preserve-1234",
      keyPreview: "sk-p…1234"
    });
  });

  it("replaces encrypted key material when a new API key is submitted", async () => {
    const created = await service.createConfig({
      actor: actor("owner-user"),
      name: "Config",
      provider: "openai",
      baseURL: "https://api.example/v1",
      defaultModelProfile: modelProfile("model", 0.1, 1000),
      apiKey: "sk-old-123456"
    });

    await service.updateConfig({ actor: actor("owner-user"), configId: created.config.id, apiKey: "sk-new-987654" });

    expect(repository.configs.get(created.config.id)).toMatchObject({
      encryptedApiKey: "encrypted:sk-new-987654",
      keyPreview: "sk-n…7654"
    });
  });

  it("tests draft provider configs through the server adapter without persisting secrets", async () => {
    const result = await service.testDraftConfig({
      actor: actor("owner-user"),
      provider: "openai",
      baseURL: "https://api.example/v1",
      model: "gpt-test",
      temperature: 0,
      maxTokens: 32,
      apiKey: "sk-draft-secret"
    });

    expect(result.healthCheck).toEqual({
      ok: true,
      category: null,
      message: "Connection verified through the server adapter.",
      latencyMs: 0,
      provider: "openai",
      model: "gpt-test",
      baseURL: "https://api.example/v1",
      checkedAt: baseNow.toISOString()
    });
    expect(providerAdapter.inputs[0]).toMatchObject({
      config: { apiKey: "sk-draft-secret", model: "gpt-test" },
      userMessage: { content: "Reply with exactly: Jixia provider health check ok" },
      selectedContextSnapshot: { currentDocumentId: null, items: [] }
    });
    expect(repository.configs.size).toBe(0);
    expect(JSON.stringify(result)).not.toMatch(/sk-draft-secret|encrypted|Authorization|headers/i);
  });

  it("tests saved provider configs with encrypted key preservation and safe error categories", async () => {
    const created = await service.createConfig({
      actor: actor("owner-user"),
      name: "Config",
      provider: "openai",
      baseURL: "https://api.example/v1",
      defaultModelProfile: modelProfile("old-model", 0.1, 1000),
      apiKey: "sk-saved-secret"
    });
    providerAdapter.failWith = new AIProviderExecutionError("model_not_found", "raw model payload sk-saved-secret");

    const result = await service.testSavedConfig({ actor: actor("owner-user"), configId: created.config.id, model: "bad-model" });

    expect(result.healthCheck).toMatchObject({
      ok: false,
      category: "model_not_found",
      message: "The provider could not find or run the selected model. Check the model id.",
      model: "bad-model"
    });
    expect(providerAdapter.inputs[0]?.config).toMatchObject({ apiKey: "sk-saved-secret", model: "bad-model" });
    expect(repository.configs.get(created.config.id)).toMatchObject({
      encryptedApiKey: "encrypted:sk-saved-secret",
      keyPreview: "sk-s…cret"
    });
    expect(JSON.stringify(result)).not.toMatch(/sk-saved-secret|encrypted|raw model payload|Authorization|headers/i);
  });

  it("keeps one provider key while switching saved health checks between model profiles", async () => {
    const created = await service.createConfig({
      actor: actor("owner-user"),
      name: "Shared provider",
      provider: "openai",
      baseURL: "https://api.example/v1",
      defaultModelProfile: modelProfile("gpt-fast", 0.1, 1000),
      apiKey: "sk-shared-secret"
    });
    const secondProfile = await service.createModelProfile({
      actor: actor("owner-user"),
      configId: created.config.id,
      model: "gpt-deep",
      displayName: "Deep reasoning",
      temperature: 0.4,
      maxTokens: 8000,
      enabled: true
    });

    await service.testSavedConfig({ actor: actor("owner-user"), configId: created.config.id, modelProfileId: created.config.modelProfiles[0]!.id });
    await service.testSavedConfig({ actor: actor("owner-user"), configId: created.config.id, modelProfileId: secondProfile.modelProfile.id });

    expect(providerAdapter.inputs.map((input) => input.config)).toEqual([
      expect.objectContaining({ apiKey: "sk-shared-secret", model: "gpt-fast", temperature: 0.1, maxTokens: 1000 }),
      expect.objectContaining({ apiKey: "sk-shared-secret", model: "gpt-deep", temperature: 0.4, maxTokens: 8000 })
    ]);
    expect(new Set(Array.from(repository.configs.values()).map((config) => config.encryptedApiKey))).toEqual(new Set(["encrypted:sk-shared-secret"]));
  });

  it("keeps one default config per owner", async () => {
    const first = await service.createConfig({
      actor: actor("owner-user"),
      name: "First",
      provider: "openai",
      baseURL: "https://one.example/v1",
      defaultModelProfile: modelProfile("one", 0, 100),
      isDefault: true
    });
    const second = await service.createConfig({
      actor: actor("owner-user"),
      name: "Second",
      provider: "anthropic",
      baseURL: "https://two.example/v1",
      defaultModelProfile: modelProfile("two", 0, 100),
      isDefault: true
    });

    expect(repository.configs.get(first.config.id)?.isDefault).toBe(false);
    expect(repository.configs.get(second.config.id)?.isDefault).toBe(true);
    await service.setDefaultConfig({ actor: actor("owner-user"), configId: first.config.id });
    expect(repository.configs.get(first.config.id)?.isDefault).toBe(true);
    expect(repository.configs.get(second.config.id)?.isDefault).toBe(false);
  });

  it("restricts list view update delete and default changes to the owner", async () => {
    const created = await service.createConfig({
      actor: actor("owner-user"),
      name: "Private",
      provider: "openai",
      baseURL: "https://api.example/v1",
      defaultModelProfile: modelProfile("model", 0, 100)
    });

    await expect(service.listConfigs(actor("other-user"))).resolves.toEqual({ configs: [] });
    await expectAIConfigError(service.getConfig(actor("other-user"), created.config.id), 404);
    await expectAIConfigError(
      service.updateConfig({ actor: actor("other-user"), configId: created.config.id, name: "stolen" }),
      404
    );
    await expectAIConfigError(service.setDefaultConfig({ actor: actor("other-user"), configId: created.config.id }), 404);
    await expectAIConfigError(service.deleteConfig({ actor: actor("other-user"), configId: created.config.id }), 404);
    expect(repository.configs.has(created.config.id)).toBe(true);
  });
});

describe("AI config routes", () => {
  let app: FastifyInstance | undefined;
  let service: AIConfigService;

  beforeEach(() => {
    service = createAIConfigService(new InMemoryAIConfigRepository(), cipher);
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("registers AI config routes without breaking health and requires authentication", async () => {
    const sessions = new Map([
      [
        "route-session",
        currentSessionFor({ sessionId: "route-session", userId: "route-user", spaceRole: "SpaceMember" })
      ]
    ]);
    app = await createTestApiApp({
      ai: {
        nodeEnv: "production",
        sessionCookieName: cookieName,
        authService: createRouteAuthService(sessions),
        aiConfigService: service
      }
    });

    const healthResponse = await app.inject({ method: "GET", url: "/health" });
    expect(healthResponse.statusCode).toBe(200);
    expect(healthResponse.json()).toEqual({ ok: true });

    const unauthenticatedResponse = await app.inject({ method: "GET", url: "/ai/configs" });
    expect(unauthenticatedResponse.statusCode).toBe(401);

    const createResponse = await app.inject({
      method: "POST",
      url: "/ai/configs",
      headers: { cookie: `${cookieName}=route-session` },
      payload: {
        name: "Route Config",
        provider: "openai",
        baseURL: "https://api.example/v1",
        defaultModelProfile: {
          model: "gpt-route",
          displayName: "Route model",
          temperature: 0.3,
          maxTokens: 1000
        },
        isDefault: true,
        apiKey: "sk-route-secret"
      }
    });

    expect(createResponse.statusCode).toBe(200);
    expect(createResponse.json()).toMatchObject({
      config: { ownerUserId: "route-user", hasKey: true, isDefault: true }
    });
    expect(createResponse.json().config).not.toHaveProperty("keyPreview");
    expect(createResponse.body).not.toContain("sk-route-secret");
    expect(createResponse.body).not.toContain("encrypted:sk-route-secret");
  });

  it("exposes provider test, SSE stream, and cancel routes with safe payloads", async () => {
    service = createAIConfigService(new InMemoryAIConfigRepository(), cipher, {
      now: () => baseNow,
      providerAdapter: new RecordingProviderAdapter()
    });
    const sessions = new Map([
      [
        "route-session",
        currentSessionFor({ sessionId: "route-session", userId: "route-user", spaceRole: "SpaceMember" })
      ]
    ]);
    const conversation = routeConversation();
    const streamEvents: readonly AIConversationRunStreamEvent[] = [
      {
        type: "run",
        run: {
          id: "route-run",
          status: "running",
          providerConfigId: "config-1",
          modelProfileId: "model-profile-1",
          errorMessage: null,
          createdAt: baseNow.toISOString(),
          startedAt: baseNow.toISOString(),
          completedAt: null
        }
      },
      { type: "assistant_delta", runId: "route-run", messageId: "message-1", delta: "hello" },
      {
        type: "done",
        run: {
          id: "route-run",
          status: "succeeded",
          modelProfileId: "model-profile-1",
          errorMessage: null,
          createdAt: baseNow.toISOString(),
          startedAt: baseNow.toISOString(),
          completedAt: baseNow.toISOString()
        },
        conversation
      }
    ];
    app = await createTestApiApp({
      ai: {
        nodeEnv: "production",
        sessionCookieName: cookieName,
        authService: createRouteAuthService(sessions),
        aiConfigService: service,
        aiConversationService: createRouteConversationService(streamEvents)
      }
    });

    const draftTestResponse = await app.inject({
      method: "POST",
      url: "/ai/configs/test",
      headers: { cookie: `${cookieName}=route-session` },
      payload: {
        provider: "openai",
        baseURL: "https://api.example/v1",
        model: "gpt-route",
        temperature: 0,
        maxTokens: 32,
        apiKey: "sk-route-test"
      }
    });
    expect(draftTestResponse.statusCode).toBe(200);
    expect(draftTestResponse.json()).toMatchObject({ healthCheck: { ok: true, category: null } });
    expect(draftTestResponse.body).not.toMatch(/sk-route-test|encrypted|Authorization/i);

    const streamResponse = await app.inject({
      method: "POST",
      url: "/ai/conversations/route-conversation/messages/stream",
      headers: { cookie: `${cookieName}=route-session` },
      payload: {
        modelProfileId: "model-profile-1",
        selectedContextSnapshot: { currentDocumentId: null, items: [], capturedAt: baseNow.toISOString() },
        message: { role: "user", content: "hello" }
      }
    });
    expect(streamResponse.statusCode).toBe(200);
    expect(streamResponse.headers["content-type"]).toContain("text/event-stream");
    expect(streamResponse.body).toContain('"type":"assistant_delta"');
    expect(streamResponse.body).toContain('"type":"done"');

    const cancelResponse = await app.inject({
      method: "POST",
      url: "/ai/runs/route-run/cancel",
      headers: { cookie: `${cookieName}=route-session` }
    });
    expect(cancelResponse.statusCode).toBe(200);
    expect(cancelResponse.json()).toMatchObject({ run: { id: "route-run", status: "cancelled" } });
  });
});
