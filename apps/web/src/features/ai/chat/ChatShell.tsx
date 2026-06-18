import { ChatComposer } from "./ChatComposer";
import { ThreadSidebar } from "./ThreadSidebar";
import { ThreadViewport } from "./ThreadViewport";
import type { ChatMessage, ChatProviderConfig, ChatRunStatus, ChatThread } from "./chatTypes";

type ChatShellProps = {
  readonly activeThread: ChatThread | null;
  readonly activeRunId: string | null;
  readonly activeRunStatus: ChatRunStatus | null;
  readonly copiedMessageId: string | null;
  readonly disabledReason: string | null;
  readonly hiddenSourceMessageIds: ReadonlySet<string>;
  readonly isLoading: boolean;
  readonly isSending: boolean;
  readonly messageText: string;
  readonly onChangeMessage: (text: string) => void;
  readonly onCopyMessage: (message: ChatMessage) => void;
  readonly onCopyText: (text: string) => void;
  readonly onNewThread: () => void;
  readonly onRefresh: () => void;
  readonly onRetryMessage: (message: ChatMessage) => void;
  readonly onSelectProvider: (providerConfigId: string) => void;
  readonly onSelectThread: (threadId: string) => void;
  readonly onSend: () => void;
  readonly onStopRun: () => void;
  readonly onToggleSources: (messageId: string) => void;
  readonly providers: readonly ChatProviderConfig[];
  readonly selectedProviderConfigId: string;
  readonly sendStatus: ChatRunStatus | "idle";
  readonly statusMessage: string | null;
  readonly threads: readonly ChatThread[];
};

export function ChatShell({
  activeThread,
  activeRunId,
  activeRunStatus,
  copiedMessageId,
  disabledReason,
  hiddenSourceMessageIds,
  isLoading,
  isSending,
  messageText,
  onChangeMessage,
  onCopyMessage,
  onCopyText,
  onNewThread,
  onRefresh,
  onRetryMessage,
  onSelectProvider,
  onSelectThread,
  onSend,
  onStopRun,
  onToggleSources,
  providers,
  selectedProviderConfigId,
  sendStatus,
  statusMessage,
  threads
}: ChatShellProps) {
  const selectedProvider = providers.find((provider) => provider.id === selectedProviderConfigId) ?? null;
  return (
    <div className="jixia-chat-shell">
      <ThreadSidebar
        activeThreadId={activeThread?.id ?? null}
        isLoading={isLoading}
        onNewThread={onNewThread}
        onRefresh={onRefresh}
        onSelectThread={onSelectThread}
        threads={threads}
      />
      <div className="jixia-chat-main">
        <ThreadViewport
          activeRunStatus={activeRunStatus}
          copiedMessageId={copiedMessageId}
          errorMessage={statusMessage}
          hiddenSourceMessageIds={hiddenSourceMessageIds}
          isSending={isSending}
          onCopyMessage={onCopyMessage}
          onCopyText={onCopyText}
          onRetryMessage={onRetryMessage}
          onToggleSources={onToggleSources}
          sendStatus={sendStatus}
          selectedProvider={selectedProvider}
          thread={activeThread}
        />
        <ChatComposer
          configs={providers}
          disabledReason={disabledReason}
          isSending={isSending}
          onChange={onChangeMessage}
          onSelectProvider={onSelectProvider}
          onSubmit={onSend}
          onStop={onStopRun}
          selectedProviderConfigId={selectedProviderConfigId}
          activeRunId={activeRunId}
          text={messageText}
        />
      </div>
    </div>
  );
}
