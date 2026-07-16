import type {
  AIProviderConfigListResponse,
  AIProviderConfigResponse,
  AIProviderConfigView,
  SyncAIProviderCapabilitiesResponse,
  TestAIProviderConfigResponse
} from "@jixia/shared";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AISettingsPage } from "./AISettingsPage";

const savedConfig: AIProviderConfigView = {
  id: "config-1",
  ownerUserId: "user-1",
  name: "Lab OpenAI",
  provider: "openai",
  providerKind: "openai",
  baseURL: "https://api.openai.com/v1",
  endpointDisplay: "https://api.openai.com/v1",
  hasKey: true,
  isDefault: true,
  connection: {
    transport: "not_checked",
    authentication: "not_checked",
    lastAttemptAt: null,
    lastVerifiedAt: null,
    errorCode: null,
    message: null
  },
  sync: {
    discovery: "not_attempted",
    freshness: "never",
    lastAttemptAt: null,
    lastSuccessfulSyncAt: null,
    errorCode: null,
    message: null
  },
  modelProfiles: [
    {
      id: "model-profile-1",
      providerConfigId: "config-1",
      model: "gpt-4o-mini",
      displayName: "GPT-4o mini",
      temperature: 0.2,
      maxTokens: 4096,
      enabled: true,
      isDefault: true,
      origin: "discovered",
      availability: "available",
      createdAt: "2026-06-16T10:00:00.000Z",
      updatedAt: "2026-06-16T10:00:00.000Z"
    }
  ],
  createdAt: "2026-06-16T10:00:00.000Z",
  updatedAt: "2026-06-16T10:00:00.000Z"
};

