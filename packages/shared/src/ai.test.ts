import { describe, expect, it } from "vitest";

import {
  aiCapabilityFactStates,
  aiInventoryFreshnessStates,
  aiModelAvailabilityStates,
  aiModelProfileOrigins,
  aiProviderAuthStates,
  aiProviderDiscoveryStates,
  aiProviderKinds,
  aiProviderTransportStates,
  type SyncAIProviderCapabilitiesResponse
} from "./ai";

describe("AI provider cross-layer contracts", () => {
  it("pins provider lifecycle and capability literal states", () => {
    expect(aiProviderKinds).toEqual(["openai", "openrouter", "anthropic", "openai_compatible"]);
    expect(aiProviderTransportStates).toEqual(["not_checked", "reachable", "unreachable"]);
    expect(aiProviderAuthStates).toEqual(["not_checked", "verified", "rejected", "unverified"]);
    expect(aiProviderDiscoveryStates).toEqual([
      "not_attempted",
      "available",
      "unsupported",
      "empty",
      "rate_limited",
      "unavailable",
      "malformed"
    ]);
    expect(aiInventoryFreshnessStates).toEqual(["never", "fresh", "stale"]);
    expect(aiModelProfileOrigins).toEqual(["manual", "discovered"]);
    expect(aiModelAvailabilityStates).toEqual(["unknown", "available", "unavailable"]);
    expect(aiCapabilityFactStates).toEqual(["unknown", "observed", "unsupported"]);
  });

  it("serializes a transport-safe capability synchronization response", () => {
    const syncedAt = "2026-07-16T08:30:00.000Z";
    const response = {
      config: {
        id: "config-1",
        ownerUserId: "user-1",
        name: "Research OpenAI",
        provider: "openai",
        providerKind: "openai",
        baseURL: "https://api.openai.com/v1",
        endpointDisplay: "api.openai.com",
        hasKey: true,
        isDefault: true,
        connection: {
          transport: "reachable",
          authentication: "verified",
          lastAttemptAt: syncedAt,
          lastVerifiedAt: syncedAt,
          errorCode: null,
          message: null
        },
        sync: {
          discovery: "available",
          freshness: "fresh",
          lastAttemptAt: syncedAt,
          lastSuccessfulSyncAt: syncedAt,
          errorCode: null,
          message: null
        },
        modelProfiles: [
          {
            id: "profile-1",
            providerConfigId: "config-1",
            model: "gpt-4.1-mini",
            displayName: "GPT-4.1 mini",
            temperature: 0.2,
            maxTokens: 4096,
            enabled: true,
            isDefault: true,
            origin: "discovered",
            availability: "available",
            lastSeenAt: syncedAt,
            capabilities: {
              contextWindowTokens: { state: "observed", value: 1_000_000 },
              maxOutputTokens: { state: "unknown", value: null },
              inputModalities: { state: "observed", values: ["text", "image"] },
              outputModalities: { state: "unsupported", values: [] },
              supportedParameters: { state: "observed", values: ["temperature"] }
            },
            provenance: { source: "openai", observedAt: syncedAt },
            createdAt: syncedAt,
            updatedAt: syncedAt
          }
        ],
        createdAt: syncedAt,
        updatedAt: syncedAt
      },
      discovered: 1,
      created: 1,
      updated: 0,
      skipped: 0,
      discovery: "available",
      freshness: "fresh",
      syncedAt
    } satisfies SyncAIProviderCapabilitiesResponse;

    expect(response.config.modelProfiles[0]?.capabilities?.contextWindowTokens).toEqual({
      state: "observed",
      value: 1_000_000
    });
    expect(response.config.modelProfiles[0]?.provenance).toEqual({
      source: "openai",
      observedAt: syncedAt
    });

    const serialized = JSON.stringify(response);
    for (const forbidden of [
      "apiKey",
      "encryptedApiKey",
      "authorization",
      "headers",
      "providerResponse",
      "responseBody"
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
