import type {
  AIConversationContextSnapshot,
  AIConversationMessageDTO,
  SpaceRole
} from "@jixia/shared";
import { beforeEach, describe, expect, it } from "vitest";

import {
  AIConversationError,
  createAIConversationService,
  type AIConversationActor,
  type AIConversationRecord,
  type AIConversationRepository,
  type AIConversationService,
  type AIModelProfileExecutionRecord,
  type AIProviderConfigExecutionRecord
} from "./ai-conversation.service.js";
import { AIProviderExecutionError } from "./ai-provider-adapter.js";
import type { AIProviderAdapter, AIProviderRunInput, AIProviderStreamEvent } from "./ai-provider-adapter.js";
import type { AIUsageService } from "./ai-usage.service.js";
import type { AIKeyCipher } from "./crypto.js";

const createdAt = new Date("2026-06-15T12:00:00.000Z");
const appendedAt = new Date("2026-06-15T12:05:00.000Z");

class InMemoryAIConversationRepository implements AIConversationRepository {
  readonly conversations = new Map<string, AIConversationRecord>();
  readonly providerConfigs = new Map<string, AIProviderConfigExecutionRecord>();
  readonly modelProfiles = new Map<string, AIModelProfileExecutionRecord>();
  private nextId = 1;

  async listConversations(input: {
    readonly ownerUserId: string;
    readonly currentDocumentId?: string | null;
  }): Promise<readonly AIConversationRecord[]> {
    return Array.from(this.conversations.values()).filter(
      (conversation) =>
        conversation.ownerUserId === input.ownerUserId &&
        (input.currentDocumentId === undefined || conversation.currentDocumentId === input.currentDocumentId)
    );
  }

  async findConversationById(conversationId: string): Promise<AIConversationRecord | null> {
    return this.conversations.get(conversationId) ?? null;
  }

  async findModelProfileById(modelProfileId: string): Promise<AIModelProfileExecutionRecord | null> {
    return this.modelProfiles.get(modelProfileId) ?? null;
  }

  async createConversation(input: {
    readonly ownerUserId: string;
    readonly title: string;
    readonly currentDocumentId: string | null;
    readonly selectedContextSnapshot: AIConversationContextSnapshot;
    readonly messages: readonly AIConversationMessageDTO[];
  }): Promise<AIConversationRecord> {
    const conversation: AIConversationRecord = {
      id: `conversation-${this.nextId++}`,
      ownerUserId: input.ownerUserId,
      title: input.title,
      currentDocumentId: input.currentDocumentId,
      selectedContextSnapshot: input.selectedContextSnapshot,
      messages: input.messages,
      createdAt,
      updatedAt: createdAt
    };
    this.conversations.set(conversation.id, conversation);
    return conversation;
  }

  async appendMessages(input: {
    readonly conversationId: string;
    readonly ownerUserId: string;
    readonly selectedContextSnapshot: AIConversationContextSnapshot;
    readonly messages: readonly AIConversationMessageDTO[];
  }): Promise<AIConversationRecord | null> {
    const conversation = this.conversations.get(input.conversationId);

    if (!conversation || conversation.ownerUserId !== input.ownerUserId) {
      return null;
    }

    const updated: AIConversationRecord = {
      ...conversation,
      selectedContextSnapshot: input.selectedContextSnapshot,
      messages: [...conversation.messages, ...input.messages],
      updatedAt: appendedAt
    };
    this.conversations.set(updated.id, updated);
    return updated;
  }

  async deleteConversation(input: { readonly conversationId: string; readonly ownerUserId: string }): Promise<boolean> {
    const conversation = this.conversations.get(input.conversationId);

    if (!conversation || conversation.ownerUserId !== input.ownerUserId) {
      return false;
    }

    this.conversations.delete(input.conversationId);
    return true;
  }
}

function actor(userId: string, spaceRole: SpaceRole = "SpaceMember"): AIConversationActor {
  return { userId, spaceId: "space-1", spaceRole };
}

