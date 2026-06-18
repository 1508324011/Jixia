import type {
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
  model: "gpt-4o-mini",
  temperature: 0.2,
  maxTokens: 4096,
  hasKey: true,
  isDefault: true,
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
      model: "openai/gpt-4o-mini",
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

    fireEvent.click(screen.getByRole("button", { name: "Create config" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const [url, init] = fetchMock.mock.calls[1] ?? [];
    expect(url).toBe("/api/ai/configs");
    expect(init).toEqual(expect.objectContaining({ method: "POST", credentials: "include" }));
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toEqual(expect.objectContaining({
      baseURL: "https://openrouter.ai/api/v1",
      model: "openai/gpt-4o-mini",
      name: "OpenRouter GPT-4o mini",
      provider: "openrouter"
    }));
    expect(body).not.toHaveProperty("apiKey");
  });

  it("omits apiKey when editing without a replacement key", async () => {
    const updatedConfig: AIProviderConfigView = {
      ...savedConfig,
      model: "gpt-4.1-mini",
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
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "gpt-4.1-mini" } });
    fireEvent.click(screen.getByRole("button", { name: "Save config" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const [url, init] = fetchMock.mock.calls[1] ?? [];
    expect(url).toBe("/api/ai/configs/config-1");
    expect(init).toEqual(expect.objectContaining({ method: "PATCH", credentials: "include" }));
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body.model).toBe("gpt-4.1-mini");
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
    fireEvent.click(screen.getByRole("button", { name: "Save config" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const [, init] = fetchMock.mock.calls[1] ?? [];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body.apiKey).toBe("sk-new-replacement-key");

    await waitFor(() => expect(screen.getByLabelText("Replacement API key")).toHaveProperty("value", ""));
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
    fireEvent.click(screen.getByRole("button", { name: "Test draft config" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Connection verified")).toBeTruthy();
    expect(screen.getByText(/openai · gpt-4o-mini · https:\/\/api\.openai\.com\/v1 · 42ms · ok/)).toBeTruthy();

    const [url, init] = fetchMock.mock.calls[1] ?? [];
    expect(url).toBe("/api/ai/configs/test");
    expect(init).toEqual(expect.objectContaining({ method: "POST", credentials: "include" }));
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body.apiKey).toBe("sk-draft-test-key");
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
