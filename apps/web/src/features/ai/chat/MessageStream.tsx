import { useEffect, useRef } from "react";

import { EmptyState } from "../../layout/workbench";
import { ChatMessage } from "./ChatMessage";
import type { ChatMessage as ChatMessageModel, ChatRunStatus } from "./chatTypes";

type MessageStreamProps = {
  readonly className?: string;
  readonly copiedMessageId: string | null;
  readonly emptyDescription?: string;
  readonly emptyTitle?: string;
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
  className,
  copiedMessageId,
  emptyDescription = "Ask a question from the composer. Jixia starts without document context by default.",
  emptyTitle = "Start a private chat thread",
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
        className={className}
        description={emptyDescription}
        title={emptyTitle}
      />
    );
  }

  return (
    <div
      aria-label="Conversation messages"
      aria-live="polite"
      className={["jixia-chat-message-stream", className].filter(Boolean).join(" ")}
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
      <span className="jixia-chat-run-card__dot" aria-hidden="true" />
      <strong>{copy.title}</strong>
      <small>{copy.description}</small>
    </div>
  );
}

function runProgressCopy(status: ChatRunStatus | "idle"): { readonly title: string; readonly description: string } {
  switch (status) {
    case "queued":
    case "idle":
      return {
        title: "Queued",
        description: "Waiting for a cancellable server run."
      };
    case "running":
      return {
        title: "Streaming",
        description: "Receiving the server-owned response."
      };
    case "cancelled":
      return { title: "Cancelled", description: "The server acknowledged the stop request." };
    case "failed":
      return { title: "Failed", description: "A safe provider error was returned." };
    case "succeeded":
      return { title: "Complete", description: "The final answer was saved by the API." };
  }
}
