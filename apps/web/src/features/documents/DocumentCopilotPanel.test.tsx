import type {
  AIConversationDTO,
  AIConversationRunStreamEvent,
  AIProviderConfigListResponse,
  AIProviderConfigView,
  CreateAIConversationResponse,
  DocumentDTO,
  EditorSnapshot,
  ListAIConversationsResponse
} from "@jixia/shared";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DocumentCopilotPanel } from "./DocumentCopilotPanel";

const providerConfig: AIProviderConfigView = {
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

const documentRecord: DocumentDTO = {
  id: "doc-1",
  type: "project",
  status: "active",
  title: "Project synthesis",
  ownerUserId: null,
  projectId: "project-1",
  currentRevisionId: "revision-2",
  revisionNumber: 2,
  createdAt: "2026-06-16T10:00:00.000Z",
  updatedAt: "2026-06-16T10:10:00.000Z"
};

const baseSnapshot: EditorSnapshot = {
  editorSchemaVersion: 1,
  blocks: [
    {
      id: "paragraph-1",
      type: "paragraph",
      text: "Initial finding"
    }
  ]
};

const createdConversation: AIConversationDTO = {
  id: "conversation-doc-1",
  ownerUserId: "user-1",
  title: "Project synthesis: Summarize this document",
  currentDocumentId: "doc-1",
  selectedContextSnapshot: {
    currentDocumentId: "doc-1",
    items: [],
    capturedAt: "2026-06-16T10:00:00.000Z"
  },
  contextAttachments: [],
  messages: [],
  createdAt: "2026-06-16T10:00:00.000Z",
  updatedAt: "2026-06-16T10:00:00.000Z"
};

const streamedUserMessage = {
  id: "message-user",
  role: "user" as const,
  content: "Summarize this document",
  createdAt: "2026-06-16T10:02:00.000Z",
  runId: "run-1",
  runStatus: "succeeded" as const,
  parts: [{ type: "text" as const, content: "Summarize this document" }],
  sources: [],
  runSteps: [],
  actions: []
};

const streamedAssistantMessage = {
  id: "message-assistant",
  role: "assistant" as const,
  content: "## Summary\n\nInitial finding remains advisory.",
  createdAt: "2026-06-16T10:02:10.000Z",
  runId: "run-1",
  runStatus: "succeeded" as const,
  sources: [
    {
      id: "current_document-doc-1-0",
      label: "Current document",
      sourceType: "current_document" as const,
      title: "Project synthesis",
      documentId: "doc-1",
      documentType: "project" as const,
      projectId: "project-1",
      revisionNumber: 2,
      selectedBlockIds: [],
      selectedBlockCount: 0,
      capturedAt: "2026-06-16T10:02:00.000Z"
    }
  ],
  parts: [
    { type: "markdown" as const, content: "## Summary\n\nInitial finding remains advisory." },
    {
      type: "source_list" as const,
      sources: [
        {
          id: "current_document-doc-1-0",
          label: "Current document",
          sourceType: "current_document" as const,
          title: "Project synthesis",
          documentId: "doc-1",
          documentType: "project" as const,
          projectId: "project-1",
          revisionNumber: 2,
          selectedBlockIds: [],
          selectedBlockCount: 0,
          capturedAt: "2026-06-16T10:02:00.000Z"
        }
      ]
    }
  ],
  runSteps: [],
  actions: []
};

const appendedConversation: AIConversationDTO = {
  ...createdConversation,
  selectedContextSnapshot: {
    currentDocumentId: "doc-1",
    items: [
      {
        sourceType: "current_document",
        documentId: "doc-1",
        documentType: "project",
        projectId: "project-1",
        title: "Project synthesis",
        revisionNumber: 2,
        selectedBlockIds: [],
        content: "Bounded document text:\nInitial finding",
        capturedAt: "2026-06-16T10:02:00.000Z"
      }
    ],
    capturedAt: "2026-06-16T10:02:00.000Z"
  },
  contextAttachments: [
    {
      id: "current_document-doc-1-0",
      sourceType: "current_document",
      title: "Project synthesis",
      documentId: "doc-1",
      documentType: "project",
      projectId: "project-1",
      revisionNumber: 2,
      selectedBlockIds: [],
      selectedBlockCount: 0,
      capturedAt: "2026-06-16T10:02:00.000Z"
    }
  ],
  messages: [streamedUserMessage, streamedAssistantMessage],
  updatedAt: "2026-06-16T10:02:10.000Z"
};

const runningRun = {
  id: "run-1",
  status: "running" as const,
  providerConfigId: "config-1",
  errorMessage: null,
  errorCategory: null,
  createdAt: "2026-06-16T10:02:00.000Z",
  startedAt: "2026-06-16T10:02:01.000Z",
  completedAt: null
};

const succeededRun = {
  ...runningRun,
  status: "succeeded" as const,
  completedAt: "2026-06-16T10:02:10.000Z"
};

describe("DocumentCopilotPanel", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("shows visible current-document context and provider setup state", async () => {
    const openSettings = vi.fn();
    const fetchMock = mockFetchSequence(
      { configs: [] },
      { conversations: [] }
    );

    render(<DocumentCopilotPanel {...panelProps()} onOpenSettings={openSettings} />);

    expect(await screen.findByText("Current document snapshot")).toBeTruthy();
    expect(screen.getByText("Project synthesis")).toBeTruthy();
    expect(screen.getByText("doc-1")).toBeTruthy();
    expect(screen.getByText("2 / 2")).toBeTruthy();
    expect(screen.getByText("Not implemented; sending current document only")).toBeTruthy();
    expect(screen.getByText("No usable provider config with a saved key is available for this document copilot. Provider keys stay server-owned; add one in AI settings before sending.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open AI provider settings" }));

    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/ai/configs", expect.objectContaining({ credentials: "include" }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/ai/conversations?currentDocumentId=doc-1", expect.objectContaining({ credentials: "include" }));
    expectStorageWasNotUsed();
  });

  it("streams a document-scoped advisory response with explicit bounded context", async () => {
    const exportSnapshot = vi.fn(() => baseSnapshot);
    const fetchMock = mockFetchSequence(
      { configs: [providerConfig] },
      { conversations: [] },
      { conversation: createdConversation },
      streamResponse([
        { type: "run", run: runningRun },
        { type: "user_message", message: streamedUserMessage },
        { type: "assistant_delta", runId: "run-1", messageId: "message-assistant", delta: "## Summary" },
        { type: "assistant_delta", runId: "run-1", messageId: "message-assistant", delta: "\n\nInitial finding remains advisory." },
        { type: "assistant_message", message: streamedAssistantMessage },
        { type: "done", run: succeededRun, conversation: appendedConversation }
      ])
    );

    render(<DocumentCopilotPanel {...panelProps({ exportSnapshot })} />);

    const composer = await screen.findByLabelText("Document copilot composer");
    fireEvent.change(within(composer).getByLabelText("Ask document copilot"), {
      target: { value: "Summarize this document" }
    });
    fireEvent.click(within(composer).getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Summary")).toBeTruthy();
    expect(screen.getByText("Initial finding remains advisory.")).toBeTruthy();
    expect(screen.getByLabelText("Sources used")).toBeTruthy();
    expect(exportSnapshot).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "/api/ai/configs",
      "/api/ai/conversations?currentDocumentId=doc-1",
      "/api/ai/conversations",
      "/api/ai/conversations/conversation-doc-1/messages/stream"
    ]);

    const [, createInit] = fetchMock.mock.calls[2] ?? [];
    const createBody = JSON.parse(String(createInit?.body)) as CreateConversationBody;
    expect(createBody.currentDocumentId).toBe("doc-1");
    expect(createBody.selectedContextSnapshot.currentDocumentId).toBe("doc-1");
    expect(createBody.selectedContextSnapshot.items).toHaveLength(1);
    expect(createBody.selectedContextSnapshot.items[0]).toEqual(expect.objectContaining({
      sourceType: "current_document",
      documentId: "doc-1",
      documentType: "project",
      projectId: "project-1",
      revisionNumber: 2,
      selectedBlockIds: []
    }));
    expect(createBody.selectedContextSnapshot.items[0]?.content).toContain("Initial finding");
    expect(createBody.selectedContextSnapshot.items[0]?.content).toContain("Selected blocks: not implemented; current-document context only.");

    const [, sendInit] = fetchMock.mock.calls[3] ?? [];
    const sendBody = JSON.parse(String(sendInit?.body)) as SendMessageBody;
    expect(sendBody.providerConfigId).toBe("config-1");
    expect(sendBody.message).toEqual({ role: "user", content: "Summarize this document" });
    expect(sendBody.selectedContextSnapshot.items[0]?.content).toContain("Initial finding");
    expect(JSON.stringify([createBody, sendBody])).not.toMatch(/apiKey|encrypted|signedUrl|storageKey|signature|authorization|cookie/i);
    expect(fetchMock.mock.calls.every(([url]) => !String(url).includes("/draft") && !String(url).includes("/revisions"))).toBe(true);
    expectStorageWasNotUsed();
  });
});

