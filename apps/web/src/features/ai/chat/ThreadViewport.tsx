import { Notice, Pane, Pill } from "../../layout/workbench";
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
  const hasContext = Boolean(thread?.contextAttachments.length);
  return (
    <Pane
      actions={
        <div className="jixia-chat-thread__pills">
          <Pill tone="accent">{hasContext ? `${thread?.contextAttachments.length ?? 0} explicit context` : "No document attached"}</Pill>
          <Pill>{selectedProvider ? compactProviderLabel(selectedProvider) : "No model selected"}</Pill>
          {activeRunStatus ? <Pill tone={activeRunStatus === "failed" ? "danger" : activeRunStatus === "cancelled" ? "warning" : "success"}>{activeRunStatus}</Pill> : null}
        </div>
      }
      aria-label="Standalone AI conversation"
      className="jixia-chat-thread"
      eyebrow="Server-run thread"
      title={thread?.title ?? "Fresh standalone chat"}
    >
      <div className="jixia-chat-thread__runline">
        <span>{thread ? `${thread.messageCount} messages` : "Ready for first prompt"}</span>
        <strong>{runlineStatus(sendStatus)}</strong>
        <span>Context is explicit-only; no current document is auto-attached.</span>
      </div>

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
    </Pane>
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
