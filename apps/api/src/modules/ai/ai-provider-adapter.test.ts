import { describe, expect, it, vi } from "vitest";

import {
  AIProviderExecutionError,
  createAIProviderAdapter,
  createPinnedLookup,
  type AIProviderAdapterOptions
} from "./ai-provider-adapter.js";

const publicResolver = async () => ["8.8.8.8"];

function createTestAdapter(fetchImplementation: typeof fetch, options: Omit<AIProviderAdapterOptions, "fetchImplementation"> = {}) {
  return createAIProviderAdapter({ fetchImplementation, resolveAddresses: publicResolver, ...options });
}

const input = {
  config: {
    id: "config-1",
    ownerUserId: "owner-user",
    provider: "openai",
    providerKind: "openai_compatible" as const,
    baseURL: "https://provider.example/v1",
    model: "gpt-test",
    temperature: 0.2,
    maxTokens: 1000,
    apiKey: "sk-server-only"
  },
  messages: [],
  userMessage: {
    id: "message-1",
    role: "user" as const,
    content: "Summarize",
    createdAt: "2026-06-15T12:00:00.000Z"
  },
  selectedContextSnapshot: {
    currentDocumentId: "doc-1",
    capturedAt: "2026-06-15T12:00:00.000Z",
    items: [
      {
        sourceType: "current_document" as const,
        documentId: "doc-1",
        documentType: "project" as const,
        projectId: "project-1",
        title: "Project synthesis",
        revisionNumber: 2,
        selectedBlockIds: ["block-1"],
        content: "Private context body",
        capturedAt: "2026-06-15T12:00:00.000Z"
      }
    ]
  }
};

