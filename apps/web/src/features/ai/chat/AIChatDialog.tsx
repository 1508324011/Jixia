import type {
  AIConversationContextSnapshot,
  AIConversationDTO,
  AIProviderConfigListResponse,
  CreateAIConversationResponse,
  AIConversationMessageDTO,
  AIConversationRunDTO,
  AIConversationRunStreamEvent,
  ListAIConversationsResponse
} from "@jixia/shared";
import { useEffect, useMemo, useRef, useState } from "react";

import { apiFetch, apiStream } from "../../../lib/api";
import { authorizedModelOptions, preferredAuthorizedModelId } from "../modelOptions";
import { Button, Notice, SurfaceHeader, WorkbenchSurface } from "../../layout/workbench";
import { ChatShell } from "./ChatShell";
import { readChatStream } from "./chatStream";
import type { ChatMessage, ChatProviderConfig, ChatRunStatus, ChatThread } from "./chatTypes";

type AIChatDialogProps = {
  readonly onOpenSettings?: () => void;
};

type ChatLoadState = "idle" | "loading" | "ready" | "error";
type SendState = "idle" | ChatRunStatus;
const optimisticMessageIdPrefix = "optimistic-user-";

export function AIChatDialog({ onOpenSettings }: AIChatDialogProps) {
  const [providers, setProviders] = useState<readonly ChatProviderConfig[]>([]);
  const [threads, setThreads] = useState<readonly ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [selectedModelProfileId, setSelectedModelProfileId] = useState("");
  const [messageText, setMessageText] = useState("");
  const [loadState, setLoadState] = useState<ChatLoadState>("idle");
  const [sendState, setSendState] = useState<SendState>("idle");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [activeRunStatus, setActiveRunStatus] = useState<ChatRunStatus | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [hiddenSourceMessageIds, setHiddenSourceMessageIds] = useState<ReadonlySet<string>>(() => new Set());
  const assistantTextAccumulatorRef = useRef<Map<string, string>>(new Map());
  const pendingFlushRef = useRef<ScheduledFlush | null>(null);
  const activeStreamRef = useRef<ActiveStream | null>(null);

  useEffect(() => {
    void loadChatRuntime();
  }, []);

  const activeThread = useMemo(
    () => activeThreadId === null ? null : threads.find((thread) => thread.id === activeThreadId) ?? null,
    [activeThreadId, threads]
  );
  const disabledReason = sendDisabledReason(messageText, selectedModelProfileId, providers, sendState);

  async function loadChatRuntime(): Promise<void> {
    setLoadState("loading");
    setStatusMessage(null);

    try {
      const [configResponse, conversationResponse] = await Promise.all([
        apiFetch<AIProviderConfigListResponse>("/ai/configs"),
        apiFetch<ListAIConversationsResponse>("/ai/conversations")
      ]);
      const standaloneThreads = conversationResponse.conversations.map(toChatThread);
      const nextModelProfileId = modelSelection(selectedModelProfileId, configResponse.configs);

      setProviders(configResponse.configs);
      setSelectedModelProfileId(nextModelProfileId);
      setThreads(standaloneThreads);
      setActiveThreadId((current) => activeThreadSelection(current, standaloneThreads));
      setLoadState("ready");
    } catch (error) {
      setLoadState("error");
      setStatusMessage(error instanceof Error ? error.message : "Unable to load standalone AI chat.");
    }
  }

  async function sendMessage(overrideText?: string): Promise<void> {
    const content = (overrideText ?? messageText).trim();

    if (!content || !selectedModelProfileId || sendState === "queued" || sendState === "running") {
      return;
    }

    setSendState("queued");
    setStatusMessage(null);
    let pendingThreadId: string | null = null;

    try {
      const thread = activeThread ?? toChatThread((await createStandaloneConversation(content)).conversation);
      pendingThreadId = thread.id;
      setThreads((currentThreads) => upsertThread(currentThreads, thread));
      setActiveThreadId(thread.id);
      appendOptimisticUserMessage(thread.id, content);
      setMessageText("");
      setSendState("running");

      const streamController = new AbortController();
      const streamToken = createStreamToken();
      activeStreamRef.current = { controller: streamController, token: streamToken };

      const response = await apiStream(`/ai/conversations/${encodeURIComponent(thread.id)}/messages/stream`, {
        method: "POST",
        signal: streamController.signal,
        json: {
          modelProfileId: selectedModelProfileId,
          message: { role: "user", content },
          selectedContextSnapshot: standaloneContextSnapshot()
        }
      });
      await consumeRunStream(thread.id, response, streamToken);
      if (isActiveStream(streamToken)) {
        clearActiveStream(streamToken);
        setSendState("idle");
        setActiveRunId(null);
        setActiveRunStatus(null);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      const errorMessage = error instanceof Error ? error.message : "Unable to send message.";
      clearActiveStream();
      cancelPendingFlush();
      if (pendingThreadId) {
        settleOptimisticUserMessages(pendingThreadId, null, "failed", errorMessage);
      }
      setSendState("idle");
      setActiveRunId(null);
      setActiveRunStatus(null);
      setStatusMessage(errorMessage);
    }
  }

  async function consumeRunStream(threadId: string, response: Response, streamToken: string): Promise<void> {
    for await (const event of readChatStream(response)) {
      if (!isActiveStream(streamToken)) {
        return;
      }

      applyStreamEvent(threadId, event, streamToken);
    }
  }

  function applyStreamEvent(threadId: string, event: AIConversationRunStreamEvent, streamToken: string): void {
    switch (event.type) {
      case "run":
        setActiveRunId(event.run.id);
        setActiveRunStatus(event.run.status);
        setSendState(event.run.status);
        attachRunToOptimisticUserMessage(threadId, event.run.id, event.run.status);
        return;
      case "user_message":
        patchThreadMessages(threadId, (messages) => replaceOptimisticUserMessage(messages, event.message));
        return;
      case "assistant_delta":
        appendAssistantDelta(threadId, event.messageId, event.runId, event.delta);
        return;
      case "assistant_message":
        cancelPendingFlush();
        assistantTextAccumulatorRef.current.delete(event.message.id);
        patchThreadMessages(threadId, (messages) => replaceOrAppendMessage(messages, event.message));
        return;
      case "usage":
        patchThreadMessages(threadId, (messages) => applyUsageToRun(messages, event.runId, event.usage));
        return;
      case "error":
        cancelPendingFlush();
        clearActiveStream(streamToken);
        settleOptimisticUserMessages(threadId, event.run?.id ?? null, event.run?.status ?? "failed", event.message);
        setStatusMessage(event.message);
        setSendState(event.run?.status ?? "failed");
        setActiveRunStatus(event.run?.status ?? null);
        setActiveRunId(null);
        return;
      case "done": {
        cancelPendingFlush();
        clearActiveStream(streamToken);
        const updatedThread = toChatThread(event.conversation);
        setThreads((currentThreads) => upsertThread(currentThreads, updatedThread));
        setActiveThreadId(updatedThread.id);
        setSendState("idle");
        setActiveRunId(null);
        setActiveRunStatus(null);
        setStatusMessage(event.run.status === "failed" || event.run.status === "cancelled" ? event.run.errorMessage : null);
      }
    }
  }

  function patchThreadMessages(
    threadId: string,
    updateMessages: (messages: readonly AIConversationMessageDTO[]) => readonly AIConversationMessageDTO[]
  ): void {
    setThreads((currentThreads) =>
      currentThreads.map((thread) => {
        if (thread.id !== threadId) {
          return thread;
        }

        const messages = updateMessages(thread.sourceConversation.messages);
        const conversation = {
          ...thread.sourceConversation,
          messages,
          updatedAt: new Date().toISOString()
        };
        return toChatThread(conversation);
      })
    );
  }

  function appendOptimisticUserMessage(threadId: string, content: string): void {
    const optimisticMessage: AIConversationMessageDTO = {
      id: optimisticMessageId(),
      role: "user",
      content,
      createdAt: new Date().toISOString(),
      runStatus: "queued",
      parts: [{ type: "text", content }],
      sources: [],
      runSteps: [],
      actions: []
    };

    patchThreadMessages(threadId, (messages) => [...messages, optimisticMessage]);
  }

  function attachRunToOptimisticUserMessage(threadId: string, runId: string, status: ChatRunStatus): void {
    updateOptimisticUserMessages(threadId, null, (message) => ({ ...message, runId, runStatus: status }));
  }

  function settleOptimisticUserMessages(
    threadId: string,
    runId: string | null,
    status: ChatRunStatus,
    errorMessage: string | null
  ): void {
    updateOptimisticUserMessages(threadId, runId, (message) => {
      if (status === "cancelled" || status === "failed") {
        return {
          ...message,
          runStatus: status,
          errorCategory: status === "cancelled" ? "cancelled" : "unknown",
          errorMessage
        };
      }

      return { ...message, runStatus: status };
    });
  }

  function updateOptimisticUserMessages(
    threadId: string,
    runId: string | null,
    updateMessage: (message: AIConversationMessageDTO) => AIConversationMessageDTO
  ): void {
    patchThreadMessages(threadId, (messages) =>
      messages.map((message) => {
        if (!isOptimisticUserMessage(message) || (runId !== null && message.runId !== runId)) {
          return message;
        }

        return updateMessage(message);
      })
    );
  }

  function appendAssistantDelta(threadId: string, messageId: string, runId: string, delta: string): void {
    const nextText = `${assistantTextAccumulatorRef.current.get(messageId) ?? ""}${delta}`;
    assistantTextAccumulatorRef.current.set(messageId, nextText);

    cancelPendingFlush();

    pendingFlushRef.current = scheduleFlush(() => {
      pendingFlushRef.current = null;
      flushAssistantAccumulator(threadId, messageId, runId);
    });
  }

  function cancelPendingFlush(): void {
    if (pendingFlushRef.current === null) {
      return;
    }

    cancelScheduledFlush(pendingFlushRef.current);
    pendingFlushRef.current = null;
  }

  function flushAssistantAccumulator(threadId: string, messageId: string, runId: string): void {
    const nextText = assistantTextAccumulatorRef.current.get(messageId) ?? "";

    const streamingMessage: AIConversationMessageDTO = {
      id: messageId,
      role: "assistant",
      content: nextText,
      createdAt: new Date().toISOString(),
      runId,
      runStatus: "running",
      parts: [{ type: "markdown", content: nextText }],
      sources: [],
      runSteps: [],
      actions: []
    };

    patchThreadMessages(threadId, (messages) => replaceOrAppendMessage(messages, streamingMessage));
  }

  function isActiveStream(streamToken: string): boolean {
    return activeStreamRef.current?.token === streamToken;
  }

  function clearActiveStream(streamToken?: string): void {
    if (streamToken && !isActiveStream(streamToken)) {
      return;
    }

    activeStreamRef.current = null;
  }

  function abortActiveStream(): void {
    const activeStream = activeStreamRef.current;
    activeStreamRef.current = null;
    activeStream?.controller.abort();
  }

  function markRunMessagesCancelled(runId: string, errorMessage: string | null): void {
    setThreads((currentThreads) =>
      currentThreads.map((thread) => {
        let didUpdate = false;
        const messages = thread.sourceConversation.messages.map((message) => {
          if (message.runId !== runId || (message.runStatus !== "queued" && message.runStatus !== "running")) {
            return message;
          }

          didUpdate = true;
          return {
            ...message,
            runStatus: "cancelled" as const,
            errorCategory: "cancelled" as const,
            errorMessage
          };
        });

        if (!didUpdate) {
          return thread;
        }

        return toChatThread({
          ...thread.sourceConversation,
          messages,
          updatedAt: new Date().toISOString()
        });
      })
    );
  }

  async function handleStopRun(): Promise<void> {
    if (!activeRunId) {
      return;
    }

    const cancelledRunId = activeRunId;

    try {
      const response = await apiFetch<{ readonly run: AIConversationRunDTO }>(`/ai/runs/${encodeURIComponent(cancelledRunId)}/cancel`, {
        method: "POST"
      });
      abortActiveStream();
      cancelPendingFlush();
      setSendState(response.run.status);
      setActiveRunStatus(response.run.status);
      setActiveRunId(response.run.status === "running" || response.run.status === "queued" ? response.run.id : null);
      setStatusMessage(response.run.errorMessage);
      if (response.run.status === "cancelled") {
        markRunMessagesCancelled(cancelledRunId, response.run.errorMessage);
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to cancel AI run.");
    }
  }

  async function createStandaloneConversation(content: string): Promise<CreateAIConversationResponse> {
    return apiFetch<CreateAIConversationResponse>("/ai/conversations", {
      method: "POST",
      json: {
        title: titleFromPrompt(content),
        currentDocumentId: null,
        selectedContextSnapshot: standaloneContextSnapshot()
      }
    });
  }

  function handleRetryMessage(message: ChatMessage): void {
    void sendMessage(message.content);
  }

  function handleNewThread(): void {
    abortActiveStream();
    cancelPendingFlush();
    setActiveThreadId(null);
    setMessageText("");
    setStatusMessage(null);
    setHiddenSourceMessageIds(new Set());
    setSendState("idle");
    setActiveRunId(null);
    setActiveRunStatus(null);
  }

  function handleToggleSources(messageId: string): void {
    setHiddenSourceMessageIds((current) => {
      const next = new Set(current);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  }

  function handleCopyMessage(message: ChatMessage): void {
    setCopiedMessageId(message.id);
    copyText(message.content);
  }

  function handleCopyText(text: string): void {
    copyText(text);
  }

  function copyText(text: string): void {
    if ("clipboard" in navigator && navigator.clipboard) {
      void navigator.clipboard.writeText(text).catch(() => undefined);
    }
  }

  return (
    <WorkbenchSurface aria-labelledby="ai-chat-title" className="jixia-chat-surface" width="full">
      <SurfaceHeader
        className="jixia-chat-surface__header"
        actions={
          <details className="jixia-chat-surface__controls">
            <summary aria-label="AI workspace controls">Controls</summary>
            <div>
              {onOpenSettings ? <Button onClick={onOpenSettings}>Configure providers</Button> : null}
              <Button disabled={loadState === "loading"} onClick={() => void loadChatRuntime()} variant="primary">Refresh chat</Button>
              <span>Private runtime</span>
              <span>Standalone chats start without document context</span>
              <span>No provider keys in browser</span>
            </div>
          </details>
        }
        eyebrow="AI workspace"
        title="Jixia AI"
        titleId="ai-chat-title"
      />

      {loadState === "error" && statusMessage ? <Notice role="alert" tone="danger">{statusMessage}</Notice> : null}

      <ChatShell
        activeThread={activeThread}
        activeRunId={activeRunId}
        activeRunStatus={activeRunStatus}
        copiedMessageId={copiedMessageId}
        disabledReason={disabledReason}
        hiddenSourceMessageIds={hiddenSourceMessageIds}
        isLoading={loadState === "loading"}
        isSending={sendState === "queued" || sendState === "running"}
        messageText={messageText}
        onChangeMessage={setMessageText}
        onCopyMessage={handleCopyMessage}
        onCopyText={handleCopyText}
        onNewThread={handleNewThread}
        onRefresh={() => void loadChatRuntime()}
        onRetryMessage={handleRetryMessage}
        onSelectModelProfile={setSelectedModelProfileId}
        onSelectThread={setActiveThreadId}
        onSend={() => void sendMessage()}
        onStopRun={() => void handleStopRun()}
        onToggleSources={handleToggleSources}
        providers={providers}
        selectedModelProfileId={selectedModelProfileId}
        sendStatus={sendState}
        statusMessage={loadState === "error" ? null : statusMessage}
        threads={threads}
      />
    </WorkbenchSurface>
  );
}

function standaloneContextSnapshot(): AIConversationContextSnapshot {
  return {
    currentDocumentId: null,
    items: [],
    capturedAt: new Date().toISOString()
  };
}

function toChatThread(conversation: AIConversationDTO): ChatThread {
  return {
    id: conversation.id,
    title: conversation.title,
    status: threadStatus(conversation),
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messageCount: conversation.messages.length,
    providerLabel: null,
    contextAttachments: conversation.contextAttachments,
    sourceConversation: conversation
  };
}

function threadStatus(conversation: AIConversationDTO): ChatThread["status"] {
  const failedMessage = conversation.messages.find((message) => message.runStatus === "failed");
  if (failedMessage) {
    return "failed";
  }

  const cancelledMessage = conversation.messages.find((message) => message.runStatus === "cancelled");
  if (cancelledMessage) {
    return "cancelled";
  }

  const runningMessage = conversation.messages.find((message) => message.runStatus === "running" || message.runStatus === "queued");
  return runningMessage ? "running" : "idle";
}

function titleFromPrompt(content: string): string {
  const firstLine = content.split(/\r?\n/).find((line) => line.trim())?.trim() ?? "Standalone chat";
  return firstLine.length > 72 ? `${firstLine.slice(0, 69)}...` : firstLine;
}

function modelSelection(currentModelProfileId: string, configs: readonly ChatProviderConfig[]): string {
  return preferredAuthorizedModelId(currentModelProfileId, configs);
}

function activeThreadSelection(currentThreadId: string | null, threads: readonly ChatThread[]): string | null {
  if (currentThreadId && threads.some((thread) => thread.id === currentThreadId)) {
    return currentThreadId;
  }

  return threads[0]?.id ?? null;
}

function upsertThread(threads: readonly ChatThread[], thread: ChatThread): readonly ChatThread[] {
  const nextThreads = [thread, ...threads.filter((item) => item.id !== thread.id)];
  return nextThreads.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

function replaceOrAppendMessage(
  messages: readonly AIConversationMessageDTO[],
  message: AIConversationMessageDTO
): readonly AIConversationMessageDTO[] {
  const existingIndex = messages.findIndex((item) => item.id === message.id);

  if (existingIndex === -1) {
    return [...messages, message];
  }

  return messages.map((item) => item.id === message.id ? message : item);
}

function replaceOptimisticUserMessage(
  messages: readonly AIConversationMessageDTO[],
  message: AIConversationMessageDTO
): readonly AIConversationMessageDTO[] {
  const optimisticIndex = messages.findIndex(
    (item) => isOptimisticUserMessage(item) && item.content === message.content
  );

  if (optimisticIndex !== -1) {
    return messages.map((item, index) => index === optimisticIndex ? message : item);
  }

  return replaceOrAppendMessage(messages, message);
}

function optimisticMessageId(): string {
  return `${optimisticMessageIdPrefix}${createStreamToken()}`;
}

function isOptimisticUserMessage(message: AIConversationMessageDTO): boolean {
  return message.role === "user" && message.id.startsWith(optimisticMessageIdPrefix);
}

type ActiveStream = {
  readonly controller: AbortController;
  readonly token: string;
};

function createStreamToken(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

type ScheduledFlush =
  | { readonly id: number; readonly kind: "animation" }
  | { readonly id: number; readonly kind: "timeout" };

function scheduleFlush(callback: () => void): ScheduledFlush {
  if (typeof window.requestAnimationFrame === "function") {
    return { id: window.requestAnimationFrame(callback), kind: "animation" };
  }

  return { id: window.setTimeout(callback, 0), kind: "timeout" };
}

function cancelScheduledFlush(flush: ScheduledFlush): void {
  if (flush.kind === "animation") {
    window.cancelAnimationFrame(flush.id);
    return;
  }

  window.clearTimeout(flush.id);
}

function applyUsageToRun(
  messages: readonly AIConversationMessageDTO[],
  runId: string,
  usage: NonNullable<AIConversationRunDTO["usage"]>
): readonly AIConversationMessageDTO[] {
  return messages.map((message) => {
    if (message.runId !== runId) {
      return message;
    }

    return {
      ...message,
      runSteps: [
        ...(message.runSteps ?? []),
        {
          id: `${runId}-usage`,
          status: "succeeded",
          title: `${usage.totalTokens.toLocaleString()} tokens used`,
          timestamp: new Date().toISOString(),
          errorMessage: null
        }
      ]
    };
  });
}

function sendDisabledReason(
  text: string,
  modelProfileId: string,
  providers: readonly ChatProviderConfig[],
  sendState: SendState
): string | null {
  if (sendState === "queued" || sendState === "running") {
    return "Server run in progress";
  }

  const options = authorizedModelOptions(providers);

  if (providers.length === 0) {
    return "Configure a provider first";
  }

  if (options.length === 0) {
    return "Add an enabled model that the provider has not marked unavailable";
  }

  if (!modelProfileId) {
    return "Select a model";
  }

  if (!text.trim()) {
    return "Enter a message";
  }

  return null;
}