describe("AISettingsPage", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("uses Jixia-managed endpoints for known providers and exposes a base URL only for custom providers", async () => {
    mockFetchSequence({ configs: [] });

    render(<AISettingsPage />);

    await screen.findByText("No provider connections yet");
    expect(screen.getByText("https://api.openai.com/v1")).toBeTruthy();
    expect(screen.queryByLabelText(/^Custom HTTPS base URL/)).toBeNull();

    const customProvider = screen.getByRole("button", { name: /Custom OpenAI-compatible/ });
    fireEvent.click(customProvider);

    await waitFor(() => expect(customProvider.getAttribute("aria-pressed")).toBe("true"));
    const customBaseURL = await screen.findByLabelText(/^Custom HTTPS base URL/);
    expect(customBaseURL).toHaveProperty("value", "");

    fireEvent.change(customBaseURL, { target: { value: "https://gateway.example.test/v1" } });
    fireEvent.click(screen.getByRole("button", { name: /^OpenAI/ }));
    expect(screen.queryByLabelText(/^Custom HTTPS base URL/)).toBeNull();
    fireEvent.click(customProvider);
    expect(await screen.findByLabelText(/^Custom HTTPS base URL/)).toHaveProperty("value", "https://gateway.example.test/v1");
  });

  it("requires a replacement key before changing the identity of a keyed connection", async () => {
    mockFetchSequence({ configs: [savedConfig] });

    render(<AISettingsPage />);

    await openSavedConnection();
    const customProvider = screen.getByRole("button", { name: /Custom OpenAI-compatible/ });
    expect(customProvider).toHaveProperty("disabled", true);

    fireEvent.change(screen.getByLabelText(/^Replacement API key/), { target: { value: "sk-replacement" } });
    expect(customProvider).toHaveProperty("disabled", false);
    fireEvent.click(customProvider);
    expect(await screen.findByLabelText(/^Custom HTTPS base URL/)).toHaveProperty("value", "");
  });

  it("creates a custom connection through Jixia and clears the write-only key after saving", async () => {
    const createdConfig: AIProviderConfigView = {
      ...savedConfig,
      id: "config-custom",
      name: "Research gateway",
      provider: "openai-compatible",
      providerKind: "openai_compatible",
      baseURL: "https://models.example.test/v1",
      endpointDisplay: "https://models.example.test/v1",
      isDefault: false,
      hasKey: true,
      modelProfiles: []
    };
    const fetchMock = mockFetchSequence({ configs: [] }, { config: createdConfig });

    render(<AISettingsPage />);

    await screen.findByText("No provider connections yet");
    const customProvider = screen.getByRole("button", { name: /Custom OpenAI-compatible/ });
    fireEvent.click(customProvider);
    await waitFor(() => expect(customProvider.getAttribute("aria-pressed")).toBe("true"));
    await screen.findByLabelText(/^Custom HTTPS base URL/);
    fireEvent.change(screen.getByLabelText("Connection name"), { target: { value: "Research gateway" } });
    fireEvent.change(screen.getByLabelText(/^Custom HTTPS base URL/), { target: { value: "https://models.example.test/v1" } });
    fireEvent.change(screen.getByLabelText(/^API key/), { target: { value: "sk-task24b-write-only" } });
    fireEvent.click(screen.getByRole("button", { name: "Save connection" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, init] = fetchMock.mock.calls[1] ?? [];
    expect(url).toBe("/api/ai/configs");
    expect(init).toEqual(expect.objectContaining({ method: "POST", credentials: "include" }));
    expect(JSON.parse(String(init?.body))).toEqual({
      name: "Research gateway",
      provider: "openai-compatible",
      providerKind: "openai_compatible",
      baseURL: "https://models.example.test/v1",
      isDefault: false,
      apiKey: "sk-task24b-write-only"
    });
    expect(await screen.findByLabelText(/^Replacement API key/)).toHaveProperty("value", "");
    expect(screen.queryByDisplayValue("sk-task24b-write-only")).toBeNull();
    expect(document.body.textContent).not.toContain("sk-task24b-write-only");
    expectProviderRequestsStayInsideJixia(fetchMock);
  });

  it("verifies a saved connection through the non-billable saved-config endpoint", async () => {
    const verifiedConfig: AIProviderConfigView = {
      ...savedConfig,
      connection: {
        transport: "reachable",
        authentication: "verified",
        lastAttemptAt: "2026-06-16T10:03:00.000Z",
        lastVerifiedAt: "2026-06-16T10:03:00.000Z",
        errorCode: null,
        message: "Connection verified through the server adapter."
      }
    };
    const fetchMock = mockFetchSequence(
      { configs: [savedConfig] },
      verifiedTestResponse(),
      { configs: [verifiedConfig] }
    );

    render(<AISettingsPage />);

    await openSavedConnection();
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/ai/configs/config-1/test",
      expect.objectContaining({ method: "POST", credentials: "include" })
    );
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({});
    expect((await screen.findAllByText("Connection verified through the server adapter.")).length).toBeGreaterThan(0);
    expect(screen.getByText("Verification checks transport and authentication without making an inference request.")).toBeTruthy();
    expectProviderRequestsStayInsideJixia(fetchMock);
  });

  it("keeps a refresh failure visible after verification", async () => {
    const fetchMock = mockFetchSequence(
      { configs: [savedConfig] },
      verifiedTestResponse(),
      new Error("Connection list refresh failed")
    );

    render(<AISettingsPage />);

    await openSavedConnection();
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Connection list refresh failed");
    expect(screen.queryByText("Connection verified through the server adapter.")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("synchronizes capabilities through the new endpoint and makes unsupported discovery recoverable", async () => {
    const unsupportedConfig: AIProviderConfigView = {
      ...savedConfig,
      sync: {
        discovery: "unsupported",
        freshness: "never",
        lastAttemptAt: "2026-06-16T10:04:00.000Z",
        lastSuccessfulSyncAt: null,
        errorCode: null,
        message: "This provider does not expose a model inventory."
      }
    };
    const syncResponse: SyncAIProviderCapabilitiesResponse = {
      config: unsupportedConfig,
      discovered: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      discovery: "unsupported",
      freshness: "never",
      syncedAt: "2026-06-16T10:04:00.000Z"
    };
    const fetchMock = mockFetchSequence({ configs: [savedConfig] }, syncResponse);

    render(<AISettingsPage />);

    await openSavedConnection();
    fireEvent.click(screen.getByRole("button", { name: "Sync capabilities" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/ai/configs/config-1/capabilities/sync",
      expect.objectContaining({ method: "POST", credentials: "include" })
    );
    expect((await screen.findAllByText(/This provider does not support model discovery/)).length).toBeGreaterThan(0);
    expect(screen.getByText("Advanced manual fallback")).toBeTruthy();
    expectProviderRequestsStayInsideJixia(fetchMock);
  });

  it("only offers enabled available or unknown profiles as default-model candidates", async () => {
    const modelInventoryConfig: AIProviderConfigView = {
      ...savedConfig,
      modelProfiles: [
        savedConfig.modelProfiles[0]!,
        {
          ...savedConfig.modelProfiles[0]!,
          id: "model-profile-unknown",
          model: "gpt-unknown",
          displayName: "Unknown availability",
          isDefault: false,
          availability: "unknown"
        },
        {
          ...savedConfig.modelProfiles[0]!,
          id: "model-profile-unavailable",
          model: "gpt-unavailable",
          displayName: "Unavailable model",
          isDefault: false,
          availability: "unavailable"
        }
      ]
    };
    mockFetchSequence({ configs: [modelInventoryConfig] });

    render(<AISettingsPage />);

    await openSavedConnection();
    const candidateIds = Array.from((screen.getByLabelText("Default model") as HTMLSelectElement).options).map((option) => option.value);

    expect(candidateIds).toEqual(["model-profile-1", "model-profile-unknown"]);
    expect(screen.getByText("Unavailable model")).toBeTruthy();
  });

  it("keeps manual-profile controls in Advanced while leaving discovered profiles read-only", async () => {
    const mixedInventoryConfig: AIProviderConfigView = {
      ...savedConfig,
      modelProfiles: [
        savedConfig.modelProfiles[0]!,
        {
          ...savedConfig.modelProfiles[0]!,
          id: "manual-profile-1",
          model: "manual-authorized-id",
          displayName: "Manual fallback",
          isDefault: false,
          origin: "manual",
          availability: "unknown"
        }
      ]
    };
    mockFetchSequence({ configs: [mixedInventoryConfig] });

    render(<AISettingsPage />);

    await openSavedConnection();
    const advanced = screen.getByText("Advanced manual fallback").closest("details");
    expect(advanced).not.toBeNull();
    fireEvent.click(screen.getByText("Advanced manual fallback"));

    expect(advanced).toHaveProperty("open", true);
    expect(screen.getByRole("button", { name: "Edit Manual fallback" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit GPT-4o mini" })).toBeNull();
  });

  it("renders the provider connection lifecycle from the Simplified Chinese catalog", async () => {
    mockFetchSequence({ configs: [savedConfig] });

    render(<AISettingsPage locale="zh-CN" />);

    expect(await screen.findByText("提供商连接")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: /^Lab OpenAI/ }));
    expect(screen.getByText("1. 选择提供商")).toBeTruthy();
    expect(screen.getByText("高级手动备用设置")).toBeTruthy();
  });
});

function verifiedTestResponse(): TestAIProviderConfigResponse {
  return {
    healthCheck: {
      ok: true,
      category: null,
      message: "Connection verified through the server adapter.",
      latencyMs: 21,
      provider: "openai",
      model: "",
      baseURL: "https://api.openai.com/v1",
      checkedAt: "2026-06-16T10:03:00.000Z",
      connection: {
        providerKind: "openai",
        endpointDisplay: "https://api.openai.com/v1",
        transport: "reachable",
        authentication: "verified",
        errorCode: null,
        message: "Connection verified through the server adapter.",
        latencyMs: 21,
        checkedAt: "2026-06-16T10:03:00.000Z"
      }
    }
  };
}

async function openSavedConnection(): Promise<void> {
  fireEvent.click(await screen.findByRole("button", { name: /^Lab OpenAI/ }));
  await screen.findByText("3. Verify connection");
}

type MockResponseInput =
  | AIProviderConfigListResponse
  | AIProviderConfigResponse
  | SyncAIProviderCapabilitiesResponse
  | TestAIProviderConfigResponse
  | Error;

function mockFetchSequence(...responses: readonly MockResponseInput[]) {
  const fetchMock = vi.fn<typeof fetch>();

  for (const response of responses) {
    if (response instanceof Error) {
      fetchMock.mockRejectedValueOnce(response);
      continue;
    }

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
  }

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function expectProviderRequestsStayInsideJixia(fetchMock: ReturnType<typeof mockFetchSequence>): void {
  for (const [url, init] of fetchMock.mock.calls) {
    expect(String(url)).toMatch(/^\/api\//);
    expect(init?.headers).not.toEqual(expect.objectContaining({ Authorization: expect.anything() }));
  }
}