describe("AI provider adapter", () => {
  it("discovers OpenAI-compatible models through the server with bearer credentials", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            { id: "gpt-4o-mini", object: "model", owned_by: "openai" },
            { id: "gpt-4.1-mini", name: "GPT-4.1 mini" },
            { id: "gpt-4o-mini", name: "duplicate ignored" }
          ]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const result = await createTestAdapter(fetchMock).listModels({
      config: {
        id: "config-1",
        ownerUserId: "owner-user",
        provider: "openai",
        providerKind: "openai_compatible",
        baseURL: "https://provider.example/v1/chat/completions",
        apiKey: "sk-server-only"
      }
    });

    expect(result).toEqual([
      { id: "gpt-4o-mini" },
      { id: "gpt-4.1-mini", displayName: "GPT-4.1 mini" }
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://provider.example/v1/models",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer sk-server-only" })
      })
    );
  });

  it("uses fixed origins and provider-specific non-billable probes", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{"data":[]}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{"data":{"label":"research"}}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{"data":[]}', { status: 200 }));
    const adapter = createTestAdapter(fetchMock);

    await adapter.verifyConnection({
      config: { id: "openai", ownerUserId: "owner", provider: "OpenAI", providerKind: "openai", baseURL: "https://ignored.invalid/v1", apiKey: "openai-key" }
    });
    await adapter.verifyConnection({
      config: { id: "openrouter", ownerUserId: "owner", provider: "OpenRouter", providerKind: "openrouter", baseURL: "https://ignored.invalid/v1", apiKey: "openrouter-key" }
    });
    await adapter.verifyConnection({
      config: { id: "anthropic", ownerUserId: "owner", provider: "Anthropic", providerKind: "anthropic", baseURL: "https://ignored.invalid/v1", apiKey: "anthropic-key" }
    });

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://api.openai.com/v1/models",
      "https://openrouter.ai/api/v1/key",
      "https://api.anthropic.com/v1/models?limit=1"
    ]);
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "GET", redirect: "error" });
    expect(fetchMock.mock.calls[2]?.[1]?.headers).toMatchObject({
      "x-api-key": "anthropic-key",
      "anthropic-version": "2023-06-01"
    });
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("chat/completions");
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain("/messages");
  });

  it("does not verify credentials from malformed successful responses", async () => {
    for (const body of ["", "<html>ok</html>", '{"status":"ok"}']) {
      const result = await createTestAdapter(
        vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status: 200 }))
      ).verifyConnection({
        config: { id: "config", ownerUserId: "owner", provider: "openai", providerKind: "openai", baseURL: "https://ignored.invalid", apiKey: "secret" }
      });
      expect(result).toMatchObject({ transport: "reachable", authentication: "unverified", errorCode: "response_parse_failure" });
    }
  });

  it("uses account-aware OpenRouter discovery and normalizes observed capability facts", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      data: [{
        id: "openrouter/model",
        name: "Router model",
        context_length: 128000,
        architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] },
        supported_parameters: ["temperature", "max_tokens"]
      }]
    }), { status: 200 }));

    const result = await createTestAdapter(fetchMock).discoverModels({
      config: { id: "config", ownerUserId: "owner", provider: "openrouter", providerKind: "openrouter", baseURL: "https://ignored.invalid", apiKey: "secret" }
    });

    expect(result).toMatchObject({ discovery: "available", authentication: "verified" });
    expect(result.models).toEqual([{
      id: "openrouter/model",
      displayName: "Router model",
      capabilities: {
        contextWindowTokens: 128000,
        inputModalities: ["text", "image"],
        outputModalities: ["text"],
        supportedParameters: ["temperature", "max_tokens"]
      }
    }]);
    expect(fetchMock).toHaveBeenCalledWith("https://openrouter.ai/api/v1/models/user", expect.objectContaining({ method: "GET" }));
  });

  it("treats unsupported custom discovery as recoverable rather than invalid credentials", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("not implemented", { status: 501 }));

    const result = await createTestAdapter(fetchMock).discoverModels({
      config: { id: "config", ownerUserId: "owner", provider: "custom", providerKind: "openai_compatible", baseURL: "https://provider.example/v1", apiKey: "secret" }
    });

    expect(result).toEqual({
      providerKind: "openai_compatible",
      endpointDisplay: "https://provider.example/v1",
      transport: "reachable",
      authentication: "unverified",
      discovery: "unsupported",
      errorCode: null,
      models: []
    });
  });

  it("rejects private DNS answers and encoded private IPv6 before credentials leave Jixia", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const unsafeAnswers = ["10.1.2.3", "::127.0.0.1", "::ffff:192.168.1.10", "64:ff9b::7f00:1"];

    for (const address of unsafeAnswers) {
      const result = await createTestAdapter(fetchMock, { resolveAddresses: async () => [address] }).verifyConnection({
        config: { id: "config", ownerUserId: "owner", provider: "custom", providerKind: "openai_compatible", baseURL: "https://provider.example/v1", apiKey: "secret" }
      });
      expect(result).toMatchObject({ transport: "unreachable", authentication: "not_checked", errorCode: "invalid_base_url" });
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("pins connection lookup to the validated DNS snapshot", () => {
    const approvedSnapshot = [
      { address: "8.8.8.8", family: 4 as const },
      { address: "2606:4700:4700::1111", family: 6 as const }
    ];
    const lookup = createPinnedLookup("provider.example", approvedSnapshot);
    const callback = vi.fn();

    lookup("provider.example", { family: 4, all: false }, callback);
    expect(callback).toHaveBeenCalledWith(null, "8.8.8.8", 4);

    callback.mockClear();
    lookup("provider.example", { family: 0, all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, approvedSnapshot);

    callback.mockClear();
    lookup("rebound.provider.example", { family: 4, all: false }, callback);
    expect(callback.mock.calls[0]?.[0]).toMatchObject({ code: "ENOTFOUND" });
  });

  it("includes DNS resolution in the provider timeout", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const adapter = createTestAdapter(fetchMock, {
      resolveAddresses: async () => await new Promise<readonly string[]>(() => undefined),
      timeoutMs: 5
    });

    const result = await adapter.verifyConnection({
      config: { id: "config", ownerUserId: "owner", provider: "custom", providerKind: "openai_compatible", baseURL: "https://provider.example/v1", apiKey: "secret" }
    });

    expect(result).toMatchObject({ transport: "unreachable", authentication: "not_checked", errorCode: "timeout" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bounds provider bodies and reports malformed discovery without exposing payloads", async () => {
    const oversized = "x".repeat(65);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(oversized, { status: 200 }));

    const result = await createTestAdapter(fetchMock, { maxResponseBytes: 64 }).discoverModels({
      config: { id: "config", ownerUserId: "owner", provider: "custom", providerKind: "openai_compatible", baseURL: "https://provider.example/v1", apiKey: "secret" }
    });

    expect(result).toMatchObject({
      transport: "reachable",
      authentication: "not_checked",
      discovery: "malformed",
      errorCode: "response_parse_failure"
    });
    expect(JSON.stringify(result)).not.toContain(oversized);
  });

  it("rejects provider inventories above the persistence limit", async () => {
    const models = Array.from({ length: 501 }, (_, index) => ({ id: `model-${index}` }));
    const result = await createTestAdapter(
      vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: models }), { status: 200 }))
    ).discoverModels({
      config: { id: "config", ownerUserId: "owner", provider: "custom", providerKind: "openai_compatible", baseURL: "https://provider.example/v1", apiKey: "secret" }
    });
    expect(result).toMatchObject({ discovery: "malformed", errorCode: "response_parse_failure", models: [] });
  });

  it("does not treat structurally invalid model entries as an authoritative empty inventory", async () => {
    const result = await createTestAdapter(
      vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: [{}, 42] }), { status: 200 }))
    ).discoverModels({
      config: { id: "config", ownerUserId: "owner", provider: "custom", providerKind: "openai_compatible", baseURL: "https://provider.example/v1", apiKey: "secret" }
    });

    expect(result).toMatchObject({
      transport: "reachable",
      authentication: "not_checked",
      discovery: "malformed",
      errorCode: "response_parse_failure",
      models: []
    });
  });

  it("executes Anthropic models with native headers and response normalization", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      content: [{ type: "text", text: " Anthropic answer " }],
      usage: { input_tokens: 12, output_tokens: 7 }
    }), { status: 200 }));

    const result = await createTestAdapter(fetchMock).runConversation({
      ...input,
      config: { ...input.config, provider: "anthropic", providerKind: "anthropic", baseURL: "https://ignored.invalid/v1" }
    });

    expect(result).toEqual({ assistantText: "Anthropic answer", usage: { promptTokens: 12, completionTokens: 7 } });
    expect(fetchMock).toHaveBeenCalledWith("https://api.anthropic.com/v1/messages", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "x-api-key": "sk-server-only", "anthropic-version": "2023-06-01" })
    }));
  });

  it("calls an HTTPS OpenAI-compatible endpoint and returns assistant text with aggregate usage", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: " Assistant answer " } }],
          usage: { prompt_tokens: 8, completion_tokens: 13, estimated_cost_micros: 55 }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const result = await createTestAdapter(fetchMock).runConversation(input);

    expect(result).toEqual({
      assistantText: "Assistant answer",
      usage: { promptTokens: 8, completionTokens: 13, estimatedCostMicros: 55 }
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://provider.example/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer sk-server-only" })
      })
    );
    const [, init] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body)) as { readonly messages: readonly { readonly content: string }[] };
    expect(JSON.stringify(body)).toContain("Private context body");
  });

  it("blocks unsafe provider base URLs before sending credentials", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const adapter = createTestAdapter(fetchMock);
    const unsafeInputs = [
      { ...input, config: { ...input.config, baseURL: "http://provider.example/v1" } },
      { ...input, config: { ...input.config, baseURL: "https://user:pass@provider.example/v1" } },
      { ...input, config: { ...input.config, baseURL: "https://localhost/v1" } },
      { ...input, config: { ...input.config, baseURL: "https://127.0.0.1/v1" } },
      { ...input, config: { ...input.config, baseURL: "https://10.0.0.5/v1" } },
      { ...input, config: { ...input.config, baseURL: "https://192.168.1.20/v1" } }
    ];

    for (const unsafeInput of unsafeInputs) {
      await expect(adapter.runConversation(unsafeInput)).rejects.toSatisfy((error: unknown) => {
        expect(error).toBeInstanceOf(AIProviderExecutionError);
        expect((error as AIProviderExecutionError).category).toBe("invalid_base_url");
        return true;
      });
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends an explicit empty-context prompt for standalone conversations", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "Standalone answer" } }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await createTestAdapter(fetchMock).runConversation({
      ...input,
      selectedContextSnapshot: {
        currentDocumentId: null,
        capturedAt: "2026-06-15T12:00:00.000Z",
        items: []
      }
    });

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body)) as { readonly messages: readonly { readonly content: string }[] };
    expect(body.messages[1]?.content).toBe("No explicit context is attached to this private conversation.");
    expect(JSON.stringify(body)).not.toMatch(/doc-1|Private context body|current_document/i);
  });

  it("streams OpenAI-compatible deltas without scrambling chunks and captures usage", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(streamFromChunks([
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n',
        '\ndata: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
        'data: {"usage":{"prompt_tokens":3,"completion_tokens":5,"estimated_cost_micros":7}}\n\n',
        "data: [DONE]\n\n"
      ]), { status: 200 })
    );

    const events = [];
    for await (const event of createTestAdapter(fetchMock).streamConversation(input)) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "delta", delta: "Hel" },
      { type: "delta", delta: "lo" },
      {
        type: "final",
        assistantText: "Hello",
        usage: { promptTokens: 3, completionTokens: 5, estimatedCostMicros: 7 }
      }
    ]);
  });

  it("separates provider timeout from user cancellation", async () => {
    const timeoutError = new DOMException("timed out", "TimeoutError");
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(timeoutError);

    await expect(createTestAdapter(fetchMock).runConversation(input)).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(AIProviderExecutionError);
      expect((error as AIProviderExecutionError).category).toBe("timeout");
      return true;
    });
  });
});

function streamFromChunks(chunks: readonly string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    }
  });
}
