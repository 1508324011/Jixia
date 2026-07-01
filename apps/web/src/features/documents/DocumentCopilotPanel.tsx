import type {
  AIConversationContextSnapshot,
  AIConversationDTO,
  AIConversationMessageDTO,
  AIConversationRunDTO,
  AIConversationRunStatus,
  AIConversationRunStreamEvent,
  AIProviderConfigListResponse,
  AIProviderConfigView,
  CreateAIConversationResponse,
  DocumentDTO,
  EditorSnapshot,
  ListAIConversationsResponse
} from "@jixia/shared";
import type { KeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { apiFetch, apiStream } from "../../lib/api";
import { MessageStream } from "../ai/chat/MessageStream";
import { readChatStream } from "../ai/chat/chatStream";
import type { ChatMessage as ChatMessageModel } from "../ai/chat/chatTypes";
import { Button, Notice } from "../layout/workbench";
import {
  createDocumentCopilotContext,
  createEmptyDocumentCopilotContextSnapshot,
  type DocumentCopilotContext
} from "./documentCopilotContext";

type DocumentCopilotPanelProps = {
  readonly baseRevision: number;
  readonly document: DocumentDTO;
  readonly exportSnapshot: () => EditorSnapshot;
  readonly onOpenSettings?: () => void;
  readonly readOnly: boolean;
  readonly snapshot: EditorSnapshot;
  readonly title: string;
};

type RuntimeLoadState = "idle" | "loading" | "ready" | "error";
type SendState = "idle" | AIConversationRunStatus;

const optimisticMessageIdPrefix = "document-copilot-optimistic-";

export function DocumentCopilotPanel({
  baseRevision,
  document,
  exportSnapshot,
  onOpenSettings,
  readOnly,
  snapshot,
  title
}: DocumentCopilotPanelProps) {
  const [providers, setProviders] = useState<readonly AIProviderConfigView[]>([]);
  const [selectedProviderConfigId, setSelectedProviderConfigId] = useState("");
  const [conversation, setConversation] = useState<AIConversationDTO | null>(null);
  const [messages, setMessages] = useState<readonly AIConversationMessageDTO[]>([]);
  const [messageText, setMessageText] = useState("");
  const [loadState, setLoadState] = useState<RuntimeLoadState>("idle");
  const [sendState, setSendState] = useState<SendState>("idle");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activeRunStatus, setActiveRunStatus] = useState<AIConversationRunStatus | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [hiddenSourceMessageIds, setHiddenSourceMessageIds] = useState<ReadonlySet<string>>(() => new Set());
  const [includeDocumentContext, setIncludeDocumentContext] = useState(true);
  const assistantTextAccumulatorRef = useRef<Map<string, string>>(new Map());
  const activeStreamRef = useRef<ActiveStream | null>(null);

  const visibleContext = useMemo(
    () => createDocumentCopilotContext({ baseRevision, document, readOnly, snapshot, title }),
    [baseRevision, document, readOnly, snapshot, title]
  );
  const usableProviders = useMemo(() => providers.filter((provider) => provider.hasKey), [providers]);
  const selectedProvider = usableProviders.find((provider) => provider.id === selectedProviderConfigId) ?? null;
  const isSending = sendState === "queued" || sendState === "running";
  const disabledReason = sendDisabledReason(messageText, selectedProviderConfigId, usableProviders, sendState);
  const showProviderSetupNotice = usableProviders.length === 0 && loadState !== "loading";
  const hasNotice = statusMessage !== null || showProviderSetupNotice;

  useEffect(() => {
    setIncludeDocumentContext(true);
    void loadCopilotRuntime();

    return () => {
      abortActiveStream();
      assistantTextAccumulatorRef.current.clear();
    };
  }, [document.id]);

  async function loadCopilotRuntime(): Promise<void> {
    abortActiveStream();
    setLoadState("loading");
    setStatusMessage(null);
    setSendState("idle");
    setActiveRunId(null);
    setActiveRunStatus(null);
    setConversation(null);
    setMessages([]);

    try {
      const [configResponse, conversationResponse] = await Promise.all([
        apiFetch<AIProviderConfigListResponse>("/ai/configs"),
        apiFetch<ListAIConversationsResponse>(`/ai/conversations?currentDocumentId=${encodeURIComponent(document.id)}`)
      ]);
      const usableConfigs = configResponse.configs.filter((provider) => provider.hasKey);
      const nextConversation = conversationResponse.conversations[0] ?? null;

      setProviders(configResponse.configs);
      setSelectedProviderConfigId((currentProviderId) => providerSelection(currentProviderId, usableConfigs));
      setConversation(nextConversation);
      setMessages(nextConversation?.messages ?? []);
      setLoadState("ready");
    } catch (error) {
      setLoadState("error");
      setStatusMessage(error instanceof Error ? error.message : "Unable to load document copilot.");
    }
  }

  async function sendMessage(overrideText?: string): Promise<void> {
    const content = (overrideText ?? messageText).trim();

    if (!content || !selectedProviderConfigId || isSending) {
      return;
    }

    const selectedContextSnapshot = createRuntimeContextSnapshot();
    setSendState("queued");
    setStatusMessage(null);
    let pendingConversationId: string | null = null;

    try {
      const activeConversation = await ensureConversation(content, selectedContextSnapshot);
      pendingConversationId = activeConversation.id;
      appendOptimisticUserMessage(activeConversation.id, content);
      setMessageText("");
      setSendState("running");

      const streamController = new AbortController();
      const streamToken = createStreamToken();
      activeStreamRef.current = { controller: streamController, token: streamToken };

      const response = await apiStream(`/ai/conversations/${encodeURIComponent(activeConversation.id)}/messages/stream`, {
        method: "POST",
        signal: streamController.signal,
        json: {
          providerConfigId: selectedProviderConfigId,
          message: { role: "user", content },
          selectedContextSnapshot
        }
      });

      await consumeRunStream(activeConversation.id, response, streamToken);
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

      const errorMessage = error instanceof Error ? error.message : "Unable to send copilot message.";
      clearActiveStream();
      if (pendingConversationId) {
        settleOptimisticUserMessages(pendingConversationId, null, "failed", errorMessage);
      }
      setSendState("idle");
      setActiveRunId(null);
      setActiveRunStatus(null);
      setStatusMessage(errorMessage);
    }
  }

  async function ensureConversation(
    prompt: string,
    selectedContextSnapshot: AIConversationContextSnapshot
  ): Promise<AIConversationDTO> {
    if (conversation) {
      return conversation;
    }

    const response = await apiFetch<CreateAIConversationResponse>("/ai/conversations", {
      method: "POST",
      json: {
        title: conversationTitle(visibleContext.summary.title, prompt),
        currentDocumentId: document.id,
        selectedContextSnapshot
      }
    });

    setConversation(response.conversation);
    setMessages(response.conversation.messages);
    return response.conversation;
  }

  async function consumeRunStream(conversationId: string, response: Response, streamToken: string): Promise<void> {
    for await (const event of readChatStream(response)) {
      if (!isActiveStream(streamToken)) {
        return;
      }

      applyStreamEvent(conversationId, event, streamToken);
    }
  }

  function applyStreamEvent(conversationId: string, event: AIConversationRunStreamEvent, streamToken: string): void {
    switch (event.type) {
      case "run":
        setActiveRunId(event.run.id);
        setActiveRunStatus(event.run.status);
        setSendState(event.run.status);
        attachRunToOptimisticUserMessage(conversationId, event.run.id, event.run.status);
        return;
      case "user_message":
        patchMessages((currentMessages) => replaceOptimisticUserMessage(currentMessages, event.message));
        return;
      case "assistant_delta":
        appendAssistantDelta(event.messageId, event.runId, event.delta);
        return;
      case "assistant_message":
        assistantTextAccumulatorRef.current.delete(event.message.id);
        patchMessages((currentMessages) => replaceOrAppendMessage(currentMessages, event.message));
        return;
      case "usage":
        patchMessages((currentMessages) => applyUsageToRun(currentMessages, event.runId, event.usage));
        return;
      case "error":
        clearActiveStream(streamToken);
        settleOptimisticUserMessages(conversationId, event.run?.id ?? null, event.run?.status ?? "failed", event.message);
        setStatusMessage(event.message);
        setSendState(event.run?.status ?? "failed");
        setActiveRunStatus(event.run?.status ?? null);
        setActiveRunId(null);
        return;
      case "done":
        clearActiveStream(streamToken);
        setConversation(event.conversation);
        setMessages(event.conversation.messages);
        setSendState("idle");
        setActiveRunId(null);
        setActiveRunStatus(null);
        setStatusMessage(event.run.status === "failed" || event.run.status === "cancelled" ? event.run.errorMessage : null);
    }
  }

  function patchMessages(updateMessages: (currentMessages: readonly AIConversationMessageDTO[]) => readonly AIConversationMessageDTO[]): void {
    setMessages((currentMessages) => updateMessages(currentMessages));
  }

  function appendOptimisticUserMessage(conversationId: string, content: string): void {
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

    setMessages((currentMessages) => [...currentMessages, optimisticMessage]);
    setConversation((currentConversation) => currentConversation?.id === conversationId
      ? { ...currentConversation, messages: [...currentConversation.messages, optimisticMessage] }
      : currentConversation
    );
  }

  function attachRunToOptimisticUserMessage(conversationId: string, runId: string, status: AIConversationRunStatus): void {
    updateOptimisticUserMessages(conversationId, null, (message) => ({ ...message, runId, runStatus: status }));
  }

  function settleOptimisticUserMessages(
    conversationId: string,
    runId: string | null,
    status: AIConversationRunStatus,
    errorMessage: string | null
  ): void {
    updateOptimisticUserMessages(conversationId, runId, (message) => ({
      ...message,
      runStatus: status,
      ...(status === "cancelled" || status === "failed"
        ? {
            errorCategory: status === "cancelled" ? "cancelled" : "unknown",
            errorMessage
          }
        : {})
    }));
  }

  function updateOptimisticUserMessages(
    conversationId: string,
    runId: string | null,
    updateMessage: (message: AIConversationMessageDTO) => AIConversationMessageDTO
  ): void {
    if (conversation?.id !== conversationId && conversation !== null) {
      return;
    }

    patchMessages((currentMessages) => currentMessages.map((message) => {
      if (!isOptimisticUserMessage(message) || (runId !== null && message.runId !== runId)) {
        return message;
      }

      return updateMessage(message);
    }));
  }

  function appendAssistantDelta(messageId: string, runId: string, delta: string): void {
    const nextText = `${assistantTextAccumulatorRef.current.get(messageId) ?? ""}${delta}`;
    assistantTextAccumulatorRef.current.set(messageId, nextText);
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

    patchMessages((currentMessages) => replaceOrAppendMessage(currentMessages, streamingMessage));
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

  function markRunMessagesCancelled(runId: string, errorMessage: string | null): void {
    patchMessages((currentMessages) => currentMessages.map((message) => {
      if (message.runId !== runId || (message.runStatus !== "queued" && message.runStatus !== "running")) {
        return message;
      }

      return {
        ...message,
        runStatus: "cancelled",
        errorCategory: "cancelled",
        errorMessage
      };
    }));
  }

  function handleCopyMessage(message: ChatMessageModel): void {
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

  function handleRetryMessage(message: ChatMessageModel): void {
    void sendMessage(message.content);
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

  function createRuntimeContextSnapshot(): AIConversationContextSnapshot {
    if (!includeDocumentContext) {
      return createEmptyDocumentCopilotContextSnapshot({ documentId: document.id });
    }

    return createDocumentCopilotContext({
      baseRevision,
      document,
      readOnly,
      snapshot: exportSnapshot(),
      title
    }).snapshot;
  }

  function handleOpenSettings(): void {
    if (onOpenSettings) {
      onOpenSettings();
      return;
    }

    window.location.assign("/settings/ai");
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();

    if (!disabledReason) {
      void sendMessage();
    }
  }

  return (
    <section aria-labelledby="document-copilot-title" className="jixia-ai-copilot jixia-document-copilot">
      <header className="jixia-document-copilot__header">
        <div className="jixia-document-copilot__title">
          <p className="jixia-eyebrow">Document copilot</p>
          <h2 id="document-copilot-title">Ask Jixia</h2>
          <span>Advisory only · no writeback</span>
        </div>
        <details className="jixia-document-copilot__runtime">
          <summary aria-label="Document copilot details">Details</summary>
          <div>
            <span>{selectedProvider ? providerLabel(selectedProvider) : "Provider setup needed"}</span>
            <span>{activeRunStatus ? `Run ${activeRunStatus}` : `Runtime ${loadState}`}</span>
            <span>No document mutation</span>
            <Button disabled={loadState === "loading" || isSending} onClick={() => void loadCopilotRuntime()} variant="ghost">Refresh</Button>
          </div>
        </details>
      </header>

      <ContextControl
        context={visibleContext}
        includeDocumentContext={includeDocumentContext}
        onToggle={setIncludeDocumentContext}
      />

      {hasNotice ? (
        <div className="jixia-document-copilot__notices">
          {statusMessage ? (
            <Notice role={sendState === "failed" || loadState === "error" ? "alert" : "status"} tone={sendState === "failed" || loadState === "error" ? "danger" : "warning"}>
              {statusMessage}
            </Notice>
          ) : null}

          {showProviderSetupNotice ? (
            <Notice tone="warning">
              No usable provider config with a saved key is available for this document copilot. Provider keys stay server-owned; add one in AI settings before sending.
              <span className="jixia-document-copilot__inline-action">
                <Button onClick={handleOpenSettings} variant="link">Open AI provider settings</Button>
              </span>
            </Notice>
          ) : null}
        </div>
      ) : null}

      <MessageStream
        className="jixia-document-copilot__messages"
        copiedMessageId={copiedMessageId}
        emptyDescription="Ask from the inspector. The Include current document switch controls context per message."
        emptyTitle="Start a document-scoped chat"
        hiddenSourceMessageIds={hiddenSourceMessageIds}
        isSending={isSending}
        messages={messages}
        onCopyMessage={handleCopyMessage}
        onCopyText={handleCopyText}
        onRetryMessage={handleRetryMessage}
        onToggleSources={handleToggleSources}
        sendStatus={sendState}
      />

      <form
        aria-label="Document copilot composer"
        className="jixia-ai-copilot__composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (!disabledReason) {
            void sendMessage();
          }
        }}
      >
        <div className="jixia-document-copilot__composer-surface">
          <textarea
            aria-label="Ask document copilot"
            disabled={isSending || usableProviders.length === 0}
            onChange={(event) => setMessageText(event.currentTarget.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder="Ask about this document…"
            rows={1}
            style={{ height: textareaHeight(messageText) }}
            value={messageText}
          />
          <div className="jixia-document-copilot__composer-toolbar">
            <label className="jixia-document-copilot__provider-select">
              <span>Model</span>
              <select
                aria-label="Document copilot provider"
                disabled={isSending || usableProviders.length === 0}
                onChange={(event) => setSelectedProviderConfigId(event.currentTarget.value)}
                value={selectedProviderConfigId}
              >
                <option value="">Select provider</option>
                {usableProviders.map((provider) => <option key={provider.id} value={provider.id}>{providerLabel(provider)}</option>)}
              </select>
            </label>
            <div className="jixia-document-copilot__composer-actions">
              <span>{includeDocumentContext ? "Document context on" : "Document context off"}</span>
              {disabledReason ? <strong>{disabledReason}</strong> : null}
              {isSending && activeRunId ? (
                <Button onClick={() => void handleStopRun()} title={`Stop server run ${activeRunId}`} type="button" variant="danger">Stop</Button>
              ) : (
                <Button disabled={Boolean(disabledReason)} type="submit" variant="primary">Send</Button>
              )}
            </div>
          </div>
        </div>
      </form>
    </section>
  );
}

function ContextControl({
  context,
  includeDocumentContext,
  onToggle
}: {
  readonly context: DocumentCopilotContext;
  readonly includeDocumentContext: boolean;
  readonly onToggle: (includeDocumentContext: boolean) => void;
}) {
  const blockCopy = `${context.summary.blockCount} ${context.summary.blockCount === 1 ? "block" : "blocks"}`;
  const revisionCopy = `${context.summary.baseRevision}/${context.summary.currentRevision}`;

  return (
    <section aria-label="Document context controls" className="jixia-document-copilot__context-control">
      <label className={`jixia-document-copilot__context-toggle jixia-document-copilot__context-toggle--${includeDocumentContext ? "on" : "off"}`}>
        <input
          checked={includeDocumentContext}
          onChange={(event) => onToggle(event.currentTarget.checked)}
          type="checkbox"
        />
        <span>Include current document</span>
      </label>
      <details className="jixia-document-copilot__context-details">
        <summary className="jixia-document-copilot__context-summary">
          <span>{includeDocumentContext ? `Document context · on · ${blockCopy} · ${revisionCopy}` : "Document context · off"}</span>
          <span>{includeDocumentContext ? "Sent with each message" : "No document text will be sent"}</span>
        </summary>
        <div className="jixia-document-copilot__context-preview">
          <p className="jixia-document-copilot__context-preview-label">
            {includeDocumentContext ? "Bounded context preview" : "Context disabled for the next message"}
          </p>
          <dl>
            <div><dt>Title</dt><dd>{context.summary.title}</dd></div>
            <div><dt>Document ID</dt><dd>{context.summary.documentId}</dd></div>
            <div><dt>Project</dt><dd>{context.summary.projectId ?? "Personal notebook"}</dd></div>
            <div><dt>Status</dt><dd>{context.summary.readOnly ? "read-only" : "active"}</dd></div>
            <div><dt>Selected blocks</dt><dd>{includeDocumentContext ? "Not implemented; sending current document only" : "Not sent while context is off"}</dd></div>
            <div><dt>Safety</dt><dd>No signed URLs or storage keys</dd></div>
          </dl>
          <p>
            {includeDocumentContext
              ? context.summary.preview || "No readable text in the current editor snapshot."
              : "Jixia will keep this chat scoped to the document thread, but the next request carries an explicit empty context snapshot."}
          </p>
        </div>
      </details>
    </section>
  );
}

function sendDisabledReason(
  text: string,
  providerConfigId: string,
  providers: readonly AIProviderConfigView[],
  sendState: SendState
): string | null {
  if (sendState === "queued" || sendState === "running") {
    return "Server run in progress";
  }

  if (providers.length === 0) {
    return "Configure a provider first";
  }

  if (!providerConfigId) {
    return "Select a provider";
  }

  if (!text.trim()) {
    return "Enter a prompt";
  }

  return null;
}

function providerSelection(currentProviderId: string, configs: readonly AIProviderConfigView[]): string {
  if (configs.some((config) => config.id === currentProviderId)) {
    return currentProviderId;
  }

  return configs.find((config) => config.isDefault)?.id ?? configs[0]?.id ?? "";
}

function providerLabel(config: AIProviderConfigView): string {
  return `${config.name} · ${config.model}${config.isDefault ? " · default" : ""}`;
}

function textareaHeight(text: string): string {
  const lineCount = Math.min(7, Math.max(1, text.split(/\r?\n/).length));
  return `${Math.max(52, lineCount * 22 + 28)}px`;
}

function conversationTitle(documentTitle: string, prompt: string): string {
  const normalizedTitle = documentTitle.trim() || "Untitled document";
  const firstLine = prompt.split(/\r?\n/).find((line) => line.trim())?.trim() ?? "Document copilot";
  const title = `${normalizedTitle}: ${firstLine}`;
  return title.length > 120 ? `${title.slice(0, 117)}...` : title;
}

function optimisticMessageId(): string {
  return `${optimisticMessageIdPrefix}${createStreamToken()}`;
}

function isOptimisticUserMessage(message: AIConversationMessageDTO): boolean {
  return message.role === "user" && message.id.startsWith(optimisticMessageIdPrefix);
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

type ActiveStream = {
  readonly controller: AbortController;
  readonly token: string;
};

function createStreamToken(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}
