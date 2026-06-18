import { useEffect, useRef } from "react";

import { EmptyState } from "../../layout/workbench";
import { ChatMessage } from "./ChatMessage";
import type { ChatMessage as ChatMessageModel, ChatRunStatus } from "./chatTypes";

type MessageStreamProps = {
  readonly copiedMessageId: string | null;
  readonly hiddenSourceMessageIds: ReadonlySet<string>;
  readonly isSending: boolean;
  readonly messages: readonly ChatMessageModel[];
  readonly onCopyMessage: (message: ChatMessageModel) => void;
  readonly onCopyText: (text: string) => void;
  readonly onRetryMessage: (message: ChatMessageModel) => void;
  readonly onToggleSources: (messageId: string) => void;
  readonly sendStatus: ChatRunStatus | "idle";
};

export function MessageStream({
  copiedMessageId,
  hiddenSourceMessageIds,
  isSending,
  messages,
  onCopyMessage,
  onCopyText,
  onRetryMessage,
  onToggleSources,
  sendStatus
}: MessageStreamProps) {
  const streamRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const lastMessage = messages[messages.length - 1];
  const scrollKey = `${messages.length}:${lastMessage?.id ?? "empty"}:${lastMessage?.content.length ?? 0}:${sendStatus}`;

  useEffect(() => {
    if (!stickToBottomRef.current) {
      return;
    }

    const element = streamRef.current;
    if (!element) {
      return;
    }

    if (typeof element.scrollTo === "function") {
      element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    } else {
      element.scrollTop = element.scrollHeight;
    }
  }, [isSending, scrollKey]);

  if (!messages.length && !isSending) {
    return (
      <EmptyState
        description="Send a question from the composer. Jixia will only use explicit attachments you add later, not the current document by default."
        title="Start a private chat thread"
      />
    );
  }

  return (
    <div
      aria-label="Conversation messages"
      aria-live="polite"
      className="jixia-chat-message-stream"
      onScroll={(event) => {
        const element = event.currentTarget;
        stickToBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 96;
      }}
      ref={streamRef}
      role="log"
    >
      {messages.map((message) => (
        <ChatMessage
          copyState={copiedMessageId === message.id ? "copied" : "idle"}
          hiddenSources={hiddenSourceMessageIds.has(message.id)}
          key={message.id}
          message={message}
          onCopy={() => onCopyMessage(message)}
          onCopyText={onCopyText}
          onRetry={() => onRetryMessage(message)}
          onToggleSources={() => onToggleSources(message.id)}
        />
      ))}
      {isSending ? <RunProgress status={sendStatus} /> : null}
    </div>
  );
}

function RunProgress({ status }: { readonly status: ChatRunStatus | "idle" }) {
  const copy = runProgressCopy(status);

  return (
    <div className={`jixia-chat-run-card jixia-chat-run-card--${status === "idle" ? "queued" : status}`} role="status">
      <strong>{copy.title}</strong>
      <span>{copy.description}</span>
    </div>
  );
}

function runProgressCopy(status: ChatRunStatus | "idle"): { readonly title: string; readonly description: string } {
  switch (status) {
    case "queued":
    case "idle":
      return {
        title: "Queued on the Jixia server",
        description: "Stop appears only after the API returns a cancellable run id."
      };
    case "running":
      return {
        title: "Streaming server-owned provider response",
        description: "Assistant deltas arrive through the Jixia SSE stream and persist when the run completes."
      };
    case "cancelled":
      return { title: "Run cancelled", description: "The server acknowledged cancellation for this run." };
    case "failed":
      return { title: "Run failed", description: "The provider adapter returned a safe error for this run." };
    case "succeeded":
      return { title: "Run complete", description: "Final assistant content was persisted by the API." };
  }
}
