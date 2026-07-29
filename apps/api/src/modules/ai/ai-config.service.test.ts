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
import {
  ensureMetadataOnlyAuditPayload,
  type AuditService,
  type WriteAuditEventInput
} from "../audit/audit.service.js";
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

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function waitForCount(values: readonly unknown[], expected: number): Promise<void> {
  for (let attempt = 0; attempt < 100 && values.length < expected; attempt += 1) {
    await Promise.resolve();
  }
  expect(values).toHaveLength(expected);
}

function uniqueConstraintError(message: string): Error & { readonly code: "P2002" } {
  return Object.assign(new Error(message), { code: "P2002" as const });
}

function capabilityRecord(
  capabilities: NonNullable<Parameters<AIProviderConfigRepository["createModelProfile"]>[0]["capabilities"]> | undefined
) {
  const values = capabilities ?? {};
  const unsupported = new Set(values.unsupported ?? []);
  const state = (name: NonNullable<typeof values.unsupported>[number], value: unknown) =>
    unsupported.has(name) ? "unsupported" as const : value === undefined ? "unknown" as const : "observed" as const;
  return {
    contextWindowState: state("contextWindowTokens", values.contextWindowTokens),
    contextWindowTokens: values.contextWindowTokens ?? null,
    maxOutputState: state("maxOutputTokens", values.maxOutputTokens),
    maxOutputTokens: values.maxOutputTokens ?? null,
    inputModalitiesState: state("inputModalities", values.inputModalities),
    inputModalities: values.inputModalities ?? null,
    outputModalitiesState: state("outputModalities", values.outputModalities),
    outputModalities: values.outputModalities ?? null,
    supportedParametersState: state("supportedParameters", values.supportedParameters),
    supportedParameters: values.supportedParameters ?? null
  };
}

function discoveryDisplayName(
  model: { readonly id: string; readonly displayName?: string },
  usedDisplayNames: ReadonlySet<string>
): string {
  const humanized = (model.id.split("/").filter(Boolean).pop() ?? model.id)
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  const baseName = (model.displayName?.trim() || humanized).slice(0, 200).trim() || model.id;
  if (!usedDisplayNames.has(baseName)) return baseName;
  const withModelId = `${baseName} (${model.id})`.slice(0, 200).trim();
  if (withModelId && !usedDisplayNames.has(withModelId)) return withModelId;
  for (let suffix = 2; ; suffix += 1) {
    const suffixText = ` ${suffix}`;
    const candidate = `${baseName.slice(0, 200 - suffixText.length)}${suffixText}`.trim();
    if (candidate && !usedDisplayNames.has(candidate)) return candidate;
  }
}

