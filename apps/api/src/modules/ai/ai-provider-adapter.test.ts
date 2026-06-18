import { describe, expect, it, vi } from "vitest";

import { AIProviderExecutionError, createOpenAICompatibleProviderAdapter } from "./ai-provider-adapter.js";

const input = {
  config: {
    id: "config-1",
    ownerUserId: "owner-user",
    provider: "openai",
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

    const result = await createOpenAICompatibleProviderAdapter(fetchMock).runConversation(input);

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
    const adapter = createOpenAICompatibleProviderAdapter(fetchMock);
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

    await createOpenAICompatibleProviderAdapter(fetchMock).runConversation({
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
    for await (const event of createOpenAICompatibleProviderAdapter(fetchMock).streamConversation(input)) {
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

    await expect(createOpenAICompatibleProviderAdapter(fetchMock).runConversation(input)).rejects.toSatisfy((error: unknown) => {
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
