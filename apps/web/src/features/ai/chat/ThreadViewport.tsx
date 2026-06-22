import { Notice, Pill } from "../../layout/workbench";
import { MessageStream } from "./MessageStream";
import type { ChatMessage, ChatProviderConfig, ChatRunStatus, ChatThread } from "./chatTypes";

type ThreadViewportProps = {
  readonly activeRunStatus: ChatRunStatus | null;
  readonly copiedMessageId: string | null;
  readonly errorMessage: string | null;
  readonly hiddenSourceMessageIds: ReadonlySet<string>;
  readonly isSending: boolean;
  readonly onCopyMessage: (message: ChatMessage) => void;
  readonly onCopyText: (text: string) => void;
  readonly onRetryMessage: (message: ChatMessage) => void;
  readonly onToggleSources: (messageId: string) => void;
  readonly sendStatus: ChatRunStatus | "idle";
  readonly selectedProvider: ChatProviderConfig | null;
  readonly thread: ChatThread | null;
};

export function ThreadViewport({
  activeRunStatus,
  copiedMessageId,
  errorMessage,
  hiddenSourceMessageIds,
  isSending,
  onCopyMessage,
  onCopyText,
  onRetryMessage,
  onToggleSources,
  sendStatus,
  selectedProvider,
  thread
}: ThreadViewportProps) {
  const contextCount = thread?.contextAttachments.length ?? 0;
  const hasContext = contextCount > 0;
  return (
    <section aria-label="Standalone AI conversation" className="jixia-chat-thread">
      <header className="jixia-chat-thread__header">
        <div className="jixia-chat-thread__title-block">
          <h2>{thread?.title ?? "Fresh standalone chat"}</h2>
          <span>{thread ? `${thread.messageCount} messages` : "Ready for first prompt"}</span>
        </div>
        <details className="jixia-chat-thread__runtime">
          <summary>
            <span>{runlineStatus(sendStatus)}</span>
            <Pill tone="accent">{hasContext ? `${contextCount} explicit context` : "No document attached"}</Pill>
          </summary>
          <div className="jixia-chat-thread__pills">
            <Pill>{selectedProvider ? compactProviderLabel(selectedProvider) : "No model selected"}</Pill>
            {activeRunStatus ? <Pill tone={activeRunStatus === "failed" ? "danger" : activeRunStatus === "cancelled" ? "warning" : "success"}>{activeRunStatus}</Pill> : null}
            <span>Server-owned provider execution · no browser keys</span>
          </div>
        </details>
      </header>

      {errorMessage ? <Notice role="alert" tone="danger">{errorMessage}</Notice> : null}

      <MessageStream
        copiedMessageId={copiedMessageId}
        hiddenSourceMessageIds={hiddenSourceMessageIds}
        isSending={isSending}
        messages={thread?.sourceConversation.messages ?? []}
        onCopyMessage={onCopyMessage}
        onCopyText={onCopyText}
        onRetryMessage={onRetryMessage}
        onToggleSources={onToggleSources}
        sendStatus={sendStatus}
      />
    </section>
  );
}

function compactProviderLabel(provider: ChatProviderConfig): string {
  return `${provider.name} · ${provider.model}`;
}

function runlineStatus(status: ChatRunStatus | "idle"): string {
  switch (status) {
    case "queued":
      return "Queued on API";
    case "running":
      return "Streaming from API";
    case "succeeded":
      return "Run complete";
    case "failed":
      return "Run failed";
    case "cancelled":
      return "Run cancelled";
    case "idle":
      return "Idle";
  }
}