function snapshot(documentId = "doc-1", contextDocumentId = documentId): AIConversationContextSnapshot {
  return {
    currentDocumentId: documentId,
    capturedAt: "2026-06-15T12:00:00.000Z",
    items: [
      {
        sourceType: "current_document",
        documentId: contextDocumentId,
        documentType: "notebook",
        projectId: "project-1",
        title: "Notebook",
        revisionNumber: 2,
        selectedBlockIds: ["block-1"],
        content: "private selected context body",
        capturedAt: "2026-06-15T12:00:00.000Z"
      }
    ]
  };
}

function standaloneSnapshot(): AIConversationContextSnapshot {
  return {
    currentDocumentId: null,
    capturedAt: "2026-06-15T12:00:00.000Z",
    items: []
  };
}

async function expectAIConversationError(promise: Promise<unknown>, statusCode: number): Promise<void> {
  await expect(promise).rejects.toSatisfy((error: unknown) => {
    expect(error).toBeInstanceOf(AIConversationError);
    expect((error as AIConversationError).statusCode).toBe(statusCode);
    return true;
  });
}

function providerConfig(ownerUserId = "owner-user"): AIProviderConfigExecutionRecord {
  return {
    id: "config-1",
    ownerUserId,
    provider: "openai",
    baseURL: "https://provider.example/v1",
    encryptedApiKey: "encrypted:sk-server-key"
  };
}

function modelProfile(
  providerConfigRecord: AIProviderConfigExecutionRecord = providerConfig(),
  overrides: Partial<Omit<AIModelProfileExecutionRecord, "providerConfig">> = {}
): AIModelProfileExecutionRecord {
  return {
    id: overrides.id ?? "model-profile-1",
    providerConfigId: overrides.providerConfigId ?? providerConfigRecord.id,
    model: overrides.model ?? "gpt-test",
    displayName: overrides.displayName ?? "GPT test",
    temperature: overrides.temperature ?? 0.2,
    maxTokens: overrides.maxTokens ?? 4096,
    enabled: overrides.enabled ?? true,
    availability: overrides.availability ?? "unknown",
    providerConfig: providerConfigRecord
  };
}

function createSequentialIds(): () => string {
  let nextId = 1;
  return () => `generated-${nextId++}`;
}

function createSequentialNow(): () => Date {
  const timestamps = [
    "2026-06-15T12:05:00.000Z",
    "2026-06-15T12:05:01.000Z",
    "2026-06-15T12:05:02.000Z",
    "2026-06-15T12:05:03.000Z"
  ];
  let nextTimestamp = 0;
  return () => new Date(timestamps[nextTimestamp++] ?? "2026-06-15T12:05:03.000Z");
}

function delayedStreamEvents(): AsyncIterable<AIProviderStreamEvent> {
  return {
    async *[Symbol.asyncIterator]() {
      await new Promise((resolve) => setTimeout(resolve, 5));
      yield { type: "delta", delta: "too late" };
      yield { type: "final", assistantText: "too late" };
    }
  };
}

class RecordingProviderAdapter implements AIProviderAdapter {
  readonly inputs: AIProviderRunInput[] = [];
  failWith: Error | null = null;
  assistantText = "Provider generated assistant response";
  streamEvents: Iterable<AIProviderStreamEvent> | AsyncIterable<AIProviderStreamEvent> = [
    { type: "delta", delta: "Provider generated " },
    { type: "delta", delta: "assistant response" },
    {
      type: "final",
      assistantText: "Provider generated assistant response",
      usage: {
        promptTokens: 13,
        completionTokens: 21,
        estimatedCostMicros: 987
      }
    }
  ];

  async verifyConnection(input: Parameters<AIProviderAdapter["verifyConnection"]>[0]) {
    return {
      providerKind: input.config.providerKind ?? "openai_compatible" as const,
      endpointDisplay: input.config.baseURL,
      transport: "reachable" as const,
      authentication: "verified" as const,
      errorCode: null
    };
  }

  async discoverModels(input: Parameters<AIProviderAdapter["discoverModels"]>[0]) {
    return {
      providerKind: input.config.providerKind ?? "openai_compatible" as const,
      endpointDisplay: input.config.baseURL,
      transport: "reachable" as const,
      authentication: "verified" as const,
      discovery: "empty" as const,
      errorCode: null,
      models: []
    };
  }

