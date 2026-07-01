import type {
  AIModelProfileResponse,
  AIProviderConfigListResponse,
  AIProviderConfigResponse,
  AIProviderConfigView,
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
  baseURL: "https://api.openai.com/v1",
  hasKey: true,
  isDefault: true,
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

  it("renders config metadata and key status without exposing key material", async () => {
    const fetchMock = mockFetchSequence({
      configs: [
        {
          ...savedConfig,
          encryptedApiKey: "encrypted-secret-value",
          apiKey: "sk-live-full-old-secret"
        }
      ]
    });

    render(<AISettingsPage />);

    expect(await screen.findByText("Lab OpenAI")).toBeTruthy();
    expect(screen.getByText("Key saved")).toBeTruthy();
    expect(screen.queryByText("sk-...wxyz")).toBeNull();
    expect(screen.queryByText("sk-live-full-old-secret")).toBeNull();
    expect(screen.queryByText("encrypted-secret-value")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("/api/ai/configs", expect.objectContaining({ credentials: "include" }));
  });

  it("applies an OpenRouter preset before creating a config", async () => {
    const createdConfig: AIProviderConfigView = {
      ...savedConfig,
      id: "config-openrouter",
      name: "OpenRouter GPT-4o mini",
      provider: "openrouter",
      baseURL: "https://openrouter.ai/api/v1",
      modelProfiles: [
        {
          ...savedConfig.modelProfiles[0]!,
          id: "model-profile-openrouter",
          providerConfigId: "config-openrouter",
          model: "openai/gpt-4o-mini",
          displayName: "OpenAI GPT-4o mini"
        }
      ],
      hasKey: false,
      isDefault: false
    };
    const fetchMock = mockFetchSequence(
      { configs: [] },
      { config: createdConfig }
    );

    render(<AISettingsPage />);

    await screen.findByText("No providers configured yet");
    fireEvent.click(screen.getByRole("button", { name: /OpenRouter/ }));

    expect(screen.getByLabelText("Provider")).toHaveProperty("value", "openrouter");
    expect(screen.getByLabelText("Base URL")).toHaveProperty("value", "https://openrouter.ai/api/v1");
    expect(screen.getByLabelText("Model")).toHaveProperty("value", "openai/gpt-4o-mini");
    expect(screen.getByLabelText("Model profile name")).toHaveProperty("value", "OpenAI GPT-4o mini");

    fireEvent.click(screen.getByRole("button", { name: "Create provider account" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const [url, init] = fetchMock.mock.calls[1] ?? [];
    expect(url).toBe("/api/ai/configs");
    expect(init).toEqual(expect.objectContaining({ method: "POST", credentials: "include" }));
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toEqual(expect.objectContaining({
      baseURL: "https://openrouter.ai/api/v1",
      name: "OpenRouter GPT-4o mini",
      provider: "openrouter",
      defaultModelProfile: expect.objectContaining({
        displayName: "OpenAI GPT-4o mini",
        model: "openai/gpt-4o-mini",
        temperature: 0.2,
        maxTokens: 4096
      })
    }));
    expect(body).not.toHaveProperty("apiKey");
  });

  it("omits apiKey when editing without a replacement key", async () => {
    const updatedConfig: AIProviderConfigView = {
      ...savedConfig,
      name: "Lab OpenAI updated",
      updatedAt: "2026-06-16T10:05:00.000Z"
    };
    const fetchMock = mockFetchSequence(
      { configs: [savedConfig] },
      { config: updatedConfig }
    );

    render(<AISettingsPage />);

    await screen.findByText("Lab OpenAI");
    fireEvent.click(screen.getByRole("button", { name: "Edit Lab OpenAI" }));
    expect(screen.getByLabelText("Replacement API key")).toHaveProperty("value", "");
    fireEvent.change(screen.getByLabelText("Provider account name"), { target: { value: "Lab OpenAI updated" } });
    fireEvent.click(screen.getByRole("button", { name: "Save provider account" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const [url, init] = fetchMock.mock.calls[1] ?? [];
    expect(url).toBe("/api/ai/configs/config-1");
    expect(init).toEqual(expect.objectContaining({ method: "PATCH", credentials: "include" }));
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body.name).toBe("Lab OpenAI updated");
    expect(body).not.toHaveProperty("model");
    expect(body).not.toHaveProperty("defaultModelProfile");
    expect(body).not.toHaveProperty("apiKey");
  });

  it("submits apiKey only when the user types a replacement key", async () => {
    const updatedConfig: AIProviderConfigView = {
      ...savedConfig,
      updatedAt: "2026-06-16T10:08:00.000Z"
    };
    const fetchMock = mockFetchSequence(
      { configs: [savedConfig] },
      { config: updatedConfig }
    );

    render(<AISettingsPage />);

    await screen.findByText("Lab OpenAI");
    fireEvent.click(screen.getByRole("button", { name: "Edit Lab OpenAI" }));
    fireEvent.change(screen.getByLabelText("Replacement API key"), {
      target: { value: "sk-new-replacement-key" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save provider account" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const [, init] = fetchMock.mock.calls[1] ?? [];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body.apiKey).toBe("sk-new-replacement-key");

    await waitFor(() => expect(screen.getByLabelText("Replacement API key")).toHaveProperty("value", ""));
  });

  it("adds another model profile under an existing provider without sending apiKey", async () => {
    const withSecondProfile: AIProviderConfigView = {
      ...savedConfig,
      modelProfiles: [
        ...savedConfig.modelProfiles,
        {
          ...savedConfig.modelProfiles[0]!,
          id: "model-profile-2",
          model: "gpt-4.1-mini",
          displayName: "GPT-4.1 mini",
          isDefault: false
        }
      ]
    };
    const fetchMock = mockFetchSequence(
      { configs: [savedConfig] },
      { config: withSecondProfile, modelProfile: withSecondProfile.modelProfiles[1]! }
    );

    render(<AISettingsPage />);

    await screen.findByText("Lab OpenAI");
    fireEvent.click(screen.getByRole("button", { name: "Edit Lab OpenAI" }));
    fireEvent.change(screen.getByLabelText("Model profile name"), { target: { value: "GPT-4.1 mini" } });
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "gpt-4.1-mini" } });
    fireEvent.click(screen.getByRole("button", { name: "Add model profile" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const [url, init] = fetchMock.mock.calls[1] ?? [];
    expect(url).toBe("/api/ai/configs/config-1/model-profiles");
    expect(init).toEqual(expect.objectContaining({ method: "POST", credentials: "include" }));
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toEqual(expect.objectContaining({
      displayName: "GPT-4.1 mini",
      model: "gpt-4.1-mini",
      temperature: 0.2,
      maxTokens: 4096
    }));
    expect(body).not.toHaveProperty("apiKey");
    expect(await screen.findByText("GPT-4.1 mini")).toBeTruthy();
  });

  it("edits and disables saved model profiles without touching provider keys", async () => {
    const renamedConfig: AIProviderConfigView = {
      ...savedConfig,
      modelProfiles: [
        {
          ...savedConfig.modelProfiles[0]!,
          model: "gpt-4.1-mini",
          displayName: "Renamed GPT",
          maxTokens: 8192,
          updatedAt: "2026-06-16T10:09:00.000Z"
        }
      ]
    };
    const disabledConfig: AIProviderConfigView = {
      ...renamedConfig,
      modelProfiles: [
        {
          ...renamedConfig.modelProfiles[0]!,
          enabled: false,
          isDefault: false,
          updatedAt: "2026-06-16T10:10:00.000Z"
        }
      ]
    };
    const fetchMock = mockFetchSequence(
      { configs: [savedConfig] },
      { config: renamedConfig, modelProfile: renamedConfig.modelProfiles[0]! },
      { config: disabledConfig, modelProfile: disabledConfig.modelProfiles[0]! }
    );

    render(<AISettingsPage />);

    await screen.findByText("Lab OpenAI");
    fireEvent.click(screen.getByRole("button", { name: "Edit Lab OpenAI" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit model" }));
    fireEvent.change(screen.getByLabelText("Model profile name"), { target: { value: "Renamed GPT" } });
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "gpt-4.1-mini" } });
    fireEvent.change(screen.getByLabelText("Max tokens"), { target: { value: "8192" } });
    fireEvent.click(screen.getByRole("button", { name: "Save model profile" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [editUrl, editInit] = fetchMock.mock.calls[1] ?? [];
    expect(editUrl).toBe("/api/ai/configs/config-1/model-profiles/model-profile-1");
    expect(editInit).toEqual(expect.objectContaining({ method: "PATCH", credentials: "include" }));
    expect(JSON.parse(String(editInit?.body))).toEqual({
      displayName: "Renamed GPT",
      model: "gpt-4.1-mini",
      temperature: 0.2,
      maxTokens: 8192
    });
    expect(String(editInit?.body)).not.toMatch(/apiKey|encrypted|sk-/i);

    expect(await screen.findByText("Renamed GPT")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Disable model" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [disableUrl, disableInit] = fetchMock.mock.calls[2] ?? [];
    expect(disableUrl).toBe("/api/ai/configs/config-1/model-profiles/model-profile-1");
    expect(disableInit).toEqual(expect.objectContaining({ method: "PATCH", credentials: "include" }));
    expect(JSON.parse(String(disableInit?.body))).toEqual({ enabled: false });
    expect(String(disableInit?.body)).not.toMatch(/apiKey|encrypted|sk-/i);
    expect(await screen.findByText("Disabled")).toBeTruthy();
  });

  it("tests unsaved draft providers without persisting the key", async () => {
    const fetchMock = mockFetchSequence(
      { configs: [] },
      {
        healthCheck: {
          ok: true,
          category: null,
          message: "Connection verified through the server adapter.",
          latencyMs: 42,
          provider: "openai",
          model: "gpt-4o-mini",
          baseURL: "https://api.openai.com/v1",
          checkedAt: "2026-06-16T10:03:00.000Z"
        }
      }
    );

    render(<AISettingsPage />);

    await screen.findByText("No providers configured yet");
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "sk-draft-test-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Test draft provider and model" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Connection verified")).toBeTruthy();
    expect(screen.getByText(/openai · gpt-4o-mini · https:\/\/api\.openai\.com\/v1 · 42ms · ok/)).toBeTruthy();

    const [url, init] = fetchMock.mock.calls[1] ?? [];
    expect(url).toBe("/api/ai/configs/test");
    expect(init).toEqual(expect.objectContaining({ method: "POST", credentials: "include" }));
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body.apiKey).toBe("sk-draft-test-key");
    expect(body).toEqual(expect.objectContaining({
      provider: "openai",
      baseURL: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      temperature: 0.2,
      maxTokens: 4096
    }));
    expect(fetchMock).not.toHaveBeenCalledWith("/api/ai/configs", expect.objectContaining({ method: "POST" }));
    expect(screen.queryByText("sk-draft-test-key")).toBeNull();
  });

  it("tests saved providers through the saved config endpoint", async () => {
    const handleOpenChat = vi.fn();
    const fetchMock = mockFetchSequence(
      { configs: [savedConfig] },
      {
        healthCheck: {
          ok: false,
          category: "model_not_found",
          message: "The provider could not find or run the selected model. Check the model id.",
          latencyMs: 19,
          provider: "openai",
          model: "gpt-4o-mini",
          baseURL: "https://api.openai.com/v1",
          checkedAt: "2026-06-16T10:04:00.000Z"
        }
      }
    );

    render(<AISettingsPage onOpenChat={handleOpenChat} />);

    await screen.findByText("Lab OpenAI");
    fireEvent.click(screen.getByRole("button", { name: "Test Lab OpenAI" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Connection failed")).toBeTruthy();
    expect(screen.getAllByText("The provider could not find or run the selected model. Check the model id.").length).toBeGreaterThan(0);

    const [url, init] = fetchMock.mock.calls[1] ?? [];
    expect(url).toBe("/api/ai/configs/config-1/test");
    expect(init).toEqual(expect.objectContaining({ method: "POST", credentials: "include" }));
    expect(JSON.parse(String(init?.body))).toEqual({});
  });

  it("shows a chat handoff after a saved provider passes connection test", async () => {
    const handleOpenChat = vi.fn();
    const fetchMock = mockFetchSequence(
      { configs: [savedConfig] },
      {
        healthCheck: {
          ok: true,
          category: null,
          message: "Connection verified through the server adapter.",
          latencyMs: 31,
          provider: "openai",
          model: "gpt-4o-mini",
          baseURL: "https://api.openai.com/v1",
          checkedAt: "2026-06-16T10:06:00.000Z"
        }
      }
    );

    render(<AISettingsPage onOpenChat={handleOpenChat} />);

    await screen.findByText("Lab OpenAI");
    fireEvent.click(screen.getByRole("button", { name: "Test Lab OpenAI" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Lab OpenAI connection verified. Chat is ready to use this provider.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back to chat" }));
    expect(handleOpenChat).toHaveBeenCalledTimes(1);
  });
});

type MockResponseInput =
  | AIProviderConfigListResponse
  | AIProviderConfigResponse
  | AIModelProfileResponse
  | TestAIProviderConfigResponse
  | {
      readonly configs: readonly (AIProviderConfigView & Record<string, unknown>)[];
    };

function mockFetchSequence(...responses: readonly MockResponseInput[]) {
  const fetchMock = vi.fn<typeof fetch>();

  for (const response of responses) {
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