function panelProps(overrides: Partial<{
  readonly document: DocumentDTO;
  readonly exportSnapshot: () => EditorSnapshot;
  readonly snapshot: EditorSnapshot;
}> = {}) {
  return {
    baseRevision: 2,
    document: overrides.document ?? documentRecord,
    exportSnapshot: overrides.exportSnapshot ?? (() => overrides.snapshot ?? baseSnapshot),
    readOnly: false,
    snapshot: overrides.snapshot ?? baseSnapshot,
    title: "Project synthesis"
  };
}

type MockResponseInput =
  | AIProviderConfigListResponse
  | ListAIConversationsResponse
  | CreateAIConversationResponse
  | Response;

function mockFetchSequence(...responses: readonly MockResponseInput[]) {
  const fetchMock = vi.fn<typeof fetch>();

  for (const response of responses) {
    if (response instanceof Response) {
      fetchMock.mockResolvedValueOnce(response);
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

function streamResponse(events: readonly AIConversationRunStreamEvent[]): Response {
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), {
    status: 200,
    headers: { "Content-Type": "text/event-stream" }
  });
}

type CreateConversationBody = {
  readonly currentDocumentId: string | null;
  readonly selectedContextSnapshot: {
    readonly currentDocumentId: string | null;
    readonly items: readonly {
      readonly sourceType: string;
      readonly documentId: string | null;
      readonly documentType: string | null;
      readonly projectId: string | null;
      readonly revisionNumber: number | null;
      readonly selectedBlockIds: readonly string[];
      readonly content: string;
    }[];
  };
};

type SendMessageBody = {
  readonly providerConfigId: string;
  readonly message: { readonly role: string; readonly content: string };
  readonly selectedContextSnapshot: CreateConversationBody["selectedContextSnapshot"];
};

function expectStorageWasNotUsed(): void {
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
}
