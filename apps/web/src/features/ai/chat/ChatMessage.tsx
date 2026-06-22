import { Button, Pill } from "../../layout/workbench";
import { MarkdownMessage } from "./MarkdownMessage";
import { ToolRunCard } from "./ToolRunCard";
import type { ChatMessage as ChatMessageModel, ChatMessagePart, ChatSource } from "./chatTypes";

type ChatMessageProps = {
  readonly copyState: "idle" | "copied";
  readonly hiddenSources: boolean;
  readonly message: ChatMessageModel;
  readonly onCopy: () => void;
  readonly onCopyText: (text: string) => void;
  readonly onRetry: () => void;
  readonly onToggleSources: () => void;
};

export function ChatMessage({ copyState, hiddenSources, message, onCopy, onCopyText, onRetry, onToggleSources }: ChatMessageProps) {
  const parts = message.parts?.length ? message.parts : fallbackParts(message);
  const sources = messageSources(message, parts);
  const hasSources = sources.length > 0;
  const isAssistant = message.role === "assistant";
  const isStreaming = message.runStatus === "running" || message.runStatus === "queued";
  const isErrored = message.runStatus === "failed" || message.runStatus === "cancelled";
  const visibleRunStatus = message.runStatus && message.runStatus !== "succeeded" ? message.runStatus : null;

  return (
    <article
      aria-label={`${isAssistant ? "Assistant message" : "User message"}, ${formatTimestamp(message.createdAt)}`}
      className={`jixia-chat-message jixia-chat-message--${message.role}`}
    >
      <div className="jixia-chat-message__content">
        {parts.map((part, index) => (
          <ChatMessagePart hiddenSources={hiddenSources} key={`${message.id}-${part.type}-${index}`} onCopyText={onCopyText} part={part} />
        ))}
        {isStreaming ? <span aria-label="Assistant response is streaming" className="jixia-chat-message__cursor" /> : null}
        {isErrored && message.errorMessage ? <p className="jixia-chat-message__error">{message.errorMessage}</p> : null}
      </div>
      <footer className="jixia-chat-message__subrow">
        <div className="jixia-chat-message__header">
          <span>{isAssistant ? "Jixia AI" : "You"}</span>
          <time dateTime={message.createdAt}>{formatTimestamp(message.createdAt)}</time>
          {visibleRunStatus ? <Pill tone={runStatusTone(visibleRunStatus)}>{visibleRunStatus}</Pill> : null}
        </div>
        <div aria-label="Message actions" className="jixia-chat-message__actions">
          <Button onClick={onCopy} variant="link">{copyState === "copied" ? "Copied" : "Copy"}</Button>
          {hasSources ? <Button onClick={onToggleSources} variant="link">{hiddenSources ? "Show sources" : "Hide sources"}</Button> : null}
          {message.runStatus === "failed" ? <Button onClick={onRetry} variant="link">Retry this prompt</Button> : null}
        </div>
      </footer>
    </article>
  );
}

function runStatusTone(status: NonNullable<ChatMessageModel["runStatus"]>): "accent" | "warning" | "danger" {
  if (status === "failed") {
    return "danger";
  }

  if (status === "cancelled") {
    return "warning";
  }

  return "accent";
}

function ChatMessagePart({
  hiddenSources,
  onCopyText,
  part
}: {
  readonly hiddenSources: boolean;
  readonly onCopyText: (text: string) => void;
  readonly part: ChatMessagePart;
}) {
  switch (part.type) {
    case "text":
      return <p className="jixia-chat-message__text">{part.content}</p>;
    case "markdown":
      return <MarkdownMessage content={part.content} onCopyCode={onCopyText} />;
    case "source_list":
      return hiddenSources ? null : <SourceCards sources={part.sources} />;
    case "run_step":
      return <ToolRunCard errorMessage={part.step.errorMessage} status={part.step.status} title={part.step.title} />;
  }
}

function SourceCards({ sources }: { readonly sources: readonly ChatSource[] }) {
  if (!sources.length) {
    return null;
  }

  return (
    <div aria-label="Sources used" className="jixia-chat-source-list">
      <details>
        <summary>{sources.length === 1 ? "1 source" : `${sources.length} sources`}</summary>
        <div className="jixia-chat-source-list__items">
          {sources.map((source) => (
            <article className="jixia-chat-source-card" key={source.id}>
              <span>{source.label}</span>
              <strong>{source.title}</strong>
              <small>{source.revisionNumber === null ? "Snapshot" : `Revision ${source.revisionNumber}`} · {source.selectedBlockCount} blocks</small>
            </article>
          ))}
        </div>
      </details>
    </div>
  );
}

function fallbackParts(message: ChatMessageModel): readonly ChatMessagePart[] {
  return [{ type: message.role === "assistant" ? "markdown" : "text", content: message.content }];
}

function messageSources(message: ChatMessageModel, parts: readonly ChatMessagePart[]): readonly ChatSource[] {
  if (message.sources?.length) {
    return message.sources;
  }

  const sourcePart = parts.find((part): part is Extract<ChatMessagePart, { readonly type: "source_list" }> => part.type === "source_list");
  return sourcePart?.sources ?? [];
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