  async listModels(): Promise<[]> {
    return [];
  }

  async runConversation(input: AIProviderRunInput) {
    this.inputs.push(input);

    if (this.failWith) {
      throw this.failWith;
    }

    return {
      assistantText: this.assistantText,
      usage: {
        promptTokens: 13,
        completionTokens: 21,
        estimatedCostMicros: 987
      }
    };
  }

  async *streamConversation(input: AIProviderRunInput) {
    this.inputs.push(input);

    if (this.failWith) {
      throw this.failWith;
    }

    for await (const event of this.streamEvents) {
      if (input.signal?.aborted) {
        throw new AIProviderExecutionError("cancelled");
      }

      yield event;
    }
  }
}

class RecordingUsageService implements Pick<AIUsageService, "recordUsage"> {
  readonly inputs: Parameters<AIUsageService["recordUsage"]>[0][] = [];

  async recordUsage(input: Parameters<AIUsageService["recordUsage"]>[0]): Promise<{ readonly ok: true }> {
    this.inputs.push(input);
    return { ok: true };
  }
}

const cipher: AIKeyCipher = {
  encrypt: (plaintext) => `encrypted:${plaintext}`,
  decrypt: (ciphertext) => ciphertext.replace(/^encrypted:/, "")
};

describe("AI conversation service", () => {
  let repository: InMemoryAIConversationRepository;
  let providerAdapter: RecordingProviderAdapter;
  let readableDocumentIds: Set<string>;
  let service: AIConversationService;
  let usageService: RecordingUsageService;

  beforeEach(() => {
    repository = new InMemoryAIConversationRepository();
    providerAdapter = new RecordingProviderAdapter();
    readableDocumentIds = new Set(["doc-1", "doc-2"]);
    usageService = new RecordingUsageService();
    service = createAIConversationService(
      repository,
      {
        canReadDocument: async (_userId, documentId) => readableDocumentIds.has(documentId)
      },
      {
        now: createSequentialNow(),
        createId: createSequentialIds(),
        providerAdapter,
        cipher,
        usageService
      }
    );
    const defaultProviderConfig = providerConfig();
    repository.providerConfigs.set("config-1", defaultProviderConfig);
    repository.modelProfiles.set("model-profile-1", modelProfile(defaultProviderConfig));
  });

  it("creates private conversations only after every selected context document is readable", async () => {
    const response = await service.createConversation({
      actor: actor("owner-user"),
      title: "  Context question  ",
      currentDocumentId: "doc-1",
      selectedContextSnapshot: snapshot("doc-1", "doc-2")
    });

    expect(response.conversation).toMatchObject({
      id: "conversation-1",
      ownerUserId: "owner-user",
      title: "Context question",
      currentDocumentId: "doc-1",
      messages: []
    });
    expect(response.conversation.contextAttachments).toEqual([
      expect.objectContaining({
        id: "current_document-doc-2-0",
        sourceType: "current_document",
        title: "Notebook",
        documentId: "doc-2",
        selectedBlockCount: 1
      })
    ]);
    expect(response.conversation.selectedContextSnapshot.items[0]?.content).toBe("private selected context body");

    readableDocumentIds.delete("doc-2");
    await expectAIConversationError(
      service.createConversation({
        actor: actor("owner-user"),
        title: "No access",
        currentDocumentId: "doc-1",
        selectedContextSnapshot: snapshot("doc-1", "doc-2")
      }),
      403
    );
  });

  it("rejects context snapshots whose current document does not match the conversation document", async () => {
    await expectAIConversationError(
      service.createConversation({
        actor: actor("owner-user"),
        title: "Mismatch",
        currentDocumentId: "doc-1",
        selectedContextSnapshot: snapshot("doc-2")
      }),
      400
    );
  });

  it("creates and runs standalone conversations without document permission checks or context attachments", async () => {
    readableDocumentIds.clear();
    const created = await service.createConversation({
      actor: actor("owner-user"),
      title: " Standalone chat ",
      currentDocumentId: null,
      selectedContextSnapshot: standaloneSnapshot()
    });

    expect(created.conversation).toMatchObject({
      title: "Standalone chat",
      currentDocumentId: null,
      contextAttachments: [],
      selectedContextSnapshot: { currentDocumentId: null, items: [] }
    });

    const appended = await service.appendMessage({
      actor: actor("owner-user"),
      conversationId: created.conversation.id,
      modelProfileId: "model-profile-1",
      message: { role: "user", content: "  compare methods  " },
      selectedContextSnapshot: standaloneSnapshot()
    });

    expect(appended.conversation.currentDocumentId).toBeNull();
    expect(appended.conversation.contextAttachments).toEqual([]);
    expect(appended.conversation.messages).toMatchObject([
      {
        role: "user",
        content: "compare methods",
        parts: [
          { type: "text", content: "compare methods" },
          expect.objectContaining({ type: "run_step" })
        ]
      },
      {
        role: "assistant",
        content: "Provider generated assistant response",
        parts: [
          { type: "markdown", content: "Provider generated assistant response" },
          expect.objectContaining({ type: "run_step" })
        ],
        sources: []
      }
    ]);
    expect(providerAdapter.inputs[0]?.selectedContextSnapshot).toEqual(standaloneSnapshot());
    expect(appended.conversation.messages[1]?.parts).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "source_list" })])
    );
  });

  it("rejects unavailable model profiles for both buffered and streaming runs", async () => {
    repository.modelProfiles.set("model-profile-1", modelProfile(providerConfig(), { availability: "unavailable" }));
    const created = await service.createConversation({
      actor: actor("owner-user"),
      title: "Unavailable model",
      currentDocumentId: null,
      selectedContextSnapshot: standaloneSnapshot()
    });
    const runInput = {
      actor: actor("owner-user"),
      conversationId: created.conversation.id,
      modelProfileId: "model-profile-1",
      message: { role: "user" as const, content: "do not run" },
      selectedContextSnapshot: standaloneSnapshot()
    };

    await expectAIConversationError(service.appendMessage(runInput), 404);
    const iterator = service.streamMessage(runInput)[Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(AIConversationError);
      expect((error as AIConversationError).statusCode).toBe(404);
      return true;
    });
    expect(providerAdapter.inputs).toEqual([]);
  });

  it("rejects standalone conversations with document context until explicit attachment APIs exist", async () => {
    await expectAIConversationError(
      service.createConversation({
        actor: actor("owner-user"),
        title: "Forged standalone context",
        currentDocumentId: null,
        selectedContextSnapshot: {
          ...snapshot("doc-1"),
          currentDocumentId: null
        }
      }),
      400
    );

    const created = await service.createConversation({
      actor: actor("owner-user"),
      title: "Standalone chat",
      currentDocumentId: null,
      selectedContextSnapshot: standaloneSnapshot()
    });

    await expectAIConversationError(
      service.appendMessage({
        actor: actor("owner-user"),
        conversationId: created.conversation.id,
        modelProfileId: "model-profile-1",
        message: { role: "user", content: "try context" },
        selectedContextSnapshot: {
          ...snapshot("doc-1"),
          currentDocumentId: null
        }
      }),
      400
    );
  });

  it("restricts list get append and delete operations to the owner", async () => {
    const created = await service.createConversation({
      actor: actor("owner-user"),
      title: "Private conversation",
      currentDocumentId: "doc-1",
      selectedContextSnapshot: snapshot()
    });

    await expect(service.listConversations(actor("other-user"))).resolves.toEqual({ conversations: [] });
    await expectAIConversationError(service.getConversation(actor("other-user"), created.conversation.id), 404);
    await expectAIConversationError(
      service.appendMessage({
        actor: actor("other-user"),
        conversationId: created.conversation.id,
        modelProfileId: "model-profile-1",
        message: { role: "user", content: "try to append" },
        selectedContextSnapshot: snapshot()
      }),
      404
    );
    await expectAIConversationError(
      service.deleteConversation({ actor: actor("other-user"), conversationId: created.conversation.id }),
      404
    );
    expect(repository.conversations.has(created.conversation.id)).toBe(true);
  });

  it("lists only conversations for the requested readable current document", async () => {
    await service.createConversation({
      actor: actor("owner-user"),
      title: "Doc 1 conversation",
      currentDocumentId: "doc-1",
      selectedContextSnapshot: snapshot("doc-1")
    });
    await service.createConversation({
      actor: actor("owner-user"),
      title: "Doc 2 conversation",
      currentDocumentId: "doc-2",
      selectedContextSnapshot: snapshot("doc-2")
    });

    await expect(service.listConversationsForDocument(actor("owner-user"), "doc-1")).resolves.toMatchObject({
      conversations: [{ title: "Doc 1 conversation", currentDocumentId: "doc-1" }]
    });

    readableDocumentIds.delete("doc-2");
    await expectAIConversationError(service.listConversationsForDocument(actor("owner-user"), "doc-2"), 403);
  });

  it("lists only standalone conversations from the default conversation list", async () => {
    await service.createConversation({
      actor: actor("owner-user"),
      title: "Doc conversation",
      currentDocumentId: "doc-1",
      selectedContextSnapshot: snapshot("doc-1")
    });
    await service.createConversation({
      actor: actor("owner-user"),
      title: "Standalone conversation",
      currentDocumentId: null,
      selectedContextSnapshot: standaloneSnapshot()
    });

    await expect(service.listConversations(actor("owner-user"))).resolves.toMatchObject({
      conversations: [{ title: "Standalone conversation", currentDocumentId: null, selectedContextSnapshot: { items: [] } }]
    });
  });

  it("keeps historical private conversation reads available to the owner after access loss", async () => {
    const created = await service.createConversation({
      actor: actor("owner-user"),
      title: "Context conversation",
      currentDocumentId: "doc-1",
      selectedContextSnapshot: snapshot("doc-1", "doc-2")
    });

    readableDocumentIds.delete("doc-2");

    await expect(service.getConversation(actor("owner-user"), created.conversation.id)).resolves.toMatchObject({
      conversation: {
        id: created.conversation.id,
        selectedContextSnapshot: { items: [expect.objectContaining({ content: "private selected context body" })] }
      }
    });
  });

  it("requires the selected provider config to belong to the conversation owner", async () => {
    const created = await service.createConversation({
      actor: actor("owner-user"),
      title: "Private conversation",
      currentDocumentId: "doc-1",
      selectedContextSnapshot: snapshot()
    });
    const otherProviderConfig = { ...providerConfig("other-user"), id: "other-config" };
    repository.providerConfigs.set("other-config", otherProviderConfig);
    repository.modelProfiles.set(
      "other-model-profile",
      modelProfile(otherProviderConfig, { id: "other-model-profile", providerConfigId: "other-config" })
    );

    await expectAIConversationError(
      service.appendMessage({
        actor: actor("owner-user"),
        conversationId: created.conversation.id,
        modelProfileId: "other-model-profile",
        message: { role: "user", content: "question" },
        selectedContextSnapshot: snapshot()
      }),
      404
    );
  });

  it("runs the provider server-side and persists user plus assistant turns after re-checking permissions", async () => {
    const created = await service.createConversation({
      actor: actor("owner-user"),
      title: "Private conversation",
      currentDocumentId: "doc-1",
      selectedContextSnapshot: snapshot()
    });

    const appended = await service.appendMessage({
      actor: actor("owner-user"),
      conversationId: created.conversation.id,
      modelProfileId: "model-profile-1",
      message: { role: "user", content: "  summarize this  " },
      selectedContextSnapshot: snapshot("doc-1", "doc-2")
    });

    expect(appended.conversation.messages).toMatchObject([
      {
        id: "generated-2",
        role: "user",
        content: "summarize this",
        createdAt: "2026-06-15T12:05:01.000Z",
        runId: "generated-1",
        runStatus: "succeeded",
        parts: [
          { type: "text", content: "summarize this" },
          expect.objectContaining({ type: "run_step" })
        ]
      },
      {
        id: "generated-3",
        role: "assistant",
        content: "Provider generated assistant response",
        createdAt: "2026-06-15T12:05:02.000Z",
        runId: "generated-1",
        runStatus: "succeeded",
        parts: [
          { type: "markdown", content: "Provider generated assistant response" },
          expect.objectContaining({ type: "source_list" }),
          expect.objectContaining({ type: "run_step" })
        ],
        sources: [expect.objectContaining({ documentId: "doc-2", label: "Current document" })]
      }
    ]);
    expect(appended.conversation.messages[0]?.actions).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "copy", enabled: true })])
    );
    expect(JSON.stringify(appended.conversation.messages)).not.toMatch(/approval_preview|Document writeback|approval_action/i);
    expect(appended.run).toMatchObject({
      id: "generated-1",
      status: "succeeded",
      providerConfigId: "config-1",
      modelProfileId: "model-profile-1",
      errorMessage: null,
      createdAt: "2026-06-15T12:05:00.000Z",
      startedAt: "2026-06-15T12:05:01.000Z",
      completedAt: "2026-06-15T12:05:02.000Z",
      usage: { promptTokens: 13, completionTokens: 21, totalTokens: 34, estimatedCostMicros: 987 }
    });
    expect(appended.conversation.selectedContextSnapshot.items[0]?.documentId).toBe("doc-2");
    expect(repository.conversations.get(created.conversation.id)?.messages[1]).toMatchObject({
      role: "assistant",
      sources: [expect.objectContaining({ documentId: "doc-2", selectedBlockIds: ["block-1"] })]
    });
    expect(providerAdapter.inputs).toHaveLength(1);
    expect(providerAdapter.inputs[0]?.config.apiKey).toBe("sk-server-key");
    expect(providerAdapter.inputs[0]?.selectedContextSnapshot.items[0]?.content).toBe("private selected context body");
    expect(usageService.inputs).toEqual([
      expect.objectContaining({
        provider: "openai",
        model: "gpt-test",
        promptTokens: 13,
        completionTokens: 21,
        estimatedCostMicros: 987,
        periodStart: new Date("2026-06-15T00:00:00.000Z"),
        periodEnd: new Date("2026-06-16T00:00:00.000Z")
      })
    ]);
    expect(JSON.stringify(appended)).not.toMatch(/sk-server-key|encrypted:sk-server-key|rawProvider|Authorization/i);
    expect(JSON.stringify(usageService.inputs)).not.toMatch(/summarize this|private selected context body|assistant response|apiKey|encrypted|headers/i);

    readableDocumentIds.delete("doc-2");
    await expectAIConversationError(
      service.appendMessage({
        actor: actor("owner-user"),
        conversationId: created.conversation.id,
        modelProfileId: "model-profile-1",
        message: { role: "user", content: "summarize again" },
        selectedContextSnapshot: snapshot("doc-1", "doc-2")
      }),
      403
    );
  });

  it("streams run events, assistant deltas, usage, and final persisted conversation", async () => {
    const created = await service.createConversation({
      actor: actor("owner-user"),
      title: "Streaming conversation",
      currentDocumentId: null,
      selectedContextSnapshot: standaloneSnapshot()
    });

    const events = [];
    for await (const event of service.streamMessage({
      actor: actor("owner-user"),
      conversationId: created.conversation.id,
      modelProfileId: "model-profile-1",
      message: { role: "user", content: "stream this" },
      selectedContextSnapshot: standaloneSnapshot()
    })) {
      events.push(event);
    }

    expect(events).toMatchObject([
      { type: "run", run: { id: "generated-1", status: "running", providerConfigId: "config-1", modelProfileId: "model-profile-1" } },
      { type: "user_message", message: { id: "generated-2", role: "user", runStatus: "running" } },
      { type: "assistant_delta", runId: "generated-1", messageId: "generated-3", delta: "Provider generated " },
      { type: "assistant_delta", runId: "generated-1", messageId: "generated-3", delta: "assistant response" },
      {
        type: "usage",
        runId: "generated-1",
        usage: { promptTokens: 13, completionTokens: 21, totalTokens: 34, estimatedCostMicros: 987 }
      },
      { type: "assistant_message", message: { id: "generated-3", role: "assistant", runStatus: "succeeded" } },
      { type: "done", run: { id: "generated-1", status: "succeeded" } }
    ]);
    expect(events[events.length - 1]).toMatchObject({
      type: "done",
      conversation: {
        messages: [
          expect.objectContaining({ role: "user", content: "stream this", runStatus: "succeeded" }),
          expect.objectContaining({ role: "assistant", content: "Provider generated assistant response" })
        ]
      }
    });
    expect(JSON.stringify(events)).not.toMatch(/sk-server-key|encrypted|Authorization|headers/i);
  });

  it("cancels an active run through the server-owned abort controller", async () => {
    providerAdapter.streamEvents = delayedStreamEvents();
    const created = await service.createConversation({
      actor: actor("owner-user"),
      title: "Cancel conversation",
      currentDocumentId: null,
      selectedContextSnapshot: standaloneSnapshot()
    });
    const iterator = service.streamMessage({
      actor: actor("owner-user"),
      conversationId: created.conversation.id,
      modelProfileId: "model-profile-1",
      message: { role: "user", content: "cancel this" },
      selectedContextSnapshot: standaloneSnapshot()
    })[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toMatchObject({ value: { type: "run", run: { id: "generated-1" } } });

    const cancelled = await service.cancelRun({ actor: actor("owner-user"), runId: "generated-1" });
    expect(cancelled.run).toMatchObject({ status: "cancelled", errorCategory: "cancelled" });

    const remainingEvents = [];
    for (let next = await iterator.next(); !next.done; next = await iterator.next()) {
      remainingEvents.push(next.value);
    }

    expect(remainingEvents).toEqual([
      expect.objectContaining({ type: "user_message" }),
      expect.objectContaining({ type: "error", category: "cancelled", run: expect.objectContaining({ status: "cancelled" }) }),
      expect.objectContaining({ type: "done", run: expect.objectContaining({ status: "cancelled" }) })
    ]);
    expect(remainingEvents[remainingEvents.length - 1]).toMatchObject({
      conversation: {
        messages: [expect.objectContaining({ role: "user", runStatus: "cancelled", errorCategory: "cancelled" })]
      }
    });
  });

  it("returns completed run state when cancellation races after completion", async () => {
    const created = await service.createConversation({
      actor: actor("owner-user"),
      title: "Finished conversation",
      currentDocumentId: null,
      selectedContextSnapshot: standaloneSnapshot()
    });

    await service.appendMessage({
      actor: actor("owner-user"),
      conversationId: created.conversation.id,
      modelProfileId: "model-profile-1",
      message: { role: "user", content: "finish this" },
      selectedContextSnapshot: standaloneSnapshot()
    });

    await expect(service.cancelRun({ actor: actor("owner-user"), runId: "generated-1" })).resolves.toMatchObject({
      run: { id: "generated-1", status: "succeeded" }
    });
  });

  it("returns a safe failed lifecycle without usage rows when the provider fails", async () => {
    providerAdapter.failWith = new Error("raw provider secret sk-server-key Authorization header payload");
    const created = await service.createConversation({
      actor: actor("owner-user"),
      title: "Private conversation",
      currentDocumentId: "doc-1",
      selectedContextSnapshot: snapshot()
    });

    const failed = await service.appendMessage({
      actor: actor("owner-user"),
      conversationId: created.conversation.id,
      modelProfileId: "model-profile-1",
      message: { role: "user", content: "will fail" },
      selectedContextSnapshot: snapshot()
    });

    expect(failed.run).toMatchObject({
      id: "generated-1",
      status: "failed",
      providerConfigId: "config-1",
      modelProfileId: "model-profile-1",
      errorCategory: "provider_unavailable",
      errorMessage: "The provider endpoint is unavailable. Check the base URL or provider status.",
      createdAt: "2026-06-15T12:05:00.000Z",
      startedAt: "2026-06-15T12:05:01.000Z",
      completedAt: "2026-06-15T12:05:02.000Z"
    });
    expect(failed.conversation.messages).toEqual([
      expect.objectContaining({
        id: "generated-2",
        role: "user",
        content: "will fail",
        runId: "generated-1",
        runStatus: "failed",
        parts: [
          { type: "text", content: "will fail" },
          expect.objectContaining({
            type: "run_step",
            step: expect.objectContaining({
              status: "failed",
              errorMessage: "The provider endpoint is unavailable. Check the base URL or provider status."
            })
          })
        ],
        actions: expect.arrayContaining([expect.objectContaining({ kind: "retry", enabled: true })])
      })
    ]);
    expect(failed.conversation.messages).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ role: "assistant" })])
    );
    expect(usageService.inputs).toEqual([]);
    expect(JSON.stringify(failed)).not.toMatch(/sk-server-key|Authorization|raw provider|header payload|encrypted/i);
  });

  it("backfills old plain messages into safe renderable message parts", async () => {
    repository.conversations.set("conversation-old", {
      id: "conversation-old",
      ownerUserId: "owner-user",
      title: "Old private thread",
      currentDocumentId: "doc-1",
      selectedContextSnapshot: snapshot("doc-1", "doc-2"),
      messages: [
        {
          id: "old-message-1",
          role: "assistant",
          content: "## Existing answer\n\n- Safe markdown",
          createdAt: "2026-06-15T12:00:00.000Z"
        }
      ],
      createdAt,
      updatedAt: createdAt
    });

    const response = await service.getConversation(actor("owner-user"), "conversation-old");

    expect(response.conversation.messages[0]).toMatchObject({
      id: "old-message-1",
      content: "## Existing answer\n\n- Safe markdown",
      parts: [
        { type: "markdown", content: "## Existing answer\n\n- Safe markdown" },
        expect.objectContaining({ type: "source_list" })
      ],
      sources: [expect.objectContaining({ documentId: "doc-2", selectedBlockIds: ["block-1"] })]
    });
    expect(JSON.stringify(response)).not.toMatch(/sk-server-key|encrypted|Authorization|headers|signedUrl/i);
  });

  it("keeps assistant source cards tied to the context used by that run", async () => {
    repository.conversations.set("conversation-sources", {
      id: "conversation-sources",
      ownerUserId: "owner-user",
      title: "Run source provenance",
      currentDocumentId: "doc-1",
      selectedContextSnapshot: snapshot("doc-1", "doc-1"),
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          content: "Answer from earlier context",
          createdAt: "2026-06-15T12:00:00.000Z",
          runId: "run-1",
          runStatus: "succeeded",
          sources: [
            {
              id: "current_document-doc-2-0",
              sourceType: "current_document",
              title: "Earlier context",
              documentId: "doc-2",
              documentType: "notebook",
              projectId: "project-1",
              revisionNumber: 2,
              selectedBlockIds: ["block-1"],
              selectedBlockCount: 1,
              capturedAt: "2026-06-15T12:00:00.000Z",
              label: "Current document"
            }
          ]
        }
      ],
      createdAt,
      updatedAt: createdAt
    });

    const response = await service.getConversation(actor("owner-user"), "conversation-sources");

    expect(response.conversation.messages[0]).toMatchObject({
      id: "assistant-1",
      sources: [expect.objectContaining({ documentId: "doc-2", title: "Earlier context" })],
      parts: [
        { type: "markdown", content: "Answer from earlier context" },
        expect.objectContaining({
          type: "source_list",
          sources: [expect.objectContaining({ documentId: "doc-2", title: "Earlier context" })]
        }),
        expect.objectContaining({ type: "run_step" })
      ]
    });
    expect(response.conversation.contextAttachments).toEqual([
      expect.objectContaining({ documentId: "doc-1", title: "Notebook" })
    ]);
  });

  it("hard-deletes only owner conversations without creating an audit payload", async () => {
    const created = await service.createConversation({
      actor: actor("owner-user"),
      title: "Delete me",
      currentDocumentId: "doc-1",
      selectedContextSnapshot: snapshot()
    });

    await expect(
      service.deleteConversation({ actor: actor("owner-user"), conversationId: created.conversation.id })
    ).resolves.toEqual({ conversationId: created.conversation.id });
    expect(repository.conversations.has(created.conversation.id)).toBe(false);
  });
});