class InMemoryAIConfigRepository implements AIProviderConfigRepository {
  readonly configs = new Map<string, AIProviderConfigRecord>();
  readonly modelProfiles = new Map<string, AIModelProfileRecord>();
  failNextDiscoveryCompletion = false;
  beforeNextDiscoveryBegin: (() => void | Promise<void>) | null = null;
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
    readonly providerKind: AIProviderConfigRecord["providerKind"];
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
      providerKind: input.providerKind,
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
    readonly expectedRuntimeIdentity?: {
      readonly provider: string;
      readonly providerKind?: AIProviderConfigRecord["providerKind"];
      readonly baseURL: string;
      readonly encryptedApiKey: string | null;
    };
    readonly name?: string;
    readonly provider?: string;
    readonly providerKind?: AIProviderConfigRecord["providerKind"];
    readonly baseURL?: string;
    readonly encryptedApiKey?: string | null;
    readonly keyPreview?: string | null;
    readonly isDefault?: boolean;
    readonly transportState?: AIProviderConfigRecord["transportState"];
    readonly authState?: AIProviderConfigRecord["authState"];
    readonly discoveryState?: AIProviderConfigRecord["discoveryState"];
    readonly inventoryFreshness?: AIProviderConfigRecord["inventoryFreshness"];
    readonly lastConnectionAttemptAt?: Date | null;
    readonly lastVerifiedAt?: Date | null;
    readonly verificationAttemptToken?: string | null;
    readonly lastSyncAttemptAt?: Date | null;
    readonly syncAttemptToken?: string | null;
    readonly lastSuccessfulSyncAt?: Date | null;
    readonly connectionErrorCode?: string | null;
    readonly discoveryErrorCode?: string | null;
  }): Promise<AIProviderConfigRecord | null> {
    const current = this.configs.get(input.configId);

    if (!current || current.ownerUserId !== input.ownerUserId) {
      return null;
    }

    if (input.expectedRuntimeIdentity && (
      current.provider !== input.expectedRuntimeIdentity.provider
      || current.providerKind !== input.expectedRuntimeIdentity.providerKind
      || current.baseURL !== input.expectedRuntimeIdentity.baseURL
      || current.encryptedApiKey !== input.expectedRuntimeIdentity.encryptedApiKey
    )) {
      throw new AIConfigError("AI provider connection changed; retry update", 409);
    }

    const changesConnectionIdentity = (
      input.provider !== undefined && input.provider !== current.provider
    ) || (
      input.providerKind !== undefined && input.providerKind !== current.providerKind
    ) || (
      input.baseURL !== undefined && input.baseURL !== current.baseURL
    );
    if (changesConnectionIdentity && current.encryptedApiKey && input.encryptedApiKey === undefined) {
      throw new AIConfigError("Changing provider connection requires a replacement API key", 400);
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
      ...(input.providerKind === undefined ? {} : { providerKind: input.providerKind }),
      ...(input.baseURL === undefined ? {} : { baseURL: input.baseURL }),
      ...(input.encryptedApiKey === undefined ? {} : { encryptedApiKey: input.encryptedApiKey }),
      ...(input.keyPreview === undefined ? {} : { keyPreview: input.keyPreview }),
      ...(input.isDefault === undefined ? {} : { isDefault: input.isDefault }),
      ...(input.transportState === undefined ? {} : { transportState: input.transportState }),
      ...(input.authState === undefined ? {} : { authState: input.authState }),
      ...(input.discoveryState === undefined ? {} : { discoveryState: input.discoveryState }),
      ...(input.inventoryFreshness === undefined ? {} : { inventoryFreshness: input.inventoryFreshness }),
      ...(input.lastConnectionAttemptAt === undefined ? {} : { lastConnectionAttemptAt: input.lastConnectionAttemptAt }),
      ...(input.lastVerifiedAt === undefined ? {} : { lastVerifiedAt: input.lastVerifiedAt }),
      ...(input.verificationAttemptToken === undefined ? {} : { verificationAttemptToken: input.verificationAttemptToken }),
      ...(input.lastSyncAttemptAt === undefined ? {} : { lastSyncAttemptAt: input.lastSyncAttemptAt }),
      ...(input.syncAttemptToken === undefined ? {} : { syncAttemptToken: input.syncAttemptToken }),
      ...(input.lastSuccessfulSyncAt === undefined ? {} : { lastSuccessfulSyncAt: input.lastSuccessfulSyncAt }),
      ...(input.connectionErrorCode === undefined ? {} : { connectionErrorCode: input.connectionErrorCode }),
      ...(input.discoveryErrorCode === undefined ? {} : { discoveryErrorCode: input.discoveryErrorCode }),
      updatedAt: new Date(current.updatedAt.getTime() + 1_000)
    };
    this.configs.set(updated.id, updated);
    return this.withProfiles(updated);
  }

  async beginSavedVerification(
    input: Parameters<AIProviderConfigRepository["beginSavedVerification"]>[0]
  ): ReturnType<AIProviderConfigRepository["beginSavedVerification"]> {
    const current = this.configs.get(input.configId);
    if (!current || current.ownerUserId !== input.ownerUserId) return null;
    const updated: AIProviderConfigRecord = {
      ...current,
      lastConnectionAttemptAt: input.attemptedAt,
      verificationAttemptToken: input.attemptToken,
      updatedAt: input.attemptedAt
    };
    this.configs.set(updated.id, updated);
    return this.withProfiles(updated);
  }

  async completeSavedVerification(
    input: Parameters<AIProviderConfigRepository["completeSavedVerification"]>[0]
  ): ReturnType<AIProviderConfigRepository["completeSavedVerification"]> {
    const current = this.configs.get(input.configId);
    if (!current || current.ownerUserId !== input.ownerUserId) {
      return { status: "applied", config: null };
    }
    if (
      current.verificationAttemptToken !== input.attemptToken
      || current.provider !== input.expectedRuntimeIdentity.provider
      || current.providerKind !== input.expectedRuntimeIdentity.providerKind
      || current.baseURL !== input.expectedRuntimeIdentity.baseURL
      || current.encryptedApiKey !== input.expectedRuntimeIdentity.encryptedApiKey
    ) {
      return { status: "superseded", config: this.withProfiles(current) };
    }
    const updated: AIProviderConfigRecord = {
      ...current,
      transportState: input.transportState,
      authState: input.authState,
      lastConnectionAttemptAt: input.checkedAt,
      ...(input.authState === "verified" ? { lastVerifiedAt: input.checkedAt } : {}),
      verificationAttemptToken: null,
      connectionErrorCode: input.connectionErrorCode,
      updatedAt: input.checkedAt
    };
    this.configs.set(updated.id, updated);
    return { status: "applied", config: this.withProfiles(updated) };
  }

  async beginModelDiscovery(
    input: Parameters<AIProviderConfigRepository["beginModelDiscovery"]>[0]
  ): ReturnType<AIProviderConfigRepository["beginModelDiscovery"]> {
    if (this.beforeNextDiscoveryBegin) {
      const hook = this.beforeNextDiscoveryBegin;
      this.beforeNextDiscoveryBegin = null;
      await hook();
    }
    const current = this.configs.get(input.configId);
    if (!current || current.ownerUserId !== input.ownerUserId) return null;
    const updated: AIProviderConfigRecord = {
      ...current,
      lastSyncAttemptAt: input.attemptedAt,
      syncAttemptToken: input.attemptToken,
      discoveryState: "not_attempted",
      discoveryErrorCode: null,
      updatedAt: input.attemptedAt
    };
    this.configs.set(updated.id, updated);
    return this.withProfiles(updated);
  }

  async completeModelDiscovery(
    input: Parameters<AIProviderConfigRepository["completeModelDiscovery"]>[0]
  ): ReturnType<AIProviderConfigRepository["completeModelDiscovery"]> {
    const stored = this.configs.get(input.configId);
    if (!stored || stored.ownerUserId !== input.ownerUserId) {
      return {
        status: "applied",
        config: null,
        discovered: 0,
        created: 0,
        updated: 0,
        skipped: 0
      };
    }
    const current = this.withProfiles(stored);
    if (current.syncAttemptToken !== input.attemptToken) {
      return {
        status: "superseded",
        config: current,
        discovered: 0,
        created: 0,
        updated: 0,
        skipped: 0
      };
    }

    const authoritative = input.discoveryState === "available" || input.discoveryState === "empty";
    if (!authoritative) {
      const updatedConfig: AIProviderConfigRecord = {
        ...stored,
        transportState: input.transportState,
        authState: input.authState,
        lastConnectionAttemptAt: input.observedAt,
        ...(input.transportState === "reachable" && input.authState === "verified"
          ? { lastVerifiedAt: input.observedAt, connectionErrorCode: null }
          : { connectionErrorCode: input.discoveryErrorCode }),
        discoveryState: input.discoveryState,
        inventoryFreshness: "stale",
        syncAttemptToken: null,
        discoveryErrorCode: input.discoveryErrorCode,
        updatedAt: input.observedAt
      };
      this.configs.set(stored.id, updatedConfig);
      return {
        status: "applied",
        config: this.withProfiles(updatedConfig),
        discovered: 0,
        created: 0,
        updated: 0,
        skipped: 0
      };
    }

    const configSnapshot = new Map(this.configs);
    const profileSnapshot = new Map(this.modelProfiles);
    const nextProfileIdSnapshot = this.nextProfileId;
    try {
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
          this.modelProfiles.set(existing.id, {
            ...existing,
            availability: "available",
            lastSeenAt: input.observedAt,
            ...capabilityRecord(model.capabilities),
            capabilitySource: current.providerKind ?? null,
            capabilitiesObservedAt: input.observedAt,
            updatedAt: input.observedAt
          });
          updated += 1;
          continue;
        }

        const displayName = discoveryDisplayName(model, usedDisplayNames);
        usedDisplayNames.add(displayName);
        const makeDefault = !hasEnabledDefault && canAssignNewDefault;
        const profile = this.createProfileRecord(input.configId, {
          model: model.id,
          displayName,
          temperature: 0.2,
          maxTokens: 4096,
          enabled: true,
          isDefault: makeDefault,
          origin: "discovered",
          availability: "available",
          lastSeenAt: input.observedAt,
          capabilities: model.capabilities,
          capabilitySource: current.providerKind ?? null,
          capabilitiesObservedAt: input.observedAt
        }, makeDefault, input.observedAt);
        profilesByModel.set(profile.model, profile);
        hasEnabledDefault = hasEnabledDefault || profile.isDefault;
        canAssignNewDefault = canAssignNewDefault && !profile.isDefault;
        created += 1;
      }

      for (const profile of this.modelProfiles.values()) {
        if (
          profile.providerConfigId === input.configId
          && profile.origin === "discovered"
          && profile.availability !== "unavailable"
          && !discoveredIds.has(profile.model)
        ) {
          this.modelProfiles.set(profile.id, { ...profile, availability: "unavailable", updatedAt: input.observedAt });
          updated += 1;
        }
      }

      if (this.failNextDiscoveryCompletion) {
        this.failNextDiscoveryCompletion = false;
        throw new Error("injected discovery reconciliation failure");
      }

      const updatedConfig: AIProviderConfigRecord = {
        ...stored,
        transportState: input.transportState,
        authState: input.authState,
        lastConnectionAttemptAt: input.observedAt,
        ...(input.transportState === "reachable" && input.authState === "verified"
          ? { lastVerifiedAt: input.observedAt, connectionErrorCode: null }
          : { connectionErrorCode: input.discoveryErrorCode }),
        discoveryState: input.discoveryState,
        inventoryFreshness: "fresh",
        syncAttemptToken: null,
        lastSuccessfulSyncAt: input.observedAt,
        discoveryErrorCode: input.discoveryErrorCode,
        updatedAt: input.observedAt
      };
      this.configs.set(stored.id, updatedConfig);
      return {
        status: "applied",
        config: this.withProfiles(updatedConfig),
        discovered: input.models.length,
        created,
        updated,
        skipped
      };
    } catch (error) {
      this.configs.clear();
      for (const [id, config] of configSnapshot) this.configs.set(id, config);
      this.modelProfiles.clear();
      for (const [id, profile] of profileSnapshot) this.modelProfiles.set(id, profile);
      this.nextProfileId = nextProfileIdSnapshot;
      throw error;
    }
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
    readonly origin?: AIModelProfileRecord["origin"];
    readonly availability?: AIModelProfileRecord["availability"];
    readonly lastSeenAt?: Date | null;
    readonly capabilities?: Parameters<AIProviderConfigRepository["createModelProfile"]>[0]["capabilities"];
    readonly capabilitySource?: AIModelProfileRecord["capabilitySource"];
    readonly capabilitiesObservedAt?: Date | null;
  }): Promise<AIModelProfileRecord | null> {
    const config = this.configs.get(input.providerConfigId);
    if (!config || config.ownerUserId !== input.ownerUserId) {
      return null;
    }
    if (input.isDefault) {
      this.clearModelDefaults(input.providerConfigId);
    }
    this.ensureUniqueModelProfile(input.providerConfigId, input.model, input.displayName);
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
    readonly origin?: AIModelProfileRecord["origin"];
    readonly availability?: AIModelProfileRecord["availability"];
    readonly lastSeenAt?: Date | null;
    readonly capabilities?: Parameters<AIProviderConfigRepository["updateModelProfile"]>[0]["capabilities"];
    readonly capabilitySource?: AIModelProfileRecord["capabilitySource"];
    readonly capabilitiesObservedAt?: Date | null;
  }): Promise<AIModelProfileRecord | null> {
    const config = this.configs.get(input.providerConfigId);
    const profile = this.modelProfiles.get(input.modelProfileId);
    if (!config || config.ownerUserId !== input.ownerUserId || !profile || profile.providerConfigId !== input.providerConfigId) {
      return null;
    }
    if (input.isDefault === true) {
      this.clearModelDefaults(input.providerConfigId);
    }
    this.ensureUniqueModelProfile(
      input.providerConfigId,
      input.model ?? profile.model,
      input.displayName ?? profile.displayName,
      input.modelProfileId
    );
    const updated: AIModelProfileRecord = {
      ...profile,
      ...(input.model === undefined ? {} : { model: input.model }),
      ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
      ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
      ...(input.maxTokens === undefined ? {} : { maxTokens: input.maxTokens }),
      ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
      ...(input.isDefault === undefined ? {} : { isDefault: input.isDefault }),
      ...(input.origin === undefined ? {} : { origin: input.origin }),
      ...(input.availability === undefined ? {} : { availability: input.availability }),
      ...(input.lastSeenAt === undefined ? {} : { lastSeenAt: input.lastSeenAt }),
      ...(input.capabilities === undefined ? {} : capabilityRecord(input.capabilities)),
      ...(input.capabilitySource === undefined ? {} : { capabilitySource: input.capabilitySource }),
      ...(input.capabilitiesObservedAt === undefined ? {} : { capabilitiesObservedAt: input.capabilitiesObservedAt }),
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
      throw uniqueConstraintError("duplicate config");
    }
  }

  private ensureUniqueModelProfile(
    providerConfigId: string,
    model: string,
    displayName: string,
    ignoredProfileId?: string
  ): void {
    if (Array.from(this.modelProfiles.values()).some((profile) => (
      profile.providerConfigId === providerConfigId &&
      profile.id !== ignoredProfileId &&
      (profile.model === model || profile.displayName === displayName)
    ))) {
      throw uniqueConstraintError("duplicate model profile");
    }
  }

  private createProfileRecord(
    providerConfigId: string,
    input: AIModelProfileInput & {
      readonly origin?: AIModelProfileRecord["origin"] | undefined;
      readonly availability?: AIModelProfileRecord["availability"] | undefined;
      readonly lastSeenAt?: Date | null | undefined;
      readonly capabilities?: Parameters<AIProviderConfigRepository["createModelProfile"]>[0]["capabilities"] | undefined;
      readonly capabilitySource?: AIModelProfileRecord["capabilitySource"] | undefined;
      readonly capabilitiesObservedAt?: Date | null | undefined;
    },
    isDefault: boolean,
    timestamp: Date
  ): AIModelProfileRecord {
    this.ensureUniqueModelProfile(providerConfigId, input.model, input.displayName);
    const profile: AIModelProfileRecord = {
      id: `model-profile-${this.nextProfileId++}`,
      providerConfigId,
      model: input.model,
      displayName: input.displayName,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      enabled: input.enabled ?? true,
      isDefault,
      origin: input.origin ?? "manual",
      availability: input.availability ?? "unknown",
      lastSeenAt: input.lastSeenAt ?? null,
      ...capabilityRecord(input.capabilities),
      capabilitySource: input.capabilitySource ?? null,
      capabilitiesObservedAt: input.capabilitiesObservedAt ?? null,
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

class CreateThenThrowDuplicateModelRepository extends InMemoryAIConfigRepository {
  private didRace = false;

  constructor(private readonly raceModel: string) {
    super();
  }

  override async completeModelDiscovery(
    input: Parameters<AIProviderConfigRepository["completeModelDiscovery"]>[0]
  ): ReturnType<AIProviderConfigRepository["completeModelDiscovery"]> {
    const racedModel = input.models.find((model) => model.id === this.raceModel);
    if (racedModel && !this.didRace) {
      this.didRace = true;
      await super.createModelProfile({
        providerConfigId: input.configId,
        ownerUserId: input.ownerUserId,
        model: racedModel.id,
        displayName: racedModel.displayName ?? racedModel.id,
        temperature: 0.2,
        maxTokens: 4096,
        enabled: true,
        isDefault: true,
        origin: "discovered",
        availability: "available",
        lastSeenAt: input.observedAt,
        capabilities: racedModel.capabilities,
        capabilitiesObservedAt: input.observedAt
      });
    }
    return super.completeModelDiscovery(input);
  }
}

const cipher: AIKeyCipher = {
  encrypt: (plaintext) => `encrypted:${plaintext}`,
  decrypt: (ciphertext) => ciphertext.replace(/^encrypted:/, "")
};

class RecordingProviderAdapter implements AIProviderAdapter {
  readonly inputs: AIProviderRunInput[] = [];
  readonly verificationInputs: Parameters<AIProviderAdapter["verifyConnection"]>[0][] = [];
  readonly listModelInputs: Parameters<AIProviderAdapter["listModels"]>[0][] = [];
  discoveredModels: Awaited<ReturnType<AIProviderAdapter["listModels"]>> = [];
  discoveryState: "available" | "empty" | "unsupported" | "rate_limited" | "unavailable" | "malformed" | null = null;
  discoveryErrorCode: Awaited<ReturnType<AIProviderAdapter["discoverModels"]>>["errorCode"] = null;
  discoveryHandler: AIProviderAdapter["discoverModels"] | null = null;
  verificationHandler: AIProviderAdapter["verifyConnection"] | null = null;
  failWith: Error | null = null;

  async verifyConnection(input: Parameters<AIProviderAdapter["verifyConnection"]>[0]) {
    this.verificationInputs.push(input);
    if (this.failWith) throw this.failWith;
    if (this.verificationHandler) return this.verificationHandler(input);
    return {
      providerKind: input.config.providerKind ?? "openai_compatible" as const,
      endpointDisplay: input.config.baseURL,
      transport: "reachable" as const,
      authentication: "verified" as const,
      errorCode: null
    };
  }

  async discoverModels(input: Parameters<AIProviderAdapter["discoverModels"]>[0]) {
    this.listModelInputs.push(input);
    if (this.failWith) throw this.failWith;
    if (this.discoveryHandler) return this.discoveryHandler(input);
    return {
      providerKind: input.config.providerKind ?? "openai_compatible" as const,
      endpointDisplay: input.config.baseURL,
      transport: "reachable" as const,
      authentication: "verified" as const,
      discovery: this.discoveryState ?? (this.discoveredModels.length === 0 ? "empty" as const : "available" as const),
      errorCode: this.discoveryErrorCode,
      models: this.discoveredModels
    };
  }

  async listModels(input: Parameters<AIProviderAdapter["listModels"]>[0]) {
    this.listModelInputs.push(input);

    if (this.failWith) {
      throw this.failWith;
    }

    return this.discoveredModels;
  }

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
  let auditEvents: WriteAuditEventInput[];

  beforeEach(() => {
    repository = new InMemoryAIConfigRepository();
    providerAdapter = new RecordingProviderAdapter();
    auditEvents = [];
    const auditService: Pick<AuditService, "writeAuditEvent"> = {
      async writeAuditEvent(input) {
        ensureMetadataOnlyAuditPayload(input.payload);
        auditEvents.push(input);
        return {
          id: `audit-${auditEvents.length}`,
          actorUserId: input.actorUserId,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId,
          payload: input.payload,
          createdAt: baseNow.toISOString()
        };
      }
    };
    service = createAIConfigService(repository, cipher, {
      now: () => baseNow,
      providerAdapter,
      auditService
    });
  });

  it("audits connection lifecycle outcomes with metadata only", async () => {
    const created = await service.createConfig({
      actor: actor("owner-user"),
      name: "Audited provider",
      provider: "openai",
      baseURL: "https://private-audit-endpoint.example/v1",
      apiKey: "sk-audit-secret"
    });
    await service.updateConfig({
      actor: actor("owner-user"),
      configId: created.config.id,
      apiKey: "sk-audit-replacement"
    });
    await service.testSavedConfig({ actor: actor("owner-user"), configId: created.config.id });
    providerAdapter.discoveredModels = [{ id: "private-audit-model" }];
    await service.discoverModels({ actor: actor("owner-user"), configId: created.config.id });
    await service.discoverModels({ actor: actor("owner-user"), configId: created.config.id });
    await service.deleteConfig({ actor: actor("owner-user"), configId: created.config.id });

    expect(auditEvents.map((event) => event.action)).toEqual([
      "ai_provider_config.created",
      "ai_provider_config.updated",
      "ai_provider_config.verified",
      "ai_provider_config.models_discovered",
      "ai_provider_config.models_discovered",
      "ai_provider_config.deleted"
    ]);
    expect(auditEvents.every((event) => event.actorUserId === "owner-user")).toBe(true);
    expect(auditEvents.every((event) => event.targetType === "AIProviderConfig")).toBe(true);
    const serialized = JSON.stringify(auditEvents);
    expect(serialized).not.toContain("private-audit-endpoint");
    expect(serialized).not.toContain("private-audit-model");
    expect(serialized).not.toContain("sk-audit");
    expect(auditEvents[3]?.payload).toMatchObject({
      providerKind: "openai",
      outcome: "succeeded",
      discoveredCount: 1,
      createdCount: 1,
      updatedCount: 0,
      skippedCount: 0,
      recordedAt: baseNow.toISOString()
    });
    expect(auditEvents[4]?.payload).toMatchObject({
      providerKind: "openai",
      outcome: "succeeded",
      discoveredCount: 1,
      createdCount: 0,
      updatedCount: 1,
      skippedCount: 0,
      recordedAt: baseNow.toISOString()
    });
  });

  it("rejects a config mutation response when mandatory audit recording fails", async () => {
    const localRepository = new InMemoryAIConfigRepository();
    const auditFailures: Array<{ readonly action: string; readonly targetId: string }> = [];
    const localService = createAIConfigService(localRepository, cipher, {
      now: () => baseNow,
      providerAdapter,
      auditService: {
        async writeAuditEvent() {
          throw new Error("audit unavailable");
        }
      },
      onAuditError(_error, context) {
        auditFailures.push(context);
        throw new Error("audit reporter unavailable");
      }
    });

    await expect(localService.createConfig({
      actor: actor("owner-user"),
      name: "Committed provider",
      provider: "openai",
      baseURL: "https://api.example/v1"
    })).rejects.toThrow("audit unavailable");

    const configId = Array.from(localRepository.configs.keys())[0];
    expect(configId).toBeDefined();
    expect(auditFailures).toEqual([{
      action: "ai_provider_config.created",
      targetId: configId
    }]);
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

  it("preserves encrypted key material when updating non-connection fields", async () => {
    const created = await service.createConfig({
      actor: actor("owner-user"),
      name: "Config",
      provider: "openai",
      providerKind: "openai_compatible",
      baseURL: "https://api.example/v1",
      defaultModelProfile: modelProfile("old-model", 0.1, 1000),
      apiKey: "sk-preserve-1234"
    });

    const updated = await service.updateConfig({
      actor: actor("owner-user"),
      configId: created.config.id,
      name: "Config renamed"
    });

    expect(updated.config).toMatchObject({ name: "Config renamed", baseURL: "https://api.example/v1", hasKey: true });
    expect(updated.config.modelProfiles[0]).toMatchObject({ model: "old-model", maxTokens: 1000 });
    expect(updated.config).not.toHaveProperty("keyPreview");
    expect(repository.configs.get(created.config.id)).toMatchObject({
      encryptedApiKey: "encrypted:sk-preserve-1234",
      keyPreview: "sk-p…1234"
    });
  });

  it("requires a replacement key before changing a saved provider connection", async () => {
    const created = await service.createConfig({
      actor: actor("owner-user"),
      name: "Locked connection",
      provider: "custom",
      providerKind: "openai_compatible",
      baseURL: "https://provider-a.example/v1",
      apiKey: "sk-provider-a"
    });

    await expectAIConfigError(service.updateConfig({
      actor: actor("owner-user"),
      configId: created.config.id,
      baseURL: "https://provider-b.example/v1"
    }), 400);

    expect(repository.configs.get(created.config.id)).toMatchObject({
      baseURL: "https://provider-a.example/v1",
      encryptedApiKey: "encrypted:sk-provider-a"
    });
  });

  it("invalidates in-flight synchronization when connection identity or credentials change", async () => {
    const created = await service.createConfig({
      actor: actor("owner-user"),
      name: "Mutable connection",
      provider: "custom",
      providerKind: "openai_compatible",
      baseURL: "https://provider-a.example/v1",
      apiKey: "sk-provider-a"
    });
    const stored = repository.configs.get(created.config.id)!;
    repository.configs.set(stored.id, {
      ...stored,
      syncAttemptToken: "attempt-a",
      discoveryState: "available",
      inventoryFreshness: "fresh"
    });

    const updated = await service.updateConfig({
      actor: actor("owner-user"),
      configId: created.config.id,
      baseURL: "https://provider-b.example/v1",
      apiKey: "sk-provider-b"
    });

    expect(updated.config).toMatchObject({
      baseURL: "https://provider-b.example/v1",
      hasKey: true,
      connection: { transport: "not_checked", authentication: "unverified" },
      sync: { discovery: "not_attempted", freshness: "stale" }
    });
    expect(repository.configs.get(created.config.id)).toMatchObject({
      encryptedApiKey: "encrypted:sk-provider-b",
      syncAttemptToken: null
    });
  });

  it("replaces encrypted key material when a new API key is submitted", async () => {
    const created = await service.createConfig({
      actor: actor("owner-user"),
      name: "Config",
      provider: "openai",
      baseURL: "https://api.openai.com/v1",
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

    expect(result.healthCheck).toMatchObject({
      ok: true,
      category: null,
      message: "Connection verified through the server adapter.",
      latencyMs: 0,
      provider: "openai",
      model: "gpt-test",
      baseURL: "https://api.openai.com/v1",
      checkedAt: baseNow.toISOString(),
      connection: {
        transport: "reachable",
        authentication: "verified",
        errorCode: null
      }
    });
    expect(providerAdapter.verificationInputs).toEqual([
      expect.objectContaining({ config: expect.objectContaining({ apiKey: "sk-draft-secret" }) })
    ]);
    expect(providerAdapter.inputs).toEqual([]);
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
    providerAdapter.failWith = new AIProviderExecutionError("invalid_key", "raw provider payload sk-saved-secret");

    const result = await service.testSavedConfig({ actor: actor("owner-user"), configId: created.config.id });

    expect(result.healthCheck).toMatchObject({
      ok: false,
      category: "invalid_key",
      message: "The provider rejected the API key. Check the key and account permissions.",
      model: "old-model"
    });
    expect(providerAdapter.verificationInputs[0]?.config).toMatchObject({ apiKey: "sk-saved-secret" });
    expect(providerAdapter.inputs).toEqual([]);
    expect(repository.configs.get(created.config.id)).toMatchObject({
      encryptedApiKey: "encrypted:sk-saved-secret",
      keyPreview: "sk-s…cret"
    });
    expect(JSON.stringify(result)).not.toMatch(/sk-saved-secret|encrypted|raw provider payload|Authorization|headers/i);
  });

  it.each([
    {
      race: "endpoint replacement",
      update: {
        baseURL: "https://provider-b.example/v1",
        apiKey: "sk-provider-b"
      },
      expectedBaseURL: "https://provider-b.example/v1",
      expectedEncryptedApiKey: "encrypted:sk-provider-b"
    },
    {
      race: "key-only replacement",
      update: { apiKey: "sk-provider-b" },
      expectedBaseURL: "https://provider-a.example/v1",
      expectedEncryptedApiKey: "encrypted:sk-provider-b"
    }
  ])("discards saved verification telemetry after a $race", async ({
    update,
    expectedBaseURL,
    expectedEncryptedApiKey
  }) => {
    type VerificationResult = Awaited<ReturnType<AIProviderAdapter["verifyConnection"]>>;
    const pending = deferred<VerificationResult>();
    providerAdapter.verificationHandler = async () => pending.promise;
    const created = await service.createConfig({
      actor: actor("owner-user"),
      name: "Verification race",
      provider: "custom",
      providerKind: "openai_compatible",
      baseURL: "https://provider-a.example/v1",
      apiKey: "sk-provider-a"
    });

    const verificationPromise = service.testSavedConfig({
      actor: actor("owner-user"),
      configId: created.config.id
    });
    await waitForCount(providerAdapter.verificationInputs, 1);
    await service.updateConfig({
      actor: actor("owner-user"),
      configId: created.config.id,
      ...update
    });
    pending.resolve({
      providerKind: "openai_compatible",
      endpointDisplay: "https://provider-a.example/v1",
      transport: "reachable",
      authentication: "verified",
      errorCode: null
    });

    const result = await verificationPromise;
    const stored = repository.configs.get(created.config.id);
    expect(result.healthCheck.ok).toBe(false);
    expect(stored).toMatchObject({
      baseURL: expectedBaseURL,
      encryptedApiKey: expectedEncryptedApiKey,
      transportState: "not_checked",
      authState: "unverified",
      lastVerifiedAt: null,
      connectionErrorCode: null
    });
  });

  it("keeps the newest saved verification when same-generation checks finish out of order", async () => {
    type VerificationResult = Awaited<ReturnType<AIProviderAdapter["verifyConnection"]>>;
    const pending: ReturnType<typeof deferred<VerificationResult>>[] = [];
    providerAdapter.verificationHandler = async () => {
      const call = deferred<VerificationResult>();
      pending.push(call);
      return call.promise;
    };
    const created = await service.createConfig({
      actor: actor("owner-user"),
      name: "Interleaved verification",
      provider: "openai",
      baseURL: "https://api.openai.com/v1",
      apiKey: "sk-interleaved"
    });

    const olderPromise = service.testSavedConfig({ actor: actor("owner-user"), configId: created.config.id });
    await waitForCount(pending, 1);
    const newerPromise = service.testSavedConfig({ actor: actor("owner-user"), configId: created.config.id });
    await waitForCount(pending, 2);
    pending[1]!.resolve({
      providerKind: "openai",
      endpointDisplay: "https://api.openai.com/v1",
      transport: "reachable",
      authentication: "verified",
      errorCode: null
    });
    await expect(newerPromise).resolves.toMatchObject({ healthCheck: { ok: true } });
    pending[0]!.resolve({
      providerKind: "openai",
      endpointDisplay: "https://api.openai.com/v1",
      transport: "reachable",
      authentication: "rejected",
      errorCode: "invalid_key"
    });

    await expect(olderPromise).resolves.toMatchObject({
      healthCheck: { ok: false, category: "unknown", message: "A newer connection verification result was kept." }
    });
    expect(repository.configs.get(created.config.id)).toMatchObject({
      transportState: "reachable",
      authState: "verified",
      verificationAttemptToken: null,
      connectionErrorCode: null,
      lastVerifiedAt: baseNow
    });
  });

  it("keeps one provider key while saved connection checks remain model-independent", async () => {
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

    expect(providerAdapter.verificationInputs.map((input) => input.config)).toEqual([
      expect.objectContaining({ apiKey: "sk-shared-secret" }),
      expect.objectContaining({ apiKey: "sk-shared-secret" })
    ]);
    expect(providerAdapter.inputs).toEqual([]);
    expect(new Set(Array.from(repository.configs.values()).map((config) => config.encryptedApiKey))).toEqual(new Set(["encrypted:sk-shared-secret"]));
  });

  it("discovers provider models server-side and preserves existing enabled/default choices on refresh", async () => {
    const created = await service.createConfig({
      actor: actor("owner-user"),
      name: "Discovery provider",
      provider: "openai",
      baseURL: "https://api.example/v1",
      apiKey: "sk-discovery-secret"
    });
    providerAdapter.discoveredModels = [
      {
        id: "gpt-fast",
        displayName: "GPT fast",
        capabilities: {
          contextWindowTokens: 128_000,
          maxOutputTokens: 16_384,
          inputModalities: ["text", "image"],
          outputModalities: ["text"],
          supportedParameters: ["temperature", "max_tokens"]
        }
      },
      {
        id: "gpt-deep",
        displayName: "GPT deep",
        capabilities: {
          maxOutputTokens: 8_192,
          unsupported: ["contextWindowTokens", "inputModalities"]
        }
      }
    ];

    const firstDiscovery = await service.discoverModels({ actor: actor("owner-user"), configId: created.config.id });

    expect(firstDiscovery).toMatchObject({
      discovered: 2,
      created: 2,
      skipped: 0,
      updated: 0,
      discovery: "available",
      freshness: "fresh",
      config: {
        connection: { transport: "reachable", authentication: "verified", errorCode: null },
        sync: { discovery: "available", freshness: "fresh", errorCode: null }
      }
    });
    expect(firstDiscovery.config.modelProfiles).toEqual([
      expect.objectContaining({
        model: "gpt-fast",
        displayName: "GPT fast",
        enabled: true,
        isDefault: true,
        origin: "discovered",
        availability: "available",
        capabilities: {
          contextWindowTokens: { state: "observed", value: 128_000 },
          maxOutputTokens: { state: "observed", value: 16_384 },
          inputModalities: { state: "observed", values: ["text", "image"] },
          outputModalities: { state: "observed", values: ["text"] },
          supportedParameters: { state: "observed", values: ["temperature", "max_tokens"] }
        },
        provenance: { source: "openai", observedAt: baseNow.toISOString() }
      }),
      expect.objectContaining({
        model: "gpt-deep",
        displayName: "GPT deep",
        enabled: true,
        isDefault: false,
        capabilities: expect.objectContaining({
          contextWindowTokens: { state: "unsupported", value: null },
          maxOutputTokens: { state: "observed", value: 8_192 },
          inputModalities: { state: "unsupported", values: [] }
        })
      })
    ]);
    expect(providerAdapter.listModelInputs).toEqual([
      expect.objectContaining({
        config: expect.objectContaining({
          apiKey: "sk-discovery-secret",
          baseURL: "https://api.openai.com/v1"
        })
      })
    ]);
    expect(JSON.stringify(firstDiscovery)).not.toMatch(/sk-discovery-secret|encrypted|Authorization|headers/i);

    const deepProfile = firstDiscovery.config.modelProfiles.find((profile) => profile.model === "gpt-deep")!;
    await service.setDefaultModelProfile({
      actor: actor("owner-user"),
      configId: created.config.id,
      modelProfileId: deepProfile.id
    });
    await service.updateModelProfile({
      actor: actor("owner-user"),
      configId: created.config.id,
      modelProfileId: firstDiscovery.config.modelProfiles[0]!.id,
      enabled: false
    });

    providerAdapter.discoveredModels = [
      { id: "gpt-fast", displayName: "Renamed by provider" },
      { id: "gpt-deep", displayName: "GPT deep" },
      { id: "gpt-new", displayName: "GPT new" }
    ];

    const refreshed = await service.discoverModels({ actor: actor("owner-user"), configId: created.config.id });

    expect(refreshed).toMatchObject({ discovered: 3, created: 1, skipped: 0, updated: 2 });
    expect(refreshed.config.modelProfiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ model: "gpt-fast", displayName: "GPT fast", enabled: false, isDefault: false }),
      expect.objectContaining({ model: "gpt-deep", displayName: "GPT deep", enabled: true, isDefault: true }),
      expect.objectContaining({ model: "gpt-new", displayName: "GPT new", enabled: true, isDefault: false })
    ]));

    const manual = await service.createModelProfile({
      actor: actor("owner-user"),
      configId: created.config.id,
      model: "manual-only",
      displayName: "Manual fallback",
      temperature: 0.2,
      maxTokens: 2_048
    });
    providerAdapter.discoveredModels = [{ id: "gpt-deep", displayName: "GPT deep" }];

    const inventoryChanged = await service.discoverModels({ actor: actor("owner-user"), configId: created.config.id });

    expect(inventoryChanged).toMatchObject({ discovered: 1, created: 0, skipped: 0, updated: 3 });
    expect(inventoryChanged.config.modelProfiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ model: "gpt-fast", origin: "discovered", availability: "unavailable" }),
      expect.objectContaining({ model: "gpt-new", origin: "discovered", availability: "unavailable" }),
      expect.objectContaining({ id: manual.modelProfile.id, model: "manual-only", origin: "manual", availability: "unknown" })
    ]));
  });

  it("keys discovery by upstream model id when provider display names collide or change", async () => {
    const created = await service.createConfig({
      actor: actor("owner-user"),
      name: "Colliding provider",
      provider: "openai",
      baseURL: "https://api.example/v1",
      apiKey: "sk-colliding-secret"
    });
    providerAdapter.discoveredModels = [
      { id: "provider/gpt-fast", displayName: "GPT" },
      { id: "provider/gpt-deep", displayName: "GPT" }
    ];

    const firstDiscovery = await service.discoverModels({ actor: actor("owner-user"), configId: created.config.id });

    expect(firstDiscovery).toMatchObject({ discovered: 2, created: 2, skipped: 0, updated: 0 });
    expect(firstDiscovery.config.modelProfiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ model: "provider/gpt-fast", displayName: "GPT" }),
      expect.objectContaining({ model: "provider/gpt-deep", displayName: "GPT (provider/gpt-deep)" })
    ]));

    providerAdapter.discoveredModels = [
      { id: "provider/gpt-fast", displayName: "Renamed GPT" },
      { id: "provider/gpt-deep", displayName: "GPT" }
    ];

    const refreshed = await service.discoverModels({ actor: actor("owner-user"), configId: created.config.id });

    expect(refreshed).toMatchObject({ discovered: 2, created: 0, skipped: 0, updated: 2 });
    expect(refreshed.config.modelProfiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ model: "provider/gpt-fast", displayName: "GPT" }),
      expect.objectContaining({ model: "provider/gpt-deep", displayName: "GPT (provider/gpt-deep)" })
    ]));
  });

  it("refreshes a model inserted concurrently before discovery reconciliation", async () => {
    repository = new CreateThenThrowDuplicateModelRepository("gpt-race");
    service = createAIConfigService(repository, cipher, {
      now: () => baseNow,
      providerAdapter
    });
    const created = await service.createConfig({
      actor: actor("owner-user"),
      name: "Racy provider",
      provider: "openai",
      baseURL: "https://api.example/v1",
      apiKey: "sk-racy-secret"
    });
    providerAdapter.discoveredModels = [{ id: "gpt-race", displayName: "GPT race" }];

    const discovered = await service.discoverModels({ actor: actor("owner-user"), configId: created.config.id });

    expect(discovered).toMatchObject({ discovered: 1, created: 0, skipped: 0, updated: 1 });
    expect(discovered.config.modelProfiles).toEqual([
      expect.objectContaining({ model: "gpt-race", displayName: "GPT race", enabled: true, isDefault: true })
    ]);
  });

  it("rejects duplicate manual model profiles by upstream model id or display name", async () => {
    const created = await service.createConfig({
      actor: actor("owner-user"),
      name: "Manual provider",
      provider: "openai",
      baseURL: "https://api.example/v1",
      defaultModelProfile: modelProfile("gpt-fast", 0.2, 4096)
    });

    await expectAIConfigError(
      service.createModelProfile({
        actor: actor("owner-user"),
        configId: created.config.id,
        model: "gpt-fast",
        displayName: "Fast duplicate",
        temperature: 0.2,
        maxTokens: 4096
      }),
      409
    );
    await expectAIConfigError(
      service.createModelProfile({
        actor: actor("owner-user"),
        configId: created.config.id,
        model: "gpt-deep",
        displayName: "gpt-fast",
        temperature: 0.2,
        maxTokens: 4096
      }),
      409
    );
  });

  it("returns safe discovery failures for missing keys and empty provider lists", async () => {
    const created = await service.createConfig({
      actor: actor("owner-user"),
      name: "No key provider",
      provider: "openai",
      baseURL: "https://api.example/v1"
    });

    const discoveryCallCount = providerAdapter.listModelInputs.length;
    await expectAIConfigError(service.discoverModels({ actor: actor("owner-user"), configId: created.config.id }), 400);
    expect(providerAdapter.listModelInputs).toHaveLength(discoveryCallCount);
    await expect(service.getConfig(actor("owner-user"), created.config.id)).resolves.toMatchObject({
      config: {
        connection: {
          transport: "not_checked",
          authentication: "not_checked",
          errorCode: "missing_key"
        },
        sync: {
          discovery: "unavailable",
          freshness: "stale",
          errorCode: "missing_key"
        }
      }
    });

    await service.updateConfig({ actor: actor("owner-user"), configId: created.config.id, apiKey: "sk-empty-list" });
    providerAdapter.discoveredModels = [];

    const emptyDiscovery = await service.discoverModels({ actor: actor("owner-user"), configId: created.config.id });

    expect(emptyDiscovery).toMatchObject({ discovered: 0, created: 0, skipped: 0, updated: 0 });
    expect(emptyDiscovery.warnings).toEqual([
      "Provider returned no models. Use advanced manual model entry if this provider cannot list models."
    ]);
    expect(JSON.stringify(emptyDiscovery)).not.toMatch(/sk-empty-list|encrypted|Authorization/i);
  });

  it("returns unsupported discovery as a recoverable connection state", async () => {
    const created = await service.createConfig({
      actor: actor("owner-user"),
      name: "Manual inventory provider",
      provider: "custom",
      providerKind: "openai_compatible",
      baseURL: "https://custom.example/v1",
      apiKey: "sk-unsupported"
    });
    providerAdapter.discoveryState = "unsupported";

    const result = await service.discoverModels({ actor: actor("owner-user"), configId: created.config.id });

    expect(result).toMatchObject({
      discovered: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      discovery: "unsupported",
      freshness: "stale",
      config: {
        connection: { transport: "reachable", authentication: "verified", errorCode: null },
        sync: { discovery: "unsupported", freshness: "stale", errorCode: null }
      }
    });
    expect(result.warnings).toEqual([
      "This endpoint does not expose model discovery. Use advanced manual model entry."
    ]);
    expect(JSON.stringify(result)).not.toMatch(/sk-unsupported|encrypted|Authorization|headers/i);
  });

  it.each([
    ["rate_limited", "rate_limit"],
    ["unavailable", "provider_unavailable"],
    ["malformed", "response_parse_failure"]
  ] as const)("preserves authoritative inventory and last success after %s discovery", async (state, errorCode) => {
    const created = await service.createConfig({
      actor: actor("owner-user"),
      name: `Preservation ${state}`,
      provider: "openai",
      baseURL: "https://api.example/v1",
      apiKey: "sk-preservation"
    });
    providerAdapter.discoveredModels = [{
      id: "stable-model",
      displayName: "Stable model",
      capabilities: { contextWindowTokens: 64_000 }
    }];
    const successful = await service.discoverModels({ actor: actor("owner-user"), configId: created.config.id });
    const lastSuccessfulSyncAt = successful.config.sync
      ? successful.config.sync.lastSuccessfulSyncAt
      : undefined;

    providerAdapter.discoveryState = state;
    providerAdapter.discoveryErrorCode = errorCode;
    providerAdapter.discoveredModels = [];
    const failed = await service.discoverModels({ actor: actor("owner-user"), configId: created.config.id });

    expect(failed.config.sync).toMatchObject({
      discovery: state,
      freshness: "stale",
      lastSuccessfulSyncAt,
      errorCode
    });
    expect(failed.config.modelProfiles).toEqual([
      expect.objectContaining({
        model: "stable-model",
        availability: "available",
        capabilities: expect.objectContaining({ contextWindowTokens: { state: "observed", value: 64_000 } })
      })
    ]);
  });

  it("records malformed provider model facts and clears the discovery attempt token", async () => {
    const created = await service.createConfig({
      actor: actor("owner-user"),
      name: "Malformed provider",
      provider: "openai",
      baseURL: "https://api.openai.com/v1",
      apiKey: "sk-malformed"
    });
    providerAdapter.discoveredModels = [{ id: "x".repeat(257) }];

    const result = await service.discoverModels({ actor: actor("owner-user"), configId: created.config.id });

    expect(result).toMatchObject({
      discovered: 0,
      created: 0,
      discovery: "malformed",
      freshness: "stale",
      warnings: ["Provider model discovery returned malformed data. Use advanced manual model entry or retry later."]
    });
    expect(repository.configs.get(created.config.id)).toMatchObject({
      discoveryState: "malformed",
      discoveryErrorCode: "response_parse_failure",
      syncAttemptToken: null
    });
  });

  it("clears stale connection errors after successful authenticated discovery", async () => {
    const created = await service.createConfig({
      actor: actor("owner-user"),
      name: "Connection recovery",
      provider: "openai",
      baseURL: "https://api.openai.com/v1",
      apiKey: "sk-recovery"
    });
    providerAdapter.verificationHandler = async () => ({
      providerKind: "openai",
      endpointDisplay: "https://api.openai.com/v1",
      transport: "reachable",
      authentication: "rejected",
      errorCode: "invalid_key"
    });
    await service.testSavedConfig({ actor: actor("owner-user"), configId: created.config.id });
    expect(repository.configs.get(created.config.id)).toMatchObject({
      authState: "rejected",
      connectionErrorCode: "invalid_key"
    });

    providerAdapter.verificationHandler = null;
    providerAdapter.discoveredModels = [{ id: "recovered-model" }];
    await service.discoverModels({ actor: actor("owner-user"), configId: created.config.id });

    expect(repository.configs.get(created.config.id)).toMatchObject({
      transportState: "reachable",
      authState: "verified",
      connectionErrorCode: null,
      lastConnectionAttemptAt: baseNow,
      lastVerifiedAt: baseNow
    });
  });

  it("rolls back reconciliation without recording false synchronization success", async () => {
    const created = await service.createConfig({
      actor: actor("owner-user"),
      name: "Rollback provider",
      provider: "openai",
      baseURL: "https://api.example/v1",
      apiKey: "sk-rollback"
    });
    providerAdapter.discoveredModels = [{ id: "existing-model", displayName: "Existing model" }];
    const successful = await service.discoverModels({ actor: actor("owner-user"), configId: created.config.id });
    const successfulAt = successful.config.sync
      ? successful.config.sync.lastSuccessfulSyncAt
      : undefined;
    const existingProfile = repository.modelProfiles.values().next().value;
    expect(existingProfile).toBeDefined();

    repository.failNextDiscoveryCompletion = true;
    providerAdapter.discoveredModels = [{ id: "replacement-model", displayName: "Replacement model" }];
    await expect(service.discoverModels({ actor: actor("owner-user"), configId: created.config.id }))
      .rejects.toThrow("injected discovery reconciliation failure");

    const stored = await repository.findConfigById(created.config.id);
    expect(stored?.lastSuccessfulSyncAt?.toISOString()).toBe(successfulAt);
    expect(stored?.modelProfiles).toEqual([existingProfile]);
    expect(stored?.modelProfiles).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ model: "replacement-model" })
    ]));
  });

  it("keeps a newer completion when same-millisecond discoveries finish out of order", async () => {
    type DiscoveryResult = Awaited<ReturnType<AIProviderAdapter["discoverModels"]>>;
    const pending: ReturnType<typeof deferred<DiscoveryResult>>[] = [];
    service = createAIConfigService(repository, cipher, {
      now: () => new Date(baseNow.getTime()),
      providerAdapter
    });
    providerAdapter.discoveryHandler = async () => {
      const call = deferred<DiscoveryResult>();
      pending.push(call);
      return call.promise;
    };
    const created = await service.createConfig({
      actor: actor("owner-user"),
      name: "Interleaved provider",
      provider: "openai",
      baseURL: "https://api.example/v1",
      apiKey: "sk-interleaved"
    });

    const olderPromise = service.discoverModels({ actor: actor("owner-user"), configId: created.config.id });
    await waitForCount(pending, 1);
    const newerPromise = service.discoverModels({ actor: actor("owner-user"), configId: created.config.id });
    await waitForCount(pending, 2);
    pending[1]!.resolve({
      providerKind: "openai",
      endpointDisplay: "https://api.openai.com/v1",
      transport: "reachable",
      authentication: "verified",
      discovery: "available",
      errorCode: null,
      models: [{ id: "newer-model", displayName: "Newer model" }]
    });
    const newer = await newerPromise;
    pending[0]!.resolve({
      providerKind: "openai",
      endpointDisplay: "https://api.openai.com/v1",
      transport: "reachable",
      authentication: "verified",
      discovery: "available",
      errorCode: null,
      models: [{ id: "older-model", displayName: "Older model" }]
    });
    const older = await olderPromise;

    expect(newer).toMatchObject({ discovered: 1, created: 1, discovery: "available", freshness: "fresh" });
    expect(older).toMatchObject({ discovered: 0, created: 0, updated: 0, skipped: 0 });
    expect(older.warnings).toEqual(["A newer synchronization result was kept."]);
    expect(older.config.modelProfiles).toEqual([
      expect.objectContaining({ model: "newer-model", availability: "available" })
    ]);
    expect(older.config.modelProfiles).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ model: "older-model" })
    ]));
  });

  it("discards discovery results started before a connection change", async () => {
    type DiscoveryResult = Awaited<ReturnType<AIProviderAdapter["discoverModels"]>>;
    const pending = deferred<DiscoveryResult>();
    providerAdapter.discoveryHandler = async () => pending.promise;
    const created = await service.createConfig({
      actor: actor("owner-user"),
      name: "Connection race",
      provider: "custom",
      providerKind: "openai_compatible",
      baseURL: "https://provider-a.example/v1",
      apiKey: "sk-provider-a"
    });

    const discoveryPromise = service.discoverModels({ actor: actor("owner-user"), configId: created.config.id });
    await Promise.resolve();
    await service.updateConfig({
      actor: actor("owner-user"),
      configId: created.config.id,
      baseURL: "https://provider-b.example/v1",
      apiKey: "sk-provider-b"
    });
    pending.resolve({
      providerKind: "openai_compatible",
      endpointDisplay: "https://provider-a.example/v1",
      transport: "reachable",
      authentication: "verified",
      discovery: "available",
      errorCode: null,
      models: [{ id: "provider-a-model" }]
    });

    const result = await discoveryPromise;
    expect(result).toMatchObject({ discovered: 0, created: 0, updated: 0, skipped: 0 });
    expect(result.warnings).toEqual(["A newer synchronization result was kept."]);
    expect(result.config).toMatchObject({
      baseURL: "https://provider-b.example/v1",
      sync: { discovery: "not_attempted", freshness: "stale" }
    });
    expect(result.config.modelProfiles).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ model: "provider-a-model" })
    ]));
  });

  it("claims discovery only after reading the row-locked current connection", async () => {
    const created = await service.createConfig({
      actor: actor("owner-user"),
      name: "Discovery begin race",
      provider: "custom",
      providerKind: "openai_compatible",
      baseURL: "https://provider-a.example/v1",
      apiKey: "sk-provider-a"
    });
    repository.beforeNextDiscoveryBegin = async () => {
      await service.updateConfig({
        actor: actor("owner-user"),
        configId: created.config.id,
        baseURL: "https://provider-b.example/v1",
        apiKey: "sk-provider-b"
      });
    };
    providerAdapter.discoveredModels = [{ id: "provider-b-model" }];

    const result = await service.discoverModels({
      actor: actor("owner-user"),
      configId: created.config.id
    });

    expect(providerAdapter.listModelInputs).toEqual([
      expect.objectContaining({
        config: expect.objectContaining({
          baseURL: "https://provider-b.example/v1",
          apiKey: "sk-provider-b"
        })
      })
    ]);
    expect(result).toMatchObject({
      discovered: 1,
      created: 1,
      config: { baseURL: "https://provider-b.example/v1" }
    });
    expect(result.config.modelProfiles).toEqual([
      expect.objectContaining({ model: "provider-b-model", availability: "available" })
    ]);
  });

  it("adds observed provider facts to a matching manual profile without changing user choices", async () => {
    const created = await service.createConfig({
      actor: actor("owner-user"),
      name: "Manual collision",
      provider: "openai",
      baseURL: "https://api.openai.com/v1",
      apiKey: "sk-manual-collision"
    });
    const manual = await service.createModelProfile({
      actor: actor("owner-user"),
      configId: created.config.id,
      model: "shared-model",
      displayName: "My tuned model",
      temperature: 0.7,
      maxTokens: 12_345,
      enabled: false,
      isDefault: false
    });
    providerAdapter.discoveredModels = [{
      id: "shared-model",
      displayName: "Provider label",
      capabilities: { contextWindowTokens: 128_000, supportedParameters: ["temperature"] }
    }];

    const result = await service.discoverModels({ actor: actor("owner-user"), configId: created.config.id });

    expect(result).toMatchObject({ discovered: 1, created: 0, skipped: 0, updated: 1 });
    expect(result.config.modelProfiles).toEqual([
      expect.objectContaining({
        id: manual.modelProfile.id,
        origin: "manual",
        model: "shared-model",
        displayName: "My tuned model",
        temperature: 0.7,
        maxTokens: 12_345,
        enabled: false,
        isDefault: false,
        availability: "available",
        lastSeenAt: baseNow.toISOString(),
        provenance: { source: "openai", observedAt: baseNow.toISOString() },
        capabilities: expect.objectContaining({
          contextWindowTokens: { state: "observed", value: 128_000 },
          supportedParameters: { state: "observed", values: ["temperature"] }
        })
      })
    ]);
  });

  it("treats an empty authoritative inventory as absent discovered models while preserving manual profiles", async () => {
    const created = await service.createConfig({
      actor: actor("owner-user"),
      name: "Empty inventory provider",
      provider: "openai",
      baseURL: "https://api.example/v1",
      apiKey: "sk-empty-authoritative"
    });
    providerAdapter.discoveredModels = [{ id: "listed-model", displayName: "Listed model" }];
    await service.discoverModels({ actor: actor("owner-user"), configId: created.config.id });
    const manual = await service.createModelProfile({
      actor: actor("owner-user"),
      configId: created.config.id,
      model: "manual-model",
      displayName: "Manual model",
      temperature: 0.4,
      maxTokens: 2_048
    });

    providerAdapter.discoveryState = "empty";
    providerAdapter.discoveredModels = [];
    const empty = await service.discoverModels({ actor: actor("owner-user"), configId: created.config.id });

    expect(empty).toMatchObject({ discovery: "empty", freshness: "fresh", discovered: 0, created: 0 });
    expect(empty.config.modelProfiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ model: "listed-model", origin: "discovered", availability: "unavailable" }),
      expect.objectContaining({ id: manual.modelProfile.id, origin: "manual", availability: "unknown" })
    ]));
  });

  it("preserves an unavailable discovered default until the user changes it", async () => {
    const created = await service.createConfig({
      actor: actor("owner-user"),
      name: "Default repair provider",
      provider: "openai",
      baseURL: "https://api.example/v1",
      apiKey: "sk-default-repair"
    });
    providerAdapter.discoveredModels = [{ id: "old-default", displayName: "Old default" }];
    await service.discoverModels({ actor: actor("owner-user"), configId: created.config.id });

    providerAdapter.discoveredModels = [{ id: "new-default", displayName: "New default" }];
    const refreshed = await service.discoverModels({ actor: actor("owner-user"), configId: created.config.id });

    expect(refreshed.config.modelProfiles).toEqual(expect.arrayContaining([
      expect.objectContaining({ model: "old-default", availability: "unavailable", isDefault: true }),
      expect.objectContaining({ model: "new-default", availability: "available", isDefault: false })
    ]));
    expect(refreshed.config.modelProfiles.filter((profile) => profile.isDefault)).toHaveLength(1);
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
    const discoveryCallCount = providerAdapter.listModelInputs.length;
    await expectAIConfigError(service.discoverModels({ actor: actor("other-user"), configId: created.config.id }), 404);
    expect(providerAdapter.listModelInputs).toHaveLength(discoveryCallCount);
    const verificationCallCount = providerAdapter.verificationInputs.length;
    await expectAIConfigError(service.testSavedConfig({ actor: actor("other-user"), configId: created.config.id }), 404);
    expect(providerAdapter.verificationInputs).toHaveLength(verificationCallCount);
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

    const retargetResponse = await app.inject({
      method: "PATCH",
      url: `/ai/configs/${String(createResponse.json().config.id)}`,
      headers: { cookie: `${cookieName}=route-session` },
      payload: {
        provider: "custom",
        providerKind: "openai_compatible",
        baseURL: "https://attacker.example/v1"
      }
    });
    expect(retargetResponse.statusCode).toBe(400);
    expect(retargetResponse.body).not.toContain("sk-route-secret");
  });

  it("exposes provider test, SSE stream, and cancel routes with safe payloads", async () => {
    const routeProviderAdapter = new RecordingProviderAdapter();
    routeProviderAdapter.discoveredModels = [
      {
        id: "gpt-route-fast",
        displayName: "Route fast",
        capabilities: { contextWindowTokens: 32_000, inputModalities: ["text"] }
      },
      { id: "gpt-route-deep", displayName: "Route deep" }
    ];
    service = createAIConfigService(new InMemoryAIConfigRepository(), cipher, {
      now: () => baseNow,
      providerAdapter: routeProviderAdapter
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
        providerKind: "openai",
        baseURL: "https://api.example/v1",
        apiKey: "sk-route-test"
      }
    });
    expect(draftTestResponse.statusCode).toBe(200);
    expect(draftTestResponse.json()).toMatchObject({ healthCheck: { ok: true, category: null } });
    expect(routeProviderAdapter.verificationInputs).toHaveLength(1);
    expect(routeProviderAdapter.inputs).toEqual([]);
    expect(draftTestResponse.body).not.toMatch(/sk-route-test|encrypted|Authorization/i);

    const createConfigResponse = await app.inject({
      method: "POST",
      url: "/ai/configs",
      headers: { cookie: `${cookieName}=route-session` },
      payload: {
        name: "Discoverable Route Provider",
        provider: "openai",
        baseURL: "https://api.example/v1",
        apiKey: "sk-route-discovery"
      }
    });
    expect(createConfigResponse.statusCode).toBe(200);
    const routeConfigId = createConfigResponse.json().config.id as string;

    const transientKeySavedTest = await app.inject({
      method: "POST",
      url: `/ai/configs/${routeConfigId}/test`,
      headers: { cookie: `${cookieName}=route-session` },
      payload: { apiKey: "sk-unsaved-override" }
    });
    expect(transientKeySavedTest.statusCode).toBe(400);
    expect(transientKeySavedTest.body).not.toContain("sk-unsaved-override");
    expect(routeProviderAdapter.verificationInputs).toHaveLength(1);

    const discoveryResponse = await app.inject({
      method: "POST",
      url: `/ai/configs/${routeConfigId}/capabilities/sync`,
      headers: { cookie: `${cookieName}=route-session` }
    });
    expect(discoveryResponse.statusCode).toBe(200);
    expect(discoveryResponse.json()).toMatchObject({
      discovered: 2,
      created: 2,
      skipped: 0,
      discovery: "available",
      freshness: "fresh",
      config: {
        connection: { transport: "reachable", authentication: "verified" },
        sync: { discovery: "available", freshness: "fresh" }
      }
    });
    expect(discoveryResponse.json().config.modelProfiles).toEqual([
      expect.objectContaining({
        model: "gpt-route-fast",
        isDefault: true,
        capabilities: expect.objectContaining({
          contextWindowTokens: { state: "observed", value: 32_000 },
          inputModalities: { state: "observed", values: ["text"] }
        }),
        provenance: { source: "openai", observedAt: baseNow.toISOString() }
      }),
      expect.objectContaining({ model: "gpt-route-deep", isDefault: false })
    ]);
    expect(discoveryResponse.body).not.toMatch(/sk-route-discovery|encrypted|Authorization|headers/i);

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
