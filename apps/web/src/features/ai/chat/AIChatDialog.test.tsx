import type {
  AIConversationDTO,
  AIConversationRunStreamEvent,
  AIProviderConfigListResponse,
  AIProviderConfigView,
  CancelAIConversationRunResponse,
  CreateAIConversationResponse,
  ListAIConversationsResponse
} from "@jixia/shared";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AIChatDialog } from "./AIChatDialog";

const providerConfig: AIProviderConfigView = {
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

const providerConfigWithDiscoveredModels: AIProviderConfigView = {
  ...providerConfig,
  modelProfiles: [
    providerConfig.modelProfiles[0]!,
    {
      ...providerConfig.modelProfiles[0]!,
      id: "model-profile-2",
      model: "gpt-4.1-mini",
      displayName: "GPT-4.1 mini",
      isDefault: false
    }
  ]
};

const providerConfigWithUnavailableModel: AIProviderConfigView = {
  ...providerConfig,
  modelProfiles: [
    {
      ...providerConfig.modelProfiles[0]!,
      availability: "available"
    },
    {
      ...providerConfig.modelProfiles[0]!,
      id: "model-profile-unknown",
      model: "gpt-unknown",
      displayName: "Unknown availability",
      isDefault: false,
      availability: "unknown"
    },
    {
      ...providerConfig.modelProfiles[0]!,
      id: "model-profile-unavailable",
      model: "gpt-unavailable",
      displayName: "Unavailable model",
      isDefault: false,
      availability: "unavailable"
    }
  ]
};

const standaloneConversation: AIConversationDTO = {
  id: "conversation-standalone",
  ownerUserId: "user-1",
  title: "Standalone synthesis",
  currentDocumentId: null,
  selectedContextSnapshot: {
    currentDocumentId: null,
    items: [],
    capturedAt: "2026-06-16T10:00:00.000Z"
  },
  contextAttachments: [],
  messages: [
    {
      id: "message-1",
      role: "assistant",
      content: "## Standalone answer\n\n| Claim | Check |\n| --- | --- |\n| No context | Preserved |\n\n> Explicit attachments only.\n\n1. Keep chat standalone\n2. Preserve server boundaries\n\n[Evidence](https://example.test/evidence)\n\n```text\nno writeback\n```",
      createdAt: "2026-06-16T10:01:00.000Z",
      parts: [
        {
          type: "markdown",
          content: "## Standalone answer\n\n| Claim | Check |\n| --- | --- |\n| No context | Preserved |\n\n> Explicit attachments only.\n\n1. Keep chat standalone\n2. Preserve server boundaries\n\n[Evidence](https://example.test/evidence)\n\n```text\nno writeback\n```"
        }
      ],
      sources: [],
      runSteps: [],
      actions: []
    }
  ],
  createdAt: "2026-06-16T10:00:00.000Z",
  updatedAt: "2026-06-16T10:01:00.000Z"
};

const createdConversation: AIConversationDTO = {
  ...standaloneConversation,
  id: "conversation-new",
  title: "Compare methods",
  messages: [],
  updatedAt: "2026-06-16T10:02:00.000Z"
};

const appendedConversation: AIConversationDTO = {
  ...createdConversation,
  messages: [
    {
      id: "message-user",
      role: "user",
      content: "Compare methods",
      createdAt: "2026-06-16T10:02:00.000Z",
      runId: "run-1",
      runStatus: "succeeded",
      parts: [{ type: "text", content: "Compare methods" }],
      sources: [],
      runSteps: [],
      actions: []
    },
    {
      id: "message-assistant",
      role: "assistant",
      content: "## Method comparison\n\n- Keep chat standalone\n- Use explicit attachments later",
      createdAt: "2026-06-16T10:02:10.000Z",
      runId: "run-1",
      runStatus: "succeeded",
      parts: [{ type: "markdown", content: "## Method comparison\n\n- Keep chat standalone\n- Use explicit attachments later" }],
      sources: [],
      runSteps: [],
      actions: []
    }
  ],
  updatedAt: "2026-06-16T10:02:10.000Z"
};

const streamedUserMessage = appendedConversation.messages[0]!;
const streamedAssistantMessage = appendedConversation.messages[1]!;

const succeededRun = {
  id: "run-1",
  status: "succeeded" as const,
  providerConfigId: "config-1",
  modelProfileId: "model-profile-1",
  errorMessage: null,
  createdAt: "2026-06-16T10:02:00.000Z",
  startedAt: "2026-06-16T10:02:01.000Z",
  completedAt: "2026-06-16T10:02:10.000Z"
};

const runningRun = {
  ...succeededRun,
  status: "running" as const,
  completedAt: null
};

const cancelledRun = {
  ...succeededRun,
  status: "cancelled" as const,
  errorCategory: "cancelled" as const,
  errorMessage: "The AI run was cancelled."
};

describe("AIChatDialog", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("loads standalone threads from the server-filtered conversation list", async () => {
    const fetchMock = mockFetchSequence(
      { configs: [providerConfig] },
      { conversations: [standaloneConversation] }
    );

    render(<AIChatDialog />);

    expect((await screen.findAllByText("Standalone synthesis")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Document scoped thread")).toBeNull();
    expect(screen.queryByText("Document body should not be auto-attached")).toBeNull();
    expect(screen.getByText("No document attached")).toBeTruthy();
    expect(screen.getByText("No automatic document context")).toBeTruthy();
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/ai/configs", expect.objectContaining({ credentials: "include" }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/ai/conversations", expect.objectContaining({ credentials: "include" }));
    expectNoForbiddenControls();
    expectStorageWasNotUsed();
  });

  it("streams standalone chat with null document context and real server run state", async () => {
    const fetchMock = mockFetchSequence(
      { configs: [providerConfig] },
      { conversations: [] },
      { conversation: createdConversation },
      streamResponse([
        { type: "run", run: runningRun },
        {
          type: "user_message",
          message: streamedUserMessage
        },
        { type: "assistant_delta", runId: "run-1", messageId: "message-assistant", delta: "## Method " },
        { type: "assistant_delta", runId: "run-1", messageId: "message-assistant", delta: "comparison" },
        { type: "assistant_message", message: streamedAssistantMessage },
        { type: "done", run: succeededRun, conversation: appendedConversation }
      ])
    );

    render(<AIChatDialog />);

    const composer = await screen.findByLabelText("AI chat composer");
    const prompt = within(composer).getByLabelText("Message Jixia AI");
    fireEvent.change(prompt, { target: { value: "Compare methods" } });
    fireEvent.click(within(composer).getByRole("button", { name: "Send" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(await screen.findByText("Method comparison")).toBeTruthy();
    expect(screen.getByText("Keep chat standalone")).toBeTruthy();
    expect(screen.queryByLabelText("Sources used")).toBeNull();

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/ai/conversations",
      expect.objectContaining({ method: "POST", credentials: "include" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/ai/conversations/conversation-new/messages/stream",
      expect.objectContaining({ method: "POST", credentials: "include" })
    );

    const [, createInit] = fetchMock.mock.calls[2] ?? [];
    const createBody = JSON.parse(String(createInit?.body)) as {
      readonly currentDocumentId: string | null;
      readonly selectedContextSnapshot: { readonly currentDocumentId: string | null; readonly items: readonly unknown[] };
    };
    expect(createBody.currentDocumentId).toBeNull();
    expect(createBody.selectedContextSnapshot.currentDocumentId).toBeNull();
    expect(createBody.selectedContextSnapshot.items).toEqual([]);

    const [, sendInit] = fetchMock.mock.calls[3] ?? [];
    const sendBody = JSON.parse(String(sendInit?.body)) as {
      readonly modelProfileId: string;
      readonly message: { readonly role: string; readonly content: string };
      readonly selectedContextSnapshot: { readonly currentDocumentId: string | null; readonly items: readonly unknown[] };
    };
    expect(sendBody.modelProfileId).toBe("model-profile-1");
    expect(sendBody.message).toEqual({ role: "user", content: "Compare methods" });
    expect(sendBody.selectedContextSnapshot.currentDocumentId).toBeNull();
    expect(sendBody.selectedContextSnapshot.items).toEqual([]);
    expect(JSON.stringify([createBody, sendBody])).not.toMatch(/doc-1|current_document|Document body|apiKey|encrypted|secret/i);
    expectNoForbiddenControls();
    expectStorageWasNotUsed();
  });

  it("sends the selected discovered model profile under one provider account", async () => {
    const fetchMock = mockFetchSequence(
      { configs: [providerConfigWithDiscoveredModels] },
      { conversations: [] },
      { conversation: createdConversation },
      streamResponse([
        { type: "run", run: { ...runningRun, modelProfileId: "model-profile-2" } },
        { type: "assistant_message", message: streamedAssistantMessage },
        { type: "done", run: { ...succeededRun, modelProfileId: "model-profile-2" }, conversation: appendedConversation }
      ])
    );

    render(<AIChatDialog />);

    const composer = await screen.findByLabelText("AI chat composer");
    fireEvent.change(within(composer).getByLabelText("AI model profile"), { target: { value: "model-profile-2" } });
    fireEvent.change(within(composer).getByLabelText("Message Jixia AI"), { target: { value: "Use the deeper model" } });
    fireEvent.click(within(composer).getByRole("button", { name: "Send" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    const [, sendInit] = fetchMock.mock.calls[3] ?? [];
    const sendBody = JSON.parse(String(sendInit?.body)) as { readonly modelProfileId: string };
    expect(sendBody.modelProfileId).toBe("model-profile-2");
    expect(String(sendInit?.body)).not.toMatch(/apiKey|encrypted|sk-|Authorization/i);
    expectStorageWasNotUsed();
  });

  it("offers available and unknown models but excludes server-marked unavailable profiles", async () => {
    mockFetchSequence(
      { configs: [providerConfigWithUnavailableModel] },
      { conversations: [] }
    );

    render(<AIChatDialog />);

    const selector = (await screen.findByLabelText("AI model profile")) as HTMLSelectElement;
    await waitFor(() => expect(Array.from(selector.options).map((option) => option.value)).toEqual([
      "",
      "model-profile-1",
      "model-profile-unknown"
    ]));
    expect(selector.value).toBe("model-profile-1");
    expect(screen.queryByRole("option", { name: /Unavailable model/ })).toBeNull();
  });

  it("parses CRLF-delimited stream events without dropping deltas", async () => {
    const crlfAssistantMessage: AIConversationDTO["messages"][number] = {
      ...streamedAssistantMessage,
      content: "CRLF stream",
      parts: [{ type: "markdown", content: "CRLF stream" }]
    };
    const fetchMock = mockFetchSequence(
      { configs: [providerConfig] },
      { conversations: [] },
      { conversation: createdConversation },
      streamResponse([
        { type: "run", run: runningRun },
        { type: "assistant_delta", runId: "run-1", messageId: "message-assistant", delta: "CRLF " },
        { type: "assistant_delta", runId: "run-1", messageId: "message-assistant", delta: "stream" },
        { type: "assistant_message", message: crlfAssistantMessage },
        { type: "done", run: succeededRun, conversation: { ...appendedConversation, messages: [crlfAssistantMessage] } }
      ], "\r\n")
    );

    render(<AIChatDialog />);

    const composer = await screen.findByLabelText("AI chat composer");
    fireEvent.change(within(composer).getByLabelText("Message Jixia AI"), { target: { value: "Compare methods" } });
    fireEvent.click(within(composer).getByRole("button", { name: "Send" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(await screen.findByText("CRLF stream")).toBeTruthy();
  });

  it("shows Stop only for active server runs and calls cancel by run id", async () => {
    const activeStream = openStreamResponse([
      { type: "run", run: runningRun },
      { type: "user_message", message: streamedUserMessage }
    ]);
    const cancelResponse = deferredJsonResponse({ run: cancelledRun });
    const fetchMock = mockFetchSequence(
      { configs: [providerConfig] },
      { conversations: [] },
      { conversation: createdConversation },
      activeStream.response,
      cancelResponse.promise
    );

    render(<AIChatDialog />);

    const composer = await screen.findByLabelText("AI chat composer");
    fireEvent.change(within(composer).getByLabelText("Message Jixia AI"), { target: { value: "Compare methods" } });
    fireEvent.click(within(composer).getByRole("button", { name: "Send" }));

    const stopButton = await within(composer).findByRole("button", { name: "Stop" });
    fireEvent.click(stopButton);
    activeStream.emit({ type: "assistant_delta", runId: "run-1", messageId: "message-assistant", delta: "late stale delta" });
    await Promise.resolve();
    cancelResponse.resolve();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "/api/ai/runs/run-1/cancel",
      expect.objectContaining({ method: "POST", credentials: "include" })
    );
    expect(await screen.findByText("The AI run was cancelled.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
    expect(within(composer).getByRole("button", { name: "Send" })).toBeTruthy();
    expect(screen.queryByText("late stale delta")).toBeNull();
    expectStorageWasNotUsed();
  });

  it("renders chat-native markdown without document mutation controls", async () => {
    mockFetchSequence(
      { configs: [providerConfig] },
      { conversations: [standaloneConversation] }
    );

    render(<AIChatDialog />);

    expect(await screen.findByText("Standalone answer")).toBeTruthy();
    expect(screen.getByText("Claim")).toBeTruthy();
    expect(screen.getByText("Preserved")).toBeTruthy();
    expect(screen.getByText("Explicit attachments only.")).toBeTruthy();
    expect(screen.getByText("Preserve server boundaries")).toBeTruthy();
    expect((screen.getByRole("link", { name: "Evidence" }) as HTMLAnchorElement).href).toBe("https://example.test/evidence");
    expect(screen.getByText("no writeback")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy code" })).toBeTruthy();
    expect(screen.getByLabelText("AI chat composer")).toBeTruthy();
    fireEvent.click(screen.getByText("Help"));
    expect(screen.getByText("/summarize")).toBeTruthy();
    expect(screen.getByText("@source")).toBeTruthy();
    expectNoForbiddenControls();
  });
});

type MockResponseInput =
  | AIProviderConfigListResponse
  | ListAIConversationsResponse
  | CreateAIConversationResponse
  | CancelAIConversationRunResponse
  | Promise<Response>
  | Response;

function mockFetchSequence(...responses: readonly MockResponseInput[]) {
  const fetchMock = vi.fn<typeof fetch>();

  for (const response of responses) {
    if (response instanceof Response) {
      fetchMock.mockResolvedValueOnce(response);
      continue;
    }

    if (isResponsePromise(response)) {
      fetchMock.mockImplementationOnce(() => response);
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

function isResponsePromise(response: MockResponseInput): response is Promise<Response> {
  return typeof response === "object" && response !== null && "then" in response;
}

function deferredJsonResponse(body: CancelAIConversationRunResponse): {
  readonly promise: Promise<Response>;
  readonly resolve: () => void;
} {
  let resolvePromise: (response: Response) => void = () => undefined;
  const promise = new Promise<Response>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve() {
      resolvePromise(new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }));
    }
  };
}

function streamResponse(events: readonly AIConversationRunStreamEvent[], lineEnding = "\n"): Response {
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}${lineEnding}${lineEnding}`).join(""), {
    status: 200,
    headers: { "Content-Type": "text/event-stream" }
  });
}

function openStreamResponse(events: readonly AIConversationRunStreamEvent[]): {
  readonly close: () => void;
  readonly emit: (event: AIConversationRunStreamEvent) => void;
  readonly response: Response;
} {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(streamController) {
        controller = streamController;
        streamController.enqueue(encoder.encode(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")));
      }
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" } }
  );

  return {
    response,
    emit(event) {
      controller?.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    },
    close() {
      controller?.close();
    }
  };
}

function expectNoForbiddenControls(): void {
  expect(screen.queryByRole("button", { name: /apply|insert|rewrite|merge|automerge|replace/i })).toBeNull();
  expect(screen.queryByRole("link", { name: /apply|insert|rewrite|merge|automerge|replace/i })).toBeNull();
  expect(screen.queryByRole("menuitem", { name: /apply|insert|rewrite|merge|automerge|replace/i })).toBeNull();
}

function expectStorageWasNotUsed(): void {
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
}
